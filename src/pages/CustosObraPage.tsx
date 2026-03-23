import { useEffect, useState, useMemo } from 'react'
import {
  DollarSign, ArrowUpRight, ArrowDownRight, CheckCircle2, Clock, AlertTriangle,
  RefreshCw, Filter, Building2,
} from 'lucide-react'
import { useStore } from '../lib/store'
import { usePerfilStore } from '../lib/perfilStore'
import { Obra } from '../types'
import { formatCurrency, formatDate } from '../utils/calculations'
import { supabase } from '../lib/supabase'

interface CustoRow {
  id: string; obra_id: string; tipo_lancamento: string
  fornecedor: string|null; descricao: string|null; numero_documento: string|null
  valor_total: number; valor_liquido: number; data_emissao: string|null
  data_vencimento: string|null; status_pagamento: string; categoria: string|null
  centro_custo: string|null
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  PAGO:      { label: 'Pago',      color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  PENDENTE:  { label: 'Pendente',  color: 'bg-primary-100 text-primary-700 border-primary-200' },
  VENCIDO:   { label: 'Vencido',   color: 'bg-red-100 text-red-700 border-red-200' },
  VENCENDO:  { label: 'Vencendo',  color: 'bg-orange-100 text-orange-700 border-orange-200' },
  CANCELADO: { label: 'Cancelado', color: 'bg-slate-100 text-slate-500 border-slate-200' },
  PARCIAL:   { label: 'Parcial',   color: 'bg-blue-100 text-blue-700 border-blue-200' },
}

export function CustosObraPage() {
  const { contratos, fetchContratos, fetchObras } = useStore()
  const { perfilAtual } = usePerfilStore()

  const [custos, setCustos] = useState<CustoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [minhasObras, setMinhasObras] = useState<(Obra & { contrato_nome: string })[]>([])
  const [obraFiltro, setObraFiltro] = useState('todas')
  const [tipoFiltro, setTipoFiltro] = useState('todos')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [ccMaeFiltro, setCcMaeFiltro] = useState('todos')
  const [ccFilhoFiltro, setCcFilhoFiltro] = useState('todos')

  useEffect(() => {
    fetchContratos().then(async () => {
      const store = useStore.getState()
      const all: (Obra & { contrato_nome: string })[] = []
      for (const c of store.contratos) {
        const obs = await fetchObras(c.id)
        for (const o of obs) all.push({ ...o, contrato_nome: c.nome_obra })
      }
      setMinhasObras(all)
      if (all.length > 0) {
        const ids = all.map(o => o.id)
        const custos = await fetchCustosPaginado(ids)
        setCustos(custos)
      }
      setLoading(false)
    })
  }, [])

  async function fetchCustosPaginado(ids: string[]): Promise<CustoRow[]> {
    const all: CustoRow[] = []
    let from = 0
    const pageSize = 1000
    while (true) {
      const { data } = await supabase.from('custos_erp').select('*')
        .in('obra_id', ids)
        .order('data_emissao', { ascending: false })
        .range(from, from + pageSize - 1)
      if (data && data.length > 0) {
        all.push(...(data as CustoRow[]))
        from += data.length
        if (data.length < pageSize) break
      } else break
    }
    return all
  }

  async function refresh() {
    setLoading(true)
    if (minhasObras.length > 0) {
      const ids = minhasObras.map(o => o.id)
      const custos = await fetchCustosPaginado(ids)
      setCustos(custos)
    }
    setLoading(false)
  }

  // CC Mãe: centros de custo dos contratos
  const ccMaeOptions = useMemo(() => {
    return contratos.filter(c => (c as any).centro_custo).map(c => ({ cc: (c as any).centro_custo as string, nome: c.nome_obra }))
  }, [contratos])

  // CC Filhos: obras cujo centro_custo começa com o ccMãe
  const ccFilhoOptions = useMemo(() => {
    if (ccMaeFiltro === 'todos') return []
    return minhasObras.filter(o => o.centro_custo && o.centro_custo.startsWith(ccMaeFiltro))
  }, [ccMaeFiltro, minhasObras])

  const filtrados = useMemo(() => {
    let list = custos.filter(c => c.status_pagamento !== 'CANCELADO')
    if (ccMaeFiltro !== 'todos') {
      const obraIdsCC = minhasObras.filter(o => o.centro_custo && o.centro_custo.startsWith(ccMaeFiltro)).map(o => o.id)
      list = list.filter(c => obraIdsCC.includes(c.obra_id))
    }
    if (ccFilhoFiltro !== 'todos') list = list.filter(c => c.obra_id === ccFilhoFiltro)
    if (obraFiltro !== 'todas') list = list.filter(c => c.obra_id === obraFiltro)
    if (tipoFiltro !== 'todos') list = list.filter(c => c.tipo_lancamento === tipoFiltro)
    if (dataInicio) list = list.filter(c => c.data_emissao && c.data_emissao >= dataInicio)
    if (dataFim) list = list.filter(c => c.data_emissao && c.data_emissao <= dataFim)
    return list
  }, [custos, obraFiltro, tipoFiltro, dataInicio, dataFim, ccMaeFiltro, ccFilhoFiltro, minhasObras])

  const stats = useMemo(() => {
    const aPagar = filtrados.filter(c => c.tipo_lancamento === 'A_PAGAR')
    const aReceber = filtrados.filter(c => c.tipo_lancamento === 'A_RECEBER')
    return {
      totalPagar: aPagar.reduce((s, c) => s + c.valor_liquido, 0),
      totalReceber: aReceber.reduce((s, c) => s + c.valor_liquido, 0),
      pago: aPagar.filter(c => c.status_pagamento === 'PAGO').reduce((s, c) => s + c.valor_liquido, 0),
      recebido: aReceber.filter(c => c.status_pagamento === 'PAGO').reduce((s, c) => s + c.valor_liquido, 0),
    }
  }, [filtrados])

  // Resumo por obra — usa filtrados (reage a filtro de data e exclui cancelados)
  const porObra = useMemo(() => {
    const map = new Map<string, { nome: string; pagar: number; receber: number; qtd: number }>()
    for (const c of filtrados) {
      const o = minhasObras.find(x => x.id === c.obra_id)
      if (!o) continue
      const entry = map.get(c.obra_id) || { nome: o.nome_obra, pagar: 0, receber: 0, qtd: 0 }
      if (c.tipo_lancamento === 'A_PAGAR') entry.pagar += c.valor_liquido
      else entry.receber += c.valor_liquido
      entry.qtd++
      map.set(c.obra_id, entry)
    }
    return [...map.entries()].sort((a, b) => b[1].pagar - a[1].pagar)
  }, [filtrados, minhasObras])

  return (
    <div className="p-6 max-w-7xl overflow-y-auto" style={{ height: '100%' }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Custos das Obras</h1>
          <p className="text-sm text-slate-500 mt-0.5">Visualização de custos e recebimentos das suas obras</p>
        </div>
        <button onClick={refresh} disabled={loading} className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/> Atualizar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Custos', value: formatCurrency(stats.totalPagar), icon: ArrowDownRight, color: 'from-red-500 to-red-600' },
          { label: 'Total Recebimentos', value: formatCurrency(stats.totalReceber), icon: ArrowUpRight, color: 'from-emerald-500 to-emerald-600' },
          { label: 'Já Pago', value: formatCurrency(stats.pago), icon: CheckCircle2, color: 'from-blue-500 to-blue-600' },
          { label: 'Já Recebido', value: formatCurrency(stats.recebido), icon: DollarSign, color: 'from-purple-500 to-purple-600' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center shadow-sm mb-2`}><Icon size={18} className="text-white"/></div>
            <p className="text-lg font-bold text-slate-800">{value}</p>
            <p className="text-[11px] text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      {/* Resumo por obra */}
      {porObra.length > 1 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
          <p className="font-bold text-sm text-slate-700 mb-3 flex items-center gap-2"><Building2 size={14}/> Resumo por Obra</p>
          <div className="space-y-2">
            {porObra.map(([obraId, data]) => (
              <div key={obraId} className="flex items-center gap-4 text-xs">
                <span className="font-medium text-slate-700 w-48 truncate">{data.nome}</span>
                <span className="flex items-center gap-1 text-red-600 w-32"><ArrowDownRight size={11}/> {formatCurrency(data.pagar)}</span>
                <span className="flex items-center gap-1 text-emerald-600 w-32"><ArrowUpRight size={11}/> {formatCurrency(data.receber)}</span>
                <span className="text-slate-400">{data.qtd} docs</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Filter size={14} className="text-slate-400"/>
        {ccMaeOptions.length > 0 && (
          <>
            <select value={ccMaeFiltro} onChange={e => { setCcMaeFiltro(e.target.value); setCcFilhoFiltro('todos'); if (e.target.value !== 'todos') setObraFiltro('todas') }}
              className="border border-blue-200 rounded-lg px-3 py-1.5 text-xs bg-blue-50 text-blue-700 font-medium">
              <option value="todos">CC Mãe (todos)</option>
              {ccMaeOptions.map(c => <option key={c.cc} value={c.cc}>{c.cc} — {c.nome}</option>)}
            </select>
            {ccMaeFiltro !== 'todos' && ccFilhoOptions.length > 0 && (
              <select value={ccFilhoFiltro} onChange={e => setCcFilhoFiltro(e.target.value)}
                className="border border-purple-200 rounded-lg px-3 py-1.5 text-xs bg-purple-50 text-purple-700 font-medium">
                <option value="todos">CC Filho (todos de {ccMaeFiltro})</option>
                {ccFilhoOptions.map(o => <option key={o.id} value={o.id}>{o.centro_custo} — {o.nome_obra}</option>)}
              </select>
            )}
          </>
        )}
        <select value={obraFiltro} onChange={e => { setObraFiltro(e.target.value); if (e.target.value !== 'todas') { setCcMaeFiltro('todos'); setCcFilhoFiltro('todos') } }}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs bg-white">
          <option value="todas">Todas as obras</option>
          {minhasObras.map(o => <option key={o.id} value={o.id}>{o.nome_obra}{o.centro_custo ? ` (${o.centro_custo})` : ''}</option>)}
        </select>
        <select value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs bg-white">
          <option value="todos">Pagar + Receber</option>
          <option value="A_PAGAR">Apenas Custos (Pagar)</option>
          <option value="A_RECEBER">Apenas Recebimentos</option>
        </select>
        <span className="text-[10px] text-slate-400">De:</span>
        <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
          className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white"/>
        <span className="text-[10px] text-slate-400">Até:</span>
        <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
          className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white"/>
        {(dataInicio || dataFim) && (
          <button onClick={() => { setDataInicio(''); setDataFim('') }}
            className="text-[10px] text-primary-600 hover:underline">Limpar datas</button>
        )}
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="bg-slate-50 text-slate-500">
              {['Tipo','Fornecedor','Descrição','Data','Valor','Status'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left font-semibold">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr><td colSpan={6} className="py-12 text-center text-slate-400">Nenhum custo registrado para as suas obras.</td></tr>
              ) : filtrados.slice(0, 200).map(c => {
                const st = STATUS_LABEL[c.status_pagamento] || STATUS_LABEL.PENDENTE
                const isReceber = c.tipo_lancamento === 'A_RECEBER'
                return (
                  <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-4 py-2.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${isReceber ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {isReceber ? '↑ Receber' : '↓ Pagar'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-700 max-w-40 truncate font-medium">{c.fornecedor || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-500 max-w-48 truncate">{c.descricao || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-500">{c.data_emissao ? formatDate(c.data_emissao) : '—'}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-slate-800">{formatCurrency(c.valor_liquido)}</td>
                    <td className="px-4 py-2.5"><span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${st.color}`}>{st.label}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
