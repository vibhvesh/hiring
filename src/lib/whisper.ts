export async function transcribeBlob(blob: Blob, model: string, onStatus: (text: string) => void): Promise<string> {
  onStatus('Loading offline transcription…')
  const transformers = await import('@huggingface/transformers')
  const asr = await transformers.pipeline('automatic-speech-recognition', model, {
    dtype: 'q8',
  })
  onStatus('Transcribing…')
  const url = URL.createObjectURL(blob)
  try {
    const output = await asr(url)
    if (typeof output === 'string') return output
    if (output && typeof output === 'object' && 'text' in output) return String(output.text ?? '')
    return ''
  } finally {
    URL.revokeObjectURL(url)
  }
}