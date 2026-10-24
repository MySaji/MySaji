export type CameraFacing = "user" | "environment"

/** Replace only the video sender; keep the microphone and call connection alive. */
export async function replaceCallCamera(
  pc: RTCPeerConnection,
  stream: MediaStream,
  facing: CameraFacing,
  isCurrent: () => boolean,
): Promise<MediaStreamTrack | null> {
  const previous = stream.getVideoTracks()[0]
  const sender = pc.getSenders().find(item => item.track?.kind === "video")
  if (!previous || !sender) throw new Error("The camera is not ready.")
  const acquire = (mode: CameraFacing) => navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { exact: mode }, width: { ideal: 1280 }, height: { ideal: 720 } },
  })
  const enabled = previous.enabled
  let capture: MediaStream
  try {
    capture = await acquire(facing)
  } catch (cause) {
    // Some phones cannot open their second camera until the first is released.
    if (!isCurrent() || !(cause instanceof DOMException) || cause.name !== "NotReadableError") throw cause
    previous.stop()
    try { capture = await acquire(facing) }
    catch (switchError) {
      if (isCurrent()) {
        try {
          const restored = await acquire(facing === "user" ? "environment" : "user")
          const track = restored.getVideoTracks()[0]
          if (!isCurrent() || !track) restored.getTracks().forEach(item => item.stop())
          else {
            track.enabled = enabled
            try { await sender.replaceTrack(track) }
            catch { restored.getTracks().forEach(item => item.stop()); throw switchError }
            if (!isCurrent()) restored.getTracks().forEach(item => item.stop())
            else { stream.removeTrack(previous); stream.addTrack(track) }
          }
        } catch { /* The UI reports the failure and allows another attempt. */ }
      }
      throw switchError
    }
  }
  const track = capture.getVideoTracks()[0]
  if (!isCurrent() || !track) { capture.getTracks().forEach(item => item.stop()); return null }
  track.enabled = enabled
  try { await sender.replaceTrack(track) }
  catch (cause) { capture.getTracks().forEach(item => item.stop()); throw cause }
  if (!isCurrent()) { capture.getTracks().forEach(item => item.stop()); return null }
  stream.removeTrack(previous)
  stream.addTrack(track)
  previous.stop()
  return track
}
