"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { getCallIceServers } from "@/backend/actions/call-configuration"
import { sendCallSignal, getCallSignals, type CallSignalItem } from "@/backend/actions/calls"
import { replaceCallCamera, type CameraFacing } from "@/frontend/lib/call-camera"
import { startRinging, stopRinging } from "@/frontend/lib/ringtone"

export type CallState = "idle" | "outgoing" | "incoming" | "connecting" | "connected" | "ended"
type Offer = RTCSessionDescriptionInit & { video?: boolean; callId?: string }
export function useVoiceCall(conversationId: string | null) {
  const [callState, setState] = useState<CallState>("idle")
  const [callDuration, setCallDuration] = useState(0)
  const [error, setError] = useState("")
  const [isMuted, setIsMuted] = useState(false)
  const [isVideo, setIsVideo] = useState(false)
  const [cameraEnabled, setCameraEnabled] = useState(true)
  const [cameraFacing, setCameraFacing] = useState<CameraFacing>("user")
  const [switchingCamera, setSwitchingCamera] = useState(false)
  const cameraSwitch = useRef(false)
  const facingRef = useRef<CameraFacing>("user")
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const remoteAudioRef = useRef<HTMLAudioElement>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const offerRef = useRef<Offer | null>(null)
  const candidates = useRef<RTCIceCandidateInit[]>([])
  const outgoingIce = useRef<RTCIceCandidateInit[]>([])
  const signalReady = useRef(false)
  const stateRef = useRef<CallState>("idle")
  const callId = useRef<string | null>(null)
  const conversation = useRef(conversationId)
  const generation = useRef(0)
  const duration = useRef(0)
  const connected = useRef(false)
  const caller = useRef(false)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const setCallState = useCallback((state: CallState) => { stateRef.current = state; setState(state) }, [])
  const teardown = useCallback(() => {
    generation.current++
    cameraSwitch.current = false; facingRef.current = "user"; setCameraFacing("user"); setSwitchingCamera(false)
    const pc = pcRef.current; pcRef.current = null
    if (pc) { pc.onconnectionstatechange = null; pc.ontrack = null; pc.onicecandidate = null; pc.close() }
    streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = null
    offerRef.current = null; candidates.current = []; outgoingIce.current = []; signalReady.current = false
    setLocalStream(null); setRemoteStream(null); setIsMuted(false); setCameraEnabled(true)
    stopRinging()
  }, [])
  const finish = useCallback(() => {
    teardown(); setCallState("ended")
    if (resetTimer.current) clearTimeout(resetTimer.current)
    resetTimer.current = setTimeout(() => setCallState("idle"), 1600)
  }, [teardown, setCallState])
  const signal = useCallback(async (type: "offer" | "answer" | "ice-candidate" | "hangup" | "reject" | "connected", payload: object = {}) => {
    if (!conversation.current) throw new Error("No conversation selected.")
    const result = await sendCallSignal({ conversationId: conversation.current, type, payload: { ...payload, callId: callId.current } })
    if (!result.success) throw new Error(result.error)
  }, [])
  const flush = useCallback(async () => {
    const pc = pcRef.current
    if (!pc?.remoteDescription) return
    const pending = candidates.current; candidates.current = []
    for (const candidate of pending) await pc.addIceCandidate(candidate).catch(() => {})
  }, [])
  const prepare = useCallback(async (video: boolean) => {
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") throw new Error("Calls need a supported browser and HTTPS (or localhost).")
    const version = generation.current
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: video ? { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } : false })
    if (generation.current !== version) { stream.getTracks().forEach(track => track.stop()); throw new Error("Call cancelled.") }
    facingRef.current = stream.getVideoTracks()[0]?.getSettings().facingMode === "environment" ? "environment" : "user"
    setCameraFacing(facingRef.current)
    streamRef.current = stream; setLocalStream(stream)
    const iceServers = await getCallIceServers()
    if (generation.current !== version) { stream.getTracks().forEach(track => track.stop()); throw new Error("Call cancelled.") }
    const pc = new RTCPeerConnection({ iceServers: iceServers.length ? iceServers : [{ urls: "stun:stun.l.google.com:19302" }] })
    pcRef.current = pc
    pc.onicecandidate = event => { if (event.candidate) { if (signalReady.current) void signal("ice-candidate", event.candidate.toJSON()).catch(() => {}); else outgoingIce.current.push(event.candidate.toJSON()) } }
    pc.ontrack = event => { const remote = event.streams[0] || new MediaStream([event.track]); setRemoteStream(remote); if (remoteAudioRef.current) { remoteAudioRef.current.srcObject = remote; void remoteAudioRef.current.play().catch(() => {}) } }
    pc.onconnectionstatechange = () => {
      if (pc !== pcRef.current) return
      if (pc.connectionState === "connected") { if (!connected.current) void signal("connected").catch(() => {}); connected.current = true; setCallState("connected") }
      else if (pc.connectionState === "failed") { setError("The media connection failed. Try another network or ask support to check call relay configuration."); void signal("hangup").catch(() => {}); finish() }
    }
    stream.getTracks().forEach(track => pc.addTrack(track, stream))
    return pc
  }, [finish, signal, setCallState])
  const flushOutgoing = useCallback(async () => { signalReady.current = true; const queue = outgoingIce.current; outgoingIce.current = []; for (const candidate of queue) await signal("ice-candidate", candidate) }, [signal])
  const startCall = useCallback(async (video = false) => {
    if (!conversationId || !["idle", "ended"].includes(stateRef.current)) return
    if (resetTimer.current) clearTimeout(resetTimer.current)
    callId.current = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; caller.current = true; connected.current = false; duration.current = 0
    setCallDuration(0); setError(""); setIsVideo(video); setCallState("outgoing")
    try { const pc = await prepare(video); const offer = await pc.createOffer(); await pc.setLocalDescription(offer); await signal("offer", { sdp: offer.sdp, type: offer.type, video }); await flushOutgoing() }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Camera or microphone access failed."); finish() }
  }, [conversationId, prepare, signal, finish, setCallState, flushOutgoing])
  const acceptCall = useCallback(async () => {
    const offer = offerRef.current
    if (!offer || stateRef.current !== "incoming") return
    setError(""); setCallState("connecting")
    try { const pc = await prepare(!!offer.video); await pc.setRemoteDescription({ type: offer.type, sdp: offer.sdp }); await flush(); const answer = await pc.createAnswer(); await pc.setLocalDescription(answer); await signal("answer", { sdp: answer.sdp, type: answer.type }); await flushOutgoing() }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Camera or microphone access failed."); void signal("reject").catch(() => {}); finish() }
  }, [prepare, flush, signal, finish, setCallState, flushOutgoing])
  const declineCall = useCallback(() => { void signal("reject").catch(() => {}); finish() }, [signal, finish])
  const endCall = useCallback(() => { void signal("hangup", { isCaller: caller.current, wasConnected: connected.current, durationSeconds: duration.current }).catch(() => {}); finish() }, [signal, finish])
  const toggleMute = useCallback(() => { const track = streamRef.current?.getAudioTracks()[0]; if (track) { track.enabled = !track.enabled; setIsMuted(!track.enabled) } }, [])
  const toggleCamera = useCallback(() => { const track = streamRef.current?.getVideoTracks()[0]; if (track) { track.enabled = !track.enabled; setCameraEnabled(track.enabled) } }, [])
  const switchCamera = useCallback(async () => {
    const pc = pcRef.current, stream = streamRef.current, version = generation.current
    if (!pc || !stream?.getVideoTracks().length || cameraSwitch.current) return
    cameraSwitch.current = true; setSwitchingCamera(true); setError("")
    const current = () => generation.current === version && pcRef.current === pc
    const facing = facingRef.current === "user" ? "environment" : "user"
    try {
      const track = await replaceCallCamera(pc, stream, facing, current)
      if (track && current()) {
        facingRef.current = track.getSettings().facingMode === "user" ? "user" : facing
        setCameraFacing(facingRef.current)
        setLocalStream(new MediaStream(stream.getTracks()))
      }
    } catch {
      if (current()) {
        setLocalStream(new MediaStream(stream.getTracks()))
        setError("Could not switch cameras. Check camera permission and that this device has a front and rear camera.")
      }
    } finally {
      if (current()) { cameraSwitch.current = false; setSwitchingCamera(false) }
    }
  }, [])
  const handle = useCallback(async (item: CallSignalItem) => {
    const payload = (item.payload || {}) as Offer & RTCIceCandidateInit
    if (item.type === "offer") {
      if (!["idle", "ended"].includes(stateRef.current)) return
      if (resetTimer.current) clearTimeout(resetTimer.current)
      callId.current = payload.callId || item.id; offerRef.current = payload; caller.current = false; connected.current = false; duration.current = 0
      setCallDuration(0); setIsVideo(!!payload.video); setError(""); setCallState("incoming"); return
    }
    if (payload.callId && payload.callId !== callId.current) return
    if (item.type === "answer" && pcRef.current?.signalingState === "have-local-offer") { setCallState("connecting"); await pcRef.current.setRemoteDescription({ type: payload.type, sdp: payload.sdp }); await flush() }
    else if (item.type === "ice-candidate") { if (pcRef.current?.remoteDescription) await pcRef.current.addIceCandidate(payload).catch(() => {}); else candidates.current.push(payload) }
    else if (["hangup", "reject"].includes(item.type) && !["idle", "ended"].includes(stateRef.current)) { if (item.type === "reject") setError("The call was declined."); finish() }
  }, [finish, flush, setCallState])
  useEffect(() => {
    conversation.current = conversationId
    setError("")
    let cancelled = false, timer: ReturnType<typeof setTimeout>
    const seen = new Set<string>()
    const poll = async () => {
      if (!conversationId) return
      try { const items = await getCallSignals(conversationId); if (cancelled) return; for (const item of items) { if (seen.has(item.id)) continue; seen.add(item.id); await handle(item) } }
      catch { if (!cancelled && !["idle", "ended"].includes(stateRef.current)) setError("Call signalling is interrupted. Check your connection.") }
      if (!cancelled) timer = setTimeout(poll, document.hidden && stateRef.current === "idle" ? 5000 : 1200)
    }
    void poll()
    return () => { cancelled = true; clearTimeout(timer); if (!["idle", "ended"].includes(stateRef.current)) void sendCallSignal({ conversationId, type: "hangup", payload: { callId: callId.current, durationSeconds: duration.current, wasConnected: connected.current } }).catch(() => {}); teardown(); setCallState("idle"); if (resetTimer.current) clearTimeout(resetTimer.current) }
  }, [conversationId, handle, teardown, setCallState])
  useEffect(() => { if (callState === "incoming") startRinging(); else stopRinging(); return () => stopRinging() }, [callState])
  useEffect(() => { if (!["outgoing", "incoming", "connecting"].includes(callState)) return; const timer = setTimeout(() => { setError("No connection was established. Please try again."); endCall() }, callState === "connecting" ? 30000 : 60000); return () => clearTimeout(timer) }, [callState, endCall])
  useEffect(() => { if (callState !== "connected") return; const timer = setInterval(() => { duration.current++; setCallDuration(duration.current) }, 1000); return () => clearInterval(timer) }, [callState])
  return { callState, callDuration, error, isMuted, isVideo, cameraEnabled, localStream, remoteStream, startCall, acceptCall, declineCall, endCall, toggleMute, toggleCamera, switchCamera, switchingCamera, cameraFacing, remoteAudioRef }
}
