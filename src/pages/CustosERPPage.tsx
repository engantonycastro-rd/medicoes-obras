import { useEffect, useState, useMemo, useRef } from 'react'
import {
  Upload, DollarSign, AlertTriangle, CheckCircle2, Clock, Trash2, RefreshCw, Filter,
  Building2, Receipt, ArrowUpRight, ArrowDownRight, FileSpreadsheet, XCircle, Loader2,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '../lib/store'
import { usePerfilStore } from '../lib/perfilStore'
import { Obra } from '../types'
import { formatCurrency, formatDate } from '../utils/calculations'
import { importarCustosERP, CustoERP } from '../utils/importCustosERP'
import { supabase } from '../lib/supabase'

interface CustoRow {
  id: string; obra_id: string; contrato_id: string; tipo_lancamento: string
  tipo_documento: string; numero_documento: string|null; fornecedor: string|null
  cnpj_fornecedor: string|null; valor_total: number; valor_liquido: number
  data_emissao: string|null; data_vencimento: string|null; data_pagamento: string|null
  centro_custo: string|null; categoria: string|null; descricao: string|null
  status_pagamento: string; id_erp: string|null; ref_lancamento: string|null; origem: string
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  PAGO:      { label: 'Pago',        color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  PENDENTE:  { label: 'Pendente',    color: 'bg-primary-100 text-primary-700 border-primary-200' },
  VENCIDO:   { label: 'Vencido',     color: 'bg-red-100 text-red-700 border-red-200' },
  VENCENDO:  { label: 'Vencendo',    color: 'bg-orange-100 text-orange-700 border-orange-200' },
  CANCELADO: { label: 'Cancelado',   color: 'bg-slate-100 text-slate-500 border-slate-200' },
  PARCIAL:   { label: 'Parcial',     color: 'bg-blue-100 text-blue-700 border-blue-200' },
}

export function CustosERPPage() {
  const { contratos, fetchContratos, fetchObras } = useStore()
  const { perfilAtual } = usePerfilStore()
  const isAdmin = perfilAtual?.role === 'ADMIN'
  const fileRef = useRef<HTMLInputElement>(null)

  const [custos, setCustos] = useState<CustoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [todasObras, setTodasObras] = useState<(Obra & { contrato_nome: string })[]>([])
  const [preview, setPreview] = useState<CustoERP[]>([])
  const [importing, setImporting] = useState(false)
  const [importTipo, setImportTipo] = useState<'A_PAGAR'|'A_RECEBER'>('A_PAGAR')

  // Filtros
  const [obraFiltro, setObraFiltro] = useState('todas')
  const [tipoFiltro, setTipoFiltro] = useState('todos')
  const [statusFiltro, setStatusFiltro] = useState('todos')
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
      setTodasObras(all)
    })
    fetchCustos()
  }, [])

  async function fetchCustos() {
    setLoading(true)
    const all: CustoRow[] = []
    let from = 0
    const pageSize = 1000
    while (true) {
      const { data } = await supabase.from('custos_erp').select('*')
        .order('data_emissao', { ascending: false })
        .range(from, from + pageSize - 1)
      if (data && data.length > 0) {
        all.push(...(data as CustoRow[]))
        from += data.length
        if (data.length < pageSize) break
      } else break
    }
    setCustos(all)
    setLoading(false)
  }

  // ── IMPORT ────────────────────────────────────────────────────────────────

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setImporting(true)
    try {
      const items = await importarCustosERP(file)
      setPreview(items)
      // Detecta tipo pela maioria dos registros
      const aPagar = items.filter(i => i.tipo_lancamento === 'A_PAGAR').length
      const aReceber = items.filter(i => i.tipo_lancamento === 'A_RECEBER').length
      setImportTipo(aReceber > aPagar ? 'A_RECEBER' : 'A_PAGAR')
      toast.success(`${items.length} registros carregados (${aPagar} a pagar, ${aReceber} a receber)`)
    } catch (err: any) { toast.error(err.message) }
    setImporting(false); e.target.value = ''
  }

  async function confirmarImport() {
    if (preview.length === 0) return
    setImporting(true)

    try {
      const user = (await supabase.auth.getUser()).data.user

      // 1. Busca refs já existentes para deduplicação
      const refsExistentes = new Set<string>()
      const previewRefs = preview.filter(c => c.ref_lancamento).map(c => c.ref_lancamento!)
      if (previewRefs.length > 0) {
        // Busca em chunks de 100
        for (let i = 0; i < previewRefs.length; i += 100) {
          const chunk = previewRefs.slice(i, i + 100)
          const { data } = await supabase.from('custos_erp').select('ref_lancamento').in('ref_lancamento', chunk)
          if (data) data.forEach((r: any) => { if (r.ref_lancamento) refsExistentes.add(r.ref_lancamento) })
        }
      }

      // 2. Filtra duplicatas
      const novos = preview.filter(c => !c.ref_lancamento || !refsExistentes.has(c.ref_lancamento))
      const duplicados = preview.length - novos.length

      if (novos.length === 0) {
        toast.success(`Todos os ${preview.length} registros já estão importados!`)
        setPreview([]); setImporting(false); return
      }

      // 3. Mapeia centro de custo → obra
      const ccMap = new Map<string, { obraId: string; contratoId: string }>()
      for (const o of todasObras) {
        if (o.centro_custo) ccMap.set(o.centro_custo, { obraId: o.id, contratoId: o.contrato_id })
      }

      // 4. Distribui por CC
      let inseridos = 0, semObra = 0
      const rows: any[] = []
      for (const c of novos) {
        const match = c.centro_custo ? ccMap.get(c.centro_custo) : null
        if (!match) { semObra++; continue }

        rows.push({
          obra_id: match.obraId,
          contrato_id: match.contratoId,
          importado_por: user?.id,
          tipo_lancamento: c.tipo_lancamento,
          tipo_documento: c.tipo_documento,
          numero_documento: c.numero_documento,
          serie: c.serie,
          fornecedor: c.fornecedor,
          cnpj_fornecedor: c.cnpj_fornecedor,
          valor_total: c.valor_total,
          valor_desconto: c.valor_desconto,
          valor_liquido: c.valor_liquido,
          data_emissao: c.data_emissao,
          data_vencimento: c.data_vencimento,
          data_pagamento: c.data_pagamento,
          centro_custo: c.centro_custo,
          conta_contabil: c.conta_contabil,
          categoria: c.categoria,
          descricao: c.descricao,
          status_pagamento: c.status_pagamento,
          id_erp: c.id_erp,
          ref_lancamento: c.ref_lancamento,
          origem: 'IMPORT_EXCEL',
        })
      }

      // Insert em chunks
      for (let i = 0; i < rows.length; i += 50) {
        const { error } = await supabase.from('custos_erp').insert(rows.slice(i, i + 50))
        if (error) throw error
        inseridos += Math.min(50, rows.length - i)
      }

      const msgs = [`${inseridos} registros importados!`]
      if (duplicados > 0) msgs.push(`${duplicados} já existiam (ignorados)`)
      if (semObra > 0) msgs.push(`${semObra} sem obra vinculada (CC não encontrado)`)
      toast.success(msgs.join(' • '), { duration: 5000 })

      // Mostra CCs não encontrados
      if (semObra > 0) {
        const ccsNaoEncontrados = new Set(novos.filter(c => c.centro_custo && !ccMap.has(c.centro_custo)).map(c => c.centro_custo!))
        if (ccsNaoEncontrados.size > 0) {
          toast(`CCs sem obra: ${[...ccsNaoEncontrados].join(', ')}`, { icon: '⚠️', duration: 8000 })
        }
      }

      setPreview([])
      fetchCustos()
    } catch (err: any) { toast.error(err.message) }
    setImporting(false)
  }

  // ── APAGAR CUSTOS DA OBRA ──────────────────────────────────────────────

  async function apagarCustosDaObra(obraId: string, obraNome: string) {
    const qtd = custos.filter(c => c.obra_id === obraId).length
    if (!confirm(`ATENÇÃO: Apagar TODOS os ${qtd} custos da obra "${obraNome}"?\n\nEsta ação não pode ser desfeita.`)) return
    const { error } = await supabase.from('custos_erp').delete().eq('obra_id', obraId)
    if (error) { toast.error(error.message); return }
    setCustos(prev => prev.filter(c => c.obra_id !== obraId))
    toast.success(`${qtd} custos da obra "${obraNome}" apagados!`)
  }

  async function apagarTodosCustos() {
    if (!confirm(`ATENÇÃO: Apagar TODOS os ${custos.length} registros de custos de TODAS as obras?\n\nEsta ação não pode ser desfeita!`)) return
    if (!confirm(`Tem certeza? Serão excluídos ${custos.length} lançamentos permanentemente.`)) return
    const ids = custos.map(c => c.id)
    for (let i = 0; i < ids.length; i += 100) {
      const { error } = await supabase.from('custos_erp').delete().in('id', ids.slice(i, i + 100))
      if (error) { toast.error(error.message); return }
    }
    setCustos([])
    toast.success(`Todos os ${ids.length} registros apagados!`)
  }

  // ── STATS ─────────────────────────────────────────────────────────────────

  // CC Mãe: centros de custo dos contratos
  const ccMaeOptions = useMemo(() => {
    const ccs = contratos.filter(c => (c as any).centro_custo).map(c => ({ cc: (c as any).centro_custo as string, nome: c.nome_obra }))
    return ccs
  }, [contratos])

  // CC Filhos: obras cujo centro_custo começa com o ccMãe selecionado
  const ccFilhoOptions = useMemo(() => {
    if (ccMaeFiltro === 'todos') return []
    return todasObras.filter(o => o.centro_custo && o.centro_custo.startsWith(ccMaeFiltro))
  }, [ccMaeFiltro, todasObras])

  const custosFiltrados = useMemo(() => {
    let list = custos
    // Filtro por CC Mãe → filtra por obras cujo CC começa com o prefixo
    if (ccMaeFiltro !== 'todos') {
      const obraIdsCC = todasObras.filter(o => o.centro_custo && o.centro_custo.startsWith(ccMaeFiltro)).map(o => o.id)
      list = list.filter(c => obraIdsCC.includes(c.obra_id))
    }
    // Filtro por CC Filho (obra específica)
    if (ccFilhoFiltro !== 'todos') list = list.filter(c => c.obra_id === ccFilhoFiltro)
    // Filtro obra individual (legado)
    if (obraFiltro !== 'todas') list = list.filter(c => c.obra_id === obraFiltro)
    if (tipoFiltro !== 'todos') list = list.filter(c => c.tipo_lancamento === tipoFiltro)
    if (statusFiltro !== 'todos') list = list.filter(c => c.status_pagamento === statusFiltro)
    if (dataInicio) list = list.filter(c => c.data_emissao && c.data_emissao >= dataInicio)
    if (dataFim) list = list.filter(c => c.data_emissao && c.data_emissao <= dataFim)
    return list
  }, [custos, obraFiltro, tipoFiltro, statusFiltro, dataInicio, dataFim, ccMaeFiltro, ccFilhoFiltro, todasObras])

  const stats = useMemo(() => {
    const ativos = custosFiltrados.filter(c => c.status_pagamento !== 'CANCELADO')
    const aPagar = ativos.filter(c => c.tipo_lancamento === 'A_PAGAR')
    const aReceber = ativos.filter(c => c.tipo_lancamento === 'A_RECEBER')
    return {
      totalPagar: aPagar.reduce((s, c) => s + c.valor_liquido, 0),
      totalReceber: aReceber.reduce((s, c) => s + c.valor_liquido, 0),
      pagoPagar: aPagar.filter(c => c.status_pagamento === 'PAGO').reduce((s, c) => s + c.valor_liquido, 0),
      pagoReceber: aReceber.filter(c => c.status_pagamento === 'PAGO').reduce((s, c) => s + c.valor_liquido, 0),
      pendentePagar: aPagar.filter(c => ['PENDENTE','VENCENDO'].includes(c.status_pagamento)).reduce((s, c) => s + c.valor_liquido, 0),
      vencido: aPagar.filter(c => c.status_pagamento === 'VENCIDO').reduce((s, c) => s + c.valor_liquido, 0),
      qtd: ativos.length,
    }
  }, [custosFiltrados])

  // Preview stats
  const previewStats = useMemo(() => {
    if (preview.length === 0) return null
    const ccs = new Set(preview.map(c => c.centro_custo).filter(Boolean))
    const matched = [...ccs].filter(cc => todasObras.some(o => o.centro_custo === cc))
    return { total: preview.length, ccs: ccs.size, matched: matched.length, unmatched: ccs.size - matched.length }
  }, [preview, todasObras])

  // ── RENDER ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-7xl overflow-y-auto" style={{ height: '100%' }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Custos ERP — TOTVS RM</h1>
          <p className="text-sm text-slate-500 mt-0.5">Importação de lançamentos A Pagar e A Receber • Distribuição automática por Centro de Custo</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchCustos} disabled={loading} className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/> Atualizar
          </button>
          {isAdmin && (
            <button onClick={() => fileRef.current?.click()} disabled={importing}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg text-sm shadow-sm">
              <Upload size={15}/> Importar Excel RM
            </button>
          )}
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden"/>
        </div>
      </div>

      {/* ═══ PREVIEW ═══ */}
      {preview.length > 0 && previewStats && (
        <div className="bg-primary-50 border-2 border-primary-300 rounded-2xl p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-bold text-primary-800">{previewStats.total} registros detectados</p>
              <p className="text-xs text-primary-600 mt-0.5">
                {previewStats.ccs} centro(s) de custo encontrado(s) •
                <span className="text-emerald-600 font-semibold"> {previewStats.matched} com obra vinculada</span>
                {previewStats.unmatched > 0 && <span className="text-red-600 font-semibold"> • {previewStats.unmatched} sem obra (serão ignorados)</span>}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setPreview([])} className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white">Cancelar</button>
              <button onClick={confirmarImport} disabled={importing}
                className="flex items-center gap-2 px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-lg text-sm disabled:opacity-50">
                {importing ? <Loader2 size={14} className="animate-spin"/> : <CheckCircle2 size={14}/>}
                Importar e Distribuir
              </button>
            </div>
          </div>

          {/* Mapa CC → Obra */}
          <div className="bg-white rounded-lg border border-primary-200 p-3 mb-3">
            <p className="text-xs font-bold text-slate-600 mb-2">Mapeamento Centro de Custo → Obra:</p>
            <div className="space-y-1">
              {[...new Set(preview.map(c => c.centro_custo).filter(Boolean))].map(cc => {
                const obra = todasObras.find(o => o.centro_custo === cc)
                const qtd = preview.filter(c => c.centro_custo === cc).length
                const valor = preview.filter(c => c.centro_custo === cc).reduce((s, c) => s + c.valor_liquido, 0)
                return (
                  <div key={cc} className="flex items-center gap-3 text-xs">
                    <span className="font-mono font-bold text-slate-700 w-24">{cc}</span>
                    <span className="text-slate-400">→</span>
                    {obra
                      ? <span className="text-emerald-700 font-medium flex items-center gap-1"><CheckCircle2 size={11}/> {obra.nome_obra}</span>
                      : <span className="text-red-500 font-medium flex items-center gap-1"><XCircle size={11}/> Nenhuma obra com este CC</span>
                    }
                    <span className="text-slate-400 ml-auto">{qtd} docs • {formatCurrency(valor)}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Preview resumo por tipo */}
          <div className="flex gap-4 text-xs">
            <span className="flex items-center gap-1 text-red-600"><ArrowDownRight size={12}/> A Pagar: {formatCurrency(preview.filter(c=>c.tipo_lancamento==='A_PAGAR').reduce((s,c)=>s+c.valor_liquido,0))}</span>
            <span className="flex items-center gap-1 text-emerald-600"><ArrowUpRight size={12}/> A Receber: {formatCurrency(preview.filter(c=>c.tipo_lancamento==='A_RECEBER').reduce((s,c)=>s+c.valor_liquido,0))}</span>
          </div>
        </div>
      )}

      {/* ═══ STATS ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {[
          { label: 'Total A Pagar', value: formatCurrency(stats.totalPagar), icon: ArrowDownRight, color: 'from-red-500 to-red-600' },
          { label: 'Total A Receber', value: formatCurrency(stats.totalReceber), icon: ArrowUpRight, color: 'from-emerald-500 to-emerald-600' },
          { label: 'Já Pago (saídas)', value: formatCurrency(stats.pagoPagar), icon: CheckCircle2, color: 'from-blue-500 to-blue-600' },
          { label: 'Já Recebido', value: formatCurrency(stats.pagoReceber), icon: DollarSign, color: 'from-purple-500 to-purple-600' },
          { label: 'Vencido', value: formatCurrency(stats.vencido), icon: AlertTriangle, color: stats.vencido > 0 ? 'from-red-600 to-red-700' : 'from-slate-400 to-slate-500' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center shadow-sm mb-2`}><Icon size={18} className="text-white"/></div>
            <p className="text-lg font-bold text-slate-800">{value}</p>
            <p className="text-[11px] text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      {/* ═══ FILTROS ═══ */}
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
          {todasObras.filter(o => o.centro_custo).map(o => <option key={o.id} value={o.id}>{o.nome_obra} ({o.centro_custo})</option>)}
        </select>
        <select value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs bg-white">
          <option value="todos">A Pagar + A Receber</option>
          <option value="A_PAGAR">Apenas A Pagar</option>
          <option value="A_RECEBER">Apenas A Receber</option>
        </select>
        <select value={statusFiltro} onChange={e => setStatusFiltro(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs bg-white">
          <option value="todos">Todos os status</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
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
        {isAdmin && obraFiltro !== 'todas' && (
          <button onClick={() => {
            const o = todasObras.find(x => x.id === obraFiltro)
            if (o) apagarCustosDaObra(o.id, o.nome_obra)
          }} className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 rounded-lg text-xs text-red-600 hover:bg-red-50 ml-auto">
            <Trash2 size={12}/> Apagar custos desta obra
          </button>
        )}
        {isAdmin && obraFiltro === 'todas' && custos.length > 0 && (
          <button onClick={apagarTodosCustos}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 rounded-lg text-xs text-red-600 hover:bg-red-50 ml-auto">
            <Trash2 size={12}/> Apagar todos ({custos.length})
          </button>
        )}
      </div>

      {/* ═══ TABELA ═══ */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="bg-slate-50 text-slate-500">
              {['Tipo','Fornecedor','Descrição','Nº Doc','CC','Data','Valor','Status',''].map(h => (
                <th key={h} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {custosFiltrados.length === 0 ? (
                <tr><td colSpan={9} className="py-12 text-center text-slate-400">
                  {custos.length === 0 ? 'Nenhum custo importado. Exporte do TOTVS RM e importe aqui.' : 'Nenhum resultado para os filtros.'}
                </td></tr>
              ) : custosFiltrados.slice(0, 200).map(c => {
                const st = STATUS_LABEL[c.status_pagamento] || STATUS_LABEL.PENDENTE
                const isReceber = c.tipo_lancamento === 'A_RECEBER'
                return (
                  <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-3 py-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${isReceber ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {isReceber ? '↑ Receber' : '↓ Pagar'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-700 max-w-36 truncate font-medium">{c.fornecedor || '—'}</td>
                    <td className="px-3 py-2 text-slate-500 max-w-48 truncate">{c.descricao || '—'}</td>
                    <td className="px-3 py-2 text-slate-500 font-mono text-[10px]">{c.numero_documento || '—'}</td>
                    <td className="px-3 py-2 text-slate-400 font-mono text-[10px]">{c.centro_custo || '—'}</td>
                    <td className="px-3 py-2 text-slate-500">{c.data_emissao ? formatDate(c.data_emissao) : '—'}</td>
                    <td className="px-3 py-2 text-right font-bold text-slate-800">{formatCurrency(c.valor_liquido)}</td>
                    <td className="px-3 py-2">
                      {isAdmin ? (
                        <select value={c.status_pagamento}
                          onChange={async (e) => {
                            const novoStatus = e.target.value
                            await supabase.from('custos_erp').update({ status_pagamento: novoStatus }).eq('id', c.id)
                            setCustos(p => p.map(x => x.id === c.id ? { ...x, status_pagamento: novoStatus } : x))
                            toast.success(`Status → ${STATUS_LABEL[novoStatus]?.label || novoStatus}`)
                          }}
                          className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium cursor-pointer ${st.color}`}>
                          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                      ) : (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${st.color}`}>{st.label}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {isAdmin && (
                        <button onClick={() => { if(confirm('Excluir?')) supabase.from('custos_erp').delete().eq('id',c.id).then(()=>{setCustos(p=>p.filter(x=>x.id!==c.id));toast.success('Excluído')})}}
                          className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50"><Trash2 size={12}/></button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {custosFiltrados.length > 200 && <p className="text-center text-xs text-slate-400 py-2">Mostrando 200 de {custosFiltrados.length}</p>}
        </div>
      </div>
    </div>
  )
}
