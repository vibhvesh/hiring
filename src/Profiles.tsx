import { useState } from 'react'
import { difficulties } from './config.ts'
import { loadProfiles, newId, normalizeProfile, profileProblems, saveProfiles, type Profile } from './profiles.ts'
import { download } from './report.ts'
import SamplePicker from './SamplePicker.tsx'
import { findTech } from './tech.ts'

const HINT = { Easy: 'Basic questions, gentle follow-ups, lenient scoring.', Medium: 'Working-level questions, a follow-up on short answers.', Hard: 'Deeper questions, probing follow-ups, stricter scoring.', Tough: 'Deepest questions, strict follow-ups and scoring.' }
const blank = (): Profile => ({ id: newId(), role: '', tech: [], questions: ['', '', '', ''], difficulty: 'Medium' })

export default function Profiles() {
  const [list, setList] = useState(loadProfiles)
  const [edit, setEdit] = useState<Profile>(() => ({ ...list[0] }))
  const [techText, setTechText] = useState(list[0]?.tech.join(', ') ?? '')
  const [msg, setMsg] = useState('')
  const pick = (p: Profile) => { setEdit({ ...p, questions: [...p.questions] }); setTechText(p.tech.join(', ')); setMsg('') }
  const persist = (l: Profile[]) => { setList(l); saveProfiles(l) }
  const current: Profile = { ...edit, tech: techText.split(',').map((t) => t.trim()).filter(Boolean), questions: edit.questions.map((q) => q.trim()) }
  const problems = profileProblems(current)

  return (
    <main>
      <section className="card">
        <div className="row between">
          <h2>Interview profiles</h2>
          <button onClick={() => pick(blank())}>New profile</button>
        </div>
        <div className="chips">
          {list.map((p) => <button key={p.id} className={p.id === edit.id ? 'chip on' : 'chip'} onClick={() => pick(p)}>{p.role}</button>)}
        </div>
      </section>

      <section className="card">
        <label>Role name<input value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })} placeholder="e.g. Frontend Developer" /></label>
        <label>Required technologies <span className="muted small">(comma separated)</span>
          <input value={techText} onChange={(e) => setTechText(e.target.value)} placeholder="React, TypeScript, REST APIs" />
        </label>
        <SamplePicker kind="jd" label="Fill from a job description (optional)" onText={(text) => {
          const role = text.split('\n').map((l) => l.replace(/^(job title|role|position)\s*:\s*/i, '').trim()).find(Boolean) ?? ''
          setEdit((e) => ({ ...e, role: e.role || role.slice(0, 80) }))
          setTechText(findTech(text).slice(0, 8).join(', '))
        }} />
        <fieldset>
          <legend>Difficulty</legend>
          <div className="seg">
            {difficulties.map((d) => <button key={d} className={edit.difficulty === d ? 'on' : ''} onClick={() => setEdit({ ...edit, difficulty: d })}>{d}</button>)}
          </div>
          <p className="muted small">{HINT[edit.difficulty]}</p>
        </fieldset>
        <fieldset>
          <legend>Mandatory questions <span className="muted small">(at least 4, asked to everyone)</span></legend>
          {edit.questions.map((q, i) => (
            <div className="row" key={i}>
              <input className="grow" value={q} aria-label={`Question ${i + 1}`} onChange={(e) => { const qs = [...edit.questions]; qs[i] = e.target.value; setEdit({ ...edit, questions: qs }) }} />
              {edit.questions.length > 4 && <button className="quiet" aria-label="Remove question" onClick={() => setEdit({ ...edit, questions: edit.questions.filter((_, k) => k !== i) })}>×</button>}
            </div>
          ))}
          <button className="quiet" onClick={() => setEdit({ ...edit, questions: [...edit.questions, ''] })}>+ Add question</button>
        </fieldset>
        {problems.length > 0 && <p className="warn">{problems.join(' ')}</p>}
        <div className="row">
          <button className="primary" disabled={problems.length > 0} onClick={() => {
            const p = { ...current, questions: current.questions.filter(Boolean) }
            persist(list.some((x) => x.id === p.id) ? list.map((x) => (x.id === p.id ? p : x)) : [...list, p])
            setMsg('Saved.')
          }}>Save profile</button>
          {list.some((x) => x.id === edit.id) && list.length > 1 && (
            <button className="quiet" onClick={() => { if (confirm('Delete this profile?')) { const l = list.filter((x) => x.id !== edit.id); persist(l); pick(l[0]) } }}>Delete</button>
          )}
          {msg && <span className="muted">{msg}</span>}
        </div>
      </section>

      <section className="card row">
        <button onClick={() => download(new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' }), 'interview-profiles.json')}>Export profiles</button>
        <label className="filebtn">Import profiles
          <input type="file" accept=".json" onChange={async (e) => {
            const f = e.target.files?.[0]
            if (!f) return
            try {
              const raw = JSON.parse(await f.text())
              const got = (Array.isArray(raw) ? raw : [raw]).map(normalizeProfile).filter(Boolean) as Profile[]
              const merged = [...list.filter((x) => !got.some((g) => g.id === x.id)), ...got]
              persist(merged)
              setMsg(`Imported ${got.length} profile(s).`)
            } catch { setMsg("That file isn't a profiles export.") }
            e.target.value = ''
          }} />
        </label>
      </section>
    </main>
  )
}
