import { useEffect, useState, useMemo } from 'react'
import {
  FileSpreadsheet, Clock, Eye, CheckCircle2, Download, Upload, RefreshCw, Play, X,
  AlertTriangle, Loader2, MessageSquare, ArrowRight, User, Calendar, Filter, Send,
  Plus, Minus, Edit3,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { usePerfilStore } from '../lib/perfilStore'
import { formatDate } from '../utils/calculations'
import { supabase } from '../lib/supabase'
import { compararOrcamentos, Alteracao, ComparativoResult } from '../utils/compararOrcamentos'

interface OrcRevisao {
  id: string; created_at: string; updated_at: string; titulo: string; descricao: string | null
  prazo_retorno: string; urgencia: string; status: string; ordem_atendimento: number
  solicitante_id: string; obra_id: string | null; contrato_id: string | null
  arquivo_original_url: string | null; arquivo_original_nome: string | null; arquivo_original_size: number | null
  arquivo_revisado_url: string | null; arquivo_revisado_nome: string | null; arquivo_revisado_size: number | null
  revisor_id: string | null; data_inicio_revisao: string | null; data_conclusao: string | null
  observacoes_revisor: string | null; comparativo_resumo: any[]
}

interface Perfil { id: string; nome: string | null; email: string }

const URG_LABEL: Record<string, { label: string; color: string; ordem: number }> = {
  URGENTE: { label: 'Urgente', color: 'bg-red-100 text-red-700',     ordem: 0 },
  ALTA:    { label: 'Alta',    color: 'bg-amber-100 text-amber-700', ordem: 1 },
  NORMAL:  { label: 'Normal',  color: 'bg-blue-100 text-blue-700',   ordem: 2 },
  BAIXA:   { label: 'Baixa',   color: 'bg-slate-100 text-slate-600', ordem: 3 },
}

export function OrcamentosSetorPage() {
  const { perfilAtual } = usePerfilStore()
  const [orcamentos, setOrcamentos] = useState<OrcRevisao[]>([])
  const [perfis, setPerfis] = useState<Record<string, Perfil>>({})
  const [loading, setLoading] = useState(true)
  const [abaAtiva, setAbaAtiva] = useState<'PENDENTE' | 'EM_REVISAO' | 'CONCLUIDO'>('PENDENTE')

  // Modal de conclusão
  const [concluindoId, setConcluindoId] = useState<string | null>(null)
  const [cObs, setCObs] = useState('')
  const [cArquivo, setCArquivo] = useState<File | null>(null)
  const [cComparativo, setCComparativo] = useState<string[]>([''])
  const [enviando, setEnviando] = useState(false)
  const [comparando, setComparando] = useState(false)
  const [autoComp, setAutoComp] = useState<ComparativoResult | null>(null)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data } = await supabase.from('orcamentos_revisao').select('*').order('ordem_atendimento')
    if (data) {
      setOrcamentos(data as OrcRevisao[])
      // Busca perfis dos solicitantes
      const ids = new Set(data.map((o: any) => o.solicitante_id).concat(data.map((o: any) => o.revisor_id).filter(Boolean)))
      if (ids.size > 0) {
        const { data: pData } = await supabase.from('perfis').select('id, nome, email').in('id', [...ids])
        if (pData) {
          const map: Record<string, Perfil> = {}
          pData.forEach((p: any) => { map[p.id] = p })
          setPerfis(map)
        }
      }
    }
    setLoading(false)
  }

  async function pegarParaRevisao(orc: OrcRevisao) {
    const { error } = await supabase.from('orcamentos_revisao').update({
      status: 'EM_REVISAO', revisor_id: perfilAtual!.id, data_inicio_revisao: new Date().toISOString(),
    }).eq('id', orc.id)
    if (error) { toast.error(error.message); return }

    // Notifica solicitante
    await supabase.rpc('criar_notificacao', {
      p_user_id: orc.solicitante_id, p_tipo: 'info',
      p_titulo: `Orçamento em revisão: ${orc.titulo}`,
      p_mensagem: `${perfilAtual!.nome || 'O setor de orçamentos'} iniciou a revisão.`,
      p_link: '/orcamentos',
    }).catch(() => {})

    toast.success('Orçamento em revisão!')
    fetchAll()
  }

  async function handleArquivoRevisado(file: File) {
    setCArquivo(file)
    setAutoComp(null)

    // Tenta comparar automaticamente se o original é xlsx
    const orc = orcamentos.find(o => o.id === concluindoId)
    if (!orc?.arquivo_original_url || !orc.arquivo_original_nome) return
    const isXlsx = orc.arquivo_original_nome.match(/\.xlsx?$/i) && file.name.match(/\.xlsx?$/i)
    if (!isXlsx) return

    setComparando(true)
    try {
      // Baixa o original do storage
      const { data: origBlob, error } = await supabase.storage.from('orcamentos').download(orc.arquivo_original_url)
      if (error || !origBlob) throw new Error('Erro ao baixar original')

      const origBuffer = await origBlob.arrayBuffer()
      const revBuffer = await file.arrayBuffer()

      const resultado = await compararOrcamentos(origBuffer, revBuffer)
      setAutoComp(resultado)

      // Pre-preenche a lista de alterações
      if (resultado.alteracoes.length > 0) {
        setCComparativo(resultado.alteracoes.map(a => {
          const prefix = a.tipo === 'ADICIONADO' ? '✚' : a.tipo === 'REMOVIDO' ? '✖' : '✎'
          return `${prefix} ${a.descricao}${a.detalhes ? ' — ' + a.detalhes : ''}`
        }))
      }

      toast.success(`Comparativo automático: ${resultado.alteracoes.length} diferença(s) detectada(s)`)
    } catch (err) {
      console.warn('Comparação automática falhou:', err)
      toast('Comparação automática não disponível — preencha manualmente', { icon: 'ℹ️' })
    }
    setComparando(false)
  }

  async function concluirRevisao() {
    if (!concluindoId) return
    const orc = orcamentos.find(o => o.id === concluindoId)
    if (!orc) return
    if (!cArquivo) { toast.error('Anexe o orçamento revisado'); return }

    setEnviando(true)
    try {
      const path = `revisados/${Date.now()}_${cArquivo.name}`
      const { error: upErr } = await supabase.storage.from('orcamentos').upload(path, cArquivo)
      if (upErr) throw upErr

      const comparativo = cComparativo.filter(c => c.trim()).map(c => ({ descricao: c.trim() }))

      const { error } = await supabase.from('orcamentos_revisao').update({
        status: 'CONCLUIDO',
        data_conclusao: new Date().toISOString(),
        arquivo_revisado_url: path,
        arquivo_revisado_nome: cArquivo.name,
        arquivo_revisado_size: cArquivo.size,
        observacoes_revisor: cObs || null,
        comparativo_resumo: comparativo,
      }).eq('id', concluindoId)
      if (error) throw error

      await supabase.rpc('criar_notificacao', {
        p_user_id: orc.solicitante_id, p_tipo: 'sucesso',
        p_titulo: `Orçamento revisado: ${orc.titulo}`,
        p_mensagem: `A revisão foi concluída com ${comparativo.length} alteração(ões). Acesse para baixar.`,
        p_link: '/orcamentos',
      }).catch(() => {})

      toast.success('Revisão concluída e entregue!')
      setConcluindoId(null); setCObs(''); setCArquivo(null); setCComparativo(['']); setAutoComp(null)
      fetchAll()
    } catch (err: any) { toast.error(err.message) }
    setEnviando(false)
  }

  async function downloadArquivo(path: string, nome: string) {
    const { data, error } = await supabase.storage.from('orcamentos').download(path)
    if (error || !data) { toast.error('Erro ao baixar'); return }
    const url = URL.createObjectURL(data)
    const a = document.createElement('a'); a.href = url; a.download = nome; a.click()
    URL.revokeObjectURL(url)
  }

  const diasAte = (d: string) => Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)
  const nomePerfil = (id: string | null) => id ? (perfis[id]?.nome || perfis[id]?.email || 'Usuário') : '—'

  const pendentes = useMemo(() => orcamentos.filter(o => o.status === 'PENDENTE')
    .sort((a, b) => (URG_LABEL[a.urgencia]?.ordem ?? 9) - (URG_LABEL[b.urgencia]?.ordem ?? 9) || a.ordem_atendimento - b.ordem_atendimento),
  [orcamentos])
  const emRevisao = useMemo(() => orcamentos.filter(o => o.status === 'EM_REVISAO'), [orcamentos])
  const concluidos = useMemo(() => orcamentos.filter(o => o.status === 'CONCLUIDO').sort((a, b) =>
    new Date(b.data_conclusao || 0).getTime() - new Date(a.data_conclusao || 0).getTime()), [orcamentos])

  const lista = abaAtiva === 'PENDENTE' ? pendentes : abaAtiva === 'EM_REVISAO' ? emRevisao : concluidos

  return (
    <div className="p-6 max-w-6xl overflow-y-auto" style={{ height: '100%' }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Setor de Orçamentos</h1>
          <p className="text-sm text-slate-500">Gerenciamento de revisões de orçamentos</p>
        </div>
        <button onClick={fetchAll} className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm hover:bg-slate-50">
          <RefreshCw size={14}/> Atualizar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { key: 'PENDENTE', label: 'Na fila', val: pendentes.length, color: 'from-amber-500 to-amber-600', icon: Clock, alert: pendentes.filter(p => diasAte(p.prazo_retorno) <= 2).length },
          { key: 'EM_REVISAO', label: 'Em revisão', val: emRevisao.length, color: 'from-blue-500 to-blue-600', icon: Eye },
          { key: 'CONCLUIDO', label: 'Concluídos', val: concluidos.length, color: 'from-emerald-500 to-emerald-600', icon: CheckCircle2 },
        ].map(({ key, label, val, color, icon: Icon, alert }) => (
          <button key={key} onClick={() => setAbaAtiva(key as any)}
            className={`bg-white rounded-xl border-2 p-4 text-left transition-all ${abaAtiva === key ? 'border-amber-400 shadow-md' : 'border-slate-200 hover:border-slate-300'}`}>
            <div className="flex items-center justify-between">
              <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center shadow-sm`}><Icon size={18} className="text-white"/></div>
              {alert && alert > 0 && <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full font-bold">{alert} urgente{alert>1?'s':''}</span>}
            </div>
            <p className="text-2xl font-bold text-slate-800 mt-2">{val}</p>
            <p className="text-[11px] text-slate-500">{label}</p>
          </button>
        ))}
      </div>

      {/* Lista */}
      {lista.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl text-slate-400">
          Nenhum orçamento {abaAtiva === 'PENDENTE' ? 'na fila' : abaAtiva === 'EM_REVISAO' ? 'em revisão' : 'concluído'}
        </div>
      ) : (
        <div className="space-y-3">
          {lista.map(orc => {
            const urg = URG_LABEL[orc.urgencia] || URG_LABEL.NORMAL
            const dias = diasAte(orc.prazo_retorno)
            const meuRevisor = orc.revisor_id === perfilAtual?.id
            return (
              <div key={orc.id} className={`bg-white border rounded-xl p-5 ${
                dias <= 1 && orc.status !== 'CONCLUIDO' ? 'border-red-300 bg-red-50/30' :
                dias <= 3 && orc.status !== 'CONCLUIDO' ? 'border-amber-200' : 'border-slate-200'
              }`}>
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
                        <span className={`text-[10px] font-bold flex items-center gap-1 ${
                          dias < 0 ? 'text-red-600' : dias <= 1 ? 'text-red-500' : dias <= 3 ? 'text-amber-600' : 'text-slate-400'
                        }`}>
                          <Calendar size={10}/>
                          {dias < 0 ? `${Math.abs(dias)}d ATRASADO` : dias === 0 ? 'VENCE HOJE' : `${dias}d restantes`}
                        </span>
                      )}
                    </div>
                    {orc.descricao && <p className="text-xs text-slate-500 mb-1">{orc.descricao}</p>}
                    <div className="flex gap-4 text-[10px] text-slate-400 flex-wrap">
                      <span className="flex items-center gap-1"><User size={9}/> {nomePerfil(orc.solicitante_id)}</span>
                      <span>Enviado: {formatDate(orc.created_at)}</span>
                      <span>Prazo: {formatDate(orc.prazo_retorno)}</span>
                      {orc.arquivo_original_nome && (
                        <span className="flex items-center gap-1"><FileSpreadsheet size={9}/> {orc.arquivo_original_nome}</span>
                      )}
                      {orc.revisor_id && <span className="text-blue-600 font-medium">Revisor: {nomePerfil(orc.revisor_id)}</span>}
                    </div>

                    {/* Concluído - comparativo */}
                    {orc.status === 'CONCLUIDO' && (
                      <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                        <div className="flex items-center gap-3 mb-2 text-xs">
                          <span className="text-slate-500">Revisor: <strong className="text-slate-700">{nomePerfil(orc.revisor_id)}</strong></span>
                          <span className="text-slate-500">Concluído: <strong>{orc.data_conclusao ? formatDate(orc.data_conclusao) : '—'}</strong></span>
                          {orc.arquivo_original_size && orc.arquivo_revisado_size && (
                            <span className="text-slate-400">
                              {(orc.arquivo_original_size/1024).toFixed(0)}KB → {(orc.arquivo_revisado_size/1024).toFixed(0)}KB
                            </span>
                          )}
                        </div>
                        {orc.observacoes_revisor && <p className="text-xs text-emerald-700 mb-2 italic">"{orc.observacoes_revisor}"</p>}
                        {orc.comparativo_resumo?.length > 0 && (
                          <div className="mb-2">
                            <p className="text-[10px] font-semibold text-emerald-600 mb-1">Alterações realizadas:</p>
                            {orc.comparativo_resumo.map((item: any, i: number) => (
                              <p key={i} className="text-[10px] text-emerald-700">• {item.descricao || item}</p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {orc.arquivo_original_url && (
                      <button onClick={() => downloadArquivo(orc.arquivo_original_url!, orc.arquivo_original_nome || 'original')}
                        className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50" title="Baixar original">
                        <Download size={16}/>
                      </button>
                    )}
                    {orc.arquivo_revisado_url && (
                      <button onClick={() => downloadArquivo(orc.arquivo_revisado_url!, orc.arquivo_revisado_nome || 'revisado')}
                        className="p-2 rounded-lg text-emerald-400 hover:text-emerald-600 hover:bg-emerald-50" title="Baixar revisado">
                        <Download size={16}/>
                      </button>
                    )}
                    {orc.status === 'PENDENTE' && (
                      <button onClick={() => pegarParaRevisao(orc)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded-lg">
                        <Play size={12}/> Pegar
                      </button>
                    )}
                    {orc.status === 'EM_REVISAO' && meuRevisor && (
                      <button onClick={() => { setConcluindoId(orc.id); setCObs(''); setCArquivo(null); setCComparativo(['']); setAutoComp(null) }}
                        className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium rounded-lg">
                        <CheckCircle2 size={12}/> Concluir
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal de Conclusão */}
      {concluindoId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setConcluindoId(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-100">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <CheckCircle2 size={18} className="text-emerald-500"/> Concluir Revisão
              </h2>
              <p className="text-xs text-slate-500 mt-1">{orcamentos.find(o => o.id === concluindoId)?.titulo}</p>
            </div>
            <div className="p-5 space-y-4">
              {/* Arquivo revisado */}
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Arquivo revisado *</label>
                <input type="file" accept=".xlsx,.xls,.pdf,.ods" onChange={e => { const f = e.target.files?.[0]; if (f) handleArquivoRevisado(f) }}
                  className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white"/>
                {cArquivo && <p className="text-[10px] text-slate-500 mt-1">{cArquivo.name} ({(cArquivo.size/1024).toFixed(0)} KB)</p>}
                {comparando && (
                  <div className="flex items-center gap-2 mt-2 text-xs text-blue-600">
                    <Loader2 size={12} className="animate-spin"/> Comparando com o original...
                  </div>
                )}
              </div>

              {/* Resultado automático do comparativo */}
              {autoComp && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <p className="text-xs font-bold text-blue-800 mb-2">Comparativo Automático</p>
                  <div className="flex gap-4 text-xs mb-3">
                    <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 text-red-700 font-medium">
                      <Minus size={10}/> {autoComp.resumo.removidos} removido{autoComp.resumo.removidos !== 1 ? 's' : ''}
                    </span>
                    <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-medium">
                      <Edit3 size={10}/> {autoComp.resumo.alterados} alterado{autoComp.resumo.alterados !== 1 ? 's' : ''}
                    </span>
                    <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                      <Plus size={10}/> {autoComp.resumo.adicionados} adicionado{autoComp.resumo.adicionados !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <p className="text-[10px] text-blue-600">
                    Original: {autoComp.resumo.totalOriginal} itens → Revisado: {autoComp.resumo.totalRevisado} itens
                  </p>
                  <p className="text-[10px] text-blue-500 mt-1">As alterações foram pré-preenchidas abaixo. Edite se necessário.</p>
                </div>
              )}

              {/* Comparativo — lista editável */}
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">
                  Alterações {autoComp ? '(detectadas automaticamente — edite se necessário)' : '(liste manualmente)'}
                </label>
                <div className="max-h-48 overflow-y-auto space-y-1.5">
                  {cComparativo.map((item, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-[10px] text-slate-400 shrink-0 mt-2">{i+1}.</span>
                      <input value={item} onChange={e => { const n = [...cComparativo]; n[i] = e.target.value; setCComparativo(n) }}
                        placeholder="Ex: Corrigido quantitativo do item 3.2.1"
                        className={`flex-1 border rounded-lg px-3 py-1.5 text-xs ${
                          item.startsWith('✖') ? 'border-red-200 bg-red-50/50' :
                          item.startsWith('✚') ? 'border-emerald-200 bg-emerald-50/50' :
                          item.startsWith('✎') ? 'border-amber-200 bg-amber-50/50' :
                          'border-slate-200'
                        }`}/>
                      {cComparativo.length > 1 && (
                        <button onClick={() => setCComparativo(cComparativo.filter((_, j) => j !== i))}
                          className="p-1 text-slate-300 hover:text-red-500 mt-1"><Minus size={12}/></button>
                      )}
                    </div>
                  ))}
                </div>
                <button onClick={() => setCComparativo([...cComparativo, ''])}
                  className="flex items-center gap-1 text-[10px] text-amber-600 hover:underline mt-2">
                  <Plus size={10}/> Adicionar alteração manual
                </button>
              </div>

              {/* Observações */}
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Observações gerais</label>
                <textarea value={cObs} onChange={e => setCObs(e.target.value)} rows={3}
                  placeholder="Observações adicionais sobre a revisão..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs"/>
              </div>
            </div>
            <div className="p-5 border-t border-slate-100 flex gap-3">
              <button onClick={() => { setConcluindoId(null); setAutoComp(null) }} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm">Cancelar</button>
              <button onClick={concluirRevisao} disabled={enviando}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg text-sm disabled:opacity-50">
                {enviando ? <Loader2 size={14} className="animate-spin"/> : <Send size={14}/>} Entregar Revisão
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}