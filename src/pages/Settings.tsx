import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Moon, Sun } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'
import type { ExamPreference } from '../types/database'

export function Settings() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [exam, setExam] = useState({ exam_name: '', desired_position: '', state: '', examining_board: '', exam_date: '' })
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const saved = localStorage.getItem('policiastudy-theme')
    if (saved === 'dark') setTheme('dark')
  }, [])

  useEffect(() => {
    if (!user) return
    api<{ exam: ExamPreference | null }>('/exam').then(({ exam: item }) => {
      if (item) {
        setExam({
          exam_name: item.exam_name || '', desired_position: item.desired_position || '',
          state: item.state || '', examining_board: item.examining_board || '', exam_date: item.exam_date || '',
        })
      }
    })
  }, [user])

  const applyTheme = (value: 'light' | 'dark') => {
    setTheme(value)
    localStorage.setItem('policiastudy-theme', value)
    document.documentElement.dataset.theme = value
  }

  const saveExam = async (event: FormEvent) => {
    event.preventDefault()
    if (!user) return
    setError('')
    setMessage('')
    try {
      await api('/exam', {
        method: 'PUT',
        body: JSON.stringify({
          examName: exam.exam_name,
          desiredPosition: exam.desired_position,
          state: exam.state,
          examiningBoard: exam.examining_board,
          examDate: exam.exam_date || null,
        }),
      })
      setMessage('Configurações do concurso salvas.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar.')
    }
  }

  const changePassword = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setMessage('')
    if (password.length < 8) return setError('A senha deve ter pelo menos 8 caracteres.')
    if (password !== confirm) return setError('As senhas não coincidem.')
    try {
      await api('/auth/change-password', { method: 'POST', body: JSON.stringify({ password }) })
      setPassword('')
      setConfirm('')
      setMessage('Senha alterada com sucesso.')
    } catch (passwordError) {
      setError(passwordError instanceof Error ? passwordError.message : 'Não foi possível alterar a senha.')
    }
  }

  const logout = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="page">
      <header className="page-header"><div><p className="eyebrow">Conta</p><h1>Configurações</h1></div></header>
      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert error">{error}</div>}
      <section className="form-section">
        <div className="section-heading"><h2>Preferências</h2><p>Personalize a aparência da interface.</p></div>
        <div className="theme-options">
          <button className={`theme-option ${theme === 'light' ? 'selected' : ''}`} onClick={() => applyTheme('light')}><Sun size={20} /><span>Claro</span></button>
          <button className={`theme-option ${theme === 'dark' ? 'selected' : ''}`} onClick={() => applyTheme('dark')}><Moon size={20} /><span>Escuro</span></button>
        </div>
      </section>
      <form className="form-section" onSubmit={saveExam}>
        <div className="section-heading"><h2>Concurso</h2><p>Informações usadas pelo dashboard.</p></div>
        <div className="form-grid">
          <label className="field"><span>Concurso principal</span><input className="form-control" value={exam.exam_name} onChange={e => setExam({ ...exam, exam_name: e.target.value })} /></label>
          <label className="field"><span>Cargo</span><input className="form-control" value={exam.desired_position} onChange={e => setExam({ ...exam, desired_position: e.target.value })} /></label>
          <label className="field"><span>Estado</span><input className="form-control" value={exam.state} onChange={e => setExam({ ...exam, state: e.target.value })} /></label>
          <label className="field"><span>Banca</span><input className="form-control" value={exam.examining_board} onChange={e => setExam({ ...exam, examining_board: e.target.value })} /></label>
          <label className="field"><span>Data da prova</span><input className="form-control" type="date" value={exam.exam_date} onChange={e => setExam({ ...exam, exam_date: e.target.value })} /></label>
        </div>
        <div className="form-actions"><button className="button primary">Salvar concurso</button></div>
      </form>
      <form className="form-section" onSubmit={changePassword}>
        <div className="section-heading"><h2>Segurança</h2><p>Alterar senha da conta.</p></div>
        <div className="form-grid">
          <label className="field"><span>Nova senha</span><input className="form-control" type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={8} /></label>
          <label className="field"><span>Confirmar nova senha</span><input className="form-control" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} /></label>
        </div>
        <div className="form-actions"><button className="button secondary">Alterar senha</button></div>
      </form>
      <section className="form-section danger-section"><div><h2>Sessão</h2><p>Encerrar a sessão neste dispositivo.</p></div><button className="button danger-button" onClick={logout}>Sair da conta</button></section>
    </div>
  )
}
