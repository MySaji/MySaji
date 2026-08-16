"use client"

import { useEffect, useRef } from "react"
import { Phone, PhoneOff, Mic, MicOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { useVoiceCall } from "@/lib/hooks/useVoiceCall"

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
  const { callState, callDuration, error, isMuted, startCall, acceptCall, declineCall, endCall, toggleMute, remoteAudioRef } = useVoiceCall(conversationId)
  const consumedTokenRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!conversationId || !autoStartToken || consumedTokenRef.current === autoStartToken) return
    consumedTokenRef.current = autoStartToken
    void startCall()
  }, [conversationId, autoStartToken, startCall])

  const dialogOpen = callState !== "idle"

  return (
    <>
      <button
        onClick={() => conversationId && startCall()}
        disabled={!conversationId || callState !== "idle"}
        className="rounded-xl p-2 transition-colors hover:bg-muted disabled:opacity-40"
        title="Call"
      >
        <Phone className="h-4 w-4 text-muted-foreground" />
      </button>

      <audio ref={remoteAudioRef} autoPlay className="hidden" />

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open && callState === "connected") endCall() }}>
        <DialogContent className="max-w-sm border-0" showCloseButton={false}>
          <div className="flex flex-col items-center gap-6 py-8">
            {otherUserAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element -- base64 data URLs aren't supported by next/image
              <img src={otherUserAvatar} alt={otherUserName} className="h-20 w-20 rounded-full object-cover" />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary">
                {otherUserName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="text-center">
              <h3 className="text-xl font-semibold text-foreground">{otherUserName}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {callState === "outgoing" && "Calling..."}
                {callState === "incoming" && "Incoming call..."}
                {callState === "connected" && formatDuration(callDuration)}
                {callState === "ended" && "Call ended"}
              </p>
              {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            </div>

            {callState === "incoming" && (
              <div className="flex gap-4">
                <Button onClick={declineCall} className="h-12 w-12 rounded-full bg-red-500 p-0 hover:bg-red-600">
                  <PhoneOff className="h-5 w-5 text-white" />
                </Button>
                <Button onClick={acceptCall} className="h-12 w-12 rounded-full bg-emerald-500 p-0 hover:bg-emerald-600">
                  <Phone className="h-5 w-5 text-white" />
                </Button>
              </div>
            )}

            {(callState === "outgoing" || callState === "connected") && (
              <div className="flex gap-4">
                {callState === "connected" && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-12 w-12 rounded-full bg-muted"
                    onClick={toggleMute}
                    title={isMuted ? "Unmute" : "Mute"}
                  >
                    {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                  </Button>
                )}
                <Button onClick={endCall} className="h-12 w-12 rounded-full bg-red-500 p-0 hover:bg-red-600">
                  <PhoneOff className="h-5 w-5 text-white" />
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
