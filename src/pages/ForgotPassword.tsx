import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import './AuthPage.css'

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)
    try {
      const result = await api<{ message: string; resetToken?: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      })
      setMessage(result.resetToken ? `Modo local: use este token para redefinir: ${result.resetToken}` : result.message)
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Não foi possível solicitar recuperação.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="brand auth-brand"><span className="brand-mark">P</span><span className="brand-text">PolíciaStudy <strong>AI</strong></span></div>
        <h1>Recuperar senha</h1>
        <p className="auth-subtitle">Enviaremos um link seguro para seu email.</p>
        {message && <div className="alert success">{message}</div>}
        {error && <div className="alert error" role="alert">{error}</div>}
        <form className="auth-form" onSubmit={submit}>
          <label className="field"><span>Email</span><input className="form-control" type="email" value={email} onChange={e => setEmail(e.target.value)} required /></label>
          <button className="button primary" disabled={loading}>{loading ? 'Enviando...' : 'Enviar link de recuperação'}</button>
        </form>
        <p className="auth-footer"><Link className="auth-link" to="/login">Voltar ao login</Link></p>
      </section>
      <aside className="auth-aside"><div className="auth-aside-content"><h2>Recuperação segura.</h2><p>Em ambiente local, o token de redefinição é exibido para permitir testes sem serviço de email.</p></div></aside>
    </main>
  )
}
