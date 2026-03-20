import { useEffect, useState } from 'react'
import {
  Trophy, Building2, Calendar, Loader2, ChevronDown, ChevronRight, User, TrendingUp, Award,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { usePerfilStore } from '../lib/perfilStore'
import { supabase } from '../lib/supabase'

interface EngRanking {
  id: string; nome: string
  obras: { id: string; nome_obra: string; local_obra: string; custo: number; faturamento: number }[]
  totalCusto: number; totalFaturamento: number
  margemGlobal: number
}

function formatCurrency(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

function getCicloAtual() {
  const hoje = new Date()
  let mesRef: Date
  if (hoje.getDate() >= 21) {
    mesRef = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1)
  } else {
    mesRef = new Date(hoje.getFullYear(), hoje.getMonth(), 1)
  }
  const anoIni = mesRef.getMonth() === 0 ? mesRef.getFullYear() - 1 : mesRef.getFullYear()
  const mesIni = mesRef.getMonth() === 0 ? 12 : mesRef.getMonth()
  const ini = `${anoIni}-${String(mesIni).padStart(2, '0')}-21`
  const fim = `${mesRef.getFullYear()}-${String(mesRef.getMonth() + 1).padStart(2, '0')}-20`
  return { ini, fim, label: mesRef.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) }
}

export function MarioPapisPage() {
  const { perfilAtual } = usePerfilStore()
  const isAdmin = perfilAtual?.role === 'ADMIN' || perfilAtual?.role === 'SUPERADMIN'

  const ciclo = getCicloAtual()
  const [periodoIni, setPeriodoIni] = useState(ciclo.ini)
  const [periodoFim, setPeriodoFim] = useState(ciclo.fim)

  const [ranking, setRanking] = useState<EngRanking[]>([])
  const [loading, setLoading] = useState(true)
  const [expandido, setExpandido] = useState<string | null>(null)

  useEffect(() => {
    if (periodoIni && periodoFim) fetchRanking()
  }, [periodoIni, periodoFim])

  async function fetchRanking() {
    setLoading(true)
    try {
      // 1. All engineers
      const { data: engs } = await supabase.from('perfis').select('id, nome').eq('role', 'ENGENHEIRO').eq('ativo', true)
      if (!engs || engs.length === 0) { setRanking([]); setLoading(false); return }

      // 2. All active obras with engenheiro
      const { data: obrasData } = await supabase.from('obras').select('id, nome_obra, local_obra, engenheiro_responsavel_id')
        .eq('status', 'ATIVA').not('engenheiro_responsavel_id', 'is', null)
      const obras = obrasData || []

      // 3. Custos ERP no período
      const obraIds = obras.map(o => o.id)
      let custosMap: Record<string, { custo: number; faturamento: number }> = {}
      if (obraIds.length > 0) {
        const { data: custosData } = await supabase.from('custos_erp')
          .select('obra_id, tipo_lancamento, valor_liquido')
          .in('obra_id', obraIds)
          .gte('data_emissao', periodoIni)
          .lte('data_emissao', periodoFim)
        if (custosData) {
          for (const r of custosData as any[]) {
            if (!custosMap[r.obra_id]) custosMap[r.obra_id] = { custo: 0, faturamento: 0 }
            if (r.tipo_lancamento === 'A_RECEBER') custosMap[r.obra_id].faturamento += Number(r.valor_liquido) || 0
            else custosMap[r.obra_id].custo += Number(r.valor_liquido) || 0
          }
        }
      }

      // 4. Monta ranking por engenheiro
      const engMap: Record<string, EngRanking> = {}
      for (const eng of engs as any[]) {
        engMap[eng.id] = { id: eng.id, nome: eng.nome || 'Engenheiro', obras: [], totalCusto: 0, totalFaturamento: 0, margemGlobal: 0 }
      }

      for (const obra of obras as any[]) {
        const engId = obra.engenheiro_responsavel_id
        if (!engMap[engId]) continue
        const fin = custosMap[obra.id] || { custo: 0, faturamento: 0 }
        engMap[engId].obras.push({
          id: obra.id, nome_obra: obra.nome_obra, local_obra: obra.local_obra,
          custo: fin.custo, faturamento: fin.faturamento,
        })
        engMap[engId].totalCusto += fin.custo
        engMap[engId].totalFaturamento += fin.faturamento
      }

      // 5. Calcula margem global = média das margens individuais de cada obra
      const list = Object.values(engMap).filter(e => e.obras.length > 0)
      for (const eng of list) {
        const obrasComMargem = eng.obras.filter(o => o.faturamento > 0)
        if (obrasComMargem.length > 0) {
          const somaMargens = obrasComMargem.reduce((acc, o) => acc + (1 - o.custo / o.faturamento) * 100, 0)
          eng.margemGlobal = somaMargens / obrasComMargem.length
        } else {
          eng.margemGlobal = 0
        }
      }
      list.sort((a, b) => b.margemGlobal - a.margemGlobal)
      setRanking(list)
    } catch (err: any) { toast.error(err.message || 'Erro ao carregar ranking') }
    setLoading(false)
  }

  // Para engenheiro: Top 1, Top 2, e ele próprio com sua posição real
  const listaExibida = (() => {
    if (isAdmin) return ranking
    if (ranking.length <= 3) return ranking
    const myId = perfilAtual?.id
    const myIdx = ranking.findIndex(r => r.id === myId)
    // Se já está no top 2, mostra top 3 normal
    if (myIdx >= 0 && myIdx <= 1) return ranking.slice(0, 3)
    // Se é o 3º, mostra top 3 normal
    if (myIdx === 2) return ranking.slice(0, 3)
    // Senão: top 2 + ele na posição real
    const top2 = ranking.slice(0, 2)
    if (myIdx >= 0) return [...top2, ranking[myIdx]]
    return top2
  })()

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-3">
            <Trophy size={24} className="text-amber-500"/> MARIO PAPIS
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">Métrica de Análise e Ranking Individual de Obras — Performance em Administração, Planejamento, Índices e Serviços</p>
        </div>
        <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5">
          <Calendar size={14} className="text-slate-400"/>
          <input type="date" value={periodoIni} onChange={e => setPeriodoIni(e.target.value)}
            className="text-sm border-none outline-none bg-transparent dark:text-white"/>
          <span className="text-xs text-slate-400">à</span>
          <input type="date" value={periodoFim} onChange={e => setPeriodoFim(e.target.value)}
            className="text-sm border-none outline-none bg-transparent dark:text-white"/>
        </div>
      </div>

      {/* Ciclo label */}
      <div className="mb-5 px-4 py-2 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-lg">
        <p className="text-xs text-purple-700 dark:text-purple-300">
          Ciclo: <strong>{new Date(periodoIni + 'T12:00:00').toLocaleDateString('pt-BR')}</strong> a <strong>{new Date(periodoFim + 'T12:00:00').toLocaleDateString('pt-BR')}</strong>
          {!isAdmin && <span className="ml-3 text-purple-500">(top 2 + sua posição)</span>}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24"><Loader2 size={28} className="animate-spin text-amber-500"/></div>
      ) : ranking.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
          <Trophy size={36} className="mx-auto text-slate-300 mb-3"/>
          <p className="text-slate-500">Nenhum engenheiro com obras ativas no período</p>
        </div>
      ) : (
        <div className="space-y-3">
          {listaExibida.map((eng, idx) => {
            const posicao = ranking.indexOf(eng) + 1
            const isTop1 = posicao === 1
            const isNegativo = eng.margemGlobal < 0
            const isExpanded = expandido === eng.id
            const isMe = !isAdmin && eng.id === perfilAtual?.id
            const isGap = !isAdmin && idx === 2 && posicao > 3

            return (
              <div key={eng.id}>
                {/* Separador "..." quando engenheiro não está no top 3 */}
                {isGap && (
                  <div className="flex items-center gap-3 py-2 px-4 mb-3">
                    <div className="flex-1 border-t border-dashed border-slate-200 dark:border-slate-600"/>
                    <span className="text-[10px] text-slate-400">sua posição</span>
                    <div className="flex-1 border-t border-dashed border-slate-200 dark:border-slate-600"/>
                  </div>
                )}
              <div className={`rounded-xl overflow-hidden transition-all ${
                isTop1 ? 'border-2 border-amber-300 dark:border-amber-600 shadow-lg shadow-amber-100/50 dark:shadow-amber-900/20' :
                isMe ? 'border-2 border-primary-300 dark:border-primary-600 shadow-md shadow-primary-100/50 dark:shadow-primary-900/20' :
                isNegativo ? 'border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10' :
                'border border-slate-200 dark:border-slate-700'
              }`}>
                {/* Card principal */}
                <div className={`px-5 py-4 flex items-center gap-4 cursor-pointer ${
                  isTop1 ? 'bg-amber-50 dark:bg-amber-900/20' :
                  isMe ? 'bg-primary-50 dark:bg-primary-900/20' : ''
                }`} onClick={() => isAdmin ? setExpandido(isExpanded ? null : eng.id) : null}>

                  {/* Posição */}
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 font-bold text-lg ${
                    posicao === 1 ? 'bg-amber-400 text-amber-900' :
                    posicao === 2 ? 'bg-slate-300 dark:bg-slate-600 text-slate-700 dark:text-slate-200' :
                    posicao === 3 ? 'bg-orange-300 text-orange-800' :
                    isMe ? 'bg-primary-200 dark:bg-primary-700 text-primary-800 dark:text-primary-200' :
                    isNegativo ? 'bg-red-200 text-red-700' :
                    'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                  }`}>
                    {posicao}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`font-bold text-sm ${isTop1 ? 'text-amber-900 dark:text-amber-300' : isMe ? 'text-primary-700 dark:text-primary-300' : isNegativo ? 'text-red-700 dark:text-red-400' : 'text-slate-800 dark:text-white'}`}>
                        {eng.nome} {isMe && <span className="text-[10px] font-medium text-primary-500 ml-1">(você)</span>}
                      </p>
                      {posicao === 1 && <span className="text-[10px] px-2 py-0.5 bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 rounded-full font-bold">+10% bônus</span>}
                      {posicao === 2 && <span className="text-[10px] px-2 py-0.5 bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-200 rounded-full font-bold">+5% bônus</span>}
                    </div>
                    <div className="flex gap-3 text-[10px] text-slate-400 mt-0.5">
                      <span className="flex items-center gap-0.5"><Building2 size={9}/> {eng.obras.length} obra(s) ativa(s)</span>
                      <span>Custo: {formatCurrency(eng.totalCusto)}</span>
                      <span>Faturamento: {formatCurrency(eng.totalFaturamento)}</span>
                    </div>
                  </div>

                  {/* Margem */}
                  <div className="text-right shrink-0">
                    <p className={`text-2xl font-bold ${
                      isNegativo ? 'text-red-600' :
                      eng.margemGlobal >= 50 ? 'text-emerald-600' :
                      eng.margemGlobal >= 30 ? 'text-amber-600' :
                      'text-slate-600 dark:text-slate-300'
                    }`}>
                      {eng.margemGlobal.toFixed(0)}%
                    </p>
                    <p className="text-[9px] text-slate-400">{isNegativo ? 'margem negativa' : 'margem global'}</p>
                  </div>

                  {isAdmin && (isExpanded ? <ChevronDown size={18} className="text-slate-400 shrink-0"/> : <ChevronRight size={18} className="text-slate-400 shrink-0"/>)}
                </div>

                {/* Detalhe expandido (admin only) */}
                {isExpanded && isAdmin && (
                  <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-4">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-700">
                            <th className="text-left py-2 px-3 font-semibold text-slate-500">Obra</th>
                            <th className="text-right py-2 px-3 font-semibold text-slate-500">Custo</th>
                            <th className="text-right py-2 px-3 font-semibold text-slate-500">Faturamento</th>
                            <th className="text-right py-2 px-3 font-semibold text-slate-500">Lucro</th>
                            <th className="text-right py-2 px-3 font-semibold text-slate-500">Margem</th>
                          </tr>
                        </thead>
                        <tbody>
                          {eng.obras.map(obra => {
                            const lucro = obra.faturamento - obra.custo
                            const margem = obra.faturamento > 0 ? (1 - obra.custo / obra.faturamento) * 100 : 0
                            return (
                              <tr key={obra.id} className="border-b border-slate-100 dark:border-slate-700/50">
                                <td className="py-2 px-3">
                                  <p className="font-medium text-slate-700 dark:text-slate-300">{obra.nome_obra}</p>
                                  <p className="text-[9px] text-slate-400">{obra.local_obra}</p>
                                </td>
                                <td className="py-2 px-3 text-right text-slate-600 dark:text-slate-400">{obra.custo > 0 ? formatCurrency(obra.custo) : '—'}</td>
                                <td className="py-2 px-3 text-right text-slate-600 dark:text-slate-400">{obra.faturamento > 0 ? formatCurrency(obra.faturamento) : '—'}</td>
                                <td className={`py-2 px-3 text-right font-bold ${lucro >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                  {obra.faturamento > 0 || obra.custo > 0 ? formatCurrency(lucro) : '—'}
                                </td>
                                <td className={`py-2 px-3 text-right font-bold ${margem >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                  {obra.faturamento > 0 ? `${margem.toFixed(0)}%` : '—'}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="bg-slate-200/50 dark:bg-slate-800 font-bold text-xs">
                            <td className="py-2 px-3 text-slate-700 dark:text-white">TOTAL</td>
                            <td className="py-2 px-3 text-right text-slate-700 dark:text-white">{formatCurrency(eng.totalCusto)}</td>
                            <td className="py-2 px-3 text-right text-slate-700 dark:text-white">{formatCurrency(eng.totalFaturamento)}</td>
                            <td className={`py-2 px-3 text-right ${eng.totalFaturamento - eng.totalCusto >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {formatCurrency(eng.totalFaturamento - eng.totalCusto)}
                            </td>
                            <td className={`py-2 px-3 text-right ${eng.margemGlobal >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {eng.margemGlobal.toFixed(0)}%
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </div>
              </div>
            )
          })}

          {!isAdmin && ranking.length > 3 && (
            <div className="text-center py-3">
              <p className="text-[10px] text-slate-400">Ranking completo visível apenas para administradores</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
