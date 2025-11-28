import React, { useCallback, useEffect, useRef, useState } from 'react'
import io from 'socket.io-client'

const SERVER = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000';

export default function Interview({ role, resume }) {
  const [socket, setSocket] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [log, setLog] = useState([]);
  const [mediaStream, setMediaStream] = useState(null);
  const [permissionsError, setPermissionsError] = useState('');
  const [interviewFinished, setInterviewFinished] = useState(false);
  const [result, setResult] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [lastTranscript, setLastTranscript] = useState('');

  const recognitionRef = useRef(null);
  const synthRef = useRef(window.speechSynthesis);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const sessionRequestedRef = useRef(false);

  useEffect(() => {
    const s = io(SERVER, { transports: ['websocket', 'polling'] });
    setSocket(s);

    s.on('connect', () => appendLog(`Connected to server (${s.id})`));

    s.on('session_created', ({ sessionId, firstQuestion }) => {
      setSessionId(sessionId);
      setSessionActive(true);
      setCurrentQuestion(firstQuestion);
      appendLog('Session created — first question: ' + firstQuestion.text);
      speakQuestion(firstQuestion.text);
    });

    s.on('followup', ({ followup }) => {
      if (followup && followup.text) {
        setCurrentQuestion(followup);
        appendLog('Follow-up: ' + followup.text);
        speakQuestion(followup.text);
      }
    });

    s.on('finished', ({ recommendation }) => {
      setInterviewFinished(true);
      setResult(recommendation);
      setSessionActive(false);
      appendLog('Interview finished — recommendation: ' + JSON.stringify(recommendation));
      if (recommendation && recommendation.summary) {
        speak('Interview complete. Summary: ' + recommendation.summary);
      }
    });

    s.on('disconnect', () => appendLog('Socket disconnected'));

    return () => {
      s.disconnect();
    };
  }, []);

  const ensureMediaAccess = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermissionsError('Your browser does not support camera access.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setPermissionsError('');
      setMediaStream(prev => {
        prev?.getTracks().forEach(track => track.stop());
        return stream;
      });
      streamRef.current = stream;
      appendLog('Camera & mic access granted — feed live for entire session');
    } catch (e) {
      const message = e?.message || 'Unable to access camera/microphone';
      setPermissionsError(message);
      appendLog('Camera/Mic permission denied: ' + message);
    }
  }, []);

  useEffect(() => {
    if (!mediaStream || !videoRef.current) return;
    videoRef.current.srcObject = mediaStream;
  }, [mediaStream]);

  // As soon as media + socket are ready and no session yet, auto-start the interview
  useEffect(() => {
    if (!socket || !mediaStream || sessionRequestedRef.current) return;
    sessionRequestedRef.current = true;
    appendLog('Auto-starting interview session as media is ready');
    startSession();
  }, [socket, mediaStream]);

  useEffect(() => {
    ensureMediaAccess();
    return () => {
      if (recognitionRef.current) recognitionRef.current.abort();
      synthRef.current?.cancel?.();
      streamRef.current?.getTracks().forEach(track => track.stop());
    };
  }, [ensureMediaAccess]);

  function appendLog(t) {
    setLog(l => [...l, `[${new Date().toLocaleTimeString()}] ${t}`]);
  }

  function speak(text, { autoListen = false } = {}) {
    if (!('speechSynthesis' in window)) return;
    synthRef.current.cancel();
    const ut = new SpeechSynthesisUtterance(text);
    ut.rate = 1;
    ut.pitch = 1;
    ut.onstart = () => setIsSpeaking(true);
    ut.onend = () => {
      setIsSpeaking(false);
      if (autoListen) {
        // small delay so the end of TTS isn't captured by STT
        setTimeout(() => {
          startListenAndSend();
        }, 400);
      }
    };
    synthRef.current.speak(ut);
  }

  function speakQuestion(text) {
    speak(text, { autoListen: true });
  }

  function startSession() {
    if (!socket) return;
    if (!mediaStream) {
      appendLog('Camera stream missing — re-requesting access');
      ensureMediaAccess();
      return;
    }
    socket.emit('create_session', { role, resume, durationMin: 18 });
    appendLog('Requested session creation');
  }

  function startListenAndSend() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Your browser does not support SpeechRecognition. Use Chrome for the best experience.');
      return;
    }
    recognitionRef.current?.abort?.();
    const rec = new SpeechRecognition();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => {
      setIsListening(true);
      appendLog('Listening started — speak now');
    };
    rec.onresult = (ev) => {
      const transcript = ev.results[0][0].transcript;
      setLastTranscript(transcript);
      appendLog('Heard: ' + transcript);
      if (socket && sessionId && currentQuestion) {
        socket.emit('candidate_answer', { sessionId, questionId: currentQuestion.id, transcript });
        appendLog('Sent answer to server');
      }
    };
    rec.onerror = (e) => {
      setIsListening(false);
      appendLog('Recognition error: ' + (e.error || e.message));
    };
    rec.onend = () => {
      setIsListening(false);
      appendLog('Listening ended');
    };
    recognitionRef.current = rec;
    rec.start();
  }

  function endInterview() {
    if (socket && sessionId) {
      socket.emit('finish_interview', { sessionId });
      appendLog('Requested finish interview');
    }
  }

  const botState = isSpeaking ? 'speaking' : isListening ? 'listening' : 'idle';
  const score = typeof result?.score === 'number' ? result.score : null;

  return (
    <div className="interviewWrap card">
      <div className="interviewHeader">
        <div>
          <p className="eyebrow">Live session</p>
          <h2>Interview cockpit</h2>
          <p className="muted">
            Camera stays on for the full run. Use the controls to drive the interviewer and capture answers.
          </p>
        </div>
        <div className={`statusPill ${sessionActive ? 'success' : 'neutral'}`}>
          {sessionActive ? 'Session active' : 'Awaiting start'}
        </div>
      </div>

      <div className="interviewGrid">
        <section className="mediaPane">
          <div className="mediaHeader">
            <h3>Candidate Camera</h3>
            <button className="ghost" onClick={ensureMediaAccess}>Reconnect feed</button>
          </div>
          <div className="videoShell">
            <video ref={videoRef} autoPlay muted playsInline className="videoFeed" />
            <span className="videoBadge">{mediaStream ? 'Camera live' : 'Awaiting permission'}</span>
          </div>
          {permissionsError && <p className="error">{permissionsError}</p>}
        </section>

        <section className="botPane">
          <div className={`botState ${botState}`}>
            <div className={`botAvatar ${botState}`}>
              <div className="botFace">
                <span className="botEyes" />
                <span className="botMouth" />
              </div>
              <span className="botGlow" />
            </div>
            <div className="botSpeech">
              <p className="eyebrow">
                {botState === 'speaking'
                  ? 'Bot speaking'
                  : botState === 'listening'
                    ? 'Bot listening'
                    : 'Standby'}
              </p>
              <h3>{currentQuestion?.text || 'Waiting for first question...'}</h3>
              <div className="botHoverHint">Hover to pulse</div>
            </div>
          </div>
          <div className="controls">
            <button onClick={startSession} className="primary" disabled={sessionActive || !mediaStream}>Create session</button>
            <button onClick={startListenAndSend} className={`secondary ${isListening ? 'active' : ''}`}>Capture answer</button>
            <button onClick={endInterview} className="ghost" disabled={!sessionActive}>Finish interview</button>
          </div>
          <div className="transcriptBox">
            <p className="eyebrow">Last transcript</p>
            <p>{lastTranscript || 'No audio captured yet.'}</p>
          </div>
        </section>
      </div>

      <section className="log">
        <div className="logHeader">
          <h3>Event Log</h3>
          <span>{log.length} entries</span>
        </div>
        <div className="logBox">
          {log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      </section>

      {interviewFinished && result && (
        <section className="result">
          <div className="resultHeader">
            <div className="resultTitle">
              <p className="eyebrow">Interview summary</p>
              <h3>{result.recommendation || 'Recommendation'}</h3>
            </div>
            {score !== null && (
              <div className="scoreBadge">
                <span className="scoreValue">{score}</span>
                <span className="scoreLabel">/ 100</span>
              </div>
            )}
          </div>
          {result.summary && <p className="muted">{result.summary}</p>}
          <div className="resultGrid">
            {Array.isArray(result.strengths) && result.strengths.length > 0 && (
              <div>
                <p className="eyebrow">Strengths</p>
                <ul>
                  {result.strengths.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
            {Array.isArray(result.weaknesses) && result.weaknesses.length > 0 && (
              <div>
                <p className="eyebrow">Opportunities</p>
                <ul>
                  {result.weaknesses.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
