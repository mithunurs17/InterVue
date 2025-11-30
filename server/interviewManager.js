// interviewManager: lightweight session manager. Creates a session object tracking Q/A, key points, timer.

const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function nowISO() { return new Date().toISOString(); }

class InterviewSession {
  constructor({id, role, resume, durationMin = 18}){
    this.id = id;
    this.role = role;
    this.resume = resume;
    this.durationMin = durationMin;
    this.start = null;
    this.end = null;
    this.questions = []; // {id, text, askedAt}
    this.answers = []; // {questionId, text, transcript, ts}
    this.keyPoints = [];
    this.recommendation = null;
    this.ended = false;
  }

  startNow(){
    this.start = nowISO();
    const ms = this.durationMin * 60 * 1000;
    this.end = new Date(Date.now() + ms).toISOString();
    return {start:this.start, end:this.end};
  }

  addQuestion(text){
    const q = { id: 'q_' + (this.questions.length+1), text, askedAt: nowISO() };
    this.questions.push(q);
    return q;
  }

  addAnswer(questionId, transcript){
    const a = { questionId, transcript, ts: nowISO() };
    this.answers.push(a);
    return a;
  }

  async generateInitialQuestion(){
    // Analyze resume and generate first question tailored to the role and experience
    const prompt = `You are an experienced technical interviewer. Candidate role: ${this.role}. 

Resume:
${this.resume}

Based on this resume and the role of ${this.role}, generate an opening question to assess the candidate's readiness for this position. The question should be specific to their background and experience shown in the resume.

Respond in JSON format with these keys:
- question: A clear, specific opening question (string)
- key_topic: The main skill/experience area you're testing (string)

Make the question conversational and focused on their most relevant experience from the resume.`;

    try{
      console.log('Calling OpenAI with model:', process.env.OPENAI_MODEL);
      const resp = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [{role:'system', content:'You are an expert AI technical interviewer who asks thoughtful, resume-aware questions.'}, {role:'user', content: prompt}],
        max_tokens: 300,
        temperature: 0.7
      });

      console.log('OpenAI response received:', resp.choices?.[0]?.message?.content?.substring(0, 100));
      const txt = resp.choices?.[0]?.message?.content || '';
      const jsonStart = txt.indexOf('{');
      const extracted = jsonStart>=0 ? txt.slice(jsonStart) : txt;
      console.log('Extracted text:', extracted.substring(0, 100));
      const parsed = JSON.parse(extracted);
      
      const questionText = parsed.question || `Tell me about your experience relevant to the role of ${this.role}.`;
      if(parsed.key_topic) this.keyPoints.push(`Starting topic: ${parsed.key_topic}`);
      
      console.log('Generated question:', questionText);
      return { id: 'q_1', text: questionText, askedAt: nowISO() };
    }catch(e){
      console.error('Error generating initial question:', e.message || e);
      console.error('Full error:', e);
      return { id: 'q_1', text: `Tell me about your experience relevant to the role of ${this.role}.`, askedAt: nowISO() };
    }
  }

  async requestFollowupAndKeypoints(lastAnswer){
    // Call LLM to suggest follow-up + extract key-points
    const prompt = `You are an experienced technical interviewer. Candidate role: ${this.role}. Resume: ${this.resume}\n\nLast question-answer pair:\nQ: ${this.questions[this.questions.length-1].text}\nA: ${lastAnswer}\n\nRespond in JSON with keys: followup (a short follow-up question or empty), key_points (array of 3 short bullets learned from the answer).`;

    const resp = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [{role:'system', content:'You are an AI interviewer.'}, {role:'user', content: prompt}],
      max_tokens: 300
    });

    const txt = resp.choices?.[0]?.message?.content || '';
    try{
      // try parse JSON from model output
      const jsonStart = txt.indexOf('{');
      const extracted = jsonStart>=0 ? txt.slice(jsonStart) : txt;
      const parsed = JSON.parse(extracted);
      if(parsed.followup) this.addQuestion(parsed.followup);
      if(parsed.key_points && Array.isArray(parsed.key_points)){
        this.keyPoints.push(...parsed.key_points);
      }
      return parsed;
    }catch(e){
      // fallback: simple heuristic
      const followup = txt.split('\n')[0] || '';
      if(followup) this.addQuestion(followup);
      return { followup, key_points: [] };
    }
  }

  async finalizeRecommendation(){
    // Summarize conversation and ask LLM to recommend pass/fail + short reason + summary
    const prompt = `You are a senior technical interviewer. Role: ${this.role}. Resume: ${this.resume}\n\nGiven questions and candidate transcripts:\n${this.questions.map((q,i)=>`Q${i+1}: ${q.text}`).join('\n')}\n\nAnswers:\n${this.answers.map((a,i)=>`A${i+1}: ${a.transcript}`).join('\n')}\n\nKey points captured: ${this.keyPoints.join('; ')}\n\nReturn JSON: {recommendation: "Pass" or "Fail", score: 0-100, summary: short paragraph (max 80 words), strengths:[], weaknesses:[]}`;

    const resp = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [{role:'system', content:'You are an AI hiring manager.'}, {role:'user', content: prompt}],
      max_tokens: 400
    });

    const txt = resp.choices?.[0]?.message?.content || '';
    try{
      const jsonStart = txt.indexOf('{');
      const extracted = jsonStart>=0 ? txt.slice(jsonStart) : txt;
      const parsed = JSON.parse(extracted);
      this.recommendation = parsed;
      this.ended = true;
      return parsed;
    }catch(e){
      this.recommendation = { recommendation: 'Undetermined', score: 50, summary: txt };
      this.ended = true;
      return this.recommendation;
    }
  }
}

module.exports = { InterviewSession };