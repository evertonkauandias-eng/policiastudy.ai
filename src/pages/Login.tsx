import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import './AuthPage.css'

export function Login() {
  const { session, refreshSession } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (session) return <Navigate to="/" replace />

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
      await refreshSession()
      navigate('/')
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Não foi possível entrar.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="brand auth-brand"><span className="brand-mark">P</span><span className="brand-text">PolíciaStudy <strong>AI</strong></span></div>
        <h1>Bem-vindo de volta</h1>
        <p className="auth-subtitle">Entre para continuar seus estudos.</p>
        {error && <div className="alert error" role="alert">{error}</div>}
        <form className="auth-form" onSubmit={submit}>
          <label className="field"><span>Email</span><input className="form-control" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" /></label>
          <label className="field"><span>Senha</span><div className="password-wrap"><input className="form-control" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" /><button className="password-toggle" type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
          <div className="auth-row"><Link className="auth-link" to="/recuperar-senha">Esqueci minha senha</Link></div>
          <button className="button primary" disabled={loading} type="submit">{loading ? 'Entrando...' : 'Entrar'}</button>
        </form>
        <p className="auth-footer">Ainda não possui conta? <Link className="auth-link" to="/cadastro">Criar conta</Link></p>
      </section>
      <aside className="auth-aside"><div className="auth-aside-content"><h2>Organize sua preparação.</h2><p>Disciplinas, assuntos e progresso em um só lugar, com segurança e privacidade.</p></div></aside>
    </main>
  )
}
