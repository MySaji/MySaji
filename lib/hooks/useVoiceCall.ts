"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { sendCallSignal, getCallSignals, clearCallSignals, type CallSignalItem } from "@/lib/actions/calls"

const POLL_MS = 1500
// Public, free STUN servers — enough to discover a usable candidate for
// most home/office NATs. No TURN server is configured, so a call between
// two networks that both need relaying (e.g. two symmetric NATs) can fail
// to connect; that's a real, known limitation of a STUN-only setup, not a
// bug in the signaling logic itself.
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
]

export type CallState = "idle" | "outgoing" | "incoming" | "connected" | "ended"

export function useVoiceCall(conversationId: string | null) {
  const [callState, setCallState] = useState<CallState>("idle")
  const [callDuration, setCallDuration] = useState(0)
  const [error, setError] = useState("")
  const [isMuted, setIsMuted] = useState(false)
  const remoteAudioRef = useRef<HTMLAudioElement>(null)

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null)
  const seenSignalIds = useRef<Set<string>>(new Set())
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const conversationIdRef = useRef<string | null>(null)
  const prevCallStateRef = useRef<CallState>("idle")

  const teardown = useCallback(() => {
    pcRef.current?.close()
    pcRef.current = null
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    localStreamRef.current = null
    pendingOfferRef.current = null
    if (durationTimerRef.current) clearInterval(durationTimerRef.current)
    durationTimerRef.current = null
    setCallDuration(0)
    setIsMuted(false)
  }, [])

  const finishCall = useCallback((nextState: "ended" | "idle" = "ended") => {
    teardown()
    setCallState(nextState)
    if (nextState === "ended") {
      setTimeout(() => setCallState("idle"), 1200)
    }
  }, [teardown])

  const createPeerConnection = useCallback((convId: string) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        void sendCallSignal({ conversationId: convId, type: "ice-candidate", payload: event.candidate.toJSON() })
      }
    }
    pc.ontrack = (event) => {
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = event.streams[0]
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        setCallState("connected")
      } else if (pc.connectionState === "failed") {
        setError("Call connection failed. Check your network and try again.")
        finishCall("ended")
      } else if (pc.connectionState === "closed") {
        finishCall("idle")
      }
    }
    pcRef.current = pc
    return pc
  }, [finishCall])

  const startCall = useCallback(async () => {
    if (!conversationId) return
    setError("")
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      localStreamRef.current = stream
      const pc = createPeerConnection(conversationId)
      stream.getTracks().forEach((track) => pc.addTrack(track, stream))
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      await sendCallSignal({ conversationId, type: "offer", payload: { sdp: offer.sdp, type: offer.type } })
      setCallState("outgoing")
    } catch {
      setError("Couldn't access your microphone. Check your browser's permission settings.")
    }
  }, [conversationId, createPeerConnection])

  const acceptCall = useCallback(async () => {
    if (!conversationId || !pendingOfferRef.current) return
    setError("")
    const offer = pendingOfferRef.current
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      localStreamRef.current = stream
      const pc = createPeerConnection(conversationId)
      stream.getTracks().forEach((track) => pc.addTrack(track, stream))
      await pc.setRemoteDescription(new RTCSessionDescription(offer))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      await sendCallSignal({ conversationId, type: "answer", payload: { sdp: answer.sdp, type: answer.type } })
      pendingOfferRef.current = null
      setCallState("connected")
    } catch {
      setError("Couldn't access your microphone. Check your browser's permission settings.")
    }
  }, [conversationId, createPeerConnection])

  const declineCall = useCallback(() => {
    if (conversationId) void sendCallSignal({ conversationId, type: "reject", payload: {} })
    teardown()
    setCallState("idle")
  }, [conversationId, teardown])

  const endCall = useCallback(() => {
    if (conversationId) void sendCallSignal({ conversationId, type: "hangup", payload: {} })
    finishCall("ended")
  }, [conversationId, finishCall])

  const toggleMute = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    setIsMuted(!track.enabled)
  }, [])

  // Handle one incoming signal.
  const handleSignal = useCallback(async (signal: CallSignalItem) => {
    switch (signal.type) {
      case "offer":
        if (pcRef.current) {
          // Already on a call (or dialing) — silently no-op rather than
          // interrupt; a real "busy" reply is a reasonable follow-up but
          // out of scope for this pass.
          return
        }
        pendingOfferRef.current = signal.payload as RTCSessionDescriptionInit
        setCallState("incoming")
        break
      case "answer":
        if (pcRef.current && pcRef.current.signalingState === "have-local-offer") {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(signal.payload as RTCSessionDescriptionInit))
        }
        break
      case "ice-candidate":
        if (pcRef.current && pcRef.current.remoteDescription) {
          try {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(signal.payload as RTCIceCandidateInit))
          } catch {
            // A candidate arriving before the remote description is set is
            // expected sometimes with pure polling (no queuing) — safe to drop.
          }
        }
        break
      case "hangup":
      case "reject":
        finishCall("idle")
        break
    }
  }, [finishCall])

  // Poll for signals addressed to me while this conversation is open —
  // this is what lets an incoming call actually "ring" without the callee
  // having clicked anything first.
  useEffect(() => {
    conversationIdRef.current = conversationId
    seenSignalIds.current.clear()
    if (!conversationId) return

    let cancelled = false
    const poll = async () => {
      const signals = await getCallSignals(conversationId).catch(() => [])
      if (cancelled) return
      for (const signal of signals) {
        if (seenSignalIds.current.has(signal.id)) continue
        seenSignalIds.current.add(signal.id)
        await handleSignal(signal)
      }
    }
    const interval = setInterval(poll, POLL_MS)
    void poll()
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [conversationId, handleSignal])

  // Call duration ticker.
  useEffect(() => {
    if (callState !== "connected") return
    durationTimerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000)
    return () => {
      if (durationTimerRef.current) clearInterval(durationTimerRef.current)
    }
  }, [callState])

  // Leftover-signal cleanup once a call fully ends. Must only fire on an
  // actual transition INTO idle (i.e. a call just ended), never on mount —
  // callState starts as "idle" too, and this same fire-and-forget delete
  // running at mount time raced a fresh offer/answer/ICE write in this
  // environment's high-latency DB pooler (tens of seconds per round trip),
  // silently deleting a brand-new signal moments after it was created and
  // making a freshly-dialed call never ring on the other end.
  useEffect(() => {
    if (callState === "idle" && prevCallStateRef.current !== "idle" && conversationIdRef.current) {
      void clearCallSignals(conversationIdRef.current)
    }
    prevCallStateRef.current = callState
  }, [callState])

  // Tear down any live connection if the component unmounts mid-call.
  useEffect(() => () => teardown(), [teardown])

  return { callState, callDuration, error, isMuted, startCall, acceptCall, declineCall, endCall, toggleMute, remoteAudioRef }
}
