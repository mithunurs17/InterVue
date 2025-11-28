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

const PORT = process.env.PORT || 4000;

// In-memory sessions (for demo). In production persist sessions.
const sessions = new Map();

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  socket.on('create_session', ({role, resume, durationMin}) => {
    const id = 's_' + Date.now();
    const session = new InterviewSession({id, role, resume, durationMin});
    session.startNow();
    sessions.set(id, session);
    socket.join(id);
    // Create an initial starter question via LLM
    session.addQuestion(`Tell me about your experience relevant to the role of ${role}.`);

    io.to(id).emit('session_created', { sessionId: id, start: session.start, end: session.end, firstQuestion: session.questions[0] });
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

server.listen(PORT, ()=> console.log('Server listening on http://localhost:'+PORT));