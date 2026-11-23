import { useEffect, useState, type FormEvent } from 'react'
import { ChevronDown, ChevronUp, Plus, Star, Pencil, Trash2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'
import type { Subject, Topic, StudyStatus } from '../types/database'

const statusLabels: Record<StudyStatus, string> = {
  not_started: 'Não iniciado',
  studying: 'Estudando',
  studied: 'Estudado',
  reviewed: 'Revisado',
}

export function Subjects() {
  const { user } = useAuth()
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [topics, setTopics] = useState<Topic[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [subjectModal, setSubjectModal] = useState(false)
  const [topicModal, setTopicModal] = useState<string | null>(null)
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null)
  const [subjectName, setSubjectName] = useState('')
  const [subjectPriority, setSubjectPriority] = useState(false)
  const [topicName, setTopicName] = useState('')
  const [topicStatus, setTopicStatus] = useState<StudyStatus>('not_started')
  const [topicNotes, setTopicNotes] = useState('')

  const load = async () => {
    if (!user) return
    setLoading(true)
    const data = await api<{ subjects: Subject[]; topics: Topic[] }>('/subjects')
    setSubjects(data.subjects)
    setTopics(data.topics)
    setLoading(false)
  }

  useEffect(() => { load() }, [user])

  const openSubject = (subject?: Subject) => {
    setEditingSubject(subject || null)
    setSubjectName(subject?.name || '')
    setSubjectPriority(subject?.priority || false)
    setSubjectModal(true)
  }

  const saveSubject = async (event: FormEvent) => {
    event.preventDefault()
    if (!user) return
    if (editingSubject) {
      await api(`/subjects/${editingSubject.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: subjectName.trim(), priority: subjectPriority }),
      })
    } else {
      await api('/subjects', {
        method: 'POST',
        body: JSON.stringify({ name: subjectName.trim(), priority: subjectPriority }),
      })
    }
    setSubjectModal(false)
    load()
  }

  const deleteSubject = async (subject: Subject) => {
    if (!window.confirm(`Excluir "${subject.name}" e todos os seus assuntos?`)) return
    await api(`/subjects/${subject.id}`, { method: 'DELETE' })
    load()
  }

  const openTopic = (subjectId: string) => {
    setTopicModal(subjectId)
    setTopicName('')
    setTopicStatus('not_started')
    setTopicNotes('')
  }

  const saveTopic = async (event: FormEvent) => {
    event.preventDefault()
    if (!user || !topicModal) return
    await api('/topics', {
      method: 'POST',
      body: JSON.stringify({
        subjectId: topicModal,
        name: topicName.trim(),
        studyStatus: topicStatus,
        notes: topicNotes.trim(),
      }),
    })
    setTopicModal(null)
    load()
  }

  const updateTopicStatus = async (topic: Topic, study_status: StudyStatus) => {
    await api(`/topics/${topic.id}`, {
      method: 'PUT',
      body: JSON.stringify({ studyStatus: study_status }),
    })
    load()
  }

  const deleteTopic = async (topic: Topic) => {
    if (!window.confirm(`Excluir o assunto "${topic.name}"?`)) return
    await api(`/topics/${topic.id}`, { method: 'DELETE' })
    load()
  }

  if (loading) return <div className="app-loading"><span className="spinner" />Carregando disciplinas...</div>

  return (
    <div className="page">
      <header className="page-header"><div><p className="eyebrow">Organização</p><h1>Disciplinas</h1></div><button className="button primary" onClick={() => openSubject()}><Plus size={18} />Nova disciplina</button></header>
      {subjects.length === 0 ? (
        <div className="empty-state large"><span className="empty-icon"><Plus size={24} /></span><h2>Cadastre sua primeira disciplina</h2><p>Organize os conteúdos do seu concurso em disciplinas e assuntos.</p><button className="button primary" onClick={() => openSubject()}><Plus size={18} />Adicionar disciplina</button></div>
      ) : (
        <div className="subject-list">
          {subjects.map(subject => {
            const subjectTopics = topics.filter(topic => topic.subject_id === subject.id)
            const completed = subjectTopics.filter(topic => topic.study_status === 'studied' || topic.study_status === 'reviewed').length
            const open = expanded === subject.id
            return (
              <article className="subject-card" key={subject.id}>
                <div className="subject-row">
                  <button className="subject-toggle" onClick={() => setExpanded(open ? null : subject.id)} aria-expanded={open}>
                    {subject.priority && <Star className="priority-star" size={17} fill="currentColor" />}
                    <div><h2>{subject.name}</h2><p>{subjectTopics.length} assuntos · {completed} concluídos</p></div>
                    {open ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </button>
                  <div className="subject-actions">
                    <button className="icon-button" onClick={() => openSubject(subject)} aria-label={`Editar ${subject.name}`}><Pencil size={17} /></button>
                    <button className="icon-button danger" onClick={() => deleteSubject(subject)} aria-label={`Excluir ${subject.name}`}><Trash2 size={17} /></button>
                  </div>
                </div>
                {open && (
                  <div className="topic-section">
                    {subjectTopics.length === 0 ? (
                      <p className="topic-empty">Nenhum assunto cadastrado.</p>
                    ) : subjectTopics.map(topic => (
                      <div className="topic-row" key={topic.id}>
                        <div className="topic-info"><strong>{topic.name}</strong>{topic.notes && <p>{topic.notes}</p>}</div>
                        <select className={`status-select status-${topic.study_status}`} value={topic.study_status} onChange={e => updateTopicStatus(topic, e.target.value as StudyStatus)} aria-label={`Status de ${topic.name}`}>
                          {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                        <button className="icon-button danger" onClick={() => deleteTopic(topic)} aria-label={`Excluir assunto ${topic.name}`}><Trash2 size={16} /></button>
                      </div>
                    ))}
                    <button className="button secondary" onClick={() => openTopic(subject.id)}><Plus size={17} />Adicionar assunto</button>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
      {subjectModal && <div className="modal-backdrop" role="presentation"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="subject-modal-title"><div className="modal-header"><h2 id="subject-modal-title">{editingSubject ? 'Editar disciplina' : 'Nova disciplina'}</h2><button className="icon-button" onClick={() => setSubjectModal(false)} aria-label="Fechar">×</button></div><form onSubmit={saveSubject}><label className="field"><span>Nome da disciplina</span><input className="form-control" value={subjectName} onChange={e => setSubjectName(e.target.value)} required autoFocus /></label><label className="check-row"><input type="checkbox" checked={subjectPriority} onChange={e => setSubjectPriority(e.target.checked)} /><span>Marcar como prioridade</span></label><div className="modal-actions"><button type="button" className="button secondary" onClick={() => setSubjectModal(false)}>Cancelar</button><button className="button primary" type="submit">Salvar</button></div></form></div></div>}
      {topicModal && <div className="modal-backdrop" role="presentation"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="topic-modal-title"><div className="modal-header"><h2 id="topic-modal-title">Novo assunto</h2><button className="icon-button" onClick={() => setTopicModal(null)} aria-label="Fechar">×</button></div><form onSubmit={saveTopic}><label className="field"><span>Nome do assunto</span><input className="form-control" value={topicName} onChange={e => setTopicName(e.target.value)} required autoFocus /></label><label className="field"><span>Status de estudo</span><select className="form-control" value={topicStatus} onChange={e => setTopicStatus(e.target.value as StudyStatus)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="field"><span>Observações</span><textarea className="form-control" rows={3} value={topicNotes} onChange={e => setTopicNotes(e.target.value)} /></label><div className="modal-actions"><button type="button" className="button secondary" onClick={() => setTopicModal(null)}>Cancelar</button><button className="button primary" type="submit">Adicionar assunto</button></div></form></div></div>}
    </div>
  )
}
