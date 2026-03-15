import { useEffect, useState } from 'react'
import { Building2, DollarSign, ToggleLeft, Plus, Search, AlertTriangle, TrendingUp, Users, Shield, RefreshCw, Activity, Briefcase, ChevronDown, ChevronUp } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { MODULO_LABELS, MODULOS_POR_PLANO, type Empresa, type EmpresaModulo } from '../lib/empresaStore'

type Aba = 'overview' | 'empresas' | 'modulos' | 'financeiro' | 'planos'

interface EmpresaStats {
  empresa_id: string
  contratos: number
  obras: number
  usuarios: number
}

const PLANOS_INFO: Record<string, { nome: string; valor: number; obras: string; usuarios: string; cor: string; bgCor: string }> = {
  STARTER: { nome: 'Starter', valor: 97, obras: '5 obras', usuarios: '3 usuários', cor: '#475569', bgCor: '#F1F5F9' },
  PROFISSIONAL: { nome: 'Profissional', valor: 297, obras: '30 obras', usuarios: '10 usuários', cor: '#1E40AF', bgCor: '#DBEAFE' },
  ENTERPRISE: { nome: 'Enterprise', valor: 497, obras: 'Ilimitado', usuarios: 'Ilimitado', cor: '#9A3412', bgCor: '#FFF7ED' },
  ILIMITADO: { nome: 'Ilimitado', valor: 0, obras: 'Ilimitado', usuarios: 'Ilimitado', cor: '#5B21B6', bgCor: '#EDE9FE' },
}

const MODULOS_LABEL_PLANO: Record<string, string> = {
  CORE: 'Módulos core (todos os planos)',
  PRO: 'Módulos Pro',
  ENTERPRISE: 'Módulos Enterprise',
  BETA: 'Beta / Futuros',
}

export function SuperAdminPage() {
  const [aba, setAba] = useState<Aba>('overview')
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [modulos, setModulos] = useState<EmpresaModulo[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [empresaSel, setEmpresaSel] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [empresaStats, setEmpresaStats] = useState<EmpresaStats[]>([])
  const [medicoesEsteMes, setMedicoesEsteMes] = useState(0)
  const [totalUsuarios, setTotalUsuarios] = useState(0)
  const [totalObras, setTotalObras] = useState(0)
  const [expandedEmpresa, setExpandedEmpresa] = useState<string | null>(null)

  // Form nova empresa
  const [fNome, setFNome] = useState(''); const [fCnpj, setFCnpj] = useState('')
  const [fEmail, setFEmail] = useState(''); const [fPlano, setFPlano] = useState<string>('TRIAL')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [eRes, mRes] = await Promise.all([
      supabase.from('empresas').select('*').order('created_at', { ascending: false }),
      supabase.from('empresa_modulos').select('*'),
    ])
    if (eRes.data) setEmpresas(eRes.data)
    if (mRes.data) setModulos(mRes.data)

    // Stats adicionais
    try {
      const { data: contratos } = await supabase.from('contratos').select('id, empresa_id')
      const { data: obras } = await supabase.from('obras').select('id, contrato_id')
      const { data: perfis } = await supabase.from('perfis').select('id, empresa_id, role')

      const contratosByEmpresa: Record<string, string[]> = {}
      contratos?.forEach(c => {
        if (c.empresa_id) {
          if (!contratosByEmpresa[c.empresa_id]) contratosByEmpresa[c.empresa_id] = []
          contratosByEmpresa[c.empresa_id].push(c.id)
        }
      })

      const obrasByContrato: Record<string, number> = {}
      obras?.forEach(o => { obrasByContrato[o.contrato_id] = (obrasByContrato[o.contrato_id] || 0) + 1 })

      const stats: EmpresaStats[] = eRes.data?.map(e => {
        const cts = contratosByEmpresa[e.id] || []
        const obrasCount = cts.reduce((s, cId) => s + (obrasByContrato[cId] || 0), 0)
        const usersCount = perfis?.filter(p => p.empresa_id === e.id).length || 0
        return { empresa_id: e.id, contratos: cts.length, obras: obrasCount, usuarios: usersCount }
      }) || []

      setEmpresaStats(stats)
      setTotalUsuarios(perfis?.length || 0)
      setTotalObras(obras?.length || 0)

      // Medições do mês atual
      const now = new Date()
      const mesInicio = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const mesFim = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString()
      const { count } = await supabase.from('medicoes').select('id', { count: 'exact', head: true })
        .gte('created_at', mesInicio).lte('created_at', mesFim)
      setMedicoesEsteMes(count || 0)
    } catch (err) {
      console.error('Stats error:', err)
    }

    setLoading(false)
  }

  // ─── MÉTRICAS ─────────────────────────────────────────────────────────────
  const empresasAtivas = empresas.filter(e => e.status === 'ATIVA' || e.status === 'TRIAL')
  const mrr = empresas.filter(e => e.status === 'ATIVA' && e.cobranca_ativa).reduce((s, e) => s + Number(e.valor_mensal), 0)
  const arr = mrr * 12
  const inadimplentes = empresas.filter(e => e.data_vencimento && new Date(e.data_vencimento) < new Date() && e.cobranca_ativa)
  const trials = empresas.filter(e => e.status === 'TRIAL')
  const filtradas = busca ? empresas.filter(e => e.nome.toLowerCase().includes(busca.toLowerCase())) : empresas
  const pagantes = empresasAtivas.filter(e => e.cobranca_ativa)
  const ticketMedio = pagantes.length > 0 ? Math.round(mrr / pagantes.length) : 0
  const canceladas = empresas.filter(e => e.status === 'CANCELADA')
  const churnRate = empresas.length > 0 ? ((canceladas.length / empresas.length) * 100).toFixed(1) : '0.0'

  const now = new Date()
  const empresasEsteMes = empresas.filter(e => {
    const d = new Date(e.created_at)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })

  const getStats = (empresaId: string) => empresaStats.find(s => s.empresa_id === empresaId) || { contratos: 0, obras: 0, usuarios: 0 }

  // ─── TOGGLE MÓDULO ─────────────────────────────────────────────────────────
  async function toggleModulo(empresaId: string, modulo: string, atual: boolean) {
    const existing = modulos.find(m => m.empresa_id === empresaId && m.modulo === modulo)
    if (existing) {
      await supabase.from('empresa_modulos').update({ habilitado: !atual }).eq('id', existing.id)
    } else {
      await supabase.from('empresa_modulos').insert({ empresa_id: empresaId, modulo, habilitado: true, tipo: 'CUSTOM' })
    }
    const { data } = await supabase.from('empresa_modulos').select('*')
    if (data) setModulos(data)
    toast.success(`${MODULO_LABELS[modulo] || modulo} ${!atual ? 'habilitado' : 'desabilitado'}`)
  }

  // ─── MUDAR PLANO ──────────────────────────────────────────────────────────
  async function mudarPlano(empresa: Empresa, novoPlano: string) {
    let max_obras = 5, max_usuarios = 3, valor = 0
    if (novoPlano === 'STARTER') { max_obras = 5; max_usuarios = 3; valor = 97 }
    else if (novoPlano === 'PROFISSIONAL') { max_obras = 30; max_usuarios = 10; valor = 297 }
    else if (novoPlano === 'ENTERPRISE') { max_obras = 0; max_usuarios = 0; valor = 497 }
    else if (novoPlano === 'ILIMITADO') { max_obras = 0; max_usuarios = 0; valor = 0 }

    await supabase.from('empresas').update({
      plano: novoPlano, max_obras, max_usuarios, valor_mensal: valor,
      cobranca_ativa: novoPlano !== 'ILIMITADO' && novoPlano !== 'TRIAL',
      status: novoPlano === 'TRIAL' ? 'TRIAL' : 'ATIVA',
    }).eq('id', empresa.id)
    toast.success(`Plano de ${empresa.nome} alterado para ${novoPlano}`)
    fetchAll()
  }

  // ─── CRIAR EMPRESA ────────────────────────────────────────────────────────
  async function criarEmpresa() {
    if (!fNome) { toast.error('Nome obrigatório'); return }
    setSaving(true)
    const { error } = await supabase.rpc('criar_empresa_com_modulos', {
      p_nome: fNome, p_cnpj: fCnpj || null, p_email: fEmail || null, p_plano: fPlano,
    })
    if (error) toast.error(error.message); else { toast.success('Empresa criada!'); setShowForm(false); fetchAll() }
    setSaving(false)
  }

  // ─── STATUS TOGGLE ────────────────────────────────────────────────────────
  async function toggleStatus(empresa: Empresa) {
    const novoStatus = empresa.status === 'BLOQUEADA' ? 'ATIVA' : 'BLOQUEADA'
    await supabase.from('empresas').update({ status: novoStatus }).eq('id', empresa.id)
    toast.success(`${empresa.nome} ${novoStatus === 'BLOQUEADA' ? 'bloqueada' : 'desbloqueada'}`)
    fetchAll()
  }

  const isModuloOn = (eId: string, mod: string) => modulos.some(m => m.empresa_id === eId && m.modulo === mod && m.habilitado)
  const modulosEmpresa = (eId: string) => modulos.filter(m => m.empresa_id === eId)

  const planoBadge = (p: string) => {
    if (p === 'ILIMITADO') return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
    if (p === 'ENTERPRISE') return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
    if (p === 'PROFISSIONAL') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
    if (p === 'STARTER') return 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
    return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
  }
  const statusBadge = (s: string) => {
    if (s === 'ATIVA') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
    if (s === 'TRIAL') return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
    if (s === 'BLOQUEADA') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    if (s === 'CANCELADA') return 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-500'
    return 'bg-slate-100 text-slate-600'
  }

  return (
    <div className="p-6 overflow-y-auto" style={{ height: '100%' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Shield size={24} className="text-red-500"/> SuperAdmin — MedObras
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Gestão de empresas, módulos e faturamento</p>
        </div>
        <button onClick={fetchAll} className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/>
        </button>
      </div>

      {/* Abas */}
      <div className="flex gap-1 mb-5 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 overflow-x-auto">
        {([
          { id: 'overview' as Aba, icon: TrendingUp, label: 'Visão geral' },
          { id: 'empresas' as Aba, icon: Building2, label: 'Empresas' },
          { id: 'modulos' as Aba, icon: ToggleLeft, label: 'Feature flags' },
          { id: 'financeiro' as Aba, icon: DollarSign, label: 'Financeiro' },
          { id: 'planos' as Aba, icon: Briefcase, label: 'Planos' },
        ]).map(t => (
          <button key={t.id} onClick={() => setAba(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${aba === t.id ? 'bg-white dark:bg-slate-700 text-primary-600 dark:text-primary-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
            <t.icon size={14}/> {t.label}
          </button>
        ))}
      </div>

      {/* ═══ VISÃO GERAL ═══ */}
      {aba === 'overview' && (
        <div className="space-y-4">
          {/* Linha 1: 4 KPIs principais */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Empresas Ativas</p>
              <p className="text-3xl font-bold text-slate-800 dark:text-white mt-1">{empresasAtivas.length}</p>
              <p className="text-[10px] text-emerald-500 font-medium mt-1">+{empresasEsteMes.length} este mês</p>
            </div>

            <div className="rounded-xl p-4 border-2" style={{ background: '#FFF7ED', borderColor: '#FED7AA' }}>
              <p className="text-[10px] uppercase font-semibold" style={{ color: '#E8611A' }}>MRR</p>
              <p className="text-3xl font-bold mt-1" style={{ color: '#E8611A' }}>R$ {mrr.toLocaleString('pt-BR')}</p>
              <p className="text-[10px] font-medium mt-1" style={{ color: '#B45309' }}>
                {empresasEsteMes.filter(e => e.cobranca_ativa).length > 0
                  ? `+R$ ${empresasEsteMes.filter(e => e.cobranca_ativa).reduce((s, e) => s + Number(e.valor_mensal), 0).toLocaleString('pt-BR')} vs mês anterior`
                  : `ARR: R$ ${arr.toLocaleString('pt-BR')}`}
              </p>
            </div>

            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Usuários Totais</p>
              <p className="text-3xl font-bold text-slate-800 dark:text-white mt-1">{totalUsuarios}</p>
              <p className="text-[10px] text-slate-400 mt-1">{pagantes.reduce((s, e) => s + getStats(e.id).usuarios, 0)} ativos hoje</p>
            </div>

            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Churn Rate</p>
              <p className="text-3xl font-bold text-slate-800 dark:text-white mt-1">{churnRate}%</p>
              <p className="text-[10px] text-slate-400 mt-1">{canceladas.length} cancelamento{canceladas.length !== 1 ? 's' : ''}</p>
            </div>
          </div>

          {/* Linha 2: 3 KPIs secundários */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Obras Cadastradas</p>
              <p className="text-3xl font-bold text-slate-800 dark:text-white mt-1">{totalObras}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Medições Este Mês</p>
              <p className="text-3xl font-bold text-slate-800 dark:text-white mt-1">{medicoesEsteMes}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <p className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider">Ticket Médio</p>
              <p className="text-3xl font-bold text-slate-800 dark:text-white mt-1">R$ {ticketMedio}</p>
            </div>
          </div>

          {/* Alertas */}
          {(inadimplentes.length > 0 || trials.filter(t => t.trial_fim && new Date(t.trial_fim) < new Date(Date.now() + 3 * 86400000)).length > 0) && (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-2">
              <p className="text-xs font-bold text-slate-700 dark:text-white flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-500"/> Alertas
              </p>
              {inadimplentes.map(e => (
                <div key={e.id} className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 rounded-lg text-xs text-red-700 dark:text-red-400">
                  <AlertTriangle size={12}/> <span className="font-bold">{e.nome}</span> — fatura vencida (R$ {Number(e.valor_mensal).toFixed(0)}/mês)
                </div>
              ))}
              {trials.filter(t => t.trial_fim && new Date(t.trial_fim) < new Date(Date.now() + 3 * 86400000)).map(e => (
                <div key={e.id} className="flex items-center gap-2 px-3 py-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg text-xs text-yellow-700 dark:text-yellow-400">
                  <Activity size={12}/> <span className="font-bold">{e.nome}</span> — trial expira em {e.trial_fim ? Math.max(0, Math.ceil((new Date(e.trial_fim).getTime() - Date.now()) / 86400000)) : '?'} dias
                </div>
              ))}
            </div>
          )}

          {/* Últimas empresas cadastradas */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <p className="text-xs font-bold text-slate-700 dark:text-white mb-3">Últimas empresas cadastradas</p>
            {empresas.slice(0, 5).map(e => {
              const st = getStats(e.id)
              const desde = new Date(e.created_at).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
              return (
                <div key={e.id} className="flex items-center gap-3 py-2.5 border-b border-slate-100 dark:border-slate-700 last:border-0">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ background: '#E8611A' }}>
                    {e.nome.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-800 dark:text-white truncate">{e.nome}</p>
                    <p className="text-[10px] text-slate-400">
                      {st.contratos} contrato{st.contratos !== 1 ? 's' : ''} · {st.obras} obra{st.obras !== 1 ? 's' : ''} · desde {desde}
                    </p>
                  </div>
                  <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${planoBadge(e.plano)}`}>{e.plano}</span>
                  <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${statusBadge(e.status)}`}>{e.status}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ═══ EMPRESAS ═══ */}
      {aba === 'empresas' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1"><Search size={14} className="absolute left-3 top-2.5 text-slate-400"/>
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar empresa..."
                className="w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-xs"/>
            </div>
            <button onClick={() => { setFNome(''); setFCnpj(''); setFEmail(''); setFPlano('TRIAL'); setShowForm(true) }}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg text-xs">
              <Plus size={14}/> Nova empresa
            </button>
          </div>

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
            {/* Header da tabela */}
            <div className="hidden sm:flex items-center gap-3 px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase border-b border-slate-200 dark:border-slate-700">
              <span className="w-9"></span>
              <span className="flex-1">Empresa</span>
              <span className="w-14 text-center">Contratos</span>
              <span className="w-14 text-center">Obras</span>
              <span className="w-14 text-center">Usuários</span>
              <span className="w-20 text-center">Plano</span>
              <span className="w-16 text-right">Valor</span>
              <span className="w-16 text-center">Status</span>
              <span className="w-32"></span>
            </div>

            {filtradas.map(e => {
              const st = getStats(e.id)
              const isExpanded = expandedEmpresa === e.id
              return (
                <div key={e.id}>
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-700 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-750 cursor-pointer"
                    onClick={() => setExpandedEmpresa(isExpanded ? null : e.id)}>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0" style={{ background: '#E8611A' }}>
                      {e.nome.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-800 dark:text-white truncate">{e.nome}</p>
                      <p className="text-[10px] text-slate-400 truncate">{e.cnpj || 'Sem CNPJ'} · {e.email_contato || ''}</p>
                    </div>
                    <span className="w-14 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 hidden sm:block">{st.contratos}</span>
                    <span className="w-14 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 hidden sm:block">{st.obras}</span>
                    <span className="w-14 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 hidden sm:block">{st.usuarios}</span>
                    <span className="w-20 text-center hidden sm:block"><span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${planoBadge(e.plano)}`}>{e.plano}</span></span>
                    <span className="w-16 text-right text-xs font-bold text-slate-700 dark:text-white hidden sm:block">R$ {Number(e.valor_mensal).toFixed(0)}</span>
                    <span className="w-16 text-center hidden sm:block"><span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${statusBadge(e.status)}`}>{e.status}</span></span>
                    <div className="w-32 flex items-center justify-end gap-1.5 flex-shrink-0">
                      <button onClick={(ev) => { ev.stopPropagation(); setEmpresaSel(e.id); setAba('modulos') }}
                        className="text-[10px] px-2 py-1 border border-primary-200 dark:border-primary-800 text-primary-600 dark:text-primary-400 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20">
                        Módulos
                      </button>
                      <button onClick={(ev) => { ev.stopPropagation(); toggleStatus(e) }}
                        className={`text-[10px] px-2 py-1 rounded-lg border ${e.status === 'BLOQUEADA' ? 'border-emerald-300 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400' : 'border-red-200 text-red-500 hover:bg-red-50 dark:border-red-800 dark:text-red-400'}`}>
                        {e.status === 'BLOQUEADA' ? 'Ativar' : 'Bloquear'}
                      </button>
                      {isExpanded ? <ChevronUp size={14} className="text-slate-400"/> : <ChevronDown size={14} className="text-slate-400"/>}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase font-semibold">Plano atual</p>
                          <select value={e.plano} onChange={ev => mudarPlano(e, ev.target.value)}
                            className="mt-1 text-xs border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-2 py-1.5 w-full">
                            <option value="TRIAL">Trial</option><option value="STARTER">Starter (R$ 97)</option><option value="PROFISSIONAL">Profissional (R$ 297)</option><option value="ENTERPRISE">Enterprise (R$ 497)</option><option value="ILIMITADO">Ilimitado (grátis)</option>
                          </select>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase font-semibold">Desde</p>
                          <p className="text-xs text-slate-700 dark:text-white mt-1.5">{new Date(e.created_at).toLocaleDateString('pt-BR')}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase font-semibold">Cobrança</p>
                          <p className="text-xs mt-1.5">
                            {e.cobranca_ativa
                              ? <span className="text-emerald-600 dark:text-emerald-400 font-medium">Ativa — R$ {Number(e.valor_mensal).toFixed(0)}/mês</span>
                              : <span className="text-slate-400">Inativa (grátis)</span>}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 uppercase font-semibold">Limites</p>
                          <p className="text-xs text-slate-700 dark:text-white mt-1.5">
                            {e.max_obras === 0 ? '∞' : e.max_obras} obras · {e.max_usuarios === 0 ? '∞' : e.max_usuarios} usuários
                          </p>
                        </div>
                      </div>
                      {e.observacoes && <p className="text-[10px] text-slate-500 italic">Obs: {e.observacoes}</p>}
                    </div>
                  )}
                </div>
              )
            })}
            {filtradas.length === 0 && <div className="p-8 text-center text-slate-400 text-xs">{loading ? 'Carregando...' : 'Nenhuma empresa encontrada'}</div>}
          </div>
        </div>
      )}

      {/* ═══ FEATURE FLAGS ═══ */}
      {aba === 'modulos' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <select value={empresaSel || ''} onChange={e => setEmpresaSel(e.target.value || null)}
              className="border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-xs flex-1">
              <option value="">Selecione uma empresa...</option>
              {empresas.map(e => <option key={e.id} value={e.id}>{e.nome} ({e.plano})</option>)}
            </select>
          </div>

          {empresaSel && (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-white">{empresas.find(e => e.id === empresaSel)?.nome}</p>
                  <p className="text-[10px] text-slate-400">Habilite ou desabilite módulos individualmente</p>
                </div>
                <span className={`text-[9px] px-2.5 py-1 rounded-full font-bold ${planoBadge(empresas.find(e => e.id === empresaSel)?.plano || '')}`}>
                  {empresas.find(e => e.id === empresaSel)?.plano}
                </span>
              </div>

              {Object.entries(MODULOS_POR_PLANO).map(([tier, mods]) => (
                <div key={tier}>
                  <p className={`text-[10px] font-bold uppercase tracking-wider py-2 border-b border-slate-200 dark:border-slate-700 mb-1 ${tier === 'BETA' ? 'text-primary-500' : tier === 'ENTERPRISE' ? 'text-orange-500' : tier === 'PRO' ? 'text-blue-500' : 'text-slate-500'}`}>
                    {MODULOS_LABEL_PLANO[tier]}
                  </p>
                  {mods.map(mod => {
                    const on = isModuloOn(empresaSel, mod)
                    return (
                      <div key={mod} className="flex items-center justify-between py-2.5 border-b border-slate-50 dark:border-slate-700/50 last:border-0">
                        <div>
                          <p className="text-xs text-slate-800 dark:text-white">{MODULO_LABELS[mod] || mod}</p>
                          <p className="text-[9px] text-slate-400">
                            {tier === 'BETA' && <span className="inline-block px-1.5 py-0.5 rounded text-[8px] font-bold mr-1" style={{ background: '#FFF7ED', color: '#E8611A' }}>BETA</span>}
                            {tier}
                          </p>
                        </div>
                        <div className={`w-10 h-5 rounded-full cursor-pointer relative transition-colors ${on ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                          onClick={() => toggleModulo(empresaSel, mod, on)}>
                          <div className={`absolute w-4 h-4 rounded-full bg-white top-0.5 transition-all shadow-sm ${on ? 'left-5' : 'left-0.5'}`}/>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}

              {/* Custom */}
              <p className="text-[10px] font-bold uppercase tracking-wider py-2 border-b border-slate-200 dark:border-slate-700 mb-1 text-purple-500 mt-3">
                Módulos customizados (sob demanda)
              </p>
              {modulosEmpresa(empresaSel).filter(m => m.tipo === 'CUSTOM').map(m => (
                <div key={m.id} className="flex items-center justify-between py-2.5 border-b border-slate-50 dark:border-slate-700/50 last:border-0">
                  <div>
                    <p className="text-xs text-slate-800 dark:text-white">{MODULO_LABELS[m.modulo] || m.modulo}</p>
                    <p className="text-[9px] text-purple-500">{m.valor_extra > 0 ? `R$ ${m.valor_extra}/mês` : 'Sem custo extra'} {m.observacao ? `· ${m.observacao}` : ''}</p>
                  </div>
                  <div className={`w-10 h-5 rounded-full cursor-pointer relative transition-colors ${m.habilitado ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                    onClick={() => toggleModulo(empresaSel, m.modulo, m.habilitado)}>
                    <div className={`absolute w-4 h-4 rounded-full bg-white top-0.5 transition-all shadow-sm ${m.habilitado ? 'left-5' : 'left-0.5'}`}/>
                  </div>
                </div>
              ))}
              {modulosEmpresa(empresaSel).filter(m => m.tipo === 'CUSTOM').length === 0 && (
                <p className="text-[10px] text-slate-400 py-2">Nenhum módulo custom para esta empresa</p>
              )}
            </div>
          )}

          {!empresaSel && (
            <div className="text-center py-16 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
              <Building2 size={36} className="mx-auto text-slate-300 dark:text-slate-600 mb-3"/>
              <p className="text-slate-400 text-sm">Selecione uma empresa para gerenciar seus módulos</p>
            </div>
          )}
        </div>
      )}

      {/* ═══ FINANCEIRO ═══ */}
      {aba === 'financeiro' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl p-4 border" style={{ background: '#FFF7ED', borderColor: '#FED7AA' }}>
              <p className="text-[10px] uppercase font-semibold" style={{ color: '#9A3412' }}>MRR (receita mensal)</p>
              <p className="text-2xl font-bold" style={{ color: '#E8611A' }}>R$ {mrr.toLocaleString('pt-BR')}</p>
            </div>
            <div className="rounded-xl p-4 border" style={{ background: '#F0FDF4', borderColor: '#BBF7D0' }}>
              <p className="text-[10px] uppercase font-semibold" style={{ color: '#166534' }}>ARR (anualizado)</p>
              <p className="text-2xl font-bold" style={{ color: '#059669' }}>R$ {arr.toLocaleString('pt-BR')}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <p className="text-[10px] text-slate-400 uppercase font-semibold">Inadimplentes</p>
              <p className={`text-2xl font-bold ${inadimplentes.length > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{inadimplentes.length}</p>
              <p className="text-[10px] text-slate-400">R$ {inadimplentes.reduce((s, e) => s + Number(e.valor_mensal), 0).toLocaleString('pt-BR')} em atraso</p>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <p className="text-[10px] text-slate-400 uppercase font-semibold">LTV médio estimado</p>
              <p className="text-2xl font-bold text-slate-800 dark:text-white">R$ {pagantes.length > 0 ? (mrr / pagantes.length * 18).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '0'}</p>
              <p className="text-[10px] text-slate-400">Baseado em 18 meses</p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <p className="text-xs font-bold text-slate-700 dark:text-white mb-3">Faturamento por empresa</p>
            <div className="flex items-center gap-3 px-3 py-2 text-[10px] font-bold text-slate-400 uppercase border-b border-slate-200 dark:border-slate-700">
              <span className="flex-1">Empresa</span><span className="w-20 text-center">Plano</span><span className="w-20 text-right">Mensal</span><span className="w-20 text-right">Status</span>
            </div>
            {empresas.map(e => (
              <div key={e.id} className="flex items-center gap-3 px-3 py-2.5 border-b border-slate-50 dark:border-slate-700/50 last:border-0 text-xs">
                <span className="flex-1 font-medium text-slate-800 dark:text-white">{e.nome}</span>
                <span className="w-20 text-center"><span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${planoBadge(e.plano)}`}>{e.plano}</span></span>
                <span className="w-20 text-right font-bold text-slate-700 dark:text-white">R$ {Number(e.valor_mensal).toFixed(0)}</span>
                <span className="w-20 text-right">
                  {!e.cobranca_ativa ? <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-slate-100 dark:bg-slate-700 text-slate-500">Grátis</span> :
                    e.data_vencimento && new Date(e.data_vencimento) < new Date() ? <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">Vencida</span> :
                      <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">Pago</span>}
                </span>
              </div>
            ))}
            <div className="flex items-center gap-3 px-3 py-3 border-t-2 border-slate-200 dark:border-slate-600 mt-1">
              <span className="flex-1 font-bold text-slate-800 dark:text-white text-sm">Total MRR</span>
              <span className="w-20"></span>
              <span className="w-20 text-right font-bold text-lg" style={{ color: '#E8611A' }}>R$ {mrr.toLocaleString('pt-BR')}</span>
              <span className="w-20"></span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {['STARTER', 'PROFISSIONAL', 'ENTERPRISE', 'ILIMITADO'].map(p => {
              const count = empresas.filter(e => e.plano === p).length
              const rev = empresas.filter(e => e.plano === p && e.cobranca_ativa).reduce((s, e) => s + Number(e.valor_mensal), 0)
              return (
                <div key={p} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                  <p className="text-[10px] text-slate-400 uppercase font-semibold">{p}</p>
                  <p className="text-lg font-bold text-slate-800 dark:text-white">{count} empresa{count !== 1 ? 's' : ''}</p>
                  <p className="text-[10px] text-slate-400">R$ {rev.toLocaleString('pt-BR')}/mês</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ═══ PLANOS ═══ */}
      {aba === 'planos' && (
        <div className="space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Visão geral dos planos com módulos incluídos e empresas em cada um.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(PLANOS_INFO).map(([key, info]) => {
              const count = empresas.filter(e => e.plano === key).length
              const rev = empresas.filter(e => e.plano === key && e.cobranca_ativa).reduce((s, e) => s + Number(e.valor_mensal), 0)
              const modulosIncluidos: string[] = []
              if (key === 'STARTER') modulosIncluidos.push(...MODULOS_POR_PLANO.CORE)
              else if (key === 'PROFISSIONAL') modulosIncluidos.push(...MODULOS_POR_PLANO.CORE, ...MODULOS_POR_PLANO.PRO)
              else modulosIncluidos.push(...MODULOS_POR_PLANO.CORE, ...MODULOS_POR_PLANO.PRO, ...MODULOS_POR_PLANO.ENTERPRISE)

              return (
                <div key={key} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 flex flex-col">
                  <div className="mb-3">
                    <span className="text-[9px] px-2 py-0.5 rounded-full font-bold" style={{ background: info.bgCor, color: info.cor }}>{key}</span>
                  </div>
                  <p className="text-xl font-bold dark:text-white" style={{ color: info.cor }}>
                    {info.valor > 0 ? <>R$ {info.valor}<span className="text-xs font-normal text-slate-400">/mês</span></> : 'Grátis'}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">{info.obras} · {info.usuarios}</p>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700 flex-1">
                    <p className="text-[10px] text-slate-400 uppercase font-semibold mb-2">Módulos incluídos</p>
                    <div className="space-y-1">
                      {modulosIncluidos.map(mod => (
                        <div key={mod} className="flex items-center gap-1.5 text-[10px] text-slate-600 dark:text-slate-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0"/>
                          {MODULO_LABELS[mod] || mod}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700">
                    <p className="text-xs font-bold text-slate-700 dark:text-white">{count} empresa{count !== 1 ? 's' : ''}</p>
                    <p className="text-[10px] text-slate-400">R$ {rev.toLocaleString('pt-BR')}/mês de receita</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ═══ MODAL NOVA EMPRESA ═══ */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-3">
            <h2 className="text-lg font-bold dark:text-white">Nova empresa</h2>
            <div><label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Nome *</label>
              <input value={fNome} onChange={e => setFNome(e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/></div>
            <div><label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">CNPJ</label>
              <input value={fCnpj} onChange={e => setFCnpj(e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/></div>
            <div><label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">E-mail contato</label>
              <input value={fEmail} onChange={e => setFEmail(e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/></div>
            <div><label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Plano</label>
              <select value={fPlano} onChange={e => setFPlano(e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm">
                <option value="TRIAL">Trial (14 dias grátis)</option><option value="STARTER">Starter (R$ 97/mês)</option><option value="PROFISSIONAL">Profissional (R$ 297/mês)</option><option value="ENTERPRISE">Enterprise (R$ 497/mês)</option><option value="ILIMITADO">Ilimitado (grátis)</option>
              </select></div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-600 dark:text-slate-400">Cancelar</button>
              <button onClick={criarEmpresa} disabled={saving} className="px-5 py-2 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg text-sm">
                {saving ? 'Criando...' : 'Criar empresa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
