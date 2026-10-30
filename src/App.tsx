import { useEffect, useState } from 'react'
import Candidate from './Candidate.tsx'
import Profiles from './Profiles.tsx'
import Recruiter from './Recruiter.tsx'

const route = () => location.hash.replace(/^#\/?/, '')

export default function App() {
  const [r, setR] = useState(route())
  useEffect(() => {
    const on = () => setR(route())
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  if (r.startsWith('i/')) return <Candidate code={r.slice(2)} />
  return (
    <div className="page">
      <header className="top">
        <a href="#/" className="brand">Hiring</a>
        <nav>
          <a href="#/" className={r === '' ? 'on' : ''}>Links & candidates</a>
          <a href="#/profiles" className={r === 'profiles' ? 'on' : ''}>Interview profiles</a>
        </nav>
      </header>
      {r === 'profiles' ? <Profiles /> : <Recruiter />}
    </div>
  )
}
