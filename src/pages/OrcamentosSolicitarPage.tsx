import { useEffect, useState } from 'react'
import {
  Upload, FileSpreadsheet, Clock, CheckCircle2, Send, AlertTriangle,
  Download, Eye, RefreshCw, Plus, X, Loader2, Calendar,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '../lib/store'
import { usePerfilStore } from '../lib/perfilStore'
import { formatDate, formatCurrency } from '../utils/calculations'
import { supabase } from '../lib/supabase'
import { Obra } from '../types'

interface OrcRevisao {
  id: string; created_at: string; titulo: string; descricao: string | null
  prazo_retorno: string; urgencia: string; status: string
  arquivo_original_nome: string | null; arquivo_original_url: string | null
  arquivo_revisado_nome: string | null; arquivo_revisado_url: string | null
  observacoes_revisor: string | null; comparativo_resumo: any[]
  revisor_id: string | null; data_inicio_revisao: string | null; data_conclusao: string | null
  obra_id: string | null; contrato_id: string | null; ordem_atendimento: number
  arquivos_complementares: { nome: string; path: string; size: number }[]
}

const URGENCIA_LABEL: Record<string, { label: string; color: string }> = {
  BAIXA:   { label: 'Baixa',   color: 'bg-slate-100 text-slate-600' },
  NORMAL:  { label: 'Normal',  color: 'bg-blue-100 text-blue-700' },
  ALTA:    { label: 'Alta',    color: 'bg-amber-100 text-amber-700' },
  URGENTE: { label: 'Urgente', color: 'bg-red-100 text-red-700' },
}

const STATUS_LABEL: Record<string, { label: string; color: string; icon: any }> = {
  PENDENTE:    { label: 'Na fila',     color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Clock },
  EM_REVISAO:  { label: 'Em revisão',  color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Eye },
  CONCLUIDO:   { label: 'Concluído',   color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  CANCELADO:   { label: 'Cancelado',   color: 'bg-slate-100 text-slate-500 border-slate-200', icon: X },
}

export function OrcamentosSolicitarPage() {
  const { contratos, fetchContratos, fetchObras } = useStore()
  const { perfilAtual } = usePerfilStore()

  const [orcamentos, setOrcamentos] = useState<OrcRevisao[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [todasObras, setTodasObras] = useState<(Obra & { contrato_nome: string })[]>([])
  const [detalhe, setDetalhe] = useState<OrcRevisao | null>(null)

  // Form
  const [fTitulo, setFTitulo] = useState('')
  const [fDesc, setFDesc] = useState('')
  const [fPrazo, setFPrazo] = useState('')
  const [fUrgencia, setFUrgencia] = useState('NORMAL')
  const [fObraId, setFObraId] = useState('')
  const [fArquivo, setFArquivo] = useState<File | null>(null)
  const [fComplementares, setFComplementares] = useState<File[]>([])
  const [enviando, setEnviando] = useState(false)

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
    fetchOrcamentos()
  }, [])

  async function fetchOrcamentos() {
    setLoading(true)
    const { data } = await supabase.from('orcamentos_revisao').select('*')
      .eq('solicitante_id', perfilAtual!.id)
      .order('created_at', { ascending: false })
    if (data) setOrcamentos(data as OrcRevisao[])
    setLoading(false)
  }

  async function enviarSolicitacao() {
    if (!fTitulo.trim()) { toast.error('Título obrigatório'); return }
    if (!fPrazo) { toast.error('Prazo de retorno obrigatório'); return }
    if (!fArquivo) { toast.error('Anexe o arquivo do orçamento'); return }

    setEnviando(true)
    try {
      const obra = todasObras.find(o => o.id === fObraId)
      const ext = fArquivo.name.split('.').pop() || 'xlsx'
      const path = `originais/${Date.now()}_${fArquivo.name}`

      // Upload arquivo principal
      const { error: upErr } = await supabase.storage.from('orcamentos').upload(path, fArquivo)
      if (upErr) throw upErr

      // Upload complementares
      const complementares: { nome: string; path: string; size: number }[] = []
      for (const fc of fComplementares) {
        const cPath = `complementares/${Date.now()}_${fc.name}`
        const { error: cErr } = await supabase.storage.from('orcamentos').upload(cPath, fc)
        if (!cErr) complementares.push({ nome: fc.name, path: cPath, size: fc.size })
      }

      // Cria solicitação
      const { error } = await supabase.from('orcamentos_revisao').insert({
        solicitante_id: perfilAtual!.id,
        obra_id: fObraId || null,
        contrato_id: obra?.contrato_id || null,
        titulo: fTitulo,
        descricao: fDesc || null,
        prazo_retorno: fPrazo,
        urgencia: fUrgencia,
        arquivo_original_url: path,
        arquivo_original_nome: fArquivo.name,
        arquivo_original_size: fArquivo.size,
        arquivos_complementares: complementares,
      })
      if (error) throw error

      // Notifica admins
      try {
        await supabase.rpc('notificar_admins', {
          p_tipo: 'info',
          p_titulo: `Novo orçamento para revisão: ${fTitulo}`,
          p_mensagem: `${perfilAtual!.nome || perfilAtual!.email} enviou um orçamento. Prazo: ${formatDate(fPrazo)}. Urgência: ${fUrgencia}`,
          p_link: '/setor-orcamentos',
        })
      } catch {}


      toast.success('Orçamento enviado para revisão!')
      setShowForm(false); setFTitulo(''); setFDesc(''); setFPrazo(''); setFUrgencia('NORMAL'); setFObraId(''); setFArquivo(null); setFComplementares([])
      fetchOrcamentos()
    } catch (err: any) { toast.error(err.message || 'Erro ao enviar') }
    setEnviando(false)
  }

  async function downloadArquivo(path: string, nome: string) {
    const { data, error } = await supabase.storage.from('orcamentos').download(path)
    if (error || !data) { toast.error('Erro ao baixar arquivo'); return }
    const url = URL.createObjectURL(data)
    const a = document.createElement('a'); a.href = url; a.download = nome; a.click()
    URL.revokeObjectURL(url)
  }

  const pendentes = orcamentos.filter(o => o.status === 'PENDENTE')
  const emRevisao = orcamentos.filter(o => o.status === 'EM_REVISAO')
  const concluidos = orcamentos.filter(o => o.status === 'CONCLUIDO')

  const diasAte = (d: string) => { const diff = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000); return diff }

  return (
    <div className="p-6 max-w-5xl overflow-y-auto" style={{ height: '100%' }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Orçamentos — Revisão</h1>
          <p className="text-sm text-slate-500">Envie orçamentos para análise e revisão do setor</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchOrcamentos} className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
            <RefreshCw size={14}/> Atualizar
          </button>
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg text-sm">
            <Plus size={15}/> Nova Solicitação
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Na fila', val: pendentes.length, color: 'from-amber-500 to-amber-600', icon: Clock },
          { label: 'Em revisão', val: emRevisao.length, color: 'from-blue-500 to-blue-600', icon: Eye },
          { label: 'Concluídos', val: concluidos.length, color: 'from-emerald-500 to-emerald-600', icon: CheckCircle2 },
        ].map(({ label, val, color, icon: Icon }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center shadow-sm mb-2`}><Icon size={18} className="text-white"/></div>
            <p className="text-xl font-bold text-slate-800">{val}</p>
            <p className="text-[11px] text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      {/* Form Nova Solicitação */}
      {showForm && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 mb-6">
          <p className="font-bold text-amber-800 mb-4">Nova Solicitação de Revisão</p>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-600 block mb-1">Título *</label>
              <input value={fTitulo} onChange={e => setFTitulo(e.target.value)}
                placeholder="Ex: Orçamento reforma E.M. José de Carvalho" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"/>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-600 block mb-1">Descrição / Observações</label>
              <textarea value={fDesc} onChange={e => setFDesc(e.target.value)} rows={2}
                placeholder="Detalhes sobre o que precisa ser revisado..." className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"/>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Obra vinculada</label>
              <select value={fObraId} onChange={e => setFObraId(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                <option value="">Nenhuma (avulso)</option>
                {todasObras.map(o => <option key={o.id} value={o.id}>{o.nome_obra} ({o.contrato_nome})</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Prazo de retorno *</label>
              <input type="date" value={fPrazo} onChange={e => setFPrazo(e.target.value)}
                min={new Date().toISOString().split('T')[0]} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"/>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Urgência</label>
              <select value={fUrgencia} onChange={e => setFUrgencia(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                <option value="BAIXA">Baixa</option>
                <option value="NORMAL">Normal</option>
                <option value="ALTA">Alta</option>
                <option value="URGENTE">Urgente</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Arquivo do orçamento *</label>
              <input type="file" accept=".xlsx,.xls,.pdf,.ods" onChange={e => setFArquivo(e.target.files?.[0] || null)}
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white"/>
              {fArquivo && <p className="text-[10px] text-slate-500 mt-1">{fArquivo.name} ({(fArquivo.size/1024).toFixed(0)} KB)</p>}
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Arquivos complementares</label>
              <input type="file" multiple accept=".xlsx,.xls,.pdf,.ods,.dwg,.dxf,.doc,.docx,.png,.jpg,.jpeg,.zip"
                onChange={e => setFComplementares(e.target.files ? [...e.target.files] : [])}
                className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white"/>
              <p className="text-[10px] text-slate-400 mt-0.5">Projetos, memoriais, plantas — selecione múltiplos arquivos</p>
              {fComplementares.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {fComplementares.map((f, i) => (
                    <p key={i} className="text-[10px] text-slate-500">📎 {f.name} ({(f.size/1024).toFixed(0)} KB)</p>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm bg-white">Cancelar</button>
            <button onClick={enviarSolicitacao} disabled={enviando}
              className="flex items-center gap-2 px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-sm disabled:opacity-50">
              {enviando ? <Loader2 size={14} className="animate-spin"/> : <Send size={14}/>} Enviar para Revisão
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      {orcamentos.length === 0 && !loading ? (
        <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-xl">
          <FileSpreadsheet size={36} className="mx-auto text-slate-300 mb-3"/>
          <p className="text-slate-500">Nenhuma solicitação de revisão</p>
          <p className="text-xs text-slate-400 mt-1">Clique em "Nova Solicitação" para enviar um orçamento</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orcamentos.map(orc => {
            const st = STATUS_LABEL[orc.status] || STATUS_LABEL.PENDENTE
            const urg = URGENCIA_LABEL[orc.urgencia] || URGENCIA_LABEL.NORMAL
            const dias = diasAte(orc.prazo_retorno)
            const Icon = st.icon
            return (
              <div key={orc.id} className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    orc.status === 'CONCLUIDO' ? 'bg-emerald-100' : orc.status === 'EM_REVISAO' ? 'bg-blue-100' : 'bg-amber-100'
                  }`}><Icon size={18} className={orc.status === 'CONCLUIDO' ? 'text-emerald-600' : orc.status === 'EM_REVISAO' ? 'text-blue-600' : 'text-amber-600'}/></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-slate-800 text-sm">{orc.titulo}</h3>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${st.color}`}>{st.label}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${urg.color}`}>{urg.label}</span>
                      {orc.status !== 'CONCLUIDO' && orc.status !== 'CANCELADO' && (
                        <span className={`text-[10px] font-medium ${dias <= 1 ? 'text-red-600' : dias <= 3 ? 'text-amber-600' : 'text-slate-400'}`}>
                          {dias < 0 ? `${Math.abs(dias)}d atrasado!` : dias === 0 ? 'Vence hoje!' : `${dias}d restantes`}
                        </span>
                      )}
                    </div>
                    {orc.descricao && <p className="text-xs text-slate-500 mt-1">{orc.descricao}</p>}
                    <div className="flex gap-4 text-[10px] text-slate-400 mt-2">
                      <span>Enviado: {formatDate(orc.created_at)}</span>
                      <span>Prazo: {formatDate(orc.prazo_retorno)}</span>
                      <span>Fila: #{orc.ordem_atendimento}</span>
                    </div>

                    {/* Concluído — mostra resultado */}
                    {orc.status === 'CONCLUIDO' && (
                      <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                        <p className="text-xs font-bold text-emerald-800 mb-1">Revisão Concluída — {orc.data_conclusao ? formatDate(orc.data_conclusao) : ''}</p>
                        {orc.observacoes_revisor && <p className="text-xs text-emerald-700 mb-2">{orc.observacoes_revisor}</p>}
                        {orc.comparativo_resumo && orc.comparativo_resumo.length > 0 && (
                          <div className="mb-2">
                            <p className="text-[10px] font-semibold text-emerald-600 mb-1">O que mudou:</p>
                            {orc.comparativo_resumo.map((item: any, i: number) => (
                              <p key={i} className="text-[10px] text-emerald-700 flex items-center gap-1">• {item.descricao || item}</p>
                            ))}
                          </div>
                        )}
                        {orc.arquivo_revisado_url && (
                          <button onClick={() => downloadArquivo(orc.arquivo_revisado_url!, orc.arquivo_revisado_nome || 'revisado.xlsx')}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700">
                            <Download size={12}/> Baixar Orçamento Revisado
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Download original */}
                  {orc.arquivo_original_url && (
                    <button onClick={() => downloadArquivo(orc.arquivo_original_url!, orc.arquivo_original_nome || 'original.xlsx')}
                      className="p-2 rounded-lg text-slate-300 hover:text-blue-600 hover:bg-blue-50 shrink-0" title="Baixar original">
                      <Download size={16}/>
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}