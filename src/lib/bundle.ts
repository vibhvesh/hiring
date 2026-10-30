import JSZip from 'jszip'
import type { ScreenResult } from '../config/types.ts'
import { extensionForMime } from './mime.ts'

export function transcriptVtt(result: ScreenResult, botName: string): string {
  const lines = ['WEBVTT', '']
  result.transcript.forEach((turn, index) => {
    const start = formatStamp(turn.offsetMs)
    const end = formatStamp(turn.offsetMs + 2000)
    const who = turn.speaker === 'bot' ? botName : result.candidateName || 'Candidate'
    lines.push(String(index + 1), `${start} --> ${end}`, `${who}: ${turn.text}`, '')
  })
  return lines.join('\n')
}

function formatStamp(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.000`
}

export async function buildBundle(args: {
  result: ScreenResult
  pdf: Uint8Array
  video?: Blob | null
  botName: string
}): Promise<Blob> {
  const zip = new JSZip()
  zip.file('result.json', JSON.stringify({ kind: 'hiring-result', result: args.result }, null, 2))
  zip.file('report.pdf', args.pdf)
  zip.file('transcript.json', JSON.stringify(args.result.transcript, null, 2))
  zip.file('transcript.vtt', transcriptVtt(args.result, args.botName))
  if (args.video && args.video.size > 0) {
    zip.file(`recording.${extensionForMime(args.video.type || args.result.recordingMime || '')}`, args.video)
  }
  return zip.generateAsync({ type: 'blob' })
}

export async function zipNamed(files: { name: string; data: Blob | Uint8Array }[]): Promise<Blob> {
  const zip = new JSZip()
  for (const file of files) zip.file(file.name, file.data)
  return zip.generateAsync({ type: 'blob' })
}

export async function readBundle(file: File): Promise<{ result: ScreenResult; video: Blob | null; videoName: string | null }> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const resultFile = zip.file('result.json')
  if (!resultFile) throw new Error('That file does not contain a result.')
  const parsed = JSON.parse(await resultFile.async('string')) as { result?: ScreenResult }
  if (!parsed.result?.candidateId && !parsed.result?.candidateName) throw new Error('The result file is incomplete.')
  const videoEntry = Object.keys(zip.files).find((name) => name.startsWith('recording.'))
  const video = videoEntry ? await zip.file(videoEntry)?.async('blob') ?? null : null
  return { result: parsed.result, video: video ?? null, videoName: videoEntry ?? null }
}