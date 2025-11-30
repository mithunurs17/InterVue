const PORT = process.env.PORT || 4000;
const HOST = process.env.HOST || '0.0.0.0';
require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Server } = require('socket.io');
const { InterviewSession } = require('./interviewManager');
const supabase = require('./supabaseClient');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// In-memory sessions (for demo). In production persist sessions.
const sessions = new Map();

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  socket.on('create_session', async ({role, resume, durationMin}) => {
    console.log('create_session event received', {role, resumeLength: resume?.length, durationMin});
    const id = 's_' + Date.now();
    const session = new InterviewSession({id, role, resume, durationMin});
    session.startNow();

    // Generate an initial question by analyzing the resume
    try {
      console.log('Generating initial question...');
      const initialQuestion = await session.generateInitialQuestion();
      console.log('Initial question generated:', initialQuestion);
      session.questions.push(initialQuestion);
      sessions.set(id, session);
      socket.join(id);
      console.log('Emitting session_created event...');
      io.to(id).emit('session_created', { sessionId: id, start: session.start, end: session.end, firstQuestion: initialQuestion });
      console.log('Session created:', id, 'First question:', initialQuestion.text);
    } catch (e) {
      console.error('Error generating initial question:', e);
      // Fallback to generic question
      const fallbackQuestion = { id: 'q_1', text: `Tell me about your experience relevant to the role of ${role}.`, askedAt: new Date().toISOString() };
      session.questions.push(fallbackQuestion);
      sessions.set(id, session);
      socket.join(id);
      io.to(id).emit('session_created', { sessionId: id, start: session.start, end: session.end, firstQuestion: fallbackQuestion });
    }

    // If resume is empty or not helpful, add a small set of default role-based questions
    const roleKey = (role || '').toLowerCase();
    const defaults = {
      frontend: [
        'Describe a challenging UI you built and how you handled responsiveness and accessibility.',
        'How do you optimize page load performance and rendering in modern browsers?'
      ],
      backend: [
        'Describe a scalable backend system you designed and the trade-offs you made.',
        'How do you approach data modeling and performance for high-throughput services?'
      ],
      data: [
        'Tell me about a data pipeline you built and how you handled data quality.',
        'How do you validate and monitor model performance or data drift?'
      ],
      devops: [
        'Describe how you would design CI/CD for a microservices platform.',
        'How do you monitor and respond to production incidents?' 
      ],
      product: [
        'How do you gather requirements and measure product success?',
        'Tell me about a time you prioritized competing stakeholder requests.'
      ]
    };

    const matched = Object.keys(defaults).find(k => roleKey.includes(k));
    if ((!resume || !resume.trim()) && matched) {
      defaults[matched].forEach(q => session.addQuestion(q));
    }
  });

  socket.on('candidate_answer', async ({ sessionId, questionId, transcript }) => {
    const session = sessions.get(sessionId);
    if(!session) return socket.emit('error', {message:'session not found'});
    session.addAnswer(questionId, transcript);

    // Ask LLM to produce followup and key points
    try{
      const res = await session.requestFollowupAndKeypoints(transcript);
      // if a followup was added it will be the latest question
      const latestQ = session.questions[session.questions.length-1];
      io.to(sessionId).emit('followup', { followup: latestQ });
    }catch(e){
      console.error('LLM followup error', e);
      io.to(sessionId).emit('followup', { followup: { id:'', text: 'Thanks — next question: What challenges did you face on that project and how did you solve them?' } });
    }
  });

  socket.on('finish_interview', async ({ sessionId }) => {
    const session = sessions.get(sessionId);
    if(!session) return socket.emit('error', {message:'session not found'});
    const rec = await session.finalizeRecommendation();

    // persist to supabase if configured
    try{
      if(supabase){
        await supabase.from('interviews').insert([{ id: session.id, role: session.role, resume: session.resume, started_at: session.start, ended_at: session.end, summary: rec.summary || '', recommendation: rec.recommendation || '', score: rec.score || 0, key_points: session.keyPoints }]);
      }
    }catch(e){
      console.warn('Supabase write failed', e.message || e);
    }

    io.to(sessionId).emit('finished', { recommendation: rec, session: { questions: session.questions, answers: session.answers, keyPoints: session.keyPoints } });
  });

  socket.on('disconnect', ()=>{console.log('socket disconnected', socket.id);});
});

app.get('/', (req,res)=>res.json({status:'ok'}));

server.listen(PORT, HOST, ()=> console.log(`Server listening on http://${HOST}:${PORT}`));