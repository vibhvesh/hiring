import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import type { HiringConfig, RoleProfile } from '../config/types.ts'
import { fill } from './text.ts'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export interface LinkPayload {
  v: 1
  id: string
  code: string
  name: string
  email: string
  phone: string
  skills: string[]
  yearsExperience: number | null
  location: string
  cvText: string
  role: RoleProfile
  config: HiringConfig
}

export function makeCode(length: number, random: () => number = Math.random): string {
  const size = Math.max(6, length)
  let code = ''
  for (let index = 0; index < size; index += 1) {
    if (index === Math.floor(size / 2)) code += '-'
    code += ALPHABET[Math.floor(random() * ALPHABET.length)] ?? 'A'
  }
  return code
}

export function sessionConfig(config: HiringConfig, shippedCopy: Record<string, string>): HiringConfig {
  const logo = config.pdf.logoDataUrl.length > 4000 ? '' : config.pdf.logoDataUrl
  return {
    ...config,
    copy: shippedCopy,
    pdf: { ...config.pdf, logoDataUrl: logo },
  }
}

export function encodePayload(payload: LinkPayload): string {
  const slim: LinkPayload = {
    ...payload,
    cvText: payload.cvText.slice(0, 4000),
  }
  return compressToEncodedURIComponent(JSON.stringify(slim))
}

export function decodePayload(encoded: string): LinkPayload | null {
  try {
    const json = decompressFromEncodedURIComponent(encoded)
    if (!json) return null
    const parsed = JSON.parse(json) as LinkPayload
    if (parsed?.v !== 1 || typeof parsed.code !== 'string' || typeof parsed.id !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

export function splitInterviewHash(raw: string): { code: string; encoded: string | null } {
  const value = decodeURIComponent(raw).replace(/^\/+/, '')
  const [code, encoded] = value.split('~')
  return { code: code ?? '', encoded: encoded || null }
}

export function interviewHref(origin: string, path: string, code: string, encoded: string): string {
  const base = `${origin}${path}`.replace(/\/$/, '')
  return `${base}#/i/${code}~${encoded}`
}

export function shortHref(origin: string, path: string, code: string): string {
  const base = `${origin}${path}`.replace(/\/$/, '')
  return `${base}#/i/${code}`
}

export function shareText(config: HiringConfig, name: string, role: string): string {
  return fill(config.links.shareMessage, {
    name,
    role,
    minutes: Math.round(config.interview.durationLimitSeconds / 60),
  })
}

export function whatsAppUrl(text: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`
}

export function mailShareUrl(to: string, subject: string, body: string): string {
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', 'true')
    document.body.append(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  }
}

export async function qrDataUrl(text: string): Promise<string | null> {
  try {
    const QRCode = await import('qrcode')
    return await QRCode.toDataURL(text, { margin: 1, width: 240, errorCorrectionLevel: 'L' })
  } catch {
    return null
  }
}