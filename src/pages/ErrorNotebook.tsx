import { useEffect, useState, type FormEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AlertTriangle, CheckCircle2, ClipboardCheck, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react'
import { api } from '../lib/api'
import './ErrorNotebook.css'

interface ErrorRecord {
  id: string
  statement: string
  subject_name: string
  topic_name: string
  subsubject: string
  difficulty: 'easy' | 'medium' | 'hard'
  status: 'pending' | 'reviewing' | 'corrected' | 'mastered'
  is_recurring: boolean
  primary_error_type?: string
  analysis_content?: string
  plan?: string[]
  created_at: string
  alternatives: string[]
  selected_answer: string
  correct_answer: string
  tags: string[]
}

interface PlanStep {
  id: string
  title: string
  position: number
  completed: boolean
}

interface ReinforcementAttempt {
  id: string
  position: number
  question: string
  alternatives: string[]
  correct_answer: string
  student_answer: string
  is_correct: boolean | null
  explanation: string
  answered_at: string | null
}

const statusLabels: Record<ErrorRecord['status'], string> = {
  pending: 'Pendente',
  reviewing: 'Em revisão',
  corrected: 'Corrigido',
  mastered: 'Dominado',
}

export function ErrorNotebook() {
  const [errors, setErrors] = useState<ErrorRecord[]>([])
  const [dashboard, setDashboard] = useState({ total: 0, pending: 0, recurring: 0, corrected: 0, mastered: 0, recoveryRate: null as number | null })
  const [selected, setSelected] = useState<ErrorRecord | null>(null)
  const [steps, setSteps] = useState<PlanStep[]>([])
  const [attempts, setAttempts] = useState<ReinforcementAttempt[]>([])
  const [sessionId, setSessionId] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [difficultyFilter, setDifficultyFilter] = useState('all')
  const [recurringFilter, setRecurringFilter] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [form, setForm] = useState({
    statement: '', subjectName: '', topicName: '', subsubject: '', board: '', exam: '', year: '',
    questionType: 'multiple_choice', alternatives: '', selectedAnswer: '', correctAnswer: '',
    personalComment: '', reasoning: '', confidence: 3, difficulty: 'medium', source: '', tags: '',
  })

  const load = async () => {
    setLoading(true)
    try {
      const [errorData, dashboardData] = await Promise.all([
        api<{ errors: ErrorRecord[] }>('/errors'),
        api<{ dashboard: typeof dashboard }>('/errors/dashboard'),
      ])
      setErrors(errorData.errors)
      setDashboard(dashboardData.dashboard)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar o caderno.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openError = async (item: ErrorRecord) => {
    setError('')
    setSuccess('')
    setAttempts([])
    setSessionId('')
    try {
      const data = await api<{ error: ErrorRecord; steps: PlanStep[] }>(`/errors/${item.id}`)
      setSelected(data.error)
      setSteps(data.steps)
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'Não foi possível abrir o erro.')
    }
  }

  const submitError = async (event: FormEvent) => {
    event.preventDefault()
    setWorking(true)
    setError('')
    try {
      const alternatives = form.alternatives.split('\n').map(item => item.trim()).filter(Boolean)
      await api('/errors', {
        method: 'POST',
        body: JSON.stringify({
          statement: form.statement,
          subjectName: form.subjectName,
          topicName: form.topicName,
          subsubject: form.subsubject,
          board: form.board,
          exam: form.exam,
          year: form.year ? Number(form.year) : null,
          questionType: form.questionType,
          alternatives,
          selectedAnswer: form.selectedAnswer,
          correctAnswer: form.correctAnswer,
          personalComment: form.personalComment,
          reasoning: form.reasoning,
          confidence: Number(form.confidence),
          difficulty: form.difficulty,
          source: form.source,
          tags: form.tags.split(',').map(tag => tag.trim()).filter(Boolean),
        }),
      })
      setFormOpen(false)
      setSuccess('Erro registrado.')
      setForm({
        statement: '', subjectName: '', topicName: '', subsubject: '', board: '', exam: '', year: '',
        questionType: 'multiple_choice', alternatives: '', selectedAnswer: '', correctAnswer: '',
        personalComment: '', reasoning: '', confidence: 3, difficulty: 'medium', source: '', tags: '',
      })
      await load()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível registrar.')
    } finally {
      setWorking(false)
    }
  }

  const deleteError = async (item: ErrorRecord) => {
    if (!window.confirm('Excluir este erro registrado?')) return
    await api(`/errors/${item.id}`, { method: 'DELETE' })
    if (selected?.id === item.id) setSelected(null)
    await load()
  }

  const analyzeError = async () => {
    if (!selected) return
    setWorking(true)
    setError('')
    setSuccess('')
    try {
      await api(`/errors/${selected.id}/analyze`, { method: 'POST' })
      await openError(selected)
      setSuccess('Análise concluída.')
      await load()
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : 'Não foi possível analisar o erro.')
    } finally {
      setWorking(false)
    }
  }

  const toggleStep = async (step: PlanStep) => {
    if (!selected) return
    try {
      const data = await api<{ step: PlanStep }>(`/errors/${selected.id}/plan/${step.id}`, {
        method: 'PUT',
        body: JSON.stringify({ completed: !step.completed }),
      })
      setSteps(previous => previous.map(item => item.id === step.id ? data.step : item))
    } catch (stepError) {
      setError(stepError instanceof Error ? stepError.message : 'Não foi possível atualizar a etapa.')
    }
  }

  const startReinforcement = async () => {
    if (!selected) return
    setWorking(true)
    setError('')
    try {
      const data = await api<{ session: { id: string }; questions: ReinforcementAttempt[] }>(`/errors/${selected.id}/reinforcement`, {
        method: 'POST',
        body: JSON.stringify({ count: 3, difficulty: 'progressive', format: 'multiple_choice' }),
      })
      setSessionId(data.session.id)
      setAttempts(data.questions.map((question, index) => ({
        ...question,
        position: index + 1,
        student_answer: '',
        is_correct: null,
        answered_at: null,
      })))
    } catch (reinforcementError) {
      setError(reinforcementError instanceof Error ? reinforcementError.message : 'Não foi possível gerar questões.')
    } finally {
      setWorking(false)
    }
  }

  const answerAttempt = async (attempt: ReinforcementAttempt, answer: string) => {
    if (!selected || !sessionId || attempt.answered_at) return
    try {
      const data = await api<{ attempt: ReinforcementAttempt }>(`/errors/${selected.id}/reinforcement/${sessionId}/attempt/${attempt.id}`, {
        method: 'PUT',
        body: JSON.stringify({ answer }),
      })
      setAttempts(previous => previous.map(item => item.id === attempt.id ? data.attempt : item))
    } catch (answerError) {
      setError(answerError instanceof Error ? answerError.message : 'Não foi possível registrar a resposta.')
    }
  }

  const filtered = errors.filter(item => {
    const term = search.toLowerCase()
    const matchesSearch = !term || [
      item.statement, item.subject_name, item.topic_name, item.subsubject,
      item.primary_error_type, ...(item.tags || []),
    ].join(' ').toLowerCase().includes(term)
    return matchesSearch
      && (statusFilter === 'all' || item.status === statusFilter)
      && (difficultyFilter === 'all' || item.difficulty === difficultyFilter)
      && (!recurringFilter || item.is_recurring)
  })

  return (
    <div className="error-notebook">
      <header className="notebook-header">
        <div><p className="eyebrow">Aprendizado</p><h1>Caderno de erros</h1></div>
        <button className="button primary" onClick={() => setFormOpen(true)}><Plus size={18} />Registrar erro</button>
      </header>
      {error && <div className="alert error">{error}</div>}
      {success && <div className="alert success">{success}</div>}
      <section className="notebook-metrics">
        <article><span className="metric-icon blue"><ClipboardCheck size={19} /></span><div><p>Total registrados</p><strong>{dashboard.total}</strong></div></article>
        <article><span className="metric-icon amber"><AlertTriangle size={19} /></span><div><p>Pendentes</p><strong>{dashboard.pending}</strong></div></article>
        <article><span className="metric-icon violet"><RotateCcw size={19} /></span><div><p>Recorrentes</p><strong>{dashboard.recurring}</strong></div></article>
        <article><span className="metric-icon green"><CheckCircle2 size={19} /></span><div><p>Corrigidos</p><strong>{dashboard.corrected}</strong></div></article>
        <article><span className="metric-icon blue"><CheckCircle2 size={19} /></span><div><p>Taxa de recuperação</p><strong>{dashboard.recoveryRate === null ? '—' : `${dashboard.recoveryRate}%`}</strong></div></article>
      </section>
      <div className="notebook-tools">
        <label className="notebook-search"><Search size={17} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Pesquisar enunciado, disciplina, assunto ou tags" /></label>
        <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} aria-label="Filtrar status"><option value="all">Todos os status</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select value={difficultyFilter} onChange={event => setDifficultyFilter(event.target.value)} aria-label="Filtrar dificuldade"><option value="all">Todas as dificuldades</option><option value="easy">Fácil</option><option value="medium">Média</option><option value="hard">Difícil</option></select>
        <label className="recurring-filter"><input type="checkbox" checked={recurringFilter} onChange={event => setRecurringFilter(event.target.checked)} />Só recorrentes</label>
      </div>
      {loading ? <div className="app-loading"><span className="spinner" />Carregando caderno...</div> : filtered.length === 0 ? (
        <div className="error-empty"><span><AlertTriangle size={24} /></span><h2>Nenhum erro encontrado</h2><p>{errors.length ? 'Ajuste os filtros ou termine a pesquisa.' : 'Registre sua primeira questão errada para começar a identificar padrões.'}</p>{!errors.length && <button className="button primary" onClick={() => setFormOpen(true)}><Plus size={18} />Registrar primeiro erro</button>}</div>
      ) : (
        <div className="error-layout">
          <div className="error-list">
            {filtered.map(item => (
              <button className={`error-item ${selected?.id === item.id ? 'active' : ''}`} key={item.id} onClick={() => openError(item)}>
                <div><strong>{item.subject_name || 'Disciplina não informada'}</strong>{item.topic_name && <span>{item.topic_name}</span>}</div>
                <p>{item.statement}</p>
                <div className="error-item-footer"><span className={`status status-${item.status}`}>{statusLabels[item.status]}</span>{item.is_recurring && <em>Recorrente</em>}<span>{item.difficulty === 'easy' ? 'Fácil' : item.difficulty === 'medium' ? 'Média' : 'Difícil'}</span></div>
              </button>
            ))}
          </div>
          {selected ? (
            <article className="error-detail">
              <div className="detail-header"><div><p className="eyebrow">{selected.subject_name || 'Erro registrado'}</p><h2>{selected.topic_name || 'Sem assunto informado'}</h2></div><button className="icon-button danger" onClick={() => deleteError(selected)} aria-label="Excluir erro"><Trash2 size={17} /></button></div>
              <p className="error-statement">{selected.statement}</p>
              <div className="answer-summary"><div><span>Sua resposta</span><strong>{selected.selected_answer || 'Não informada'}</strong></div><div><span>Resposta correta</span><strong>{selected.correct_answer || 'Não informada'}</strong></div></div>
              {selected.analysis_content ? (
                <>
                  <section className="analysis-section"><div className="detail-section-title"><h3>Entenda seu erro</h3>{selected.primary_error_type && <span>{selected.primary_error_type}</span>}</div><ReactMarkdown remarkPlugins={[remarkGfm]}>{selected.analysis_content}</ReactMarkdown></section>
                  {steps.length > 0 && <section className="plan-section"><h3>Plano de correção</h3>{steps.map(step => <label className={step.completed ? 'completed' : ''} key={step.id}><input type="checkbox" checked={step.completed} onChange={() => toggleStep(step)} /><span>{step.title}</span></label>)}</section>}
                </>
              ) : (
                <div className="analysis-prompt"><BotIcon /><div><h3>Analise este erro com IA</h3><p>Identifique a causa provável e receba uma explicação personalizada.</p></div><button className="button primary" disabled={working} onClick={analyzeError}>{working ? 'Analisando...' : 'Analisar meu erro'}</button></div>
              )}
              {selected.analysis_content && <button className="button secondary train-button" disabled={working} onClick={startReinforcement}><RotateCcw size={17} />Treinar esse erro</button>}
              {attempts.length > 0 && <section className="reinforcement-section"><h3>Questões de reforço</h3><p className="generated-label">Questões geradas por inteligência artificial — não são questões oficiais.</p>{attempts.map(attempt => (
                <article className="reinforcement-card" key={attempt.id}><h4>{attempt.position}. {attempt.question}</h4>{attempt.alternatives?.map((alternative, index) => <button key={`${attempt.id}-${index}`} disabled={Boolean(attempt.answered_at)} className={attempt.answered_at ? (alternative === attempt.correct_answer ? 'correct' : alternative === attempt.student_answer ? 'incorrect' : '') : ''} onClick={() => answerAttempt(attempt, alternative)}>{alternative}</button>)}{attempt.answered_at && <div className={`answer-feedback ${attempt.is_correct ? 'correct' : 'incorrect'}`}><strong>{attempt.is_correct ? 'Resposta correta' : 'Resposta incorreta'}</strong><p>{attempt.explanation}</p></div>}</article>
              ))}</section>}
            </article>
          ) : <div className="detail-placeholder"><h2>Selecione um erro</h2><p>Abra um registro para analisar o raciocínio e acompanhar a correção.</p></div>}
        </div>
      )}
      {formOpen && <div className="modal-backdrop" role="presentation"><div className="error-modal" role="dialog" aria-modal="true"><div className="modal-header"><h2>Registrar erro</h2><button className="icon-button" onClick={() => setFormOpen(false)} aria-label="Fechar"><X size={19} /></button></div><form onSubmit={submitError}>
        <label className="field span-2"><span>Enunciado da questão *</span><textarea className="form-control" rows={4} value={form.statement} onChange={event => setForm({ ...form, statement: event.target.value })} required /></label>
        <label className="field"><span>Disciplina</span><input className="form-control" value={form.subjectName} onChange={event => setForm({ ...form, subjectName: event.target.value })} /></label>
        <label className="field"><span>Assunto</span><input className="form-control" value={form.topicName} onChange={event => setForm({ ...form, topicName: event.target.value })} /></label>
        <label className="field"><span>Subassunto</span><input className="form-control" value={form.subsubject} onChange={event => setForm({ ...form, subsubject: event.target.value })} /></label>
        <label className="field"><span>Tipo de questão</span><select className="form-control" value={form.questionType} onChange={event => setForm({ ...form, questionType: event.target.value })}><option value="multiple_choice">Múltipla escolha</option><option value="true_false">Certo ou errado</option><option value="discursive">Discursiva</option></select></label>
        {form.questionType === 'multiple_choice' && <label className="field span-2"><span>Alternativas — uma por linha</span><textarea className="form-control" rows={4} value={form.alternatives} onChange={event => setForm({ ...form, alternatives: event.target.value })} /></label>}
        <label className="field"><span>Sua resposta</span><input className="form-control" value={form.selectedAnswer} onChange={event => setForm({ ...form, selectedAnswer: event.target.value })} /></label>
        <label className="field"><span>Resposta correta</span><input className="form-control" value={form.correctAnswer} onChange={event => setForm({ ...form, correctAnswer: event.target.value })} /></label>
        <label className="field span-2"><span>Seu raciocínio</span><textarea className="form-control" rows={3} value={form.reasoning} onChange={event => setForm({ ...form, reasoning: event.target.value })} /></label>
        <label className="field span-2"><span>Comentário pessoal</span><textarea className="form-control" rows={2} value={form.personalComment} onChange={event => setForm({ ...form, personalComment: event.target.value })} /></label>
        <label className="field"><span>Confiança</span><select className="form-control" value={form.confidence} onChange={event => setForm({ ...form, confidence: Number(event.target.value) })}><option value={1}>1 — muito baixa</option><option value={2}>2 — baixa</option><option value={3}>3 — média</option><option value={4}>4 — alta</option><option value={5}>5 — muito alta</option></select></label>
        <label className="field"><span>Dificuldade percebida</span><select className="form-control" value={form.difficulty} onChange={event => setForm({ ...form, difficulty: event.target.value })}><option value="easy">Fácil</option><option value="medium">Média</option><option value="hard">Difícil</option></select></label>
        <label className="field"><span>Banca</span><input className="form-control" value={form.board} onChange={event => setForm({ ...form, board: event.target.value })} /></label>
        <label className="field"><span>Concurso</span><input className="form-control" value={form.exam} onChange={event => setForm({ ...form, exam: event.target.value })} /></label>
        <label className="field"><span>Ano</span><input className="form-control" type="number" value={form.year} onChange={event => setForm({ ...form, year: event.target.value })} /></label>
        <label className="field"><span>Fonte</span><input className="form-control" value={form.source} onChange={event => setForm({ ...form, source: event.target.value })} /></label>
        <label className="field span-2"><span>Tags — separadas por vírgula</span><input className="form-control" value={form.tags} onChange={event => setForm({ ...form, tags: event.target.value })} /></label>
        <div className="modal-actions span-2"><button type="button" className="button secondary" onClick={() => setFormOpen(false)}>Cancelar</button><button className="button primary" disabled={working}>{working ? 'Salvando...' : 'Salvar erro'}</button></div>
      </form></div></div>}
    </div>
  )
}

function BotIcon() {
  return <span className="bot-analysis">IA</span>
}
