import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { Building2, FileText, ClipboardList, Settings, LogOut, Menu, X, HardHat, Users, Crown, ChevronRight, LayoutDashboard, DollarSign, History, Moon, Sun, Wallet, FileSpreadsheet, KanbanSquare, HelpCircle, BookOpen, Shield, Briefcase, BarChart3, Camera, ScrollText, TrendingUp, Trophy, MapPin } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { usePerfilStore } from '../../lib/perfilStore'
import { useStore } from '../../lib/store'
import { useModeloStore } from '../../lib/modeloStore'
import { useEmpresaStore } from '../../lib/empresaStore'
import { NotificacaoBell } from '../NotificacaoBell'
import toast from 'react-hot-toast'

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const { perfilAtual, fetchPerfilAtual } = usePerfilStore()
  const { contratoAtivo, obraAtiva } = useStore()
  const { temaEscuro, setTemaEscuro, corTema } = useModeloStore()
  const { empresa } = useEmpresaStore()
  const navigate = useNavigate()
  const isAdmin = perfilAtual?.role === 'ADMIN' || perfilAtual?.role === 'SUPERADMIN'

  useEffect(() => { fetchPerfilAtual() }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', temaEscuro)
  }, [temaEscuro])
  useEffect(() => {
    document.documentElement.classList.remove('theme-orange', 'theme-amber')
    document.documentElement.classList.add(`theme-${corTema}`)
  }, [corTema])

  useEffect(() => {
    if (empresa?.id === '00000000-0000-0000-0000-000000000001') {
      document.title = 'Central de Obras — Gestão inteligente de obras públicas'
    } else {
      document.title = 'MedObras — Gestão inteligente de obras públicas'
    }
  }, [empresa])

  async function handleLogout() {
    await supabase.auth.signOut()
    toast.success('Saiu com sucesso')
    navigate('/login')
  }

  const isApontador = perfilAtual?.role === 'APONTADOR'
  const isOrcamentista = perfilAtual?.role === 'ORCAMENTISTA'
  const isDiretor = perfilAtual?.role === 'DIRETOR'
  const role = perfilAtual?.role

  const navMap: Record<string, { to: string; icon: any; label: string }[]> = {
    APONTADOR: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/apontamentos', icon: ClipboardList, label: 'Apontamentos' },
    ],
    ORCAMENTISTA: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/',          icon: Building2,        label: 'Contratos' },
      { to: '/servicos',  icon: ClipboardList,    label: 'Planilha Orçam.' },
      { to: '/medicoes',  icon: FileText,         label: 'Medições' },
      { to: '/setor-orcamentos', icon: FileSpreadsheet, label: 'Setor Orçamentos' },
      { to: '/configuracoes', icon: Settings, label: 'Config.' },
    ],
    DIRETOR: [
      { to: '/dashboard-executivo', icon: BarChart3, label: 'Painel Executivo' },
    ],
    ENGENHEIRO: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/',          icon: Building2,        label: 'Contratos' },
      { to: '/servicos',  icon: ClipboardList,    label: 'Planilha Orçam.' },
      { to: '/medicoes',  icon: FileText,         label: 'Medições' },
      { to: '/kanban',    icon: KanbanSquare,     label: 'Planejamento' },
      { to: '/diario-obra', icon: BookOpen,       label: 'Diário de Obra' },
      { to: '/rdo',       icon: ScrollText,       label: 'RDO' },
      { to: '/custos-obra', icon: Wallet,         label: 'Custos Obras' },
      { to: '/orcamentos', icon: FileSpreadsheet, label: 'Orçamentos' },
      { to: '/producao',   icon: TrendingUp,      label: 'Produção' },
      { to: '/mario-papis', icon: Trophy,          label: 'MARIO PAPIS' },
      { to: '/mapa-obras',  icon: MapPin,          label: 'Mapa de Obras' },
      { to: '/relatorio-fotos', icon: Camera,     label: 'Rel. Fotográfico' },
      { to: '/configuracoes', icon: Settings,     label: 'Config.' },
    ],
    GESTOR: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/',          icon: Building2,        label: 'Contratos' },
      { to: '/servicos',  icon: ClipboardList,    label: 'Planilha Orçam.' },
      { to: '/medicoes',  icon: FileText,         label: 'Medições' },
      { to: '/kanban',    icon: KanbanSquare,     label: 'Planejamento' },
      { to: '/diario-obra', icon: BookOpen,       label: 'Diário de Obra' },
      { to: '/rdo',       icon: ScrollText,       label: 'RDO' },
      { to: '/custos-obra', icon: Wallet,         label: 'Custos Obras' },
      { to: '/orcamentos', icon: FileSpreadsheet, label: 'Orçamentos' },
      { to: '/mapa-obras',  icon: MapPin,          label: 'Mapa de Obras' },
      { to: '/relatorio-fotos', icon: Camera,     label: 'Rel. Fotográfico' },
      { to: '/configuracoes', icon: Settings,     label: 'Config.' },
    ],
    ADMIN: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/dashboard-executivo', icon: BarChart3, label: 'Painel Executivo' },
      { to: '/',          icon: Building2,        label: 'Contratos' },
      { to: '/servicos',  icon: ClipboardList,    label: 'Planilha Orçam.' },
      { to: '/medicoes',  icon: FileText,         label: 'Medições' },
      { to: '/kanban',    icon: KanbanSquare,     label: 'Planejamento' },
      { to: '/diario-obra', icon: BookOpen,       label: 'Diário de Obra' },
      { to: '/rdo',       icon: ScrollText,       label: 'RDO' },
      { to: '/custos-erp', icon: DollarSign,      label: 'Custos ERP' },
      { to: '/setor-orcamentos', icon: FileSpreadsheet, label: 'Setor Orçamentos' },
      { to: '/producao',   icon: TrendingUp,      label: 'Produção' },
      { to: '/mario-papis', icon: Trophy,          label: 'MARIO PAPIS' },
      { to: '/mapa-obras',  icon: MapPin,          label: 'Mapa de Obras' },
      { to: '/apontamentos', icon: ClipboardList, label: 'Apontamentos' },
      { to: '/subempreiteiros', icon: Briefcase,  label: 'Subempreiteiros' },
      { to: '/setor-licitacao', icon: Briefcase, label: 'Licitações' },
      { to: '/relatorio-fotos', icon: Camera,     label: 'Rel. Fotográfico' },
      { to: '/auditoria', icon: History,          label: 'Auditoria' },
      { to: '/usuarios',  icon: Users,            label: 'Usuários' },
      { to: '/configuracoes', icon: Settings,     label: 'Config.' },
    ],
    SUPERADMIN: [
      { to: '/super-admin', icon: Shield,          label: 'SuperAdmin' },
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/dashboard-executivo', icon: BarChart3, label: 'Painel Executivo' },
      { to: '/',          icon: Building2,        label: 'Contratos' },
      { to: '/servicos',  icon: ClipboardList,    label: 'Planilha Orçam.' },
      { to: '/medicoes',  icon: FileText,         label: 'Medições' },
      { to: '/kanban',    icon: KanbanSquare,     label: 'Planejamento' },
      { to: '/diario-obra', icon: BookOpen,       label: 'Diário de Obra' },
      { to: '/rdo',       icon: ScrollText,       label: 'RDO' },
      { to: '/custos-erp', icon: DollarSign,      label: 'Custos ERP' },
      { to: '/setor-orcamentos', icon: FileSpreadsheet, label: 'Setor Orçamentos' },
      { to: '/setor-licitacao', icon: Briefcase,  label: 'Licitações' },
      { to: '/apontamentos', icon: ClipboardList, label: 'Apontamentos' },
      { to: '/subempreiteiros', icon: Briefcase,  label: 'Subempreiteiros' },
      { to: '/relatorio-fotos', icon: Camera,     label: 'Rel. Fotográfico' },
      { to: '/auditoria', icon: History,          label: 'Auditoria' },
      { to: '/usuarios',  icon: Users,            label: 'Usuários' },
      { to: '/configuracoes', icon: Settings,     label: 'Config.' },
    ],
    LICITANTE: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/setor-licitacao', icon: Briefcase, label: 'Licitações' },
      { to: '/configuracoes', icon: Settings,    label: 'Config.' },
    ],
  }
  const nav = navMap[role || 'ENGENHEIRO'] || navMap.ENGENHEIRO

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 font-sans overflow-hidden transition-colors duration-300">
      <aside className={`flex flex-col bg-slate-900 dark:bg-slate-950 dark:border-r dark:border-slate-800 text-white transition-all duration-300 shrink-0 ${sidebarOpen ? 'w-64' : 'w-16'}`}>
        {/* Logo */}
        <div className="px-4 py-4 border-b border-slate-700 dark:border-slate-800">
          <div className="flex items-center gap-3">
            {empresa?.id === '00000000-0000-0000-0000-000000000001' ? (
              <img src="/logo-rd.png" alt="RD Construtora" className="w-9 h-9 rounded-xl shrink-0 object-contain"/>
            ) : (
              <div className="w-9 h-9 bg-primary-500 rounded-xl flex items-center justify-center shrink-0 font-black text-white text-sm shadow">
                {empresa?.nome ? empresa.nome.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : 'MO'}
              </div>
            )}
            {sidebarOpen && (
              <div className="min-w-0 flex-1">
                <p className="font-bold text-white text-sm leading-tight">
                  {empresa?.id === '00000000-0000-0000-0000-000000000001' ? 'Central de Obras' : 'MedObras'}
                </p>
                <p className="text-[11px] text-slate-400">{empresa?.nome || 'Central de Obras'}</p>
              </div>
            )}
          </div>
        </div>

        {/* Obra ativa */}
        {sidebarOpen && obraAtiva && (
          <div className="mx-3 my-2 p-2.5 bg-primary-500/10 border border-primary-500/30 rounded-lg">
            <p className="text-xs text-primary-400 font-medium truncate">{contratoAtivo?.nome_obra}</p>
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
                isActive ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/25' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
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
              role === 'SUPERADMIN' ? 'bg-red-500/20 text-red-400'
              : isAdmin ? 'bg-primary-500/20 text-primary-400'
              : role === 'GESTOR' ? 'bg-purple-500/20 text-purple-400'
              : role === 'APONTADOR' ? 'bg-cyan-500/20 text-cyan-400'
              : role === 'ORCAMENTISTA' ? 'bg-emerald-500/20 text-emerald-400'
              : role === 'DIRETOR' ? 'bg-rose-500/20 text-rose-400'
              : role === 'LICITANTE' ? 'bg-amber-500/20 text-amber-400'
              : 'bg-blue-500/20 text-blue-400'
            }`}>
              {role === 'SUPERADMIN' ? <><Shield size={9} className="inline mr-1"/>SuperAdmin</>
              : isAdmin ? <><Crown size={9} className="inline mr-1"/>Admin</>
              : role === 'GESTOR' ? <><Crown size={9} className="inline mr-1"/>Gestor</>
              : role === 'APONTADOR' ? <><ClipboardList size={9} className="inline mr-1"/>Apontador</>
              : role === 'ORCAMENTISTA' ? <><FileSpreadsheet size={9} className="inline mr-1"/>Orçamentista</>
              : role === 'DIRETOR' ? <><BarChart3 size={9} className="inline mr-1"/>Diretor</>
              : role === 'LICITANTE' ? <><Briefcase size={9} className="inline mr-1"/>Licitante</>
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

      <main className="flex-1 flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
        {/* Top bar */}
        <div className="flex items-center justify-end gap-1 px-5 py-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
          <NotificacaoBell/>
          <button onClick={() => navigate('/ajuda')} title="Central de Ajuda"
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <HelpCircle size={18} className="text-slate-400 hover:text-indigo-500"/>
          </button>
          <button onClick={() => setTemaEscuro(!temaEscuro)} title={temaEscuro ? 'Modo claro' : 'Modo escuro'}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            {temaEscuro ? <Sun size={18} className="text-primary-400"/> : <Moon size={18} className="text-slate-400"/>}
          </button>
        </div>
        <div className="flex-1 overflow-auto dark:text-slate-200">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
