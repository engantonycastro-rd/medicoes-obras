// ═══ Cronograma Page ═══
import { useEffect, useState } from 'react'
import { GitBranch, Plus, RefreshCw, CheckCircle2, Clock, AlertTriangle, Edit3, Trash2, Save, X, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { usePerfilStore } from '../lib/perfilStore'

interface Marco { id: string; obra_id: string; titulo: string; descricao: string; tipo: string; data_prevista: string; data_realizada: string | null; percentual_previsto: number; percentual_realizado: number; cor: string; ordem: number }
const TIPOS = [{ val: 'INICIO', label: 'Início', cor: '#3B82F6' }, { val: 'ETAPA', label: 'Etapa', cor: '#F59E0B' }, { val: 'MEDICAO', label: 'Medição', cor: '#8B5CF6' }, { val: 'MARCO', label: 'Marco', cor: '#EF4444' }, { val: 'CONCLUSAO', label: 'Conclusão', cor: '#10B981' }]

export function CronogramaPage() {
  const { obraAtiva } = useStore()
  const { perfilAtual } = usePerfilStore()
  const [marcos, setMarcos] = useState<Marco[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [fTitulo, setFTitulo] = useState(''); const [fDesc, setFDesc] = useState(''); const [fTipo, setFTipo] = useState('ETAPA')
  const [fPrevista, setFPrevista] = useState(''); const [fRealizada, setFRealizada] = useState(''); const [fPercPrev, setFPercPrev] = useState(0); const [fPercReal, setFPercReal] = useState(0)
  const [obras, setObras] = useState<{id:string;nome_obra:string}[]>([]); const [filtroObra, setFiltroObra] = useState('')

  useEffect(() => { fetchAll() }, [])
  async function fetchAll() {
    setLoading(true)
    const { data: o } = await supabase.from('obras').select('id, nome_obra').eq('status', 'ATIVA').order('nome_obra'); if (o) setObras(o)
    const q = supabase.from('cronograma_marcos').select('*').order('data_prevista')
    const { data } = filtroObra ? await q.eq('obra_id', filtroObra) : await q
    if (data) setMarcos(data as Marco[])
    setLoading(false)
  }
  useEffect(() => { fetchAll() }, [filtroObra])

  async function salvar() {
    if (!filtroObra || !fTitulo || !fPrevista) { toast.error('Obra, título e data obrigatórios'); return }
    setSaving(true)
    const payload = { obra_id: filtroObra, titulo: fTitulo, descricao: fDesc || null, tipo: fTipo, data_prevista: fPrevista, data_realizada: fRealizada || null, percentual_previsto: fPercPrev, percentual_realizado: fPercReal, cor: TIPOS.find(t => t.val === fTipo)?.cor || '#3B82F6', ordem: marcos.length }
    const { error } = editId ? await supabase.from('cronograma_marcos').update(payload).eq('id', editId) : await supabase.from('cronograma_marcos').insert(payload)
    if (error) toast.error(error.message); else { toast.success('Salvo!'); setShowForm(false); fetchAll() }
    setSaving(false)
  }
  async function deletar(id: string) { if (!confirm('Excluir?')) return; await supabase.from('cronograma_marcos').delete().eq('id', id); fetchAll() }

  const obraMap: Record<string,string> = {}; obras.forEach(o => obraMap[o.id] = o.nome_obra)
  const hoje = new Date().toISOString().split('T')[0]
  const isAdmin = perfilAtual?.role === 'ADMIN'

  return (
    <div className="p-6 max-w-5xl overflow-y-auto" style={{ height: '100%' }}>
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><GitBranch size={24} className="text-primary-500"/> Cronograma</h1>
          <p className="text-sm text-slate-500">Marcos, etapas e prazos das obras</p></div>
        <div className="flex gap-2">
          <select value={filtroObra} onChange={e => setFiltroObra(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white">
            <option value="">Todas as obras</option>{obras.map(o => <option key={o.id} value={o.id}>{o.nome_obra}</option>)}</select>
          {filtroObra && <button onClick={() => { setEditId(null); setFTitulo(''); setFDesc(''); setFTipo('ETAPA'); setFPrevista(''); setFRealizada(''); setFPercPrev(0); setFPercReal(0); setShowForm(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg text-sm"><Plus size={14}/> Novo Marco</button>}
        </div>
      </div>

      {!filtroObra ? <div className="text-center py-16 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl"><GitBranch size={36} className="mx-auto text-slate-300 mb-3"/><p className="text-slate-400">Selecione uma obra para ver o cronograma</p></div> : (
        <div className="space-y-2">
          {marcos.length === 0 && !loading && <p className="text-center text-slate-400 py-8">Nenhum marco cadastrado</p>}
          {marcos.map((m, i) => {
            const atrasado = !m.data_realizada && m.data_prevista < hoje
            return (
              <div key={m.id} className="flex items-start gap-3">
                <div className="flex flex-col items-center shrink-0">
                  <div className="w-3 h-3 rounded-full border-2" style={{ borderColor: m.cor, background: m.data_realizada ? m.cor : 'transparent' }}/>
                  {i < marcos.length - 1 && <div className="w-0.5 flex-1 min-h-[40px] bg-slate-200 dark:bg-slate-700"/>}
                </div>
                <div className={`flex-1 bg-white dark:bg-slate-800 border rounded-xl p-4 mb-2 ${atrasado ? 'border-red-300' : 'border-slate-200 dark:border-slate-700'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: m.cor + '20', color: m.cor }}>{TIPOS.find(t => t.val === m.tipo)?.label}</span>
                      <span className="text-sm font-bold text-slate-800 dark:text-white">{m.titulo}</span>
                      {atrasado && <AlertTriangle size={13} className="text-red-500"/>}
                      {m.data_realizada && <CheckCircle2 size={13} className="text-emerald-500"/>}
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => { setEditId(m.id); setFTitulo(m.titulo); setFDesc(m.descricao||''); setFTipo(m.tipo); setFPrevista(m.data_prevista); setFRealizada(m.data_realizada||''); setFPercPrev(m.percentual_previsto); setFPercReal(m.percentual_realizado); setShowForm(true) }} className="p-1.5 text-slate-300 hover:text-blue-500"><Edit3 size={13}/></button>
                      {isAdmin && <button onClick={() => deletar(m.id)} className="p-1.5 text-slate-300 hover:text-red-500"><Trash2 size={13}/></button>}
                    </div>
                  </div>
                  {m.descricao && <p className="text-xs text-slate-500 mt-1">{m.descricao}</p>}
                  <div className="flex gap-4 mt-2 text-[10px] text-slate-400">
                    <span>Previsto: {new Date(m.data_prevista + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                    {m.data_realizada && <span className="text-emerald-600">Realizado: {new Date(m.data_realizada + 'T12:00:00').toLocaleDateString('pt-BR')}</span>}
                    <span>Avanço: {m.percentual_realizado}% de {m.percentual_previsto}%</span>
                  </div>
                  <div className="mt-2 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, m.percentual_realizado)}%`, background: m.cor }}/>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-3">
            <h2 className="text-lg font-bold dark:text-white">{editId ? 'Editar Marco' : 'Novo Marco'}</h2>
            <input value={fTitulo} onChange={e => setFTitulo(e.target.value)} placeholder="Título *" className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/>
            <input value={fDesc} onChange={e => setFDesc(e.target.value)} placeholder="Descrição" className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/>
            <select value={fTipo} onChange={e => setFTipo(e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm">
              {TIPOS.map(t => <option key={t.val} value={t.val}>{t.label}</option>)}</select>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-slate-500">Data prevista *</label><input type="date" value={fPrevista} onChange={e => setFPrevista(e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/></div>
              <div><label className="text-xs text-slate-500">Data realizada</label><input type="date" value={fRealizada} onChange={e => setFRealizada(e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-slate-500">% previsto</label><input type="number" min={0} max={100} value={fPercPrev} onChange={e => setFPercPrev(+e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/></div>
              <div><label className="text-xs text-slate-500">% realizado</label><input type="number" min={0} max={100} value={fPercReal} onChange={e => setFPercReal(+e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/></div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm">Cancelar</button>
              <button onClick={salvar} disabled={saving} className="px-5 py-2 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg text-sm">{saving ? 'Salvando...' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
