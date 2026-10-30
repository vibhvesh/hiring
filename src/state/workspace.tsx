import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { applyConfig } from '../config/apply.ts'
import { SHIPPED } from '../config/shipped.ts'
import type { AlertRecord, Candidate, HiringConfig, RoleProfile, RubricRecord, ScreenResult } from '../config/types.ts'
import { scoreCv, extractFields, parseDocument } from '../lib/cv.ts'
import {
  listAlerts,
  listCandidates,
  listDrafts,
  listRubrics,
  readMeta,
  readResult,
  readVideo,
  removeCandidate,
  removeDraft,
  replaceWorkspace,
  saveAlert,
  saveCandidate,
  saveResult,
  saveRubric,
  writeMeta,
  type VideoRecord,
} from '../lib/db.ts'
import { evaluateScreen } from '../lib/evaluate.ts'
import { forceClose } from '../lib/interview.ts'
import { makeCode } from '../lib/link.ts'
import { buildExample } from '../lib/samples.ts'
import { abandonCutoff, expiredIds } from '../lib/retention.ts'
import { nextConfigVersion } from '../lib/text.ts'

interface WorkspaceValue {
  ready: boolean
  config: HiringConfig
  role: RoleProfile | null
  candidates: Candidate[]
  alerts: AlertRecord[]
  rubrics: RubricRecord[]
  warnings: string[]
  refresh: () => Promise<void>
  saveRole: (role: RoleProfile) => Promise<void>
  saveConfig: (next: HiringConfig) => Promise<HiringConfig>
  resetConfig: () => Promise<void>
  addFiles: (files: File[]) => Promise<string[]>
  deleteCandidates: (ids: string[]) => Promise<void>
  loadExample: () => Promise<void>
  purgeNow: () => Promise<number>
  dismissAlert: (id: string) => Promise<void>
  markInvited: (id: string) => Promise<void>
  getResult: (id: string) => Promise<ScreenResult | null>
  getVideo: (id: string) => Promise<VideoRecord | null>
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [config, setConfig] = useState<HiringConfig>(SHIPPED)
  const [role, setRole] = useState<RoleProfile | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [alerts, setAlerts] = useState<AlertRecord[]>([])
  const [rubrics, setRubrics] = useState<RubricRecord[]>([])
  const [warnings, setWarnings] = useState<string[]>([])

  const refresh = useCallback(async () => {
    const storedConfig = await readMeta<HiringConfig>('config')
    const applied = applyConfig(storedConfig ?? SHIPPED)
    let active = applied.config
    if (!storedConfig) {
      await writeMeta('config', SHIPPED)
      await saveRubric({ version: SHIPPED.version, savedAt: Date.now(), config: SHIPPED })
      active = SHIPPED
    } else if (applied.warnings.length) {
      await writeMeta('config', active)
    }
    if (active.privacy.autoPurge) {
      const existing = await listCandidates()
      const stale = expiredIds(existing, Date.now(), active.privacy.retentionDays)
      for (const id of stale) await removeCandidate(id)
    }
    const drafts = await listDrafts()
    const cutoff = abandonCutoff(Date.now(), active.privacy.abandonMinutes)
    for (const draft of drafts) {
      if (draft.updatedAt >= cutoff) continue
      const closed = forceClose(draft.state, draft.updatedAt, draft.config, draft.seed.candidateName, 'left')
      const result = evaluateScreen({
        config: draft.config,
        seed: draft.seed,
        state: closed.state,
        endedAt: draft.updatedAt,
      })
      result.candidateId = draft.candidateId
      await saveResult(result)
      const people = await listCandidates()
      const person = people.find((item) => item.id === draft.candidateId)
      if (person) {
        person.status = 'partial'
        person.partial = true
        person.interviewScore = result.total
        person.stars = result.stars
        person.recommendationKey = result.recommendationKey
        person.recommendationLabel = result.recommendationLabel
        person.needsReview = result.lowConfidenceCount > 0
        person.rubricVersion = result.rubricVersion
        person.updatedAt = draft.updatedAt
        await saveCandidate(person)
      }
      await removeDraft(draft.candidateId)
    }
    const [people, notes, history, storedRole] = await Promise.all([
      listCandidates(),
      listAlerts(),
      listRubrics(),
      readMeta<RoleProfile | null>('role'),
    ])
    setConfig(active)
    setWarnings(applied.warnings)
    setRole(storedRole)
    setCandidates(people.sort((a, b) => b.updatedAt - a.updatedAt))
    setAlerts(notes.filter((alert) => !alert.read).sort((a, b) => b.createdAt - a.createdAt))
    setRubrics(history.sort((a, b) => b.savedAt - a.savedAt))
    setReady(true)
  }, [])

  useEffect(() => {
    void refresh()
    const channel = new BroadcastChannel('hiring')
    channel.onmessage = () => {
      void refresh()
    }
    return () => channel.close()
  }, [refresh])

  const saveRole = useCallback(async (next: RoleProfile) => {
    await writeMeta('role', next)
    setRole(next)
  }, [])

  const saveConfig = useCallback(
    async (next: HiringConfig) => {
      const applied = applyConfig(next)
      const versioned = nextConfigVersion(config, applied.config)
      await saveRubric({ version: config.version, savedAt: Date.now(), config })
      await saveRubric({ version: versioned.version, savedAt: Date.now(), config: versioned })
      await writeMeta('config', versioned)
      setConfig(versioned)
      setWarnings(applied.warnings)
      setRubrics(await listRubrics())
      return versioned
    },
    [config],
  )

  const resetConfig = useCallback(async () => {
    await writeMeta('config', SHIPPED)
    await saveRubric({ version: SHIPPED.version, savedAt: Date.now(), config: SHIPPED })
    setConfig(SHIPPED)
    setWarnings([])
  }, [])

  const addFiles = useCallback(
    async (files: File[]) => {
      if (!role) return ['Save the role before adding CVs.']
      const failures: string[] = []
      for (const file of files) {
        try {
          const parsed = await parseDocument(file.name, await file.arrayBuffer(), role.requiredSkills)
          const scored = scoreCv(
            { ...parsed, skills: parsed.skills.length ? parsed.skills : extractFields(parsed.rawText, file.name, role.requiredSkills).skills },
            role,
            config,
          )
          const candidate: Candidate = {
            id: crypto.randomUUID(),
            linkCode: makeCode(config.links.codeLength),
            name: parsed.name || 'Candidate',
            email: parsed.email,
            phone: parsed.phone,
            fileName: file.name,
            cvText: parsed.rawText,
            skills: parsed.skills,
            yearsExperience: parsed.yearsExperience,
            location: parsed.location,
            currentCtc: parsed.currentCtc,
            education: parsed.education,
            cvScore: scored.total,
            cvShortlisted: scored.shortlisted,
            cvNotes: scored.notes,
            matchedSkills: scored.matchedSkills,
            missingSkills: scored.missingSkills,
            tailoredQuestions: [],
            roleSnapshot: role,
            status: 'new',
            interviewScore: null,
            stars: null,
            recommendationKey: null,
            recommendationLabel: null,
            partial: false,
            needsReview: false,
            hasVideo: false,
            rubricVersion: config.version,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }
          await saveCandidate(candidate)
        } catch {
          failures.push(file.name)
        }
      }
      await refresh()
      return failures
    },
    [config, refresh, role],
  )

  const deleteCandidates = useCallback(
    async (ids: string[]) => {
      for (const id of ids) await removeCandidate(id)
      await refresh()
    },
    [refresh],
  )

  const loadExample = useCallback(async () => {
    const example = buildExample(config)
    await saveRubric({ version: config.version, savedAt: Date.now(), config })
    await replaceWorkspace({ config, role: example.role, candidates: example.candidates, results: example.results })
    await refresh()
  }, [config, refresh])

  const purgeNow = useCallback(async () => {
    const stale = expiredIds(candidates, Date.now(), config.privacy.retentionDays)
    for (const id of stale) await removeCandidate(id)
    await refresh()
    return stale.length
  }, [candidates, config.privacy.retentionDays, refresh])

  const dismissAlert = useCallback(async (id: string) => {
    const current = alerts.find((alert) => alert.id === id)
    if (!current) return
    await saveAlert({ ...current, read: true })
    setAlerts((list) => list.filter((alert) => alert.id !== id))
  }, [alerts])

  const markInvited = useCallback(async (id: string) => {
    const person = candidates.find((item) => item.id === id)
    if (!person || person.status === 'complete' || person.status === 'partial') return
    await saveCandidate({ ...person, status: 'invited', updatedAt: Date.now() })
    await refresh()
  }, [candidates, refresh])

  const value = useMemo<WorkspaceValue>(
    () => ({
      ready,
      config,
      role,
      candidates,
      alerts,
      rubrics,
      warnings,
      refresh,
      saveRole,
      saveConfig,
      resetConfig,
      addFiles,
      deleteCandidates,
      loadExample,
      purgeNow,
      dismissAlert,
      markInvited,
      getResult: readResult,
      getVideo: readVideo,
    }),
    [
      ready,
      config,
      role,
      candidates,
      alerts,
      rubrics,
      warnings,
      refresh,
      saveRole,
      saveConfig,
      resetConfig,
      addFiles,
      deleteCandidates,
      loadExample,
      purgeNow,
      dismissAlert,
      markInvited,
    ],
  )

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace(): WorkspaceValue {
  const value = useContext(WorkspaceContext)
  if (!value) throw new Error('Workspace missing')
  return value
}