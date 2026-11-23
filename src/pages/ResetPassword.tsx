import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import './AuthPage.css'

export function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [token, setToken] = useState(new URLSearchParams(window.location.search).get('token') || '')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (password.length < 8) return setError('A senha deve ter pelo menos 8 caracteres.')
    if (password !== confirm) return setError('As senhas não coincidem.')
    setLoading(true)
    try {
      await api('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) })
      navigate('/login')
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Não foi possível redefinir a senha.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <h1>Definir nova senha</h1>
        <p className="auth-subtitle">Escolha uma senha com pelo menos 8 caracteres.</p>
        {error && <div className="alert error" role="alert">{error}</div>}
        <form className="auth-form" onSubmit={submit}>
          <label className="field"><span>Token de recuperação</span><input className="form-control" value={token} onChange={e => setToken(e.target.value)} required /></label>
          <label className="field"><span>Nova senha</span><input className="form-control" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} /></label>
          <label className="field"><span>Confirmar nova senha</span><input className="form-control" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required /></label>
          <button className="button primary" disabled={loading}>{loading ? 'Salvando...' : 'Salvar nova senha'}</button>
        </form>
      </section>
      <aside className="auth-aside"><div className="auth-aside-content"><h2>Nova senha segura.</h2><p>Use uma combinação exclusiva para sua conta de estudos.</p></div></aside>
    </main>
  )
}
