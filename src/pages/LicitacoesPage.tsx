import { useEffect, useState, useMemo } from 'react'
import { Gavel, Plus, Search, Filter, RefreshCw, ChevronDown, ChevronUp, Send, CheckCircle2, XCircle, Download, Upload, Save, X, Loader2, AlertTriangle, TrendingUp, Clock, Trophy, DollarSign, FileText, User, Calendar, Building2, ArrowRight, MessageCircle, RotateCcw, Eye, Paperclip } from 'lucide-react'
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

interface Solicitacao {
  id: string; created_at: string; updated_at: string; licitacao_id: string; empresa_id: string
  solicitante_id: string; engenheiro_id: string; tipo: string; status: string
  descricao: string; prazo: string | null; prioridade: string; revisoes: number
}
interface SolicitacaoInteracao {
  id: string; created_at: string; solicitacao_id: string; autor_id: string
  acao: string; mensagem: string | null; arquivo_nome: string | null; arquivo_path: string | null
  arquivo_size: number; numero_revisao: number
}

const SOLIC_STATUS_LABELS: Record<string, string> = {
  ABERTA: 'Aberta', EM_ANDAMENTO: 'Em andamento', ENTREGUE: 'Entregue',
  EM_REVISAO: 'Em revisão', APROVADA: 'Aprovada', CANCELADA: 'Cancelada',
}
const SOLIC_STATUS_COLORS: Record<string, string> = {
  ABERTA: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  EM_ANDAMENTO: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  ENTREGUE: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
  EM_REVISAO: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  APROVADA: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  CANCELADA: 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400',
}
const SOLIC_ACAO_LABELS: Record<string, string> = {
  CRIADA: 'Solicitação criada', ASSUMIDA: 'Engenheiro assumiu', ENTREGUE: 'Entrega realizada',
  APROVADA: 'Aprovada pelo licitante', REVISAO: 'Revisão solicitada', RETOMADA: 'Engenheiro retomou',
  COMENTARIO: 'Comentário', CANCELADA: 'Cancelada',
}
const SOLIC_ACAO_COLORS: Record<string, string> = {
  CRIADA: 'text-blue-500', ASSUMIDA: 'text-yellow-500', ENTREGUE: 'text-teal-500',
  APROVADA: 'text-emerald-500', REVISAO: 'text-orange-500', RETOMADA: 'text-yellow-500',
  COMENTARIO: 'text-slate-400', CANCELADA: 'text-red-500',
}
const PRIORIDADE_COLORS: Record<string, string> = {
  BAIXA: 'bg-slate-100 text-slate-500', NORMAL: 'bg-blue-100 text-blue-600',
  ALTA: 'bg-orange-100 text-orange-700', URGENTE: 'bg-red-100 text-red-700',
}

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

  // Modal finalizar
  const [showFinalizar, setShowFinalizar] = useState<Licitacao | null>(null)
  const [resultadoFinal, setResultadoFinal] = useState('')

  // Modal converter contrato
  const [showConverter, setShowConverter] = useState<Licitacao | null>(null)
  const [gestorSel, setGestorSel] = useState('')

  // ─── SOLICITAÇÕES ───────────────────────────────────────────────────────────
  const [solicitacoes, setSolicitacoes] = useState<Record<string, Solicitacao[]>>({})
  const [interacoes, setInteracoes] = useState<Record<string, SolicitacaoInteracao[]>>({})
  const [showNovaSolic, setShowNovaSolic] = useState<string | null>(null) // licitacao_id
  const [showDetalheSolic, setShowDetalheSolic] = useState<Solicitacao | null>(null)
  const [solicMsg, setSolicMsg] = useState('')
  const [solicFile, setSolicFile] = useState<File | null>(null)
  const [solicSaving, setSolicSaving] = useState(false)
  // Form nova solicitação
  const [solicDesc, setSolicDesc] = useState('')
  const [solicTipo, setSolicTipo] = useState('READEQUACAO_PLANILHA')
  const [solicPrioridade, setSolicPrioridade] = useState('NORMAL')
  const [solicPrazo, setSolicPrazo] = useState('')
  const [solicEngId, setSolicEngId] = useState('')

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
    // Fetch solicitações
    if (!solicitacoes[lic.id]) {
      fetchSolicitacoes(lic.id)
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

  // ─── SOLICITAÇÕES FUNÇÕES ─────────────────────────────────────────────────
  async function fetchSolicitacoes(licId: string) {
    const { data: solics } = await supabase.from('licitacao_solicitacoes').select('*').eq('licitacao_id', licId).order('created_at', { ascending: false })
    if (solics) setSolicitacoes(prev => ({ ...prev, [licId]: solics }))
  }

  async function fetchInteracoes(solicId: string) {
    const { data: ints } = await supabase.from('licitacao_solicitacao_interacoes').select('*').eq('solicitacao_id', solicId).order('created_at', { ascending: true })
    if (ints) setInteracoes(prev => ({ ...prev, [solicId]: ints }))
  }

  async function criarSolicitacao(licId: string) {
    if (!solicDesc || !solicEngId) { toast.error('Preencha descrição e engenheiro'); return }
    setSolicSaving(true)
    const { data: solic, error } = await supabase.from('licitacao_solicitacoes').insert({
      licitacao_id: licId, empresa_id: empresa!.id,
      solicitante_id: perfilAtual!.id, engenheiro_id: solicEngId,
      tipo: solicTipo, descricao: solicDesc,
      prazo: solicPrazo || null, prioridade: solicPrioridade,
    }).select().single()
    if (error || !solic) { toast.error(error?.message || 'Erro'); setSolicSaving(false); return }

    // Primeira interação: CRIADA
    let arquivoPath = null, arquivoNome = null, arquivoSize = 0
    if (solicFile) {
      const path = `solicitacoes/${Date.now()}_${sanitize(solicFile.name)}`
      const { error: upErr } = await supabase.storage.from('licitacoes').upload(path, solicFile)
      if (!upErr) { arquivoPath = path; arquivoNome = solicFile.name; arquivoSize = solicFile.size }
    }
    await supabase.from('licitacao_solicitacao_interacoes').insert({
      solicitacao_id: solic.id, autor_id: perfilAtual!.id, acao: 'CRIADA',
      mensagem: solicDesc, arquivo_nome: arquivoNome, arquivo_path: arquivoPath, arquivo_size: arquivoSize,
    })

    // Notificação para o engenheiro
    const eng = perfis.find(p => p.id === solicEngId)
    const lic = licitacoes.find(l => l.id === licId)
    await supabase.from('notificacoes').insert({
      user_id: solicEngId, tipo: 'alerta',
      titulo: 'Nova solicitação de licitação',
      mensagem: `${perfilAtual?.nome || 'Licitante'} solicitou ${solicTipo === 'READEQUACAO_PLANILHA' ? 'readequação de planilha' : solicTipo.toLowerCase()} para a licitação ${lic?.numero_edital}. Prioridade: ${solicPrioridade}.`,
      link: '/setor-licitacao',
    })

    // Histórico da licitação
    await supabase.from('licitacao_historico').insert({
      licitacao_id: licId, acao: 'SOLICITACAO',
      descricao: `Solicitação criada para ${eng?.nome || 'Engenheiro'}: ${solicTipo === 'READEQUACAO_PLANILHA' ? 'Readequação de planilha' : solicTipo}`,
      user_id: perfilAtual?.id,
    })

    toast.success('Solicitação criada!')
    setSolicSaving(false); setShowNovaSolic(null)
    setSolicDesc(''); setSolicFile(null); setSolicPrazo(''); setSolicPrioridade('NORMAL'); setSolicTipo('READEQUACAO_PLANILHA'); setSolicEngId('')
    fetchSolicitacoes(licId)
  }

  async function acaoSolicitacao(solic: Solicitacao, acao: string, novoStatus: string) {
    if ((acao === 'REVISAO' || acao === 'ENTREGUE' || acao === 'COMENTARIO') && !solicMsg && !solicFile) {
      toast.error(acao === 'COMENTARIO' ? 'Digite uma mensagem' : 'Adicione uma mensagem ou arquivo'); return
    }
    setSolicSaving(true)

    // Upload arquivo se houver
    let arquivoPath = null, arquivoNome = null, arquivoSize = 0
    if (solicFile) {
      const path = `solicitacoes/${Date.now()}_${sanitize(solicFile.name)}`
      const { error: upErr } = await supabase.storage.from('licitacoes').upload(path, solicFile)
      if (!upErr) { arquivoPath = path; arquivoNome = solicFile.name; arquivoSize = solicFile.size }
    }

    // Criar interação
    await supabase.from('licitacao_solicitacao_interacoes').insert({
      solicitacao_id: solic.id, autor_id: perfilAtual!.id, acao,
      mensagem: solicMsg || null, arquivo_nome: arquivoNome, arquivo_path: arquivoPath, arquivo_size: arquivoSize,
      numero_revisao: acao === 'REVISAO' ? solic.revisoes + 1 : solic.revisoes,
    })

    // Atualizar status da solicitação
    const updates: any = { status: novoStatus }
    if (acao === 'REVISAO') updates.revisoes = solic.revisoes + 1
    await supabase.from('licitacao_solicitacoes').update(updates).eq('id', solic.id)

    // Notificar a outra parte
    const destinatario = acao === 'ENTREGUE' || acao === 'RETOMADA' ? solic.solicitante_id : solic.engenheiro_id
    const lic = licitacoes.find(l => l.id === solic.licitacao_id)
    const tituloNotif = acao === 'ENTREGUE' ? 'Solicitação entregue' : acao === 'REVISAO' ? 'Revisão solicitada' : acao === 'APROVADA' ? 'Solicitação aprovada' : acao === 'RETOMADA' ? 'Trabalho retomado' : 'Atualização na solicitação'
    await supabase.from('notificacoes').insert({
      user_id: destinatario, tipo: acao === 'APROVADA' ? 'sucesso' : 'alerta',
      titulo: tituloNotif,
      mensagem: `Licitação ${lic?.numero_edital}: ${solicMsg || SOLIC_ACAO_LABELS[acao]}${acao === 'REVISAO' ? ` (revisão #${solic.revisoes + 1})` : ''}`,
      link: '/setor-licitacao',
    })

    toast.success(SOLIC_ACAO_LABELS[acao])
    setSolicSaving(false); setSolicMsg(''); setSolicFile(null)
    // Recarregar
    const { data: updated } = await supabase.from('licitacao_solicitacoes').select('*').eq('id', solic.id).single()
    if (updated) setShowDetalheSolic(updated)
    fetchInteracoes(solic.id)
    fetchSolicitacoes(solic.licitacao_id)
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

                    {!['VENCEDORA','NAO_CLASSIFICADA','DESISTENCIA','INABILITADA','REVOGADA'].includes(lic.status) && (
                      <button onClick={() => { setSolicDesc(''); setSolicFile(null); setSolicPrazo(''); setSolicPrioridade('NORMAL'); setSolicTipo('READEQUACAO_PLANILHA'); setSolicEngId(''); setShowNovaSolic(lic.id) }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded-lg"><Send size={12}/> Nova solicitação</button>
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

                  {/* ── SOLICITAÇÕES ──────────────────────────────────── */}
                  {(solicitacoes[lic.id] || []).length > 0 && (
                    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
                      <p className="text-xs font-bold text-slate-700 dark:text-white mb-2 flex items-center gap-2">
                        <MessageCircle size={12}/> Solicitações ({(solicitacoes[lic.id] || []).length})
                      </p>
                      <div className="space-y-1.5">
                        {(solicitacoes[lic.id] || []).map(s => (
                          <div key={s.id} className="flex items-center gap-2 py-2 px-3 rounded-lg border border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 cursor-pointer"
                            onClick={async () => { setShowDetalheSolic(s); setSolicMsg(''); setSolicFile(null); await fetchInteracoes(s.id) }}>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-medium text-slate-800 dark:text-white truncate">{s.descricao.length > 60 ? s.descricao.slice(0, 60) + '...' : s.descricao}</span>
                              </div>
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                Para: {getNome(s.engenheiro_id)} · {new Date(s.created_at).toLocaleDateString('pt-BR')}
                                {s.revisoes > 0 && <span className="text-orange-500 font-bold ml-1">· {s.revisoes} revisão(ões)</span>}
                              </p>
                            </div>
                            <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap ${SOLIC_STATUS_COLORS[s.status]}`}>
                              {SOLIC_STATUS_LABELS[s.status]}
                            </span>
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${PRIORIDADE_COLORS[s.prioridade]}`}>
                              {s.prioridade}
                            </span>
                            <Eye size={14} className="text-slate-400 flex-shrink-0"/>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
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

      {/* ── MODAL NOVA SOLICITAÇÃO ─────────────────────────────── */}
      {showNovaSolic && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-4">
            <h2 className="text-lg font-bold dark:text-white flex items-center gap-2"><Send size={18} className="text-blue-500"/> Nova solicitação</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">O engenheiro receberá a solicitação e poderá trabalhar na entrega. Você acompanha tudo pela timeline.</p>

            <div><label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Engenheiro *</label>
              <select value={solicEngId} onChange={e => setSolicEngId(e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm">
                <option value="">Selecione...</option>{engenheiros.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></div>

            <div><label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Tipo</label>
              <select value={solicTipo} onChange={e => setSolicTipo(e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm">
                <option value="READEQUACAO_PLANILHA">Readequação de planilha</option>
                <option value="PROPOSTA_TECNICA">Proposta técnica</option>
                <option value="MEMORIA_CALCULO">Memória de cálculo</option>
                <option value="OUTRO">Outro</option>
              </select></div>

            <div><label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Descrição *</label>
              <textarea value={solicDesc} onChange={e => setSolicDesc(e.target.value)} rows={3} placeholder="Descreva o que precisa ser feito..."
                className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/></div>

            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Prioridade</label>
                <select value={solicPrioridade} onChange={e => setSolicPrioridade(e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm">
                  <option value="BAIXA">Baixa</option><option value="NORMAL">Normal</option><option value="ALTA">Alta</option><option value="URGENTE">Urgente</option>
                </select></div>
              <div><label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Prazo</label>
                <input type="date" value={solicPrazo} onChange={e => setSolicPrazo(e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/></div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 block mb-1">Anexo (opcional)</label>
              <label className="flex items-center gap-2 text-xs text-primary-500 cursor-pointer hover:text-primary-700">
                <Paperclip size={12}/> {solicFile ? solicFile.name : 'Anexar arquivo'}
                <input type="file" className="hidden" onChange={e => { if (e.target.files?.[0]) setSolicFile(e.target.files[0]) }}/>
              </label>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setShowNovaSolic(null)} className="px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-600 dark:text-slate-400">Cancelar</button>
              <button onClick={() => criarSolicitacao(showNovaSolic)} disabled={solicSaving}
                className="flex items-center gap-2 px-5 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg text-sm disabled:opacity-50">
                {solicSaving ? <Loader2 size={14} className="animate-spin"/> : <Send size={14}/>} Criar solicitação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL DETALHE SOLICITAÇÃO (TIMELINE) ──────────────── */}
      {showDetalheSolic && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-6 overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-xl mx-4 mb-10">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold dark:text-white flex items-center gap-2">
                    <MessageCircle size={18} className="text-blue-500"/> Solicitação
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    De: {getNome(showDetalheSolic.solicitante_id)} → Para: {getNome(showDetalheSolic.engenheiro_id)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${SOLIC_STATUS_COLORS[showDetalheSolic.status]}`}>
                    {SOLIC_STATUS_LABELS[showDetalheSolic.status]}
                  </span>
                  {showDetalheSolic.revisoes > 0 && (
                    <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                      {showDetalheSolic.revisoes}× revisão
                    </span>
                  )}
                  <button onClick={() => setShowDetalheSolic(null)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"><X size={16}/></button>
                </div>
              </div>

              {/* Info */}
              <div className="grid grid-cols-3 gap-2 mt-3 text-[10px]">
                <div><span className="text-slate-400">Tipo:</span> <span className="font-medium text-slate-700 dark:text-white">{showDetalheSolic.tipo.replace(/_/g, ' ')}</span></div>
                <div><span className="text-slate-400">Prioridade:</span> <span className={`px-1.5 py-0.5 rounded font-bold ${PRIORIDADE_COLORS[showDetalheSolic.prioridade]}`}>{showDetalheSolic.prioridade}</span></div>
                <div><span className="text-slate-400">Prazo:</span> <span className="font-medium text-slate-700 dark:text-white">{showDetalheSolic.prazo ? new Date(showDetalheSolic.prazo + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</span></div>
              </div>
            </div>

            {/* Timeline */}
            <div className="px-6 py-4 max-h-[50vh] overflow-y-auto space-y-0">
              {(interacoes[showDetalheSolic.id] || []).map((inter, idx) => (
                <div key={inter.id} className="flex gap-3">
                  {/* Linha vertical da timeline */}
                  <div className="flex flex-col items-center">
                    <div className={`w-3 h-3 rounded-full flex-shrink-0 mt-1 ${SOLIC_ACAO_COLORS[inter.acao].replace('text-', 'bg-')}`}/>
                    {idx < (interacoes[showDetalheSolic.id] || []).length - 1 && (
                      <div className="w-0.5 flex-1 bg-slate-200 dark:bg-slate-700 my-1"/>
                    )}
                  </div>

                  <div className="flex-1 pb-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-medium ${SOLIC_ACAO_COLORS[inter.acao]}`}>{SOLIC_ACAO_LABELS[inter.acao]}</span>
                      <span className="text-[10px] text-slate-400">
                        por {getNome(inter.autor_id)} · {new Date(inter.created_at).toLocaleDateString('pt-BR')} {new Date(inter.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {inter.numero_revisao > 0 && inter.acao !== 'CRIADA' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-50 dark:bg-orange-900/20 text-orange-600 font-medium">Revisão #{inter.numero_revisao}</span>
                      )}
                    </div>
                    {inter.mensagem && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 bg-slate-50 dark:bg-slate-900/50 rounded-lg px-3 py-2">{inter.mensagem}</p>
                    )}
                    {inter.arquivo_nome && (
                      <button onClick={() => { const { data } = supabase.storage.from('licitacoes').getPublicUrl(inter.arquivo_path!); window.open(data.publicUrl, '_blank') }}
                        className="flex items-center gap-1.5 mt-1.5 text-[10px] text-blue-500 hover:text-blue-700 bg-blue-50 dark:bg-blue-900/20 rounded-lg px-2.5 py-1.5">
                        <Paperclip size={10}/> {inter.arquivo_nome} <span className="text-slate-400">({(inter.arquivo_size / 1024).toFixed(0)} KB)</span>
                        <Download size={10}/>
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {(interacoes[showDetalheSolic.id] || []).length === 0 && (
                <div className="text-center py-8 text-slate-400 text-xs">
                  <Loader2 size={18} className="animate-spin mx-auto mb-2"/> Carregando timeline...
                </div>
              )}
            </div>

            {/* Ações baseadas no status e no papel do usuário */}
            {showDetalheSolic.status !== 'APROVADA' && showDetalheSolic.status !== 'CANCELADA' && (
              <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 space-y-3">
                {/* Input de mensagem + arquivo */}
                <div className="flex gap-2">
                  <input value={solicMsg} onChange={e => setSolicMsg(e.target.value)} placeholder="Mensagem (obrigatória para entrega e revisão)..."
                    className="flex-1 border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-xs"/>
                  <label className="flex items-center gap-1 px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-xs text-slate-500 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700">
                    <Paperclip size={12}/> {solicFile ? '1 arquivo' : 'Anexar'}
                    <input type="file" className="hidden" onChange={e => { if (e.target.files?.[0]) setSolicFile(e.target.files[0]) }}/>
                  </label>
                </div>

                {/* Botões de ação por status */}
                <div className="flex flex-wrap gap-2">
                  {/* ABERTA: Engenheiro pode assumir */}
                  {showDetalheSolic.status === 'ABERTA' && perfilAtual?.id === showDetalheSolic.engenheiro_id && (
                    <button onClick={() => acaoSolicitacao(showDetalheSolic, 'ASSUMIDA', 'EM_ANDAMENTO')} disabled={solicSaving}
                      className="flex items-center gap-1 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-medium rounded-lg disabled:opacity-50">
                      {solicSaving ? <Loader2 size={12} className="animate-spin"/> : <CheckCircle2 size={12}/>} Assumir solicitação
                    </button>
                  )}

                  {/* EM_ANDAMENTO: Engenheiro pode entregar */}
                  {showDetalheSolic.status === 'EM_ANDAMENTO' && perfilAtual?.id === showDetalheSolic.engenheiro_id && (
                    <button onClick={() => acaoSolicitacao(showDetalheSolic, 'ENTREGUE', 'ENTREGUE')} disabled={solicSaving || (!solicMsg && !solicFile)}
                      className="flex items-center gap-1 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white text-xs font-medium rounded-lg disabled:opacity-50">
                      {solicSaving ? <Loader2 size={12} className="animate-spin"/> : <Send size={12}/>} Entregar
                    </button>
                  )}

                  {/* EM_REVISAO: Engenheiro pode retomar */}
                  {showDetalheSolic.status === 'EM_REVISAO' && perfilAtual?.id === showDetalheSolic.engenheiro_id && (
                    <button onClick={() => acaoSolicitacao(showDetalheSolic, 'RETOMADA', 'EM_ANDAMENTO')} disabled={solicSaving}
                      className="flex items-center gap-1 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-medium rounded-lg disabled:opacity-50">
                      {solicSaving ? <Loader2 size={12} className="animate-spin"/> : <RotateCcw size={12}/>} Retomar trabalho
                    </button>
                  )}

                  {/* ENTREGUE: Licitante pode aprovar ou pedir revisão */}
                  {showDetalheSolic.status === 'ENTREGUE' && perfilAtual?.id === showDetalheSolic.solicitante_id && (
                    <>
                      <button onClick={() => acaoSolicitacao(showDetalheSolic, 'APROVADA', 'APROVADA')} disabled={solicSaving}
                        className="flex items-center gap-1 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium rounded-lg disabled:opacity-50">
                        {solicSaving ? <Loader2 size={12} className="animate-spin"/> : <CheckCircle2 size={12}/>} Aprovar
                      </button>
                      <button onClick={() => acaoSolicitacao(showDetalheSolic, 'REVISAO', 'EM_REVISAO')} disabled={solicSaving || (!solicMsg && !solicFile)}
                        className="flex items-center gap-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium rounded-lg disabled:opacity-50">
                        {solicSaving ? <Loader2 size={12} className="animate-spin"/> : <RotateCcw size={12}/>} Solicitar revisão
                      </button>
                    </>
                  )}

                  {/* Admin/SuperAdmin pode agir em qualquer status */}
                  {(perfilAtual?.role === 'ADMIN' || perfilAtual?.role === 'SUPERADMIN') && perfilAtual?.id !== showDetalheSolic.engenheiro_id && perfilAtual?.id !== showDetalheSolic.solicitante_id && (
                    <p className="text-[10px] text-slate-400 italic self-center">Como admin, as ações ficam disponíveis para o solicitante e o engenheiro designado.</p>
                  )}

                  {/* Comentário: qualquer um pode */}
                  <button onClick={() => { if (solicMsg) acaoSolicitacao(showDetalheSolic, 'COMENTARIO', showDetalheSolic.status) }} disabled={solicSaving || !solicMsg}
                    className="flex items-center gap-1 px-3 py-2 border border-slate-200 dark:border-slate-600 text-xs text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50 ml-auto">
                    <MessageCircle size={12}/> Comentar
                  </button>
                </div>
              </div>
            )}

            {/* Status final */}
            {(showDetalheSolic.status === 'APROVADA' || showDetalheSolic.status === 'CANCELADA') && (
              <div className={`px-6 py-3 text-center text-xs font-medium rounded-b-2xl ${showDetalheSolic.status === 'APROVADA' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}>
                {showDetalheSolic.status === 'APROVADA' ? '✓ Solicitação aprovada e concluída' : 'Solicitação cancelada'}
                {showDetalheSolic.revisoes > 0 && ` · Passou por ${showDetalheSolic.revisoes} revisão(ões)`}
              </div>
            )}
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
