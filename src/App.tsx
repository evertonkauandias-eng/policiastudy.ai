import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { ForgotPassword } from './pages/ForgotPassword'
import { ResetPassword } from './pages/ResetPassword'
import { LocalSetup } from './pages/LocalSetup'
import { Dashboard } from './pages/Dashboard'
import { Profile } from './pages/Profile'
import { Subjects } from './pages/Subjects'
import { Settings } from './pages/Settings'
import { PlannedModule } from './pages/PlannedModule'
import { ProfessorIA } from './pages/ProfessorIA'
import { ErrorNotebook } from './pages/ErrorNotebook'
import { Flashcards } from './pages/Flashcards'
import { DailyReview } from './pages/DailyReview'
import { MindMaps } from './pages/MindMaps'
import { Summaries } from './pages/Summaries'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/configuracao" element={<LocalSetup />} />
        <Route path="/login" element={<Login />} />
        <Route path="/cadastro" element={<Register />} />
        <Route path="/recuperar-senha" element={<ForgotPassword />} />
        <Route path="/redefinir-senha" element={<ResetPassword />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/perfil" element={<Profile />} />
            <Route path="/disciplinas" element={<Subjects />} />
            <Route path="/configuracoes" element={<Settings />} />
            <Route path="/professor-ia" element={<ProfessorIA />} />
            <Route path="/caderno-erros" element={<ErrorNotebook />} />
            <Route path="/flashcards" element={<Flashcards />} />
            <Route path="/revisao" element={<DailyReview />} />
            <Route path="/mapas" element={<MindMaps />} />
            <Route path="/resumos" element={<Summaries />} />
            <Route path="/questoes" element={<PlannedModule name="Questões e simulados" />} />
            <Route path="/flashcards" element={<PlannedModule name="Flashcards" />} />
            <Route path="/mapas" element={<PlannedModule name="Mapas mentais" />} />
            <Route path="/planejamento" element={<PlannedModule name="Planejamento" />} />
            <Route path="/desempenho" element={<PlannedModule name="Desempenho" />} />
            <Route path="/edital" element={<PlannedModule name="Edital" />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
