import type { HiringConfig } from '../config/types.ts'
import { fill } from './text.ts'

export interface ReadyNotice {
  name: string
  role: string
  score: number
  recommendation: string
  summary: string
  transcript?: unknown
}

export async function sendReadyNotices(config: HiringConfig, notice: ReadyNotice): Promise<string[]> {
  const notes: string[] = []
  const vars = {
    name: notice.name,
    role: notice.role,
    score: notice.score,
    recommendation: notice.recommendation,
  }
  if (config.notifications.webhookUrl.trim()) {
    try {
      const response = await fetch(config.notifications.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...notice,
          transcript: config.notifications.webhookIncludeTranscript ? notice.transcript : undefined,
        }),
      })
      notes.push(response.ok ? 'webhook-sent' : 'webhook-failed')
    } catch {
      notes.push('webhook-failed')
    }
  }
  const email = config.notifications.emailjs
  if (email.enabled && email.publicKey && email.serviceId && email.templateId) {
    try {
      const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          service_id: email.serviceId,
          template_id: email.templateId,
          user_id: email.publicKey,
          template_params: {
            subject: fill(config.notifications.emailSubject, vars),
            message: fill(config.notifications.emailBody, vars),
            name: notice.name,
            score: String(notice.score),
            recommendation: notice.recommendation,
          },
        }),
      })
      notes.push(response.ok ? 'email-sent' : 'email-failed')
    } catch {
      notes.push('email-failed')
    }
  }
  return notes
}