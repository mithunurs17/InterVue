import React, { useCallback, useEffect, useRef, useState } from 'react'
import io from 'socket.io-client'

// Resolve server URL robustly at runtime:
// 1. Prefer `VITE_SERVER_URL` (build-time env)
// 2. Fallback to same hostname as the client but port 4000 (useful in Codespaces / forwarded ports)
// 3. Finally fallback to localhost:4000
function resolveServerUrl() {
  const env = import.meta.env.VITE_SERVER_URL;
  if (env) return env;
  if (typeof window !== 'undefined' && window.location) {
    try {
      const proto = window.location.protocol;
      const host = window.location.hostname;
      // prefer explicit port 4000 on same host
      return `${proto}//${host}:4000`;
    } catch (e) {
      // ignore
    }
  }
  return 'http://localhost:4000';
}

const SERVER = resolveServerUrl();
console.info('InterVue: connecting to server at', SERVER);

// Role-based fallback questions used when server/socket is unreachable.
const ROLE_QUESTIONS = {
  'Frontend Engineer': [
    { id: 'f1', text: 'Tell me about a recent frontend project you built. What were the main challenges?' },
    { id: 'f2', text: 'How do you optimize web performance? Provide concrete techniques you used.' },
    { id: 'f3', text: 'Describe how you approach component design and state management.' },
    { id: 'f4', text: 'How do you ensure accessibility in your apps?' },
    { id: 'f5', text: 'Explain a time you refactored a large component tree. What was your strategy?' },
    { id: 'f6', text: 'What bundling or build-time optimizations have you applied?' },
    { id: 'f7', text: 'How do you debug tricky layout or CSS issues?' },
    { id: 'f8', text: 'Describe how you write and maintain UI tests.' },
    { id: 'f9', text: 'How do you collaborate with designers and product teams?' },
    { id: 'f10', text: 'Talk about a time you improved perceived performance for users.' },
    { id: 'f11', text: 'What are your go-to patterns for state synchronization with a backend?' },
    { id: 'f12', text: 'How do you keep up with frontend architecture and tooling changes?' }
  ],
  'Backend Engineer': [
    { id: 'b1', text: 'Describe a backend system you designed for scale. What tradeoffs did you make?' },
    { id: 'b2', text: 'How do you ensure data integrity across distributed services?' },
    { id: 'b3', text: 'Explain how you would debug a performance hotspot in an API.' },
    { id: 'b4', text: 'How do you approach schema design for changing requirements?' },
    { id: 'b5', text: 'Describe your caching strategy and invalidation approach.' },
    { id: 'b6', text: 'What monitoring and alerting do you rely on for backend services?' },
    { id: 'b7', text: 'How do you design APIs for backward compatibility?' },
    { id: 'b8', text: 'Explain a complex database migration you executed.' },
    { id: 'b9', text: 'How do you test and validate durability guarantees?' },
    { id: 'b10', text: 'Describe a time you reduced latency in a critical path.' },
    { id: 'b11', text: 'What techniques do you use for secure authentication and authorization?' },
    { id: 'b12', text: 'How do you reason about cost and operational overhead?' }
  ],
  'Fullstack Engineer': [
    { id: 'fs1', text: 'Describe a full-stack feature you delivered end-to-end.' },
    { id: 'fs2', text: 'How do you coordinate API design with frontend UX?' },
    { id: 'fs3', text: 'Which testing strategies do you rely on across the stack?' },
    { id: 'fs4', text: 'How do you decide where logic belongs: client or server?' },
    { id: 'fs5', text: 'Describe a time you optimized end-to-end performance.' },
    { id: 'fs6', text: 'How do you manage deployments and rollbacks for fullstack changes?' },
    { id: 'fs7', text: 'How do you design for offline-first or flaky networks?' },
    { id: 'fs8', text: 'Explain a CI/CD pipeline you built for full-stack delivery.' },
    { id: 'fs9', text: 'How do you handle schema evolution and teams coordination?' },
    { id: 'fs10', text: 'Talk about observability coverage you rely on across the stack.' },
    { id: 'fs11', text: 'What security considerations do you build into full-stack features?' },
    { id: 'fs12', text: 'How do you split and manage technical debt across frontend/backend?' }
  ],
  'Data Scientist': [
    { id: 'd1', text: 'Walk me through a data project where you moved from raw data to business impact.' },
    { id: 'd2', text: 'How do you validate model performance and guard against data leakage?' },
    { id: 'd3', text: 'Describe a time you improved model interpretability.' },
    { id: 'd4', text: 'How do you handle feature engineering at scale?' },
    { id: 'd5', text: 'Explain a time your model failed in production and how you responded.' },
    { id: 'd6', text: 'How do you measure attribution and uplift?' },
    { id: 'd7', text: 'Describe your approach to data quality and validation.' },
    { id: 'd8', text: 'How do you balance performance with model explainability?' },
    { id: 'd9', text: 'What tooling and pipelines do you use for reproducible experiments?' },
    { id: 'd10', text: 'How do you collaborate with engineers to productionize models?' },
    { id: 'd11', text: 'Describe a creative feature you engineered that improved results.' },
    { id: 'd12', text: 'How do you incorporate business metrics into model objectives?' }
  ],
  'Machine Learning Engineer': [
    { id: 'm1', text: 'Describe how you productionize a machine learning model.' },
    { id: 'm2', text: 'What monitoring would you add for a deployed model?' },
    { id: 'm3', text: 'Explain a technical challenge you faced implementing an ML pipeline.' },
    { id: 'm4', text: 'How do you manage model versioning and rollbacks?' },
    { id: 'm5', text: 'Describe your approach to feature stores and online features.' },
    { id: 'm6', text: 'How do you handle inference latency and scaling?' },
    { id: 'm7', text: 'Explain batching vs streaming inference tradeoffs.' },
    { id: 'm8', text: 'How do you test model correctness end-to-end?' },
    { id: 'm9', text: 'Describe model security considerations (data leakage, info exposure).' },
    { id: 'm10', text: 'How do you automate retraining and drift detection?' },
    { id: 'm11', text: 'Talk about a production incident and your remediation.' },
    { id: 'm12', text: 'How do you ensure reproducibility and experiment tracking?' }
  ],
  'DevOps Engineer': [
    { id: 'dv1', text: 'How do you design CI/CD for safety and speed?' },
    { id: 'dv2', text: 'Explain a time you improved system reliability.' },
    { id: 'dv3', text: 'Which observability signals do you prioritize and why?' },
    { id: 'dv4', text: 'How do you design capacity planning and autoscaling?' },
    { id: 'dv5', text: 'Describe a major incident you handled and the postmortem.' },
    { id: 'dv6', text: 'How do you approach secrets management and rotation?' },
    { id: 'dv7', text: 'What are your deployment strategies for zero-downtime?' },
    { id: 'dv8', text: 'Explain infrastructure-as-code practices you follow.' },
    { id: 'dv9', text: 'How do you secure the CI/CD pipeline?' },
    { id: 'dv10', text: 'What SLAs and SLOs would you set for a critical service?' },
    { id: 'dv11', text: 'How do you test disaster recovery plans?' },
    { id: 'dv12', text: 'Describe how you reduce mean time to recovery (MTTR).' }
  ],
  'Mobile Engineer': [
    { id: 'mm1', text: 'Describe mobile architecture choices you made for performance.' },
    { id: 'mm2', text: 'How do you test on devices and across OS versions?' },
    { id: 'mm3', text: 'Explain a tricky memory or layout bug you solved.' },
    { id: 'mm4', text: 'How do you manage app size and startup time?' },
    { id: 'mm5', text: 'Describe offline and sync strategies you implemented.' },
    { id: 'mm6', text: 'How do you approach cross-platform tradeoffs?' },
    { id: 'mm7', text: 'What tooling do you use for profiling and diagnostics?' },
    { id: 'mm8', text: 'Explain a challenging UX constraint you solved for mobile.' },
    { id: 'mm9', text: 'How do you handle long-running background work?' },
    { id: 'mm10', text: 'How do you secure sensitive data on-device?' },
    { id: 'mm11', text: 'Describe your testing matrix for versions and devices.' },
    { id: 'mm12', text: 'How do you monitor crashes and prioritize fixes?' }
  ],
  'QA Engineer': [
    { id: 'q1', text: 'Describe an automation test you built and its impact.' },
    { id: 'q2', text: 'How do you approach testing for flaky distributed systems?' },
    { id: 'q3', text: 'What is your approach to balancing manual and automated testing?' },
    { id: 'q4', text: 'How do you design test data and environments?' },
    { id: 'q5', text: 'Explain how you measure testing effectiveness.' },
    { id: 'q6', text: 'How do you integrate tests into CI without blocking delivery?' },
    { id: 'q7', text: 'Describe a time you reduced escaped defects.' },
    { id: 'q8', text: 'How do you approach exploratory testing and bug hunts?' },
    { id: 'q9', text: 'What tooling do you use for observability of tests?' },
    { id: 'q10', text: 'How do you coach engineers to write testable code?' },
    { id: 'q11', text: 'How do you prioritize test coverage vs development speed?' },
    { id: 'q12', text: 'Describe a testing strategy for an API-first product.' }
  ],
  'Security Engineer': [
    { id: 's1', text: 'Describe a security incident you handled and how you mitigated it.' },
    { id: 's2', text: 'What secure coding practices do you enforce in a team?' },
    { id: 's3', text: 'How would you approach threat modeling for a new service?' },
    { id: 's4', text: 'How do you prioritize vulnerabilities and remediation?' },
    { id: 's5', text: 'Describe how you handle secrets and key rotation.' },
    { id: 's6', text: 'What are common misconfigurations you watch for in cloud environments?' },
    { id: 's7', text: 'How do you run red-team or adversarial testing?' },
    { id: 's8', text: 'Explain a time you improved incident detection.' },
    { id: 's9', text: 'How do you secure CI/CD and artifact pipelines?' },
    { id: 's10', text: 'What threat intel sources do you integrate into work?' },
    { id: 's11', text: 'How do you measure security program effectiveness?' },
    { id: 's12', text: 'Describe your approach to privacy and data protection.' }
  ],
  'Product Manager': [
    { id: 'p1', text: 'How do you prioritize features when resources are limited?' },
    { id: 'p2', text: 'Describe a time you turned ambiguous requirements into clear milestones.' },
    { id: 'p3', text: 'How do you measure product success after launch?' },
    { id: 'p4', text: 'How do you collect and synthesize user feedback?' },
    { id: 'p5', text: 'Describe a tradeoff you made between speed and polish.' },
    { id: 'p6', text: 'How do you align stakeholders across teams?' },
    { id: 'p7', text: 'Explain a product experiment you ran and the outcome.' },
    { id: 'p8', text: 'How do you use metrics to influence roadmap decisions?' },
    { id: 'p9', text: 'Describe how you onboard new users to a product feature.' },
    { id: 'p10', text: 'How do you think about pricing and monetization?' },
    { id: 'p11', text: 'How do you handle competing customer segments?' },
    { id: 'p12', text: 'Describe your approach to technical debt vs feature investment.' }
  ]
};

const ROLE_KEYWORDS = {
  'Frontend Engineer': ['react','vue','angular','javascript','css','html','accessibility','performance','webpack','vite'],
  'Backend Engineer': ['api','database','sql','nosql','caching','latency','scalability','node','go','java'],
  'Fullstack Engineer': ['api','frontend','backend','deployment','react','node','graphql','rest'],
  'Data Scientist': ['model','analysis','feature','pandas','numpy','ml','metrics','a/b','data'],
  'Machine Learning Engineer': ['model','inference','feature store','latency','drift','tracking','mlflow'],
  'DevOps Engineer': ['ci','cd','kubernetes','docker','monitoring','slo','sla','alerts'],
  'Mobile Engineer': ['android','ios','swift','kotlin','layout','memory','performance'],
  'QA Engineer': ['test','automation','flaky','coverage','ci','selenium','cypress'],
  'Security Engineer': ['vulnerability','threat','sec','csrf','xss','encryption','auth','oauth'],
  'Product Manager': ['metric','user','roadmap','stakeholder','experiment','growth']
};

function localAnalyze(answers, role) {
  const joined = answers.map(a => a.transcript || '').join(' ');
  const words = joined.split(/\s+/).filter(Boolean);
  const totalWords = words.length;
  const answerCount = answers.length;
  const avgWords = answerCount ? Math.round(totalWords / answerCount) : 0;
  // keyword match score
  const keywords = ROLE_KEYWORDS[role] || [];
  const lower = joined.toLowerCase();
  let matches = 0;
  for (const k of keywords) if (lower.includes(k)) matches++;
  const keywordScore = keywords.length ? Math.round((matches / keywords.length) * 100) : 50;
  // Heuristic score: average words and keyword presence
  let score = Math.min(100, Math.round((Math.min(avgWords,120)/120)*60 + keywordScore*0.4));
  const strengths = [];
  const weaknesses = [];
  if (avgWords > 30) strengths.push('Gave detailed answers'); else weaknesses.push('Answers were brief; provide more detail');
  if (keywordScore > 50) strengths.push('Used relevant domain terms'); else weaknesses.push('Mention more role-specific terminology and techniques');
  if (answerCount < 6) weaknesses.push('Try to cover more topics in depth');
  const summary = `You answered ${answerCount} questions with an average of ${avgWords} words per answer. Detected ${matches} relevant keywords for ${role}.`;
  const recommendation = score >= 70 ? 'Proceed to next-round interview' : (score >= 45 ? 'Consider technical coaching' : 'Needs further development');
  return { recommendation, score, summary, strengths, weaknesses };
}

export default function Interview({ role, resume, onRestart, initialStream }) {
  const [socket, setSocket] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [log, setLog] = useState([]);
  const [socketConnected, setSocketConnected] = useState(false);
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
  // Local-mode interview state (fallback when socket disconnected)
  const localQuestionsRef = useRef([]);
  const localIndexRef = useRef(0);
  const localAnswersRef = useRef([]);

  useEffect(() => {
    // Prefer polling first to improve connectivity in proxied / preview environments
    const s = io(SERVER, { transports: ['polling', 'websocket'] });
    setSocket(s);

    s.on('connect', () => {
      appendLog(`Connected to server (${s.id})`);
      setSocketConnected(true);
    });

    s.on('session_created', ({ sessionId, firstQuestion }) => {
      console.log('session_created received', {sessionId, firstQuestion});
      try { followupTimeoutRef.current && clearTimeout(followupTimeoutRef.current); } catch(e){}
      setSessionId(sessionId);
      setSessionActive(true);
      setCurrentQuestion(firstQuestion);
      appendLog('Session created — first question: ' + firstQuestion.text);
      console.log('About to speak question:', firstQuestion.text);
      speakQuestion(firstQuestion.text);
    });

    s.on('followup', ({ followup }) => {
      // Clear any pending followup fallback timer
      try { followupTimeoutRef.current && clearTimeout(followupTimeoutRef.current); } catch(e){}
      if (followup && followup.text) {
        setCurrentQuestion(followup);
        appendLog('Follow-up: ' + followup.text);
        speakQuestion(followup.text);
      }
    });

    s.on('finished', ({ recommendation }) => {
      try { followupTimeoutRef.current && clearTimeout(followupTimeoutRef.current); } catch(e){}
      setInterviewFinished(true);
      setResult(recommendation);
      setSessionActive(false);
      appendLog('Interview finished — recommendation: ' + JSON.stringify(recommendation));
      if (recommendation && recommendation.summary) {
        speak('Interview complete. Summary: ' + recommendation.summary);
      }
    });

    s.on('disconnect', () => {
      appendLog('Socket disconnected');
      setSocketConnected(false);
    });

    return () => {
      s.disconnect();
    };
  }, []);

  // followup fallback timer ref
  const followupTimeoutRef = useRef(null);

  const ensureMediaAccess = useCallback(async () => {
    if (mediaStream) return; // already have a stream (maybe provided by parent)
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

  // If parent provided an initial stream (requested on user gesture), adopt it
  useEffect(() => {
    if (initialStream) {
      setMediaStream(prev => {
        prev?.getTracks().forEach(track => track.stop());
        return initialStream;
      });
      streamRef.current = initialStream;
      appendLog('Using media stream provided by launcher');
    }
  }, [initialStream]);

  // Removed auto-start - user will manually click "Start Interview" button

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
    console.log('speak called with text:', text, 'autoListen:', autoListen);
    if (!('speechSynthesis' in window)) {
      console.error('speechSynthesis not available');
      return;
    }
    synthRef.current.cancel();
    const ut = new SpeechSynthesisUtterance(text);
    ut.rate = 1;
    ut.pitch = 1;
    ut.onstart = () => {
      console.log('Speech started');
      setIsSpeaking(true);
    };
    ut.onend = () => {
      console.log('Speech ended, autoListen:', autoListen);
      setIsSpeaking(false);
      if (autoListen) {
        // smaller delay so the end of TTS isn't captured by STT
        setTimeout(() => {
          startListenAndSend();
        }, 200);
      }
    };
    ut.onerror = (e) => {
      console.error('Speech synthesis error:', e);
    };
    console.log('Speaking:', text);
    synthRef.current.speak(ut);
  }

  function speakQuestion(text) {
    speak(text, { autoListen: true });
  }

  function startSession() {
    console.log('startSession called', {socket: !!socket, socketConnected, mediaStream: !!mediaStream, role, resumeLength: resume?.length});
    if (!mediaStream) {
      appendLog('Camera stream missing — re-requesting access');
      ensureMediaAccess();
      return;
    }

    // If socket is connected, ask server to create session as usual
    if (socketConnected && socket) {
      appendLog('Emitting create_session event with role=' + role + ', resumeLength=' + (resume?.length || 0));
      socket.emit('create_session', { role, resume, durationMin: 18 });
      appendLog('Requested session creation');
      return;
    }

    // Fallback: start a client-side interview using predefined role questions
    appendLog('Socket disconnected — starting local interview fallback for role: ' + role);
    const qset = ROLE_QUESTIONS[role] || [{ id: 'dft1', text: 'Tell me about your most recent work.' }];
    localQuestionsRef.current = qset;
    localIndexRef.current = 0;
    localAnswersRef.current = [];
    const first = qset[0];
    setSessionId('local-' + Date.now());
    setSessionActive(true);
    setCurrentQuestion(first);
    appendLog('Local first question: ' + first.text);
    speakQuestion(first.text);
  }

  // Debug: allow forcing a session create manually from the UI
  function forceStart() {
    appendLog('Force starting session (manual)');
    startSession();
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
      try { rec.stop(); } catch(e) {}
      // If connected to server, forward answer to server
      if (socketConnected && socket && sessionId && currentQuestion) {
        // also store locally for fallback analysis
        try { localAnswersRef.current.push({ questionId: currentQuestion?.id, transcript }); } catch (e) {}
        socket.emit('candidate_answer', { sessionId, questionId: currentQuestion.id, transcript });
        appendLog('Sent answer to server');
        // Start fallback timer: if server doesn't send a followup within X ms, fallback to local progression
        try { followupTimeoutRef.current && clearTimeout(followupTimeoutRef.current); } catch(e){}
        followupTimeoutRef.current = setTimeout(() => {
          appendLog('No follow-up received from server within timeout — falling back to local progression');
          // initialize local question set if empty
          if (!localQuestionsRef.current || !localQuestionsRef.current.length) {
            localQuestionsRef.current = ROLE_QUESTIONS[role] || [{ id: 'dft1', text: 'Tell me about your most recent work.' }];
            localIndexRef.current = 0;
          }
          // advance to next local question if available
          const nextIndex = localIndexRef.current + 1;
          if (nextIndex < localQuestionsRef.current.length) {
            localIndexRef.current = nextIndex;
            const nextQ = localQuestionsRef.current[nextIndex];
            setCurrentQuestion(nextQ);
            appendLog('Fallback next question: ' + nextQ.text);
            speakQuestion(nextQ.text);
          } else {
            appendLog('Fallback: no more local questions available');
            speak('I have no further questions at this time.');
          }
        }, 5000);
        return;
      }

      // Local-mode: capture answer and advance through local questions
      if (sessionId && sessionId.startsWith('local-')) {
        localAnswersRef.current.push({ questionId: currentQuestion?.id, transcript });
        const nextIndex = localIndexRef.current + 1;
        if (nextIndex < localQuestionsRef.current.length) {
          localIndexRef.current = nextIndex;
          const nextQ = localQuestionsRef.current[nextIndex];
          setCurrentQuestion(nextQ);
          appendLog('Local next question: ' + nextQ.text);
          // speak next question
          speakQuestion(nextQ.text);
        } else {
          // finish local interview
          appendLog('Local interview complete — compiling summary');
          setInterviewFinished(true);
          setSessionActive(false);
          // Run lightweight local analysis and produce feedback
          const analysis = localAnalyze(localAnswersRef.current, role || 'Unknown');
          const recommendation = {
            recommendation: analysis.recommendation,
            score: analysis.score,
            summary: analysis.summary,
            strengths: analysis.strengths,
            weaknesses: analysis.weaknesses
          };
          setResult(recommendation);
          // Speak a concise end-of-interview summary and recommendation
          const speakText = `${analysis.summary} Recommendation: ${analysis.recommendation}. Overall score: ${analysis.score} out of 100.`;
          speak('Interview complete. ' + speakText);
        }
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
    // If this is a local-only session, finalize locally
    if (sessionId && sessionId.startsWith('local')) {
      appendLog('Finishing local interview and running analysis');
      const analysis = localAnalyze(localAnswersRef.current, role || 'Unknown');
      const recommendation = {
        recommendation: analysis.recommendation,
        score: analysis.score,
        summary: analysis.summary,
        strengths: analysis.strengths,
        weaknesses: analysis.weaknesses
      };
      setResult(recommendation);
      setInterviewFinished(true);
      setSessionActive(false);
      speak('Interview finished. ' + analysis.summary + ' Recommendation: ' + analysis.recommendation);
      return;
    }

    if (socket && sessionId) {
      socket.emit('finish_interview', { sessionId });
      appendLog('Requested finish interview');
      // fallback: if server does not respond with 'finished' within timeout, run localAnalyze on captured answers
      try { followupTimeoutRef.current && clearTimeout(followupTimeoutRef.current); } catch(e){}
      followupTimeoutRef.current = setTimeout(() => {
        appendLog('No finished event from server within timeout — producing local summary');
        const analysis = localAnalyze(localAnswersRef.current, role || 'Unknown');
        const recommendation = {
          recommendation: analysis.recommendation,
          score: analysis.score,
          summary: analysis.summary,
          strengths: analysis.strengths,
          weaknesses: analysis.weaknesses
        };
        setResult(recommendation);
        setInterviewFinished(true);
        setSessionActive(false);
        speak('Interview finished. ' + analysis.summary + ' Recommendation: ' + analysis.recommendation);
      }, 6000);
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
            <button onClick={startSession} className="primary" disabled={sessionActive || !mediaStream}>
              {sessionActive ? 'Interview in progress' : 'Start Interview'}
            </button>
            <button onClick={forceStart} className="primary ghost" disabled={!mediaStream}>Force start</button>
            <button onClick={startListenAndSend} className={`secondary ${isListening ? 'active' : ''}`}>Capture answer</button>
            <button onClick={endInterview} className="ghost" disabled={!sessionActive}>Finish interview</button>
          </div>
          <div style={{marginTop:8}}>
            <small>Socket: <strong>{socketConnected ? 'connected' : 'disconnected'}</strong></small>
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
