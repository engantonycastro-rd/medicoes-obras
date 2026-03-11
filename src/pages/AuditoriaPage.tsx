import { useEffect, useState, useMemo } from 'react'
import {
  History, RefreshCw, Filter, Plus, Pencil, Trash2,
  FileText, Clock, ChevronDown, ChevronRight, User, Search,
  AlertCircle, CheckCircle2, ArrowRight,
} from 'lucide-react'
import { useStore } from '../lib/store'
import { usePerfilStore } from '../lib/perfilStore'
import { Obra } from '../types'
import { formatDate } from '../utils/calculations'
import { supabase } from '../lib/supabase'

interface AuditRow {
  id: string; created_at: string
  user_email: string|null; user_nome: string|null
  tabela: string; registro_id: string; acao: string
  obra_id: string|null; contrato_id: string|null; medicao_id: string|null
  dados_antes: any; dados_depois: any; campos_alterados: string[]|null
  resumo: string|null
}

const ACAO_ICON: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  INSERT: { icon: <Plus size={12}/>,    color: 'bg-emerald-100 text-emerald-600 border-emerald-200', label: 'Criação' },
  UPDATE: { icon: <Pencil size={12}/>,  color: 'bg-blue-100 text-blue-600 border-blue-200',         label: 'Alteração' },
  DELETE: { icon: <Trash2 size={12}/>,  color: 'bg-red-100 text-red-600 border-red-200',            label: 'Exclusão' },
}

const TABELA_LABEL: Record<string, string> = {
  medicoes: 'Medição',
  linhas_memoria: 'Linha de Memória',
  servicos: 'Serviço',
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min} min atrás`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h atrás`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d} dia${d > 1 ? 's' : ''} atrás`
  return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function AuditoriaPage() {
  const { contratos, fetchContratos, fetchObras } = useStore()
  const { perfilAtual } = usePerfilStore()
  const isAdmin = perfilAtual?.role === 'ADMIN'

  const [registros, setRegistros] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [todasObras, setTodasObras] = useState<(Obra & { contrato_nome: string })[]>([])
  const [expandido, setExpandido] = useState<string|null>(null)

  // Filtros
  const [obraFiltro, setObraFiltro] = useState('todas')
  const [acaoFiltro, setAcaoFiltro] = useState('todas')
  const [tabelaFiltro, setTabelaFiltro] = useState('todas')
  const [busca, setBusca] = useState('')
  const [limite, setLimite] = useState(100)

  useEffect(() => {
    fetchContratos().then(async () => {
      const store = useStore.getState()
      const obrasAll: (Obra & { contrato_nome: string })[] = []
      for (const c of store.contratos) {
        const obs = await fetchObras(c.id)
        for (const o of obs) obrasAll.push({ ...o, contrato_nome: c.nome_obra })
      }
      setTodasObras(obrasAll)
    })
    fetchRegistros()
  }, [])

  async function fetchRegistros() {
    setLoading(true)
    const { data, error } = await supabase
      .from('auditoria').select('*')
      .order('created_at', { ascending: false })
      .limit(500)
    if (!error && data) setRegistros(data as AuditRow[])
    setLoading(false)
  }

  const filtrados = useMemo(() => {
    let list = registros
    if (obraFiltro !== 'todas') list = list.filter(r => r.obra_id === obraFiltro)
    if (acaoFiltro !== 'todas') list = list.filter(r => r.acao === acaoFiltro)
    if (tabelaFiltro !== 'todas') list = list.filter(r => r.tabela === tabelaFiltro)
    if (busca) {
      const q = busca.toLowerCase()
      list = list.filter(r =>
        (r.resumo || '').toLowerCase().includes(q) ||
        (r.user_nome || '').toLowerCase().includes(q) ||
        (r.user_email || '').toLowerCase().includes(q)
      )
    }
    return list.slice(0, limite)
  }, [registros, obraFiltro, acaoFiltro, tabelaFiltro, busca, limite])

  // Agrupa por dia
  const porDia = useMemo(() => {
    const map = new Map<string, AuditRow[]>()
    for (const r of filtrados) {
      const dia = new Date(r.created_at).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
      const arr = map.get(dia) || []; arr.push(r); map.set(dia, arr)
    }
    return [...map.entries()]
  }, [filtrados])

  if (!isAdmin) return (
    <div className="p-8">
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-center gap-4">
        <AlertCircle size={24} className="text-red-500"/><p className="font-semibold text-red-800">Acesso restrito a administradores.</p>
      </div>
    </div>
  )

  return (
    <div className="p-6 max-w-5xl overflow-y-auto" style={{ height: '100%' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <History size={24} className="text-amber-500"/> Histórico & Auditoria
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Registro automático de todas as alterações em medições e memória de cálculo</p>
        </div>
        <button onClick={fetchRegistros} disabled={loading}
          className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/> Atualizar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Total registros', val: registros.length, color: 'text-slate-700' },
          { label: 'Criações', val: registros.filter(r => r.acao === 'INSERT').length, color: 'text-emerald-600' },
          { label: 'Alterações', val: registros.filter(r => r.acao === 'UPDATE').length, color: 'text-blue-600' },
          { label: 'Exclusões', val: registros.filter(r => r.acao === 'DELETE').length, color: 'text-red-600' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4">
            <p className={`text-xl font-bold ${s.color}`}>{s.val}</p>
            <p className="text-xs text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por resumo, usuário..."
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"/>
        </div>
        <select value={obraFiltro} onChange={e => setObraFiltro(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white">
          <option value="todas">Todas as obras</option>
          {todasObras.map(o => <option key={o.id} value={o.id}>{o.contrato_nome} › {o.nome_obra}</option>)}
        </select>
        <select value={acaoFiltro} onChange={e => setAcaoFiltro(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white">
          <option value="todas">Todas as ações</option>
          <option value="INSERT">Criações</option>
          <option value="UPDATE">Alterações</option>
          <option value="DELETE">Exclusões</option>
        </select>
        <select value={tabelaFiltro} onChange={e => setTabelaFiltro(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white">
          <option value="todas">Todas as tabelas</option>
          <option value="medicoes">Medições</option>
          <option value="linhas_memoria">Linhas de Memória</option>
        </select>
      </div>

      {/* Timeline */}
      {loading && registros.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw size={20} className="animate-spin text-amber-500 mr-2"/>
          <span className="text-slate-500 text-sm">Carregando histórico...</span>
        </div>
      ) : filtrados.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <History size={32} className="mx-auto text-slate-200 mb-3"/>
          <p className="text-slate-400 text-sm">Nenhum registro de auditoria encontrado.</p>
          <p className="text-slate-300 text-xs mt-1">As alterações serão registradas automaticamente a partir de agora.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {porDia.map(([dia, regs]) => (
            <div key={dia}>
              <div className="flex items-center gap-3 mb-3">
                <div className="h-px bg-slate-200 flex-1"/>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide shrink-0">{dia}</span>
                <div className="h-px bg-slate-200 flex-1"/>
              </div>

              <div className="space-y-2">
                {regs.map(r => {
                  const acaoCfg = ACAO_ICON[r.acao] || ACAO_ICON.UPDATE
                  const isOpen = expandido === r.id
                  const obraNome = todasObras.find(o => o.id === r.obra_id)?.nome_obra

                  return (
                    <div key={r.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-slate-300 transition-all">
                      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => setExpandido(isOpen ? null : r.id)}>
                        {/* Ação badge */}
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${acaoCfg.color}`}>
                          {acaoCfg.icon}
                        </div>

                        {/* Conteúdo */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-800 leading-tight">
                            {r.resumo || `${acaoCfg.label} em ${TABELA_LABEL[r.tabela] || r.tabela}`}
                          </p>
                          <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400">
                            <span className="flex items-center gap-1"><User size={10}/> {r.user_nome || r.user_email || 'Sistema'}</span>
                            <span className="flex items-center gap-1"><Clock size={10}/> {timeAgo(r.created_at)}</span>
                            {obraNome && <span className="truncate max-w-40">{obraNome}</span>}
                          </div>
                        </div>

                        {/* Tags */}
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${acaoCfg.color}`}>
                            {acaoCfg.label}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                            {TABELA_LABEL[r.tabela] || r.tabela}
                          </span>
                          {isOpen ? <ChevronDown size={14} className="text-slate-400"/> : <ChevronRight size={14} className="text-slate-400"/>}
                        </div>
                      </div>

                      {/* Detalhes expandidos */}
                      {isOpen && (
                        <div className="px-4 pb-4 border-t border-slate-100 bg-slate-50/50">
                          <div className="grid grid-cols-2 gap-4 mt-3">
                            {r.dados_antes && (
                              <div>
                                <p className="text-[10px] font-bold text-red-500 uppercase mb-1.5">Antes</p>
                                <pre className="text-[10px] bg-red-50 border border-red-100 rounded-lg p-3 overflow-auto max-h-48 text-red-800 font-mono whitespace-pre-wrap">
                                  {JSON.stringify(r.dados_antes, null, 2)}
                                </pre>
                              </div>
                            )}
                            {r.dados_depois && (
                              <div>
                                <p className="text-[10px] font-bold text-emerald-500 uppercase mb-1.5">Depois</p>
                                <pre className="text-[10px] bg-emerald-50 border border-emerald-100 rounded-lg p-3 overflow-auto max-h-48 text-emerald-800 font-mono whitespace-pre-wrap">
                                  {JSON.stringify(r.dados_depois, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                          {r.campos_alterados && r.campos_alterados.length > 0 && (
                            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] text-slate-500">Campos:</span>
                              {r.campos_alterados.map(c => (
                                <span key={c} className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-mono">{c}</span>
                              ))}
                            </div>
                          )}
                          <p className="text-[9px] text-slate-300 mt-2 font-mono">
                            ID: {r.registro_id} • {new Date(r.created_at).toLocaleString('pt-BR')}
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {filtrados.length >= limite && (
            <button onClick={() => setLimite(p => p + 100)}
              className="w-full py-3 text-sm text-amber-600 font-medium hover:bg-amber-50 rounded-xl border border-dashed border-amber-200 transition-colors">
              Carregar mais registros...
            </button>
          )}
        </div>
      )}
    </div>
  )
}