import { useEffect, useState } from 'react'
import {
  TrendingUp, Building2, DollarSign, Calendar, Save, Loader2, FileSpreadsheet,
  BarChart3, User,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { usePerfilStore } from '../lib/perfilStore'
import { supabase } from '../lib/supabase'

interface ObraAtiva { id: string; nome_obra: string; local_obra: string; contrato_id: string }
interface ProdRow { obra_id: string; custo_total: number; faturamento: number; id?: string }
interface ServicoDiverso { id: string; titulo: string; tipo: string; data_conclusao: string; obra_nome: string; local_obra: string }

function formatCurrency(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

export function ProducaoPage() {
  const { perfilAtual } = usePerfilStore()
  const isAdmin = perfilAtual?.role === 'ADMIN' || perfilAtual?.role === 'SUPERADMIN'

  // Período
  const hoje = new Date()
  const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0]
  const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0]
  const [periodoIni, setPeriodoIni] = useState(primeiroDia)
  const [periodoFim, setPeriodoFim] = useState(ultimoDia)

  // Seletor de engenheiro (para admin)
  const [engenheiros, setEngenheiros] = useState<{ id: string; nome: string }[]>([])
  const [engenheiroId, setEngenheiroId] = useState(perfilAtual?.id || '')

  // Dados
  const [obras, setObras] = useState<ObraAtiva[]>([])
  const [prodRows, setProdRows] = useState<Record<string, ProdRow>>({})
  const [servicosDiversos, setServicosDiversos] = useState<ServicoDiverso[]>([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)

  const VALOR_POR_OBRA = 120
  const VALOR_ORCAMENTO = 50
  const VALOR_PROJETO = 100

  useEffect(() => {
    if (isAdmin) {
      supabase.from('perfis').select('id, nome').in('role', ['ENGENHEIRO', 'ADMIN']).eq('ativo', true)
        .then(({ data }) => { if (data) setEngenheiros(data as any[]) })
    }
    if (perfilAtual?.id) setEngenheiroId(perfilAtual.id)
  }, [])

  useEffect(() => {
    if (engenheiroId && periodoIni && periodoFim) fetchDados()
  }, [engenheiroId, periodoIni, periodoFim])

  async function fetchDados() {
    setLoading(true)
    try {
      // 1. Obras ativas do engenheiro
      const { data: obrasData } = await supabase.from('obras').select('id, nome_obra, local_obra, contrato_id')
        .eq('engenheiro_responsavel_id', engenheiroId).eq('status', 'ATIVA')
      const obrasAtivas = (obrasData || []) as ObraAtiva[]
      setObras(obrasAtivas)

      // 2. Produção salva para o período
      if (obrasAtivas.length > 0) {
        const { data: prodData } = await supabase.from('producao_engenheiro').select('*')
          .eq('engenheiro_id', engenheiroId)
          .eq('periodo_inicio', periodoIni).eq('periodo_fim', periodoFim)
        const map: Record<string, ProdRow> = {}
        for (const o of obrasAtivas) {
          const existing = (prodData || []).find((p: any) => p.obra_id === o.id)
          map[o.id] = existing
            ? { obra_id: o.id, custo_total: existing.custo_total, faturamento: existing.faturamento, id: existing.id }
            : { obra_id: o.id, custo_total: 0, faturamento: 0 }
        }
        setProdRows(map)
      } else {
        setProdRows({})
      }

      // 3. Serviços diversos (orçamentos/projetos concluídos no período)
      const { data: orcData } = await supabase.from('orcamentos_revisao')
        .select('id, titulo, tipo, data_conclusao, obra_id')
        .eq('solicitante_id', engenheiroId).eq('status', 'CONCLUIDO')
        .gte('data_conclusao', periodoIni + 'T00:00:00')
        .lte('data_conclusao', periodoFim + 'T23:59:59')
      const svcs: ServicoDiverso[] = []
      if (orcData) {
        // Busca nomes das obras vinculadas
        const obraIds = [...new Set(orcData.map((o: any) => o.obra_id).filter(Boolean))]
        let obraNomes: Record<string, { nome: string; local: string }> = {}
        if (obraIds.length > 0) {
          const { data: oNames } = await supabase.from('obras').select('id, nome_obra, local_obra').in('id', obraIds)
          if (oNames) oNames.forEach((o: any) => { obraNomes[o.id] = { nome: o.nome_obra, local: o.local_obra } })
        }
        for (const o of orcData as any[]) {
          svcs.push({
            id: o.id, titulo: o.titulo, tipo: o.tipo || 'ORCAMENTO',
            data_conclusao: o.data_conclusao,
            obra_nome: o.obra_id ? (obraNomes[o.obra_id]?.nome || '—') : '—',
            local_obra: o.obra_id ? (obraNomes[o.obra_id]?.local || '—') : '—',
          })
        }
      }
      setServicosDiversos(svcs)
    } catch (err: any) {
      toast.error(err.message || 'Erro ao carregar')
    }
    setLoading(false)
  }

  function updateRow(obraId: string, field: 'custo_total' | 'faturamento', value: string) {
    const num = Number(value.replace(/[^\d.,]/g, '').replace(',', '.')) || 0
    setProdRows(p => ({ ...p, [obraId]: { ...p[obraId], [field]: num } }))
  }

  async function salvarProdução() {
    setSalvando(true)
    try {
      for (const obraId of Object.keys(prodRows)) {
        const row = prodRows[obraId]
        if (row.id) {
          await supabase.from('producao_engenheiro').update({ custo_total: row.custo_total, faturamento: row.faturamento }).eq('id', row.id)
        } else {
          const { data } = await supabase.from('producao_engenheiro').insert({
            engenheiro_id: engenheiroId, obra_id: obraId,
            periodo_inicio: periodoIni, periodo_fim: periodoFim,
            custo_total: row.custo_total, faturamento: row.faturamento,
          }).select('id').single()
          if (data) setProdRows(p => ({ ...p, [obraId]: { ...p[obraId], id: data.id } }))
        }
      }
      toast.success('Produção salva!')
    } catch (err: any) { toast.error(err.message || 'Erro ao salvar') }
    setSalvando(false)
  }

  // Cálculos
  const qtdObras = obras.length
  const totalObras = qtdObras * VALOR_POR_OBRA
  const totalServicos = servicosDiversos.reduce((s, sv) => s + (sv.tipo === 'PROJETO' ? VALOR_PROJETO : VALOR_ORCAMENTO), 0)
  const totalProdutividade = totalObras + totalServicos

  const totalCusto = Object.values(prodRows).reduce((s, r) => s + r.custo_total, 0)
  const totalFaturamento = Object.values(prodRows).reduce((s, r) => s + r.faturamento, 0)
  const totalLucro = totalFaturamento - totalCusto
  const indiceGeral = totalFaturamento > 0 ? (totalCusto / totalFaturamento * 100) : 0

  const engNome = isAdmin ? (engenheiros.find(e => e.id === engenheiroId)?.nome || 'Engenheiro') : perfilAtual?.nome || 'Engenheiro'

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
            <BarChart3 size={24} className="text-primary-500"/> Produção do Engenheiro
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">Cálculo de produtividade por período</p>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && engenheiros.length > 0 && (
            <select value={engenheiroId} onChange={e => setEngenheiroId(e.target.value)}
              className="border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm">
              {engenheiros.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
          )}
          <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5">
            <Calendar size={14} className="text-slate-400"/>
            <input type="date" value={periodoIni} onChange={e => setPeriodoIni(e.target.value)}
              className="text-sm border-none outline-none bg-transparent dark:text-white"/>
            <span className="text-xs text-slate-400">à</span>
            <input type="date" value={periodoFim} onChange={e => setPeriodoFim(e.target.value)}
              className="text-sm border-none outline-none bg-transparent dark:text-white"/>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24"><Loader2 size={28} className="animate-spin text-primary-500"/></div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center"><Building2 size={16} className="text-emerald-600"/></div>
                <span className="text-xs text-slate-400">Obras ativas</span>
              </div>
              <p className="text-2xl font-bold text-slate-800 dark:text-white">{qtdObras}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center"><DollarSign size={16} className="text-blue-600"/></div>
                <span className="text-xs text-slate-400">Valor por obra</span>
              </div>
              <p className="text-2xl font-bold text-slate-800 dark:text-white">R$ {VALOR_POR_OBRA}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center"><FileSpreadsheet size={16} className="text-purple-600"/></div>
                <span className="text-xs text-slate-400">Serviços diversos</span>
              </div>
              <p className="text-2xl font-bold text-slate-800 dark:text-white">{formatCurrency(totalServicos)}</p>
            </div>
            <div className="bg-primary-50 dark:bg-primary-900/30 border-2 border-primary-300 dark:border-primary-600 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-primary-200 rounded-lg flex items-center justify-center"><TrendingUp size={16} className="text-primary-700"/></div>
                <span className="text-xs text-primary-600 font-semibold">TOTAL PRODUTIVIDADE</span>
              </div>
              <p className="text-2xl font-bold text-primary-700 dark:text-primary-400">{formatCurrency(totalProdutividade)}</p>
            </div>
          </div>

          {/* Serviços diversos */}
          {servicosDiversos.length > 0 && (
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5 mb-6">
              <h3 className="font-bold text-slate-800 dark:text-white text-sm mb-3 flex items-center gap-2">
                <FileSpreadsheet size={15} className="text-purple-500"/> Serviços Diversos
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700">
                      <th className="text-left py-2 px-3 text-xs text-slate-500 font-semibold">Tipo</th>
                      <th className="text-left py-2 px-3 text-xs text-slate-500 font-semibold">Título</th>
                      <th className="text-left py-2 px-3 text-xs text-slate-500 font-semibold">Obra</th>
                      <th className="text-left py-2 px-3 text-xs text-slate-500 font-semibold">Local</th>
                      <th className="text-right py-2 px-3 text-xs text-slate-500 font-semibold">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {servicosDiversos.map(sv => (
                      <tr key={sv.id} className="border-b border-slate-100 dark:border-slate-700/50">
                        <td className="py-2 px-3">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${sv.tipo === 'PROJETO' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {sv.tipo === 'PROJETO' ? 'Projeto' : 'Orçamento'}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-xs text-slate-700 dark:text-slate-300">{sv.titulo}</td>
                        <td className="py-2 px-3 text-xs text-slate-500">{sv.obra_nome}</td>
                        <td className="py-2 px-3 text-xs text-slate-400">{sv.local_obra}</td>
                        <td className="py-2 px-3 text-right font-bold text-emerald-600">
                          {formatCurrency(sv.tipo === 'PROJETO' ? VALOR_PROJETO : VALOR_ORCAMENTO)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Grid de obras — custo/faturamento */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden mb-6">
            <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 dark:text-white text-sm flex items-center gap-2">
                <Building2 size={15} className="text-slate-500"/> Obras — {engNome}
              </h3>
              <button onClick={salvarProdução} disabled={salvando}
                className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white font-semibold rounded-lg text-sm disabled:opacity-50">
                {salvando ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} Salvar
              </button>
            </div>
            {obras.length === 0 ? (
              <div className="p-12 text-center">
                <Building2 size={32} className="mx-auto text-slate-300 mb-2"/>
                <p className="text-sm text-slate-400">Nenhuma obra ativa designada para este engenheiro</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-800 text-white text-xs">
                      <th className="text-left py-3 px-4 font-semibold">Obra</th>
                      <th className="text-right py-3 px-4 font-semibold">Custo total</th>
                      <th className="text-right py-3 px-4 font-semibold">Faturamento</th>
                      <th className="text-right py-3 px-4 font-semibold">Lucro</th>
                      <th className="text-right py-3 px-4 font-semibold">Índice</th>
                    </tr>
                  </thead>
                  <tbody>
                    {obras.map((obra, idx) => {
                      const row = prodRows[obra.id] || { custo_total: 0, faturamento: 0 }
                      const lucro = row.faturamento - row.custo_total
                      const indice = row.faturamento > 0 ? (row.custo_total / row.faturamento * 100) : 0
                      return (
                        <tr key={obra.id} className={`border-b border-slate-100 dark:border-slate-700/50 ${idx % 2 === 0 ? 'bg-slate-50/50 dark:bg-slate-900/30' : ''}`}>
                          <td className="py-3 px-4">
                            <p className="text-sm font-semibold text-slate-800 dark:text-white">{obra.nome_obra}</p>
                            <p className="text-[10px] text-slate-400">{obra.local_obra}</p>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <input type="number" step="0.01" min="0"
                              value={row.custo_total || ''}
                              onChange={e => updateRow(obra.id, 'custo_total', e.target.value)}
                              placeholder="0,00"
                              className="w-32 text-right border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-1.5 text-sm"/>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <input type="number" step="0.01" min="0"
                              value={row.faturamento || ''}
                              onChange={e => updateRow(obra.id, 'faturamento', e.target.value)}
                              placeholder="0,00"
                              className="w-32 text-right border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-1.5 text-sm"/>
                          </td>
                          <td className={`py-3 px-4 text-right text-sm font-bold ${lucro >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {formatCurrency(lucro)}
                          </td>
                          <td className="py-3 px-4 text-right text-sm font-semibold text-slate-700 dark:text-slate-300">
                            {row.faturamento > 0 ? `${indice.toFixed(0)}%` : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-800 text-white text-sm font-bold">
                      <td className="py-3 px-4">TOTAIS</td>
                      <td className="py-3 px-4 text-right">{formatCurrency(totalCusto)}</td>
                      <td className="py-3 px-4 text-right">{formatCurrency(totalFaturamento)}</td>
                      <td className={`py-3 px-4 text-right ${totalLucro >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatCurrency(totalLucro)}</td>
                      <td className="py-3 px-4 text-right">{totalFaturamento > 0 ? `${indiceGeral.toFixed(0)}%` : '—'}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
