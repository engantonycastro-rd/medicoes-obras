import { useEffect, useState, useMemo } from 'react'
import {
  Plus, Trash2, CheckCircle2, ChevronRight, ArrowLeft, Clock, Play,
  ClipboardCheck, CheckSquare, Square, Loader2, GripVertical, Calendar,
  AlertCircle, Edit3, X, Save, MessageSquare,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { usePerfilStore } from '../lib/perfilStore'
import { supabase } from '../lib/supabase'

interface KanbanCard {
  id: string; created_at: string; obra_id: string; criado_por: string
  ano: number; mes: number; quinzena: number
  status: 'PLANEJADO' | 'EM_EXECUCAO' | 'CONFERENCIA' | 'CONCLUIDO'
  observacoes: string | null
}

interface KanbanItem {
  id: string; card_id: string; ordem: number
  descricao: string; servico_id: string | null
  executado: boolean; obs_conferencia: string | null
}

const MESES = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

const COLUNAS: { key: KanbanCard['status']; label: string; color: string; icon: any; bg: string }[] = [
  { key: 'PLANEJADO',    label: 'Planejado',    color: 'text-amber-600',   icon: Clock,          bg: 'bg-amber-50 border-amber-200' },
  { key: 'EM_EXECUCAO',  label: 'Em Execução',  color: 'text-blue-600',    icon: Play,           bg: 'bg-blue-50 border-blue-200' },
  { key: 'CONFERENCIA',  label: 'Conferência',  color: 'text-purple-600',  icon: ClipboardCheck, bg: 'bg-purple-50 border-purple-200' },
  { key: 'CONCLUIDO',    label: 'Concluído',    color: 'text-emerald-600', icon: CheckCircle2,   bg: 'bg-emerald-50 border-emerald-200' },
]

export function KanbanObraPage() {
  const { obraAtiva, contratoAtivo } = useStore()
  const { perfilAtual } = usePerfilStore()
  const navigate = useNavigate()

  const [cards, setCards] = useState<KanbanCard[]>([])
  const [itens, setItens] = useState<Record<string, KanbanItem[]>>({})
  const [loading, setLoading] = useState(true)

  // Novo card
  const [showNovoCard, setShowNovoCard] = useState(false)
  const [novoAno, setNovoAno] = useState(new Date().getFullYear())
  const [novoMes, setNovoMes] = useState(new Date().getMonth() + 1)
  const [novoQuinzena, setNovoQuinzena] = useState(new Date().getDate() <= 15 ? 1 : 2)
  const [novoItens, setNovoItens] = useState<string[]>([''])
  const [criando, setCriando] = useState(false)

  // Editar item
  const [editandoItem, setEditandoItem] = useState<string | null>(null)
  const [editDesc, setEditDesc] = useState('')

  useEffect(() => {
    if (obraAtiva) fetchAll()
  }, [obraAtiva])

  async function fetchAll() {
    if (!obraAtiva) return
    setLoading(true)
    const { data: cardsData } = await supabase.from('kanban_cards').select('*')
      .eq('obra_id', obraAtiva.id).order('ano', { ascending: false }).order('mes', { ascending: false }).order('quinzena', { ascending: false })
    if (cardsData) {
      setCards(cardsData as KanbanCard[])
      const iMap: Record<string, KanbanItem[]> = {}
      for (const c of cardsData) {
        const { data: iData } = await supabase.from('kanban_itens').select('*').eq('card_id', c.id).order('ordem')
        if (iData) iMap[c.id] = iData as KanbanItem[]
      }
      setItens(iMap)
    }
    setLoading(false)
  }

  async function criarCard() {
    if (!obraAtiva || !perfilAtual) return
    const servicos = novoItens.filter(s => s.trim())
    if (servicos.length === 0) { toast.error('Adicione ao menos um serviço'); return }

    setCriando(true)
    try {
      const { data: card, error } = await supabase.from('kanban_cards').insert({
        obra_id: obraAtiva.id, criado_por: perfilAtual.id,
        ano: novoAno, mes: novoMes, quinzena: novoQuinzena, status: 'PLANEJADO',
      }).select().single()
      if (error) throw error

      const rows = servicos.map((desc, i) => ({ card_id: card.id, descricao: desc.trim(), ordem: i }))
      await supabase.from('kanban_itens').insert(rows)

      toast.success(`Card ${MESES[novoMes]} ${novoQuinzena}ª quinzena criado!`)
      setShowNovoCard(false); setNovoItens([''])
      fetchAll()
    } catch (err: any) {
      if (err.message?.includes('duplicate')) toast.error('Já existe um card para esta quinzena!')
      else toast.error(err.message)
    }
    setCriando(false)
  }

  async function moverCard(cardId: string, novoStatus: KanbanCard['status']) {
    await supabase.from('kanban_cards').update({ status: novoStatus }).eq('id', cardId)
    setCards(prev => prev.map(c => c.id === cardId ? { ...c, status: novoStatus } : c))
    toast.success(`Movido para ${COLUNAS.find(c => c.key === novoStatus)?.label}`)
  }

  async function toggleExecutado(itemId: string, cardId: string) {
    const item = itens[cardId]?.find(i => i.id === itemId)
    if (!item) return
    const novo = !item.executado
    await supabase.from('kanban_itens').update({ executado: novo }).eq('id', itemId)
    setItens(prev => ({
      ...prev,
      [cardId]: prev[cardId]?.map(i => i.id === itemId ? { ...i, executado: novo } : i) || []
    }))
  }

  async function adicionarItem(cardId: string, descricao: string) {
    const existing = itens[cardId] || []
    const { data, error } = await supabase.from('kanban_itens').insert({
      card_id: cardId, descricao, ordem: existing.length,
    }).select().single()
    if (data) setItens(prev => ({ ...prev, [cardId]: [...(prev[cardId] || []), data as KanbanItem] }))
  }

  async function removerItem(itemId: string, cardId: string) {
    await supabase.from('kanban_itens').delete().eq('id', itemId)
    setItens(prev => ({ ...prev, [cardId]: (prev[cardId] || []).filter(i => i.id !== itemId) }))
  }

  async function salvarEdicaoItem(itemId: string, cardId: string) {
    await supabase.from('kanban_itens').update({ descricao: editDesc }).eq('id', itemId)
    setItens(prev => ({ ...prev, [cardId]: (prev[cardId] || []).map(i => i.id === itemId ? { ...i, descricao: editDesc } : i) }))
    setEditandoItem(null)
  }

  async function deletarCard(card: KanbanCard) {
    if (!confirm(`Excluir o planejamento de ${MESES[card.mes]} ${card.quinzena}ª quinzena?`)) return
    await supabase.from('kanban_itens').delete().eq('card_id', card.id)
    await supabase.from('kanban_cards').delete().eq('id', card.id)
    setCards(prev => prev.filter(c => c.id !== card.id))
    toast.success('Card excluído')
  }

  if (!obraAtiva || !contratoAtivo) {
    return (
      <div className="p-8 text-center">
        <AlertCircle size={36} className="mx-auto text-slate-300 mb-3"/>
        <p className="text-slate-500">Selecione uma obra para acessar o planejamento</p>
        <button onClick={() => navigate('/')} className="mt-3 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm">Ir para Contratos</button>
      </div>
    )
  }

  return (
    <div className="p-6 overflow-y-auto" style={{ height: '100%' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <button onClick={() => navigate('/medicoes')} className="hover:text-amber-600 flex items-center gap-1"><ArrowLeft size={12}/> Medições</button>
            <span>›</span>
            <span>{obraAtiva.nome_obra}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Planejamento de Serviços</h1>
          <p className="text-sm text-slate-500">Kanban de planejamento quinzenal</p>
        </div>
        <button onClick={() => setShowNovoCard(true)}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg text-sm shadow-sm">
          <Plus size={15}/> Novo Planejamento
        </button>
      </div>

      {/* Modal novo card */}
      {showNovoCard && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 mb-6">
          <p className="font-bold text-amber-800 mb-4">Novo Planejamento Quinzenal</p>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Ano</label>
              <input type="number" value={novoAno} onChange={e => setNovoAno(Number(e.target.value))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"/>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Mês</label>
              <select value={novoMes} onChange={e => setNovoMes(Number(e.target.value))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                {MESES.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Quinzena</label>
              <select value={novoQuinzena} onChange={e => setNovoQuinzena(Number(e.target.value))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                <option value={1}>1ª Quinzena (dia 1 a 15)</option>
                <option value={2}>2ª Quinzena (dia 16 ao fim)</option>
              </select>
            </div>
          </div>

          <div className="mb-4">
            <label className="text-xs font-semibold text-slate-600 block mb-2">Serviços planejados</label>
            <div className="space-y-2">
              {novoItens.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 w-6 text-right shrink-0">{i + 1}.</span>
                  <input value={item} onChange={e => { const n = [...novoItens]; n[i] = e.target.value; setNovoItens(n) }}
                    placeholder="Ex: Executar serviço de cobertura"
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setNovoItens([...novoItens, '']) } }}/>
                  {novoItens.length > 1 && (
                    <button onClick={() => setNovoItens(novoItens.filter((_, j) => j !== i))}
                      className="p-1.5 text-slate-300 hover:text-red-500"><Trash2 size={14}/></button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={() => setNovoItens([...novoItens, ''])}
              className="flex items-center gap-1 text-xs text-amber-600 hover:underline mt-2">
              <Plus size={12}/> Adicionar serviço
            </button>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setShowNovoCard(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm bg-white">Cancelar</button>
            <button onClick={criarCard} disabled={criando}
              className="flex items-center gap-2 px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-sm disabled:opacity-50">
              {criando ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} Criar Planejamento
            </button>
          </div>
        </div>
      )}

      {/* Kanban Board */}
      {loading ? (
        <div className="text-center py-16 text-slate-400"><Loader2 size={24} className="animate-spin mx-auto mb-2"/> Carregando...</div>
      ) : cards.length === 0 && !showNovoCard ? (
        <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-xl">
          <Calendar size={36} className="mx-auto text-slate-300 mb-3"/>
          <p className="text-slate-500">Nenhum planejamento criado</p>
          <p className="text-xs text-slate-400 mt-1">Crie o primeiro planejamento quinzenal de serviços</p>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {COLUNAS.map(col => {
            const colCards = cards.filter(c => c.status === col.key)
            const Icon = col.icon
            return (
              <div key={col.key} className="min-h-[400px]">
                {/* Column header */}
                <div className={`flex items-center gap-2 px-3 py-2.5 rounded-t-xl border ${col.bg}`}>
                  <Icon size={15} className={col.color}/>
                  <span className={`text-xs font-bold ${col.color}`}>{col.label}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/60 text-slate-600 font-bold ml-auto">{colCards.length}</span>
                </div>

                {/* Cards na coluna */}
                <div className="space-y-3 mt-3">
                  {colCards.map(card => {
                    const cardItens = itens[card.id] || []
                    const executados = cardItens.filter(i => i.executado).length
                    const totalItens = cardItens.length
                    const progresso = totalItens > 0 ? Math.round((executados / totalItens) * 100) : 0

                    return (
                      <div key={card.id} className="bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-shadow">
                        {/* Card header */}
                        <div className="px-4 pt-3 pb-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <Calendar size={12} className="text-slate-400"/>
                              <span className="text-xs font-bold text-slate-800">
                                {MESES[card.mes]} {card.ano}
                              </span>
                            </div>
                            <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 rounded-full text-slate-500 font-medium">
                              {card.quinzena === 1 ? '1ª quinz.' : '2ª quinz.'}
                            </span>
                          </div>

                          {/* Progress bar (em conferência/concluído) */}
                          {(card.status === 'CONFERENCIA' || card.status === 'CONCLUIDO') && totalItens > 0 && (
                            <div className="mt-2">
                              <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
                                <span>{executados}/{totalItens} executados</span>
                                <span>{progresso}%</span>
                              </div>
                              <div className="w-full bg-slate-100 rounded-full h-1.5">
                                <div className="bg-emerald-500 h-1.5 rounded-full transition-all" style={{ width: `${progresso}%` }}/>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Itens */}
                        <div className="px-4 pb-2 space-y-1">
                          {cardItens.map(item => (
                            <div key={item.id} className={`flex items-start gap-2 py-1 ${item.executado ? 'opacity-60' : ''}`}>
                              {/* Checkbox (só em conferência) */}
                              {card.status === 'CONFERENCIA' ? (
                                <button onClick={() => toggleExecutado(item.id, card.id)} className="mt-0.5 shrink-0">
                                  {item.executado
                                    ? <CheckSquare size={14} className="text-emerald-500"/>
                                    : <Square size={14} className="text-slate-300 hover:text-slate-500"/>
                                  }
                                </button>
                              ) : card.status === 'CONCLUIDO' ? (
                                <span className="mt-0.5 shrink-0">
                                  {item.executado
                                    ? <CheckCircle2 size={13} className="text-emerald-500"/>
                                    : <X size={13} className="text-red-400"/>
                                  }
                                </span>
                              ) : (
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5 shrink-0"/>
                              )}

                              {editandoItem === item.id ? (
                                <div className="flex-1 flex items-center gap-1">
                                  <input value={editDesc} onChange={e => setEditDesc(e.target.value)} autoFocus
                                    className="flex-1 text-xs border border-slate-200 rounded px-2 py-1"
                                    onKeyDown={e => { if (e.key === 'Enter') salvarEdicaoItem(item.id, card.id); if (e.key === 'Escape') setEditandoItem(null) }}/>
                                  <button onClick={() => salvarEdicaoItem(item.id, card.id)} className="text-emerald-500"><CheckCircle2 size={12}/></button>
                                </div>
                              ) : (
                                <span className={`text-xs text-slate-700 flex-1 cursor-pointer hover:text-slate-900 ${item.executado ? 'line-through' : ''}`}
                                  onClick={() => { if (card.status !== 'CONCLUIDO') { setEditandoItem(item.id); setEditDesc(item.descricao) } }}>
                                  {item.descricao}
                                </span>
                              )}

                              {card.status !== 'CONCLUIDO' && editandoItem !== item.id && (
                                <button onClick={() => removerItem(item.id, card.id)}
                                  className="p-0.5 text-slate-200 hover:text-red-400 shrink-0 opacity-0 group-hover:opacity-100"><Trash2 size={11}/></button>
                              )}
                            </div>
                          ))}

                          {/* Add item inline (planejado e em execução) */}
                          {(card.status === 'PLANEJADO' || card.status === 'EM_EXECUCAO') && (
                            <AddItemInline cardId={card.id} onAdd={(desc) => adicionarItem(card.id, desc)}/>
                          )}
                        </div>

                        {/* Card actions */}
                        <div className="px-3 py-2 border-t border-slate-100 flex items-center gap-1.5">
                          {card.status === 'PLANEJADO' && (
                            <button onClick={() => moverCard(card.id, 'EM_EXECUCAO')}
                              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-[10px] font-medium rounded-lg">
                              <Play size={10}/> Iniciar Execução
                            </button>
                          )}
                          {card.status === 'EM_EXECUCAO' && (
                            <button onClick={() => moverCard(card.id, 'CONFERENCIA')}
                              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-purple-500 hover:bg-purple-600 text-white text-[10px] font-medium rounded-lg">
                              <ClipboardCheck size={10}/> Enviar p/ Conferência
                            </button>
                          )}
                          {card.status === 'CONFERENCIA' && (
                            <button onClick={() => moverCard(card.id, 'CONCLUIDO')}
                              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-medium rounded-lg">
                              <CheckCircle2 size={10}/> Concluir
                            </button>
                          )}
                          <button onClick={() => deletarCard(card)}
                            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg">
                            <Trash2 size={12}/>
                          </button>
                        </div>
                      </div>
                    )
                  })}

                  {colCards.length === 0 && (
                    <div className="text-center py-8 text-[10px] text-slate-300">
                      Nenhum card
                    </div>
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

// ─── Subcomponente: adicionar item inline ──────────────────────────────────

function AddItemInline({ cardId, onAdd }: { cardId: string; onAdd: (desc: string) => void }) {
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')

  function submit() {
    if (text.trim()) { onAdd(text.trim()); setText(''); setAdding(false) }
  }

  if (!adding) {
    return (
      <button onClick={() => setAdding(true)}
        className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-amber-600 py-1">
        <Plus size={10}/> Adicionar serviço
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1 mt-1">
      <input value={text} onChange={e => setText(e.target.value)} autoFocus placeholder="Novo serviço..."
        className="flex-1 text-xs border border-slate-200 rounded px-2 py-1"
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setAdding(false) }}/>
      <button onClick={submit} className="text-emerald-500"><CheckCircle2 size={14}/></button>
      <button onClick={() => setAdding(false)} className="text-slate-400"><X size={14}/></button>
    </div>
  )
}