import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Building2, ChevronRight, ChevronDown, Search,
  Trash2, Pencil, HardHat, FolderOpen, AlertCircle, CheckCircle2, PauseCircle
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '../lib/store'
import { usePerfilStore } from '../lib/perfilStore'
import { Contrato, Obra } from '../types'
import { formatDate } from '../utils/calculations'
import { ContratoModal } from '../components/contracts/ContratoModal'
import { ObraModal } from '../components/contracts/ObraModal'

export function ContratosPage() {
  const { contratos, fetchContratos, setContratoAtivo, deletarContrato,
          obras, fetchObras, setObraAtiva, deletarObra, loading } = useStore()
  const { perfilAtual } = usePerfilStore()
  const isAdmin = perfilAtual?.role === 'ADMIN'
  const [busca, setBusca] = useState('')
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [obrasPorContrato, setObrasPorContrato] = useState<Record<string, Obra[]>>({})
  const [modalContrato, setModalContrato] = useState(false)
  const [editandoContrato, setEditandoContrato] = useState<Contrato | null>(null)
  const [modalObra, setModalObra] = useState<{ contratoId: string; obra?: Obra } | null>(null)
  const navigate = useNavigate()

  useEffect(() => { fetchContratos() }, [])

  // Busca obras de TODOS os contratos ao montar para ter contagem correta nos stats
  useEffect(() => {
    if (contratos.length === 0) return
    let cancelled = false
    async function loadAllObras() {
      const result: Record<string, Obra[]> = { ...obrasPorContrato }
      for (const c of contratos) {
        if (result[c.id]) continue // já tem
        const obs = await fetchObras(c.id)
        if (cancelled) return
        result[c.id] = obs
      }
      if (!cancelled) setObrasPorContrato(result)
    }
    loadAllObras()
    return () => { cancelled = true }
  }, [contratos])

  async function toggleExpandir(contratoId: string) {
    const novo = new Set(expandidos)
    if (novo.has(contratoId)) {
      novo.delete(contratoId)
    } else {
      novo.add(contratoId)
      if (!obrasPorContrato[contratoId]) {
        const obs = await fetchObras(contratoId)
        setObrasPorContrato(p => ({ ...p, [contratoId]: obs }))
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
      setObrasPorContrato(p => ({ ...p, [obra.contrato_id]: (p[obra.contrato_id] || []).filter(o => o.id !== obra.id) }))
      toast.success('Obra removida')
    } catch { toast.error('Erro ao remover obra') }
  }

  async function handleObraSalva(obra: Obra) {
    const obs = await fetchObras(obra.contrato_id)
    setObrasPorContrato(p => ({ ...p, [obra.contrato_id]: obs }))
  }

  const filtrados = contratos.filter(c =>
    c.nome_obra.toLowerCase().includes(busca.toLowerCase()) ||
    (c.numero_contrato || '').includes(busca)
  )

  const statusObraIcon = (s: string) => s === 'ATIVA'
    ? <CheckCircle2 size={12} className="text-emerald-500" />
    : s === 'SUSPENSA'
      ? <PauseCircle size={12} className="text-amber-500" />
      : <CheckCircle2 size={12} className="text-slate-400" />

  const totalObras = Object.values(obrasPorContrato).reduce((s, o) => s + o.length, 0)
  const obrasAtivas = Object.values(obrasPorContrato).reduce((s, o) => s + o.filter(x => x.status === 'ATIVA').length, 0)

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Contratos</h1>
          <p className="text-slate-500 text-sm mt-1">Expanda um contrato para gerenciar suas obras e medições</p>
        </div>
        <button onClick={() => { setEditandoContrato(null); setModalContrato(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg text-sm shadow-sm">
          <Plus size={16} /> Novo Contrato
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Contratos',    val: contratos.length, color: 'bg-blue-50 text-blue-600',    icon: Building2 },
          { label: 'Obras criadas', val: totalObras,      color: 'bg-slate-100 text-slate-600',  icon: HardHat },
          { label: 'Obras ativas', val: obrasAtivas,      color: 'bg-emerald-50 text-emerald-600', icon: CheckCircle2 },
          { label: 'Ativos',       val: contratos.filter(c=>c.status==='ATIVO').length, color: 'bg-amber-50 text-amber-600', icon: FolderOpen },
        ].map(({ label, val, color, icon: Icon }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}><Icon size={18} /></div>
            <div><p className="text-xl font-bold text-slate-800">{val}</p><p className="text-xs text-slate-500">{label}</p></div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar contrato..."
          className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white" />
      </div>

      {/* Lista */}
      {loading && !filtrados.length ? (
        <div className="text-center py-16 text-slate-400">Carregando...</div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-xl">
          <Building2 size={36} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">Nenhum contrato encontrado</p>
          <button onClick={() => { setEditandoContrato(null); setModalContrato(true) }}
            className="mt-3 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium">
            Criar primeiro contrato
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtrados.map(contrato => {
            const expandido = expandidos.has(contrato.id)
            const obsContrato = obrasPorContrato[contrato.id] || []
            return (
              <div key={contrato.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                {/* Cabeçalho do contrato */}
                <div
                  onClick={() => toggleExpandir(contrato.id)}
                  className="p-5 flex items-center gap-4 cursor-pointer hover:bg-slate-50 transition-colors"
                >
                  <div className="w-11 h-11 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
                    <Building2 size={20} className="text-amber-600" />
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
                    </div>
                    <div className="flex gap-4 text-xs text-slate-500 mt-1">
                      <span>{contrato.orgao_nome}</span>
                      {contrato.numero_contrato && <span>Nº {contrato.numero_contrato}</span>}
                      <span>{contrato.empresa_executora}</span>
                      <span className="font-medium text-slate-600">
                        {obsContrato.length} obra{obsContrato.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isAdmin && <>
                      <button onClick={e => { e.stopPropagation(); setEditandoContrato(contrato); setModalContrato(true) }}
                        className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all">
                        <Pencil size={15} />
                      </button>
                      <button onClick={e => handleDeletarContrato(e, contrato.id)}
                        className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all">
                        <Trash2 size={15} />
                      </button>
                    </>}
                    {expandido ? <ChevronDown size={18} className="text-amber-500 ml-1" /> : <ChevronRight size={18} className="text-slate-400 ml-1" />}
                  </div>
                </div>

                {/* Obras expandidas */}
                {expandido && (
                  <div className="border-t border-slate-100 bg-slate-50">
                    {/* Botão adicionar obra */}
                    <div className="px-5 py-3 flex items-center justify-between border-b border-slate-200">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                        <HardHat size={12} /> Obras do Contrato
                      </p>
                      <button
                        onClick={() => setModalObra({ contratoId: contrato.id })}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium rounded-lg transition-all"
                      >
                        <Plus size={12} /> Nova Obra
                      </button>
                    </div>

                    {obsContrato.length === 0 ? (
                      <div className="px-5 py-8 text-center">
                        <HardHat size={28} className="mx-auto text-slate-300 mb-2" />
                        <p className="text-slate-400 text-sm">Nenhuma obra cadastrada</p>
                        <p className="text-slate-400 text-xs mt-1">Clique em "Nova Obra" para adicionar</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {obsContrato.map(obra => (
                          <div key={obra.id}
                            onClick={() => abrirObra(contrato, obra)}
                            className="px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-white transition-colors group"
                          >
                            <div className="w-9 h-9 bg-white border border-slate-200 rounded-lg flex items-center justify-center shrink-0 group-hover:border-amber-300 transition-colors">
                              <HardHat size={16} className="text-slate-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-slate-800 text-sm truncate">{obra.nome_obra}</p>
                                <span className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-medium ${
                                  obra.status === 'ATIVA' ? 'bg-emerald-100 text-emerald-700' :
                                  obra.status === 'SUSPENSA' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                                }`}>
                                  {statusObraIcon(obra.status)} {obra.status}
                                </span>
                              </div>
                              <div className="flex gap-3 text-xs text-slate-400 mt-0.5">
                                <span>{obra.local_obra}</span>
                                {obra.numero_contrato && <span>Nº {obra.numero_contrato}</span>}
                                <span>Desc: {(obra.desconto_percentual * 100).toFixed(2)}%</span>
                                <span>BDI: {(obra.bdi_percentual * 100).toFixed(2)}%</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button onClick={e => { e.stopPropagation(); setModalObra({ contratoId: contrato.id, obra }) }}
                                className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all">
                                <Pencil size={14} />
                              </button>
                              <button onClick={e => handleDeletarObra(e, obra)}
                                className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all">
                                <Trash2 size={14} />
                              </button>
                              <ChevronRight size={16} className="text-slate-300 group-hover:text-amber-400 ml-1 transition-colors" />
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
        <ContratoModal
          contrato={editandoContrato}
          onClose={() => { setModalContrato(false); setEditandoContrato(null); fetchContratos() }}
        />
      )}
      {modalObra && (
        <ObraModal
          contratoId={modalObra.contratoId}
          obra={modalObra.obra}
          onClose={() => setModalObra(null)}
          onSaved={handleObraSalva}
        />
      )}
    </div>
  )
}