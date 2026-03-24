import { create } from 'zustand'
import { supabase } from './supabase'

export interface Empresa {
  id: string
  created_at: string
  nome: string
  cnpj: string | null
  email_contato: string | null
  telefone: string | null
  logo_url: string | null
  plano: 'STARTER' | 'PROFISSIONAL' | 'ENTERPRISE' | 'ILIMITADO' | 'TRIAL'
  valor_mensal: number
  cobranca_ativa: boolean
  max_obras: number
  max_usuarios: number
  trial_inicio: string | null
  trial_fim: string | null
  data_vencimento: string | null
  status: 'ATIVA' | 'BLOQUEADA' | 'CANCELADA' | 'TRIAL'
  observacoes: string | null
}

export interface EmpresaModulo {
  id: string
  empresa_id: string
  modulo: string
  habilitado: boolean
  tipo: 'PLANO' | 'BETA' | 'CUSTOM'
  valor_extra: number
  observacao: string | null
}

// Mapeamento módulo → rotas que ele desbloqueia
export const MODULO_ROTAS: Record<string, string[]> = {
  contratos_obras: ['/', '/contratos'],
  servicos_medicoes: ['/servicos', '/medicoes', '/memoria'],
  exportacao: [],
  planejamento: ['/kanban'],
  setor_orcamentos: ['/orcamentos', '/setor-orcamentos'],
  apontamento: ['/apontamentos', '/app'],
  diario_rdo: ['/diario-obra', '/rdo'],
  relatorio_fotos: ['/relatorio-fotos'],
  dashboard_executivo: ['/dashboard-executivo'],
  custos_erp: ['/custos-erp', '/custos-obra'],
  setor_licitacao: ['/setor-licitacao'],
  producao: ['/producao'],
  mario_papis: ['/mario-papis'],
  mapa_obras: ['/mapa-obras'],
}

// Mapeamento módulo → label para exibição
export const MODULO_LABELS: Record<string, string> = {
  contratos_obras: 'Contratos e obras',
  servicos_medicoes: 'Serviços e medições',
  exportacao: 'Exportação Excel/PDF',
  planejamento: 'Planejamento (Kanban)',
  setor_orcamentos: 'Setor de orçamentos',
  apontamento: 'Apontamento de obra (PWA)',
  diario_rdo: 'Diário de obra + RDO',
  relatorio_fotos: 'Relatório fotográfico',
  dashboard_executivo: 'Dashboard executivo',
  custos_erp: 'Custos ERP (TOTVS)',
  setor_licitacao: 'Setor de licitação',
  producao: 'Produção do engenheiro',
  mario_papis: 'MARIO PAPIS (ranking)',
  mapa_obras: 'Mapa de obras',
  medicao_rapida: 'Medição rápida',
  reserva_veiculos: 'Reserva de veículos',
}

// Módulos por tier
export const MODULOS_POR_PLANO: Record<string, string[]> = {
  CORE: ['contratos_obras', 'servicos_medicoes', 'exportacao'],
  PRO: ['planejamento', 'setor_orcamentos', 'apontamento', 'diario_rdo', 'producao', 'mario_papis', 'mapa_obras'],
  ENTERPRISE: ['relatorio_fotos', 'dashboard_executivo', 'custos_erp', 'setor_licitacao'],
  BETA: ['medicao_rapida', 'reserva_veiculos'],
}

interface EmpresaState {
  empresa: Empresa | null
  modulos: EmpresaModulo[]
  loading: boolean
  fetchEmpresa: () => Promise<void>
  hasModulo: (modulo: string) => boolean
  isRotaLiberada: (rota: string) => boolean
  isSuperAdmin: boolean
}

export const useEmpresaStore = create<EmpresaState>()((set, get) => ({
  empresa: null,
  modulos: [],
  loading: true,
  isSuperAdmin: false,

  fetchEmpresa: async () => {
    set({ loading: true })
    try {
      // Buscar perfil atual para saber se é superadmin
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { set({ loading: false }); return }

      const { data: perfil } = await supabase.from('perfis').select('empresa_id, role').eq('id', user.id).single()
      if (!perfil) { set({ loading: false }); return }

      const isSA = perfil.role === 'SUPERADMIN'
      set({ isSuperAdmin: isSA })

      if (!perfil.empresa_id && !isSA) { set({ loading: false }); return }

      if (perfil.empresa_id) {
        const { data: empresa } = await supabase.from('empresas').select('*').eq('id', perfil.empresa_id).single()
        const { data: modulos } = await supabase.from('empresa_modulos').select('*').eq('empresa_id', perfil.empresa_id)
        set({ empresa: empresa || null, modulos: modulos || [], loading: false })
      } else {
        set({ loading: false })
      }
    } catch {
      set({ loading: false })
    }
  },

  hasModulo: (modulo: string) => {
    const { isSuperAdmin, modulos } = get()
    if (isSuperAdmin) return true
    return modulos.some(m => m.modulo === modulo && m.habilitado)
  },

  isRotaLiberada: (rota: string) => {
    const { isSuperAdmin, modulos } = get()
    if (isSuperAdmin) return true

    // Rotas sempre liberadas
    const rotasLivres = ['/dashboard', '/configuracoes', '/ajuda', '/usuarios', '/auditoria']
    if (rotasLivres.includes(rota)) return true

    // Verificar se algum módulo habilitado libera esta rota
    const modulosAtivos = modulos.filter(m => m.habilitado).map(m => m.modulo)
    for (const mod of modulosAtivos) {
      const rotas = MODULO_ROTAS[mod] || []
      if (rotas.includes(rota)) return true
    }
    return false
  },
}))
