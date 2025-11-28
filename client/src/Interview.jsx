import React, { useEffect, useRef, useState } from 'react'
import io from 'socket.io-client'

const SERVER = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000';

export default function Interview({ role, resume }) {
  const [socket, setSocket] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [log, setLog] = useState([]);
  const recognitionRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);
  const [cameraOk, setCameraOk] = useState(false);
  const [micOk, setMicOk] = useState(false);
  const [interviewFinished, setInterviewFinished] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    const s = io(SERVER, { transports: ['websocket', 'polling'] });
    setSocket(s);

    s.on('connect', () => appendLog(`Connected to server (${s.id})`));

    s.on('session_created', ({ sessionId, firstQuestion }) => {
      setSessionId(sessionId);
      setCurrentQuestion(firstQuestion);
      appendLog('Session created — first question: ' + firstQuestion.text);
      speak(firstQuestion.text);
    });

    s.on('followup', ({ followup }) => {
      if (followup && followup.text) {
        setCurrentQuestion(followup);
        appendLog('Follow-up: ' + followup.text);
        speak(followup.text);
      }
    });

    s.on('finished', ({ recommendation, session }) => {
      setInterviewFinished(true);
      setResult(recommendation);
      appendLog('Interview finished — recommendation: ' + JSON.stringify(recommendation));
      if (recommendation && recommendation.summary) {
        speak('Interview complete. Summary: ' + recommendation.summary);
      }
    });

    s.on('disconnect', () => appendLog('Socket disconnected'));

    return () => { s.disconnect(); };
  }, []);

  function appendLog(t) { setLog(l => [...l, `[${new Date().toLocaleTimeString()}] ${t}`]); }

  async function checkDevices() {
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      media.getTracks().forEach(t => t.stop());
      setCameraOk(true); setMicOk(true);
      appendLog('Camera & mic access OK');
    } catch (e) {
      appendLog('Camera/Mic permission denied: ' + (e.message || e));
      alert('Please allow camera and microphone to proceed.');
    }
  }

  function speak(text) {
    if (!('speechSynthesis' in window)) return;
    synthRef.current.cancel();
    const ut = new SpeechSynthesisUtterance(text);
    ut.rate = 1;
    ut.pitch = 1;
    synthRef.current.speak(ut);
  }

  function startSession() {
    if (!socket) return;
    socket.emit('create_session', { role, resume, durationMin: 18 });
    appendLog('Requested session creation');
  }

  function startListenAndSend() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Your browser does not support SpeechRecognition. Use Chrome for the best experience.');
      return;
    }
    const rec = new SpeechRecognition();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => appendLog('Listening started — speak now');
    rec.onresult = (ev) => {
      const transcript = ev.results[0][0].transcript;
      appendLog('Heard: ' + transcript);
      if (socket && sessionId && currentQuestion) {
        socket.emit('candidate_answer', { sessionId, questionId: currentQuestion.id, transcript });
        appendLog('Sent answer to server');
      }
    };
    rec.onerror = (e) => appendLog('Recognition error: ' + (e.error || e.message));
    rec.onend = () => appendLog('Listening ended');
    recognitionRef.current = rec;
    rec.start();
  }

  function endInterview() {
    if (socket && sessionId) {
      socket.emit('finish_interview', { sessionId });
      appendLog('Requested finish interview');
    }
  }

  return (
    <div className="card">
      <h2>Interview in progress</h2>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={checkDevices}>Check Camera & Mic</button>
        <button onClick={startSession} disabled={!cameraOk && !micOk}>Create Session & Ask First Question</button>
        <button onClick={startListenAndSend}>Start Listening (Answer)</button>
        <button onClick={endInterview}>Finish Interview</button>
      </div>

      <div className="status" style={{ marginBottom: 12 }}>
        <p>Camera: {cameraOk ? 'OK' : 'Not checked'}</p>
        <p>Microphone: {micOk ? 'OK' : 'Not checked'}</p>
      </div>

      <div className="question" style={{ marginBottom: 12 }}>
        <strong>Current Question:</strong>
        <p>{currentQuestion?.text || 'No question yet'}</p>
      </div>

      <div className="log">
        <h3>Event Log</h3>
        <div className="logBox">
          {log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      </div>

      {interviewFinished && (
        <div className="result" style={{ marginTop: 12 }}>
          <h3>Result</h3>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
