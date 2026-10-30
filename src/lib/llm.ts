import type { HiringConfig } from '../config/types.ts'
import { acceptLlmLine } from './interview.ts'
import { fill } from './text.ts'

export type ModelStatus = 'idle' | 'loading' | 'ready' | 'unavailable'

let status: ModelStatus = 'idle'
let engine: {
  chat: {
    completions: {
      create: (body: {
        messages: { role: 'system' | 'user'; content: string }[]
        temperature: number
        max_tokens: number
      }) => Promise<{ choices?: { message?: { content?: string | null } }[] }>
    }
  }
} | null = null

export function modelStatus(): ModelStatus {
  return status
}

export async function prepareModel(config: HiringConfig, onProgress?: (text: string) => void): Promise<ModelStatus> {
  if (!config.llm.enabled || !config.llm.autoStart) return status
  if (typeof localStorage !== 'undefined' && localStorage.getItem('hiring-disable-llm') === '1') {
    status = 'unavailable'
    return status
  }
  if (engine) return 'ready'
  if (status === 'loading') return status
  status = 'loading'
  try {
    const webllm = await import('@mlc-ai/web-llm')
    const progress = (report: { text?: string }) => onProgress?.(report.text ?? 'Loading the on-device model…')
    try {
      engine = (await webllm.CreateMLCEngine(config.llm.modelId, { initProgressCallback: progress })) as NonNullable<typeof engine>
    } catch {
      engine = (await webllm.CreateMLCEngine(config.llm.fallbackModelId, { initProgressCallback: progress })) as NonNullable<typeof engine>
    }
    status = 'ready'
  } catch {
    engine = null
    status = 'unavailable'
  }
  return status
}

export async function rephraseLine(args: {
  scripted: string
  config: HiringConfig
  phase: string
  secondsLeft: number
  bot: string
  company: string
}): Promise<string | null> {
  if (!engine) return null
  const prompt = fill(args.config.persona.systemPrompt, {
    bot: args.bot,
    company: args.company,
    phase: args.phase,
    seconds: Math.max(0, Math.round(args.secondsLeft)),
    scripted: args.scripted,
  })
  try {
    const response = await Promise.race([
      engine.chat.completions.create({
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: 'Say the next line.' },
        ],
        temperature: args.config.llm.temperature,
        max_tokens: args.config.llm.maxTokens,
      }),
      new Promise<null>((resolve) => {
        window.setTimeout(() => resolve(null), args.config.llm.timeoutMs)
      }),
    ])
    if (!response) return null
    const text = response.choices?.[0]?.message?.content ?? ''
    return acceptLlmLine(args.scripted, text) ? text.trim() : null
  } catch {
    return null
  }
}