import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  Building2, FileText, ClipboardList, Settings,
  LogOut, Menu, X, ChevronRight, HardHat
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import toast from 'react-hot-toast'

const nav = [
  { to: '/',           icon: Building2,     label: 'Contratos'   },
  { to: '/servicos',   icon: ClipboardList, label: 'Serviços'    },
  { to: '/medicoes',   icon: FileText,      label: 'Medições'    },
  { to: '/configuracoes', icon: Settings,   label: 'Config.'     },
]

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const navigate = useNavigate()

  async function handleLogout() {
    await supabase.auth.signOut()
    toast.success('Saiu com sucesso')
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-slate-50 font-sans overflow-hidden">
      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside className={`
        flex flex-col bg-slate-900 text-white transition-all duration-300 shrink-0
        ${sidebarOpen ? 'w-56' : 'w-16'}
      `}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-700">
          <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center shrink-0">
            <HardHat size={18} className="text-white" />
          </div>
          {sidebarOpen && (
            <div className="leading-tight overflow-hidden">
              <p className="font-bold text-sm tracking-tight text-white truncate">MediObras</p>
              <p className="text-xs text-slate-400">Obras Públicas</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-1">
          {nav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => `
                flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                transition-all duration-150 group
                ${isActive
                  ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }
              `}
            >
              <Icon size={18} className="shrink-0" />
              {sidebarOpen && <span className="truncate">{label}</span>}
              {sidebarOpen && <ChevronRight size={14} className="ml-auto opacity-50 group-hover:opacity-100" />}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-2 py-3 border-t border-slate-700 space-y-1">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm
              text-slate-400 hover:bg-slate-800 hover:text-white transition-all"
          >
            <LogOut size={18} className="shrink-0" />
            {sidebarOpen && <span>Sair</span>}
          </button>
          <button
            onClick={() => setSidebarOpen(v => !v)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm
              text-slate-500 hover:bg-slate-800 hover:text-white transition-all"
          >
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
            {sidebarOpen && <span className="text-xs">Recolher</span>}
          </button>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
