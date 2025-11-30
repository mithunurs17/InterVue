import React, { useState } from 'react'
import Interview from './Interview'

export default function App() {
  const [started, setStarted] = useState(false);
  const roles = [
    'Frontend Engineer',
    'Backend Engineer',
    'Fullstack Engineer',
    'Data Scientist',
    'Machine Learning Engineer',
    'DevOps Engineer',
    'Mobile Engineer',
    'QA Engineer',
    'Security Engineer',
    'Product Manager'
  ];
  const [role, setRole] = useState(roles[0]);
  const [resumeText, setResumeText] = useState('');
  const [initialStream, setInitialStream] = useState(null);
  const [resumeName, setResumeName] = useState('');
  const [error, setError] = useState('');

  const handleResumeUpload = (event) => {
    setError('');
    const file = event.target.files?.[0];
    if (!file) {
      setResumeName('');
      setResumeText('');
      return;
    }
    const allowed = [
      'text/plain',
      'application/json',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (!allowed.includes(file.type) && !file.name.endsWith('.txt')) {
      setError('Unsupported file. Please upload a TXT, DOC, DOCX or PDF file.');
      event.target.value = '';
      return;
    }

    setResumeName(file.name);

    const reader = new FileReader();
    reader.onload = async () => {
      const asText = typeof reader.result === 'string' ? reader.result : '';
      setResumeText(asText);
      if (!asText.trim()) {
        setError('Could not extract text from the file. Please ensure it is text-based.');
      }
    };
    reader.onerror = () => {
      setError('Failed to read the file. Try again.');
    };
    reader.readAsText(file);
  };

  return (
    <div className="container">
      <header className="hero">
        <div>
          <p className="eyebrow">AI Interview Orchestrator</p>
          <h1>InterVue — Automated Technical Interview</h1>
          <p className="subtext">
            Upload a candidate resume, specify the target role, and let the AI interviewer
            run an adaptive conversation with realtime speech + video presence.
          </p>
        </div>
      </header>
      {!started ? (
        <div className="card onboarding">
          <label className="fieldLabel">Job Role</label>
          <select value={role} onChange={e => setRole(e.target.value)}>
            {roles.map(r => <option key={r} value={r}>{r}</option>)}
          </select>

          <label className="fieldLabel">Upload candidate resume</label>
          <div className="fileInput">
            <input
              id="resume"
              type="file"
              accept=".txt,.md,.pdf,.doc,.docx,.json"
              onChange={handleResumeUpload}
            />
            <label htmlFor="resume">
              <span>{resumeName || 'Choose file'}</span>
              <small>TXT, DOC, DOCX or PDF</small>
            </label>
          </div>
          {resumeName && (
            <p className="fileMeta">
              Loaded <strong>{resumeName}</strong> ({resumeText.length.toLocaleString()} characters)
            </p>
          )}
          {error && <p className="error">{error}</p>}

          <button
            className="primary"
            onClick={async () => {
              setError('');
              if (!resumeText || error) return;
              // Prompt camera/mic permission synchronously from the user gesture
              if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                try {
                  const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                  setInitialStream(s);
                } catch (e) {
                  setError('Unable to access camera/microphone. Please allow permissions to continue.');
                  return;
                }
              }
              setStarted(true);
            }}
            disabled={!resumeText || !!error}
          >
            Launch Interview
          </button>
        </div>
      ) : (
        <Interview role={role} resume={resumeText} onRestart={() => setStarted(false)} initialStream={initialStream} />
      )}
    </div>
  )
}
