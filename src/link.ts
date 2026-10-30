import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import { normalizeProfile, type Profile } from './profiles.ts'

export interface Invite {
  id: string
  profile: Profile
}

export function encodeInvite(inv: Invite): string {
  const p = inv.profile
  return compressToEncodedURIComponent(JSON.stringify({ v: 1, i: inv.id, r: p.role, t: p.tech, q: p.questions, d: p.difficulty, p: p.id }))
}

export function decodeInvite(code: string): Invite | null {
  try {
    const o = JSON.parse(decompressFromEncodedURIComponent(code) ?? '')
    if (!o || o.v !== 1 || typeof o.i !== 'string') return null
    const profile = normalizeProfile({ id: o.p, role: o.r, tech: o.t, questions: o.q, difficulty: o.d })
    return profile ? { id: o.i.slice(0, 40), profile } : null
  } catch {
    return null
  }
}

export function inviteUrl(base: string, inv: Invite): string {
  return `${base.split('#')[0]}#/i/${encodeInvite(inv)}`
}
