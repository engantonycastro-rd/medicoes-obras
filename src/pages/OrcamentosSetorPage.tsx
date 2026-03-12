import { useEffect, useState, useMemo } from 'react'
import {
  FileSpreadsheet, Clock, Eye, CheckCircle2, Download, RefreshCw, Play, X,
  Loader2, User, Calendar, Send, Plus, Minus, Edit3, Trash2, TrendingDown,
  TrendingUp, BarChart3, FileDown, Filter,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { usePerfilStore } from '../lib/perfilStore'
import { formatDate, formatCurrency } from '../utils/calculations'
import { supabase } from '../lib/supabase'
import { compararOrcamentos, ComparativoResult } from '../utils/compararOrcamentos'

interface OrcRevisao {
  id: string; created_at: string; updated_at: string; titulo: string; descricao: string | null
  prazo_retorno: string; urgencia: string; status: string; ordem_atendimento: number
  solicitante_id: string; obra_id: string | null; contrato_id: string | null
  arquivo_original_url: string | null; arquivo_original_nome: string | null; arquivo_original_size: number | null
  arquivo_revisado_url: string | null; arquivo_revisado_nome: string | null; arquivo_revisado_size: number | null
  revisor_id: string | null; data_inicio_revisao: string | null; data_conclusao: string | null
  observacoes_revisor: string | null; comparativo_resumo: any[]
  arquivos_complementares: { nome: string; path: string; size: number }[]
  valor_original: number; valor_revisado: number; diferenca_valor: number; diferenca_percentual: number
  qtd_alteracoes: number
}

interface Perfil { id: string; nome: string | null; email: string }

const URG: Record<string, { label: string; color: string; ordem: number }> = {
  URGENTE: { label: 'Urgente', color: 'bg-red-100 text-red-700', ordem: 0 },
  ALTA:    { label: 'Alta', color: 'bg-amber-100 text-amber-700', ordem: 1 },
  NORMAL:  { label: 'Normal', color: 'bg-blue-100 text-blue-700', ordem: 2 },
  BAIXA:   { label: 'Baixa', color: 'bg-slate-100 text-slate-600', ordem: 3 },
}

export function OrcamentosSetorPage() {
  const { perfilAtual } = usePerfilStore()
  const [orcamentos, setOrcamentos] = useState<OrcRevisao[]>([])
  const [perfis, setPerfis] = useState<Record<string, Perfil>>({})
  const [loading, setLoading] = useState(true)
  const [abaAtiva, setAbaAtiva] = useState<'PENDENTE' | 'EM_REVISAO' | 'CONCLUIDO' | 'RELATORIO'>('PENDENTE')

  const [concluindoId, setConcluindoId] = useState<string | null>(null)
  const [cObs, setCObs] = useState(''); const [cArquivo, setCArquivo] = useState<File | null>(null)
  const [cComparativo, setCComparativo] = useState<string[]>([''])
  const [cValorOrig, setCValorOrig] = useState(''); const [cValorRev, setCValorRev] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [comparando, setComparando] = useState(false)
  const [autoComp, setAutoComp] = useState<ComparativoResult | null>(null)

  // Relatório
  const [relDataInicio, setRelDataInicio] = useState(''); const [relDataFim, setRelDataFim] = useState('')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data } = await supabase.from('orcamentos_revisao').select('*').order('ordem_atendimento')
    if (data) {
      setOrcamentos(data as OrcRevisao[])
      const ids = new Set(data.map((o: any) => o.solicitante_id).concat(data.map((o: any) => o.revisor_id).filter(Boolean)))
      if (ids.size > 0) {
        const { data: pData } = await supabase.from('perfis').select('id, nome, email').in('id', [...ids])
        if (pData) { const m: Record<string, Perfil> = {}; pData.forEach((p: any) => { m[p.id] = p }); setPerfis(m) }
      }
    }
    setLoading(false)
  }

  async function pegarParaRevisao(orc: OrcRevisao) {
    const { error } = await supabase.from('orcamentos_revisao').update({ status: 'EM_REVISAO', revisor_id: perfilAtual!.id, data_inicio_revisao: new Date().toISOString() }).eq('id', orc.id)
    if (error) { toast.error(error.message); return }
    try { await supabase.rpc('criar_notificacao', { p_user_id: orc.solicitante_id, p_tipo: 'info', p_titulo: `Orçamento em revisão: ${orc.titulo}`, p_mensagem: `${perfilAtual!.nome || 'Setor de orçamentos'} iniciou a revisão.`, p_link: '/orcamentos' }) } catch {}
    toast.success('Em revisão!'); fetchAll()
  }

  async function handleArquivoRevisado(file: File) {
    setCArquivo(file); setAutoComp(null)
    const orc = orcamentos.find(o => o.id === concluindoId)
    if (!orc?.arquivo_original_url || !orc.arquivo_original_nome) return
    if (!(orc.arquivo_original_nome.match(/\.(xlsx?|pdf)$/i) && file.name.match(/\.(xlsx?|pdf)$/i))) {
      toast('Comparação automática para Excel e PDF', { icon: 'ℹ️' }); return
    }
    setComparando(true)
    try {
      const { data: origBlob, error } = await supabase.storage.from('orcamentos').download(orc.arquivo_original_url)
      if (error || !origBlob) throw new Error('Erro ao baixar original')
      const resultado = await compararOrcamentos(await origBlob.arrayBuffer(), await file.arrayBuffer(), orc.arquivo_original_nome, file.name)
      setAutoComp(resultado)
      if (resultado.alteracoes.length > 0) {
        setCComparativo(resultado.alteracoes.map(a => `${a.tipo === 'ADICIONADO' ? '✚' : a.tipo === 'REMOVIDO' ? '✖' : '✎'} ${a.descricao}${a.detalhes ? ' — ' + a.detalhes : ''}`))
      }
      toast.success(`Comparativo (${resultado.modo === 'EXCEL' ? 'célula por célula' : 'texto PDF'}): ${resultado.alteracoes.length} diferença(s)`)
    } catch (err: any) { console.warn(err); toast('Comparação falhou — preencha manualmente', { icon: 'ℹ️' }) }
    setComparando(false)
  }

  async function concluirRevisao() {
    if (!concluindoId || !cArquivo) { toast.error('Anexe o revisado'); return }
    const orc = orcamentos.find(o => o.id === concluindoId); if (!orc) return
    setEnviando(true)
    try {
      const path = `revisados/${Date.now()}_${cArquivo.name}`
      const { error: upErr } = await supabase.storage.from('orcamentos').upload(path, cArquivo)
      if (upErr) throw upErr
      const comparativo = cComparativo.filter(c => c.trim()).map(c => ({ descricao: c.trim() }))
      const vO = Number(cValorOrig.replace(/[^\d.,]/g, '').replace(',', '.')) || 0
      const vR = Number(cValorRev.replace(/[^\d.,]/g, '').replace(',', '.')) || 0
      const diff = vR - vO; const diffPct = vO > 0 ? (diff / vO) * 100 : 0
      const { error } = await supabase.from('orcamentos_revisao').update({
        status: 'CONCLUIDO', data_conclusao: new Date().toISOString(),
        arquivo_revisado_url: path, arquivo_revisado_nome: cArquivo.name, arquivo_revisado_size: cArquivo.size,
        observacoes_revisor: cObs || null, comparativo_resumo: comparativo,
        valor_original: vO, valor_revisado: vR, diferenca_valor: diff, diferenca_percentual: diffPct,
        qtd_alteracoes: comparativo.length,
      }).eq('id', concluindoId)
      if (error) throw error
      try { await supabase.rpc('criar_notificacao', { p_user_id: orc.solicitante_id, p_tipo: 'sucesso', p_titulo: `Revisão concluída: ${orc.titulo}`, p_mensagem: `${comparativo.length} alteração(ões). ${vO > 0 ? `Valor: ${formatCurrency(vO)} → ${formatCurrency(vR)} (${diffPct > 0 ? '+' : ''}${diffPct.toFixed(1)}%)` : ''}`, p_link: '/orcamentos' }) } catch {}
      toast.success('Revisão concluída!')
      setConcluindoId(null); setCObs(''); setCArquivo(null); setCComparativo(['']); setAutoComp(null); setCValorOrig(''); setCValorRev('')
      fetchAll()
    } catch (err: any) { toast.error(err.message) }
    setEnviando(false)
  }

  async function deletarOrcamento(orc: OrcRevisao) {
    if (!confirm(`Excluir "${orc.titulo}"?`)) return
    try {
      if (orc.arquivo_original_url) await supabase.storage.from('orcamentos').remove([orc.arquivo_original_url])
      if (orc.arquivo_revisado_url) await supabase.storage.from('orcamentos').remove([orc.arquivo_revisado_url])
      if (orc.arquivos_complementares?.length) await supabase.storage.from('orcamentos').remove(orc.arquivos_complementares.map(a => a.path))
      await supabase.from('orcamentos_revisao').delete().eq('id', orc.id)
      setOrcamentos(p => p.filter(o => o.id !== orc.id)); toast.success('Excluído!')
    } catch (err: any) { toast.error(err.message) }
  }

  async function downloadArquivo(path: string, nome: string) {
    const { data, error } = await supabase.storage.from('orcamentos').download(path)
    if (error || !data) { toast.error('Erro ao baixar'); return }
    const url = URL.createObjectURL(data); const a = document.createElement('a'); a.href = url; a.download = nome; a.click(); URL.revokeObjectURL(url)
  }

  const diasAte = (d: string) => Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)
  const nome = (id: string | null) => id ? (perfis[id]?.nome || perfis[id]?.email || '—') : '—'

  const pendentes = useMemo(() => orcamentos.filter(o => o.status === 'PENDENTE').sort((a, b) => (URG[a.urgencia]?.ordem ?? 9) - (URG[b.urgencia]?.ordem ?? 9) || a.ordem_atendimento - b.ordem_atendimento), [orcamentos])
  const emRevisao = useMemo(() => orcamentos.filter(o => o.status === 'EM_REVISAO'), [orcamentos])
  const concluidos = useMemo(() => orcamentos.filter(o => o.status === 'CONCLUIDO').sort((a, b) => new Date(b.data_conclusao || 0).getTime() - new Date(a.data_conclusao || 0).getTime()), [orcamentos])

  // Relatório
  const relConcluidos = useMemo(() => {
    let list = concluidos
    if (relDataInicio) list = list.filter(o => (o.data_conclusao || '') >= relDataInicio)
    if (relDataFim) list = list.filter(o => (o.data_conclusao || '') <= relDataFim + 'T23:59:59')
    return list
  }, [concluidos, relDataInicio, relDataFim])

  const relStats = useMemo(() => {
    const total = relConcluidos.length
    const economiaTotal = relConcluidos.filter(o => o.diferenca_valor < 0).reduce((s, o) => s + Math.abs(o.diferenca_valor), 0)
    const aumentoTotal = relConcluidos.filter(o => o.diferenca_valor > 0).reduce((s, o) => s + o.diferenca_valor, 0)
    const valorOrigTotal = relConcluidos.reduce((s, o) => s + (o.valor_original || 0), 0)
    const valorRevTotal = relConcluidos.reduce((s, o) => s + (o.valor_revisado || 0), 0)
    const alteracoesTotal = relConcluidos.reduce((s, o) => s + (o.qtd_alteracoes || 0), 0)
    return { total, economiaTotal, aumentoTotal, valorOrigTotal, valorRevTotal, alteracoesTotal, impacto: valorOrigTotal - valorRevTotal }
  }, [relConcluidos])

  const lista = abaAtiva === 'PENDENTE' ? pendentes : abaAtiva === 'EM_REVISAO' ? emRevisao : abaAtiva === 'CONCLUIDO' ? concluidos : []

  return (
    <div className="p-6 max-w-6xl overflow-y-auto" style={{ height: '100%' }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Setor de Orçamentos</h1>
          <p className="text-sm text-slate-500">Gerenciamento de revisões de orçamentos</p>
        </div>
        <button onClick={fetchAll} className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm hover:bg-slate-50"><RefreshCw size={14}/> Atualizar</button>
      </div>

      {/* Abas */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { key: 'PENDENTE', label: 'Na fila', val: pendentes.length, color: 'from-amber-500 to-amber-600', icon: Clock, alert: pendentes.filter(p => diasAte(p.prazo_retorno) <= 2).length },
          { key: 'EM_REVISAO', label: 'Em revisão', val: emRevisao.length, color: 'from-blue-500 to-blue-600', icon: Eye },
          { key: 'CONCLUIDO', label: 'Concluídos', val: concluidos.length, color: 'from-emerald-500 to-emerald-600', icon: CheckCircle2 },
          { key: 'RELATORIO', label: 'Relatórios', val: null, color: 'from-purple-500 to-purple-600', icon: BarChart3 },
        ].map(({ key, label, val, color, icon: Icon, alert }) => (
          <button key={key} onClick={() => setAbaAtiva(key as any)}
            className={`bg-white rounded-xl border-2 p-4 text-left transition-all ${abaAtiva === key ? 'border-amber-400 shadow-md' : 'border-slate-200 hover:border-slate-300'}`}>
            <div className="flex items-center justify-between">
              <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center shadow-sm`}><Icon size={18} className="text-white"/></div>
              {alert && alert > 0 && <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full font-bold">{alert} urg.</span>}
            </div>
            {val !== null ? <p className="text-2xl font-bold text-slate-800 mt-2">{val}</p> : <p className="text-sm font-bold text-slate-800 mt-2">Gerar</p>}
            <p className="text-[11px] text-slate-500">{label}</p>
          </button>
        ))}
      </div>

      {/* ═══ ABA RELATÓRIO ═══ */}
      {abaAtiva === 'RELATORIO' && (
        <div>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <Filter size={14} className="text-slate-400"/>
            <span className="text-xs text-slate-500">Período:</span>
            <input type="date" value={relDataInicio} onChange={e => setRelDataInicio(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white"/>
            <span className="text-xs text-slate-400">até</span>
            <input type="date" value={relDataFim} onChange={e => setRelDataFim(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white"/>
            {(relDataInicio || relDataFim) && <button onClick={() => { setRelDataInicio(''); setRelDataFim('') }} className="text-[10px] text-amber-600 hover:underline">Limpar</button>}
          </div>

          {/* Dashboard */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-[10px] text-slate-400 uppercase font-semibold">Revisões Concluídas</p>
              <p className="text-2xl font-bold text-slate-800">{relStats.total}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-[10px] text-slate-400 uppercase font-semibold">Total Alterações</p>
              <p className="text-2xl font-bold text-slate-800">{relStats.alteracoesTotal}</p>
            </div>
            <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4">
              <p className="text-[10px] text-emerald-600 uppercase font-semibold flex items-center gap-1"><TrendingDown size={10}/> Economia Gerada</p>
              <p className="text-2xl font-bold text-emerald-700">{formatCurrency(relStats.economiaTotal)}</p>
            </div>
            <div className={`rounded-xl border p-4 ${relStats.impacto > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
              <p className="text-[10px] uppercase font-semibold" style={{ color: relStats.impacto > 0 ? '#047857' : '#b91c1c' }}>Impacto do Setor</p>
              <p className={`text-2xl font-bold ${relStats.impacto > 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatCurrency(Math.abs(relStats.impacto))}</p>
              <p className="text-[10px] text-slate-400">{relStats.impacto > 0 ? 'redução nos orçamentos' : 'aumento nos orçamentos'}</p>
            </div>
          </div>

          {/* Barras por orçamento */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
            <p className="text-sm font-bold text-slate-700 mb-4">Comparativo por Orçamento</p>
            {relConcluidos.length === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center">Nenhum orçamento concluído no período</p>
            ) : (
              <div className="space-y-3">
                {relConcluidos.map(orc => {
                  const maxVal = Math.max(orc.valor_original, orc.valor_revisado, 1)
                  return (
                    <div key={orc.id} className="text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-slate-700 truncate max-w-xs">{orc.titulo}</span>
                        <span className={`font-bold ${orc.diferenca_valor < 0 ? 'text-emerald-600' : orc.diferenca_valor > 0 ? 'text-red-600' : 'text-slate-500'}`}>
                          {orc.diferenca_valor < 0 ? '−' : orc.diferenca_valor > 0 ? '+' : ''}{formatCurrency(Math.abs(orc.diferenca_valor))} ({Math.abs(orc.diferenca_percentual).toFixed(1)}%)
                        </span>
                      </div>
                      <div className="flex gap-1 items-center">
                        <span className="text-[9px] text-slate-400 w-16 text-right shrink-0">Original</span>
                        <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
                          <div className="bg-slate-400 h-full rounded-full transition-all" style={{ width: `${(orc.valor_original / maxVal) * 100}%` }}/>
                        </div>
                        <span className="text-[9px] text-slate-500 w-24 text-right">{formatCurrency(orc.valor_original)}</span>
                      </div>
                      <div className="flex gap-1 items-center mt-0.5">
                        <span className="text-[9px] text-slate-400 w-16 text-right shrink-0">Revisado</span>
                        <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${orc.diferenca_valor <= 0 ? 'bg-emerald-500' : 'bg-red-400'}`} style={{ width: `${(orc.valor_revisado / maxVal) * 100}%` }}/>
                        </div>
                        <span className="text-[9px] text-slate-500 w-24 text-right">{formatCurrency(orc.valor_revisado)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Tabela detalhada */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-xs">
              <thead><tr className="bg-slate-50 text-slate-500">
                <th className="px-3 py-2 text-left font-semibold">Orçamento</th>
                <th className="px-3 py-2 text-left font-semibold">Solicitante</th>
                <th className="px-3 py-2 text-left font-semibold">Revisor</th>
                <th className="px-3 py-2 text-right font-semibold">Original</th>
                <th className="px-3 py-2 text-right font-semibold">Revisado</th>
                <th className="px-3 py-2 text-right font-semibold">Diferença</th>
                <th className="px-3 py-2 text-center font-semibold">Alter.</th>
                <th className="px-3 py-2 text-left font-semibold">Concluído</th>
              </tr></thead>
              <tbody>
                {relConcluidos.map(o => (
                  <tr key={o.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-3 py-2 font-medium text-slate-700 max-w-40 truncate">{o.titulo}</td>
                    <td className="px-3 py-2 text-slate-500">{nome(o.solicitante_id)}</td>
                    <td className="px-3 py-2 text-slate-500">{nome(o.revisor_id)}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{formatCurrency(o.valor_original)}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{formatCurrency(o.valor_revisado)}</td>
                    <td className={`px-3 py-2 text-right font-bold ${o.diferenca_valor < 0 ? 'text-emerald-600' : o.diferenca_valor > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                      {o.diferenca_valor < 0 ? '−' : o.diferenca_valor > 0 ? '+' : ''}{formatCurrency(Math.abs(o.diferenca_valor))}
                    </td>
                    <td className="px-3 py-2 text-center">{o.qtd_alteracoes}</td>
                    <td className="px-3 py-2 text-slate-500">{o.data_conclusao ? formatDate(o.data_conclusao) : '—'}</td>
                  </tr>
                ))}
                {relConcluidos.length > 0 && (
                  <tr className="bg-slate-50 font-bold">
                    <td className="px-3 py-2" colSpan={3}>TOTAL ({relConcluidos.length} orçamentos)</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(relStats.valorOrigTotal)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(relStats.valorRevTotal)}</td>
                    <td className={`px-3 py-2 text-right ${relStats.impacto > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {relStats.impacto > 0 ? '−' : '+'}{formatCurrency(Math.abs(relStats.impacto))}
                    </td>
                    <td className="px-3 py-2 text-center">{relStats.alteracoesTotal}</td>
                    <td/>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ LISTA (pendentes, em revisão, concluídos) ═══ */}
      {abaAtiva !== 'RELATORIO' && (
        <>
          {lista.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl text-slate-400">
              Nenhum orçamento {abaAtiva === 'PENDENTE' ? 'na fila' : abaAtiva === 'EM_REVISAO' ? 'em revisão' : 'concluído'}
            </div>
          ) : (
            <div className="space-y-3">
              {lista.map(orc => {
                const urg = URG[orc.urgencia] || URG.NORMAL
                const dias = diasAte(orc.prazo_retorno)
                const meuRevisor = orc.revisor_id === perfilAtual?.id
                return (
                  <div key={orc.id} className={`bg-white border rounded-xl p-5 ${dias <= 1 && orc.status !== 'CONCLUIDO' ? 'border-red-300' : dias <= 3 && orc.status !== 'CONCLUIDO' ? 'border-amber-200' : 'border-slate-200'}`}>
                    <div className="flex items-start gap-4">
                      <div className="text-center shrink-0">
                        <p className="text-[10px] text-slate-400 font-semibold">FILA</p>
                        <p className="text-lg font-bold text-slate-800">#{orc.ordem_atendimento}</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="font-bold text-slate-800 text-sm">{orc.titulo}</h3>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${urg.color}`}>{urg.label}</span>
                          {orc.status !== 'CONCLUIDO' && (
                            <span className={`text-[10px] font-bold flex items-center gap-1 ${dias < 0 ? 'text-red-600' : dias <= 1 ? 'text-red-500' : dias <= 3 ? 'text-amber-600' : 'text-slate-400'}`}>
                              <Calendar size={10}/> {dias < 0 ? `${Math.abs(dias)}d ATRASADO` : dias === 0 ? 'VENCE HOJE' : `${dias}d`}
                            </span>
                          )}
                        </div>
                        {orc.descricao && <p className="text-xs text-slate-500 mb-1">{orc.descricao}</p>}
                        <div className="flex gap-4 text-[10px] text-slate-400 flex-wrap">
                          <span className="flex items-center gap-1"><User size={9}/> {nome(orc.solicitante_id)}</span>
                          <span>Prazo: {formatDate(orc.prazo_retorno)}</span>
                          {orc.arquivo_original_nome && <span className="flex items-center gap-1"><FileSpreadsheet size={9}/> {orc.arquivo_original_nome}</span>}
                          {orc.revisor_id && <span className="text-blue-600 font-medium">Revisor: {nome(orc.revisor_id)}</span>}
                        </div>

                        {/* Complementares */}
                        {orc.arquivos_complementares && orc.arquivos_complementares.length > 0 && (
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <span className="text-[10px] text-slate-400 font-semibold">📎 Complementares:</span>
                            {orc.arquivos_complementares.map((ac, i) => (
                              <button key={i} onClick={() => downloadArquivo(ac.path, ac.nome)}
                                className="text-[10px] px-2 py-0.5 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-600 flex items-center gap-1">
                                <Download size={8}/> {ac.nome}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Concluído — comparativo visual */}
                        {orc.status === 'CONCLUIDO' && (
                          <div className="mt-3 bg-gradient-to-r from-emerald-50 to-white border border-emerald-200 rounded-xl p-4">
                            {(orc.valor_original > 0 || orc.valor_revisado > 0) && (
                              <div className="flex items-center gap-4 mb-3 text-xs">
                                <span className="text-slate-600">{formatCurrency(orc.valor_original)}</span>
                                <span className="text-slate-400">→</span>
                                <span className="text-slate-800 font-bold">{formatCurrency(orc.valor_revisado)}</span>
                                <span className={`font-bold px-2 py-0.5 rounded-full ${orc.diferenca_valor < 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                  {orc.diferenca_valor < 0 ? '−' : '+'}{formatCurrency(Math.abs(orc.diferenca_valor))} ({Math.abs(orc.diferenca_percentual).toFixed(1)}%)
                                </span>
                              </div>
                            )}
                            {orc.observacoes_revisor && <p className="text-xs text-emerald-700 italic mb-2">"{orc.observacoes_revisor}"</p>}
                            {orc.comparativo_resumo?.length > 0 && (
                              <details className="group">
                                <summary className="text-[10px] font-semibold text-emerald-600 cursor-pointer hover:underline">{orc.qtd_alteracoes || orc.comparativo_resumo.length} alteração(ões) — clique para expandir</summary>
                                <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                                  {orc.comparativo_resumo.map((item: any, i: number) => {
                                    const d = item.descricao || item
                                    const isA = String(d).startsWith('✚'), isR = String(d).startsWith('✖'), isE = String(d).startsWith('✎')
                                    return (
                                      <div key={i} className={`flex items-start gap-2 px-2 py-1 rounded text-[10px] ${isR ? 'bg-red-50' : isA ? 'bg-emerald-50' : isE ? 'bg-amber-50' : 'bg-slate-50'}`}>
                                        <span className={`shrink-0 font-bold ${isR ? 'text-red-500' : isA ? 'text-emerald-500' : 'text-amber-500'}`}>{isR ? '−' : isA ? '+' : '~'}</span>
                                        <span className="text-slate-600">{String(d).replace(/^[✚✖✎]\s*/, '')}</span>
                                      </div>
                                    )
                                  })}
                                </div>
                              </details>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {orc.arquivo_original_url && (
                          <button onClick={() => downloadArquivo(orc.arquivo_original_url!, orc.arquivo_original_nome || 'original')} className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50" title="Original"><Download size={16}/></button>
                        )}
                        {orc.arquivo_revisado_url && (
                          <button onClick={() => downloadArquivo(orc.arquivo_revisado_url!, orc.arquivo_revisado_nome || 'revisado')} className="p-2 rounded-lg text-emerald-400 hover:text-emerald-600 hover:bg-emerald-50" title="Revisado"><Download size={16}/></button>
                        )}
                        {orc.status === 'PENDENTE' && (
                          <button onClick={() => pegarParaRevisao(orc)} className="flex items-center gap-1.5 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded-lg"><Play size={12}/> Pegar</button>
                        )}
                        {orc.status === 'EM_REVISAO' && meuRevisor && (
                          <button onClick={() => { setConcluindoId(orc.id); setCObs(''); setCArquivo(null); setCComparativo(['']); setAutoComp(null); setCValorOrig(''); setCValorRev('') }}
                            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium rounded-lg"><CheckCircle2 size={12}/> Concluir</button>
                        )}
                        <button onClick={() => deletarOrcamento(orc)} className="p-2 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50" title="Excluir"><Trash2 size={15}/></button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ═══ MODAL CONCLUSÃO ═══ */}
      {concluindoId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setConcluindoId(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-100">
              <h2 className="font-bold text-slate-800 flex items-center gap-2"><CheckCircle2 size={18} className="text-emerald-500"/> Concluir Revisão</h2>
              <p className="text-xs text-slate-500 mt-1">{orcamentos.find(o => o.id === concluindoId)?.titulo}</p>
            </div>
            <div className="p-5 space-y-4">
              <div><label className="text-xs font-semibold text-slate-600 block mb-1">Arquivo revisado *</label>
                <input type="file" accept=".xlsx,.xls,.pdf,.ods" onChange={e => { const f = e.target.files?.[0]; if (f) handleArquivoRevisado(f) }} className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white"/>
                {cArquivo && <p className="text-[10px] text-slate-500 mt-1">{cArquivo.name} ({(cArquivo.size/1024).toFixed(0)} KB)</p>}
                {comparando && <div className="flex items-center gap-2 mt-2 text-xs text-blue-600"><Loader2 size={12} className="animate-spin"/> Comparando...</div>}
              </div>

              {/* Valores do orçamento */}
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                <p className="text-xs font-bold text-purple-800 mb-2">Valores do Orçamento (para relatório de impacto)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-[10px] font-semibold text-slate-600 block mb-1">Valor Original (R$)</label>
                    <input value={cValorOrig} onChange={e => setCValorOrig(e.target.value)} placeholder="Ex: 250000.00" className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm"/>
                  </div>
                  <div><label className="text-[10px] font-semibold text-slate-600 block mb-1">Valor Revisado (R$)</label>
                    <input value={cValorRev} onChange={e => setCValorRev(e.target.value)} placeholder="Ex: 235000.00" className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm"/>
                  </div>
                </div>
                {cValorOrig && cValorRev && (() => {
                  const vO = Number(cValorOrig.replace(/[^\d.,]/g, '').replace(',', '.')) || 0
                  const vR = Number(cValorRev.replace(/[^\d.,]/g, '').replace(',', '.')) || 0
                  const d = vR - vO; const p = vO > 0 ? (d / vO * 100) : 0
                  return d !== 0 ? (
                    <p className={`text-xs font-bold mt-2 ${d < 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {d < 0 ? '↓ Economia' : '↑ Aumento'}: {formatCurrency(Math.abs(d))} ({Math.abs(p).toFixed(1)}%)
                    </p>
                  ) : null
                })()}
              </div>

              {autoComp && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <p className="text-xs font-bold text-blue-800 mb-2">Comparativo Automático <span className="font-normal text-blue-500">({autoComp.modo === 'EXCEL' ? 'célula por célula' : 'texto PDF'})</span></p>
                  <div className="flex gap-3 text-xs mb-2">
                    <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium"><Minus size={10} className="inline"/> {autoComp.resumo.removidos} removido(s)</span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium"><Edit3 size={10} className="inline"/> {autoComp.resumo.alterados} alterado(s)</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium"><Plus size={10} className="inline"/> {autoComp.resumo.adicionados} adicionado(s)</span>
                  </div>
                </div>
              )}

              <div><label className="text-xs font-semibold text-slate-600 block mb-1">Alterações {autoComp ? '(auto-detectadas — edite se necessário)' : '(manual)'}</label>
                <div className="max-h-48 overflow-y-auto space-y-1.5">
                  {cComparativo.map((item, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-[10px] text-slate-400 shrink-0 mt-2">{i+1}.</span>
                      <input value={item} onChange={e => { const n = [...cComparativo]; n[i] = e.target.value; setCComparativo(n) }} placeholder="Ex: Corrigido quantitativo item 3.2.1"
                        className={`flex-1 border rounded-lg px-3 py-1.5 text-xs ${item.startsWith('✖')?'border-red-200 bg-red-50/50':item.startsWith('✚')?'border-emerald-200 bg-emerald-50/50':item.startsWith('✎')?'border-amber-200 bg-amber-50/50':'border-slate-200'}`}/>
                      {cComparativo.length > 1 && <button onClick={() => setCComparativo(cComparativo.filter((_, j) => j !== i))} className="p-1 text-slate-300 hover:text-red-500 mt-1"><Minus size={12}/></button>}
                    </div>
                  ))}
                </div>
                <button onClick={() => setCComparativo([...cComparativo, ''])} className="flex items-center gap-1 text-[10px] text-amber-600 hover:underline mt-2"><Plus size={10}/> Adicionar</button>
              </div>

              <div><label className="text-xs font-semibold text-slate-600 block mb-1">Observações gerais</label>
                <textarea value={cObs} onChange={e => setCObs(e.target.value)} rows={2} placeholder="Observações sobre a revisão..." className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs"/>
              </div>
            </div>
            <div className="p-5 border-t border-slate-100 flex gap-3">
              <button onClick={() => { setConcluindoId(null); setAutoComp(null) }} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm">Cancelar</button>
              <button onClick={concluirRevisao} disabled={enviando} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg text-sm disabled:opacity-50">
                {enviando ? <Loader2 size={14} className="animate-spin"/> : <Send size={14}/>} Entregar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}