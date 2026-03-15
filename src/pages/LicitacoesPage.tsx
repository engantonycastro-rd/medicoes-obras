import { useEffect, useState, useMemo } from 'react'
import { Gavel, Plus, Search, Filter, RefreshCw, ChevronDown, ChevronUp, Send, CheckCircle2, XCircle, Download, Upload, Save, X, Loader2, AlertTriangle, TrendingUp, Clock, Trophy, DollarSign, FileText, User, Calendar, Building2, ArrowRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { usePerfilStore } from '../lib/perfilStore'
import { useEmpresaStore } from '../lib/empresaStore'

interface Licitacao {
  id: string; created_at: string; updated_at: string; empresa_id: string
  numero_edital: string; modalidade: string; orgao: string; uf: string; cidade: string; objeto: string
  data_publicacao: string | null; data_abertura: string | null; data_resultado: string | null
  valor_estimado: number; desconto_tipo: string; desconto_percentual: number; desconto_valor: number; valor_proposta_final: number
  responsavel_id: string | null; engenheiro_designado_id: string | null
  status: string; observacoes: string | null; contrato_gerado_id: string | null
}
interface Documento { id: string; licitacao_id: string; tipo: string; nome: string; path: string; size: number; uploaded_by: string | null; data_validade: string | null; created_at: string }
interface Historico { id: string; licitacao_id: string; acao: string; descricao: string | null; user_id: string | null; created_at: string }

const STATUS_LABELS: Record<string, string> = {
  CADASTRADA: 'Cadastrada', EM_ANALISE: 'Em análise', PROPOSTA_PENDENTE: 'Proposta pendente',
  PROPOSTA_ENVIADA: 'Proposta enviada', LANCE_REALIZADO: 'Lance realizado',
  AGUARDANDO_RESULTADO: 'Aguardando resultado', VENCEDORA: 'Vencedora',
  NAO_CLASSIFICADA: 'Não classificada', DESISTENCIA: 'Desistência', INABILITADA: 'Inabilitada', REVOGADA: 'Revogada',
}
const STATUS_COLORS: Record<string, string> = {
  CADASTRADA: 'bg-blue-100 text-blue-700', EM_ANALISE: 'bg-yellow-100 text-yellow-700',
  PROPOSTA_PENDENTE: 'bg-orange-100 text-orange-700', PROPOSTA_ENVIADA: 'bg-indigo-100 text-indigo-700',
  LANCE_REALIZADO: 'bg-purple-100 text-purple-700', AGUARDANDO_RESULTADO: 'bg-amber-100 text-amber-700',
  VENCEDORA: 'bg-emerald-100 text-emerald-700', NAO_CLASSIFICADA: 'bg-red-100 text-red-700',
  DESISTENCIA: 'bg-slate-100 text-slate-600', INABILITADA: 'bg-red-100 text-red-700', REVOGADA: 'bg-slate-100 text-slate-600',
}
const MODALIDADES: Record<string, string> = {
  PREGAO: 'Pregão', CONCORRENCIA: 'Concorrência', TOMADA_PRECO: 'Tomada de Preço',
  CONVITE: 'Convite', RDC: 'RDC', DISPENSA: 'Dispensa', INEXIGIBILIDADE: 'Inexigibilidade',
}

function sanitize(n: string) { return n.replace(/[^a-zA-Z0-9._-]/g, '_') }

export function LicitacoesPage() {
  const { perfilAtual } = usePerfilStore()
  const { empresa } = useEmpresaStore()
  const [licitacoes, setLicitacoes] = useState<Licitacao[]>([])
  const [perfis, setPerfis] = useState<{ id: string; nome: string; role: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [busca, setBusca] = useState('')
  const [expandido, setExpandido] = useState<string | null>(null)
  const [docs, setDocs] = useState<Record<string, Documento[]>>({})
  const [historico, setHistorico] = useState<Record<string, Historico[]>>({})

  // Modal CRUD
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editando, setEditando] = useState<Licitacao | null>(null)
  const [abaModal, setAbaModal] = useState<'dados' | 'proposta' | 'docs' | 'historico'>('dados')

  // Form fields
  const [f, setF] = useState({
    numero_edital: '', modalidade: 'PREGAO', orgao: '', uf: 'RN', cidade: '', objeto: '',
    data_publicacao: '', data_abertura: '', data_resultado: '',
    valor_estimado: '', desconto_tipo: 'PERCENTUAL', desconto_percentual: '', desconto_valor: '', valor_proposta_final: '',
    responsavel_id: '', engenheiro_designado_id: '', status: 'CADASTRADA', observacoes: '',
  })

  // Modal encaminhamento
  const [showEncaminhar, setShowEncaminhar] = useState<string | null>(null)
  const [engSelecionado, setEngSelecionado] = useState('')

  // Modal finalizar
  const [showFinalizar, setShowFinalizar] = useState<Licitacao | null>(null)
  const [resultadoFinal, setResultadoFinal] = useState('')

  // Modal converter contrato
  const [showConverter, setShowConverter] = useState<Licitacao | null>(null)
  const [gestorSel, setGestorSel] = useState('')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [lRes, pRes] = await Promise.all([
      supabase.from('licitacoes').select('*').order('created_at', { ascending: false }),
      supabase.from('perfis').select('id, nome, role').eq('ativo', true),
    ])
    if (lRes.data) setLicitacoes(lRes.data)
    if (pRes.data) setPerfis(pRes.data)
    setLoading(false)
  }

  async function expandir(lic: Licitacao) {
    if (expandido === lic.id) { setExpandido(null); return }
    setExpandido(lic.id)
    if (!docs[lic.id]) {
      const { data: d } = await supabase.from('licitacao_documentos').select('*').eq('licitacao_id', lic.id).order('created_at')
      if (d) setDocs(prev => ({ ...prev, [lic.id]: d }))
    }
    if (!historico[lic.id]) {
      const { data: h } = await supabase.from('licitacao_historico').select('*').eq('licitacao_id', lic.id).order('created_at', { ascending: false })
      if (h) setHistorico(prev => ({ ...prev, [lic.id]: h }))
    }
  }

  function abrirNovo() {
    setEditando(null); setAbaModal('dados')
    setF({ numero_edital: '', modalidade: 'PREGAO', orgao: '', uf: 'RN', cidade: '', objeto: '',
      data_publicacao: '', data_abertura: '', data_resultado: '', valor_estimado: '',
      desconto_tipo: 'PERCENTUAL', desconto_percentual: '', desconto_valor: '', valor_proposta_final: '',
      responsavel_id: perfilAtual?.id || '', engenheiro_designado_id: '', status: 'CADASTRADA', observacoes: '' })
    setShowModal(true)
  }

  function abrirEditar(lic: Licitacao) {
    setEditando(lic); setAbaModal('dados')
    setF({
      numero_edital: lic.numero_edital, modalidade: lic.modalidade, orgao: lic.orgao, uf: lic.uf, cidade: lic.cidade, objeto: lic.objeto,
      data_publicacao: lic.data_publicacao || '', data_abertura: lic.data_abertura || '', data_resultado: lic.data_resultado || '',
      valor_estimado: String(lic.valor_estimado || ''), desconto_tipo: lic.desconto_tipo || 'PERCENTUAL',
      desconto_percentual: String(lic.desconto_percentual || ''), desconto_valor: String(lic.desconto_valor || ''),
      valor_proposta_final: String(lic.valor_proposta_final || ''),
      responsavel_id: lic.responsavel_id || '', engenheiro_designado_id: lic.engenheiro_designado_id || '',
      status: lic.status, observacoes: lic.observacoes || '',
    })
    setShowModal(true)
  }

  async function salvar() {
    if (!f.numero_edital || !f.orgao || !f.objeto) { toast.error('Preencha edital, órgão e objeto'); return }
    setSaving(true)
    const payload = {
      empresa_id: empresa!.id, numero_edital: f.numero_edital, modalidade: f.modalidade,
      orgao: f.orgao, uf: f.uf, cidade: f.cidade, objeto: f.objeto,
      data_publicacao: f.data_publicacao || null, data_abertura: f.data_abertura || null, data_resultado: f.data_resultado || null,
      valor_estimado: Number(f.valor_estimado) || 0, desconto_tipo: f.desconto_tipo,
      desconto_percentual: Number(f.desconto_percentual) || 0, desconto_valor: Number(f.desconto_valor) || 0,
      valor_proposta_final: Number(f.valor_proposta_final) || 0,
      responsavel_id: f.responsavel_id || null, engenheiro_designado_id: f.engenheiro_designado_id || null,
      status: f.status, observacoes: f.observacoes || null,
    }
    if (editando) {
      const { error } = await supabase.from('licitacoes').update(payload).eq('id', editando.id)
      if (error) toast.error(error.message); else { toast.success('Licitação atualizada!'); setShowModal(false); fetchAll() }
    } else {
      const { error } = await supabase.from('licitacoes').insert(payload)
      if (error) toast.error(error.message); else {
        toast.success('Licitação cadastrada!')
        await addHistorico(null, 'CADASTRO', `Licitação ${f.numero_edital} cadastrada`)
        setShowModal(false); fetchAll()
      }
    }
    setSaving(false)
  }

  async function addHistorico(licId: string | null, acao: string, desc: string) {
    if (!licId && licitacoes.length > 0) return
    try { await supabase.from('licitacao_historico').insert({ licitacao_id: licId, acao, descricao: desc, user_id: perfilAtual?.id }) } catch {}
  }

  // Upload de documento
  async function uploadDoc(licId: string, tipo: string, file: File) {
    const path = `${tipo.toLowerCase()}/${Date.now()}_${sanitize(file.name)}`
    const { error: upErr } = await supabase.storage.from('licitacoes').upload(path, file)
    if (upErr) { toast.error(upErr.message); return }
    await supabase.from('licitacao_documentos').insert({ licitacao_id: licId, tipo, nome: file.name, path, size: file.size, uploaded_by: perfilAtual?.id })
    toast.success(`${file.name} enviado!`)
    const { data } = await supabase.from('licitacao_documentos').select('*').eq('licitacao_id', licId).order('created_at')
    if (data) setDocs(prev => ({ ...prev, [licId]: data }))
    await supabase.from('licitacao_historico').insert({ licitacao_id: licId, acao: 'UPLOAD', descricao: `Documento "${file.name}" (${tipo}) enviado`, user_id: perfilAtual?.id })
  }

  function downloadDoc(doc: Documento) {
    const { data } = supabase.storage.from('licitacoes').getPublicUrl(doc.path)
    window.open(data.publicUrl, '_blank')
  }

  // Encaminhar para engenheiro
  async function encaminharEngenheiro(licId: string) {
    if (!engSelecionado) { toast.error('Selecione um engenheiro'); return }
    await supabase.from('licitacoes').update({ engenheiro_designado_id: engSelecionado, status: 'PROPOSTA_PENDENTE' }).eq('id', licId)
    const eng = perfis.find(p => p.id === engSelecionado)
    // Notificação para o engenheiro
    await supabase.from('notificacoes').insert({
      user_id: engSelecionado, tipo: 'alerta',
      titulo: 'Planilha readequada solicitada',
      mensagem: `Você foi designado para readequar a planilha da licitação ${licitacoes.find(l => l.id === licId)?.numero_edital}. Acesse o Setor de Licitação para baixar a planilha original e enviar a readequada.`,
      link: '/setor-licitacao',
    })
    await supabase.from('licitacao_historico').insert({ licitacao_id: licId, acao: 'ENCAMINHAMENTO', descricao: `Planilha encaminhada para ${eng?.nome || 'Engenheiro'}`, user_id: perfilAtual?.id })
    toast.success(`Planilha encaminhada para ${eng?.nome}!`)
    setShowEncaminhar(null); fetchAll()
  }

  // Finalizar licitação
  async function finalizar(lic: Licitacao) {
    if (!resultadoFinal) { toast.error('Selecione o resultado'); return }
    await supabase.from('licitacoes').update({ status: resultadoFinal, data_resultado: new Date().toISOString().split('T')[0] }).eq('id', lic.id)
    await supabase.from('licitacao_historico').insert({ licitacao_id: lic.id, acao: 'FINALIZADA', descricao: `Licitação finalizada como: ${STATUS_LABELS[resultadoFinal]}`, user_id: perfilAtual?.id })
    if (resultadoFinal === 'VENCEDORA') {
      await supabase.from('notificacoes').insert({ user_id: perfilAtual!.id, tipo: 'sucesso', titulo: 'Licitação vencedora!', mensagem: `A licitação ${lic.numero_edital} foi marcada como vencedora. Valor: R$ ${Number(lic.valor_proposta_final).toLocaleString('pt-BR')}` })
    }
    toast.success(`Licitação finalizada como ${STATUS_LABELS[resultadoFinal]}`)
    setShowFinalizar(null); setResultadoFinal(''); fetchAll()
  }

  // Converter em contrato
  async function converterContrato(lic: Licitacao) {
    setSaving(true)
    const { data: contrato, error } = await supabase.from('contratos').insert({
      empresa_id: empresa!.id, nome_obra: lic.objeto, local_obra: `${lic.cidade}/${lic.uf}`,
      numero_contrato: '', tipo: 'ESTADO', orgao_nome: lic.orgao, orgao_subdivisao: '',
      empresa_executora: empresa!.nome, desconto_percentual: Number(lic.desconto_percentual) / 100 || 0,
      valor_contrato: Number(lic.valor_proposta_final) || 0, status: 'ATIVO',
      user_id: perfilAtual!.id, licitacao_id: lic.id,
    }).select().single()
    if (error || !contrato) { toast.error(error?.message || 'Erro ao criar contrato'); setSaving(false); return }
    // Vincular gestor se selecionado
    if (gestorSel) {
      await supabase.from('contrato_gestores').insert({ contrato_id: contrato.id, gestor_id: gestorSel })
    }
    // Atualizar licitação com o contrato gerado
    await supabase.from('licitacoes').update({ contrato_gerado_id: contrato.id }).eq('id', lic.id)
    await supabase.from('licitacao_historico').insert({ licitacao_id: lic.id, acao: 'CONTRATO_GERADO', descricao: `Contrato gerado a partir da licitação. ${gestorSel ? 'Gestor designado: ' + (perfis.find(p => p.id === gestorSel)?.nome || '') : 'Sem gestor designado.'}`, user_id: perfilAtual?.id })
    toast.success('Contrato gerado com sucesso!')
    setShowConverter(null); setGestorSel(''); setSaving(false); fetchAll()
  }

  // Computed
  const getNome = (id: string | null) => perfis.find(p => p.id === id)?.nome || '—'
  const engenheiros = perfis.filter(p => p.role === 'ENGENHEIRO' || p.role === 'ADMIN' || p.role === 'SUPERADMIN')
  const gestores = perfis.filter(p => p.role === 'GESTOR' || p.role === 'ADMIN' || p.role === 'SUPERADMIN')
  const emAndamento = licitacoes.filter(l => !['VENCEDORA','NAO_CLASSIFICADA','DESISTENCIA','INABILITADA','REVOGADA'].includes(l.status))
  const vencedoras = licitacoes.filter(l => l.status === 'VENCEDORA')
  const valorGanho = vencedoras.reduce((s, l) => s + Number(l.valor_proposta_final), 0)
  const finalizadas = licitacoes.filter(l => ['VENCEDORA','NAO_CLASSIFICADA','DESISTENCIA','INABILITADA','REVOGADA'].includes(l.status))
  const taxaSucesso = finalizadas.length > 0 ? (vencedoras.length / finalizadas.length * 100) : 0

  const filtradas = useMemo(() => {
    let r = licitacoes
    if (filtroStatus !== 'todos') r = r.filter(l => l.status === filtroStatus)
    if (busca) r = r.filter(l => l.numero_edital.toLowerCase().includes(busca.toLowerCase()) || l.orgao.toLowerCase().includes(busca.toLowerCase()) || l.objeto.toLowerCase().includes(busca.toLowerCase()))
    return r
  }, [licitacoes, filtroStatus, busca])

  const diasRestantes = (data: string | null) => {
    if (!data) return null
    const diff = Math.ceil((new Date(data + 'T23:59:59').getTime() - Date.now()) / 86400000)
    return diff
  }

  return (
    <div className="p-6 max-w-6xl overflow-y-auto" style={{ height: '100%' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><Gavel size={24} className="text-primary-500"/> Setor de Licitação</h1>
          <p className="text-sm text-slate-500">Gerenciamento de editais, propostas e resultados</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchAll} className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm hover:bg-slate-50 dark:hover:bg-slate-800"><RefreshCw size={14}/></button>
          <button onClick={abrirNovo} className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg text-sm"><Plus size={14}/> Nova Licitação</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <div className="bg-blue-500 text-white rounded-xl p-4"><div className="flex items-center gap-2 mb-1 opacity-80"><Clock size={14}/><span className="text-[10px] uppercase">Em andamento</span></div><p className="text-2xl font-bold">{emAndamento.length}</p></div>
        <div className="bg-emerald-500 text-white rounded-xl p-4"><div className="flex items-center gap-2 mb-1 opacity-80"><Trophy size={14}/><span className="text-[10px] uppercase">Vencedoras</span></div><p className="text-2xl font-bold">{vencedoras.length}</p></div>
        <div className="bg-primary-500 text-white rounded-xl p-4"><div className="flex items-center gap-2 mb-1 opacity-80"><DollarSign size={14}/><span className="text-[10px] uppercase">Valor ganho</span></div><p className="text-2xl font-bold">R$ {valorGanho > 1000000 ? (valorGanho / 1000000).toFixed(1) + 'M' : valorGanho > 1000 ? (valorGanho / 1000).toFixed(0) + 'K' : valorGanho.toFixed(0)}</p></div>
        <div className="bg-purple-500 text-white rounded-xl p-4"><div className="flex items-center gap-2 mb-1 opacity-80"><TrendingUp size={14}/><span className="text-[10px] uppercase">Taxa de sucesso</span></div><p className="text-2xl font-bold">{taxaSucesso.toFixed(0)}%</p></div>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 mb-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
        <Filter size={14} className="text-slate-400"/>
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} className="border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-2 py-1.5 text-xs">
          <option value="todos">Todos os status</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div className="relative flex-1"><Search size={14} className="absolute left-3 top-2 text-slate-400"/>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar edital, órgão, objeto..." className="w-full pl-9 pr-3 py-1.5 border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg text-xs"/>
        </div>
      </div>

      {/* Lista */}
      {filtradas.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
          <Gavel size={36} className="mx-auto text-slate-300 mb-3"/>
          <p className="text-slate-400">{loading ? 'Carregando...' : 'Nenhuma licitação encontrada'}</p>
        </div>
      ) : (
        <div className="space-y-2">{filtradas.map(lic => {
          const aberto = expandido === lic.id
          const dias = diasRestantes(lic.data_abertura)
          return (
            <div key={lic.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <div className="p-4 flex items-center gap-4 cursor-pointer" onClick={() => expandir(lic)}>
                <div className="shrink-0 w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center">
                  <Gavel size={18} className="text-primary-500"/>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="text-sm font-bold text-slate-800 dark:text-white">{lic.numero_edital}</span>
                    <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${STATUS_COLORS[lic.status]}`}>{STATUS_LABELS[lic.status]}</span>
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 font-medium">{MODALIDADES[lic.modalidade]}</span>
                    {lic.contrato_gerado_id && <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold">Contrato gerado</span>}
                  </div>
                  <p className="text-xs text-slate-500 truncate">{lic.orgao} · {lic.cidade}/{lic.uf}</p>
                  <p className="text-[10px] text-slate-400 truncate">{lic.objeto}</p>
                </div>
                <div className="text-right shrink-0">
                  {Number(lic.valor_estimado) > 0 && <p className="text-sm font-bold text-slate-700 dark:text-white">R$ {Number(lic.valor_estimado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>}
                  {dias !== null && dias >= 0 && dias <= 7 && <p className="text-[10px] text-red-500 font-bold">{dias === 0 ? 'Hoje!' : `${dias}d para abertura`}</p>}
                  <p className="text-[10px] text-slate-400">{getNome(lic.responsavel_id)}</p>
                </div>
                {aberto ? <ChevronUp size={16} className="text-primary-500"/> : <ChevronDown size={16} className="text-slate-400"/>}
              </div>

              {aberto && (
                <div className="border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 p-5 space-y-4">
                  {/* Info grid */}
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div><span className="text-slate-400">Responsável:</span> <span className="font-medium text-slate-700 dark:text-white">{getNome(lic.responsavel_id)}</span></div>
                    <div><span className="text-slate-400">Engenheiro:</span> <span className="font-medium text-slate-700 dark:text-white">{getNome(lic.engenheiro_designado_id)}</span></div>
                    <div><span className="text-slate-400">Modalidade:</span> <span className="font-medium text-slate-700 dark:text-white">{MODALIDADES[lic.modalidade]}</span></div>
                    <div><span className="text-slate-400">Publicação:</span> <span className="font-medium">{lic.data_publicacao ? new Date(lic.data_publicacao + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</span></div>
                    <div><span className="text-slate-400">Abertura:</span> <span className="font-medium">{lic.data_abertura ? new Date(lic.data_abertura + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</span></div>
                    <div><span className="text-slate-400">Resultado:</span> <span className="font-medium">{lic.data_resultado ? new Date(lic.data_resultado + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</span></div>
                    <div><span className="text-slate-400">Valor estimado:</span> <span className="font-bold text-slate-700 dark:text-white">R$ {Number(lic.valor_estimado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
                    {Number(lic.valor_proposta_final) > 0 && <div><span className="text-slate-400">Proposta final:</span> <span className="font-bold text-emerald-600">R$ {Number(lic.valor_proposta_final).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>}
                    {Number(lic.desconto_percentual) > 0 && <div><span className="text-slate-400">Desconto:</span> <span className="font-bold text-blue-600">{Number(lic.desconto_percentual).toFixed(2)}%</span></div>}
                  </div>
                  {lic.observacoes && <p className="text-xs text-slate-500 italic">{lic.observacoes}</p>}

                  {/* Documentos */}
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
                    <p className="text-xs font-bold text-slate-700 dark:text-white mb-2 flex items-center gap-2"><FileText size={12}/> Documentos</p>
                    {(docs[lic.id] || []).length === 0 ? <p className="text-[10px] text-slate-400">Nenhum documento</p> : (
                      <div className="space-y-1">{(docs[lic.id] || []).map(d => (
                        <div key={d.id} className="flex items-center gap-2 text-xs py-1 border-b border-slate-50 dark:border-slate-700 last:border-0">
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 font-medium">{d.tipo}</span>
                          <span className="flex-1 text-slate-700 dark:text-white truncate">{d.nome}</span>
                          <button onClick={() => downloadDoc(d)} className="text-blue-500 hover:text-blue-700"><Download size={12}/></button>
                        </div>
                      ))}</div>
                    )}
                    <label className="mt-2 flex items-center gap-2 text-[10px] text-primary-500 cursor-pointer hover:text-primary-700">
                      <Upload size={12}/> Enviar documento
                      <input type="file" className="hidden" onChange={e => { if (e.target.files?.[0]) { const tipo = prompt('Tipo: EDITAL, PLANILHA_ORIGINAL, PLANILHA_READEQUADA, PROPOSTA, CERTIDAO, ATESTADO, OUTRO', 'OUTRO'); if (tipo) uploadDoc(lic.id, tipo.toUpperCase(), e.target.files[0]) } }}/>
                    </label>
                  </div>

                  {/* Histórico */}
                  {(historico[lic.id] || []).length > 0 && (
                    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
                      <p className="text-xs font-bold text-slate-700 dark:text-white mb-2">Histórico</p>
                      {(historico[lic.id] || []).slice(0, 5).map(h => (
                        <div key={h.id} className="flex items-center gap-2 text-[10px] py-1 border-b border-slate-50 dark:border-slate-700 last:border-0">
                          <span className="text-slate-400">{new Date(h.created_at).toLocaleDateString('pt-BR')} {new Date(h.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                          <span className="font-medium text-slate-600 dark:text-slate-300">{h.descricao}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Ações */}
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => abrirEditar(lic)} className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700">Editar</button>

                    {['CADASTRADA','EM_ANALISE'].includes(lic.status) && (
                      <button onClick={() => { setEngSelecionado(''); setShowEncaminhar(lic.id) }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded-lg"><Send size={12}/> Solicitar readequação</button>
                    )}

                    {['PROPOSTA_ENVIADA','LANCE_REALIZADO','AGUARDANDO_RESULTADO'].includes(lic.status) && (
                      <button onClick={() => { setResultadoFinal(''); setShowFinalizar(lic) }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-purple-500 hover:bg-purple-600 text-white text-xs font-medium rounded-lg"><CheckCircle2 size={12}/> Finalizar licitação</button>
                    )}

                    {lic.status === 'VENCEDORA' && !lic.contrato_gerado_id && (
                      <button onClick={() => { setGestorSel(''); setShowConverter(lic) }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium rounded-lg"><ArrowRight size={12}/> Converter em contrato</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}</div>
      )}

      {/* ── MODAL CRUD ───────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-6 overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 mb-10">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-bold dark:text-white">{editando ? 'Editar licitação' : 'Nova licitação'}</h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"><X size={18}/></button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Nº Edital *</label>
                  <input value={f.numero_edital} onChange={e => setF({ ...f, numero_edital: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/></div>
                <div><label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Modalidade</label>
                  <select value={f.modalidade} onChange={e => setF({ ...f, modalidade: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm">
                    {Object.entries(MODALIDADES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              </div>
              <div><label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Órgão licitante *</label>
                <input value={f.orgao} onChange={e => setF({ ...f, orgao: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">UF</label>
                  <input value={f.uf} onChange={e => setF({ ...f, uf: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/></div>
                <div><label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Cidade</label>
                  <input value={f.cidade} onChange={e => setF({ ...f, cidade: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/></div>
              </div>
              <div><label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Objeto *</label>
                <textarea value={f.objeto} onChange={e => setF({ ...f, objeto: e.target.value })} rows={2} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/></div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Data publicação</label>
                  <input type="date" value={f.data_publicacao} onChange={e => setF({ ...f, data_publicacao: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/></div>
                <div><label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Data abertura</label>
                  <input type="date" value={f.data_abertura} onChange={e => setF({ ...f, data_abertura: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/></div>
                <div><label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Data resultado</label>
                  <input type="date" value={f.data_resultado} onChange={e => setF({ ...f, data_resultado: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Valor estimado (R$)</label>
                  <input type="number" step="0.01" value={f.valor_estimado} onChange={e => setF({ ...f, valor_estimado: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/></div>
                <div><label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Valor proposta final (R$)</label>
                  <input type="number" step="0.01" value={f.valor_proposta_final} onChange={e => setF({ ...f, valor_proposta_final: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Tipo desconto</label>
                  <select value={f.desconto_tipo} onChange={e => setF({ ...f, desconto_tipo: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm">
                    <option value="PERCENTUAL">Percentual (%)</option><option value="VALOR">Valor (R$)</option></select></div>
                <div><label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Desconto %</label>
                  <input type="number" step="0.01" value={f.desconto_percentual} onChange={e => setF({ ...f, desconto_percentual: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/></div>
                <div><label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Desconto R$</label>
                  <input type="number" step="0.01" value={f.desconto_valor} onChange={e => setF({ ...f, desconto_valor: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Responsável</label>
                  <select value={f.responsavel_id} onChange={e => setF({ ...f, responsavel_id: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm">
                    <option value="">Selecione...</option>{perfis.map(p => <option key={p.id} value={p.id}>{p.nome} ({p.role})</option>)}</select></div>
                <div><label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Status</label>
                  <select value={f.status} onChange={e => setF({ ...f, status: e.target.value })} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm">
                    {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              </div>
              <textarea value={f.observacoes} onChange={e => setF({ ...f, observacoes: e.target.value })} placeholder="Observações" rows={2} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-700">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm">Cancelar</button>
              <button onClick={salvar} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg text-sm disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} {editando ? 'Atualizar' : 'Cadastrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL ENCAMINHAR ─────────────────────────────────────── */}
      {showEncaminhar && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
            <h2 className="text-lg font-bold dark:text-white flex items-center gap-2"><Send size={18} className="text-blue-500"/> Solicitar planilha readequada</h2>
            <p className="text-xs text-slate-500">O engenheiro receberá uma notificação e poderá baixar a planilha original e enviar a readequada.</p>
            <div><label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Engenheiro *</label>
              <select value={engSelecionado} onChange={e => setEngSelecionado(e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm">
                <option value="">Selecione...</option>{engenheiros.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowEncaminhar(null)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm">Cancelar</button>
              <button onClick={() => encaminharEngenheiro(showEncaminhar)} className="px-5 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg text-sm">Encaminhar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL FINALIZAR ──────────────────────────────────────── */}
      {showFinalizar && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
            <h2 className="text-lg font-bold dark:text-white">Finalizar licitação</h2>
            <p className="text-xs text-slate-500">Edital: <strong>{showFinalizar.numero_edital}</strong></p>
            <div className="space-y-2">
              <button onClick={() => setResultadoFinal('VENCEDORA')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left text-sm transition-all ${resultadoFinal === 'VENCEDORA' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 dark:border-slate-700'}`}>
                <Trophy size={18} className="text-emerald-500"/><div><p className="font-bold text-slate-800 dark:text-white">Vencedora</p><p className="text-[10px] text-slate-400">Fomos a empresa classificada</p></div></button>
              <button onClick={() => setResultadoFinal('NAO_CLASSIFICADA')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left text-sm transition-all ${resultadoFinal === 'NAO_CLASSIFICADA' ? 'border-red-500 bg-red-50' : 'border-slate-200 dark:border-slate-700'}`}>
                <XCircle size={18} className="text-red-500"/><div><p className="font-bold text-slate-800 dark:text-white">Não classificada</p><p className="text-[10px] text-slate-400">Outra empresa venceu</p></div></button>
              <button onClick={() => setResultadoFinal('DESISTENCIA')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left text-sm transition-all ${resultadoFinal === 'DESISTENCIA' ? 'border-slate-500 bg-slate-50' : 'border-slate-200 dark:border-slate-700'}`}>
                <X size={18} className="text-slate-500"/><div><p className="font-bold text-slate-800 dark:text-white">Desistência</p><p className="text-[10px] text-slate-400">Decidimos não participar</p></div></button>
              <button onClick={() => setResultadoFinal('INABILITADA')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left text-sm transition-all ${resultadoFinal === 'INABILITADA' ? 'border-red-500 bg-red-50' : 'border-slate-200 dark:border-slate-700'}`}>
                <AlertTriangle size={18} className="text-red-500"/><div><p className="font-bold text-slate-800 dark:text-white">Inabilitada</p><p className="text-[10px] text-slate-400">Documentação não aprovada</p></div></button>
              <button onClick={() => setResultadoFinal('REVOGADA')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left text-sm transition-all ${resultadoFinal === 'REVOGADA' ? 'border-slate-500 bg-slate-50' : 'border-slate-200 dark:border-slate-700'}`}>
                <XCircle size={18} className="text-slate-400"/><div><p className="font-bold text-slate-800 dark:text-white">Revogada</p><p className="text-[10px] text-slate-400">Órgão cancelou a licitação</p></div></button>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowFinalizar(null)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm">Cancelar</button>
              <button onClick={() => finalizar(showFinalizar)} disabled={!resultadoFinal} className="px-5 py-2 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg text-sm disabled:opacity-50">Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL CONVERTER EM CONTRATO ──────────────────────────── */}
      {showConverter && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-4">
            <h2 className="text-lg font-bold dark:text-white flex items-center gap-2"><ArrowRight size={18} className="text-emerald-500"/> Converter em contrato</h2>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs space-y-1">
              <p className="font-bold text-emerald-800">Dados que serão importados:</p>
              <p className="text-emerald-700">Nome: {showConverter.objeto}</p>
              <p className="text-emerald-700">Órgão: {showConverter.orgao}</p>
              <p className="text-emerald-700">Local: {showConverter.cidade}/{showConverter.uf}</p>
              <p className="text-emerald-700">Valor: R$ {Number(showConverter.valor_proposta_final).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
              {Number(showConverter.desconto_percentual) > 0 && <p className="text-emerald-700">Desconto: {Number(showConverter.desconto_percentual).toFixed(2)}%</p>}
            </div>
            <div><label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Designar gestor (opcional)</label>
              <select value={gestorSel} onChange={e => setGestorSel(e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm">
                <option value="">Sem gestor — a definir</option>{gestores.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>
              <p className="text-[10px] text-slate-400 mt-1">O gestor pode ser atribuído depois na tela de Contratos</p>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowConverter(null)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm">Cancelar</button>
              <button onClick={() => converterContrato(showConverter)} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg text-sm">
                {saving ? <Loader2 size={14} className="animate-spin"/> : <CheckCircle2 size={14}/>} Gerar contrato
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
