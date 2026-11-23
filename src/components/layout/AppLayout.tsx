import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Bot, NotebookPen, ClipboardCheck, Layers3,
  CalendarRange, ChartNoAxesCombined, ScrollText, UserRound, Settings,
  LogOut, PanelLeftClose, PanelLeftOpen, Menu, X, Library, Network, FileText, Repeat2,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, available: true },
  { to: '/perfil', label: 'Perfil', icon: UserRound, available: true },
  { to: '/disciplinas', label: 'Disciplinas', icon: Layers3, available: true },
  { to: '/flashcards', label: 'Flashcards', icon: Library, available: true },
  { to: '/revisao', label: 'Revisão de hoje', icon: Repeat2, available: true },
  { to: '/mapas', label: 'Mapas mentais', icon: Network, available: true },
  { to: '/resumos', label: 'Resumos', icon: FileText, available: true },
  { to: '/professor-ia', label: 'Professor IA', icon: Bot, available: true },
  { to: '/caderno-erros', label: 'Caderno de erros', icon: NotebookPen, available: true },
  { to: '/questoes', label: 'Questões e simulados', icon: ClipboardCheck, available: false },
  { to: '/planejamento', label: 'Planejamento', icon: CalendarRange, available: false },
  { to: '/desempenho', label: 'Desempenho', icon: ChartNoAxesCombined, available: false },
  { to: '/edital', label: 'Edital', icon: ScrollText, available: false },
]

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { signOut } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className={`app-shell ${collapsed ? 'is-collapsed' : ''}`}>
      <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <button className="brand" onClick={() => navigate('/')} aria-label="Ir para dashboard">
            <span className="brand-mark">P</span>
            <span className="brand-text">PolíciaStudy <strong>AI</strong></span>
          </button>
          <button className="icon-button sidebar-close" onClick={() => setMobileOpen(false)} aria-label="Fechar menu"><X size={20} /></button>
        </div>
        <nav className="sidebar-nav" aria-label="Navegação principal">
          {navItems.map(({ to, label, icon: Icon, available }) =>
            available ? (
              <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={() => setMobileOpen(false)}>
                <Icon size={19} /><span>{label}</span>
              </NavLink>
            ) : (
              <div key={to} className="nav-item disabled" title="Disponível em breve">
                <Icon size={19} /><span>{label}</span><em>Em breve</em>
              </div>
            )
          )}
        </nav>
        <div className="sidebar-footer">
          <NavLink to="/configuracoes" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Settings size={19} /><span>Configurações</span></NavLink>
          <button className="nav-item logout" onClick={handleLogout}><LogOut size={19} /><span>Sair</span></button>
        </div>
      </aside>
      {mobileOpen && <button className="sidebar-overlay" onClick={() => setMobileOpen(false)} aria-label="Fechar menu" />}
      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Abrir menu"><Menu size={21} /></button>
          <button className="icon-button desktop-collapse" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}>
            {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
          </button>
        </header>
        <div className="page-content"><Outlet /></div>
      </main>
    </div>
  )
}
