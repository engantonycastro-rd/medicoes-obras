import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ClipboardList, RefreshCw, Filter, Search, ChevronDown, ChevronUp, MapPin,
  Sun, Cloud, CloudRain, CloudDrizzle, Users, Camera, AlertTriangle, CheckCircle2,
  XCircle, Clock, Download, Eye, Calendar, User, HardHat, FileDown, X, Smartphone,
} from 'lucide-react'
import toast from 'react-hot-toast'
import ExcelJS from 'exceljs'
import { formatDate, formatCurrency } from '../utils/calculations'
import { supabase } from '../lib/supabase'
import { usePerfilStore } from '../lib/perfilStore'

interface Apontamento {
  id: string; created_at: string; obra_id: string; apontador_id: string
  data: string; hora: string; turno: string; clima: string
  latitude: number | null; longitude: number | null
  atividades: string | null; equipamentos: string | null
  ocorrencias: any[]; observacoes: string | null
}
interface AptMaoObra { funcao_nome: string; quantidade: number }
interface AptFoto { id: string; url: string; path: string; nome: string | null; legenda: string | null }
interface AptPQE { kanban_item_desc: string; status: string; observacao: string | null }
interface Perfil { id: string; nome: string | null; email: string }
interface ObraRef { id: string; nome_obra: string }

const CLIMA_ICON: Record<string, any> = { SOL: Sun, NUBLADO: Cloud, CHUVA: CloudRain, CHUVOSO: CloudDrizzle }
const CLIMA_LABEL: Record<string, string> = { SOL: 'Sol', NUBLADO: 'Nublado', CHUVA: 'Chuva', CHUVOSO: 'Chuvoso' }
const TURNO_LABEL: Record<string, string> = { MANHA: 'Manhã', TARDE: 'Tarde', INTEGRAL: 'Integral' }

export function ApontamentosAdminPage() {
  const { perfilAtual } = usePerfilStore()
  const navigate = useNavigate()
  const [apontamentos, setApontamentos] = useState<Apontamento[]>([])
  const [perfis, setPerfis] = useState<Record<string, Perfil>>({})
  const [obras, setObras] = useState<Record<string, ObraRef>>({})
  const [loading, setLoading] = useState(true)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [detalhesMO, setDetalhesMO] = useState<Record<string, AptMaoObra[]>>({})
  const [detalhesFoto, setDetalhesFoto] = useState<Record<string, AptFoto[]>>({})
  const [detalhesPQE, setDetalhesPQE] = useState<Record<string, AptPQE[]>>({})
  const [lightbox, setLightbox] = useState<string | null>(null)

  // Filtros
  const [filtroObra, setFiltroObra] = useState('todas')
  const [filtroData, setFiltroData] = useState('')
  const [filtroDataFim, setFiltroDataFim] = useState('')
  const [filtroBusca, setFiltroBusca] = useState('')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const { data } = await supabase.from('apontamentos').select('*').order('data', { ascending: false }).order('hora', { ascending: false }).limit(200)
    if (data) {
      setApontamentos(data as Apontamento[])
      const userIds = new Set(data.map((a: any) => a.apontador_id))
      const obraIds = new Set(data.map((a: any) => a.obra_id))
      if (userIds.size > 0) {
        const { data: pData } = await supabase.from('perfis').select('id, nome, email').in('id', [...userIds])
        if (pData) { const m: Record<string, Perfil> = {}; pData.forEach((p: any) => { m[p.id] = p }); setPerfis(m) }
      }
      if (obraIds.size > 0) {
        const { data: oData } = await supabase.from('obras').select('id, nome_obra').in('id', [...obraIds])
        if (oData) { const m: Record<string, ObraRef> = {}; oData.forEach((o: any) => { m[o.id] = o }); setObras(m) }
      }
    }
    setLoading(false)
  }

  async function expandir(apt: Apontamento) {
    if (expandido === apt.id) { setExpandido(null); return }
    setExpandido(apt.id)
    // Carrega detalhes
    if (!detalhesMO[apt.id]) {
      const { data } = await supabase.from('apontamento_mao_obra').select('quantidade, funcoes_mao_obra(nome)').eq('apontamento_id', apt.id).gt('quantidade', 0)
      if (data) setDetalhesMO(p => ({ ...p, [apt.id]: data.map((d: any) => ({ funcao_nome: d.funcoes_mao_obra?.nome || '?', quantidade: d.quantidade })) }))
    }
    if (!detalhesFoto[apt.id]) {
      const { data } = await supabase.from('apontamento_fotos').select('*').eq('apontamento_id', apt.id)
      if (data) setDetalhesFoto(p => ({ ...p, [apt.id]: data as AptFoto[] }))
    }
    if (!detalhesPQE[apt.id]) {
      const { data } = await supabase.from('apontamento_pqe').select('status, observacao, kanban_itens(descricao)').eq('apontamento_id', apt.id)
      if (data) setDetalhesPQE(p => ({ ...p, [apt.id]: data.map((d: any) => ({ kanban_item_desc: d.kanban_itens?.descricao || '?', status: d.status, observacao: d.observacao })) }))
    }
  }

  async function downloadFoto(path: string, nome: string) {
    const { data, error } = await supabase.storage.from('apontamentos').download(path)
    if (error || !data) { toast.error('Erro ao baixar'); return }
    const url = URL.createObjectURL(data); const a = document.createElement('a'); a.href = url; a.download = nome; a.click(); URL.revokeObjectURL(url)
  }

  const obrasLista = useMemo(() => Object.values(obras).sort((a, b) => a.nome_obra.localeCompare(b.nome_obra)), [obras])

  const filtrados = useMemo(() => {
    let list = apontamentos
    if (filtroObra !== 'todas') list = list.filter(a => a.obra_id === filtroObra)
    if (filtroData) list = list.filter(a => a.data >= filtroData)
    if (filtroDataFim) list = list.filter(a => a.data <= filtroDataFim)
    if (filtroBusca) {
      const q = filtroBusca.toLowerCase()
      list = list.filter(a => (a.atividades || '').toLowerCase().includes(q) || (a.observacoes || '').toLowerCase().includes(q) || (perfis[a.apontador_id]?.nome || '').toLowerCase().includes(q))
    }
    return list
  }, [apontamentos, filtroObra, filtroData, filtroDataFim, filtroBusca, perfis])

  const stats = useMemo(() => ({
    total: filtrados.length,
    comOcorrencia: filtrados.filter(a => a.ocorrencias && a.ocorrencias.length > 0).length,
    obrasVisitadas: new Set(filtrados.map(a => a.obra_id)).size,
    totalMO: 0, // seria necessario carregar MO de todos
  }), [filtrados])

  const nome = (id: string) => perfis[id]?.nome || perfis[id]?.email || '—'
  const obraNome = (id: string) => obras[id]?.nome_obra || '—'

  return (
    <div className="p-6 max-w-5xl overflow-y-auto" style={{ height: '100%' }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><ClipboardList size={24} className="text-primary-500"/> Apontamentos de Obra</h1>
          <p className="text-sm text-slate-500">Registros de visitas e conferências em campo</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchAll} className="flex items-center gap-2 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm hover:bg-slate-50 dark:hover:bg-slate-800"><RefreshCw size={14}/> Atualizar</button>
          <button onClick={() => navigate('/app')} className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg text-sm"><Smartphone size={14}/> Ir para apontar</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[10px] text-slate-400 uppercase font-semibold">Apontamentos</p>
          <p className="text-2xl font-bold text-slate-800">{stats.total}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[10px] text-slate-400 uppercase font-semibold">Obras visitadas</p>
          <p className="text-2xl font-bold text-slate-800">{stats.obrasVisitadas}</p>
        </div>
        <div className={`rounded-xl border p-4 ${stats.comOcorrencia > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
          <p className="text-[10px] uppercase font-semibold" style={{ color: stats.comOcorrencia > 0 ? '#991B1B' : '#94A3B8' }}>Com ocorrências</p>
          <p className={`text-2xl font-bold ${stats.comOcorrencia > 0 ? 'text-red-700' : 'text-slate-800'}`}>{stats.comOcorrencia}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 mb-5 flex-wrap bg-white border border-slate-200 rounded-xl p-3">
        <Filter size={14} className="text-slate-400"/>
        <select value={filtroObra} onChange={e => setFiltroObra(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white max-w-48">
          <option value="todas">Todas as obras</option>
          {obrasLista.map(o => <option key={o.id} value={o.id}>{o.nome_obra}</option>)}
        </select>
        <input type="date" value={filtroData} onChange={e => setFiltroData(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white"/>
        <span className="text-xs text-slate-400">até</span>
        <input type="date" value={filtroDataFim} onChange={e => setFiltroDataFim(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white"/>
        <div className="relative flex-1 min-w-36">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input value={filtroBusca} onChange={e => setFiltroBusca(e.target.value)} placeholder="Buscar..."
            className="w-full pl-7 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white"/>
        </div>
      </div>

      {/* Lista */}
      {filtrados.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-xl">
          <ClipboardList size={36} className="mx-auto text-slate-300 mb-3"/>
          <p className="text-slate-400">{loading ? 'Carregando...' : 'Nenhum apontamento encontrado'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtrados.map(apt => {
            const aberto = expandido === apt.id
            const ClimaIcon = CLIMA_ICON[apt.clima] || Sun
            const ocorrencias = Array.isArray(apt.ocorrencias) ? apt.ocorrencias : []
            const mo = detalhesMO[apt.id] || []
            const fotos = detalhesFoto[apt.id] || []
            const pqe = detalhesPQE[apt.id] || []

            return (
              <div key={apt.id} className={`bg-white border rounded-xl overflow-hidden transition-shadow hover:shadow-md ${ocorrencias.length > 0 ? 'border-red-200' : 'border-slate-200'}`}>
                <div className="p-4 flex items-center gap-4 cursor-pointer" onClick={() => expandir(apt)}>
                  <div className="text-center shrink-0 w-14">
                    <p className="text-lg font-bold text-slate-800">{new Date(apt.data + 'T12:00:00').getDate()}</p>
                    <p className="text-[10px] text-slate-400 uppercase">{new Date(apt.data + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' })}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-bold text-slate-800">{obraNome(apt.obra_id)}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">{TURNO_LABEL[apt.turno] || apt.turno}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium flex items-center gap-1">
                        <ClimaIcon size={9}/> {CLIMA_LABEL[apt.clima] || apt.clima}
                      </span>
                      {ocorrencias.length > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-bold flex items-center gap-1">
                          <AlertTriangle size={9}/> {ocorrencias.length} ocorrência(s)
                        </span>
                      )}
                    </div>
                    <div className="flex gap-4 text-[10px] text-slate-400">
                      <span className="flex items-center gap-1"><User size={9}/> {nome(apt.apontador_id)}</span>
                      <span className="flex items-center gap-1"><Clock size={9}/> {apt.hora?.substring(0, 5)}</span>
                      {apt.latitude && <span className="flex items-center gap-1"><MapPin size={9}/> GPS</span>}
                    </div>
                    {apt.atividades && <p className="text-xs text-slate-500 mt-1 truncate">{apt.atividades}</p>}
                  </div>
                  {aberto ? <ChevronUp size={16} className="text-primary-500"/> : <ChevronDown size={16} className="text-slate-400"/>}
                </div>

                {/* Detalhe expandido */}
                {aberto && (
                  <div className="border-t border-slate-100 bg-slate-50/50 p-5 space-y-4">
                    {/* Atividades */}
                    {apt.atividades && (
                      <div>
                        <p className="text-xs font-bold text-slate-700 mb-1">Atividades executadas</p>
                        <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{apt.atividades}</p>
                      </div>
                    )}

                    {/* Equipamentos */}
                    {apt.equipamentos && (
                      <div>
                        <p className="text-xs font-bold text-slate-700 mb-1">Equipamentos em uso</p>
                        <p className="text-xs text-slate-600">{apt.equipamentos}</p>
                      </div>
                    )}

                    {/* Mão de obra */}
                    {mo.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1"><Users size={12}/> Mão de obra</p>
                        <div className="flex flex-wrap gap-2">
                          {mo.map((m, i) => (
                            <div key={i} className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs">
                              <span className="text-slate-500">{m.funcao_nome}:</span> <span className="font-bold text-slate-800">{m.quantidade}</span>
                            </div>
                          ))}
                          <div className="bg-primary-50 border border-primary-200 rounded-lg px-3 py-1.5 text-xs">
                            <span className="text-primary-600">Total:</span> <span className="font-bold text-primary-800">{mo.reduce((s, m) => s + m.quantidade, 0)}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Conferência PQE */}
                    {pqe.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1"><CheckCircle2 size={12}/> Conferência PQE</p>
                        <div className="space-y-1.5">
                          {pqe.map((p, i) => (
                            <div key={i} className={`flex items-start gap-2 px-3 py-2 rounded-lg text-xs ${p.status === 'CONFIRMADO' ? 'bg-emerald-50 border border-emerald-100' : 'bg-red-50 border border-red-100'}`}>
                              {p.status === 'CONFIRMADO'
                                ? <CheckCircle2 size={13} className="text-emerald-500 mt-0.5 shrink-0"/>
                                : <XCircle size={13} className="text-red-500 mt-0.5 shrink-0"/>}
                              <div>
                                <span className="text-slate-700">{p.kanban_item_desc}</span>
                                {p.observacao && <p className="text-[10px] text-slate-500 mt-0.5 italic">{p.observacao}</p>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Ocorrências */}
                    {ocorrencias.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-red-700 mb-2 flex items-center gap-1"><AlertTriangle size={12}/> Ocorrências</p>
                        <div className="flex flex-wrap gap-1.5">
                          {ocorrencias.map((oc: any, i: number) => (
                            <span key={i} className="text-[10px] px-2 py-1 bg-red-100 text-red-700 rounded-full font-medium">{oc.tipo || oc}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Observações */}
                    {apt.observacoes && (
                      <div>
                        <p className="text-xs font-bold text-slate-700 mb-1">Observações</p>
                        <p className="text-xs text-slate-600 italic">{apt.observacoes}</p>
                      </div>
                    )}

                    {/* Fotos */}
                    {fotos.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1"><Camera size={12}/> Fotos ({fotos.length})</p>
                        <div className="grid grid-cols-4 gap-2">
                          {fotos.map(f => {
                            const publicUrl = supabase.storage.from('apontamentos').getPublicUrl(f.path).data.publicUrl
                            return (
                              <div key={f.id} className="relative rounded-lg overflow-hidden border border-slate-200 cursor-pointer group" onClick={() => setLightbox(publicUrl)}>
                                <img src={publicUrl} alt={f.legenda || f.nome || ''} className="w-full h-24 object-cover"/>
                                {f.legenda && <p className="text-[9px] text-slate-500 px-2 py-1 bg-white truncate">{f.legenda}</p>}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* GPS */}
                    {apt.latitude && apt.longitude && (
                      <div className="text-[10px] text-slate-400 flex items-center gap-1">
                        <MapPin size={10}/> {apt.latitude.toFixed(6)}, {apt.longitude.toFixed(6)}
                        <a href={`https://www.google.com/maps?q=${apt.latitude},${apt.longitude}`} target="_blank" rel="noopener"
                          className="text-blue-500 hover:underline ml-2">Abrir no Google Maps</a>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 p-2 bg-white/20 rounded-full text-white hover:bg-white/40"><X size={20}/></button>
          <img src={lightbox} className="max-w-full max-h-full object-contain rounded-lg"/>
        </div>
      )}
    </div>
  )
}
