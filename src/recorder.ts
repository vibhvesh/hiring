export interface Recording { stream: MediaStream | null; stop: () => Promise<Blob | null>; hasVideo: boolean }

const TYPES = ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4', 'audio/webm', 'audio/mp4']

/** Ask for camera + mic; fall back to mic only; fall back to nothing. Never throws. */
export async function startRecording(): Promise<Recording> {
  let stream: MediaStream | null = null
  for (const c of [{ video: { width: 640, height: 480, facingMode: 'user' }, audio: true }, { audio: true }]) {
    try { stream = await navigator.mediaDevices.getUserMedia(c); break } catch { /* try next */ }
  }
  if (!stream || typeof MediaRecorder === 'undefined') return { stream, hasVideo: false, stop: async () => null }
  const hasVideo = stream.getVideoTracks().length > 0
  const mimeType = TYPES.filter((t) => hasVideo || t.startsWith('audio')).find((t) => MediaRecorder.isTypeSupported(t))
  const chunks: Blob[] = []
  let rec: MediaRecorder
  try { rec = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 500_000 } : undefined) } catch { return { stream, hasVideo, stop: async () => null } }
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  rec.start(1000)
  return {
    stream,
    hasVideo,
    stop: () =>
      new Promise((resolve) => {
        const done = () => { stream!.getTracks().forEach((t) => t.stop()); resolve(chunks.length ? new Blob(chunks, { type: rec.mimeType || mimeType || 'video/webm' }) : null) }
        if (rec.state === 'inactive') return done()
        rec.onstop = done
        rec.stop()
      }),
  }
}
