import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { supabase } from './lib/supabase'
import { AppLayout } from './components/layout/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { ContratosPage } from './pages/ContratosPage'
import { ServicosPage } from './pages/ServicosPage'
import { MedicoesPage } from './pages/MedicoesPage'
import { MemoriaPage } from './pages/MemoriaPage'

// Re-exports para o AppLayout poder importar o modal
export { ContratoModal } from './components/contracts/ContratoModal'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(!!data.session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setAuthed(!!session)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400 text-sm">Carregando...</div>
      </div>
    )
  }

  return authed ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#1e293b',
            color: '#f1f5f9',
            border: '1px solid #334155',
            fontSize: '13px',
          },
          success: { iconTheme: { primary: '#f59e0b', secondary: '#fff' } },
        }}
      />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<ContratosPage />} />
          <Route path="servicos" element={<ServicosPage />} />
          <Route path="medicoes" element={<MedicoesPage />} />
          <Route path="memoria" element={<MemoriaPage />} />
          <Route path="configuracoes" element={<ConfigPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

function ConfigPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-slate-800 mb-2">Configurações</h1>
      <p className="text-slate-500 text-sm">Em breve: configurações de BDI padrão, templates de órgãos, etc.</p>
    </div>
  )
}
