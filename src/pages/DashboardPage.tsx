import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2, HardHat, TrendingUp, DollarSign, AlertTriangle,
  Clock, CheckCircle2, BarChart3, ArrowRight, RefreshCw,
  PieChart, Activity,
} from 'lucide-react'
import { useStore } from '../lib/store'
import { usePerfilStore } from '../lib/perfilStore'
import { Contrato, Obra, Servico, Medicao, LinhaMemoria } from '../types'
import { formatCurrency, calcResumoServico, calcPrecoComDesconto, calcPrecoComBDI, calcPrecoTotal } from '../utils/calculations'
import { supabase } from '../lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ObraIndicador {
  obra: Obra
  contrato: Contrato
  totalOrcamento: number
  valorMedido: number
  percentual: number
  saldo: number
  numMedicoes: number
  ultimaMedicao: string | null
  diasSemMedicao: number
  diasRestantes: number | null
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const { contratos, fetchContratos, setContratoAtivo, setObraAtiva } = useStore()
  const { perfilAtual } = usePerfilStore()
  const navigate = useNavigate()

  const [indicadores, setIndicadores] = useState<ObraIndicador[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  async function carregarDados() {
    setLoading(true)
    try {
      await fetchContratos()
      const store = useStore.getState()
      const contratosAtivos = store.contratos

      const results: ObraIndicador[] = []

      for (const contrato of contratosAtivos) {
        // Busca obras
        const { data: obrasData } = await supabase
          .from('obras').select('*').eq('contrato_id', contrato.id)
        const obras = (obrasData || []) as Obra[]

        for (const obra of obras) {
          // Busca serviços
          const { data: servData } = await supabase
            .from('servicos').select('*').eq('obra_id', obra.id)
          const servicos = (servData || []) as Servico[]

          // Busca medições
          const { data: medData } = await supabase
            .from('medicoes').select('*').eq('obra_id', obra.id).order('data_medicao', { ascending: false })
          const medicoes = (medData || []) as Medicao[]

          // Calcula total orçamento
          let totalOrcamento = 0
          for (const srv of servicos) {
            if (srv.is_grupo) continue
            const pd = calcPrecoComDesconto(srv.preco_unitario, obra.desconto_percentual)
            const pb = calcPrecoComBDI(pd, obra.bdi_percentual)
            totalOrcamento += calcPrecoTotal(srv.quantidade, pb)
          }

          // Calcula valor medido (busca linhas de todas as medições)
          let valorMedido = 0
          const medicoesAprovadas = medicoes.filter(m => m.status === 'APROVADA')
          const todasMedicoes = medicoes

          if (todasMedicoes.length > 0) {
            // Busca todas as linhas de memória da obra de uma vez
            const medIds = todasMedicoes.map(m => m.id)
            const { data: linhasData } = await supabase
              .from('linhas_memoria').select('*').in('medicao_id', medIds)
            const todasLinhas = (linhasData || []) as LinhaMemoria[]

            // Agrupa linhas por servico
            const linhasPorServico = new Map<string, LinhaMemoria[]>()
            for (const l of todasLinhas) {
              const arr = linhasPorServico.get(l.servico_id) || []
              arr.push(l)
              linhasPorServico.set(l.servico_id, arr)
            }

            // Calcula valor medido
            const r2 = (n: number) => Math.round(n * 100) / 100
            for (const srv of servicos) {
              if (srv.is_grupo) continue
              const linhas = linhasPorServico.get(srv.id) || []
              if (linhas.length === 0) continue
              const { qtdAnterior, qtdPeriodo, qtdAcumulada } = calcResumoServico(srv, linhas)
              const pd = calcPrecoComDesconto(srv.preco_unitario, obra.desconto_percentual)
              const pb = calcPrecoComBDI(pd, obra.bdi_percentual)
              const pt = calcPrecoTotal(srv.quantidade, pb)
              if (qtdAcumulada >= srv.quantidade && srv.quantidade > 0) {
                valorMedido += pt
              } else {
                valorMedido += r2((qtdAnterior + qtdPeriodo) * pb)
              }
            }
          }

          const percentual = totalOrcamento > 0 ? valorMedido / totalOrcamento : 0
          const ultimaMed = todasMedicoes[0]?.data_medicao || null
          const diasSemMedicao = ultimaMed
            ? Math.floor((Date.now() - new Date(ultimaMed + 'T00:00:00').getTime()) / 86400000)
            : 999

          let diasRestantes: number | null = null
          if (obra.data_ordem_servico && obra.prazo_execucao_dias) {
            const inicio = new Date(obra.data_ordem_servico)
            const fim = new Date(inicio.getTime() + obra.prazo_execucao_dias * 86400000)
            diasRestantes = Math.floor((fim.getTime() - Date.now()) / 86400000)
          }

          results.push({
            obra, contrato, totalOrcamento, valorMedido, percentual,
            saldo: totalOrcamento - valorMedido,
            numMedicoes: todasMedicoes.length,
            ultimaMedicao: ultimaMed, diasSemMedicao, diasRestantes,
          })
        }
      }

      setIndicadores(results)
      setLastUpdate(new Date())
    } catch (err) {
      console.error('Erro ao carregar dashboard:', err)
    }
    setLoading(false)
  }

  useEffect(() => { carregarDados() }, [])

  // ─── Métricas agregadas ────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const contratosAtivos = new Set(indicadores.filter(i => i.contrato.status === 'ATIVO').map(i => i.contrato.id)).size
    const obrasAtivas = indicadores.filter(i => i.obra.status === 'ATIVA').length
    const totalContratado = indicadores.reduce((s, i) => s + i.totalOrcamento, 0)
    const totalFaturado = indicadores.reduce((s, i) => s + i.valorMedido, 0)
    const totalSaldo = totalContratado - totalFaturado
    const pctGeral = totalContratado > 0 ? totalFaturado / totalContratado : 0
    return { contratosAtivos, obrasAtivas, totalContratado, totalFaturado, totalSaldo, pctGeral }
  }, [indicadores])

  // ─── Alertas ────────────────────────────────────────────────────────────────

  const alertas = useMemo(() => {
    const list: { tipo: 'alerta' | 'erro' | 'info'; texto: string; obra: ObraIndicador }[] = []
    for (const ind of indicadores) {
      if (ind.obra.status !== 'ATIVA') continue
      if (ind.diasRestantes !== null && ind.diasRestantes < 0) {
        list.push({ tipo: 'erro', texto: `Prazo vencido há ${Math.abs(ind.diasRestantes)} dias`, obra: ind })
      } else if (ind.diasRestantes !== null && ind.diasRestantes <= 30) {
        list.push({ tipo: 'alerta', texto: `Prazo vence em ${ind.diasRestantes} dias`, obra: ind })
      }
      if (ind.diasSemMedicao > 45 && ind.percentual < 1) {
        list.push({ tipo: 'alerta', texto: `Sem medição há ${ind.diasSemMedicao} dias`, obra: ind })
      }
      if (ind.saldo < -0.01) {
        list.push({ tipo: 'erro', texto: `Saldo negativo: ${formatCurrency(ind.saldo)}`, obra: ind })
      }
    }
    return list.sort((a, b) => (a.tipo === 'erro' ? 0 : 1) - (b.tipo === 'erro' ? 0 : 1))
  }, [indicadores])

  // ─── Ranking obras por % ────────────────────────────────────────────────────

  const obrasOrdenadas = useMemo(
    () => [...indicadores].filter(i => i.obra.status === 'ATIVA').sort((a, b) => b.percentual - a.percentual),
    [indicadores]
  )

  function abrirObra(ind: ObraIndicador) {
    setContratoAtivo(ind.contrato)
    setObraAtiva(ind.obra)
    navigate('/medicoes')
  }

  // ─── RENDER ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-7xl overflow-y-auto" style={{ height: '100%' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Visão geral de todos os contratos e obras
            {lastUpdate && <span className="text-slate-400"> • Atualizado às {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>}
          </p>
        </div>
        <button onClick={carregarDados} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/> Atualizar
        </button>
      </div>

      {loading && indicadores.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw size={24} className="animate-spin text-primary-500 mr-3"/>
          <span className="text-slate-500">Carregando indicadores...</span>
        </div>
      ) : (
        <>
          {/* ═══ STATS CARDS ═══ */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Contratos Ativos', value: String(stats.contratosAtivos), icon: Building2, color: 'from-blue-500 to-blue-600', sub: `${contratos.length} total` },
              { label: 'Obras em Andamento', value: String(stats.obrasAtivas), icon: HardHat, color: 'from-primary-500 to-primary-600', sub: `${indicadores.length} total` },
              { label: 'Total Contratado', value: formatCurrency(stats.totalContratado), icon: DollarSign, color: 'from-emerald-500 to-emerald-600', sub: `${(stats.pctGeral * 100).toFixed(1)}% executado` },
              { label: 'Total Faturado', value: formatCurrency(stats.totalFaturado), icon: TrendingUp, color: 'from-purple-500 to-purple-600', sub: `Saldo: ${formatCurrency(stats.totalSaldo)}` },
            ].map(({ label, value, icon: Icon, color, sub }) => (
              <div key={label} className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-sm`}>
                    <Icon size={20} className="text-white"/>
                  </div>
                </div>
                <p className="text-xl font-bold text-slate-800 tracking-tight">{value}</p>
                <p className="text-xs text-slate-500 mt-0.5">{label}</p>
                <p className="text-[10px] text-slate-400 mt-1">{sub}</p>
              </div>
            ))}
          </div>

          {/* ═══ PROGRESS BAR GERAL ═══ */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Activity size={16} className="text-primary-500"/>
                <p className="font-bold text-sm text-slate-700">Execução Geral</p>
              </div>
              <span className="text-lg font-bold text-primary-600">{(stats.pctGeral * 100).toFixed(1)}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-4 overflow-hidden">
              <div className="h-4 rounded-full bg-gradient-to-r from-primary-400 to-primary-500 transition-all duration-1000"
                style={{ width: `${Math.min(100, stats.pctGeral * 100)}%` }}/>
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 mt-1.5">
              <span>Faturado: {formatCurrency(stats.totalFaturado)}</span>
              <span>Saldo: {formatCurrency(stats.totalSaldo)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">

            {/* ═══ ALERTAS ═══ */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden h-full">
                <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 bg-slate-50">
                  <AlertTriangle size={15} className="text-primary-500"/>
                  <p className="font-bold text-sm text-slate-700">Alertas</p>
                  {alertas.length > 0 && (
                    <span className="ml-auto px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px] font-bold">{alertas.length}</span>
                  )}
                </div>
                <div className="overflow-y-auto" style={{ maxHeight: 380 }}>
                  {alertas.length === 0 ? (
                    <div className="py-10 text-center">
                      <CheckCircle2 size={28} className="mx-auto text-emerald-300 mb-2"/>
                      <p className="text-xs text-slate-400">Nenhum alerta no momento</p>
                    </div>
                  ) : (
                    alertas.map((a, i) => (
                      <div key={i} onClick={() => abrirObra(a.obra)}
                        className={`flex items-start gap-2.5 px-4 py-3 border-b border-slate-50 cursor-pointer hover:bg-slate-50 transition-colors`}>
                        {a.tipo === 'erro'
                          ? <div className="w-2 h-2 rounded-full bg-red-500 mt-1.5 shrink-0"/>
                          : <div className="w-2 h-2 rounded-full bg-primary-400 mt-1.5 shrink-0"/>}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-700 truncate">{a.obra.obra.nome_obra}</p>
                          <p className={`text-[10px] mt-0.5 ${a.tipo === 'erro' ? 'text-red-600' : 'text-primary-600'}`}>{a.texto}</p>
                          <p className="text-[9px] text-slate-400 mt-0.5">{a.obra.contrato.nome_obra}</p>
                        </div>
                        <ArrowRight size={12} className="text-slate-300 shrink-0 mt-1"/>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* ═══ RANKING OBRAS ═══ */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden h-full">
                <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 bg-slate-50">
                  <BarChart3 size={15} className="text-blue-500"/>
                  <p className="font-bold text-sm text-slate-700">Obras em Andamento</p>
                  <span className="ml-auto text-[10px] text-slate-400">{obrasOrdenadas.length} obras</span>
                </div>
                <div className="overflow-y-auto" style={{ maxHeight: 380 }}>
                  {obrasOrdenadas.length === 0 ? (
                    <div className="py-10 text-center">
                      <HardHat size={28} className="mx-auto text-slate-200 mb-2"/>
                      <p className="text-xs text-slate-400">Nenhuma obra ativa</p>
                    </div>
                  ) : (
                    obrasOrdenadas.map(ind => {
                      const pct = Math.min(100, ind.percentual * 100)
                      const barColor = pct >= 100 ? 'bg-emerald-500' : pct > 50 ? 'bg-blue-500' : pct > 0 ? 'bg-primary-500' : 'bg-slate-300'
                      return (
                        <div key={ind.obra.id} onClick={() => abrirObra(ind)}
                          className="flex items-center gap-4 px-5 py-3 border-b border-slate-50 cursor-pointer hover:bg-slate-50 transition-colors">
                          <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-slate-600">{pct.toFixed(0)}%</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-xs font-semibold text-slate-700 truncate">{ind.obra.nome_obra}</p>
                              {pct >= 100 && <CheckCircle2 size={11} className="text-emerald-500 shrink-0"/>}
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-2">
                              <div className={`h-2 rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }}/>
                            </div>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-[10px] text-slate-400">{ind.contrato.nome_obra}</span>
                              <span className="text-[10px] text-slate-400">{ind.numMedicoes} med.</span>
                              {ind.diasRestantes !== null && ind.diasRestantes <= 30 && (
                                <span className={`text-[10px] font-bold ${ind.diasRestantes < 0 ? 'text-red-500' : 'text-primary-500'}`}>
                                  {ind.diasRestantes < 0 ? `${Math.abs(ind.diasRestantes)}d atrasada` : `${ind.diasRestantes}d restantes`}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-bold text-slate-700">{formatCurrency(ind.valorMedido)}</p>
                            <p className="text-[10px] text-slate-400">de {formatCurrency(ind.totalOrcamento)}</p>
                          </div>
                          <ArrowRight size={14} className="text-slate-300 shrink-0"/>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ═══ TABELA DETALHADA ═══ */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-6">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 bg-slate-50">
              <PieChart size={15} className="text-emerald-500"/>
              <p className="font-bold text-sm text-slate-700">Resumo por Contrato</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500">
                    {['Contrato','Obra','Status','Orçamento','Faturado','Saldo','Execução','Medições','Prazo'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {indicadores.map(ind => {
                    const pct = ind.percentual * 100
                    return (
                      <tr key={ind.obra.id} onClick={() => abrirObra(ind)}
                        className="border-b border-slate-50 hover:bg-primary-50/30 cursor-pointer transition-colors">
                        <td className="px-4 py-2.5 font-medium text-slate-600 max-w-32 truncate">{ind.contrato.nome_obra}</td>
                        <td className="px-4 py-2.5 font-semibold text-slate-800 max-w-40 truncate">{ind.obra.nome_obra}</td>
                        <td className="px-4 py-2.5">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            ind.obra.status === 'ATIVA' ? 'bg-emerald-100 text-emerald-700'
                            : ind.obra.status === 'CONCLUIDA' ? 'bg-blue-100 text-blue-700'
                            : 'bg-slate-100 text-slate-500'
                          }`}>{ind.obra.status}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium">{formatCurrency(ind.totalOrcamento)}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-primary-600">{formatCurrency(ind.valorMedido)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={ind.saldo < -0.01 ? 'text-red-600 font-bold' : 'text-slate-600'}>
                            {formatCurrency(ind.saldo)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-slate-100 rounded-full h-1.5">
                              <div className={`h-1.5 rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-primary-500'}`}
                                style={{ width: `${Math.min(100, pct)}%` }}/>
                            </div>
                            <span className="font-bold text-slate-700 w-10 text-right">{pct.toFixed(1)}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-center">{ind.numMedicoes}</td>
                        <td className="px-4 py-2.5 text-center">
                          {ind.diasRestantes === null ? '—' : (
                            <span className={`font-bold ${ind.diasRestantes < 0 ? 'text-red-500' : ind.diasRestantes <= 30 ? 'text-primary-500' : 'text-slate-600'}`}>
                              {ind.diasRestantes}d
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {indicadores.length === 0 && (
                <div className="py-10 text-center text-slate-400 text-sm">Nenhum dado para exibir</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
