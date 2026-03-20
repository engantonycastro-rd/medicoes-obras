import { useEffect, useState } from 'react'
import {
  TrendingUp, Building2, DollarSign, Calendar, Loader2, FileSpreadsheet,
  BarChart3, User, Trophy, Lock, CheckCircle2, History, ChevronDown, ChevronRight,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { usePerfilStore } from '../lib/perfilStore'
import { supabase } from '../lib/supabase'

interface ObraAtiva { id: string; nome_obra: string; local_obra: string; contrato_id: string }
interface ObraFinanceiro { obra_id: string; custo: number; faturamento: number }
interface ServicoDiverso { id: string; titulo: string; tipo: string }
interface HistoricoItem {
  id: string; mes_referencia: string; producao_base: number; producao_final: number
  mario_papis_posicao: number | null; bonus_percentual: number; bonus_valor: number
  efetivado_em: string; qtd_obras_ativas: number; producao_obras: number; producao_servicos: number
  mario_papis_margem: number
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
  const mesRefStr = `${mesRef.getFullYear()}-${String(mesRef.getMonth() + 1).padStart(2, '0')}`
  const label = mesRef.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  return { ini, fim, mesRefStr, label }
}

function getMesRefFromDates(ini: string, fim: string): string {
  const d = new Date(fim + 'T12:00:00')
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function ProducaoPage() {
  const { perfilAtual } = usePerfilStore()
  const isAdmin = perfilAtual?.role === 'ADMIN' || perfilAtual?.role === 'SUPERADMIN'

  const ciclo = getCicloAtual()
  const [periodoIni, setPeriodoIni] = useState(ciclo.ini)
  const [periodoFim, setPeriodoFim] = useState(ciclo.fim)

  const [engenheiros, setEngenheiros] = useState<{ id: string; nome: string }[]>([])
  const [engenheiroId, setEngenheiroId] = useState(perfilAtual?.id || '')

  const [obras, setObras] = useState<ObraAtiva[]>([])
  const [financeiro, setFinanceiro] = useState<Record<string, ObraFinanceiro>>({})
  const [servicosDiversos, setServicosDiversos] = useState<ServicoDiverso[]>([])
  const [loading, setLoading] = useState(true)

  // MARIO PAPIS bonus
  const [marioPosicao, setMarioPosicao] = useState<number | null>(null)
  const [marioMargem, setMarioMargem] = useState(0)

  // Efetivação
  const [efetivando, setEfetivando] = useState(false)
  const [jaEfetivado, setJaEfetivado] = useState(false)

  // Histórico
  const [historico, setHistorico] = useState<HistoricoItem[]>([])
  const [showHistorico, setShowHistorico] = useState(false)

  const VALOR_POR_OBRA = 120
  const VALOR_ORCAMENTO = 50
  const VALOR_PROJETO = 100

  // Pode efetivar: dia >= 20 do mês do periodoFim
  const hoje = new Date()
  const podeEfetivar = isAdmin && hoje.getDate() >= 20 && !jaEfetivado

  useEffect(() => {
    if (isAdmin) {
      supabase.from('perfis').select('id, nome').in('role', ['ENGENHEIRO', 'ADMIN']).eq('ativo', true)
        .then(({ data }) => { if (data) setEngenheiros(data as any[]) })
    }
    if (perfilAtual?.id) setEngenheiroId(perfilAtual.id)
    fetchHistorico()
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

      // 2. Custo e faturamento via custos_erp
      const finMap: Record<string, ObraFinanceiro> = {}
      if (obrasAtivas.length > 0) {
        const obraIds = obrasAtivas.map(o => o.id)
        for (const o of obrasAtivas) finMap[o.id] = { obra_id: o.id, custo: 0, faturamento: 0 }
        const { data: custosData } = await supabase.from('custos_erp')
          .select('obra_id, tipo_lancamento, valor_liquido')
          .in('obra_id', obraIds)
          .gte('data_emissao', periodoIni).lte('data_emissao', periodoFim)
        if (custosData) {
          for (const row of custosData as any[]) {
            if (!finMap[row.obra_id]) continue
            if (row.tipo_lancamento === 'A_RECEBER') finMap[row.obra_id].faturamento += Number(row.valor_liquido) || 0
            else finMap[row.obra_id].custo += Number(row.valor_liquido) || 0
          }
        }
      }
      setFinanceiro(finMap)

      // 3. Serviços diversos
      const { data: orcData } = await supabase.from('orcamentos_revisao')
        .select('id, titulo, tipo')
        .eq('solicitante_id', engenheiroId).eq('status', 'CONCLUIDO')
        .gte('data_conclusao', periodoIni + 'T00:00:00').lte('data_conclusao', periodoFim + 'T23:59:59')
      setServicosDiversos((orcData || []) as ServicoDiverso[])

      // 4. MARIO PAPIS — calcula posição do engenheiro atual
      await fetchMarioPapis()

      // 5. Verifica se já foi efetivado
      const mesRef = getMesRefFromDates(periodoIni, periodoFim)
      const { data: efet } = await supabase.from('producao_historico')
        .select('id').eq('engenheiro_id', engenheiroId).eq('mes_referencia', mesRef).maybeSingle()
      setJaEfetivado(!!efet)
    } catch (err: any) { toast.error(err.message || 'Erro ao carregar') }
    setLoading(false)
  }

  async function fetchMarioPapis() {
    // Calcula ranking de todos os engenheiros para saber a posição deste
    const { data: engs } = await supabase.from('perfis').select('id').eq('role', 'ENGENHEIRO').eq('ativo', true)
    if (!engs) return
    const { data: obrasAll } = await supabase.from('obras').select('id, engenheiro_responsavel_id')
      .eq('status', 'ATIVA').not('engenheiro_responsavel_id', 'is', null)
    if (!obrasAll || obrasAll.length === 0) return
    const obraIds = obrasAll.map((o: any) => o.id)
    const { data: custosAll } = await supabase.from('custos_erp')
      .select('obra_id, tipo_lancamento, valor_liquido')
      .in('obra_id', obraIds).gte('data_emissao', periodoIni).lte('data_emissao', periodoFim)

    // Acumula custo/fat por OBRA
    const obraFin: Record<string, { custo: number; fat: number; engId: string }> = {}
    for (const o of obrasAll as any[]) obraFin[o.id] = { custo: 0, fat: 0, engId: o.engenheiro_responsavel_id }
    if (custosAll) {
      for (const r of custosAll as any[]) {
        if (!obraFin[r.obra_id]) continue
        if (r.tipo_lancamento === 'A_RECEBER') obraFin[r.obra_id].fat += Number(r.valor_liquido) || 0
        else obraFin[r.obra_id].custo += Number(r.valor_liquido) || 0
      }
    }

    // Calcula média das margens individuais por engenheiro
    const engMargens: Record<string, number[]> = {}
    for (const e of engs as any[]) engMargens[e.id] = []
    for (const [_, of_] of Object.entries(obraFin)) {
      if (of_.fat > 0 && engMargens[of_.engId]) {
        engMargens[of_.engId].push((1 - of_.custo / of_.fat) * 100)
      }
    }

    const ranked = Object.entries(engMargens)
      .filter(([_, ms]) => ms.length > 0)
      .map(([id, ms]) => ({ id, margem: ms.reduce((a, b) => a + b, 0) / ms.length }))
      .sort((a, b) => b.margem - a.margem)

    const pos = ranked.findIndex(r => r.id === engenheiroId)
    if (pos >= 0) {
      setMarioPosicao(pos + 1)
      setMarioMargem(ranked[pos].margem)
    } else {
      setMarioPosicao(null)
      setMarioMargem(0)
    }
  }

  async function fetchHistorico() {
    const engId = perfilAtual?.id || ''
    if (!engId) return
    if (isAdmin) {
      // Admin pode ver histórico do engenheiro selecionado — será re-fetched on engenheiroId change
    }
    const { data } = await supabase.from('producao_historico').select('*')
      .eq('engenheiro_id', engId).order('mes_referencia', { ascending: false }).limit(12)
    if (data) setHistorico(data as HistoricoItem[])
  }

  // Re-fetch histórico quando muda engenheiro (admin)
  useEffect(() => {
    if (engenheiroId) {
      supabase.from('producao_historico').select('*')
        .eq('engenheiro_id', engenheiroId).order('mes_referencia', { ascending: false }).limit(12)
        .then(({ data }) => { if (data) setHistorico(data as HistoricoItem[]) })
    }
  }, [engenheiroId])

  async function efetivarProducao() {
    if (!isAdmin || jaEfetivado) return
    if (!confirm('Efetivar a produção deste ciclo para TODOS os engenheiros?\n\nIsso vai salvar o snapshot de produção + ranking MARIO PAPIS e não pode ser desfeito.')) return
    setEfetivando(true)
    try {
      // Busca todos os engenheiros com obras ativas
      const { data: engs } = await supabase.from('perfis').select('id, nome').eq('role', 'ENGENHEIRO').eq('ativo', true)
      if (!engs || engs.length === 0) throw new Error('Nenhum engenheiro ativo')

      const { data: obrasAll } = await supabase.from('obras').select('id, engenheiro_responsavel_id')
        .eq('status', 'ATIVA').not('engenheiro_responsavel_id', 'is', null)
      const obraIds = (obrasAll || []).map((o: any) => o.id)

      // Custos
      const { data: custosAll } = await supabase.from('custos_erp')
        .select('obra_id, tipo_lancamento, valor_liquido')
        .in('obra_id', obraIds).gte('data_emissao', periodoIni).lte('data_emissao', periodoFim)

      const engTotals: Record<string, { qtdObras: number }> = {}
      for (const e of engs as any[]) engTotals[e.id] = { qtdObras: 0 }
      // Acumula custo/fat por OBRA
      const obraFin: Record<string, { custo: number; fat: number; engId: string }> = {}
      for (const o of (obrasAll || []) as any[]) {
        obraFin[o.id] = { custo: 0, fat: 0, engId: o.engenheiro_responsavel_id }
        if (engTotals[o.engenheiro_responsavel_id]) engTotals[o.engenheiro_responsavel_id].qtdObras++
      }
      if (custosAll) {
        for (const r of custosAll as any[]) {
          if (!obraFin[r.obra_id]) continue
          if (r.tipo_lancamento === 'A_RECEBER') obraFin[r.obra_id].fat += Number(r.valor_liquido) || 0
          else obraFin[r.obra_id].custo += Number(r.valor_liquido) || 0
        }
      }

      // Calcula média das margens individuais por engenheiro
      const engMargens: Record<string, number[]> = {}
      for (const e of engs as any[]) engMargens[e.id] = []
      for (const [_, of_] of Object.entries(obraFin)) {
        if (of_.fat > 0 && engMargens[of_.engId]) {
          engMargens[of_.engId].push((1 - of_.custo / of_.fat) * 100)
        }
      }

      // Ranking
      const ranked = Object.entries(engTotals)
        .filter(([_, v]) => v.qtdObras > 0)
        .map(([id, v]) => {
          const ms = engMargens[id] || []
          const margem = ms.length > 0 ? ms.reduce((a, b) => a + b, 0) / ms.length : 0
          return { id, margem, ...v }
        })
        .sort((a, b) => b.margem - a.margem)

      // Serviços diversos por engenheiro
      const { data: orcsAll } = await supabase.from('orcamentos_revisao')
        .select('solicitante_id, tipo').eq('status', 'CONCLUIDO')
        .gte('data_conclusao', periodoIni + 'T00:00:00').lte('data_conclusao', periodoFim + 'T23:59:59')
      const svcMap: Record<string, number> = {}
      if (orcsAll) {
        for (const o of orcsAll as any[]) {
          const val = o.tipo === 'PROJETO' ? VALOR_PROJETO : VALOR_ORCAMENTO
          svcMap[o.solicitante_id] = (svcMap[o.solicitante_id] || 0) + val
        }
      }

      const mesRef = getMesRefFromDates(periodoIni, periodoFim)
      const rows = []
      for (let i = 0; i < ranked.length; i++) {
        const r = ranked[i]
        const posicao = i + 1
        const prodObras = r.qtdObras * VALOR_POR_OBRA
        const prodServicos = svcMap[r.id] || 0
        const prodBase = prodObras + prodServicos
        const bonusPct = posicao === 1 ? 10 : posicao === 2 ? 5 : 0
        const bonusValor = prodBase * bonusPct / 100
        rows.push({
          mes_referencia: mesRef, engenheiro_id: r.id,
          qtd_obras_ativas: r.qtdObras, valor_por_obra: VALOR_POR_OBRA,
          producao_obras: prodObras, producao_servicos: prodServicos, producao_base: prodBase,
          mario_papis_posicao: posicao, mario_papis_margem: r.margem,
          bonus_percentual: bonusPct, bonus_valor: bonusValor,
          producao_final: prodBase + bonusValor,
          efetivado_por: perfilAtual!.id,
          periodo_inicio: periodoIni, periodo_fim: periodoFim,
        })
      }

      if (rows.length > 0) {
        const { error } = await supabase.from('producao_historico').upsert(rows, { onConflict: 'mes_referencia,engenheiro_id' })
        if (error) throw error
      }

      toast.success(`Produção efetivada para ${rows.length} engenheiro(s)!`)
      setJaEfetivado(true)
      fetchHistorico()
    } catch (err: any) { toast.error(err.message || 'Erro ao efetivar') }
    setEfetivando(false)
  }

  // Cálculos
  const qtdObras = obras.length
  const totalObras = qtdObras * VALOR_POR_OBRA
  const totalServicos = servicosDiversos.reduce((s, sv) => s + (sv.tipo === 'PROJETO' ? VALOR_PROJETO : VALOR_ORCAMENTO), 0)
  const producaoBase = totalObras + totalServicos
  const bonusPct = marioPosicao === 1 ? 10 : marioPosicao === 2 ? 5 : 0
  const bonusValor = producaoBase * bonusPct / 100
  const producaoFinal = producaoBase + bonusValor

  const totalCusto = Object.values(financeiro).reduce((s, r) => s + r.custo, 0)
  const totalFaturamento = Object.values(financeiro).reduce((s, r) => s + r.faturamento, 0)
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
          <p className="text-sm text-slate-400 mt-0.5">
            {isAdmin ? 'Visão administrativa — selecione o engenheiro' : `Produção de ${engNome}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && engenheiros.length > 0 && (
            <div className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-1.5">
              <User size={14} className="text-slate-400"/>
              <select value={engenheiroId} onChange={e => setEngenheiroId(e.target.value)}
                className="text-sm border-none outline-none bg-transparent dark:text-white">
                {engenheiros.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
              </select>
            </div>
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
          <div className="grid grid-cols-5 gap-3 mb-6">
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Building2 size={15} className="text-emerald-500"/>
                <span className="text-[10px] text-slate-400">Obras ativas</span>
              </div>
              <p className="text-xl font-bold text-slate-800 dark:text-white">{qtdObras}</p>
              <p className="text-[9px] text-slate-400">{formatCurrency(totalObras)}</p>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <FileSpreadsheet size={15} className="text-purple-500"/>
                <span className="text-[10px] text-slate-400">Serviços</span>
              </div>
              <p className="text-xl font-bold text-slate-800 dark:text-white">{formatCurrency(totalServicos)}</p>
              <p className="text-[9px] text-slate-400">{servicosDiversos.length} concluído(s)</p>
            </div>
            {marioPosicao && marioPosicao <= 2 ? (
              <div className="bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-300 dark:border-amber-600 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Trophy size={15} className="text-amber-500"/>
                  <span className="text-[10px] text-amber-700 dark:text-amber-400 font-semibold">MARIO PAPIS</span>
                </div>
                <p className="text-xl font-bold text-amber-700 dark:text-amber-300">+{bonusPct}%</p>
                <p className="text-[9px] text-amber-600 dark:text-amber-400">{marioPosicao}º lugar = {formatCurrency(bonusValor)}</p>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Trophy size={15} className="text-slate-400"/>
                  <span className="text-[10px] text-slate-400">MARIO PAPIS</span>
                </div>
                <p className="text-xl font-bold text-slate-400">0%</p>
                <p className="text-[9px] text-slate-400">{marioPosicao ? `${marioPosicao}º lugar` : 'Sem ranking'}</p>
              </div>
            )}
            <div className="bg-primary-50 dark:bg-primary-900/30 border-2 border-primary-300 dark:border-primary-600 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={15} className="text-primary-600"/>
                <span className="text-[10px] text-primary-600 font-semibold">TOTAL FINAL</span>
              </div>
              <p className="text-xl font-bold text-primary-700 dark:text-primary-400">{formatCurrency(producaoFinal)}</p>
              <p className="text-[9px] text-primary-500">base + bônus</p>
            </div>
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign size={15} className="text-blue-500"/>
                <span className="text-[10px] text-slate-400">Lucro período</span>
              </div>
              <p className={`text-xl font-bold ${totalLucro >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(totalLucro)}</p>
              <p className="text-[9px] text-slate-400">Margem: {totalFaturamento > 0 ? `${(100 - indiceGeral).toFixed(0)}%` : '—'}</p>
            </div>
          </div>

          {/* Botão efetivar */}
          {isAdmin && (
            <div className="flex items-center justify-between mb-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
              <div className="flex items-center gap-3">
                {jaEfetivado ? (
                  <><CheckCircle2 size={18} className="text-emerald-500"/>
                  <span className="text-sm font-medium text-emerald-600">Produção efetivada para este ciclo</span></>
                ) : (
                  <><Lock size={18} className={podeEfetivar ? 'text-primary-500' : 'text-slate-300'}/>
                  <span className="text-sm text-slate-500">{podeEfetivar ? 'Pronto para efetivar (dia 20+)' : `Liberado a partir do dia 20 (hoje: dia ${hoje.getDate()})`}</span></>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowHistorico(!showHistorico)}
                  className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">
                  <History size={13}/> Histórico
                </button>
                <button onClick={efetivarProducao} disabled={!podeEfetivar || efetivando}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white font-semibold rounded-lg text-sm disabled:opacity-40 disabled:cursor-not-allowed">
                  {efetivando ? <Loader2 size={14} className="animate-spin"/> : <CheckCircle2 size={14}/>}
                  Efetivar Produção
                </button>
              </div>
            </div>
          )}

          {/* Histórico */}
          {showHistorico && historico.length > 0 && (
            <div className="mb-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-700">
                <h3 className="font-bold text-slate-800 dark:text-white text-sm flex items-center gap-2"><History size={15}/> Produções Efetivadas</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                    <th className="text-left py-2 px-3 font-semibold text-slate-500">Mês</th>
                    <th className="text-right py-2 px-3 font-semibold text-slate-500">Obras</th>
                    <th className="text-right py-2 px-3 font-semibold text-slate-500">Base</th>
                    <th className="text-center py-2 px-3 font-semibold text-slate-500">MARIO PAPIS</th>
                    <th className="text-right py-2 px-3 font-semibold text-slate-500">Bônus</th>
                    <th className="text-right py-2 px-3 font-semibold text-slate-500 text-primary-600">Final</th>
                  </tr></thead>
                  <tbody>
                    {historico.map(h => {
                      const [ano, mes] = h.mes_referencia.split('-')
                      const mesLabel = new Date(Number(ano), Number(mes) - 1).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
                      return (
                        <tr key={h.id} className="border-b border-slate-100 dark:border-slate-700/50">
                          <td className="py-2 px-3 font-medium text-slate-700 dark:text-slate-300 capitalize">{mesLabel}</td>
                          <td className="py-2 px-3 text-right text-slate-500">{h.qtd_obras_ativas}</td>
                          <td className="py-2 px-3 text-right text-slate-600 dark:text-slate-400">{formatCurrency(h.producao_base)}</td>
                          <td className="py-2 px-3 text-center">
                            {h.mario_papis_posicao && (
                              <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                h.mario_papis_posicao === 1 ? 'bg-amber-100 text-amber-700' :
                                h.mario_papis_posicao === 2 ? 'bg-slate-200 text-slate-600' :
                                'bg-slate-100 text-slate-500'
                              }`}>
                                {h.mario_papis_posicao}º ({h.mario_papis_margem?.toFixed(0)}%)
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-right">
                            {h.bonus_percentual > 0 ? (
                              <span className="text-amber-600 font-bold">+{h.bonus_percentual}% ({formatCurrency(h.bonus_valor)})</span>
                            ) : <span className="text-slate-400">—</span>}
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-primary-600">{formatCurrency(h.producao_final)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Grid de obras */}
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden mb-6">
            <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 dark:text-white text-sm flex items-center gap-2">
                <Building2 size={15} className="text-slate-500"/> Obras — {engNome}
              </h3>
              <span className="text-[10px] px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg border border-blue-200 font-medium">
                Dados automáticos do Custos ERP
              </span>
            </div>
            {obras.length === 0 ? (
              <div className="p-12 text-center">
                <Building2 size={32} className="mx-auto text-slate-300 mb-2"/>
                <p className="text-sm text-slate-400">Nenhuma obra ativa designada</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr className="bg-slate-800 text-white text-xs">
                    <th className="text-left py-3 px-4 font-semibold">Obra</th>
                    <th className="text-right py-3 px-4 font-semibold">Custo</th>
                    <th className="text-right py-3 px-4 font-semibold">Faturamento</th>
                    <th className="text-right py-3 px-4 font-semibold">Lucro</th>
                    <th className="text-right py-3 px-4 font-semibold">Margem</th>
                  </tr></thead>
                  <tbody>
                    {obras.map((obra, idx) => {
                      const fin = financeiro[obra.id] || { custo: 0, faturamento: 0 }
                      const lucro = fin.faturamento - fin.custo
                      const margem = fin.faturamento > 0 ? (1 - fin.custo / fin.faturamento) * 100 : 0
                      return (
                        <tr key={obra.id} className={`border-b border-slate-100 dark:border-slate-700/50 ${idx % 2 === 0 ? 'bg-slate-50/50 dark:bg-slate-900/30' : ''}`}>
                          <td className="py-3 px-4">
                            <p className="text-sm font-semibold text-slate-800 dark:text-white">{obra.nome_obra}</p>
                            <p className="text-[10px] text-slate-400">{obra.local_obra}</p>
                          </td>
                          <td className="py-3 px-4 text-right text-sm text-slate-700 dark:text-slate-300">{fin.custo > 0 ? formatCurrency(fin.custo) : <span className="text-slate-300">—</span>}</td>
                          <td className="py-3 px-4 text-right text-sm text-slate-700 dark:text-slate-300">{fin.faturamento > 0 ? formatCurrency(fin.faturamento) : <span className="text-slate-300">—</span>}</td>
                          <td className={`py-3 px-4 text-right text-sm font-bold ${lucro > 0 ? 'text-emerald-600' : lucro < 0 ? 'text-red-600' : 'text-slate-300'}`}>
                            {fin.faturamento > 0 || fin.custo > 0 ? formatCurrency(lucro) : '—'}
                          </td>
                          <td className={`py-3 px-4 text-right text-sm font-bold ${margem > 0 ? 'text-emerald-600' : margem < 0 ? 'text-red-600' : 'text-slate-300'}`}>
                            {fin.faturamento > 0 ? `${margem.toFixed(0)}%` : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  {(totalCusto > 0 || totalFaturamento > 0) && (
                    <tfoot><tr className="bg-slate-800 text-white text-sm font-bold">
                      <td className="py-3 px-4">TOTAIS</td>
                      <td className="py-3 px-4 text-right">{formatCurrency(totalCusto)}</td>
                      <td className="py-3 px-4 text-right">{formatCurrency(totalFaturamento)}</td>
                      <td className={`py-3 px-4 text-right ${totalLucro >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatCurrency(totalLucro)}</td>
                      <td className="py-3 px-4 text-right">{totalFaturamento > 0 ? `${(100 - indiceGeral).toFixed(0)}%` : '—'}</td>
                    </tr></tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
