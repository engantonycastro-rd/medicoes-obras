import { useEffect, useState } from 'react'
import {
  Upload, FileSpreadsheet, Clock, CheckCircle2, Send, Download, Eye,
  RefreshCw, Plus, X, Loader2, Calendar, TrendingDown, TrendingUp, Minus, ArrowRight,
  Scissors, AlertTriangle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '../lib/store'
import { usePerfilStore } from '../lib/perfilStore'
import { formatDate, formatCurrency } from '../utils/calculations'
import { supabase } from '../lib/supabase'
import { compararOrcamentos, ComparativoResult } from '../utils/compararOrcamentos'
import { Obra } from '../types'

function sanitizeFileName(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_')
}

interface OrcRevisao {
  id: string; created_at: string; titulo: string; descricao: string | null
  prazo_retorno: string; urgencia: string; status: string; tipo: string
  arquivo_original_nome: string | null; arquivo_original_url: string | null
  arquivo_revisado_nome: string | null; arquivo_revisado_url: string | null
  observacoes_revisor: string | null; comparativo_resumo: any[]
  revisor_id: string | null; data_inicio_revisao: string | null; data_conclusao: string | null
  obra_id: string | null; contrato_id: string | null; ordem_atendimento: number
  arquivos_complementares: { nome: string; path: string; size: number }[]
  arquivos_projeto: { nome: string; path: string; size: number }[] | null
  valor_original: number; valor_revisado: number; diferenca_valor: number; diferenca_percentual: number
  qtd_alteracoes: number
  arquivo_fiscal_url: string | null; arquivo_fiscal_nome: string | null
  valor_aprovado_fiscal: number; valor_glosado: number; glosas_resumo: any[]
  obs_fiscal: string | null; data_retorno_fiscal: string | null
}

const URG = { BAIXA: 'bg-slate-100 text-slate-600', NORMAL: 'bg-blue-100 text-blue-700', ALTA: 'bg-primary-100 text-primary-700', URGENTE: 'bg-red-100 text-red-700' }
const ST = {
  PENDENTE:        { label: 'Na fila',         color: 'bg-primary-100 text-primary-700 border-primary-200', icon: Clock },
  EM_REVISAO:      { label: 'Em revisão',      color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Eye },
  CONCLUIDO:       { label: 'Concluído',       color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  RETORNO_FISCAL:  { label: 'Retorno Fiscal',  color: 'bg-purple-100 text-purple-700 border-purple-200', icon: CheckCircle2 },
  CANCELADO:       { label: 'Cancelado',       color: 'bg-slate-100 text-slate-500 border-slate-200', icon: X },
} as Record<string, any>

export function OrcamentosSolicitarPage() {
  const { contratos, fetchContratos, fetchObras } = useStore()
  const { perfilAtual } = usePerfilStore()
  const [orcamentos, setOrcamentos] = useState<OrcRevisao[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [todasObras, setTodasObras] = useState<(Obra & { contrato_nome: string })[]>([])
  const [detalheId, setDetalheId] = useState<string | null>(null)
  const [fTitulo, setFTitulo] = useState(''); const [fDesc, setFDesc] = useState('')
  const [fPrazo, setFPrazo] = useState(''); const [fUrgencia, setFUrgencia] = useState('NORMAL')
  const [fObraId, setFObraId] = useState(''); const [fArquivo, setFArquivo] = useState<File | null>(null)
  const [fComplementares, setFComplementares] = useState<File[]>([])
  const [fTipo, setFTipo] = useState<'ORCAMENTO' | 'PROJETO'>('ORCAMENTO')
  const [fArquivosProjeto, setFArquivosProjeto] = useState<File[]>([])
  const [enviando, setEnviando] = useState(false)

  // Retorno fiscal
  const [fiscalModal, setFiscalModal] = useState<string | null>(null)
  const [fiscalArquivo, setFiscalArquivo] = useState<File | null>(null)
  const [fiscalValor, setFiscalValor] = useState('')
  const [fiscalObs, setFiscalObs] = useState('')
  const [fiscalComp, setFiscalComp] = useState<ComparativoResult | null>(null)
  const [fiscalComparando, setFiscalComparando] = useState(false)
  const [fiscalEnviando, setFiscalEnviando] = useState(false)

  useEffect(() => {
    fetchContratos().then(async () => {
      const store = useStore.getState()
      const all: (Obra & { contrato_nome: string })[] = []
      for (const c of store.contratos) { const obs = await fetchObras(c.id); for (const o of obs) all.push({ ...o, contrato_nome: c.nome_obra }) }
      setTodasObras(all)
    })
    fetchOrcamentos()
  }, [])

  async function fetchOrcamentos() {
    setLoading(true)
    const { data } = await supabase.from('orcamentos_revisao').select('*').eq('solicitante_id', perfilAtual!.id).order('created_at', { ascending: false })
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
      const path = `originais/${Date.now()}_${sanitizeFileName(fArquivo.name)}`
      const { error: upErr } = await supabase.storage.from('orcamentos').upload(path, fArquivo)
      if (upErr) throw upErr
      const complementares: { nome: string; path: string; size: number }[] = []
      for (const fc of fComplementares) {
        const cPath = `complementares/${Date.now()}_${sanitizeFileName(fc.name)}`
        const { error: cErr } = await supabase.storage.from('orcamentos').upload(cPath, fc)
        if (!cErr) complementares.push({ nome: fc.name, path: cPath, size: fc.size })
      }
      // Upload arquivos de projeto (se PROJETO)
      const arquivosProjeto: { nome: string; path: string; size: number }[] = []
      if (fTipo === 'PROJETO') {
        for (const fp of fArquivosProjeto) {
          const pPath = `projetos/${Date.now()}_${sanitizeFileName(fp.name)}`
          const { error: pErr } = await supabase.storage.from('orcamentos').upload(pPath, fp)
          if (!pErr) arquivosProjeto.push({ nome: fp.name, path: pPath, size: fp.size })
        }
      }
      const { error } = await supabase.from('orcamentos_revisao').insert({
        solicitante_id: perfilAtual!.id, obra_id: fObraId || null, contrato_id: obra?.contrato_id || null,
        titulo: fTitulo, descricao: fDesc || null, prazo_retorno: fPrazo, urgencia: fUrgencia,
        arquivo_original_url: path, arquivo_original_nome: fArquivo.name, arquivo_original_size: fArquivo.size,
        arquivos_complementares: complementares,
        tipo: fTipo,
        arquivos_projeto: arquivosProjeto.length > 0 ? arquivosProjeto : null,
      })
      if (error) throw error
      try { await supabase.rpc('notificar_admins', { p_tipo: 'info', p_titulo: `Novo ${fTipo === 'PROJETO' ? 'projeto' : 'orçamento'}: ${fTitulo}`, p_mensagem: `${perfilAtual!.nome || perfilAtual!.email} enviou. Prazo: ${formatDate(fPrazo)}`, p_link: '/setor-orcamentos' }) } catch {}
      toast.success(`${fTipo === 'PROJETO' ? 'Projeto' : 'Orçamento'} enviado para revisão!`)
      setShowForm(false); setFTitulo(''); setFDesc(''); setFPrazo(''); setFUrgencia('NORMAL'); setFObraId(''); setFArquivo(null); setFComplementares([]); setFTipo('ORCAMENTO'); setFArquivosProjeto([])
      fetchOrcamentos()
    } catch (err: any) { toast.error(err.message || 'Erro ao enviar') }
    setEnviando(false)
  }

  async function downloadArquivo(path: string, nome: string) {
    const { data, error } = await supabase.storage.from('orcamentos').download(path)
    if (error || !data) { toast.error('Erro ao baixar'); return }
    const url = URL.createObjectURL(data)
    const a = document.createElement('a'); a.href = url; a.download = nome; a.click(); URL.revokeObjectURL(url)
  }

  async function handleFiscalArquivo(file: File) {
    setFiscalArquivo(file); setFiscalComp(null)
    const orc = orcamentos.find(o => o.id === fiscalModal)
    if (!orc?.arquivo_revisado_url || !orc.arquivo_revisado_nome) return
    if (!(orc.arquivo_revisado_nome.match(/\.(xlsx?|pdf)$/i) && file.name.match(/\.(xlsx?|pdf)$/i))) return

    setFiscalComparando(true)
    try {
      const { data: revBlob } = await supabase.storage.from('orcamentos').download(orc.arquivo_revisado_url)
      if (!revBlob) throw new Error('Erro ao baixar revisado')
      const resultado = await compararOrcamentos(await revBlob.arrayBuffer(), await file.arrayBuffer(), orc.arquivo_revisado_nome, file.name)
      setFiscalComp(resultado)
      toast.success(`Comparativo: ${resultado.alteracoes.length} diferença(s) — ${resultado.resumo.removidos} item(ns) glosado(s)`)
    } catch { toast('Comparação automática falhou', { icon: 'ℹ️' }) }
    setFiscalComparando(false)
  }

  async function enviarRetornoFiscal() {
    if (!fiscalModal || !fiscalArquivo) { toast.error('Anexe o arquivo do fiscal'); return }
    const orc = orcamentos.find(o => o.id === fiscalModal); if (!orc) return
    setFiscalEnviando(true)
    try {
      const path = `fiscal/${Date.now()}_${sanitizeFileName(fiscalArquivo.name)}`
      const { error: upErr } = await supabase.storage.from('orcamentos').upload(path, fiscalArquivo)
      if (upErr) throw upErr

      const vAprovado = Number(String(fiscalValor).replace(/[^\d.,]/g, '').replace(',', '.')) || 0
      const vGlosado = orc.valor_revisado > 0 ? orc.valor_revisado - vAprovado : 0
      const glosas = fiscalComp ? fiscalComp.alteracoes.filter(a => a.tipo === 'REMOVIDO' || a.tipo === 'ALTERADO').map(a => ({
        descricao: `${a.tipo === 'REMOVIDO' ? '✖' : '✎'} ${a.descricao}${a.detalhes ? ' — ' + a.detalhes : ''}`
      })) : []

      const { error } = await supabase.from('orcamentos_revisao').update({
        status: 'RETORNO_FISCAL',
        arquivo_fiscal_url: path, arquivo_fiscal_nome: fiscalArquivo.name, arquivo_fiscal_size: fiscalArquivo.size,
        data_retorno_fiscal: new Date().toISOString(),
        valor_aprovado_fiscal: vAprovado, valor_glosado: Math.abs(vGlosado),
        glosas_resumo: glosas, obs_fiscal: fiscalObs || null,
      }).eq('id', fiscalModal)
      if (error) throw error

      try { await supabase.rpc('notificar_admins', { p_tipo: 'info', p_titulo: `Retorno fiscal: ${orc.titulo}`, p_mensagem: `Valor aprovado: ${formatCurrency(vAprovado)}. Glosado: ${formatCurrency(Math.abs(vGlosado))}`, p_link: '/setor-orcamentos' }) } catch {}

      toast.success('Retorno fiscal enviado!')
      setFiscalModal(null); setFiscalArquivo(null); setFiscalValor(''); setFiscalObs(''); setFiscalComp(null)
      fetchOrcamentos()
    } catch (err: any) { toast.error(err.message) }
    setFiscalEnviando(false)
  }

  const diasAte = (d: string) => Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)
  const pendentes = orcamentos.filter(o => o.status === 'PENDENTE')
  const emRevisao = orcamentos.filter(o => o.status === 'EM_REVISAO')
  const concluidos = orcamentos.filter(o => o.status === 'CONCLUIDO')

  return (
    <div className="p-6 max-w-5xl overflow-y-auto" style={{ height: '100%' }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Orçamentos — Revisão</h1>
          <p className="text-sm text-slate-500">Envie orçamentos para análise e revisão do setor</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchOrcamentos} className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"><RefreshCw size={14}/> Atualizar</button>
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg text-sm"><Plus size={15}/> Nova Solicitação</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[{ l: 'Na fila', v: pendentes.length, c: 'from-primary-500 to-primary-600', i: Clock },
          { l: 'Em revisão', v: emRevisao.length, c: 'from-blue-500 to-blue-600', i: Eye },
          { l: 'Concluídos', v: concluidos.length, c: 'from-emerald-500 to-emerald-600', i: CheckCircle2 },
        ].map(({ l, v, c, i: Icon }) => (
          <div key={l} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${c} flex items-center justify-center shadow-sm mb-2`}><Icon size={18} className="text-white"/></div>
            <p className="text-xl font-bold text-slate-800">{v}</p><p className="text-[11px] text-slate-500">{l}</p>
          </div>
        ))}
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-primary-50 border-2 border-primary-300 rounded-2xl p-5 mb-6">
          <p className="font-bold text-primary-800 mb-4">Nova Solicitação de Revisão</p>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-600 block mb-1">Tipo de solicitação *</label>
              <div className="flex gap-3">
                <button type="button" onClick={() => setFTipo('ORCAMENTO')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border-2 transition-all ${
                    fTipo === 'ORCAMENTO' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}>
                  <FileSpreadsheet size={16}/> Orçamento
                  <span className="text-[9px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-bold">R$ 50</span>
                </button>
                <button type="button" onClick={() => setFTipo('PROJETO')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border-2 transition-all ${
                    fTipo === 'PROJETO' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}>
                  <Upload size={16}/> Projeto
                  <span className="text-[9px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full font-bold">R$ 100</span>
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">{fTipo === 'ORCAMENTO' ? 'Revisão de planilha orçamentária' : 'Projeto técnico (PDF, DWG, RVT)'}</p>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-600 block mb-1">Título *</label>
              <input value={fTitulo} onChange={e => setFTitulo(e.target.value)} placeholder="Ex: Orçamento reforma E.M. José de Carvalho" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"/>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-600 block mb-1">Descrição / Observações</label>
              <textarea value={fDesc} onChange={e => setFDesc(e.target.value)} rows={2} placeholder="Detalhes sobre o que precisa ser revisado..." className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"/>
            </div>
            <div><label className="text-xs font-semibold text-slate-600 block mb-1">Obra vinculada</label>
              <select value={fObraId} onChange={e => setFObraId(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                <option value="">Nenhuma (avulso)</option>
                {todasObras.map(o => <option key={o.id} value={o.id}>{o.nome_obra} ({o.contrato_nome})</option>)}
              </select>
            </div>
            <div><label className="text-xs font-semibold text-slate-600 block mb-1">Prazo de retorno *</label>
              <input type="date" value={fPrazo} onChange={e => setFPrazo(e.target.value)} min={new Date().toISOString().split('T')[0]} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"/>
            </div>
            <div><label className="text-xs font-semibold text-slate-600 block mb-1">Urgência</label>
              <select value={fUrgencia} onChange={e => setFUrgencia(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                <option value="BAIXA">Baixa</option><option value="NORMAL">Normal</option><option value="ALTA">Alta</option><option value="URGENTE">Urgente</option>
              </select>
            </div>
            <div><label className="text-xs font-semibold text-slate-600 block mb-1">Arquivo do orçamento *</label>
              <input type="file" accept=".xlsx,.xls,.pdf,.ods" onChange={e => setFArquivo(e.target.files?.[0] || null)} className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white"/>
              {fArquivo && <p className="text-[10px] text-slate-500 mt-1">{fArquivo.name} ({(fArquivo.size/1024).toFixed(0)} KB)</p>}
            </div>
            <div className="col-span-2"><label className="text-xs font-semibold text-slate-600 block mb-1">Arquivos complementares (memoriais, plantas)</label>
              <input type="file" multiple accept=".xlsx,.xls,.pdf,.ods,.dwg,.dxf,.doc,.docx,.png,.jpg,.jpeg,.zip" onChange={e => setFComplementares(e.target.files ? [...e.target.files] : [])} className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white"/>
              {fComplementares.length > 0 && <div className="mt-1">{fComplementares.map((f, i) => <p key={i} className="text-[10px] text-slate-500">📎 {f.name}</p>)}</div>}
            </div>
            {fTipo === 'PROJETO' && (
              <div className="col-span-2 border-2 border-dashed border-blue-300 rounded-xl p-4 bg-blue-50/50">
                <label className="text-xs font-semibold text-blue-700 block mb-1">Arquivos do projeto (PDF, DWG, RVT) *</label>
                <input type="file" multiple accept=".pdf,.dwg,.rvt" onChange={e => setFArquivosProjeto(e.target.files ? [...e.target.files] : [])} className="w-full border border-blue-200 rounded-lg px-3 py-1.5 text-sm bg-white"/>
                {fArquivosProjeto.length > 0 && <div className="mt-1">{fArquivosProjeto.map((f, i) => <p key={i} className="text-[10px] text-blue-600 font-medium">📐 {f.name} ({(f.size/1024).toFixed(0)} KB)</p>)}</div>}
                <p className="text-[9px] text-blue-500 mt-1">Formatos aceitos: .pdf, .dwg, .rvt</p>
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm bg-white">Cancelar</button>
            <button onClick={enviarSolicitacao} disabled={enviando} className="flex items-center gap-2 px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-lg text-sm disabled:opacity-50">
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
        </div>
      ) : (
        <div className="space-y-4">
          {orcamentos.map(orc => {
            const st = ST[orc.status] || ST.PENDENTE
            const dias = diasAte(orc.prazo_retorno)
            const Icon = st.icon
            const aberto = detalheId === orc.id
            return (
              <div key={orc.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
                {/* Header */}
                <div className="p-5 flex items-start gap-4 cursor-pointer" onClick={() => setDetalheId(aberto ? null : orc.id)}>
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${orc.status==='CONCLUIDO'?'bg-emerald-100':orc.status==='EM_REVISAO'?'bg-blue-100':'bg-primary-100'}`}>
                    <Icon size={18} className={orc.status==='CONCLUIDO'?'text-emerald-600':orc.status==='EM_REVISAO'?'text-blue-600':'text-primary-600'}/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-slate-800 text-sm">{orc.titulo}</h3>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${st.color}`}>{st.label}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${(URG as any)[orc.urgencia] || URG.NORMAL}`}>{orc.urgencia}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${orc.tipo === 'PROJETO' ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                        {orc.tipo === 'PROJETO' ? 'Projeto' : 'Orçamento'}
                      </span>
                      {orc.status !== 'CONCLUIDO' && orc.status !== 'CANCELADO' && (
                        <span className={`text-[10px] font-medium ${dias < 0 ? 'text-red-600' : dias <= 1 ? 'text-red-500' : dias <= 3 ? 'text-primary-600' : 'text-slate-400'}`}>
                          {dias < 0 ? `${Math.abs(dias)}d atrasado` : dias === 0 ? 'Vence hoje' : `${dias}d restantes`}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-4 text-[10px] text-slate-400 mt-1">
                      <span>Enviado: {formatDate(orc.created_at)}</span><span>Prazo: {formatDate(orc.prazo_retorno)}</span><span>Fila: #{orc.ordem_atendimento}</span>
                    </div>
                    {/* Mini value badge para concluídos */}
                    {orc.status === 'CONCLUIDO' && orc.diferenca_valor !== 0 && (
                      <div className="mt-1.5">
                        <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${orc.diferenca_valor < 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                          {orc.diferenca_valor < 0 ? <TrendingDown size={11}/> : <TrendingUp size={11}/>}
                          {orc.diferenca_valor < 0 ? 'Economia' : 'Aumento'}: {formatCurrency(Math.abs(orc.diferenca_valor))} ({Math.abs(orc.diferenca_percentual).toFixed(1)}%)
                        </span>
                      </div>
                    )}
                  </div>
                  {orc.arquivo_original_url && (
                    <button onClick={e => { e.stopPropagation(); downloadArquivo(orc.arquivo_original_url!, orc.arquivo_original_nome || 'original') }}
                      className="p-2 rounded-lg text-slate-300 hover:text-blue-600 hover:bg-blue-50 shrink-0" title="Baixar original"><Download size={16}/></button>
                  )}
                </div>

                {/* Arquivos do projeto (visível para qualquer status quando aberto) */}
                {aberto && orc.arquivos_projeto && orc.arquivos_projeto.length > 0 && (
                  <div className="border-t border-slate-100 bg-blue-50/30 p-4">
                    <p className="text-xs font-bold text-blue-700 mb-2">📐 Arquivos do Projeto</p>
                    <div className="flex flex-wrap gap-2">
                      {orc.arquivos_projeto.map((f: any, i: number) => (
                        <button key={i} onClick={() => downloadArquivo(f.path, f.nome)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-200 rounded-lg text-xs text-blue-700 hover:bg-blue-50 transition-colors">
                          <Download size={11}/> {f.nome} <span className="text-blue-400">({(f.size/1024).toFixed(0)} KB)</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Detalhe expandido — CONCLUÍDO */}
                {aberto && orc.status === 'CONCLUIDO' && (
                  <div className="border-t border-slate-100 bg-gradient-to-b from-emerald-50/50 to-white p-5">
                    {/* Valores */}
                    {(orc.valor_original > 0 || orc.valor_revisado > 0) && (
                      <div className="grid grid-cols-3 gap-3 mb-4">
                        <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                          <p className="text-[10px] text-slate-400 font-semibold uppercase">Orçamento Original</p>
                          <p className="text-lg font-bold text-slate-800">{formatCurrency(orc.valor_original)}</p>
                        </div>
                        <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                          <p className="text-[10px] text-slate-400 font-semibold uppercase">Orçamento Revisado</p>
                          <p className="text-lg font-bold text-slate-800">{formatCurrency(orc.valor_revisado)}</p>
                        </div>
                        <div className={`rounded-xl p-3 text-center border ${orc.diferenca_valor < 0 ? 'bg-emerald-50 border-emerald-200' : orc.diferenca_valor > 0 ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                          <p className="text-[10px] font-semibold uppercase" style={{ color: orc.diferenca_valor < 0 ? '#047857' : orc.diferenca_valor > 0 ? '#b91c1c' : '#64748b' }}>
                            {orc.diferenca_valor < 0 ? 'Economia' : orc.diferenca_valor > 0 ? 'Aumento' : 'Sem alteração'}
                          </p>
                          <p className={`text-lg font-bold ${orc.diferenca_valor < 0 ? 'text-emerald-700' : orc.diferenca_valor > 0 ? 'text-red-700' : 'text-slate-600'}`}>
                            {formatCurrency(Math.abs(orc.diferenca_valor))}
                          </p>
                          <p className="text-[10px] text-slate-400">{Math.abs(orc.diferenca_percentual).toFixed(2)}%</p>
                        </div>
                      </div>
                    )}

                    {/* Info da revisão */}
                    <div className="flex items-center gap-4 text-xs text-slate-500 mb-3">
                      <span>Concluído: <strong className="text-slate-700">{orc.data_conclusao ? formatDate(orc.data_conclusao) : '—'}</strong></span>
                      <span>{orc.qtd_alteracoes} alteração(ões)</span>
                    </div>

                    {orc.observacoes_revisor && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                        <p className="text-xs font-semibold text-blue-800 mb-1">Observações do Revisor:</p>
                        <p className="text-xs text-blue-700">{orc.observacoes_revisor}</p>
                      </div>
                    )}

                    {/* Alterações — visual bonito */}
                    {orc.comparativo_resumo && orc.comparativo_resumo.length > 0 && (
                      <div className="mb-4">
                        <p className="text-xs font-bold text-slate-700 mb-2">Alterações realizadas:</p>
                        <div className="space-y-1.5 max-h-72 overflow-y-auto">
                          {orc.comparativo_resumo.map((item: any, i: number) => {
                            const desc = item.descricao || item
                            const isAdd = String(desc).startsWith('✚')
                            const isRem = String(desc).startsWith('✖')
                            const isEdit = String(desc).startsWith('✎')
                            return (
                              <div key={i} className={`flex items-start gap-2 px-3 py-2 rounded-lg text-xs ${
                                isRem ? 'bg-red-50 border border-red-100' :
                                isAdd ? 'bg-emerald-50 border border-emerald-100' :
                                isEdit ? 'bg-primary-50 border border-primary-100' :
                                'bg-slate-50 border border-slate-100'
                              }`}>
                                <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5 ${
                                  isRem ? 'bg-red-200 text-red-700' : isAdd ? 'bg-emerald-200 text-emerald-700' : isEdit ? 'bg-primary-200 text-primary-700' : 'bg-slate-200 text-slate-600'
                                }`}>{isRem ? '−' : isAdd ? '+' : '~'}</span>
                                <p className="text-slate-700 leading-relaxed">{String(desc).replace(/^[✚✖✎]\s*/, '')}</p>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Download revisado + Retorno fiscal */}
                    {orc.arquivo_revisado_url && (
                      <div className="flex items-center gap-3 flex-wrap">
                        <button onClick={() => downloadArquivo(orc.arquivo_revisado_url!, orc.arquivo_revisado_nome || 'revisado.xlsx')}
                          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium shadow-sm">
                          <Download size={14}/> Baixar Orçamento Revisado
                        </button>
                        {orc.status === 'CONCLUIDO' && (
                          <button onClick={() => { setFiscalModal(orc.id); setFiscalArquivo(null); setFiscalValor(''); setFiscalObs(''); setFiscalComp(null) }}
                            className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium shadow-sm">
                            <Scissors size={14}/> Enviar Retorno do Fiscal
                          </button>
                        )}
                      </div>
                    )}

                    {/* Retorno fiscal — dados */}
                    {orc.status === 'RETORNO_FISCAL' && (
                      <div className="mt-4 bg-purple-50 border border-purple-200 rounded-xl p-4">
                        <p className="text-xs font-bold text-purple-800 mb-3 flex items-center gap-1.5">
                          <Scissors size={13}/> Retorno do Fiscal — {orc.data_retorno_fiscal ? formatDate(orc.data_retorno_fiscal) : ''}
                        </p>

                        {/* Valores comparativo: revisado vs aprovado */}
                        <div className="grid grid-cols-3 gap-3 mb-3">
                          <div className="bg-white border border-slate-200 rounded-lg p-2.5 text-center">
                            <p className="text-[10px] text-slate-400 font-semibold">Nosso Revisado</p>
                            <p className="text-sm font-bold text-slate-800">{formatCurrency(orc.valor_revisado)}</p>
                          </div>
                          <div className="bg-white border border-slate-200 rounded-lg p-2.5 text-center">
                            <p className="text-[10px] text-slate-400 font-semibold">Aprovado Fiscal</p>
                            <p className="text-sm font-bold text-slate-800">{formatCurrency(orc.valor_aprovado_fiscal)}</p>
                          </div>
                          <div className={`rounded-lg p-2.5 text-center ${orc.valor_glosado > 0 ? 'bg-red-50 border border-red-200' : 'bg-emerald-50 border border-emerald-200'}`}>
                            <p className="text-[10px] font-semibold" style={{ color: orc.valor_glosado > 0 ? '#b91c1c' : '#047857' }}>
                              {orc.valor_glosado > 0 ? 'Glosado' : 'Sem glosa'}
                            </p>
                            <p className={`text-sm font-bold ${orc.valor_glosado > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                              {formatCurrency(orc.valor_glosado)}
                            </p>
                            {orc.valor_revisado > 0 && orc.valor_glosado > 0 && (
                              <p className="text-[9px] text-red-500">{((orc.valor_glosado / orc.valor_revisado) * 100).toFixed(1)}% do revisado</p>
                            )}
                          </div>
                        </div>

                        {orc.obs_fiscal && <p className="text-xs text-purple-700 italic mb-2">"{orc.obs_fiscal}"</p>}

                        {orc.glosas_resumo && orc.glosas_resumo.length > 0 && (
                          <details className="group">
                            <summary className="text-[10px] font-semibold text-purple-600 cursor-pointer hover:underline">
                              {orc.glosas_resumo.length} serviço(s) glosado(s) / alterado(s) — clique para ver
                            </summary>
                            <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                              {orc.glosas_resumo.map((g: any, i: number) => {
                                const d = g.descricao || g
                                const isR = String(d).startsWith('✖')
                                return (
                                  <div key={i} className={`flex items-start gap-2 px-2 py-1 rounded text-[10px] ${isR ? 'bg-red-50' : 'bg-primary-50'}`}>
                                    <span className={`shrink-0 font-bold ${isR ? 'text-red-500' : 'text-primary-500'}`}>{isR ? '✖' : '✎'}</span>
                                    <span className="text-slate-600">{String(d).replace(/^[✖✎]\s*/, '')}</span>
                                  </div>
                                )
                              })}
                            </div>
                          </details>
                        )}

                        {orc.arquivo_fiscal_url && (
                          <button onClick={() => downloadArquivo(orc.arquivo_fiscal_url!, orc.arquivo_fiscal_nome || 'fiscal.xlsx')}
                            className="flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-medium mt-3">
                            <Download size={12}/> Baixar Versão Aprovada pelo Fiscal
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal retorno fiscal */}
      {fiscalModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setFiscalModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-100">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <Scissors size={18} className="text-purple-500"/> Retorno do Fiscal
              </h2>
              <p className="text-xs text-slate-500 mt-1">{orcamentos.find(o => o.id === fiscalModal)?.titulo}</p>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-xs text-purple-700">
                Anexe a versão do orçamento que o fiscal aprovou. O sistema irá comparar automaticamente com a versão que entregamos (revisada) e identificar os serviços glosados.
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Arquivo aprovado pelo fiscal *</label>
                <input type="file" accept=".xlsx,.xls,.pdf,.ods" onChange={e => { const f = e.target.files?.[0]; if (f) handleFiscalArquivo(f) }}
                  className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white"/>
                {fiscalArquivo && <p className="text-[10px] text-slate-500 mt-1">{fiscalArquivo.name} ({(fiscalArquivo.size/1024).toFixed(0)} KB)</p>}
                {fiscalComparando && <div className="flex items-center gap-2 mt-2 text-xs text-purple-600"><Loader2 size={12} className="animate-spin"/> Comparando com o revisado...</div>}
              </div>

              {fiscalComp && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-xs font-bold text-red-800 mb-1">Glosas Detectadas</p>
                  <div className="flex gap-3 text-[10px] mb-2">
                    <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">{fiscalComp.resumo.removidos} removido(s)</span>
                    <span className="px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 font-medium">{fiscalComp.resumo.alterados} alterado(s)</span>
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Valor aprovado pelo fiscal (R$)</label>
                <input value={fiscalValor} onChange={e => setFiscalValor(e.target.value)} placeholder="Ex: 230000.00"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"/>
                {(() => {
                  const orc = orcamentos.find(o => o.id === fiscalModal)
                  const vA = Number(String(fiscalValor).replace(/[^\d.,]/g, '').replace(',', '.')) || 0
                  const glosado = orc && orc.valor_revisado > 0 && vA > 0 ? orc.valor_revisado - vA : 0
                  return glosado > 0 ? (
                    <p className="text-xs text-red-600 font-bold mt-1">
                      <AlertTriangle size={11} className="inline mr-1"/>
                      Glosa de {formatCurrency(glosado)} ({((glosado / (orc?.valor_revisado || 1)) * 100).toFixed(1)}%)
                    </p>
                  ) : null
                })()}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Observações</label>
                <textarea value={fiscalObs} onChange={e => setFiscalObs(e.target.value)} rows={2}
                  placeholder="Ex: Fiscal glosou itens de pintura e revestimento..."
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs"/>
              </div>
            </div>
            <div className="p-5 border-t border-slate-100 flex gap-3">
              <button onClick={() => setFiscalModal(null)} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm">Cancelar</button>
              <button onClick={enviarRetornoFiscal} disabled={fiscalEnviando}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg text-sm disabled:opacity-50">
                {fiscalEnviando ? <Loader2 size={14} className="animate-spin"/> : <Scissors size={14}/>} Enviar Retorno
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
