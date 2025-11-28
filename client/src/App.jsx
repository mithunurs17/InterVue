import React, { useState } from 'react'
import Interview from './Interview'

export default function App() {
  const [started, setStarted] = useState(false);
  const [role, setRole] = useState('Frontend Engineer');
  const [resume, setResume] = useState('');

  return (
    <div className="container">
      <h1>InterVue — Automated Technical Interview</h1>
      {!started ? (
        <div className="card">
          <label>Job Role</label>
          <input value={role} onChange={e => setRole(e.target.value)} />
          <label>Paste candidate resume (text)</label>
          <textarea value={resume} onChange={e => setResume(e.target.value)} placeholder="Paste resume here" />
          <button className="primary" onClick={() => setStarted(true)}>Start Interview</button>
        </div>
      ) : (
        <Interview role={role} resume={resume} />
      )}
    </div>
  )
}
