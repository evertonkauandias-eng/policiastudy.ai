import { Link } from 'react-router-dom'
import './AuthPage.css'

export function LocalSetup() {
  return (
    <main className="auth-page">
      <section className="auth-panel setup-card">
        <div className="brand auth-brand"><span className="brand-mark">P</span><span className="brand-text">PolíciaStudy <strong>AI</strong></span></div>
        <h1>Conecte o PostgreSQL local</h1>
        <p className="auth-subtitle">Use o backend Node incluído no projeto para armazenar os dados neste computador.</p>
        <ol>
          <li>Instale o PostgreSQL e crie o banco <code>policiastudy</code>.</li>
          <li>Copie <code>.env.example</code> para <code>.env</code>.</li>
          <li>Configure <code>DATABASE_URL</code> e gere um <code>JWT_SECRET</code> longo.</li>
          <li>Execute a migration <code>server/migrations/001_phase1.sql</code> no banco.</li>
          <li>Execute <code>npm run dev</code> para iniciar API e frontend.</li>
        </ol>
        <Link className="button primary" to="/login" style={{ marginTop: 16, width: 'fit-content' }}>Ir para o login</Link>
      </section>
    </main>
  )
}
