import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, CheckCircle2, CircleDashed, ListChecks, Plus, UserRound, Target } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'
import type { ExamPreference, Profile, Subject, Topic } from '../types/database'

export function Dashboard() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [exam, setExam] = useState<ExamPreference | null>(null)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [topics, setTopics] = useState<Topic[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    Promise.all([
      api<{ profile: Profile | null }>('/profile'),
      api<{ exam: ExamPreference | null }>('/exam'),
      api<{ subjects: Subject[]; topics: Topic[] }>('/subjects'),
    ]).then(([profileResult, examResult, dataResult]) => {
      setProfile(profileResult.profile)
      setExam(examResult.exam)
      setSubjects(dataResult.subjects)
      setTopics(dataResult.topics)
      setLoading(false)
    })
  }, [user])

  const completed = topics.filter(topic => topic.study_status === 'studied' || topic.study_status === 'reviewed').length
  const pending = topics.length - completed
  const progress = topics.length ? Math.round((completed / topics.length) * 100) : 0
  const name = profile?.full_name?.split(' ')[0] || user?.full_name?.split(' ')[0] || 'Estudante'
  const date = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())

  if (loading) return <div className="app-loading"><span className="spinner" />Carregando dashboard...</div>

  return (
    <div className="page">
      <header className="welcome-header">
        <div><p className="date-label">{date}</p><h1>Olá, {name}</h1><p>{exam?.exam_name ? `Preparação para ${exam.exam_name}${exam.desired_position ? ` · ${exam.desired_position}` : ''}` : 'Seu plano de estudos começa aqui.'}</p></div>
      </header>
      {subjects.length === 0 && topics.length === 0 && (
        <div className="onboarding-banner"><div><p className="eyebrow">Primeiros passos</p><h2>Organize sua preparação</h2><p>Cadastre as disciplinas do seu concurso para acompanhar seu progresso real.</p></div><Link className="button primary" to="/disciplinas"><Plus size={18} />Adicionar disciplina</Link></div>
      )}
      <section className="metrics-grid" aria-label="Resumo do progresso">
        <article className="metric-card"><span className="metric-icon blue"><BookOpen size={20} /></span><div><p>Disciplinas</p><strong>{subjects.length}</strong></div></article>
        <article className="metric-card"><span className="metric-icon violet"><ListChecks size={20} /></span><div><p>Assuntos cadastrados</p><strong>{topics.length}</strong></div></article>
        <article className="metric-card"><span className="metric-icon green"><CheckCircle2 size={20} /></span><div><p>Assuntos concluídos</p><strong>{completed}</strong></div></article>
        <article className="metric-card"><span className="metric-icon amber"><CircleDashed size={20} /></span><div><p>Assuntos pendentes</p><strong>{pending}</strong></div></article>
      </section>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-header"><div><p className="eyebrow">Sua preparação</p><h2>Disciplinas</h2></div><Link className="text-link" to="/disciplinas">Gerenciar</Link></div>
          {subjects.length === 0 ? (
            <div className="empty-state"><span className="empty-icon"><BookOpen size={22} /></span><h3>Nenhuma disciplina cadastrada</h3><p>Comece adicionando os conteúdos do seu concurso.</p><Link className="button secondary" to="/disciplinas">Adicionar disciplina</Link></div>
          ) : (
            <div className="discipline-progress">
              {subjects.map(subject => {
                const subjectTopics = topics.filter(topic => topic.subject_id === subject.id)
                const subjectCompleted = subjectTopics.filter(topic => topic.study_status === 'studied' || topic.study_status === 'reviewed').length
                const subjectProgress = subjectTopics.length ? Math.round(subjectCompleted / subjectTopics.length * 100) : 0
                return <div className="discipline-row" key={subject.id}><div className="discipline-label"><strong>{subject.name}</strong><span>{subjectCompleted}/{subjectTopics.length} concluídos</span></div><div className="progress-track"><span style={{ width: `${subjectProgress}%` }} /></div></div>
              })}
            </div>
          )}
        </section>
        <section className="panel progress-panel">
          <div className="panel-header"><div><p className="eyebrow">Visão geral</p><h2>Progresso dos estudos</h2></div></div>
          <div className="progress-ring" style={{ '--progress': `${progress * 3.6}deg` } as React.CSSProperties}><div><strong>{progress}%</strong><span>concluído</span></div></div>
          <p className="progress-caption">{topics.length ? `${completed} de ${topics.length} assuntos concluídos` : 'Cadastre assuntos para acompanhar seu progresso.'}</p>
        </section>
      </div>
      <section className="quick-actions">
        <Link className="quick-action" to="/disciplinas"><span><Plus size={18} /></span><div><strong>Adicionar disciplina</strong><p>Criar um novo conteúdo</p></div></Link>
        <Link className="quick-action" to="/disciplinas"><span><ListChecks size={18} /></span><div><strong>Adicionar assunto</strong><p>Organizar os temas</p></div></Link>
        <Link className="quick-action" to="/perfil"><span><UserRound size={18} /></span><div><strong>Editar perfil</strong><p>Atualizar seus dados</p></div></Link>
        <Link className="quick-action" to="/perfil"><span><Target size={18} /></span><div><strong>Configurar concurso</strong><p>Definir sua preparação</p></div></Link>
      </section>
    </div>
  )
}
