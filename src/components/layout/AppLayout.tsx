import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { Building2, FileText, ClipboardList, Settings, LogOut, Menu, X, HardHat, Users, Crown, ChevronRight, LayoutDashboard, DollarSign, History, Moon, Sun, Wallet, FileSpreadsheet, KanbanSquare, HelpCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { usePerfilStore } from '../../lib/perfilStore'
import { useStore } from '../../lib/store'
import { useModeloStore } from '../../lib/modeloStore'
import { NotificacaoBell } from '../NotificacaoBell'
import toast from 'react-hot-toast'

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const { perfilAtual, fetchPerfilAtual } = usePerfilStore()
  const { contratoAtivo, obraAtiva } = useStore()
  const { temaEscuro, setTemaEscuro } = useModeloStore()
  const navigate = useNavigate()
  const isAdmin = perfilAtual?.role === 'ADMIN'

  useEffect(() => { fetchPerfilAtual() }, [])

  // Aplica dark mode ao carregar (hydrate do localStorage)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', temaEscuro)
  }, [temaEscuro])

  async function handleLogout() {
    await supabase.auth.signOut()
    toast.success('Saiu com sucesso')
    navigate('/login')
  }

  const isApontador = perfilAtual?.role === 'APONTADOR'

  const navBase = isApontador ? [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/apontamentos', icon: ClipboardList, label: 'Apontamentos' },
  ] : [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/',          icon: Building2,        label: 'Contratos' },
    { to: '/servicos',  icon: ClipboardList,    label: 'Serviços'  },
    { to: '/medicoes',  icon: FileText,         label: 'Medições'  },
    { to: '/kanban',    icon: KanbanSquare,     label: 'Planejamento' },
  ]
  const navAdmin     = [
    { to: '/custos-erp', icon: DollarSign, label: 'Custos ERP' },
    { to: '/setor-orcamentos', icon: FileSpreadsheet, label: 'Setor Orçamentos' },
    { to: '/apontamentos', icon: ClipboardList, label: 'Apontamentos' },
    { to: '/auditoria',  icon: History,     label: 'Auditoria' },
    { to: '/usuarios', icon: Users, label: 'Usuários' },
    { to: '/configuracoes', icon: Settings, label: 'Config.' },
  ]
  const navEng       = [
    { to: '/custos-obra', icon: Wallet, label: 'Custos Obras' },
    { to: '/orcamentos', icon: FileSpreadsheet, label: 'Orçamentos' },
    { to: '/configuracoes', icon: Settings, label: 'Config.' },
  ]
  const nav = [...navBase, ...(isAdmin ? navAdmin : isApontador ? [] : navEng)]

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 font-sans overflow-hidden transition-colors duration-300">
      <aside className={`flex flex-col bg-slate-900 dark:bg-slate-950 dark:border-r dark:border-slate-800 text-white transition-all duration-300 shrink-0 ${sidebarOpen ? 'w-56' : 'w-16'}`}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-700 dark:border-slate-800">
          <div className="w-9 h-9 bg-amber-500 rounded-xl flex items-center justify-center shrink-0 font-black text-white text-sm shadow">RD</div>
          {sidebarOpen && (
            <div className="min-w-0 flex-1">
              <p className="font-bold text-white text-sm leading-tight truncate">RD - Medições</p>
              <p className="text-xs text-slate-400 truncate">de Obras</p>
            </div>
          )}
          {sidebarOpen && (
            <div className="flex items-center gap-1">
              <NotificacaoBell/>
              <button onClick={() => navigate('/ajuda')} title="Central de Ajuda"
                className="p-1.5 rounded-lg hover:bg-slate-700/50 transition-colors">
                <HelpCircle size={16} className="text-slate-400 hover:text-indigo-400"/>
              </button>
              <button onClick={() => setTemaEscuro(!temaEscuro)} title={temaEscuro ? 'Modo claro' : 'Modo escuro'}
                className="p-1.5 rounded-lg hover:bg-slate-700/50 transition-colors">
                {temaEscuro ? <Sun size={16} className="text-amber-400"/> : <Moon size={16} className="text-slate-400"/>}
              </button>
            </div>
          )}
        </div>

        {/* Obra ativa */}
        {sidebarOpen && obraAtiva && (
          <div className="mx-3 my-2 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <p className="text-xs text-amber-400 font-medium truncate">{contratoAtivo?.nome_obra}</p>
            <p className="text-xs text-white font-semibold truncate mt-0.5 flex items-center gap-1">
              <HardHat size={10}/> {obraAtiva.nome_obra}
            </p>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto">
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to}
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/25' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}>
              <Icon size={18} className="shrink-0" />
              {sidebarOpen && <span className="truncate">{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Perfil */}
        {sidebarOpen && perfilAtual && (
          <div className="px-3 py-3 border-t border-slate-700 dark:border-slate-800">
            <div className="flex items-center gap-2 px-2 py-1.5">
              <div className="w-7 h-7 bg-slate-700 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white">
                {(perfilAtual.nome || perfilAtual.email).charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-white truncate">{perfilAtual.nome || 'Usuário'}</p>
                <p className="text-xs text-slate-400 truncate">{perfilAtual.email}</p>
              </div>
            </div>
            <div className={`mx-2 mt-1 text-xs px-2 py-0.5 rounded-full font-medium text-center ${
              isAdmin ? 'bg-amber-500/20 text-amber-400'
              : perfilAtual?.role === 'GESTOR' ? 'bg-purple-500/20 text-purple-400'
              : perfilAtual?.role === 'APONTADOR' ? 'bg-cyan-500/20 text-cyan-400'
              : 'bg-blue-500/20 text-blue-400'
            }`}>
              {isAdmin ? <><Crown size={9} className="inline mr-1"/>Admin</>
              : perfilAtual?.role === 'GESTOR' ? <><Crown size={9} className="inline mr-1"/>Gestor</>
              : perfilAtual?.role === 'APONTADOR' ? <><ClipboardList size={9} className="inline mr-1"/>Apontador</>
              : <><HardHat size={9} className="inline mr-1"/>Engenheiro</>}
            </div>
          </div>
        )}

        {/* Logout + toggle */}
        <div className="px-2 pb-3 flex items-center gap-1 border-t border-slate-700 dark:border-slate-800 pt-2">
          <button onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-slate-400 hover:bg-slate-800 hover:text-red-400 transition-all text-sm flex-1">
            <LogOut size={16} className="shrink-0"/>
            {sidebarOpen && 'Sair'}
          </button>
          <button onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-xl text-slate-400 hover:bg-slate-800 transition-all">
            {sidebarOpen ? <X size={16}/> : <Menu size={16}/>}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
        <div className="dark:text-slate-200">
          <Outlet />
        </div>
      </main>
    </div>
  )
}