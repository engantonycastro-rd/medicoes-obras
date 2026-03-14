import { useEffect, useState, Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { supabase } from './lib/supabase'
import { usePerfilStore } from './lib/perfilStore'
import { AppLayout } from './components/layout/AppLayout'
import { GeoGuard } from './components/GeoGuard'
import { LoginPage } from './pages/LoginPage'
import { ContratosPage } from './pages/ContratosPage'
import { DashboardPage } from './pages/DashboardPage'
import { CustosERPPage } from './pages/CustosERPPage'
import { CustosObraPage } from './pages/CustosObraPage'
import { AuditoriaPage } from './pages/AuditoriaPage'
import { ServicosPage } from './pages/ServicosPage'
import { MedicoesPage } from './pages/MedicoesPage'
import { MemoriaPage } from './pages/MemoriaPage'
import { UsuariosPage } from './pages/UsuariosPage'
import { ConfigPage } from './pages/ConfigPage'
import { OrcamentosSolicitarPage } from './pages/OrcamentosSolicitarPage'
import { OrcamentosSetorPage } from './pages/OrcamentosSetorPage'
import { KanbanObraPage } from './pages/KanbanObraPage'
import { FAQPage } from './pages/FAQPage'
import { ApontamentosAdminPage } from './pages/ApontamentosAdminPage'
import { DiarioObraPage } from './pages/DiarioObraPage'
import { CronogramaPage } from './pages/CronogramaPage'
import { AditivosPage } from './pages/AditivosPage'
import { SubempreiteirosPage } from './pages/SubempreiteirosPage'
import { DashboardExecutivoPage } from './pages/DashboardExecutivoPage'
import { ChecklistNR18Page } from './pages/ChecklistNR18Page'
import { RDOPage } from './pages/RDOPage'
import { RelatorioFotograficoPage } from './pages/RelatorioFotograficoPage'
import { AlertCircle } from 'lucide-react'

const AppMobilePage = lazy(() => import('./pages/AppMobilePage').then(m => ({ default: m.AppMobilePage })))

export { ContratoModal } from './components/contracts/ContratoModal'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<'loading'|'ok'|'noauth'|'pendente'>('loading')
  const { fetchPerfilAtual } = usePerfilStore()

  useEffect(() => {
    async function check() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setStatus('noauth'); return }
      const perfil = await fetchPerfilAtual()
      if (!perfil || !perfil.ativo) { setStatus('pendente'); return }
      setStatus('ok')
    }
    check()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') setStatus('noauth')
    })
    return () => subscription.unsubscribe()
  }, [])

  if (status === 'loading') return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="text-slate-400 text-sm animate-pulse">Carregando...</div>
    </div>
  )
  if (status === 'noauth') return <Navigate to="/login" replace />
  if (status === 'pendente') return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 max-w-md w-full text-center">
        <div className="w-14 h-14 bg-amber-500/20 rounded-xl flex items-center justify-center mx-auto mb-4">
          <AlertCircle size={28} className="text-amber-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Acesso Pendente</h2>
        <p className="text-slate-400 text-sm mb-6">
          Seu cadastro está aguardando aprovação.<br/><br/>
          Entre em contato com{' '}
          <strong className="text-amber-400">setordeorcamentos@rdconstrutora.com</strong>
        </p>
        <button onClick={() => supabase.auth.signOut()}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm">
          Sair
        </button>
      </div>
    </div>
  )
  return <>{children}</>
}

function IndexRedirect() {
  const { perfilAtual } = usePerfilStore()
  if (perfilAtual?.role === 'APONTADOR') return <Navigate to="/apontamentos" replace />
  if (perfilAtual?.role === 'DIRETOR') return <Navigate to="/dashboard-executivo" replace />
  return <ContratosPage />
}

// Rotas permitidas por cargo (backend guard no frontend)
const ROTAS_POR_ROLE: Record<string, string[]> = {
  APONTADOR: ['/dashboard', '/apontamentos'],
  ORCAMENTISTA: ['/dashboard', '/', '/servicos', '/medicoes', '/memoria', '/setor-orcamentos', '/configuracoes', '/ajuda'],
  DIRETOR: ['/dashboard-executivo'],
  ENGENHEIRO: ['/dashboard', '/', '/servicos', '/medicoes', '/memoria', '/kanban', '/diario-obra', '/rdo', '/checklist-nr18', '/custos-obra', '/orcamentos', '/relatorio-fotos', '/configuracoes', '/ajuda'],
  GESTOR: ['/dashboard', '/', '/servicos', '/medicoes', '/memoria', '/kanban', '/diario-obra', '/rdo', '/cronograma', '/aditivos', '/checklist-nr18', '/custos-obra', '/orcamentos', '/relatorio-fotos', '/subempreiteiros', '/configuracoes', '/ajuda'],
  ADMIN: ['*'],
}

function RoleGuard({ children, path }: { children: React.ReactNode; path: string }) {
  const { perfilAtual } = usePerfilStore()
  const role = perfilAtual?.role || 'ENGENHEIRO'
  const allowed = ROTAS_POR_ROLE[role] || []
  if (allowed[0] === '*' || allowed.includes(path)) return <>{children}</>
  // Redireciona para a home do cargo
  if (role === 'DIRETOR') return <Navigate to="/dashboard-executivo" replace />
  if (role === 'APONTADOR') return <Navigate to="/apontamentos" replace />
  return <Navigate to="/" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" toastOptions={{
        duration: 3000,
        style: { background: '#1e293b', color: '#f1f5f9', border: '1px solid #334155', fontSize: '13px' },
        success: { iconTheme: { primary: '#f59e0b', secondary: '#fff' } },
      }} />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/app" element={<RequireAuth><Suspense fallback={<div className="flex items-center justify-center h-screen text-slate-400">Carregando...</div>}><AppMobilePage /></Suspense></RequireAuth>} />
        <Route path="/" element={<RequireAuth><GeoGuard><AppLayout /></GeoGuard></RequireAuth>}>
          <Route index element={<IndexRedirect />} />
          <Route path="dashboard"          element={<RoleGuard path="/dashboard"><DashboardPage /></RoleGuard>} />
          <Route path="dashboard-executivo" element={<RoleGuard path="/dashboard-executivo"><DashboardExecutivoPage /></RoleGuard>} />
          <Route path="custos-erp"         element={<RoleGuard path="/custos-erp"><CustosERPPage /></RoleGuard>} />
          <Route path="custos-obra"        element={<RoleGuard path="/custos-obra"><CustosObraPage /></RoleGuard>} />
          <Route path="auditoria"          element={<RoleGuard path="/auditoria"><AuditoriaPage /></RoleGuard>} />
          <Route path="servicos"           element={<RoleGuard path="/servicos"><ServicosPage /></RoleGuard>} />
          <Route path="medicoes"           element={<RoleGuard path="/medicoes"><MedicoesPage /></RoleGuard>} />
          <Route path="memoria"            element={<RoleGuard path="/memoria"><MemoriaPage /></RoleGuard>} />
          <Route path="usuarios"           element={<RoleGuard path="/usuarios"><UsuariosPage /></RoleGuard>} />
          <Route path="configuracoes"      element={<RoleGuard path="/configuracoes"><ConfigPage /></RoleGuard>} />
          <Route path="orcamentos"         element={<RoleGuard path="/orcamentos"><OrcamentosSolicitarPage /></RoleGuard>} />
          <Route path="setor-orcamentos"   element={<RoleGuard path="/setor-orcamentos"><OrcamentosSetorPage /></RoleGuard>} />
          <Route path="kanban"             element={<RoleGuard path="/kanban"><KanbanObraPage /></RoleGuard>} />
          <Route path="ajuda"              element={<FAQPage />} />
          <Route path="apontamentos"       element={<RoleGuard path="/apontamentos"><ApontamentosAdminPage /></RoleGuard>} />
          <Route path="diario-obra"        element={<RoleGuard path="/diario-obra"><DiarioObraPage /></RoleGuard>} />
          <Route path="cronograma"         element={<RoleGuard path="/cronograma"><CronogramaPage /></RoleGuard>} />
          <Route path="aditivos"           element={<RoleGuard path="/aditivos"><AditivosPage /></RoleGuard>} />
          <Route path="subempreiteiros"    element={<RoleGuard path="/subempreiteiros"><SubempreiteirosPage /></RoleGuard>} />
          <Route path="checklist-nr18"     element={<RoleGuard path="/checklist-nr18"><ChecklistNR18Page /></RoleGuard>} />
          <Route path="rdo"                element={<RoleGuard path="/rdo"><RDOPage /></RoleGuard>} />
          <Route path="relatorio-fotos"    element={<RoleGuard path="/relatorio-fotos"><RelatorioFotograficoPage /></RoleGuard>} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
