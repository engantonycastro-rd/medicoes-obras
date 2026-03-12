import { useEffect, useState, useMemo } from 'react'
import {
  History, Building2, HardHat, FileText, ClipboardList, FileSpreadsheet,
  RefreshCw, Filter, ChevronDown, ChevronUp, Plus, Trash2, Edit3,
  CheckCircle2, Eye, Clock, ArrowRightLeft, Search,
} from 'lucide-react'
import { usePerfilStore } from '../lib/perfilStore'
import { formatDate } from '../utils/calculations'
import { supabase } from '../lib/supabase'

interface AuditEntry {
  id: string; created_at: string; user_email: string | null; user_nome: string | null
  tabela: string; registro_id: string; acao: string
  obra_id: string | null; contrato_id: string | null; medicao_id: string | null
  dados_antes: any; dados_depois: any; campos_alterados: string[] | null; resumo: string | null
}

const TABELA_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  contratos:          { label: 'Contrato',       icon: Building2,       color: 'bg-blue-100 text-blue-700' },
  obras:              { label: 'Obra',            icon: HardHat,         color: 'bg-amber-100 text-amber-700' },
  medicoes:           { label: 'Medição',         icon: FileText,        color: 'bg-emerald-100 text-emerald-700' },
  linhas_memoria:     { label: 'Linha Memória',   icon: ClipboardList,   color: 'bg-slate-100 text-slate-600' },
  orcamentos_revisao: { label: 'Orçamento',       icon: FileSpreadsheet, color: 'bg-purple-100 text-purple-700' },
  servicos:           { label: 'Serviço',         icon: ClipboardList,   color: 'bg-cyan-100 text-cyan-700' },
}

const ACAO_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  INSERT: { label: 'Criado',    icon: Plus,   color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  UPDATE: { label: 'Alterado',  icon: Edit3,  color: 'bg-amber-100 text-amber-700 border-amber-200' },
  DELETE: { label: 'Excluído',  icon: Trash2, color: 'bg-red-100 text-red-700 border-red-200' },
}

export function AuditoriaPage() {
  const { perfilAtual } = usePerfilStore()
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [expandido, setExpandido] = useState<string | null>(null)

  // Filtros
  const [filtroTabela, setFiltroTabela] = useState('todas')
  const [filtroAcao, setFiltroAcao] = useState('todas')
  const [filtroBusca, setFiltroBusca] = useState('')
  const [filtroDataInicio, setFiltroDataInicio] = useState('')
  const [filtroDataFim, setFiltroDataFim] = useState('')

  const PAGE_SIZE = 50

  useEffect(() => { fetchEntries(0) }, [filtroTabela, filtroAcao, filtroDataInicio, filtroDataFim])

  async function fetchEntries(p: number) {
    setLoading(true)
    let query = supabase.from('auditoria').select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(p * PAGE_SIZE, (p + 1) * PAGE_SIZE - 1)

    if (filtroTabela !== 'todas') query = query.eq('tabela', filtroTabela)
    if (filtroAcao !== 'todas') query = query.eq('acao', filtroAcao)
    if (filtroDataInicio) query = query.gte('created_at', filtroDataInicio + 'T00:00:00')
    if (filtroDataFim) query = query.lte('created_at', filtroDataFim + 'T23:59:59')

    const { data, count } = await query
    if (data) {
      if (p === 0) setEntries(data as AuditEntry[])
      else setEntries(prev => [...prev, ...(data as AuditEntry[])])
    }
    if (count !== null) setTotal(count)
    setPage(p)
    setLoading(false)
  }

  // Filtra busca local
  const filtrados = useMemo(() => {
    if (!filtroBusca) return entries
    const q = filtroBusca.toLowerCase()
    return entries.filter(e =>
      (e.resumo || '').toLowerCase().includes(q) ||
      (e.user_nome || '').toLowerCase().includes(q) ||
      (e.user_email || '').toLowerCase().includes(q) ||
      (e.tabela || '').toLowerCase().includes(q)
    )
  }, [entries, filtroBusca])

  // Stats
  const stats = useMemo(() => {
    const tabelas = new Map<string, number>()
    entries.forEach(e => tabelas.set(e.tabela, (tabelas.get(e.tabela) || 0) + 1))
    return {
      total: entries.length,
      inserts: entries.filter(e => e.acao === 'INSERT').length,
      updates: entries.filter(e => e.acao === 'UPDATE').length,
      deletes: entries.filter(e => e.acao === 'DELETE').length,
      tabelas,
    }
  }, [entries])

  // Agrupa por dia
  const gruposPorDia = useMemo(() => {
    const map = new Map<string, AuditEntry[]>()
    for (const e of filtrados) {
      const dia = e.created_at.split('T')[0]
      if (!map.has(dia)) map.set(dia, [])
      map.get(dia)!.push(e)
    }
    return [...map.entries()]
  }, [filtrados])

  function formatHora(dt: string) {
    try { return new Date(dt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) } catch { return '' }
  }

  function renderDetalhe(e: AuditEntry) {
    if (e.acao === 'INSERT' && e.dados_depois) {
      const d = e.dados_depois
      if (e.tabela === 'contratos') return <KV items={[['Nome', d.nome_obra], ['Tipo', d.tipo], ['Estado', `${d.cidade || ''} ${d.estado || ''}`], ['Órgão', d.orgao_nome], ['Nº', d.numero_contrato]]}/>
      if (e.tabela === 'obras') return <KV items={[['Nome', d.nome_obra], ['Local', d.local_obra], ['CC', d.centro_custo], ['Status', d.status]]}/>
      if (e.tabela === 'orcamentos_revisao') return <KV items={[['Título', d.titulo], ['Urgência', d.urgencia], ['Prazo', d.prazo_retorno], ['Arquivo', d.arquivo_original_nome]]}/>
    }
    if (e.acao === 'UPDATE' && e.dados_antes && e.dados_depois) {
      if (e.tabela === 'orcamentos_revisao') {
        const b = e.dados_antes, a = e.dados_depois
        const diffs: [string, any, any][] = []
        if (b.status !== a.status) diffs.push(['Status', b.status, a.status])
        if (b.valor_original !== a.valor_original && a.valor_original) diffs.push(['Valor Original', b.valor_original, a.valor_original])
        if (b.valor_revisado !== a.valor_revisado && a.valor_revisado) diffs.push(['Valor Revisado', b.valor_revisado, a.valor_revisado])
        if (b.diferenca_valor !== a.diferenca_valor && a.diferenca_valor) diffs.push(['Diferença', b.diferenca_valor, a.diferenca_valor])
        if (a.qtd_alteracoes && a.qtd_alteracoes !== b.qtd_alteracoes) diffs.push(['Qtd Alterações', b.qtd_alteracoes, a.qtd_alteracoes])
        if (a.revisor_id && !b.revisor_id) diffs.push(['Revisor', '—', 'Atribuído'])
        if (a.observacoes_revisor && !b.observacoes_revisor) diffs.push(['Observações', '—', a.observacoes_revisor])
        if (diffs.length > 0) return <DiffTable diffs={diffs}/>
      }
      // Genérico: mostra campos alterados
      const b = e.dados_antes, a = e.dados_depois
      const campos = e.campos_alterados || Object.keys(a).filter(k => JSON.stringify(b[k]) !== JSON.stringify(a[k]) && !['updated_at', 'created_at'].includes(k))
      if (campos.length > 0) {
        return <DiffTable diffs={campos.slice(0, 10).map(k => [k, b[k], a[k]])}/>
      }
    }
    if (e.acao === 'DELETE' && e.dados_antes) {
      const d = e.dados_antes
      const nome = d.nome_obra || d.titulo || d.numero_extenso || d.descricao_calculo || ''
      if (nome) return <p className="text-xs text-red-500 italic">Registro excluído: {String(nome).substring(0, 80)}</p>
    }
    return null
  }

  if (!perfilAtual || perfilAtual.role !== 'ADMIN') {
    return <div className="p-8"><p className="text-red-500">Acesso restrito a administradores.</p></div>
  }

  return (
    <div className="p-6 max-w-5xl overflow-y-auto" style={{ height: '100%' }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><History size={24} className="text-amber-500"/> Histórico & Auditoria</h1>
          <p className="text-sm text-slate-500">Registro de todas as ações no sistema</p>
        </div>
        <button onClick={() => fetchEntries(0)} className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm hover:bg-slate-50">
          <RefreshCw size={14}/> Atualizar
        </button>
      </div>

      {/* Stats mini */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <span className="text-xs text-slate-500">{total} registros</span>
        <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">{stats.inserts} criações</span>
        <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">{stats.updates} alterações</span>
        <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full">{stats.deletes} exclusões</span>
        {[...stats.tabelas.entries()].map(([tab, n]) => {
          const cfg = TABELA_CONFIG[tab]
          return cfg ? <span key={tab} className={`text-[10px] px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}: {n}</span> : null
        })}
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 mb-5 flex-wrap bg-white border border-slate-200 rounded-xl p-3">
        <Filter size={14} className="text-slate-400"/>
        <select value={filtroTabela} onChange={e => setFiltroTabela(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white">
          <option value="todas">Todas as áreas</option>
          {Object.entries(TABELA_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filtroAcao} onChange={e => setFiltroAcao(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white">
          <option value="todas">Todas as ações</option>
          {Object.entries(ACAO_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <input type="date" value={filtroDataInicio} onChange={e => setFiltroDataInicio(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white" placeholder="De"/>
        <input type="date" value={filtroDataFim} onChange={e => setFiltroDataFim(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white" placeholder="Até"/>
        <div className="relative flex-1 min-w-40">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input value={filtroBusca} onChange={e => setFiltroBusca(e.target.value)} placeholder="Buscar no resumo..."
            className="w-full pl-7 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white"/>
        </div>
      </div>

      {/* Timeline */}
      {gruposPorDia.length === 0 && !loading ? (
        <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-xl">
          <History size={36} className="mx-auto text-slate-300 mb-3"/>
          <p className="text-slate-400">Nenhum registro de auditoria encontrado</p>
        </div>
      ) : (
        <div className="space-y-6">
          {gruposPorDia.map(([dia, items]) => (
            <div key={dia}>
              {/* Dia */}
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center">
                  <span className="text-[10px] font-bold text-white">{new Date(dia + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit' })}</span>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-700">{new Date(dia + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
                  <p className="text-[10px] text-slate-400">{items.length} ação(ões)</p>
                </div>
              </div>

              {/* Entries do dia */}
              <div className="ml-4 border-l-2 border-slate-200 pl-5 space-y-2">
                {items.map(e => {
                  const tCfg = TABELA_CONFIG[e.tabela] || { label: e.tabela, icon: History, color: 'bg-slate-100 text-slate-600' }
                  const aCfg = ACAO_CONFIG[e.acao] || ACAO_CONFIG.UPDATE
                  const Icon = tCfg.icon
                  const AIcon = aCfg.icon
                  const isOpen = expandido === e.id

                  return (
                    <div key={e.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:shadow-sm transition-shadow">
                      <div className="p-3.5 flex items-start gap-3 cursor-pointer" onClick={() => setExpandido(isOpen ? null : e.id)}>
                        {/* Ícone da tabela */}
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${tCfg.color}`}>
                          <Icon size={14}/>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${aCfg.color}`}>{aCfg.label}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${tCfg.color}`}>{tCfg.label}</span>
                            <span className="text-[10px] text-slate-400">{formatHora(e.created_at)}</span>
                          </div>
                          <p className="text-xs text-slate-700 mt-1 leading-relaxed">{e.resumo || `${aCfg.label} em ${tCfg.label}`}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">por {e.user_nome || e.user_email || 'Sistema'}</p>
                        </div>
                        <div className="shrink-0">
                          {isOpen ? <ChevronUp size={14} className="text-slate-400"/> : <ChevronDown size={14} className="text-slate-400"/>}
                        </div>
                      </div>
                      {/* Detalhe expandido */}
                      {isOpen && (
                        <div className="border-t border-slate-100 bg-slate-50 p-4">
                          {renderDetalhe(e) || (
                            <p className="text-xs text-slate-400 italic">Sem detalhes adicionais</p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Load more */}
      {entries.length < total && (
        <div className="mt-6 text-center">
          <button onClick={() => fetchEntries(page + 1)} disabled={loading}
            className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
            {loading ? 'Carregando...' : `Carregar mais (${entries.length} de ${total})`}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Subcomponentes ────────────────────────────────────────────────────────

function KV({ items }: { items: [string, any][] }) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-1">
      {items.filter(([, v]) => v).map(([k, v]) => (
        <div key={k} className="flex items-baseline gap-2">
          <span className="text-[10px] text-slate-400 font-semibold uppercase shrink-0 w-24">{k}</span>
          <span className="text-xs text-slate-700">{String(v)}</span>
        </div>
      ))}
    </div>
  )
}

function DiffTable({ diffs }: { diffs: [string, any, any][] }) {
  return (
    <table className="w-full text-xs">
      <thead><tr className="text-[10px] text-slate-400 uppercase">
        <th className="text-left py-1 pr-4 font-semibold">Campo</th>
        <th className="text-left py-1 pr-4 font-semibold">Antes</th>
        <th className="text-left py-1 font-semibold">Depois</th>
      </tr></thead>
      <tbody>
        {diffs.map(([campo, antes, depois], i) => (
          <tr key={i} className="border-t border-slate-100">
            <td className="py-1.5 pr-4 text-slate-500 font-medium">{campo}</td>
            <td className="py-1.5 pr-4 text-red-500 line-through max-w-48 truncate">{antes !== null && antes !== undefined ? String(antes) : '—'}</td>
            <td className="py-1.5 text-emerald-600 font-medium max-w-48 truncate">{depois !== null && depois !== undefined ? String(depois) : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}