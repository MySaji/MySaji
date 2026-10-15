"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { getCallIceServers } from "@/backend/actions/call-configuration"
import { sendCallSignal, getCallSignals, clearCallSignals, type CallSignalItem } from "@/backend/actions/calls"
import { startRinging, stopRinging } from "@/frontend/lib/ringtone"

/**
 * Gap between one poll finishing and the next starting — not a fixed
 * interval.
 *
 * On a fixed 1.5s setInterval the polls overlapped: a single getCallSignals
 * round trip costs seconds against a database in another region, so a new
 * request went out while two were still in flight. They ended up cancelled
 * (net::ERR_ABORTED), and sendCallSignal calls made from the same page were
 * cancelled with them — which is why a callee's answer and ICE candidates
 * never reached the caller and every call stalled on "Calling…". Waiting for
 * each poll to finish keeps at most one request outstanding.
 */
const POLL_GAP_MS = 900
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
  /**
   * ICE candidates that arrived before we could use them.
   *
   * The caller starts gathering and sending candidates the moment it creates
   * its offer, but the callee has no peer connection at all until they press
   * Accept — so every one of the caller's candidates lands while there is
   * nowhere to put it. They used to be thrown away, which left the caller
   * with no route to the callee: its ICE sat on "checking" forever and no
   * audio ever flowed, even though both sides showed a live call.
   *
   * Buffering them and flushing once the remote description exists is the
   * standard fix, and matters more here than in a socket-based app: a
   * ringing phone can sit unanswered for many seconds.
   */
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([])
  const seenSignalIds = useRef<Set<string>>(new Set())
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const conversationIdRef = useRef<string | null>(null)
  const prevCallStateRef = useRef<CallState>("idle")
  /** Set while THIS user is the one who dialled — only the caller writes the
   *  history row, so a call is not listed twice (see logCall). */
  const isCallerRef = useRef(false)
  /** Whether the call was ever actually answered, which is what separates a
   *  completed call from a missed one. */
  const wasConnectedRef = useRef(false)
  const wasDeclinedRef = useRef(false)
  const durationRef = useRef(0)

  const teardown = useCallback(() => {
    pcRef.current?.close()
    pcRef.current = null
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    localStreamRef.current = null
    pendingOfferRef.current = null
    pendingCandidatesRef.current = []
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

  /** Adds everything that arrived early. Called immediately after each
   *  setRemoteDescription, which is the moment they become usable. */
  const flushPendingCandidates = useCallback(async () => {
    const pc = pcRef.current
    if (!pc || !pc.remoteDescription) return
    const queued = pendingCandidatesRef.current
    pendingCandidatesRef.current = []
    for (const candidate of queued) {
      // One malformed candidate must not discard the rest of the queue.
      await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {})
    }
  }, [])

  const createPeerConnection = useCallback(async (convId: string) => {
    const configured = await getCallIceServers()
    const pc = new RTCPeerConnection({ iceServers: configured.length ? configured : ICE_SERVERS })
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
        wasConnectedRef.current = true
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
    isCallerRef.current = true
    wasConnectedRef.current = false
    wasDeclinedRef.current = false
    durationRef.current = 0
    setError("")
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      localStreamRef.current = stream
      const pc = await createPeerConnection(conversationId)
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
    isCallerRef.current = false
    setError("")
    const offer = pendingOfferRef.current
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      localStreamRef.current = stream
      const pc = await createPeerConnection(conversationId)
      stream.getTracks().forEach((track) => pc.addTrack(track, stream))
      await pc.setRemoteDescription(new RTCSessionDescription(offer))
      await flushPendingCandidates()
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
    // The server writes the history row from this signal — see sendCallSignal.
    if (conversationId) void sendCallSignal({ conversationId, type: "reject", payload: {} })
    teardown()
    setCallState("idle")
  }, [conversationId, teardown])

  const endCall = useCallback(() => {
    if (conversationId) {
      // Carries what only this client knows — who dialled, whether it was
      // ever answered, and for how long — so the server can record the call.
      void sendCallSignal({
        conversationId,
        type: "hangup",
        payload: {
          isCaller: isCallerRef.current,
          wasConnected: wasConnectedRef.current,
          durationSeconds: durationRef.current,
        },
      })
    }
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
          await flushPendingCandidates()
        }
        break
      case "ice-candidate":
        // Queued whenever it cannot be applied yet — there is no peer
        // connection (the callee has not accepted) or no remote description
        // (the answer has not arrived). See pendingCandidatesRef.
        if (pcRef.current?.remoteDescription) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(signal.payload as RTCIceCandidateInit)).catch(() => {})
        } else {
          pendingCandidatesRef.current.push(signal.payload as RTCIceCandidateInit)
        }
        break
      case "reject":
        wasDeclinedRef.current = true
        finishCall("idle")
        break
      case "hangup":
        finishCall("idle")
        break
    }
  }, [finishCall, flushPendingCandidates])

  // Poll for signals addressed to me while this conversation is open —
  // this is what lets an incoming call actually "ring" without the callee
  // having clicked anything first.
  useEffect(() => {
    conversationIdRef.current = conversationId
    seenSignalIds.current.clear()
    if (!conversationId) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const poll = async () => {
      const signals = await getCallSignals(conversationId).catch(() => [])
      if (cancelled) return
      for (const signal of signals) {
        if (seenSignalIds.current.has(signal.id)) continue
        seenSignalIds.current.add(signal.id)
        await handleSignal(signal)
      }
      // Scheduled only once this round trip is done, so polls can never
      // stack up and cancel each other (see POLL_GAP_MS).
      if (!cancelled) timer = setTimeout(poll, POLL_GAP_MS)
    }
    void poll()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [conversationId, handleSignal])

  // Ring while a call is being offered, and stop the moment it is answered,
  // declined or withdrawn. Tied to callState rather than to the accept and
  // decline handlers so a call the other side cancels stops ringing too.
  useEffect(() => {
    if (callState === "incoming") {
      startRinging()
      return () => stopRinging()
    }
    stopRinging()
  }, [callState])

  // Call duration ticker.
  useEffect(() => {
    if (callState !== "connected") return
    durationTimerRef.current = setInterval(() => setCallDuration((d) => {
      durationRef.current = d + 1
      return d + 1
    }), 1000)
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
    const leftACall = prevCallStateRef.current !== "idle" && prevCallStateRef.current !== "ended"
    if ((callState === "idle" || callState === "ended") && leftACall && conversationIdRef.current) {
      void clearCallSignals(conversationIdRef.current)

      isCallerRef.current = false
    }
    prevCallStateRef.current = callState
  }, [callState])

  // Tear down any live connection if the component unmounts mid-call.
  useEffect(() => () => teardown(), [teardown])

  return { callState, callDuration, error, isMuted, startCall, acceptCall, declineCall, endCall, toggleMute, remoteAudioRef }
}
