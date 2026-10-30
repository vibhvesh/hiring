import { config } from './config.ts'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Rec = any
const Ctor = (): (new () => Rec) | null => {
  const w = window as any
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}
export const canListen = () => typeof window !== 'undefined' && !!Ctor()

let voice: SpeechSynthesisVoice | null = null
function pickVoice() {
  const all = window.speechSynthesis?.getVoices() ?? []
  const en = all.filter((v) => v.lang.toLowerCase().startsWith('en'))
  for (const n of config.voiceNames) {
    const v = en.find((x) => x.name.toLowerCase().includes(n.toLowerCase()))
    if (v) return v
  }
  return en[0] ?? all[0] ?? null
}

/** Must run inside the Start tap so mobile browsers allow speech later. */
export function unlockSpeech() {
  const s = window.speechSynthesis
  if (!s) return
  s.getVoices()
  s.onvoiceschanged = () => (voice = pickVoice())
  const u = new SpeechSynthesisUtterance(' ')
  u.volume = 0
  s.speak(u)
}

export function speak(text: string, enabled = true): { done: Promise<void>; stop: () => void } {
  const s = window.speechSynthesis
  if (!enabled || !s) return { done: new Promise((r) => setTimeout(r, enabled ? 300 : 50)), stop() {} }
  let finish = () => {}
  const done = new Promise<void>((resolve) => {
    let over = false
    finish = () => { if (!over) { over = true; resolve() } }
    const u = new SpeechSynthesisUtterance(text)
    voice = voice ?? pickVoice()
    if (voice) u.voice = voice
    u.lang = voice?.lang ?? 'en-US'
    u.rate = 1.02
    u.pitch = 1.05
    u.onend = finish
    u.onerror = finish
    s.cancel()
    s.speak(u)
    // some browsers never fire onend; don't hang the interview
    setTimeout(finish, 1500 + text.split(' ').length * 450)
  })
  return { done, stop: () => { s.cancel(); finish() } }
}

export interface Listener { stop: () => void }

export const isAndroid = () => typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent)

export interface ListenOpts {
  onText: (text: string, confidence: number | null) => void
  onFail: (msg: string) => void
  onState?: (s: 'listening' | 'idle') => void
  android?: boolean
  maxRestarts?: number
  ctor?: new () => Rec
}

const FAIL_MSG = 'Voice not available – please type your answer.'

/**
 * Speech recognition with Android Chrome workarounds: continuous=false there (continuous is buggy),
 * auto-restart on end while still listening, limited retries on errors, interim text reported live.
 * Text from earlier sessions is kept so restarts don't wipe the answer.
 */
export function listen(o: ListenOpts): Listener | null {
  const C = o.ctor ?? Ctor()
  if (!C) return null
  const android = o.android ?? isAndroid()
  const max = o.maxRestarts ?? 4
  let active = true
  let kept = ''          // finals from finished sessions
  let finals = ''        // finals in current session
  let minConf: number | null = null
  let fails = 0
  let heard = false
  let r: Rec = null
  const emit = (interim: string) => o.onText((kept + finals + interim).replace(/\s+/g, ' ').trim(), minConf)
  const fail = (msg = FAIL_MSG) => { active = false; o.onState?.('idle'); o.onFail(msg) }
  const startOne = () => {
    if (!active) return
    r = new C()
    r.lang = 'en-IN'
    r.continuous = !android
    r.interimResults = true
    r.maxAlternatives = 1
    r.onresult = (e: any) => {
      heard = true
      fails = 0
      let interim = ''
      finals = ''
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i]
        if (res.isFinal) {
          finals += ' ' + res[0].transcript
          const c = res[0].confidence
          if (typeof c === 'number' && c > 0) minConf = minConf == null ? c : Math.min(minConf, c)
        } else interim += ' ' + res[0].transcript
      }
      emit(interim)
    }
    r.onerror = (e: any) => {
      const err = e?.error
      if (err === 'not-allowed' || err === 'service-not-allowed') return fail('Microphone is blocked. Please type your answer.')
      if (err !== 'no-speech' && err !== 'aborted') fails++ // network, audio-capture, etc.
      else if (!heard) fails++
    }
    r.onend = () => {
      kept += finals; finals = ''
      if (!active) return
      if (fails > max) return fail()
      setTimeout(startOne, android ? 250 : 50)
    }
    try { r.start(); o.onState?.('listening') } catch { fails++; if (fails > max) fail(); else setTimeout(startOne, 300) }
  }
  startOne()
  return { stop: () => { active = false; o.onState?.('idle'); try { r?.abort ? r.abort() : r?.stop() } catch { /* ignore */ } } }
}
