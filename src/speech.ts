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

/** Continuous recognition. Calls onText with the full answer so far plus lowest confidence seen. */
export function listen(onText: (text: string, confidence: number | null) => void, onFail: (msg: string) => void): Listener | null {
  const C = Ctor()
  if (!C) return null
  let active = true
  let finals = ''
  let minConf: number | null = null
  const r: Rec = new C()
  r.lang = 'en-IN'
  r.continuous = true
  r.interimResults = true
  r.onresult = (e: any) => {
    let interim = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i]
      if (res.isFinal) {
        finals += ' ' + res[0].transcript
        const c = res[0].confidence
        if (typeof c === 'number' && c > 0) minConf = minConf == null ? c : Math.min(minConf, c)
      } else interim += ' ' + res[0].transcript
    }
    onText((finals + interim).trim(), minConf)
  }
  r.onerror = (e: any) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { active = false; onFail('Microphone is blocked. Please type your answers instead.') }
  }
  r.onend = () => { if (active) try { r.start() } catch { /* already started */ } }
  try { r.start() } catch { return null }
  return { stop: () => { active = false; try { r.stop() } catch { /* ignore */ } } }
}
