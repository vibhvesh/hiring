import { config } from './config.ts'
import type { Facts } from './extract.ts'
import { findTech } from './tech.ts'

// Optional: a small in-browser model (WebLLM) can fill facts the rules missed.
// Off by default (config.useWebLLM). The interview never waits for it.
let engine: Promise<unknown> | null = null

export function warmUpLLM() {
  if (!config.useWebLLM || !('gpu' in navigator) || engine) return
  engine = import('@mlc-ai/web-llm').then((m) => m.CreateMLCEngine('Qwen2.5-0.5B-Instruct-q4f16_1-MLC')).catch(() => null)
}

export async function llmFacts(text: string, timeoutMs = 4000): Promise<Partial<Facts> | null> {
  if (!engine) return null
  const run = (async () => {
    const e = (await engine) as { chat: { completions: { create: (x: unknown) => Promise<{ choices: { message: { content: string } }[] }> } } } | null
    if (!e) return null
    const out = await e.chat.completions.create({
      messages: [{ role: 'user', content: `From this candidate answer return JSON {"years":number|null,"role":string|null,"stack":string[]}. Answer: "${text.slice(0, 1500)}"` }],
      temperature: 0,
    })
    const j = JSON.parse(out.choices[0].message.content.match(/\{[\s\S]*\}/)?.[0] ?? 'null')
    if (!j) return null
    return { years: typeof j.years === 'number' ? j.years : null, role: typeof j.role === 'string' ? j.role : null, stack: findTech((j.stack ?? []).join(' ')) }
  })()
  return Promise.race([run, new Promise<null>((r) => setTimeout(() => r(null), timeoutMs))]).catch(() => null)
}
