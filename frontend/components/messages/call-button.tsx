"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, SwitchCamera, Maximize, Minimize } from "lucide-react"
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
  const { callState, callDuration, error, isMuted, isVideo, cameraEnabled, localStream, remoteStream, startCall, acceptCall, declineCall, endCall, toggleMute, toggleCamera, switchCamera, switchingCamera, cameraFacing, remoteAudioRef } = useVoiceCall(conversationId)
  const callPanel = useRef<HTMLDivElement>(null)
  const [selfOnMain, setSelfOnMain] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [fullscreenError, setFullscreenError] = useState("")
  const videoStage = isVideo && ["outgoing", "connecting", "connected"].includes(callState)
  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement === callPanel.current)
    document.addEventListener("fullscreenchange", changed)
    return () => document.removeEventListener("fullscreenchange", changed)
  }, [])
  const toggleFullscreen = async () => {
    try {
      setFullscreenError("")
      if (document.fullscreenElement === callPanel.current) await document.exitFullscreen()
      else await callPanel.current?.requestFullscreen()
    } catch { setFullscreenError("Your browser could not enter fullscreen. The call still fills this window.") }
  }
  const consumedTokenRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!conversationId || !autoStartToken || consumedTokenRef.current === autoStartToken) return
    consumedTokenRef.current = autoStartToken
    void startCall()
  }, [conversationId, autoStartToken, startCall])

  const dialogOpen = callState !== "idle"
  useEffect(() => {
    if (!dialogOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const previous = document.activeElement as HTMLElement | null
    const panel = callPanel.current
    panel?.querySelector<HTMLButtonElement>("button")?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.fullscreenElement) { event.preventDefault(); if (callState === "incoming") declineCall(); else endCall() }
      if (event.key === "Tab" && panel) {
        const buttons = [...panel.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")]
        const first = buttons[0], last = buttons[buttons.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener("keydown", onKey)
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKey); previous?.focus() }
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
      {dialogOpen && createPortal(
        <div ref={callPanel} role="dialog" aria-modal="true" aria-label={isVideo ? "Video call" : "Audio call"} className="fixed inset-0 z-[100] isolate flex h-dvh w-full flex-col overflow-hidden bg-[#071b3b] text-white">
          {/* Status line */}
          <div className={`relative z-10 shrink-0 bg-gradient-to-b from-black/70 to-transparent px-4 pb-6 pt-[max(1rem,env(safe-area-inset-top))] text-center ${videoStage ? "pointer-events-none" : ""}`}>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-white/50">
              {callState === "outgoing" && "Calling"}
              {callState === "incoming" && "Incoming call"}
              {callState === "connected" && "On call"}
              {callState === "connecting" && "Connecting media"}
              {isVideo && " - Video"}
              {callState === "ended" && "Call ended"}
            </p>
          </div>

          {videoStage && <div className="absolute inset-0 bg-black">
            <CallVideo stream={selfOnMain ? localStream : remoteStream} mirrored={selfOnMain && cameraFacing === "user"} className="h-full w-full object-cover" />
            {((selfOnMain && !cameraEnabled) || (!selfOnMain && !remoteStream)) && <p className="absolute inset-x-4 top-1/2 text-center text-sm text-white/80">{selfOnMain ? "Your camera is off" : "Waiting for the other camera..."}</p>}
            <button type="button" onClick={() => setSelfOnMain(value => !value)} aria-label={selfOnMain ? "Show other person on main display" : "Show my camera on main display"} title="Tap to swap videos" className="absolute bottom-[calc(9rem+env(safe-area-inset-bottom))] right-4 h-36 w-24 overflow-hidden rounded-2xl border-2 border-white/60 bg-slate-900 shadow-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:h-48 sm:w-36">
              <CallVideo stream={selfOnMain ? remoteStream : localStream} mirrored={!selfOnMain && cameraFacing === "user"} className="h-full w-full object-cover" />
              {!selfOnMain && !cameraEnabled && <span className="absolute inset-0 flex items-center justify-center bg-slate-900"><VideoOff aria-hidden="true" /></span>}
              <span className="absolute inset-x-0 bottom-0 bg-black/70 px-1 py-1 text-[11px]">{selfOnMain ? otherUserName : "You"} - Tap to swap</span>
            </button>
            {typeof document !== "undefined" && document.fullscreenEnabled && <button type="button" onClick={() => void toggleFullscreen()} aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"} className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-20 rounded-full bg-black/50 p-3 focus-visible:outline-2 focus-visible:outline-white">{fullscreen ? <Minimize size={20} /> : <Maximize size={20} />}</button>}
          </div>}
          {/* Who, and for how long */}
          <div className={`flex min-h-0 flex-col items-center justify-center gap-5 px-8 ${videoStage ? "pointer-events-none relative z-10 flex-1 justify-start! gap-1! pt-0" : "flex-1"}`}>
            <div className={videoStage ? "hidden" : "relative"}>
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
              <h3 className={videoStage ? "text-base font-semibold drop-shadow-lg" : "text-2xl font-semibold"}>{otherUserName}</h3>
              <p className="mt-1.5 text-sm tabular-nums text-white/60">
                {callState === "connected" ? formatDuration(callDuration) : " "}
              </p>
            </div>

            {(error || fullscreenError) && (
              <p role="alert" className="max-w-xs rounded-xl bg-red-500/15 px-4 py-2 text-center text-xs text-red-300">{error || fullscreenError}</p>
            )}
          </div>

          {/* Controls, kept low so they fall under the thumb */}
          <div className="relative z-10 shrink-0 bg-gradient-to-t from-black/90 to-transparent px-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6">
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
              <div className="flex items-center justify-center gap-4 sm:gap-10">
                {isVideo && localStream && <CallAction label={cameraEnabled ? "Camera off" : "Camera on"} onClick={toggleCamera} disabled={switchingCamera} className="bg-white/10 hover:bg-white/20">{cameraEnabled ? <Video size={24} /> : <VideoOff size={24} />}</CallAction>}
                {isVideo && localStream && <CallAction label={switchingCamera ? "Switching..." : "Switch camera"} disabled={switchingCamera} onClick={() => void switchCamera()} className="bg-white/10 hover:bg-white/20"><SwitchCamera size={24} /></CallAction>}
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
        </div>, document.body
      )}
    </>
  )
}

/** One round call control with its label underneath, so each button says
 *  what it does rather than relying on colour alone. */
function CallAction({
  children, label, onClick, className, disabled,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  className: string
  disabled?: boolean
}) {
  return (
    <button onClick={onClick} disabled={disabled} className="flex flex-col items-center gap-2 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white" aria-label={label}>
      <span className={`flex h-12 w-12 sm:h-16 sm:w-16 items-center justify-center rounded-full text-white shadow-lg transition-colors ${className}`}>
        {children}
      </span>
      <span className="text-[11px] font-medium text-white/70">{label}</span>
    </button>
  )
}

/** Both video surfaces stay muted: the hook owns the single remote audio output. */
function CallVideo({ stream, mirrored, className }: { stream: MediaStream | null; mirrored: boolean; className: string }) {
  const video = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const element = video.current
    if (!element) return
    element.srcObject = stream
    if (stream) void element.play().catch(() => {})
    return () => { element.srcObject = null }
  }, [stream])
  return <video ref={video} autoPlay playsInline muted className={className} style={{ transform: mirrored ? "scaleX(-1)" : undefined }} />
}
