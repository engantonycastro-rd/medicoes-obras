import { useEffect, useState } from 'react'
import { Briefcase, Plus, Edit3, Trash2, Save, X, Loader2, ChevronDown, ChevronUp, RefreshCw, DollarSign } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { usePerfilStore } from '../lib/perfilStore'

interface Sub { id: string; razao_social: string; cnpj: string; contato_nome: string; contato_telefone: string; contato_email: string; especialidade: string; ativo: boolean; observacoes: string }
interface SubObra { id: string; subempreiteiro_id: string; obra_id: string; servico: string; valor_contratado: number; valor_medido: number; valor_pago: number; status: string }

export function SubempreiteirosPage() {
  const { perfilAtual } = usePerfilStore()
  const isAdmin = perfilAtual?.role === 'ADMIN'
  const [subs, setSubs] = useState<Sub[]>([]); const [subObras, setSubObras] = useState<SubObra[]>([])
  const [obras, setObras] = useState<{id:string;nome_obra:string}[]>([])
  const [loading, setLoading] = useState(true); const [expandido, setExpandido] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false); const [editId, setEditId] = useState<string | null>(null); const [saving, setSaving] = useState(false)
  const [fRazao, setFRazao] = useState(''); const [fCnpj, setFCnpj] = useState(''); const [fNome, setFNome] = useState('')
  const [fTel, setFTel] = useState(''); const [fEmail, setFEmail] = useState(''); const [fEspec, setFEspec] = useState(''); const [fObs, setFObs] = useState('')

  useEffect(() => { fetchAll() }, [])
  async function fetchAll() {
    setLoading(true)
    const [sRes, soRes, oRes] = await Promise.all([supabase.from('subempreiteiros').select('*').order('razao_social'), supabase.from('subempreiteiro_obras').select('*'), supabase.from('obras').select('id, nome_obra')])
    if (sRes.data) setSubs(sRes.data); if (soRes.data) setSubObras(soRes.data); if (oRes.data) setObras(oRes.data)
    setLoading(false)
  }
  async function salvar() {
    if (!fRazao) { toast.error('Razão social obrigatória'); return }
    setSaving(true)
    const payload = { razao_social: fRazao, cnpj: fCnpj||null, contato_nome: fNome||null, contato_telefone: fTel||null, contato_email: fEmail||null, especialidade: fEspec||null, observacoes: fObs||null }
    const { error } = editId ? await supabase.from('subempreiteiros').update(payload).eq('id', editId) : await supabase.from('subempreiteiros').insert(payload)
    if (error) toast.error(error.message); else { toast.success('Salvo!'); setShowForm(false); fetchAll() }
    setSaving(false)
  }
  async function deletar(id: string) { if (!confirm('Excluir subempreiteiro?')) return; await supabase.from('subempreiteiros').delete().eq('id', id); fetchAll() }
  const obraMap: Record<string,string> = {}; obras.forEach(o => obraMap[o.id] = o.nome_obra)
  const fmt = (v: number) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  return (
    <div className="p-6 max-w-5xl overflow-y-auto" style={{ height: '100%' }}>
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><Briefcase size={24} className="text-amber-500"/> Subempreiteiros</h1>
          <p className="text-sm text-slate-500">Gestão de terceirizados e medições</p></div>
        <div className="flex gap-2">
          <button onClick={fetchAll} className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm hover:bg-slate-50"><RefreshCw size={14}/></button>
          {isAdmin && <button onClick={() => { setEditId(null); setFRazao(''); setFCnpj(''); setFNome(''); setFTel(''); setFEmail(''); setFEspec(''); setFObs(''); setShowForm(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg text-sm"><Plus size={14}/> Novo</button>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4"><p className="text-[10px] text-slate-400 uppercase font-semibold">Cadastrados</p><p className="text-2xl font-bold text-slate-800 dark:text-white">{subs.length}</p></div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4"><p className="text-[10px] text-slate-400 uppercase font-semibold">Vínculos ativos</p><p className="text-2xl font-bold text-emerald-600">{subObras.filter(s => s.status === 'ATIVO').length}</p></div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4"><p className="text-[10px] text-slate-400 uppercase font-semibold">Valor contratado</p><p className="text-lg font-bold text-amber-600">{fmt(subObras.reduce((s,o) => s+Number(o.valor_contratado),0))}</p></div>
      </div>

      {subs.length === 0 ? <div className="text-center py-16 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl"><Briefcase size={36} className="mx-auto text-slate-300 mb-3"/><p className="text-slate-400">{loading ? 'Carregando...' : 'Nenhum subempreiteiro'}</p></div> : (
        <div className="space-y-2">{subs.map(s => {
          const obrasDoSub = subObras.filter(so => so.subempreiteiro_id === s.id)
          return (
            <div key={s.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <div className="p-4 flex items-center gap-3 cursor-pointer" onClick={() => setExpandido(expandido === s.id ? null : s.id)}>
                <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center shrink-0"><Briefcase size={18} className="text-amber-600"/></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 dark:text-white">{s.razao_social}</p>
                  <p className="text-[10px] text-slate-400">{s.cnpj && `CNPJ: ${s.cnpj} · `}{s.especialidade || 'Sem especialidade'} · {obrasDoSub.length} obra(s)</p>
                </div>
                <div className="flex items-center gap-1">
                  {isAdmin && <button onClick={e => { e.stopPropagation(); setEditId(s.id); setFRazao(s.razao_social); setFCnpj(s.cnpj||''); setFNome(s.contato_nome||''); setFTel(s.contato_telefone||''); setFEmail(s.contato_email||''); setFEspec(s.especialidade||''); setFObs(s.observacoes||''); setShowForm(true) }} className="p-1.5 text-slate-300 hover:text-blue-500"><Edit3 size={13}/></button>}
                  {isAdmin && <button onClick={e => { e.stopPropagation(); deletar(s.id) }} className="p-1.5 text-slate-300 hover:text-red-500"><Trash2 size={13}/></button>}
                  {expandido === s.id ? <ChevronUp size={14} className="text-amber-500"/> : <ChevronDown size={14} className="text-slate-400"/>}
                </div>
              </div>
              {expandido === s.id && (
                <div className="border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 p-4 space-y-2">
                  {s.contato_nome && <p className="text-xs text-slate-600 dark:text-slate-400">Contato: {s.contato_nome} {s.contato_telefone && `· ${s.contato_telefone}`} {s.contato_email && `· ${s.contato_email}`}</p>}
                  {obrasDoSub.length > 0 ? obrasDoSub.map(so => (
                    <div key={so.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-3 flex items-center justify-between">
                      <div><p className="text-xs font-bold text-slate-700 dark:text-white">{obraMap[so.obra_id] || '—'}</p><p className="text-[10px] text-slate-400">{so.servico}</p></div>
                      <div className="text-right text-[10px]"><p className="text-slate-600">Contratado: {fmt(Number(so.valor_contratado))}</p><p className="text-emerald-600">Medido: {fmt(Number(so.valor_medido))}</p><p className="text-amber-600">Pago: {fmt(Number(so.valor_pago))}</p></div>
                    </div>
                  )) : <p className="text-xs text-slate-400">Sem obras vinculadas</p>}
                </div>
              )}
            </div>
          )
        })}</div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-3">
            <h2 className="text-lg font-bold dark:text-white">{editId ? 'Editar' : 'Novo Subempreiteiro'}</h2>
            <input value={fRazao} onChange={e => setFRazao(e.target.value)} placeholder="Razão social *" className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/>
            <input value={fCnpj} onChange={e => setFCnpj(e.target.value)} placeholder="CNPJ" className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/>
            <div className="grid grid-cols-2 gap-3">
              <input value={fNome} onChange={e => setFNome(e.target.value)} placeholder="Nome do contato" className="border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/>
              <input value={fTel} onChange={e => setFTel(e.target.value)} placeholder="Telefone" className="border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/>
            </div>
            <input value={fEmail} onChange={e => setFEmail(e.target.value)} placeholder="E-mail" className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/>
            <input value={fEspec} onChange={e => setFEspec(e.target.value)} placeholder="Especialidade (ex: Elétrica)" className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/>
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
