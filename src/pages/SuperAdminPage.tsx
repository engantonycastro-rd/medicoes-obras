import { useEffect, useState, useMemo } from 'react'
import { Building2, DollarSign, ToggleLeft, ToggleRight, Plus, Search, Edit3, Save, X, Loader2, AlertTriangle, TrendingUp, Users, FileText, Shield, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { MODULO_LABELS, MODULOS_POR_PLANO, type Empresa, type EmpresaModulo } from '../lib/empresaStore'

type Aba = 'overview' | 'empresas' | 'modulos' | 'financeiro'

export function SuperAdminPage() {
  const [aba, setAba] = useState<Aba>('overview')
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [modulos, setModulos] = useState<EmpresaModulo[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [empresaSel, setEmpresaSel] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

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
    setLoading(false)
  }

  // ─── MÉTRICAS ────────────────────────────────────────────────────────────────
  const empresasAtivas = empresas.filter(e => e.status === 'ATIVA' || e.status === 'TRIAL')
  const mrr = empresas.filter(e => e.status === 'ATIVA' && e.cobranca_ativa).reduce((s, e) => s + Number(e.valor_mensal), 0)
  const arr = mrr * 12
  const inadimplentes = empresas.filter(e => e.data_vencimento && new Date(e.data_vencimento) < new Date() && e.cobranca_ativa)
  const trials = empresas.filter(e => e.status === 'TRIAL')
  const filtradas = busca ? empresas.filter(e => e.nome.toLowerCase().includes(busca.toLowerCase())) : empresas

  // ─── TOGGLE MÓDULO ───────────────────────────────────────────────────────────
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

  // ─── MUDAR PLANO ─────────────────────────────────────────────────────────────
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

  // ─── CRIAR EMPRESA ───────────────────────────────────────────────────────────
  async function criarEmpresa() {
    if (!fNome) { toast.error('Nome obrigatório'); return }
    setSaving(true)
    const { data, error } = await supabase.rpc('criar_empresa_com_modulos', {
      p_nome: fNome, p_cnpj: fCnpj || null, p_email: fEmail || null, p_plano: fPlano,
    })
    if (error) toast.error(error.message); else { toast.success('Empresa criada!'); setShowForm(false); fetchAll() }
    setSaving(false)
  }

  // ─── STATUS TOGGLE ───────────────────────────────────────────────────────────
  async function toggleStatus(empresa: Empresa) {
    const novoStatus = empresa.status === 'BLOQUEADA' ? 'ATIVA' : 'BLOQUEADA'
    await supabase.from('empresas').update({ status: novoStatus }).eq('id', empresa.id)
    toast.success(`${empresa.nome} ${novoStatus === 'BLOQUEADA' ? 'bloqueada' : 'desbloqueada'}`)
    fetchAll()
  }

  const modulosEmpresa = (eId: string) => modulos.filter(m => m.empresa_id === eId)
  const isModuloOn = (eId: string, mod: string) => modulos.some(m => m.empresa_id === eId && m.modulo === mod && m.habilitado)

  const planoBadge = (p: string) => {
    if (p === 'ILIMITADO') return 'background: #EDE9FE; color: #5B21B6;'
    if (p === 'ENTERPRISE') return 'background: #FFF7ED; color: #9A3412;'
    if (p === 'PROFISSIONAL') return 'background: #DBEAFE; color: #1E40AF;'
    if (p === 'STARTER') return 'background: #F1F5F9; color: #475569;'
    return 'background: #FEF3C7; color: #92400E;'
  }
  const statusBadge = (s: string) => {
    if (s === 'ATIVA') return 'bg-emerald-100 text-emerald-700'
    if (s === 'TRIAL') return 'bg-yellow-100 text-yellow-700'
    if (s === 'BLOQUEADA') return 'bg-red-100 text-red-700'
    return 'bg-slate-100 text-slate-600'
  }

  return (
    <div className="p-6 overflow-y-auto" style={{ height: '100%' }}>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><Shield size={24} className="text-primary-500"/> SuperAdmin — MedObras</h1>
          <p className="text-sm text-slate-500">Gestão de empresas, módulos e faturamento</p>
        </div>
        <button onClick={fetchAll} className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm hover:bg-slate-50"><RefreshCw size={14}/></button>
      </div>

      {/* Abas */}
      <div className="flex gap-1 mb-5 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
        {[
          { id: 'overview' as Aba, icon: TrendingUp, label: 'Visão geral' },
          { id: 'empresas' as Aba, icon: Building2, label: 'Empresas' },
          { id: 'modulos' as Aba, icon: ToggleLeft, label: 'Feature flags' },
          { id: 'financeiro' as Aba, icon: DollarSign, label: 'Financeiro' },
        ].map(t => (
          <button key={t.id} onClick={() => setAba(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all ${aba === t.id ? 'bg-white dark:bg-slate-700 text-primary-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            <t.icon size={14}/> {t.label}
          </button>
        ))}
      </div>

      {/* ── VISÃO GERAL ──────────────────────────────────────────── */}
      {aba === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <p className="text-[10px] text-slate-400 uppercase font-semibold">Empresas ativas</p>
              <p className="text-2xl font-bold text-slate-800 dark:text-white">{empresasAtivas.length}</p>
              <p className="text-[10px] text-slate-400">{trials.length} em trial</p>
            </div>
            <div className="rounded-xl p-4" style={{ background: '#FFF7ED', border: '1px solid #FED7AA' }}>
              <p className="text-[10px] uppercase font-semibold" style={{ color: '#9A3412' }}>MRR</p>
              <p className="text-2xl font-bold" style={{ color: '#E8611A' }}>R$ {mrr.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}</p>
              <p className="text-[10px]" style={{ color: '#B45309' }}>ARR: R$ {arr.toLocaleString('pt-BR')}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <p className="text-[10px] text-slate-400 uppercase font-semibold">Inadimplentes</p>
              <p className={`text-2xl font-bold ${inadimplentes.length > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{inadimplentes.length}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <p className="text-[10px] text-slate-400 uppercase font-semibold">Ticket médio</p>
              <p className="text-2xl font-bold text-slate-800 dark:text-white">R$ {empresasAtivas.filter(e => e.cobranca_ativa).length > 0 ? Math.round(mrr / empresasAtivas.filter(e => e.cobranca_ativa).length) : 0}</p>
            </div>
          </div>

          {/* Alertas */}
          {(inadimplentes.length > 0 || trials.filter(t => t.trial_fim && new Date(t.trial_fim) < new Date(Date.now() + 3 * 86400000)).length > 0) && (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-2">
              <p className="text-xs font-bold text-slate-700 dark:text-white flex items-center gap-2"><AlertTriangle size={14} className="text-primary-500"/> Alertas</p>
              {inadimplentes.map(e => (
                <div key={e.id} className="flex items-center gap-2 px-3 py-2 bg-red-50 rounded-lg text-xs text-red-700">
                  <span className="font-bold">{e.nome}</span> — fatura vencida (R$ {Number(e.valor_mensal).toFixed(0)}/mês)
                </div>
              ))}
              {trials.filter(t => t.trial_fim && new Date(t.trial_fim) < new Date(Date.now() + 3 * 86400000)).map(e => (
                <div key={e.id} className="flex items-center gap-2 px-3 py-2 bg-yellow-50 rounded-lg text-xs text-yellow-700">
                  <span className="font-bold">{e.nome}</span> — trial expira em {e.trial_fim ? Math.ceil((new Date(e.trial_fim).getTime() - Date.now()) / 86400000) : '?'} dias
                </div>
              ))}
            </div>
          )}

          {/* Últimas empresas */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <p className="text-xs font-bold text-slate-700 dark:text-white mb-3">Empresas recentes</p>
            {empresas.slice(0, 5).map(e => (
              <div key={e.id} className="flex items-center gap-3 py-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-[10px] font-bold" style={{ background: '#E8611A' }}>
                  {e.nome.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-800 dark:text-white truncate">{e.nome}</p>
                  <p className="text-[10px] text-slate-400">{e.cnpj || 'Sem CNPJ'}</p>
                </div>
                <span className="text-[9px] px-2 py-0.5 rounded-full font-bold" style={planoBadge(e.plano)}>{e.plano}</span>
                <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${statusBadge(e.status)}`}>{e.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── EMPRESAS ──────────────────────────────────────────── */}
      {aba === 'empresas' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1"><Search size={14} className="absolute left-3 top-2.5 text-slate-400"/>
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar empresa..." className="w-full pl-9 pr-3 py-2 border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-xs"/>
            </div>
            <button onClick={() => { setFNome(''); setFCnpj(''); setFEmail(''); setFPlano('TRIAL'); setShowForm(true) }}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg text-xs"><Plus size={14}/> Nova empresa</button>
          </div>

          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
            {filtradas.map(e => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-700 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-750">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-[10px] font-bold" style={{ background: '#E8611A' }}>
                  {e.nome.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-800 dark:text-white">{e.nome} {e.cnpj && <span className="text-[9px] text-slate-400 font-normal ml-1">{e.cnpj}</span>}</p>
                  <p className="text-[10px] text-slate-400">{e.email_contato || ''} · Desde {new Date(e.created_at).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}</p>
                </div>
                <select value={e.plano} onChange={ev => mudarPlano(e, ev.target.value)} className="text-[10px] border border-slate-200 rounded-lg px-2 py-1 bg-white dark:bg-slate-700 dark:text-white dark:border-slate-600">
                  <option value="TRIAL">Trial</option><option value="STARTER">Starter</option><option value="PROFISSIONAL">Profissional</option><option value="ENTERPRISE">Enterprise</option><option value="ILIMITADO">Ilimitado</option>
                </select>
                <span className="text-xs font-bold text-slate-700 dark:text-white w-16 text-right">R$ {Number(e.valor_mensal).toFixed(0)}</span>
                <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${statusBadge(e.status)}`}>{e.status}</span>
                <button onClick={() => toggleStatus(e)} className={`text-[10px] px-2 py-1 rounded-lg border ${e.status === 'BLOQUEADA' ? 'border-emerald-300 text-emerald-600 hover:bg-emerald-50' : 'border-red-200 text-red-500 hover:bg-red-50'}`}>
                  {e.status === 'BLOQUEADA' ? 'Desbloquear' : 'Bloquear'}
                </button>
                <button onClick={() => { setEmpresaSel(e.id); setAba('modulos') }} className="text-[10px] px-2 py-1 border border-primary-200 text-primary-600 rounded-lg hover:bg-primary-50">Módulos</button>
              </div>
            ))}
            {filtradas.length === 0 && <div className="p-8 text-center text-slate-400 text-xs">{loading ? 'Carregando...' : 'Nenhuma empresa encontrada'}</div>}
          </div>
        </div>
      )}

      {/* ── FEATURE FLAGS ──────────────────────────────────────── */}
      {aba === 'modulos' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <select value={empresaSel || ''} onChange={e => setEmpresaSel(e.target.value || null)} className="border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-xs flex-1">
              <option value="">Selecione uma empresa...</option>
              {empresas.map(e => <option key={e.id} value={e.id}>{e.nome} ({e.plano})</option>)}
            </select>
          </div>

          {empresaSel && (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
              <p className="text-sm font-bold text-slate-800 dark:text-white mb-1">
                {empresas.find(e => e.id === empresaSel)?.nome}
              </p>
              <p className="text-[10px] text-slate-400 mb-4">Habilite ou desabilite módulos individualmente</p>

              {Object.entries(MODULOS_POR_PLANO).map(([tier, mods]) => (
                <div key={tier}>
                  <p className={`text-[10px] font-bold uppercase tracking-wider py-2 border-b border-slate-200 dark:border-slate-700 mb-1 ${tier === 'BETA' ? 'text-primary-500' : 'text-slate-500'}`}>
                    {tier === 'CORE' ? 'Módulos core (todos os planos)' : tier === 'PRO' ? 'Módulos Pro' : tier === 'ENTERPRISE' ? 'Módulos Enterprise' : 'Beta / Futuros'}
                  </p>
                  {mods.map(mod => {
                    const on = isModuloOn(empresaSel, mod)
                    return (
                      <div key={mod} className="flex items-center justify-between py-2 border-b border-slate-50 dark:border-slate-700/50 last:border-0">
                        <div>
                          <p className="text-xs text-slate-800 dark:text-white">{MODULO_LABELS[mod] || mod}</p>
                          <p className="text-[9px] text-slate-400">
                            {tier === 'BETA' && <span className="inline-block px-1.5 py-0.5 rounded text-[8px] font-bold mr-1" style={{ background: '#FFF7ED', color: '#E8611A' }}>BETA</span>}
                            {tier}
                          </p>
                        </div>
                        <div className={`w-9 h-5 rounded-full cursor-pointer relative transition-colors ${on ? 'bg-emerald-500' : 'bg-slate-300'}`}
                          onClick={() => toggleModulo(empresaSel, mod, on)}>
                          <div className={`absolute w-4 h-4 rounded-full bg-white top-0.5 transition-all ${on ? 'left-4' : 'left-0.5'}`}/>
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
                <div key={m.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                  <div>
                    <p className="text-xs text-slate-800 dark:text-white">{MODULO_LABELS[m.modulo] || m.modulo}</p>
                    <p className="text-[9px] text-purple-500">{m.valor_extra > 0 ? `R$ ${m.valor_extra}/mês` : 'Sem custo extra'} {m.observacao ? `· ${m.observacao}` : ''}</p>
                  </div>
                  <div className={`w-9 h-5 rounded-full cursor-pointer relative transition-colors ${m.habilitado ? 'bg-emerald-500' : 'bg-slate-300'}`}
                    onClick={() => toggleModulo(empresaSel, m.modulo, m.habilitado)}>
                    <div className={`absolute w-4 h-4 rounded-full bg-white top-0.5 transition-all ${m.habilitado ? 'left-4' : 'left-0.5'}`}/>
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
              <Building2 size={36} className="mx-auto text-slate-300 mb-3"/>
              <p className="text-slate-400 text-sm">Selecione uma empresa para gerenciar seus módulos</p>
            </div>
          )}
        </div>
      )}

      {/* ── FINANCEIRO ──────────────────────────────────────────── */}
      {aba === 'financeiro' && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-3">
            <div className="rounded-xl p-4" style={{ background: '#FFF7ED', border: '1px solid #FED7AA' }}>
              <p className="text-[10px] uppercase font-semibold" style={{ color: '#9A3412' }}>MRR (receita mensal)</p>
              <p className="text-2xl font-bold" style={{ color: '#E8611A' }}>R$ {mrr.toLocaleString('pt-BR')}</p>
            </div>
            <div className="rounded-xl p-4" style={{ background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
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
              <p className="text-2xl font-bold text-slate-800 dark:text-white">R$ {empresasAtivas.filter(e => e.cobranca_ativa).length > 0 ? (mrr / empresasAtivas.filter(e => e.cobranca_ativa).length * 18).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '0'}</p>
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
                <span className="w-20 text-center"><span className="text-[9px] px-2 py-0.5 rounded-full font-bold" style={planoBadge(e.plano)}>{e.plano}</span></span>
                <span className="w-20 text-right font-bold text-slate-700 dark:text-white">R$ {Number(e.valor_mensal).toFixed(0)}</span>
                <span className="w-20 text-right">
                  {!e.cobranca_ativa ? <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-500">Grátis</span> :
                    e.data_vencimento && new Date(e.data_vencimento) < new Date() ? <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-red-100 text-red-700">Vencida</span> :
                      <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-700">Pago</span>}
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

          {/* Distribuição por plano */}
          <div className="grid grid-cols-4 gap-3">
            {['STARTER', 'PROFISSIONAL', 'ENTERPRISE', 'ILIMITADO'].map(p => {
              const count = empresas.filter(e => e.plano === p).length
              const rev = empresas.filter(e => e.plano === p && e.cobranca_ativa).reduce((s, e) => s + Number(e.valor_mensal), 0)
              return (
                <div key={p} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                  <p className="text-[10px] text-slate-400 uppercase font-semibold">{p}</p>
                  <p className="text-lg font-bold text-slate-800 dark:text-white">{count} empresas</p>
                  <p className="text-[10px] text-slate-400">R$ {rev.toLocaleString('pt-BR')}/mês</p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── MODAL NOVA EMPRESA ──────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-3">
            <h2 className="text-lg font-bold dark:text-white">Nova empresa</h2>
            <div><label className="text-xs font-semibold text-slate-600 block mb-1">Nome *</label>
              <input value={fNome} onChange={e => setFNome(e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/></div>
            <div><label className="text-xs font-semibold text-slate-600 block mb-1">CNPJ</label>
              <input value={fCnpj} onChange={e => setFCnpj(e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/></div>
            <div><label className="text-xs font-semibold text-slate-600 block mb-1">E-mail contato</label>
              <input value={fEmail} onChange={e => setFEmail(e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/></div>
            <div><label className="text-xs font-semibold text-slate-600 block mb-1">Plano</label>
              <select value={fPlano} onChange={e => setFPlano(e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm">
                <option value="TRIAL">Trial (14 dias grátis)</option><option value="STARTER">Starter (R$ 97/mês)</option><option value="PROFISSIONAL">Profissional (R$ 297/mês)</option><option value="ENTERPRISE">Enterprise (R$ 497/mês)</option><option value="ILIMITADO">Ilimitado (grátis)</option>
              </select></div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm">Cancelar</button>
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
