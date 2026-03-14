import { useEffect, useState, useMemo } from 'react'
import { GitBranch, Plus, Save, X, Loader2, Upload, Trash2, Edit3, TrendingUp, TrendingDown, Clock, FileText, AlertTriangle, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { usePerfilStore } from '../lib/perfilStore'

interface Aditivo { id: string; created_at: string; contrato_id: string; numero: number; tipo: string; descricao: string; data_assinatura: string | null; data_publicacao: string | null; valor_acrescimo: number; valor_supressao: number; dias_acrescimo: number; documento_path: string | null; documento_nome: string | null; observacoes: string | null; ativo: boolean }
interface Contrato { id: string; nome_obra: string; valor_contrato: number | null }

const TIPOS = [{ val: 'ACRESCIMO', label: 'Acréscimo', cor: 'emerald' }, { val: 'SUPRESSAO', label: 'Supressão', cor: 'red' }, { val: 'PRAZO', label: 'Prazo', cor: 'blue' }, { val: 'REEQUILIBRIO', label: 'Reequilíbrio', cor: 'purple' }, { val: 'MISTO', label: 'Misto', cor: 'amber' }]

export function AditivosPage() {
  const { perfilAtual } = usePerfilStore()
  const isAdmin = perfilAtual?.role === 'ADMIN'
  const [aditivos, setAditivos] = useState<Aditivo[]>([])
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroContrato, setFiltroContrato] = useState('todos')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)

  const [fContrato, setFContrato] = useState(''); const [fTipo, setFTipo] = useState('ACRESCIMO'); const [fDesc, setFDesc] = useState('')
  const [fDataAss, setFDataAss] = useState(''); const [fDataPub, setFDataPub] = useState(''); const [fValAcr, setFValAcr] = useState(0)
  const [fValSup, setFValSup] = useState(0); const [fDias, setFDias] = useState(0); const [fObs, setFObs] = useState(''); const [fArquivo, setFArquivo] = useState<File | null>(null)

  useEffect(() => { fetchAll() }, [])
  async function fetchAll() {
    setLoading(true)
    const [aRes, cRes] = await Promise.all([
      supabase.from('aditivos').select('*').order('numero'),
      supabase.from('contratos').select('id, nome_obra, valor_contrato'),
    ])
    if (aRes.data) setAditivos(aRes.data)
    if (cRes.data) setContratos(cRes.data)
    setLoading(false)
  }

  async function salvar() {
    if (!fContrato || !fDesc) { toast.error('Contrato e descrição obrigatórios'); return }
    setSaving(true)
    let docPath = null, docNome = null
    if (fArquivo) {
      const path = `aditivos/${Date.now()}_${fArquivo.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error: upErr } = await supabase.storage.from('aditivos').upload(path, fArquivo)
      if (!upErr) { docPath = path; docNome = fArquivo.name }
    }
    const maxNum = aditivos.filter(a => a.contrato_id === fContrato).reduce((m, a) => Math.max(m, a.numero), 0)
    const payload: any = { contrato_id: fContrato, tipo: fTipo, descricao: fDesc, data_assinatura: fDataAss || null, data_publicacao: fDataPub || null, valor_acrescimo: fValAcr, valor_supressao: fValSup, dias_acrescimo: fDias, observacoes: fObs || null }
    if (docPath) { payload.documento_path = docPath; payload.documento_nome = docNome }
    if (!editId) { payload.numero = maxNum + 1; payload.criado_por = perfilAtual!.id }
    const { error } = editId ? await supabase.from('aditivos').update(payload).eq('id', editId) : await supabase.from('aditivos').insert(payload)
    if (error) toast.error(error.message); else { toast.success('Salvo!'); setShowForm(false); fetchAll() }
    setSaving(false)
  }

  const contratoMap: Record<string, Contrato> = {}; contratos.forEach(c => contratoMap[c.id] = c)
  const filtrados = filtroContrato === 'todos' ? aditivos : aditivos.filter(a => a.contrato_id === filtroContrato)

  const totalAcrescimo = filtrados.reduce((s, a) => s + Number(a.valor_acrescimo), 0)
  const totalSupressao = filtrados.reduce((s, a) => s + Number(a.valor_supressao), 0)
  const totalDias = filtrados.reduce((s, a) => s + a.dias_acrescimo, 0)
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  // Alerta 25%
  const alertas25 = useMemo(() => {
    const map: Record<string, { contrato: string; valor: number; acrescimo: number; pct: number }> = {}
    aditivos.forEach(a => {
      const c = contratoMap[a.contrato_id]
      if (!c?.valor_contrato) return
      if (!map[a.contrato_id]) map[a.contrato_id] = { contrato: c.nome_obra, valor: c.valor_contrato, acrescimo: 0, pct: 0 }
      map[a.contrato_id].acrescimo += Number(a.valor_acrescimo)
    })
    return Object.values(map).map(m => ({ ...m, pct: (m.acrescimo / m.valor) * 100 })).filter(m => m.pct >= 20)
  }, [aditivos, contratoMap])

  return (
    <div className="p-6 max-w-5xl overflow-y-auto" style={{ height: '100%' }}>
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><FileText size={24} className="text-amber-500"/> Aditivos Contratuais</h1>
          <p className="text-sm text-slate-500">Controle de aditivos de valor, prazo e escopo</p></div>
        <div className="flex gap-2">
          <select value={filtroContrato} onChange={e => setFiltroContrato(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white max-w-52">
            <option value="todos">Todos os contratos</option>{contratos.map(c => <option key={c.id} value={c.id}>{c.nome_obra}</option>)}</select>
          {isAdmin && <button onClick={() => { setEditId(null); setFContrato(filtroContrato !== 'todos' ? filtroContrato : ''); setFTipo('ACRESCIMO'); setFDesc(''); setFDataAss(''); setFDataPub(''); setFValAcr(0); setFValSup(0); setFDias(0); setFObs(''); setFArquivo(null); setShowForm(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg text-sm"><Plus size={14}/> Novo Aditivo</button>}
        </div>
      </div>

      {/* Alertas 25% */}
      {alertas25.map(a => (
        <div key={a.contrato} className={`mb-3 flex items-center gap-3 px-4 py-3 rounded-xl border ${a.pct >= 25 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
          <AlertTriangle size={16} className={a.pct >= 25 ? 'text-red-500' : 'text-amber-500'}/>
          <p className="text-xs"><b>{a.contrato}</b> — acréscimos totais: {fmt(a.acrescimo)} ({a.pct.toFixed(1)}% do contrato).
            {a.pct >= 25 ? ' LIMITE LEGAL DE 25% ATINGIDO!' : ' Aproximando do limite de 25%.'}</p>
        </div>
      ))}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4"><p className="text-[10px] text-slate-400 uppercase font-semibold">Total aditivos</p><p className="text-2xl font-bold text-slate-800 dark:text-white">{filtrados.length}</p></div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4"><p className="text-[10px] text-emerald-600 uppercase font-semibold">Acréscimos</p><p className="text-lg font-bold text-emerald-700">{fmt(totalAcrescimo)}</p></div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4"><p className="text-[10px] text-red-600 uppercase font-semibold">Supressões</p><p className="text-lg font-bold text-red-700">{fmt(totalSupressao)}</p></div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4"><p className="text-[10px] text-blue-600 uppercase font-semibold">Dias adicionados</p><p className="text-2xl font-bold text-blue-700">+{totalDias}</p></div>
      </div>

      {/* Lista */}
      {filtrados.length === 0 ? <div className="text-center py-16 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl"><FileText size={36} className="mx-auto text-slate-300 mb-3"/><p className="text-slate-400">{loading ? 'Carregando...' : 'Nenhum aditivo registrado'}</p></div> : (
        <div className="space-y-2">
          {filtrados.map(a => {
            const tipo = TIPOS.find(t => t.val === a.tipo)
            return (
              <div key={a.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400">#{a.numero}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium bg-${tipo?.cor}-100 text-${tipo?.cor}-700`}>{tipo?.label}</span>
                    <span className="text-sm font-bold text-slate-800 dark:text-white">{contratoMap[a.contrato_id]?.nome_obra || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    {a.data_assinatura && <span>{new Date(a.data_assinatura + 'T12:00:00').toLocaleDateString('pt-BR')}</span>}
                    {isAdmin && <button onClick={() => { setEditId(a.id); setFContrato(a.contrato_id); setFTipo(a.tipo); setFDesc(a.descricao); setFDataAss(a.data_assinatura||''); setFDataPub(a.data_publicacao||''); setFValAcr(Number(a.valor_acrescimo)); setFValSup(Number(a.valor_supressao)); setFDias(a.dias_acrescimo); setFObs(a.observacoes||''); setShowForm(true) }} className="p-1 text-slate-300 hover:text-blue-500"><Edit3 size={13}/></button>}
                  </div>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">{a.descricao}</p>
                <div className="flex gap-4 text-[10px]">
                  {Number(a.valor_acrescimo) > 0 && <span className="text-emerald-600 font-bold">+{fmt(Number(a.valor_acrescimo))}</span>}
                  {Number(a.valor_supressao) > 0 && <span className="text-red-600 font-bold">-{fmt(Number(a.valor_supressao))}</span>}
                  {a.dias_acrescimo > 0 && <span className="text-blue-600 font-bold">+{a.dias_acrescimo} dias</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-10 overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 mb-10 p-6 space-y-3">
            <h2 className="text-lg font-bold dark:text-white">{editId ? 'Editar Aditivo' : 'Novo Aditivo'}</h2>
            <select value={fContrato} onChange={e => setFContrato(e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm">
              <option value="">Selecione o contrato *</option>{contratos.map(c => <option key={c.id} value={c.id}>{c.nome_obra}</option>)}</select>
            <select value={fTipo} onChange={e => setFTipo(e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm">
              {TIPOS.map(t => <option key={t.val} value={t.val}>{t.label}</option>)}</select>
            <textarea value={fDesc} onChange={e => setFDesc(e.target.value)} placeholder="Descrição *" rows={2} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-slate-500">Data assinatura</label><input type="date" value={fDataAss} onChange={e => setFDataAss(e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/></div>
              <div><label className="text-xs text-slate-500">Data publicação</label><input type="date" value={fDataPub} onChange={e => setFDataPub(e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="text-xs text-slate-500">Valor acréscimo</label><input type="number" min={0} step="0.01" value={fValAcr} onChange={e => setFValAcr(+e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/></div>
              <div><label className="text-xs text-slate-500">Valor supressão</label><input type="number" min={0} step="0.01" value={fValSup} onChange={e => setFValSup(+e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/></div>
              <div><label className="text-xs text-slate-500">Dias prazo</label><input type="number" min={0} value={fDias} onChange={e => setFDias(+e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/></div>
            </div>
            <div><label className="text-xs text-slate-500">Documento (PDF)</label><input type="file" accept=".pdf" onChange={e => setFArquivo(e.target.files?.[0] || null)} className="w-full text-xs"/></div>
            <textarea value={fObs} onChange={e => setFObs(e.target.value)} placeholder="Observações" rows={2} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm">Cancelar</button>
              <button onClick={salvar} disabled={saving} className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg text-sm">{saving ? 'Salvando...' : 'Salvar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
