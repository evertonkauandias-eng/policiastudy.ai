import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'
import type { ExamPreference, Profile as ProfileType } from '../types/database'

export function Profile() {
  const { user } = useAuth()
  const [profile, setProfile] = useState({ full_name: '', email: '' })
  const [exam, setExam] = useState({
    exam_name: '', institution: '', state: '', desired_position: '',
    examining_board: '', exam_date: '', preparation_status: 'planejamento',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return
    Promise.all([
      api<{ profile: ProfileType | null }>('/profile'),
      api<{ exam: ExamPreference | null }>('/exam'),
    ]).then(([profileResult, examResult]) => {
      if (profileResult.profile) {
        const data = profileResult.profile
        setProfile({ full_name: data.full_name || '', email: data.email || user.email || '' })
      } else {
        setProfile({ full_name: user.full_name || '', email: user.email || '' })
      }
      if (examResult.exam) {
        const data = examResult.exam
        setExam({
          exam_name: data.exam_name || '', institution: data.institution || '', state: data.state || '',
          desired_position: data.desired_position || '', examining_board: data.examining_board || '',
          exam_date: data.exam_date || '', preparation_status: data.preparation_status || 'planejamento',
        })
      }
      setLoading(false)
    })
  }, [user])

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!user) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await api('/profile', { method: 'PUT', body: JSON.stringify({ fullName: profile.full_name.trim() }) })
      await api('/exam', {
        method: 'PUT',
        body: JSON.stringify({
          examName: exam.exam_name.trim(),
          institution: exam.institution.trim(),
          state: exam.state.trim(),
          desiredPosition: exam.desired_position.trim(),
          examiningBoard: exam.examining_board.trim(),
          examDate: exam.exam_date || null,
          preparationStatus: exam.preparation_status,
        }),
      })
      setMessage('Perfil e configurações do concurso salvos.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="app-loading"><span className="spinner" />Carregando perfil...</div>

  return (
    <div className="page">
      <header className="page-header"><div><p className="eyebrow">Conta</p><h1>Perfil do estudante</h1></div></header>
      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert error">{error}</div>}
      <form onSubmit={save}>
        <section className="form-section">
          <div className="section-heading"><h2>Dados pessoais</h2><p>Informações básicas da sua conta.</p></div>
          <div className="form-grid">
            <label className="field"><span>Nome completo</span><input className="form-control" value={profile.full_name} onChange={e => setProfile({ ...profile, full_name: e.target.value })} required /></label>
            <label className="field"><span>Email</span><input className="form-control" value={profile.email} disabled /></label>
          </div>
        </section>
        <section className="form-section">
          <div className="section-heading"><h2>Concurso principal</h2><p>Você poderá alterar estas informações a qualquer momento.</p></div>
          <div className="form-grid">
            <label className="field"><span>Nome do concurso</span><input className="form-control" value={exam.exam_name} onChange={e => setExam({ ...exam, exam_name: e.target.value })} placeholder="Ex.: Polícia Civil" /></label>
            <label className="field"><span>Instituição</span><input className="form-control" value={exam.institution} onChange={e => setExam({ ...exam, institution: e.target.value })} placeholder="Ex.: PCDF" /></label>
            <label className="field"><span>Estado</span><input className="form-control" value={exam.state} onChange={e => setExam({ ...exam, state: e.target.value })} placeholder="Ex.: Distrito Federal" /></label>
            <label className="field"><span>Cargo desejado</span><input className="form-control" value={exam.desired_position} onChange={e => setExam({ ...exam, desired_position: e.target.value })} /></label>
            <label className="field"><span>Banca organizadora</span><input className="form-control" value={exam.examining_board} onChange={e => setExam({ ...exam, examining_board: e.target.value })} /></label>
            <label className="field"><span>Data da prova</span><input className="form-control" type="date" value={exam.exam_date} onChange={e => setExam({ ...exam, exam_date: e.target.value })} /></label>
            <label className="field"><span>Status da preparação</span><select className="form-control" value={exam.preparation_status} onChange={e => setExam({ ...exam, preparation_status: e.target.value })}><option value="planejamento">Planejamento</option><option value="estudando">Estudando</option><option value="revisao">Em revisão</option><option value="pronto">Pronto</option></select></label>
          </div>
        </section>
        <div className="form-actions"><button className="button primary" disabled={saving}>{saving ? 'Salvando...' : 'Salvar alterações'}</button></div>
      </form>
    </div>
  )
}
