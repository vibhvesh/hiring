import type { HiringConfig } from '../config/types.ts'
import { pickMime } from './mime.ts'

export class InterviewRecorder {
  mime = ''
  private chunks: Blob[] = []
  private recorder: MediaRecorder | null = null
  private context: AudioContext | null = null
  private preview: HTMLVideoElement | null = null
  private frame = 0
  private caption = ''

  async start(stream: MediaStream, config: HiringConfig): Promise<void> {
    const audioTracks = stream.getAudioTracks()
    let recordStream = stream
    if (config.recording.mixBotVoice && audioTracks[0] && typeof AudioContext !== 'undefined') {
      this.context = new AudioContext()
      await this.context.resume()
      const destination = this.context.createMediaStreamDestination()
      this.context.createMediaStreamSource(new MediaStream([audioTracks[0]])).connect(destination)
      const mixed = destination.stream.getAudioTracks()
      if (mixed.length) {
        recordStream = new MediaStream([...stream.getVideoTracks(), ...mixed])
      }
    }
    if (config.recording.captionOnVideo && stream.getVideoTracks().length && typeof document !== 'undefined') {
      const canvasStream = await this.startCanvas(stream, config)
      if (canvasStream) {
        recordStream = new MediaStream([
          ...canvasStream.getVideoTracks(),
          ...recordStream.getAudioTracks(),
        ])
      }
    }
    const supported = (mime: string) =>
      typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)
    this.mime = pickMime(config.recording.mimePreference, supported)
    this.recorder = this.mime
      ? new MediaRecorder(recordStream, {
          mimeType: this.mime,
          videoBitsPerSecond: config.recording.videoBitsPerSecond,
          audioBitsPerSecond: config.recording.audioBitsPerSecond,
        })
      : new MediaRecorder(recordStream)
    this.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data)
    }
    this.recorder.start(config.recording.timesliceMs)
  }

  setCaption(text: string): void {
    this.caption = text.replace(/\s+/g, ' ').slice(0, 110)
  }

  snapshot(): Blob {
    return new Blob(this.chunks, { type: this.mime || this.recorder?.mimeType || 'video/webm' })
  }

  async stop(): Promise<Blob> {
    const recorder = this.recorder
    if (recorder && recorder.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        recorder.addEventListener('stop', () => resolve(), { once: true })
        recorder.stop()
      })
    }
    cancelAnimationFrame(this.frame)
    this.preview?.pause()
    if (this.preview) this.preview.srcObject = null
    await this.context?.close().catch(() => undefined)
    return this.snapshot()
  }

  private async startCanvas(stream: MediaStream, config: HiringConfig): Promise<MediaStream | null> {
    const canvas = document.createElement('canvas')
    canvas.width = config.recording.width
    canvas.height = config.recording.height
    const preview = document.createElement('video')
    preview.srcObject = new MediaStream(stream.getVideoTracks())
    preview.muted = true
    preview.playsInline = true
    try {
      await preview.play()
    } catch {
      return null
    }
    const context = canvas.getContext('2d')
    if (!context || typeof canvas.captureStream !== 'function') return null
    const draw = () => {
      context.drawImage(preview, 0, 0, canvas.width, canvas.height)
      if (this.caption) {
        context.fillStyle = 'rgba(20, 18, 16, 0.66)'
        context.fillRect(0, canvas.height - 72, canvas.width, 72)
        context.fillStyle = '#f6f5f2'
        context.font = '20px sans-serif'
        context.fillText(this.caption, 16, canvas.height - 30)
      }
      this.frame = requestAnimationFrame(draw)
    }
    draw()
    this.preview = preview
    return canvas.captureStream(config.recording.frameRate)
  }
}

export async function openCamera(config: HiringConfig): Promise<MediaStream> {
  const video = {
    width: { ideal: config.recording.width },
    height: { ideal: config.recording.height },
    frameRate: { ideal: config.recording.frameRate },
  }
  try {
    return await navigator.mediaDevices.getUserMedia({ video, audio: true })
  } catch {
    return navigator.mediaDevices.getUserMedia({ audio: true })
  }
}