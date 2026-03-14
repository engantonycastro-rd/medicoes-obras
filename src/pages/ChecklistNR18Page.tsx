import { useEffect, useState, useMemo } from 'react'
import { Shield, Plus, CheckCircle2, XCircle, Camera, RefreshCw, Filter, ChevronDown, ChevronUp, Save, X, Loader2, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { usePerfilStore } from '../lib/perfilStore'

interface ItemModelo { id: string; categoria: string; descricao: string; norma_ref: string; ordem: number }
interface ChecklistPreenchido { id: string; created_at: string; obra_id: string; preenchido_por: string; data: string; observacoes: string | null; score_conformidade: number }
interface Resposta { id: string; checklist_id: string; item_id: string; conforme: boolean | null; observacao: string | null }

export function ChecklistNR18Page() {
  const { perfilAtual } = usePerfilStore()
  const [itensModelo, setItensModelo] = useState<ItemModelo[]>([])
  const [checklists, setChecklists] = useState<ChecklistPreenchido[]>([])
  const [obras, setObras] = useState<{ id: string; nome_obra: string }[]>([])
  const [perfis, setPerfis] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [filtroObra, setFiltroObra] = useState('todas')
  const [expandido, setExpandido] = useState<string | null>(null)
  const [respostasMap, setRespostasMap] = useState<Record<string, Resposta[]>>({})

  // Form
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [fObraId, setFObraId] = useState('')
  const [fData, setFData] = useState(new Date().toISOString().split('T')[0])
  const [fObs, setFObs] = useState('')
  const [fRespostas, setFRespostas] = useState<Record<string, { conforme: boolean | null; obs: string }>>({})

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [imRes, cRes, oRes] = await Promise.all([
      supabase.from('checklist_itens_modelo').select('*').eq('ativo', true).order('ordem'),
      supabase.from('checklist_preenchido').select('*').order('data', { ascending: false }).limit(100),
      supabase.from('obras').select('id, nome_obra').eq('status', 'ATIVA').order('nome_obra'),
    ])
    if (imRes.data) setItensModelo(imRes.data)
    if (cRes.data) {
      setChecklists(cRes.data)
      const uids = new Set(cRes.data.map((c: any) => c.preenchido_por))
      if (uids.size > 0) {
        const { data: pData } = await supabase.from('perfis').select('id, nome').in('id', [...uids])
        if (pData) { const m: Record<string, string> = {}; pData.forEach((p: any) => m[p.id] = p.nome || 'Usuário'); setPerfis(m) }
      }
    }
    if (oRes.data) setObras(oRes.data)
    setLoading(false)
  }

  async function expandir(chk: ChecklistPreenchido) {
    if (expandido === chk.id) { setExpandido(null); return }
    setExpandido(chk.id)
    if (!respostasMap[chk.id]) {
      const { data } = await supabase.from('checklist_respostas').select('*').eq('checklist_id', chk.id)
      if (data) setRespostasMap(p => ({ ...p, [chk.id]: data }))
    }
  }

  function iniciarForm() {
    setFObraId(''); setFData(new Date().toISOString().split('T')[0]); setFObs('')
    const r: Record<string, { conforme: boolean | null; obs: string }> = {}
    itensModelo.forEach(i => { r[i.id] = { conforme: null, obs: '' } })
    setFRespostas(r); setShowForm(true)
  }

  async function salvar() {
    if (!fObraId) { toast.error('Selecione uma obra'); return }
    setSaving(true)
    const respondidos = Object.entries(fRespostas).filter(([_, v]) => v.conforme !== null)
    const conformes = respondidos.filter(([_, v]) => v.conforme === true).length
    const score = respondidos.length > 0 ? (conformes / respondidos.length) * 100 : 0

    const { data: chk, error } = await supabase.from('checklist_preenchido').insert({
      obra_id: fObraId, preenchido_por: perfilAtual!.id, data: fData,
      observacoes: fObs || null, score_conformidade: Math.round(score * 100) / 100,
    }).select().single()

    if (error || !chk) { toast.error(error?.message || 'Erro'); setSaving(false); return }

    const rows = Object.entries(fRespostas).filter(([_, v]) => v.conforme !== null).map(([itemId, v]) => ({
      checklist_id: chk.id, item_id: itemId, conforme: v.conforme, observacao: v.obs || null,
    }))
    if (rows.length > 0) await supabase.from('checklist_respostas').insert(rows)

    toast.success(`Checklist salvo! Conformidade: ${score.toFixed(0)}%`)
    setShowForm(false); fetchAll()
    setSaving(false)
  }

  const obraMap: Record<string, string> = {}; obras.forEach(o => obraMap[o.id] = o.nome_obra)
  const categorias = useMemo(() => [...new Set(itensModelo.map(i => i.categoria))], [itensModelo])
  const filtrados = filtroObra === 'todas' ? checklists : checklists.filter(c => c.obra_id === filtroObra)

  const scoreColor = (s: number) => s >= 80 ? 'text-emerald-600' : s >= 50 ? 'text-primary-600' : 'text-red-600'
  const scoreBg = (s: number) => s >= 80 ? 'bg-emerald-50 border-emerald-200' : s >= 50 ? 'bg-primary-50 border-primary-200' : 'bg-red-50 border-red-200'

  return (
    <div className="p-6 max-w-5xl overflow-y-auto" style={{ height: '100%' }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><Shield size={24} className="text-primary-500"/> Checklist NR-18</h1>
          <p className="text-sm text-slate-500">Segurança do trabalho — itens de conformidade</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchAll} className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm hover:bg-slate-50"><RefreshCw size={14}/></button>
          <button onClick={iniciarForm} className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg text-sm"><Plus size={14}/> Novo Checklist</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <p className="text-[10px] text-slate-400 uppercase font-semibold">Total inspeções</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-white">{filtrados.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <p className="text-[10px] text-slate-400 uppercase font-semibold">Conformidade média</p>
          <p className={`text-2xl font-bold ${scoreColor(filtrados.length > 0 ? filtrados.reduce((s, c) => s + Number(c.score_conformidade), 0) / filtrados.length : 0)}`}>
            {filtrados.length > 0 ? (filtrados.reduce((s, c) => s + Number(c.score_conformidade), 0) / filtrados.length).toFixed(0) : 0}%
          </p>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <p className="text-[10px] text-slate-400 uppercase font-semibold">Itens do modelo</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-white">{itensModelo.length}</p>
        </div>
      </div>

      {/* Filtro */}
      <div className="flex items-center gap-3 mb-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
        <Filter size={14} className="text-slate-400"/>
        <select value={filtroObra} onChange={e => setFiltroObra(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white">
          <option value="todas">Todas as obras</option>
          {obras.map(o => <option key={o.id} value={o.id}>{o.nome_obra}</option>)}
        </select>
      </div>

      {/* Lista */}
      {filtrados.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
          <Shield size={36} className="mx-auto text-slate-300 mb-3"/>
          <p className="text-slate-400">{loading ? 'Carregando...' : 'Nenhum checklist preenchido'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtrados.map(chk => {
            const aberto = expandido === chk.id
            const resps = respostasMap[chk.id] || []
            return (
              <div key={chk.id} className={`border rounded-xl overflow-hidden ${scoreBg(Number(chk.score_conformidade))}`}>
                <div className="p-4 flex items-center gap-4 cursor-pointer" onClick={() => expandir(chk)}>
                  <div className="text-center shrink-0 w-14">
                    <p className={`text-2xl font-bold ${scoreColor(Number(chk.score_conformidade))}`}>{Number(chk.score_conformidade).toFixed(0)}%</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800">{obraMap[chk.obra_id] || '—'}</p>
                    <div className="flex gap-3 text-[10px] text-slate-500">
                      <span>{new Date(chk.data + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                      <span>Por: {perfis[chk.preenchido_por] || '—'}</span>
                    </div>
                  </div>
                  {aberto ? <ChevronUp size={16} className="text-primary-500"/> : <ChevronDown size={16} className="text-slate-400"/>}
                </div>
                {aberto && (
                  <div className="border-t p-4 bg-white/50 space-y-2">
                    {resps.length === 0 && <p className="text-xs text-slate-400">Carregando respostas...</p>}
                    {categorias.map(cat => {
                      const itens = itensModelo.filter(i => i.categoria === cat)
                      const respostasCat = itens.map(i => resps.find(r => r.item_id === i.id))
                      if (respostasCat.every(r => !r)) return null
                      return (
                        <div key={cat}>
                          <p className="text-xs font-bold text-slate-600 mb-1">{cat}</p>
                          {itens.map(item => {
                            const resp = resps.find(r => r.item_id === item.id)
                            if (!resp) return null
                            return (
                              <div key={item.id} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                                {resp.conforme ? <CheckCircle2 size={14} className="text-emerald-500 shrink-0"/> : <XCircle size={14} className="text-red-500 shrink-0"/>}
                                <span className="text-slate-700 flex-1">{item.descricao}</span>
                                {resp.observacao && <span className="text-slate-400 italic text-[10px]">{resp.observacao}</span>}
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                    {chk.observacoes && <p className="text-xs text-slate-500 italic pt-2 border-t border-slate-200">Obs: {chk.observacoes}</p>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-6 overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 mb-10">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-bold dark:text-white flex items-center gap-2"><Shield size={18} className="text-primary-500"/> Novo Checklist NR-18</h2>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-slate-100 rounded-lg"><X size={18}/></button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs font-semibold text-slate-600 block mb-1">Obra *</label>
                  <select value={fObraId} onChange={e => setFObraId(e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm">
                    <option value="">Selecione...</option>
                    {obras.map(o => <option key={o.id} value={o.id}>{o.nome_obra}</option>)}
                  </select></div>
                <div><label className="text-xs font-semibold text-slate-600 block mb-1">Data</label>
                  <input type="date" value={fData} onChange={e => setFData(e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/></div>
              </div>

              {categorias.map(cat => (
                <div key={cat}>
                  <p className="text-xs font-bold text-slate-800 dark:text-white mb-2 bg-slate-100 dark:bg-slate-700 px-3 py-1.5 rounded-lg">{cat}</p>
                  {itensModelo.filter(i => i.categoria === cat).map(item => (
                    <div key={item.id} className="flex items-center gap-3 px-3 py-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
                      <span className="flex-1 text-xs text-slate-700 dark:text-slate-300">{item.descricao}</span>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => setFRespostas(p => ({ ...p, [item.id]: { ...p[item.id], conforme: true } }))}
                          className={`p-1.5 rounded-lg border text-xs ${fRespostas[item.id]?.conforme === true ? 'bg-emerald-500 text-white border-emerald-500' : 'border-slate-200 text-slate-400'}`}>
                          <CheckCircle2 size={14}/>
                        </button>
                        <button onClick={() => setFRespostas(p => ({ ...p, [item.id]: { ...p[item.id], conforme: false } }))}
                          className={`p-1.5 rounded-lg border text-xs ${fRespostas[item.id]?.conforme === false ? 'bg-red-500 text-white border-red-500' : 'border-slate-200 text-slate-400'}`}>
                          <XCircle size={14}/>
                        </button>
                      </div>
                      {fRespostas[item.id]?.conforme === false && (
                        <input value={fRespostas[item.id]?.obs || ''} onChange={e => setFRespostas(p => ({ ...p, [item.id]: { ...p[item.id], obs: e.target.value } }))}
                          placeholder="Obs..." className="w-32 border border-red-200 rounded-lg px-2 py-1 text-[10px]"/>
                      )}
                    </div>
                  ))}
                </div>
              ))}

              <textarea value={fObs} onChange={e => setFObs(e.target.value)} placeholder="Observações gerais" rows={2}
                className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/>
            </div>
            <div className="flex justify-between items-center px-6 py-4 border-t border-slate-200 dark:border-slate-700">
              <p className="text-xs text-slate-400">
                {Object.values(fRespostas).filter(r => r.conforme !== null).length} de {itensModelo.length} respondidos
              </p>
              <div className="flex gap-2">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm">Cancelar</button>
                <button onClick={salvar} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg text-sm disabled:opacity-50">
                  {saving ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
