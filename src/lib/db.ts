import { openDB, type IDBPDatabase } from 'idb'
import type { AlertRecord, Candidate, HiringConfig, RoleProfile, RubricRecord, ScreenResult } from '../config/types.ts'
import type { EngineState, InterviewSeed } from './interview.ts'

export interface DraftRecord {
  candidateId: string
  state: EngineState
  seed: InterviewSeed
  config: HiringConfig
  linkCode: string
  updatedAt: number
}

export interface VideoRecord {
  candidateId: string
  parts: Blob[]
  mime: string
  updatedAt: number
}

export interface BackupFile {
  kind: 'hiring-backup'
  exportedAt: number
  config: HiringConfig
  rubrics: RubricRecord[]
  role: RoleProfile | null
  candidates: Candidate[]
  results: ScreenResult[]
  alerts: AlertRecord[]
}

let opening: Promise<IDBPDatabase> | null = null

function database(): Promise<IDBPDatabase> {
  if (!opening) {
    opening = openDB('hiring', 1, {
      upgrade(store) {
        store.createObjectStore('meta')
        store.createObjectStore('candidates', { keyPath: 'id' })
        store.createObjectStore('results', { keyPath: 'candidateId' })
        store.createObjectStore('videos', { keyPath: 'candidateId' })
        store.createObjectStore('drafts', { keyPath: 'candidateId' })
        store.createObjectStore('alerts', { keyPath: 'id' })
        store.createObjectStore('rubrics', { keyPath: 'version' })
      },
    })
  }
  return opening
}

export function notifyUpdated(): void {
  if (typeof BroadcastChannel === 'undefined') return
  const channel = new BroadcastChannel('hiring')
  channel.postMessage({ type: 'updated' })
  channel.close()
}

export async function readMeta<T>(key: string): Promise<T | null> {
  const value = await (await database()).get('meta', key)
  return (value as T | undefined) ?? null
}

export async function writeMeta(key: string, value: unknown): Promise<void> {
  await (await database()).put('meta', value, key)
}

export async function listCandidates(): Promise<Candidate[]> {
  return (await database()).getAll('candidates') as Promise<Candidate[]>
}

export async function saveCandidate(candidate: Candidate): Promise<void> {
  await (await database()).put('candidates', candidate)
  notifyUpdated()
}

export async function saveCandidates(candidates: Candidate[]): Promise<void> {
  const store = await database()
  const tx = store.transaction('candidates', 'readwrite')
  await Promise.all(candidates.map((candidate) => tx.store.put(candidate)))
  await tx.done
  notifyUpdated()
}

export async function removeCandidate(id: string): Promise<void> {
  const store = await database()
  const tx = store.transaction(['candidates', 'results', 'videos', 'drafts', 'alerts'], 'readwrite')
  await tx.objectStore('candidates').delete(id)
  await tx.objectStore('results').delete(id)
  await tx.objectStore('videos').delete(id)
  await tx.objectStore('drafts').delete(id)
  const alerts = (await tx.objectStore('alerts').getAll()) as AlertRecord[]
  await Promise.all(
    alerts.filter((alert) => alert.candidateId === id).map((alert) => tx.objectStore('alerts').delete(alert.id)),
  )
  await tx.done
  notifyUpdated()
}

export async function readResult(id: string): Promise<ScreenResult | null> {
  const value = await (await database()).get('results', id)
  return (value as ScreenResult | undefined) ?? null
}

export async function listResults(): Promise<ScreenResult[]> {
  return (await database()).getAll('results') as Promise<ScreenResult[]>
}

export async function saveResult(result: ScreenResult): Promise<void> {
  await (await database()).put('results', result)
  notifyUpdated()
}

export async function readVideo(id: string): Promise<VideoRecord | null> {
  const value = await (await database()).get('videos', id)
  return (value as VideoRecord | undefined) ?? null
}

export async function saveVideo(record: VideoRecord): Promise<void> {
  await (await database()).put('videos', record)
}

export async function readDraft(id: string): Promise<DraftRecord | null> {
  const value = await (await database()).get('drafts', id)
  return (value as DraftRecord | undefined) ?? null
}

export async function listDrafts(): Promise<DraftRecord[]> {
  return (await database()).getAll('drafts') as Promise<DraftRecord[]>
}

export async function saveDraft(draft: DraftRecord): Promise<void> {
  await (await database()).put('drafts', draft)
}

export async function removeDraft(id: string): Promise<void> {
  await (await database()).delete('drafts', id)
}

export async function listAlerts(): Promise<AlertRecord[]> {
  return (await database()).getAll('alerts') as Promise<AlertRecord[]>
}

export async function saveAlert(alert: AlertRecord): Promise<void> {
  await (await database()).put('alerts', alert)
  notifyUpdated()
}

export async function saveAlerts(alerts: AlertRecord[]): Promise<void> {
  const store = await database()
  const tx = store.transaction('alerts', 'readwrite')
  await Promise.all(alerts.map((alert) => tx.store.put(alert)))
  await tx.done
}

export async function listRubrics(): Promise<RubricRecord[]> {
  return (await database()).getAll('rubrics') as Promise<RubricRecord[]>
}

export async function saveRubric(record: RubricRecord): Promise<void> {
  await (await database()).put('rubrics', record)
}

export async function readRubric(version: string): Promise<RubricRecord | null> {
  const value = await (await database()).get('rubrics', version)
  return (value as RubricRecord | undefined) ?? null
}

export async function replaceWorkspace(data: {
  config?: HiringConfig
  role: RoleProfile | null
  candidates: Candidate[]
  results: ScreenResult[]
  rubrics?: RubricRecord[]
}): Promise<void> {
  const store = await database()
  const tx = store.transaction(['meta', 'candidates', 'results', 'videos', 'drafts', 'alerts', 'rubrics'], 'readwrite')
  await tx.objectStore('candidates').clear()
  await tx.objectStore('results').clear()
  await tx.objectStore('videos').clear()
  await tx.objectStore('drafts').clear()
  await tx.objectStore('alerts').clear()
  if (data.config) await tx.objectStore('meta').put(data.config, 'config')
  await tx.objectStore('meta').put(data.role, 'role')
  await Promise.all(data.candidates.map((candidate) => tx.objectStore('candidates').put(candidate)))
  await Promise.all(data.results.map((result) => tx.objectStore('results').put(result)))
  if (data.rubrics) await Promise.all(data.rubrics.map((rubric) => tx.objectStore('rubrics').put(rubric)))
  await tx.done
  notifyUpdated()
}