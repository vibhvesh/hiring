import { describe, expect, it, vi } from 'vitest'
import { listen } from './speech.ts'

const made: any[] = []
class Fake {
  continuous = true; interimResults = false; lang = ''
  onresult: any; onerror: any; onend: any
  constructor() { made.push(this) }
  start() {}
  stop() { this.onend?.() }
  abort() { this.onend?.() }
}
const res = (t: string, isFinal: boolean) => Object.assign([{ transcript: t, confidence: 0.9 }], { isFinal })

describe('listen (Android mode)', () => {
  it('uses continuous=false, shows interim text, keeps text across restarts', () => {
    vi.useFakeTimers(); made.length = 0
    const texts: string[] = []
    const l = listen({ ctor: Fake as any, android: true, onText: (t) => texts.push(t), onFail: () => {} })!
    expect(made[0].continuous).toBe(false)
    expect(made[0].interimResults).toBe(true)
    made[0].onresult({ results: [res('hello', false)] })
    expect(texts.at(-1)).toBe('hello')
    made[0].onresult({ results: [res('hello world', true)] })
    made[0].onend()
    vi.advanceTimersByTime(300)
    expect(made.length).toBe(2)
    made[1].onresult({ results: [res('again', false)] })
    expect(texts.at(-1)).toBe('hello world again')
    l.stop()
    vi.advanceTimersByTime(1000)
    expect(made.length).toBe(2)
  })
  it('gives up after limited errors and reports', () => {
    vi.useFakeTimers(); made.length = 0
    const fail = vi.fn()
    listen({ ctor: Fake as any, android: true, maxRestarts: 2, onText: () => {}, onFail: fail })
    for (let i = 0; i < 10 && !fail.mock.calls.length; i++) { const r = made.at(-1); r.onerror({ error: 'network' }); r.onend(); vi.advanceTimersByTime(300) }
    expect(fail).toHaveBeenCalledOnce()
    expect(made.length).toBe(3)
  })
  it('stops immediately when mic not allowed', () => {
    vi.useFakeTimers(); made.length = 0
    const fail = vi.fn()
    listen({ ctor: Fake as any, android: true, onText: () => {}, onFail: fail })
    made[0].onerror({ error: 'not-allowed' }); made[0].onend(); vi.advanceTimersByTime(1000)
    expect(fail.mock.calls[0][0]).toMatch(/blocked/)
    expect(made.length).toBe(1)
  })
})
