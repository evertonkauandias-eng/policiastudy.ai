import { Clock3 } from 'lucide-react'

export function PlannedModule({ name }: { name: string }) {
  return (
    <div className="page">
      <header className="page-header"><div><p className="eyebrow">Próximas fases</p><h1>{name}</h1></div></header>
      <div className="empty-state large"><span className="empty-icon"><Clock3 size={24} /></span><h2>Módulo em desenvolvimento</h2><p>{name} será disponibilizado nas próximas fases. Por enquanto, a fundação da plataforma está pronta.</p></div>
    </div>
  )
}
