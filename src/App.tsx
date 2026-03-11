import { useEffect, useState } from 'react'
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
import { AuditoriaPage } from './pages/AuditoriaPage'
import { ServicosPage } from './pages/ServicosPage'
import { MedicoesPage } from './pages/MedicoesPage'
import { MemoriaPage } from './pages/MemoriaPage'
import { UsuariosPage } from './pages/UsuariosPage'
import { ConfigPage } from './pages/ConfigPage'
import { AlertCircle } from 'lucide-react'

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
        <Route path="/" element={<RequireAuth><GeoGuard><AppLayout /></GeoGuard></RequireAuth>}>
          <Route index element={<ContratosPage />} />
          <Route path="dashboard"     element={<DashboardPage />} />
          <Route path="custos-erp"    element={<CustosERPPage />} />
          <Route path="auditoria"     element={<AuditoriaPage />} />
          <Route path="servicos"      element={<ServicosPage />} />
          <Route path="medicoes"      element={<MedicoesPage />} />
          <Route path="memoria"       element={<MemoriaPage />} />
          <Route path="usuarios"      element={<UsuariosPage />} />
          <Route path="configuracoes" element={<ConfigPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}