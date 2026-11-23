import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import './AuthPage.css'

export function Register() {
  const { session, refreshSession } = useAuth()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (session) return <Navigate to="/" replace />

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (password.length < 8) return setError('A senha deve ter pelo menos 8 caracteres.')
    if (password !== confirm) return setError('As senhas não coincidem.')
    if (!accepted) return setError('Aceite os termos para continuar.')
    setLoading(true)
    try {
      await api('/auth/register', { method: 'POST', body: JSON.stringify({ fullName, email, password }) })
      await refreshSession()
      navigate('/perfil')
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Não foi possível criar a conta.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="brand auth-brand"><span className="brand-mark">P</span><span className="brand-text">PolíciaStudy <strong>AI</strong></span></div>
        <h1>Crie sua conta</h1>
        <p className="auth-subtitle">Comece a organizar sua preparação.</p>
        {error && <div className="alert error" role="alert">{error}</div>}
        <form className="auth-form" onSubmit={submit}>
          <label className="field"><span>Nome completo</span><input className="form-control" value={fullName} onChange={e => setFullName(e.target.value)} required autoComplete="name" /></label>
          <label className="field"><span>Email</span><input className="form-control" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" /></label>
          <label className="field"><span>Senha</span><div className="password-wrap"><input className="form-control" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" /><button className="password-toggle" type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
          <label className="field"><span>Confirmar senha</span><input className="form-control" type={showPassword ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)} required autoComplete="new-password" /></label>
          <label className="check-row"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} /><span>Li e aceito os termos de utilização.</span></label>
          <button className="button primary" disabled={loading} type="submit">{loading ? 'Criando conta...' : 'Criar conta'}</button>
        </form>
        <p className="auth-footer">Já possui conta? <Link className="auth-link" to="/login">Entrar</Link></p>
      </section>
      <aside className="auth-aside"><div className="auth-aside-content"><h2>Seu plano começa aqui.</h2><p>Configure seu concurso e organize as disciplinas que fazem sentido para sua preparação.</p></div></aside>
    </main>
  )
}
