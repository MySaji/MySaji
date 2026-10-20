"use client"

import { useEffect, useRef } from "react"
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff } from "lucide-react"
import { useVoiceCall } from "@/frontend/lib/hooks/useVoiceCall"

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

/** Real voice-call button for a chat header — one instance per open
 * conversation. Encapsulates the whole call lifecycle (dial, incoming ring,
 * connected, hang up) via useVoiceCall, so a portal's messages page only
 * needs to render this and pass who's on the other end. A call can only
 * ring while its conversation is the one currently open, since that's what
 * drives useVoiceCall's signal polling — see that hook's own note. */
export function CallButton({
  conversationId, otherUserName, otherUserAvatar, autoStartToken,
}: {
  conversationId: string | null
  otherUserName: string
  otherUserAvatar?: string | null
  /** Bump this (e.g. to Date.now()) to trigger a call automatically once
   * conversationId is ready — used by the "Call" deep link from a provider/
   * client profile page, which used to jump straight into the old fake
   * call UI without the user clicking this button first. */
  autoStartToken?: number
}) {
  const { callState, callDuration, error, isMuted, isVideo, cameraEnabled, localStream, remoteStream, startCall, acceptCall, declineCall, endCall, toggleMute, toggleCamera, remoteAudioRef } = useVoiceCall(conversationId)
  const callPanel = useRef<HTMLDivElement>(null)
  const localVideo = useRef<HTMLVideoElement>(null)
  const remoteVideo = useRef<HTMLVideoElement>(null)
  useEffect(() => { if (localVideo.current) localVideo.current.srcObject = localStream; if (remoteVideo.current) remoteVideo.current.srcObject = remoteStream }, [localStream, remoteStream, callState])
  const consumedTokenRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!conversationId || !autoStartToken || consumedTokenRef.current === autoStartToken) return
    consumedTokenRef.current = autoStartToken
    void startCall()
  }, [conversationId, autoStartToken, startCall])

  const dialogOpen = callState !== "idle"
  useEffect(() => {
    if (!dialogOpen) return
    const previous = document.activeElement as HTMLElement | null
    const panel = callPanel.current
    panel?.querySelector<HTMLButtonElement>("button")?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); if (callState === "incoming") declineCall(); else endCall() }
      if (event.key === "Tab" && panel) {
        const buttons = [...panel.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")]
        const first = buttons[0], last = buttons[buttons.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener("keydown", onKey)
    return () => { document.removeEventListener("keydown", onKey); previous?.focus() }
  }, [dialogOpen, callState, declineCall, endCall])

  return (
    <>
      <button
        onClick={() => conversationId && startCall()}
        disabled={!conversationId || callState !== "idle"}
        className="rounded-xl p-2 transition-colors hover:bg-muted disabled:opacity-40"
        aria-label="Start audio call" title="Audio call"
      >
        <Phone className="h-4 w-4 text-muted-foreground" />
      </button>

      <button onClick={() => void startCall(true)} disabled={!conversationId || callState !== "idle"} aria-label="Start video call" title="Video call" className="rounded-xl p-2 transition-colors hover:bg-muted disabled:opacity-40"><Video className="h-4 w-4 text-muted-foreground" /></button>
      {error && !dialogOpen && <span role="alert" className="fixed left-4 right-4 top-20 z-[75] mx-auto max-w-lg rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-lg">{error}</span>}
      <audio ref={remoteAudioRef} autoPlay className="hidden" />

      {/* Full-screen call sheet rather than a small centred dialog. A call
          is the only thing happening while it runs, and on a phone a modal
          card floating over the chat behind it made an incoming call easy to
          mistake for a message. Dark, edge to edge, with the answer/decline
          controls in the thumb zone. */}
      {dialogOpen && (
        <div ref={callPanel} role="dialog" aria-modal="true" aria-label={isVideo ? "Video call" : "Audio call"} className="fixed inset-0 z-[70] flex flex-col overflow-y-auto bg-[#071b3b] text-white">
          {/* Status line */}
          <div className="flex-shrink-0 pt-[max(2rem,env(safe-area-inset-top))] text-center">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/50">
              {callState === "outgoing" && "Calling"}
              {callState === "incoming" && "Incoming call"}
              {callState === "connected" && "On call"}
              {callState === "connecting" && "Connecting media"}
              {isVideo && " - Video"}
              {callState === "ended" && "Call ended"}
            </p>
          </div>

          {isVideo && (callState === "connected" || callState === "connecting" || callState === "outgoing") && <div className="relative mx-auto mt-5 min-h-40 w-[calc(100%-2rem)] max-w-4xl flex-1 overflow-hidden rounded-2xl bg-black"><video ref={remoteVideo} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-contain" /><video ref={localVideo} autoPlay playsInline muted className="absolute bottom-3 right-3 h-28 w-24 rounded-xl border border-white/40 bg-slate-800 object-cover sm:h-40 sm:w-32" />{!remoteStream && <p className="absolute left-4 top-4 text-xs text-white/70">Waiting for the other camera...</p>}</div>}
          {/* Who, and for how long */}
          <div className={`flex min-h-0 flex-col items-center justify-center gap-5 px-8 ${isVideo ? "py-5" : "flex-1"}`}>
            <div className="relative">
              {/* The pulse is only while it is actually ringing — a live call
                  showing an animation reads as "still connecting". */}
              {(callState === "incoming" || callState === "outgoing") && (
                <span className="absolute inset-0 animate-ping rounded-full bg-white/20" />
              )}
              {otherUserAvatar ? (
                // Images use the configured unoptimized rendering policy -- base64 data URLs aren't supported by next/image
                <img src={otherUserAvatar} alt="" className="relative h-28 w-28 rounded-full object-cover ring-4 ring-white/10" />
              ) : (
                <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-white/10 text-4xl font-semibold ring-4 ring-white/10">
                  {otherUserName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            <div className="text-center">
              <h3 className="text-2xl font-semibold">{otherUserName}</h3>
              <p className="mt-1.5 text-sm tabular-nums text-white/60">
                {callState === "connected" ? formatDuration(callDuration) : " "}
              </p>
            </div>

            {error && (
              <p role="alert" className="max-w-xs rounded-xl bg-red-500/15 px-4 py-2 text-center text-xs text-red-300">{error}</p>
            )}
          </div>

          {/* Controls, kept low so they fall under the thumb */}
          <div className="flex-shrink-0 pb-[max(3rem,env(safe-area-inset-bottom))] pt-6">
            {callState === "incoming" ? (
              <div className="flex items-center justify-center gap-16">
                <CallAction label="Decline" onClick={declineCall} className="bg-red-500 hover:bg-red-600">
                  <PhoneOff className="h-7 w-7" />
                </CallAction>
                <CallAction label="Accept" onClick={() => void acceptCall()} className="bg-emerald-500 hover:bg-emerald-600">
                  <Phone className="h-7 w-7" />
                </CallAction>
              </div>
            ) : callState === "ended" ? null : (
              <div className="flex items-center justify-center gap-6 sm:gap-10">
                {isVideo && localStream && <CallAction label={cameraEnabled ? "Camera off" : "Camera on"} onClick={toggleCamera} className="bg-white/10 hover:bg-white/20">{cameraEnabled ? <Video size={24} /> : <VideoOff size={24} />}</CallAction>}
                {callState === "connected" && (
                  <CallAction
                    label={isMuted ? "Unmute" : "Mute"}
                    onClick={toggleMute}
                    className={isMuted ? "bg-white text-slate-900 hover:bg-white/90" : "bg-white/10 hover:bg-white/20"}
                  >
                    {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                  </CallAction>
                )}
                <CallAction label="End" onClick={endCall} className="bg-red-500 hover:bg-red-600">
                  <PhoneOff className="h-7 w-7" />
                </CallAction>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

/** One round call control with its label underneath, so each button says
 *  what it does rather than relying on colour alone. */
function CallAction({
  children, label, onClick, className,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  className: string
}) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-2" aria-label={label}>
      <span className={`flex h-16 w-16 items-center justify-center rounded-full text-white shadow-lg transition-colors ${className}`}>
        {children}
      </span>
      <span className="text-[11px] font-medium text-white/70">{label}</span>
    </button>
  )
}
