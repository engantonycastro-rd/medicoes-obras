import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Building2, ChevronRight, ChevronDown, Search,
  Trash2, Pencil, HardHat, FolderOpen, AlertCircle, CheckCircle2, PauseCircle,
  ArrowUp, ArrowDown, ArrowRightLeft, MapPin, Users, Filter,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '../lib/store'
import { usePerfilStore } from '../lib/perfilStore'
import { Contrato, Obra } from '../types'
import { formatDate, formatCurrency } from '../utils/calculations'
import { ContratoModal } from '../components/contracts/ContratoModal'
import { ObraModal } from '../components/contracts/ObraModal'
import { supabase } from '../lib/supabase'

export function ContratosPage() {
  const { contratos, fetchContratos, setContratoAtivo, deletarContrato,
          obras, fetchObras, setObraAtiva, deletarObra, atualizarObra, moverObra, loading } = useStore()
  const { perfilAtual } = usePerfilStore()
  const isAdmin = perfilAtual?.role === 'ADMIN'
  const [busca, setBusca] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState('todos')
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [obrasPorContrato, setObrasPorContrato] = useState<Record<string, Obra[]>>({})
  const [modalContrato, setModalContrato] = useState(false)
  const [editandoContrato, setEditandoContrato] = useState<Contrato | null>(null)
  const [modalObra, setModalObra] = useState<{ contratoId: string; obra?: Obra } | null>(null)
  const [moverModal, setMoverModal] = useState<{ obra: Obra; contratoAtual: string } | null>(null)
  const [gestoresPorContrato, setGestoresPorContrato] = useState<Record<string, string[]>>({})
  const [valorPorObra, setValorPorObra] = useState<Record<string, number>>({})
  const navigate = useNavigate()

  useEffect(() => { fetchContratos() }, [])

  useEffect(() => {
    if (contratos.length === 0) return
    let cancelled = false
    async function loadAll() {
      const result: Record<string, Obra[]> = { ...obrasPorContrato }
      for (const c of contratos) {
        if (result[c.id]) continue
        const obs = await fetchObras(c.id)
        if (cancelled) return
        result[c.id] = obs.sort((a, b) => (a.ordem || 0) - (b.ordem || 0))
      }
      if (!cancelled) setObrasPorContrato(result)

      // Carrega gestores
      const { data } = await supabase.from('contrato_gestores').select('contrato_id, gestor_id, perfis:gestor_id(nome,email)')
      if (data && !cancelled) {
        const map: Record<string, string[]> = {}
        for (const r of data as any[]) {
          const cid = r.contrato_id
          if (!map[cid]) map[cid] = []
          map[cid].push(r.perfis?.nome || r.perfis?.email || 'Gestor')
        }
        setGestoresPorContrato(map)
      }

      // Carrega valor total dos serviços por obra (para consumo do contrato)
      const allObraIds = Object.values(result).flat().map(o => o.id)
      if (allObraIds.length > 0 && !cancelled) {
        const vMap: Record<string, number> = {}
        for (let i = 0; i < allObraIds.length; i += 50) {
          const chunk = allObraIds.slice(i, i + 50)
          const { data: srvData } = await supabase.from('servicos').select('obra_id, quantidade, preco_unitario, is_grupo').in('obra_id', chunk)
          if (srvData) {
            for (const s of srvData as any[]) {
              if (s.is_grupo) continue
              vMap[s.obra_id] = (vMap[s.obra_id] || 0) + (s.quantidade * s.preco_unitario)
            }
          }
        }
        if (!cancelled) setValorPorObra(vMap)
      }
    }
    loadAll()
    return () => { cancelled = true }
  }, [contratos])

  async function toggleExpandir(contratoId: string) {
    const novo = new Set(expandidos)
    if (novo.has(contratoId)) { novo.delete(contratoId) }
    else {
      novo.add(contratoId)
      if (!obrasPorContrato[contratoId]) {
        const obs = await fetchObras(contratoId)
        setObrasPorContrato(p => ({ ...p, [contratoId]: obs.sort((a, b) => (a.ordem||0) - (b.ordem||0)) }))
      }
    }
    setExpandidos(novo)
  }

  function abrirObra(contrato: Contrato, obra: Obra) {
    setContratoAtivo(contrato)
    setObraAtiva(obra)
    navigate('/medicoes')
  }

  async function handleDeletarContrato(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    if (!confirm('Deletar este contrato e TODAS as obras e medições vinculadas?')) return
    try { await deletarContrato(id); toast.success('Contrato removido') }
    catch { toast.error('Erro ao remover') }
  }

  async function handleDeletarObra(e: React.MouseEvent, obra: Obra) {
    e.stopPropagation()
    if (!confirm(`Deletar a obra "${obra.nome_obra}" e todas as medições?`)) return
    try {
      await deletarObra(obra.id)
      setObrasPorContrato(p => ({ ...p, [obra.contrato_id]: (p[obra.contrato_id]||[]).filter(o => o.id !== obra.id) }))
      toast.success('Obra removida')
    } catch { toast.error('Erro ao remover obra') }
  }

  async function handleObraSalva(obra: Obra) {
    const obs = await fetchObras(obra.contrato_id)
    setObrasPorContrato(p => ({ ...p, [obra.contrato_id]: obs.sort((a, b) => (a.ordem||0) - (b.ordem||0)) }))
  }

  // Mover obra de ordem (cima/baixo)
  async function moverOrdem(contratoId: string, obraId: string, direcao: -1 | 1) {
    const lista = [...(obrasPorContrato[contratoId] || [])]
    const idx = lista.findIndex(o => o.id === obraId)
    if (idx < 0 || idx + direcao < 0 || idx + direcao >= lista.length) return
    const temp = lista[idx]
    lista[idx] = lista[idx + direcao]
    lista[idx + direcao] = temp
    // Atualiza ordens
    const updates = lista.map((o, i) => ({ id: o.id, ordem: i }))
    setObrasPorContrato(p => ({ ...p, [contratoId]: lista }))
    for (const u of updates) {
      await supabase.from('obras').update({ ordem: u.ordem }).eq('id', u.id)
    }
  }

  // Mover obra entre contratos
  async function confirmarMoverObra(novoContratoId: string) {
    if (!moverModal) return
    try {
      await moverObra(moverModal.obra.id, novoContratoId)
      // Atualiza listas locais
      setObrasPorContrato(p => {
        const old = (p[moverModal.contratoAtual]||[]).filter(o => o.id !== moverModal.obra.id)
        const novo = [...(p[novoContratoId]||[]), { ...moverModal.obra, contrato_id: novoContratoId }]
        return { ...p, [moverModal.contratoAtual]: old, [novoContratoId]: novo }
      })
      toast.success(`Obra movida para ${contratos.find(c=>c.id===novoContratoId)?.nome_obra || 'outro contrato'}!`)
      setMoverModal(null)
    } catch { toast.error('Erro ao mover obra') }
  }

  // ── Filtros ──
  const estadosUnicos = useMemo(() => {
    const set = new Set(contratos.map(c => c.estado).filter(Boolean) as string[])
    return [...set].sort()
  }, [contratos])

  const filtrados = useMemo(() => {
    let list = contratos
    if (busca) {
      const q = busca.toLowerCase()
      list = list.filter(c => c.nome_obra.toLowerCase().includes(q) || (c.numero_contrato||'').includes(q) || (c.cidade||'').toLowerCase().includes(q))
    }
    if (estadoFiltro !== 'todos') list = list.filter(c => c.estado === estadoFiltro)
    return list
  }, [contratos, busca, estadoFiltro])

  const statusObraIcon = (s: string) => s === 'ATIVA' ? <CheckCircle2 size={12} className="text-emerald-500"/>
    : s === 'SUSPENSA' ? <PauseCircle size={12} className="text-amber-500"/> : <CheckCircle2 size={12} className="text-slate-400"/>

  const totalObras = Object.values(obrasPorContrato).reduce((s, o) => s + o.length, 0)
  const obrasAtivas = Object.values(obrasPorContrato).reduce((s, o) => s + o.filter(x => x.status === 'ATIVA').length, 0)

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Contratos</h1>
          <p className="text-slate-500 text-sm mt-1">Expanda um contrato para gerenciar suas obras e medições</p>
        </div>
        <button onClick={() => { setEditandoContrato(null); setModalContrato(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg text-sm shadow-sm">
          <Plus size={16}/> Novo Contrato
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Contratos', val: contratos.length, color: 'bg-blue-50 text-blue-600', icon: Building2 },
          { label: 'Obras criadas', val: totalObras, color: 'bg-slate-100 text-slate-600', icon: HardHat },
          { label: 'Obras ativas', val: obrasAtivas, color: 'bg-emerald-50 text-emerald-600', icon: CheckCircle2 },
          { label: 'Ativos', val: contratos.filter(c=>c.status==='ATIVO').length, color: 'bg-amber-50 text-amber-600', icon: FolderOpen },
        ].map(({ label, val, color, icon: Icon }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}><Icon size={18}/></div>
            <div><p className="text-xl font-bold text-slate-800">{val}</p><p className="text-xs text-slate-500">{label}</p></div>
          </div>
        ))}
      </div>

      {/* Search + State Filter */}
      <div className="flex gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar contrato, cidade..."
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"/>
        </div>
        {estadosUnicos.length > 1 && (
          <select value={estadoFiltro} onChange={e => setEstadoFiltro(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white min-w-36">
            <option value="todos">Todos os estados</option>
            {estadosUnicos.map(uf => <option key={uf} value={uf}>{uf}</option>)}
          </select>
        )}
      </div>

      {/* Lista */}
      {loading && !filtrados.length ? (
        <div className="text-center py-16 text-slate-400">Carregando...</div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-xl">
          <Building2 size={36} className="mx-auto text-slate-300 mb-3"/>
          <p className="text-slate-500 font-medium">Nenhum contrato encontrado</p>
          <button onClick={() => { setEditandoContrato(null); setModalContrato(true) }}
            className="mt-3 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium">Criar primeiro contrato</button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtrados.map(contrato => {
            const expandido = expandidos.has(contrato.id)
            const obsContrato = obrasPorContrato[contrato.id] || []
            const gestoresNomes = gestoresPorContrato[contrato.id] || []
            const consumido = obsContrato.reduce((s, o) => s + (valorPorObra[o.id] || 0), 0)
            const valorContrato = contrato.valor_contrato || 0
            const saldo = valorContrato - consumido
            const pctConsumo = valorContrato > 0 ? (consumido / valorContrato) * 100 : 0
            const diasValidade = contrato.data_validade ? Math.ceil((new Date(contrato.data_validade).getTime() - Date.now()) / 86400000) : null
            return (
              <div key={contrato.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div onClick={() => toggleExpandir(contrato.id)} className="p-5 flex items-center gap-4 cursor-pointer hover:bg-slate-50 transition-colors">
                  <div className="w-11 h-11 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
                    <Building2 size={20} className="text-amber-600"/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-slate-800">{contrato.nome_obra}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        contrato.tipo === 'ESTADO' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                      }`}>{contrato.tipo}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        contrato.status === 'ATIVO' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                      }`}>{contrato.status}</span>
                      {contrato.estado && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 flex items-center gap-1">
                          <MapPin size={9}/> {contrato.cidade ? `${contrato.cidade}/${contrato.estado}` : contrato.estado}
                        </span>
                      )}
                      {diasValidade !== null && diasValidade <= 30 && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${diasValidade <= 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                          {diasValidade <= 0 ? 'VENCIDO' : `${diasValidade}d p/ vencer`}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-4 text-xs text-slate-500 mt-1 flex-wrap">
                      <span>{contrato.orgao_nome}</span>
                      {contrato.numero_contrato && <span>Nº {contrato.numero_contrato}</span>}
                      <span className="font-medium text-slate-600">{obsContrato.length} obra{obsContrato.length !== 1 ? 's' : ''}</span>
                      {gestoresNomes.length > 0 && (
                        <span className="flex items-center gap-1 text-purple-600">
                          <Users size={10}/> {gestoresNomes.join(', ')}
                        </span>
                      )}
                    </div>
                    {/* Consumo do contrato */}
                    {valorContrato > 0 && (
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-[10px] mb-0.5">
                          <span className="text-slate-400">Consumo: <strong className="text-slate-600">{formatCurrency(consumido)}</strong> de {formatCurrency(valorContrato)}</span>
                          <span className={`font-bold ${pctConsumo > 90 ? 'text-red-600' : pctConsumo > 70 ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {pctConsumo.toFixed(1)}%
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2">
                          <div className={`h-2 rounded-full transition-all ${
                            pctConsumo > 90 ? 'bg-red-500' : pctConsumo > 70 ? 'bg-amber-500' : 'bg-emerald-500'
                          }`} style={{ width: `${Math.min(pctConsumo, 100)}%` }}/>
                        </div>
                        <div className="flex items-center justify-between text-[10px] mt-0.5">
                          <span className={`font-medium ${saldo < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                            Saldo: {saldo < 0 ? '−' : ''}{formatCurrency(Math.abs(saldo))}
                          </span>
                          {contrato.data_validade && (
                            <span className="text-slate-400">Validade: {formatDate(contrato.data_validade)}</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isAdmin && <>
                      <button onClick={e => { e.stopPropagation(); setEditandoContrato(contrato); setModalContrato(true) }}
                        className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50"><Pencil size={15}/></button>
                      <button onClick={e => handleDeletarContrato(e, contrato.id)}
                        className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"><Trash2 size={15}/></button>
                    </>}
                    {expandido ? <ChevronDown size={18} className="text-amber-500 ml-1"/> : <ChevronRight size={18} className="text-slate-400 ml-1"/>}
                  </div>
                </div>

                {/* Obras expandidas */}
                {expandido && (
                  <div className="border-t border-slate-100 bg-slate-50">
                    <div className="px-5 py-3 flex items-center justify-between border-b border-slate-200">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                        <HardHat size={12}/> Obras do Contrato
                      </p>
                      <button onClick={() => setModalObra({ contratoId: contrato.id })}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium rounded-lg">
                        <Plus size={12}/> Nova Obra
                      </button>
                    </div>

                    {obsContrato.length === 0 ? (
                      <div className="px-5 py-8 text-center">
                        <HardHat size={28} className="mx-auto text-slate-300 mb-2"/>
                        <p className="text-slate-400 text-sm">Nenhuma obra cadastrada</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {obsContrato.map((obra, idx) => (
                          <div key={obra.id} onClick={() => abrirObra(contrato, obra)}
                            className="px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-white transition-colors group">
                            <div className="w-9 h-9 bg-white border border-slate-200 rounded-lg flex items-center justify-center shrink-0 group-hover:border-amber-300">
                              <HardHat size={16} className="text-slate-500"/>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-slate-800 text-sm truncate">{obra.nome_obra}</p>
                                <span className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium ${
                                  obra.status === 'ATIVA' ? 'bg-emerald-100 text-emerald-700' :
                                  obra.status === 'SUSPENSA' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                                }`}>{statusObraIcon(obra.status)} {obra.status}</span>
                                {obra.centro_custo && <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded font-mono">CC: {obra.centro_custo}</span>}
                              </div>
                              <div className="flex gap-3 text-xs text-slate-400 mt-0.5">
                                <span>{obra.local_obra}</span>
                                <span>Desc: {(obra.desconto_percentual*100).toFixed(2)}%</span>
                                <span>BDI: {(obra.bdi_percentual*100).toFixed(2)}%</span>
                                {valorPorObra[obra.id] > 0 && (
                                  <span className="font-medium text-amber-600">OS: {formatCurrency(valorPorObra[obra.id])}</span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-0.5 shrink-0">
                              {/* Reorder buttons */}
                              {isAdmin && obsContrato.length > 1 && (
                                <>
                                  <button onClick={e => { e.stopPropagation(); moverOrdem(contrato.id, obra.id, -1) }}
                                    disabled={idx === 0} title="Mover para cima"
                                    className="p-1 rounded text-slate-300 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-30">
                                    <ArrowUp size={13}/>
                                  </button>
                                  <button onClick={e => { e.stopPropagation(); moverOrdem(contrato.id, obra.id, 1) }}
                                    disabled={idx === obsContrato.length - 1} title="Mover para baixo"
                                    className="p-1 rounded text-slate-300 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-30">
                                    <ArrowDown size={13}/>
                                  </button>
                                </>
                              )}
                              {/* Move to another contract */}
                              {isAdmin && contratos.length > 1 && (
                                <button onClick={e => { e.stopPropagation(); setMoverModal({ obra, contratoAtual: contrato.id }) }}
                                  title="Mover para outro contrato"
                                  className="p-1 rounded text-slate-300 hover:text-purple-600 hover:bg-purple-50">
                                  <ArrowRightLeft size={13}/>
                                </button>
                              )}
                              <button onClick={e => { e.stopPropagation(); setModalObra({ contratoId: contrato.id, obra }) }}
                                className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50"><Pencil size={14}/></button>
                              <button onClick={e => handleDeletarObra(e, obra)}
                                className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"><Trash2 size={14}/></button>
                              <ChevronRight size={16} className="text-slate-300 group-hover:text-amber-400 ml-1"/>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modals */}
      {modalContrato && (
        <ContratoModal contrato={editandoContrato}
          onClose={() => { setModalContrato(false); setEditandoContrato(null); fetchContratos() }}/>
      )}
      {modalObra && (
        <ObraModal contratoId={modalObra.contratoId} obra={modalObra.obra}
          onClose={() => setModalObra(null)} onSaved={handleObraSalva}/>
      )}

      {/* Modal mover obra */}
      {moverModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setMoverModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-100">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <ArrowRightLeft size={16} className="text-purple-500"/> Mover Obra
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Mover "<strong>{moverModal.obra.nome_obra}</strong>" para outro contrato:
              </p>
            </div>
            <div className="p-5 space-y-2 max-h-60 overflow-auto">
              {contratos.filter(c => c.id !== moverModal.contratoAtual).map(c => (
                <button key={c.id} onClick={() => confirmarMoverObra(c.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 border border-slate-200 rounded-lg hover:border-amber-300 hover:bg-amber-50 transition-all text-left">
                  <Building2 size={16} className="text-amber-500 shrink-0"/>
                  <div>
                    <p className="text-sm font-medium text-slate-800">{c.nome_obra}</p>
                    <p className="text-[10px] text-slate-400">{c.estado ? `${c.cidade||''} ${c.estado}` : c.local_obra} • {(obrasPorContrato[c.id]||[]).length} obras</p>
                  </div>
                </button>
              ))}
            </div>
            <div className="p-4 border-t border-slate-100">
              <button onClick={() => setMoverModal(null)} className="w-full px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}