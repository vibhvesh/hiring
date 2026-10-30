import type { HiringConfig } from '../config/types.ts'

export function speechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
}

export function pickVoice(voices: SpeechSynthesisVoice[], config: HiringConfig): SpeechSynthesisVoice | null {
  const lang = config.interview.voice.lang.toLowerCase()
  const preferred = config.interview.voice.preferredNames.map((name) => name.toLowerCase())
  const english = voices.filter((voice) => voice.lang.toLowerCase().startsWith(lang.slice(0, 2)))
  for (const name of preferred) {
    const found = english.find((voice) => voice.name.toLowerCase().includes(name))
    if (found) return found
  }
  return english[0] ?? voices[0] ?? null
}

export function unlockSpeech(): void {
  const synth = window.speechSynthesis
  if (!synth) return
  synth.resume()
  const primer = new SpeechSynthesisUtterance(' ')
  primer.volume = 0
  synth.speak(primer)
}

export function speakText(text: string, config: HiringConfig): { promise: Promise<void>; cancel: () => void } {
  const synth = window.speechSynthesis
  let settled = false
  let resolvePromise = () => {}
  const promise = new Promise<void>((resolve) => {
    resolvePromise = () => {
      if (settled) return
      settled = true
      resolve()
    }
  })
  if (!synth) {
    resolvePromise()
    return { promise, cancel() {} }
  }
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = config.interview.voice.rate
  utterance.pitch = config.interview.voice.pitch
  utterance.lang = config.interview.voice.lang
  try {
    const voice = pickVoice(synth.getVoices(), config)
    if (voice) utterance.voice = voice
  } catch {
    utterance.voice = null
  }
  utterance.onend = () => resolvePromise()
  utterance.onerror = () => resolvePromise()
  try {
    synth.cancel()
    synth.speak(utterance)
  } catch {
    resolvePromise()
  }
  return {
    promise,
    cancel() {
      synth.cancel()
      resolvePromise()
    },
  }
}

export interface ListenHandlers {
  onPartial: (text: string) => void
  onCommit: (text: string, confidence: number | null) => void
  onError: (message: string) => void
}

export function listen(config: HiringConfig, handlers: ListenHandlers): { stop: () => void } | null {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!Ctor) return null
  const recognition = new Ctor()
  recognition.continuous = true
  recognition.interimResults = true
  recognition.lang = config.interview.voice.lang
  let finalText = ''
  const confidences: number[] = []
  let timer = 0
  let stopped = false
  const commit = () => {
    window.clearTimeout(timer)
    if (stopped) return
    stopped = true
    recognition.stop()
    const known = confidences.filter((value) => value > 0)
    const confidence = known.length
      ? known.reduce((sum, value) => sum + value, 0) / known.length
      : confidences.length
        ? 0
        : null
    handlers.onCommit(finalText.trim(), confidence)
  }
  recognition.onresult = (event) => {
    let interim = ''
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index]
      const piece = result?.[0]
      if (!result || !piece) continue
      if (result.isFinal) {
        finalText = `${finalText} ${piece.transcript}`.trim()
        confidences.push(piece.confidence)
      } else interim += piece.transcript
    }
    handlers.onPartial(`${finalText} ${interim}`.trim())
    window.clearTimeout(timer)
    if (finalText) timer = window.setTimeout(commit, config.interview.silence.commitSilenceMs)
  }
  recognition.onerror = (event) => {
    if (event.error === 'aborted' || event.error === 'no-speech') return
    handlers.onError(event.error)
  }
  recognition.onend = () => {
    if (!stopped && finalText) commit()
  }
  window.setTimeout(() => {
    if (!stopped) {
      if (finalText) commit()
      else handlers.onError('no-speech')
    }
  }, config.interview.silence.maxListenMs)
  recognition.start()
  return {
    stop() {
      stopped = true
      window.clearTimeout(timer)
      recognition.abort()
    },
  }
}