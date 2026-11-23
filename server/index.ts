import 'dotenv/config'
import express, { type NextFunction, type Request, type Response } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import pg from 'pg'
import crypto from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import { normalizeDatabaseUrl } from './database'
import { buildStudentContext, buildSystemPrompt, generateWithProvider, AIProviderError, type TeachingMode } from './ai'

const { Pool } = pg
const app = express()
const port = Number(process.env.PORT || 3001)
const jwtSecret = process.env.JWT_SECRET
const databaseUrl = process.env.DATABASE_URL

if (!jwtSecret || jwtSecret.length < 32) throw new Error('JWT_SECRET deve ter pelo menos 32 caracteres.')
if (!databaseUrl) throw new Error('DATABASE_URL não configurada.')

const pool = new Pool({ connectionString: normalizeDatabaseUrl(databaseUrl) })
app.use(helmet())
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? (process.env.APP_URL ? [process.env.APP_URL] : false)
    : ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
}))
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())

interface AuthRequest extends Request { userId?: string }

function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.session
  if (!token) return res.status(401).json({ message: 'Autenticação necessária.' })
  try {
    const payload = jwt.verify(token, jwtSecret) as { userId: string }
    req.userId = payload.userId
    next()
  } catch {
    res.status(401).json({ message: 'Sessão inválida ou expirada.' })
  }
}

function setSession(res: Response, userId: string) {
  const token = jwt.sign({ userId }, jwtSecret, { expiresIn: '7d' })
  res.cookie('session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })
}

const email = (value: unknown) => String(value || '').trim().toLowerCase()

app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.post('/api/auth/register', async (req, res) => {
  const fullName = String(req.body.fullName || '').trim()
  const userEmail = email(req.body.email)
  const password = String(req.body.password || '')
  if (!fullName || !userEmail || password.length < 8) {
    return res.status(400).json({ message: 'Informe nome, email e uma senha com pelo menos 8 caracteres.' })
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const passwordHash = await bcrypt.hash(password, 12)
    const result = await client.query(
      `insert into users (full_name, email, password_hash)
       values ($1,$2,$3) on conflict (email) do nothing
       returning id, full_name, email, created_at`,
      [fullName, userEmail, passwordHash],
    )
    if (!result.rows[0]) {
      await client.query('ROLLBACK')
      return res.status(409).json({ message: 'Já existe uma conta com este email.' })
    }
    const user = result.rows[0]
    await client.query('insert into profiles (id, full_name, email) values ($1,$2,$3)', [user.id, fullName, userEmail])
    await client.query('COMMIT')
    setSession(res, user.id)
    res.status(201).json({ user })
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
})

app.post('/api/auth/login', async (req, res) => {
  const userEmail = email(req.body.email)
  const password = String(req.body.password || '')
  const result = await pool.query('select * from users where email=$1', [userEmail])
  const user = result.rows[0]
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ message: 'Email ou senha incorretos.' })
  }
  setSession(res, user.id)
  res.json({ user: { id: user.id, full_name: user.full_name, email: user.email, created_at: user.created_at } })
})

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('session')
  res.status(204).send()
})

app.get('/api/auth/me', requireAuth, async (req: AuthRequest, res) => {
  const result = await pool.query('select id, full_name, email, created_at from users where id=$1', [req.userId])
  res.json({ user: result.rows[0] || null })
})

app.post('/api/auth/forgot-password', async (req, res) => {
  const userEmail = email(req.body.email)
  const result = await pool.query('select id from users where email=$1', [userEmail])
  if (result.rows[0]) {
    const rawToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
    await pool.query(
      `update users set reset_token_hash=$1, reset_token_expires=now()+interval '30 minutes' where id=$2`,
      [tokenHash, result.rows[0].id],
    )
    if (process.env.NODE_ENV !== 'production') {
      return res.json({ message: 'Link de recuperação criado.', resetToken: rawToken })
    }
  }
  res.json({ message: 'Se existir uma conta com este email, você receberá as instruções de recuperação.' })
})

app.post('/api/auth/reset-password', async (req, res) => {
  const token = String(req.body.token || '')
  const password = String(req.body.password || '')
  if (password.length < 8) return res.status(400).json({ message: 'A senha deve ter pelo menos 8 caracteres.' })
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const passwordHash = await bcrypt.hash(password, 12)
  const result = await pool.query(
    `update users set password_hash=$1, reset_token_hash=null, reset_token_expires=null, updated_at=now()
     where reset_token_hash=$2 and reset_token_expires>now() returning id`,
    [passwordHash, tokenHash],
  )
  if (!result.rows[0]) return res.status(400).json({ message: 'Link inválido ou expirado.' })
  res.json({ message: 'Senha redefinida.' })
})

app.post('/api/auth/change-password', requireAuth, async (req: AuthRequest, res) => {
  const password = String(req.body.password || '')
  if (password.length < 8) return res.status(400).json({ message: 'A senha deve ter pelo menos 8 caracteres.' })
  const passwordHash = await bcrypt.hash(password, 12)
  await pool.query('update users set password_hash=$1, updated_at=now() where id=$2', [passwordHash, req.userId])
  res.json({ message: 'Senha alterada.' })
})

app.get('/api/profile', requireAuth, async (req: AuthRequest, res) => {
  const result = await pool.query('select * from profiles where id=$1', [req.userId])
  res.json({ profile: result.rows[0] || null })
})

app.put('/api/profile', requireAuth, async (req: AuthRequest, res) => {
  const fullName = String(req.body.fullName || '').trim()
  if (!fullName) return res.status(400).json({ message: 'O nome é obrigatório.' })
  const result = await pool.query(
    `insert into profiles (id, full_name, email, updated_at)
     select id,$2,email,now() from users where id=$1
     on conflict (id) do update set full_name=excluded.full_name, updated_at=now() returning *`,
    [req.userId, fullName],
  )
  await pool.query('update users set full_name=$1, updated_at=now() where id=$2', [fullName, req.userId])
  res.json({ profile: result.rows[0] })
})

app.get('/api/exam', requireAuth, async (req: AuthRequest, res) => {
  const result = await pool.query('select * from user_exam_preferences where user_id=$1', [req.userId])
  res.json({ exam: result.rows[0] || null })
})

app.put('/api/exam', requireAuth, async (req: AuthRequest, res) => {
  const statuses = ['planejamento', 'estudando', 'revisao', 'pronto']
  const status = String(req.body.preparationStatus || 'planejamento')
  if (!statuses.includes(status)) return res.status(400).json({ message: 'Status inválido.' })
  const result = await pool.query(
    `insert into user_exam_preferences
     (user_id,exam_name,institution,state,desired_position,examining_board,exam_date,preparation_status)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     on conflict (user_id) do update set exam_name=excluded.exam_name,institution=excluded.institution,
       state=excluded.state,desired_position=excluded.desired_position,examining_board=excluded.examining_board,
       exam_date=excluded.exam_date,preparation_status=excluded.preparation_status,updated_at=now()
     returning *`,
    [req.userId, String(req.body.examName || ''), String(req.body.institution || ''),
      String(req.body.state || ''), String(req.body.desiredPosition || ''),
      String(req.body.examiningBoard || ''), req.body.examDate || null, status],
  )
  res.json({ exam: result.rows[0] })
})

app.get('/api/subjects', requireAuth, async (req: AuthRequest, res) => {
  const [subjects, topics] = await Promise.all([
    pool.query('select * from subjects where user_id=$1 order by priority desc,name', [req.userId]),
    pool.query('select * from topics where user_id=$1 order by created_at', [req.userId]),
  ])
  res.json({ subjects: subjects.rows, topics: topics.rows })
})

app.post('/api/subjects', requireAuth, async (req: AuthRequest, res) => {
  const name = String(req.body.name || '').trim()
  if (!name || name.length > 120) return res.status(400).json({ message: 'Informe uma disciplina válida.' })
  const result = await pool.query('insert into subjects (user_id,name,priority) values ($1,$2,$3) returning *',
    [req.userId, name, Boolean(req.body.priority)])
  res.status(201).json({ subject: result.rows[0] })
})

app.put('/api/subjects/:id', requireAuth, async (req: AuthRequest, res) => {
  const name = String(req.body.name || '').trim()
  if (!name || name.length > 120) return res.status(400).json({ message: 'Informe uma disciplina válida.' })
  const result = await pool.query(
    'update subjects set name=$1,priority=$2,updated_at=now() where id=$3 and user_id=$4 returning *',
    [name, Boolean(req.body.priority), req.params.id, req.userId],
  )
  if (!result.rows[0]) return res.status(404).json({ message: 'Disciplina não encontrada.' })
  res.json({ subject: result.rows[0] })
})

app.delete('/api/subjects/:id', requireAuth, async (req: AuthRequest, res) => {
  const result = await pool.query('delete from subjects where id=$1 and user_id=$2 returning id', [req.params.id, req.userId])
  if (!result.rows[0]) return res.status(404).json({ message: 'Disciplina não encontrada.' })
  res.status(204).send()
})

app.post('/api/topics', requireAuth, async (req: AuthRequest, res) => {
  const subjectId = String(req.body.subjectId || '')
  const name = String(req.body.name || '').trim()
  const status = String(req.body.studyStatus || 'not_started')
  if (!subjectId || !name || name.length > 180) return res.status(400).json({ message: 'Informe uma disciplina e assunto válidos.' })
  if (!['not_started', 'studying', 'studied', 'reviewed'].includes(status)) return res.status(400).json({ message: 'Status inválido.' })
  const result = await pool.query(
    `insert into topics (user_id,subject_id,name,study_status,notes)
     select $1,id,$2,$3,$4 from subjects where id=$5 and user_id=$1 returning *`,
    [req.userId, name, status, String(req.body.notes || '').trim(), subjectId],
  )
  if (!result.rows[0]) return res.status(404).json({ message: 'Disciplina não encontrada.' })
  res.status(201).json({ topic: result.rows[0] })
})

app.put('/api/topics/:id', requireAuth, async (req: AuthRequest, res) => {
  const status = String(req.body.studyStatus || '')
  if (!['not_started', 'studying', 'studied', 'reviewed'].includes(status)) return res.status(400).json({ message: 'Status inválido.' })
  const result = await pool.query(
    'update topics set study_status=$1,updated_at=now() where id=$2 and user_id=$3 returning *',
    [status, req.params.id, req.userId],
  )
  if (!result.rows[0]) return res.status(404).json({ message: 'Assunto não encontrado.' })
  res.json({ topic: result.rows[0] })
})

app.delete('/api/topics/:id', requireAuth, async (req: AuthRequest, res) => {
  const result = await pool.query('delete from topics where id=$1 and user_id=$2 returning id', [req.params.id, req.userId])
  if (!result.rows[0]) return res.status(404).json({ message: 'Assunto não encontrado.' })
  res.status(204).send()
})

app.get('/api/conversations', requireAuth, async (req: AuthRequest, res) => {
  const result = await pool.query(
    'select * from conversations where user_id=$1 order by updated_at desc',
    [req.userId],
  )
  res.json({ conversations: result.rows })
})

app.post('/api/conversations', requireAuth, async (req: AuthRequest, res) => {
  const allowedModes: TeachingMode[] = ['simple', 'deep', 'exam', 'interrogation', 'quick_review']
  const teachingMode = allowedModes.includes(req.body.teachingMode) ? req.body.teachingMode : 'simple'
  const title = String(req.body.title || 'Nova conversa').trim().slice(0, 120)
  const subjectId = req.body.subjectId || null
  const topicId = req.body.topicId || null
  if (subjectId) {
    const subject = await pool.query('select id from subjects where id=$1 and user_id=$2', [subjectId, req.userId])
    if (!subject.rows[0]) return res.status(404).json({ message: 'Disciplina não encontrada.' })
  }
  if (topicId) {
    const topic = await pool.query('select id from topics where id=$1 and user_id=$2', [topicId, req.userId])
    if (!topic.rows[0]) return res.status(404).json({ message: 'Assunto não encontrado.' })
  }
  const result = await pool.query(
    `insert into conversations (user_id,title,teaching_mode,subject_id,topic_id)
     values ($1,$2,$3,$4,$5) returning *`,
    [req.userId, title, teachingMode, subjectId, topicId],
  )
  res.status(201).json({ conversation: result.rows[0] })
})

app.get('/api/conversations/:id', requireAuth, async (req: AuthRequest, res) => {
  const conversation = await pool.query(
    'select * from conversations where id=$1 and user_id=$2',
    [req.params.id, req.userId],
  )
  if (!conversation.rows[0]) return res.status(404).json({ message: 'Conversa não encontrada.' })
  const messages = await pool.query(
    'select * from chat_messages where conversation_id=$1 and user_id=$2 order by created_at asc',
    [req.params.id, req.userId],
  )
  res.json({ conversation: conversation.rows[0], messages: messages.rows })
})

app.put('/api/conversations/:id', requireAuth, async (req: AuthRequest, res) => {
  const allowedModes: TeachingMode[] = ['simple', 'deep', 'exam', 'interrogation', 'quick_review']
  const title = req.body.title !== undefined ? String(req.body.title).trim().slice(0, 120) : null
  const teachingMode = req.body.teachingMode !== undefined
    ? (allowedModes.includes(req.body.teachingMode) ? req.body.teachingMode : null)
    : null
  if (title !== null && !title) return res.status(400).json({ message: 'O título não pode ficar vazio.' })
  if (req.body.teachingMode !== undefined && !teachingMode) {
    return res.status(400).json({ message: 'Modo de ensino inválido.' })
  }
  const result = await pool.query(
    `update conversations
     set title=coalesce($1,title), teaching_mode=coalesce($2,teaching_mode), updated_at=now()
     where id=$3 and user_id=$4 returning *`,
    [title, teachingMode, req.params.id, req.userId],
  )
  if (!result.rows[0]) return res.status(404).json({ message: 'Conversa não encontrada.' })
  res.json({ conversation: result.rows[0] })
})

app.delete('/api/conversations/:id', requireAuth, async (req: AuthRequest, res) => {
  const result = await pool.query(
    'delete from conversations where id=$1 and user_id=$2 returning id',
    [req.params.id, req.userId],
  )
  if (!result.rows[0]) return res.status(404).json({ message: 'Conversa não encontrada.' })
  res.status(204).send()
})

app.post('/api/conversations/:id/messages', requireAuth, async (req: AuthRequest, res) => {
  const content = String(req.body.content || '').trim()
  if (!content) return res.status(400).json({ message: 'Digite uma mensagem.' })
  if (content.length > 5000) return res.status(400).json({ message: 'A mensagem deve ter no máximo 5000 caracteres.' })

  const conversation = await pool.query(
    'select * from conversations where id=$1 and user_id=$2',
    [req.params.id, req.userId],
  )
  if (!conversation.rows[0]) return res.status(404).json({ message: 'Conversa não encontrada.' })

  const usage = await pool.query(
    `select count(*)::int as count from ai_usage
     where user_id=$1 and status='success' and created_at >= date_trunc('day', now())`,
    [req.userId],
  )
  const dailyLimit = Number(process.env.AI_DAILY_MESSAGE_LIMIT || 30)
  if (usage.rows[0].count >= dailyLimit) {
    await pool.query(
      `insert into ai_usage (user_id,provider,model,request_type,estimated_tokens,status)
       values ($1,$2,$3,'chat',0,'limit')`,
      [req.userId, process.env.AI_PROVIDER || 'ollama', process.env.AI_MODEL || 'qwen2.5:7b'],
    )
    return res.status(429).json({ message: 'Você atingiu o limite diário de mensagens do Professor IA.' })
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const userMessage = await client.query(
      `insert into chat_messages (conversation_id,user_id,role,content)
       values ($1,$2,'user',$3) returning *`,
      [req.params.id, req.userId, content],
    )

    const history = await client.query(
      `select role,content from chat_messages
       where conversation_id=$1 and user_id=$2 order by created_at asc limit 30`,
      [req.params.id, req.userId],
    )
    const context = await buildStudentContext(pool, req.userId)
    const systemPrompt = buildSystemPrompt(context, conversation.rows[0].teaching_mode)
    const providerResult = await generateWithProvider(
      systemPrompt,
      history.rows.map(row => ({ role: row.role as 'user' | 'assistant', content: row.content })),
    )

    const assistantMessage = await client.query(
      `insert into chat_messages (conversation_id,user_id,role,content,metadata)
       values ($1,$2,'assistant',$3,$4) returning *`,
      [req.params.id, req.userId, providerResult.content, JSON.stringify({
        provider: process.env.AI_PROVIDER || 'ollama',
        model: providerResult.model,
        estimated_tokens: providerResult.estimatedTokens,
      })],
    )
    await client.query(
      'update conversations set updated_at=now(), title=case when title=$1 then $2 else title end where id=$3',
      ['Nova conversa', content.slice(0, 80), req.params.id],
    )
    await client.query(
      `insert into ai_usage (user_id,provider,model,request_type,estimated_tokens,status)
       values ($1,$2,$3,'chat',$4,'success')`,
      [req.userId, process.env.AI_PROVIDER || 'ollama', providerResult.model, providerResult.estimatedTokens],
    )
    await client.query('COMMIT')
    res.json({ userMessage: userMessage.rows[0], assistantMessage: assistantMessage.rows[0] })
  } catch (error) {
    await client.query('ROLLBACK')
    if (error instanceof AIProviderError) {
      await pool.query(
        `insert into ai_usage (user_id,provider,model,request_type,estimated_tokens,status)
         values ($1,$2,$3,'chat',0,'error')`,
        [req.userId, process.env.AI_PROVIDER || 'ollama', process.env.AI_MODEL || 'qwen2.5:7b'],
      )
      return res.status(error.status).json({ message: error.message })
    }
    throw error
  } finally {
    client.release()
  }
})

app.get('/api/errors', requireAuth, async (req: AuthRequest, res) => {
  const result = await pool.query(
    `select e.*,
      a.primary_error_type,a.secondary_error_types,a.content as analysis_content,
      a.plan,a.is_inconclusive,a.updated_at as analysis_updated_at
     from error_records e
     left join error_analyses a on a.error_id=e.id
     where e.user_id=$1
     order by e.updated_at desc`,
    [req.userId],
  )
  res.json({ errors: result.rows })
})

app.get('/api/errors/dashboard', requireAuth, async (req: AuthRequest, res) => {
  const result = await pool.query(
    `select
       count(*)::int as total,
       count(*) filter (where status='pending')::int as pending,
       count(*) filter (where is_recurring)::int as recurring,
       count(*) filter (where status in ('corrected','mastered'))::int as corrected,
       count(*) filter (where status='mastered')::int as mastered
     from error_records where user_id=$1`,
    [req.userId],
  )
  const row = result.rows[0]
  const reinforced = await pool.query(
    `select
       count(*)::int as attempts,
       count(*) filter (where is_correct=true)::int as successes
     from reinforcement_attempts where user_id=$1`,
    [req.userId],
  )
  const attempts = reinforced.rows[0].attempts
  res.json({
    dashboard: {
      total: row.total,
      pending: row.pending,
      recurring: row.recurring,
      corrected: row.corrected,
      mastered: row.mastered,
      recoveryRate: attempts ? Math.round((reinforced.rows[0].successes / attempts) * 100) : null,
    },
  })
})

app.post('/api/errors', requireAuth, async (req: AuthRequest, res) => {
  const statement = String(req.body.statement || '').trim()
  if (!statement) return res.status(400).json({ message: 'Informe o enunciado da questão.' })
  if (statement.length > 50000) return res.status(400).json({ message: 'O enunciado excede o limite permitido.' })
  const fields = {
    subjectId: req.body.subjectId || null,
    topicId: req.body.topicId || null,
    subjectName: String(req.body.subjectName || '').trim(),
    subsubject: String(req.body.subsubject || '').trim(),
    topicName: String(req.body.topicName || '').trim(),
    alternatives: Array.isArray(req.body.alternatives) ? req.body.alternatives : [],
    selectedAnswer: String(req.body.selectedAnswer || '').trim(),
    correctAnswer: String(req.body.correctAnswer || '').trim(),
    personalComment: String(req.body.personalComment || '').trim(),
    reasoning: String(req.body.reasoning || '').trim(),
    confidence: Number(req.body.confidence || 3),
    difficulty: ['easy', 'medium', 'hard'].includes(req.body.difficulty) ? req.body.difficulty : 'medium',
    questionType: ['true_false', 'multiple_choice', 'discursive'].includes(req.body.questionType) ? req.body.questionType : 'multiple_choice',
    board: String(req.body.board || '').trim(),
    exam: String(req.body.exam || '').trim(),
    year: req.body.year ? Number(req.body.year) : null,
    source: String(req.body.source || '').trim(),
    tags: Array.isArray(req.body.tags) ? req.body.tags.map((tag: unknown) => String(tag).trim()).filter(Boolean).slice(0, 20) : [],
  }
  if (fields.confidence < 1 || fields.confidence > 5) {
    return res.status(400).json({ message: 'A confiança deve estar entre 1 e 5.' })
  }
  const recurring = await pool.query(
    `select id from error_records
     where user_id=$1 and (
       nullif(subject_name,'') is not null and subject_name=$2
       or nullif(topic_name,'') is not null and topic_name=$3
     ) limit 1`,
    [req.userId, fields.subjectName, fields.topicName],
  )
  const result = await pool.query(
    `insert into error_records
     (user_id,subject_id,topic_id,subject_name,subsubject,topic_name,statement,alternatives,
      selected_answer,correct_answer,personal_comment,reasoning,confidence,difficulty,
      question_type,board,exam,year,source,tags,is_recurring,recurrence_count)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
     returning *`,
    [req.userId, fields.subjectId, fields.topicId, fields.subjectName, fields.subsubject, fields.topicName,
      statement, JSON.stringify(fields.alternatives), fields.selectedAnswer, fields.correctAnswer,
      fields.personalComment, fields.reasoning, fields.confidence, fields.difficulty, fields.questionType,
      fields.board, fields.exam, fields.year, fields.source, fields.tags, recurring.rows.length > 0,
      recurring.rows.length > 0 ? 2 : 1],
  )
  res.status(201).json({ error: result.rows[0] })
})

app.get('/api/errors/:id', requireAuth, async (req: AuthRequest, res) => {
  const error = await pool.query(
    `select e.*,a.primary_error_type,a.secondary_error_types,a.content as analysis_content,
     a.plan,a.is_inconclusive,a.updated_at as analysis_updated_at
     from error_records e left join error_analyses a on a.error_id=e.id
     where e.id=$1 and e.user_id=$2`,
    [req.params.id, req.userId],
  )
  if (!error.rows[0]) return res.status(404).json({ message: 'Erro não encontrado.' })
  const [steps, sessions] = await Promise.all([
    pool.query('select * from correction_plan_steps where error_id=$1 and user_id=$2 order by position', [req.params.id, req.userId]),
    pool.query('select * from reinforcement_sessions where error_id=$1 and user_id=$2 order by created_at desc', [req.params.id, req.userId]),
  ])
  res.json({ error: error.rows[0], steps: steps.rows, sessions: sessions.rows })
})

app.put('/api/errors/:id', requireAuth, async (req: AuthRequest, res) => {
  const status = ['pending', 'reviewing', 'corrected', 'mastered'].includes(req.body.status)
    ? req.body.status : null
  if (req.body.status !== undefined && !status) return res.status(400).json({ message: 'Status inválido.' })
  const result = await pool.query(
    `update error_records set
       status=coalesce($1,status),
       is_recurring=coalesce($2,is_recurring),
       corrected_at=case when $1 in ('corrected','mastered') then coalesce(corrected_at,now()) else corrected_at end,
       updated_at=now()
     where id=$3 and user_id=$4 returning *`,
    [status, req.body.isRecurring ?? null, req.params.id, req.userId],
  )
  if (!result.rows[0]) return res.status(404).json({ message: 'Erro não encontrado.' })
  res.json({ error: result.rows[0] })
})

app.delete('/api/errors/:id', requireAuth, async (req: AuthRequest, res) => {
  const result = await pool.query('delete from error_records where id=$1 and user_id=$2 returning id', [req.params.id, req.userId])
  if (!result.rows[0]) return res.status(404).json({ message: 'Erro não encontrado.' })
  res.status(204).send()
})

app.post('/api/errors/:id/analyze', requireAuth, async (req: AuthRequest, res) => {
  const record = await pool.query('select * from error_records where id=$1 and user_id=$2', [req.params.id, req.userId])
  if (!record.rows[0]) return res.status(404).json({ message: 'Erro não encontrado.' })
  const sameErrors = await pool.query(
    `select subject_name,topic_name,primary_error_type
     from error_records e left join error_analyses a on a.error_id=e.id
     where e.user_id=$1 and e.id<>$2
       and (e.subject_name=$3 or e.topic_name=$4)
     order by e.updated_at desc limit 10`,
    [req.userId, req.params.id, record.rows[0].subject_name, record.rows[0].topic_name],
  )
  const prompt = `Analise esta questão errada e responda em português brasileiro usando esta estrutura exata:
1. O que aconteceu?
2. Por que você errou?
3. Qual é o conceito correto?
4. Onde estava a armadilha?
5. Como resolver corretamente?
6. Como evitar repetir?
7. Bizu de prova
Plano de correção: liste entre 3 e 5 ações específicas em uma lista separada.
No final, informe em uma única linha: TIPO_PRINCIPAL: uma das categorias [Falta de conhecimento, Confusão conceitual, Erro de interpretação, Desatenção, Pegadinha da banca, Esquecimento, Chute ou baixa confiança, Dificuldade de aplicação prática, Erro de cálculo ou procedimento, Outro].
Não trate o diagnóstico como certeza absoluta. Não invente leis, artigos, súmulas ou jurisprudência. Identifique apenas questões geradas como autorais.`
  const questionContext = JSON.stringify({
    statement: record.rows[0].statement,
    alternatives: record.rows[0].alternatives,
    selectedAnswer: record.rows[0].selected_answer,
    correctAnswer: record.rows[0].correct_answer,
    subject: record.rows[0].subject_name,
    subsubject: record.rows[0].subsubject,
    topic: record.rows[0].topic_name,
    board: record.rows[0].board,
    exam: record.rows[0].exam,
    year: record.rows[0].year,
    confidence: record.rows[0].confidence,
    difficulty: record.rows[0].difficulty,
    personalComment: record.rows[0].personal_comment,
    reasoning: record.rows[0].reasoning,
    similarErrors: sameErrors.rows,
  })
  try {
    const providerResult = await generateWithProvider(prompt, [{ role: 'user', content: questionContext }])
    const primaryMatch = providerResult.content.match(/TIPO_PRINCIPAL:\s*(.+)/i)
    const primaryErrorType = primaryMatch?.[1]?.trim() || 'Outro'
    const planMatch = providerResult.content.match(/Plano de correção:[\s\S]*?(?:$)/i)
    const plan = planMatch
      ? planMatch[0].split('\n').map(line => line.replace(/^[-*]\s*|\d+[.)]\s*/, '').trim()).filter(line => line && !/^Plano de correção/i.test(line)).slice(0, 5)
      : []
    const analysis = await pool.query(
      `insert into error_analyses (error_id,user_id,primary_error_type,secondary_error_types,content,plan,is_inconclusive)
       values ($1,$2,$3,'{}',$4,$5,false)
       on conflict (error_id) do update set
         primary_error_type=excluded.primary_error_type,content=excluded.content,plan=excluded.plan,
         is_inconclusive=excluded.is_inconclusive,updated_at=now()
       returning *`,
      [req.params.id, req.userId, primaryErrorType, providerResult.content, JSON.stringify(plan)],
    )
    await pool.query(
      `delete from correction_plan_steps where error_id=$1 and user_id=$2`,
      [req.params.id, req.userId],
    )
    for (let index = 0; index < plan.length; index += 1) {
      await pool.query(
        'insert into correction_plan_steps (error_id,user_id,title,position) values ($1,$2,$3,$4)',
        [req.params.id, req.userId, plan[index], index + 1],
      )
    }
    await pool.query(
      `update error_records set status='reviewing',updated_at=now() where id=$1 and user_id=$2`,
      [req.params.id, req.userId],
    )
    await pool.query(
      `insert into ai_usage (user_id,provider,model,request_type,estimated_tokens,status)
       values ($1,$2,$3,'error_analysis',$4,'success')`,
      [req.userId, process.env.AI_PROVIDER || 'ollama', providerResult.model, providerResult.estimatedTokens],
    )
    res.json({ analysis: analysis.rows[0] })
  } catch (error) {
    if (error instanceof AIProviderError) {
      await pool.query(
        `insert into ai_usage (user_id,provider,model,request_type,estimated_tokens,status)
         values ($1,$2,$3,'error_analysis',0,'error')`,
        [req.userId, process.env.AI_PROVIDER || 'ollama', process.env.AI_MODEL || 'qwen2.5:7b'],
      )
      return res.status(error.status).json({ message: error.message })
    }
    throw error
  }
})

app.put('/api/errors/:errorId/plan/:stepId', requireAuth, async (req: AuthRequest, res) => {
  const completed = Boolean(req.body.completed)
  const result = await pool.query(
    `update correction_plan_steps set completed=$1,completed_at=$2
     where id=$3 and error_id=$4 and user_id=$5 returning *`,
    [completed, completed ? new Date().toISOString() : null, req.params.stepId, req.params.errorId, req.userId],
  )
  if (!result.rows[0]) return res.status(404).json({ message: 'Etapa não encontrada.' })
  res.json({ step: result.rows[0] })
})

app.post('/api/errors/:id/reinforcement', requireAuth, async (req: AuthRequest, res) => {
  const record = await pool.query('select * from error_records where id=$1 and user_id=$2', [req.params.id, req.userId])
  if (!record.rows[0]) return res.status(404).json({ message: 'Erro não encontrado.' })
  const count = [1, 3, 5, 10].includes(Number(req.body.count)) ? Number(req.body.count) : 3
  const difficulty = ['easy', 'medium', 'hard', 'progressive'].includes(req.body.difficulty) ? req.body.difficulty : 'progressive'
  const format = ['true_false', 'multiple_choice'].includes(req.body.format) ? req.body.format : 'multiple_choice'
  const prompt = `Crie exatamente ${count} questões de reforço geradas pelo sistema, não oficiais.
Formato: ${format === 'true_false' ? 'certo ou errado' : 'múltipla escolha'}.
Dificuldade: ${difficulty}.
Retorne estritamente JSON com esta estrutura:
{"questions":[{"question":"...","alternatives":[],"correctAnswer":"...","explanation":"..."}]}
A resposta deve evitar artigos, jurisprudência ou dados normativos não confirmados.
Contexto do erro original: ${JSON.stringify({
    statement: record.rows[0].statement,
    subject: record.rows[0].subject_name,
    topic: record.rows[0].topic_name,
    subsubject: record.rows[0].subsubject,
    selectedAnswer: record.rows[0].selected_answer,
    correctAnswer: record.rows[0].correct_answer,
  })}`
  try {
    const providerResult = await generateWithProvider(
      'Você cria questões autorais de concurso para reforço. Não revele a resposta antes da pergunta ser respondida. Retorne somente JSON válido.',
      [{ role: 'user', content: prompt }],
    )
    let parsed: { questions?: Array<{ question: string; alternatives: string[]; correctAnswer: string; explanation: string }> }
    try {
      parsed = JSON.parse(providerResult.content.replace(/```json|```/gi, '').trim())
    } catch {
      throw new AIProviderError('A IA não conseguiu estruturar as questões de reforço.', 502)
    }
    const questions = (parsed.questions || []).slice(0, count)
    if (!questions.length) throw new AIProviderError('A IA não gerou questões válidas.', 502)
    const session = await pool.query(
      `insert into reinforcement_sessions (error_id,user_id,format,difficulty)
       values ($1,$2,$3,$4) returning *`,
      [req.params.id, req.userId, format, difficulty],
    )
    for (let index = 0; index < questions.length; index += 1) {
      const question = questions[index]
      await pool.query(
        `insert into reinforcement_attempts
         (session_id,error_id,user_id,position,question,alternatives,correct_answer,explanation)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [session.rows[0].id, req.params.id, req.userId, index + 1, question.question,
          JSON.stringify(question.alternatives || []), question.correctAnswer, question.explanation || ''],
      )
    }
    await pool.query(
      `insert into ai_usage (user_id,provider,model,request_type,estimated_tokens,status)
       values ($1,$2,$3,'reinforcement',$4,'success')`,
      [req.userId, process.env.AI_PROVIDER || 'ollama', providerResult.model, providerResult.estimatedTokens],
    )
    res.status(201).json({ session: session.rows[0], questions })
  } catch (error) {
    if (error instanceof AIProviderError) return res.status(error.status).json({ message: error.message })
    throw error
  }
})

app.get('/api/errors/:id/reinforcement/:sessionId', requireAuth, async (req: AuthRequest, res) => {
  const session = await pool.query(
    'select * from reinforcement_sessions where id=$1 and error_id=$2 and user_id=$3',
    [req.params.sessionId, req.params.id, req.userId],
  )
  if (!session.rows[0]) return res.status(404).json({ message: 'Sessão de reforço não encontrada.' })
  const attempts = await pool.query(
    'select * from reinforcement_attempts where session_id=$1 and user_id=$2 order by position',
    [req.params.sessionId, req.userId],
  )
  res.json({ session: session.rows[0], attempts: attempts.rows })
})

app.put('/api/errors/:id/reinforcement/:sessionId/attempt/:attemptId', requireAuth, async (req: AuthRequest, res) => {
  const studentAnswer = String(req.body.answer || '').trim()
  if (!studentAnswer) return res.status(400).json({ message: 'Informe uma resposta.' })
  const attempt = await pool.query(
    `select * from reinforcement_attempts
     where id=$1 and session_id=$2 and error_id=$3 and user_id=$4`,
    [req.params.attemptId, req.params.sessionId, req.params.id, req.userId],
  )
  if (!attempt.rows[0]) return res.status(404).json({ message: 'Questão não encontrada.' })
  const correctAnswer = String(attempt.rows[0].correct_answer)
  const isCorrect = studentAnswer.toLowerCase() === correctAnswer.toLowerCase()
  const result = await pool.query(
    `update reinforcement_attempts set student_answer=$1,is_correct=$2,answered_at=now()
     where id=$3 and user_id=$4 returning *`,
    [studentAnswer, isCorrect, req.params.attemptId, req.userId],
  )
  const remaining = await pool.query(
    `select count(*)::int as count from reinforcement_attempts
     where session_id=$1 and user_id=$2 and answered_at is null`,
    [req.params.sessionId, req.userId],
  )
  if (remaining.rows[0].count === 0) {
    await pool.query(
      'update reinforcement_sessions set status=\'completed\' where id=$1 and user_id=$2',
      [req.params.sessionId, req.userId],
    )
  }
  res.json({ attempt: result.rows[0], isCorrect })
})

function sm2Update(card: any, rating: 'unknown' | 'hard' | 'good' | 'easy') {
  const quality = rating === 'unknown' ? 1 : rating === 'hard' ? 3 : rating === 'good' ? 4 : 5
  let easiness = Number(card.easiness || 2.5)
  let repetitions = Number(card.repetitions || 0)
  let interval = Number(card.interval_days || 0)
  let mastery = Number(card.mastery_level || 0)
  const lapses = Number(card.lapses || 0)

  easiness = Math.max(1.3, easiness + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))

  if (quality < 3) {
    repetitions = 0
    interval = 1
    mastery = Math.max(0, mastery - 2)
  } else {
    repetitions += 1
    interval = repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.max(1, Math.round(interval * easiness))
    mastery = Math.min(5, mastery + (rating === 'easy' ? 2 : rating === 'good' ? 1 : 0))
  }

  const lapsesNew = quality < 3 ? lapses + 1 : lapses
  const nextReview = new Date()
  nextReview.setHours(nextReview.getHours() + 12)
  if (interval >= 1) {
    nextReview.setTime(Date.now())
    nextReview.setDate(nextReview.getDate() + interval)
  }

  return {
    easiness,
    repetitions,
    interval,
    lapses: lapsesNew,
    mastery,
    nextReview: nextReview.toISOString(),
  }
}

app.get('/api/decks', requireAuth, async (req: AuthRequest, res) => {
  const result = await pool.query(
    `select d.*, count(f.id)::int as card_count,
      count(f.id) filter (where f.next_review_at <= now())::int as due_count
     from flashcard_decks d
     left join flashcards f on f.deck_id=d.id and f.user_id=d.user_id
     where d.user_id=$1 group by d.id order by d.favorite desc,d.updated_at desc`,
    [req.userId],
  )
  res.json({ decks: result.rows })
})

app.post('/api/decks', requireAuth, async (req: AuthRequest, res) => {
  const name = String(req.body.name || '').trim()
  if (!name || name.length > 120) return res.status(400).json({ message: 'Informe um nome válido para o baralho.' })
  const result = await pool.query(
    'insert into flashcard_decks (user_id,name,description,color,favorite) values ($1,$2,$3,$4,$5) returning *',
    [req.userId, name, String(req.body.description || '').slice(0, 500),
      String(req.body.color || '#3157a5'), Boolean(req.body.favorite)],
  )
  res.status(201).json({ deck: result.rows[0] })
})

app.put('/api/decks/:id', requireAuth, async (req: AuthRequest, res) => {
  const name = req.body.name !== undefined ? String(req.body.name).trim() : null
  if (name !== null && (!name || name.length > 120)) return res.status(400).json({ message: 'Informe um nome válido.' })
  const result = await pool.query(
    `update flashcard_decks set name=coalesce($1,name),description=coalesce($2,description),
     color=coalesce($3,color),favorite=coalesce($4,favorite),updated_at=now()
     where id=$5 and user_id=$6 returning *`,
    [name, req.body.description !== undefined ? String(req.body.description).slice(0, 500) : null,
      req.body.color !== undefined ? String(req.body.color) : null,
      req.body.favorite !== undefined ? Boolean(req.body.favorite) : null, req.params.id, req.userId],
  )
  if (!result.rows[0]) return res.status(404).json({ message: 'Baralho não encontrado.' })
  res.json({ deck: result.rows[0] })
})

app.delete('/api/decks/:id', requireAuth, async (req: AuthRequest, res) => {
  const result = await pool.query('delete from flashcard_decks where id=$1 and user_id=$2 returning id', [req.params.id, req.userId])
  if (!result.rows[0]) return res.status(404).json({ message: 'Baralho não encontrado.' })
  res.status(204).send()
})

app.get('/api/flashcards', requireAuth, async (req: AuthRequest, res) => {
  const search = String(req.query.search || '').trim()
  const deckId = String(req.query.deckId || '')
  const params: any[] = [req.userId]
  let where = 'where f.user_id=$1'
  if (deckId) {
    params.push(deckId)
    where += ` and f.deck_id=$${params.length}`
  }
  if (search) {
    params.push(`%${search}%`)
    where += ` and (f.question ilike $${params.length} or f.answer ilike $${params.length} or f.topic_name ilike $${params.length} or exists (select 1 from unnest(f.tags) tag where tag ilike $${params.length}))`
  }
  const result = await pool.query(
    `select f.*,d.name as deck_name
     from flashcards f left join flashcard_decks d on d.id=f.deck_id
     ${where} order by f.next_review_at asc,f.updated_at desc limit 500`,
    params,
  )
  res.json({ flashcards: result.rows })
})

app.post('/api/flashcards', requireAuth, async (req: AuthRequest, res) => {
  const question = String(req.body.question || '').trim()
  const answer = String(req.body.answer || '').trim()
  if (!question || !answer) return res.status(400).json({ message: 'Pergunta e resposta são obrigatórias.' })
  if (question.length > 5000 || answer.length > 10000) return res.status(400).json({ message: 'Flashcard excede o limite de texto.' })
  if (req.body.deckId) {
    const deck = await pool.query('select id from flashcard_decks where id=$1 and user_id=$2', [req.body.deckId, req.userId])
    if (!deck.rows[0]) return res.status(404).json({ message: 'Baralho não encontrado.' })
  }
  const result = await pool.query(
    `insert into flashcards
     (user_id,deck_id,question,answer,subject_name,topic_name,subsubject,tags,difficulty,
      source,observation,origin_type,origin_id,favorite)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning *`,
    [req.userId, req.body.deckId || null, question, answer,
      String(req.body.subjectName || '').trim(), String(req.body.topicName || '').trim(),
      String(req.body.subsubject || '').trim(),
      Array.isArray(req.body.tags) ? req.body.tags.map((tag: unknown) => String(tag).trim()).filter(Boolean).slice(0, 20) : [],
      ['easy', 'medium', 'hard'].includes(req.body.difficulty) ? req.body.difficulty : 'medium',
      String(req.body.source || '').trim(), String(req.body.observation || '').trim(),
      String(req.body.originType || 'manual'), req.body.originId || null, Boolean(req.body.favorite)],
  )
  res.status(201).json({ flashcard: result.rows[0] })
})

app.post('/api/flashcards/:id/duplicate', requireAuth, async (req: AuthRequest, res) => {
  const source = await pool.query('select * from flashcards where id=$1 and user_id=$2', [req.params.id, req.userId])
  if (!source.rows[0]) return res.status(404).json({ message: 'Flashcard não encontrado.' })
  const card = source.rows[0]
  const result = await pool.query(
    `insert into flashcards
     (user_id,deck_id,question,answer,subject_name,topic_name,subsubject,tags,difficulty,source,observation,origin_type,origin_id,favorite)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning *`,
    [req.userId, card.deck_id, `${card.question}`, card.answer, card.subject_name, card.topic_name,
      card.subsubject, card.tags, card.difficulty, card.source, card.observation,
      card.origin_type, card.origin_id, card.favorite],
  )
  res.status(201).json({ flashcard: result.rows[0] })
})

app.put('/api/flashcards/:id', requireAuth, async (req: AuthRequest, res) => {
  const question = req.body.question !== undefined ? String(req.body.question).trim() : null
  const answer = req.body.answer !== undefined ? String(req.body.answer).trim() : null
  if (question !== null && !question) return res.status(400).json({ message: 'A pergunta não pode ficar vazia.' })
  if (answer !== null && !answer) return res.status(400).json({ message: 'A resposta não pode ficar vazia.' })
  const result = await pool.query(
    `update flashcards set
       question=coalesce($1,question),answer=coalesce($2,answer),
       subject_name=coalesce($3,subject_name),topic_name=coalesce($4,topic_name),
       subsubject=coalesce($5,subsubject),
       tags=coalesce($6,tags),difficulty=coalesce($7,difficulty),
       source=coalesce($8,source),observation=coalesce($9,observation),
       deck_id=coalesce($10,deck_id),favorite=coalesce($11,favorite),updated_at=now()
     where id=$12 and user_id=$13 returning *`,
    [question, answer,
      req.body.subjectName !== undefined ? String(req.body.subjectName).trim() : null,
      req.body.topicName !== undefined ? String(req.body.topicName).trim() : null,
      req.body.subsubject !== undefined ? String(req.body.subsubject).trim() : null,
      req.body.tags !== undefined ? req.body.tags : null,
      req.body.difficulty !== undefined ? req.body.difficulty : null,
      req.body.source !== undefined ? String(req.body.source).trim() : null,
      req.body.observation !== undefined ? String(req.body.observation).trim() : null,
      req.body.deckId !== undefined ? req.body.deckId : null,
      req.body.favorite !== undefined ? Boolean(req.body.favorite) : null,
      req.params.id, req.userId],
  )
  if (!result.rows[0]) return res.status(404).json({ message: 'Flashcard não encontrado.' })
  res.json({ flashcard: result.rows[0] })
})

app.delete('/api/flashcards/:id', requireAuth, async (req: AuthRequest, res) => {
  const result = await pool.query('delete from flashcards where id=$1 and user_id=$2 returning id', [req.params.id, req.userId])
  if (!result.rows[0]) return res.status(404).json({ message: 'Flashcard não encontrado.' })
  res.status(204).send()
})

app.post('/api/review-sessions', requireAuth, async (req: AuthRequest, res) => {
  const sessionType = ['quick', 'normal', 'deep'].includes(req.body.sessionType) ? req.body.sessionType : 'normal'
  const limit = sessionType === 'quick' ? 10 : sessionType === 'deep' ? 50 : 25
  const cards = await pool.query(
    `select f.*,
      case
        when f.next_review_at < now() then 4
        when f.next_review_at <= now() + interval '1 day' then 3
        when f.mastery_level <= 1 then 2
        else 1
      end as priority
     from flashcards f
     where f.user_id=$1 and f.next_review_at <= now() + interval '2 days'
     order by priority desc,f.next_review_at asc limit $2`,
    [req.userId, limit],
  )
  const result = await pool.query(
    'insert into review_sessions (user_id,session_type) values ($1,$2) returning *',
    [req.userId, sessionType],
  )
  res.status(201).json({ session: result.rows[0], cards: cards.rows })
})

app.post('/api/flashcards/:id/review', requireAuth, async (req: AuthRequest, res) => {
  const rating = String(req.body.rating || '')
  if (!['unknown', 'hard', 'good', 'easy'].includes(rating)) {
    return res.status(400).json({ message: 'Avaliação inválida.' })
  }
  const source = await pool.query('select * from flashcards where id=$1 and user_id=$2', [req.params.id, req.userId])
  if (!source.rows[0]) return res.status(404).json({ message: 'Flashcard não encontrado.' })
  const updated = sm2Update(source.rows[0], rating as 'unknown' | 'hard' | 'good' | 'easy')
  const card = await pool.query(
    `update flashcards set easiness=$1,interval_days=$2,repetitions=$3,lapses=$4,
     mastery_level=$5,next_review_at=$6,last_reviewed_at=now(),updated_at=now()
     where id=$7 and user_id=$8 returning *`,
    [updated.easiness, updated.interval, updated.repetitions, updated.lapses, updated.mastery,
      updated.nextReview, req.params.id, req.userId],
  )
  await pool.query(
    `insert into flashcard_reviews
     (user_id,flashcard_id,rating,response_time_seconds,previous_interval,new_interval,
      previous_mastery,new_mastery,next_review_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [req.userId, req.params.id, rating,
      req.body.responseTimeSeconds ? Number(req.body.responseTimeSeconds) : null,
      source.rows[0].interval_days, updated.interval,
      source.rows[0].mastery_level, updated.mastery, updated.nextReview],
  )
  res.json({ flashcard: card.rows[0], schedule: updated })
})

app.get('/api/review/dashboard', requireAuth, async (req: AuthRequest, res) => {
  const result = await pool.query(
    `select
       count(*) filter (where next_review_at <= now())::int as overdue,
       count(*) filter (where next_review_at::date=now()::date)::int as today,
       count(*) filter (where next_review_at > now() and next_review_at <= now()+interval '7 days')::int as upcoming,
       count(*) filter (where mastery_level between 1 and 3)::int as learning,
       count(*) filter (where mastery_level>=4)::int as mastered,
       count(*)::int as total
     from flashcards where user_id=$1`,
    [req.userId],
  )
  const sessions = await pool.query(
    'select * from review_sessions where user_id=$1 order by started_at desc limit 5',
    [req.userId],
  )
  res.json({ dashboard: result.rows[0], recentSessions: sessions.rows })
})

app.put('/api/review-sessions/:id', requireAuth, async (req: AuthRequest, res) => {
  const result = await pool.query(
    `update review_sessions set status='completed',
       cards_reviewed=$1,correct_count=$2,difficulty_count=$3,unknown_count=$4,
       elapsed_seconds=$5,completed_at=now()
     where id=$6 and user_id=$7 and status='active' returning *`,
    [Number(req.body.cardsReviewed || 0), Number(req.body.correctCount || 0),
      Number(req.body.difficultyCount || 0), Number(req.body.unknownCount || 0),
      Number(req.body.elapsedSeconds || 0), req.params.id, req.userId],
  )
  if (!result.rows[0]) return res.status(404).json({ message: 'Sessão não encontrada ou já concluída.' })
  res.json({ session: result.rows[0] })
})

app.get('/api/mind-maps', requireAuth, async (req: AuthRequest, res) => {
  const search = String(req.query.search || '').trim()
  const params: any[] = [req.userId]
  let where = 'where user_id=$1'
  if (search) {
    params.push(`%${search}%`)
    where += ` and (title ilike $2 or description ilike $2 or subject_name ilike $2 or topic_name ilike $2)`
  }
  const result = await pool.query(`select * from mind_maps ${where} order by updated_at desc limit 200`, params)
  res.json({ maps: result.rows })
})

app.post('/api/mind-maps', requireAuth, async (req: AuthRequest, res) => {
  const title = String(req.body.title || '').trim()
  if (!title) return res.status(400).json({ message: 'Informe um título para o mapa.' })
  const data = req.body.data && typeof req.body.data === 'object'
    ? req.body.data : { nodes: [{ id: 'root', label: title, parentId: null, color: '#3157a5' }], connections: [] }
  const result = await pool.query(
    `insert into mind_maps
     (user_id,title,description,subject_name,topic_name,tags,source,origin_type,origin_id,data,favorite)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
    [req.userId, title, String(req.body.description || '').slice(0, 2000),
      String(req.body.subjectName || ''), String(req.body.topicName || ''),
      Array.isArray(req.body.tags) ? req.body.tags : [], String(req.body.source || ''),
      String(req.body.originType || 'manual'), req.body.originId || null, JSON.stringify(data),
      Boolean(req.body.favorite)],
  )
  res.status(201).json({ map: result.rows[0] })
})

app.put('/api/mind-maps/:id', requireAuth, async (req: AuthRequest, res) => {
  const result = await pool.query(
    `update mind_maps set
       title=coalesce($1,title),description=coalesce($2,description),
       subject_name=coalesce($3,subject_name),topic_name=coalesce($4,topic_name),
       tags=coalesce($5,tags),source=coalesce($6,source),
       data=coalesce($7,data),favorite=coalesce($8,favorite),updated_at=now()
     where id=$9 and user_id=$10 returning *`,
    [req.body.title !== undefined ? String(req.body.title).trim() : null,
      req.body.description !== undefined ? String(req.body.description).slice(0, 2000) : null,
      req.body.subjectName !== undefined ? String(req.body.subjectName) : null,
      req.body.topicName !== undefined ? String(req.body.topicName) : null,
      req.body.tags !== undefined ? req.body.tags : null,
      req.body.source !== undefined ? String(req.body.source) : null,
      req.body.data !== undefined ? JSON.stringify(req.body.data) : null,
      req.body.favorite !== undefined ? Boolean(req.body.favorite) : null,
      req.params.id, req.userId],
  )
  if (!result.rows[0]) return res.status(404).json({ message: 'Mapa mental não encontrado.' })
  res.json({ map: result.rows[0] })
})

app.delete('/api/mind-maps/:id', requireAuth, async (req: AuthRequest, res) => {
  const result = await pool.query('delete from mind_maps where id=$1 and user_id=$2 returning id', [req.params.id, req.userId])
  if (!result.rows[0]) return res.status(404).json({ message: 'Mapa mental não encontrado.' })
  res.status(204).send()
})

app.post('/api/mind-maps/generate', requireAuth, async (req: AuthRequest, res) => {
  const content = String(req.body.content || req.body.topic || '').trim()
  if (!content) return res.status(400).json({ message: 'Informe o tema ou conteúdo do mapa.' })
  if (content.length > 12000) return res.status(400).json({ message: 'Conteúdo excede o limite de 12000 caracteres.' })
  const prompt = `Crie um mapa mental didático em português.
Retorne somente JSON válido:
{"title":"...","nodes":[{"id":"root","label":"conceito central","parentId":null,"color":"#3157a5"},{"id":"n1","label":"ramo principal","parentId":"root","color":"#3157a5"}],"connections":[]}
Use poucos nós objetivos, sem inventar leis ou referências. Conteúdo: ${content}`
  try {
    const providerResult = await generateWithProvider(
      'Você organiza conhecimento em mapas mentais hierárquicos e retorna somente JSON válido.',
      [{ role: 'user', content: prompt }],
    )
    let parsed: { title?: string; nodes?: any[]; connections?: any[] }
    try {
      parsed = JSON.parse(providerResult.content.replace(/```json|```/gi, '').trim())
    } catch {
      throw new AIProviderError('A IA não conseguiu estruturar o mapa mental.', 502)
    }
    if (!Array.isArray(parsed.nodes) || !parsed.nodes.length) throw new AIProviderError('A IA não gerou nós válidos.', 502)
    const result = await pool.query(
      `insert into mind_maps
       (user_id,title,description,subject_name,topic_name,tags,source,origin_type,origin_id,data)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
      [req.userId, String(parsed.title || 'Mapa gerado').slice(0, 180),
        String(req.body.description || ''), String(req.body.subjectName || ''),
        String(req.body.topicName || ''), [], String(req.body.source || ''),
        'ai', req.body.originId || null,
        JSON.stringify({ nodes: parsed.nodes, connections: parsed.connections || [] })],
    )
    await pool.query(
      `insert into learning_usage (user_id,generation_type,provider,model,status,estimated_tokens)
       values ($1,'mind_map',$2,$3,'success',$4)`,
      [req.userId, process.env.AI_PROVIDER || 'ollama', providerResult.model, providerResult.estimatedTokens],
    )
    res.status(201).json({ map: result.rows[0] })
  } catch (error) {
    if (error instanceof AIProviderError) return res.status(error.status).json({ message: error.message })
    throw error
  }
})

app.get('/api/summaries', requireAuth, async (req: AuthRequest, res) => {
  const search = String(req.query.search || '').trim()
  const params: any[] = [req.userId]
  let where = 'where user_id=$1'
  if (search) {
    params.push(`%${search}%`)
    where += ` and (title ilike $2 or content ilike $2 or subject_name ilike $2 or topic_name ilike $2)`
  }
  const result = await pool.query(`select * from summaries ${where} order by favorite desc,updated_at desc limit 200`, params)
  res.json({ summaries: result.rows })
})

app.post('/api/summaries', requireAuth, async (req: AuthRequest, res) => {
  const title = String(req.body.title || '').trim()
  if (!title) return res.status(400).json({ message: 'Informe um título para o resumo.' })
  const result = await pool.query(
    `insert into summaries
     (user_id,title,summary_type,size,subject_name,topic_name,content,tags,source,origin_type,origin_id,favorite)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`,
    [req.userId, title,
      ['complete','simplified','exam','quick','comparative','errors'].includes(req.body.summaryType) ? req.body.summaryType : 'complete',
      ['short','medium','complete'].includes(req.body.size) ? req.body.size : 'medium',
      String(req.body.subjectName || ''), String(req.body.topicName || ''),
      String(req.body.content || '').slice(0, 100000),
      Array.isArray(req.body.tags) ? req.body.tags : [], String(req.body.source || ''),
      String(req.body.originType || 'manual'), req.body.originId || null, Boolean(req.body.favorite)],
  )
  res.status(201).json({ summary: result.rows[0] })
})

app.put('/api/summaries/:id', requireAuth, async (req: AuthRequest, res) => {
  const title = req.body.title !== undefined ? String(req.body.title).trim() : null
  if (title !== null && !title) return res.status(400).json({ message: 'O título não pode ficar vazio.' })
  const result = await pool.query(
    `update summaries set title=coalesce($1,title),summary_type=coalesce($2,summary_type),
       size=coalesce($3,size),subject_name=coalesce($4,subject_name),
       topic_name=coalesce($5,topic_name),content=coalesce($6,content),
       tags=coalesce($7,tags),source=coalesce($8,source),
       favorite=coalesce($9,favorite),updated_at=now()
     where id=$10 and user_id=$11 returning *`,
    [title, req.body.summaryType || null, req.body.size || null,
      req.body.subjectName !== undefined ? String(req.body.subjectName) : null,
      req.body.topicName !== undefined ? String(req.body.topicName) : null,
      req.body.content !== undefined ? String(req.body.content).slice(0, 100000) : null,
      req.body.tags !== undefined ? req.body.tags : null,
      req.body.source !== undefined ? String(req.body.source) : null,
      req.body.favorite !== undefined ? Boolean(req.body.favorite) : null,
      req.params.id, req.userId],
  )
  if (!result.rows[0]) return res.status(404).json({ message: 'Resumo não encontrado.' })
  res.json({ summary: result.rows[0] })
})

app.delete('/api/summaries/:id', requireAuth, async (req: AuthRequest, res) => {
  const result = await pool.query('delete from summaries where id=$1 and user_id=$2 returning id', [req.params.id, req.userId])
  if (!result.rows[0]) return res.status(404).json({ message: 'Resumo não encontrado.' })
  res.status(204).send()
})

app.post('/api/summaries/generate', requireAuth, async (req: AuthRequest, res) => {
  const content = String(req.body.content || req.body.topic || '').trim()
  if (!content) return res.status(400).json({ message: 'Informe o tema ou conteúdo do resumo.' })
  if (content.length > 12000) return res.status(400).json({ message: 'Conteúdo excede o limite de 12000 caracteres.' })
  const summaryType = String(req.body.summaryType || 'complete')
  const size = String(req.body.size || 'medium')
  const sizeInstruction = size === 'short' ? 'Resumo curto, até 300 palavras.' : size === 'complete' ? 'Resumo completo e organizado.' : 'Resumo médio e objetivo.'
  const prompt = `Crie um resumo em português brasileiro.
Tipo: ${summaryType}.
Tamanho: ${sizeInstruction}
Priorize o conteúdo fornecido. Não invente leis, artigos, jurisprudência ou referências.
Use Markdown organizado com título, conceitos, exemplos, pegadinhas e bizus quando aplicável.
Conteúdo: ${content}`
  try {
    const providerResult = await generateWithProvider(
      'Você cria resumos educacionais seguros e didáticos em português brasileiro.',
      [{ role: 'user', content: prompt }],
    )
    const title = String(req.body.title || 'Resumo gerado').trim().slice(0, 180)
    const result = await pool.query(
      `insert into summaries
       (user_id,title,summary_type,size,subject_name,topic_name,content,tags,source,origin_type,origin_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'ai',$10) returning *`,
      [req.userId, title, summaryType, size,
        String(req.body.subjectName || ''), String(req.body.topicName || ''),
        providerResult.content, [], String(req.body.source || ''), req.body.originId || null],
    )
    await pool.query(
      `insert into learning_usage (user_id,generation_type,provider,model,status,estimated_tokens)
       values ($1,'summary',$2,$3,'success',$4)`,
      [req.userId, process.env.AI_PROVIDER || 'ollama', providerResult.model, providerResult.estimatedTokens],
    )
    res.status(201).json({ summary: result.rows[0] })
  } catch (error) {
    if (error instanceof AIProviderError) return res.status(error.status).json({ message: error.message })
    throw error
  }
})

app.post('/api/flashcards/generate', requireAuth, async (req: AuthRequest, res) => {
  const content = String(req.body.content || req.body.topic || '').trim()
  if (!content) return res.status(400).json({ message: 'Informe o tema ou conteúdo dos flashcards.' })
  if (content.length > 12000) return res.status(400).json({ message: 'Conteúdo excede o limite de 12000 caracteres.' })
  const count = [5,10,15,20].includes(Number(req.body.count)) ? Number(req.body.count) : 5
  const difficulty = ['easy','medium','hard'].includes(req.body.difficulty) ? req.body.difficulty : 'medium'
  const prompt = `Crie exatamente ${count} flashcards objetivos em português.
Dificuldade: ${difficulty}.
Retorne somente JSON válido:
{"cards":[{"question":"Pergunta clara","answer":"Resposta objetiva","subjectName":"...","topicName":"...","tags":["..."]}]}
Evite perguntas repetitivas, respostas vagas e informações não confirmadas.
Conteúdo: ${content}`
  try {
    const providerResult = await generateWithProvider(
      'Você cria flashcards didáticos para concursos policiais. Não invente dados oficiais e retorne apenas JSON válido.',
      [{ role:'user', content: prompt }],
    )
    let parsed: { cards?: Array<{question:string;answer:string;subjectName?:string;topicName?:string;tags?:string[]}> }
    try {
      parsed = JSON.parse(providerResult.content.replace(/```json|```/gi, '').trim())
    } catch {
      throw new AIProviderError('A IA não conseguiu estruturar os flashcards.', 502)
    }
    const cards = (parsed.cards || []).slice(0,count)
    if (!cards.length) throw new AIProviderError('A IA não gerou flashcards válidos.', 502)
    await pool.query(
      `insert into learning_usage (user_id,generation_type,provider,model,status,estimated_tokens)
       values ($1,'flashcards',$2,$3,'success',$4)`,
      [req.userId, process.env.AI_PROVIDER || 'ollama', providerResult.model, providerResult.estimatedTokens],
    )
    res.json({ cards })
  } catch (error) {
    if (error instanceof AIProviderError) return res.status(error.status).json({ message: error.message })
    throw error
  }
})

const distPath = path.resolve(process.cwd(), 'dist')
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath))
  app.get('*splat', (req, res, next) => {
    if (req.path.startsWith('/api')) return next()
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('API_ERROR:', error)
  res.status(500).json({ message: 'Erro interno do servidor.' })
})

app.listen(port, () => console.log(`PolíciaStudy API ouvindo em http://localhost:${port}`))
