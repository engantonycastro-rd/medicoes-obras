import { useEffect, useState, useMemo } from 'react'
import { BookOpen, Plus, ChevronDown, ChevronUp, Sun, Cloud, CloudRain, CloudDrizzle, CheckCircle2, User, Calendar, RefreshCw, Filter, Search, Download, Loader2, Edit3, Save, X, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { usePerfilStore } from '../lib/perfilStore'
import { useStore } from '../lib/store'

interface Diario { id: string; created_at: string; obra_id: string; data: string; criado_por: string; clima_manha: string; clima_tarde: string; atividades: string; mao_obra_propria: number; mao_obra_terceiros: number; equipamentos: string; materiais_recebidos: string; visitantes: string; ocorrencias: string; observacoes: string; validado: boolean; validado_por: string | null; validado_em: string | null }
interface ObraRef { id: string; nome_obra: string }
interface PerfilRef { id: string; nome: string | null; email: string }
const CLIMA_ICON: Record<string, any> = { SOL: Sun, NUBLADO: Cloud, CHUVA: CloudRain, CHUVOSO: CloudDrizzle }
const CLIMA_LABEL: Record<string, string> = { SOL: 'Sol', NUBLADO: 'Nublado', CHUVA: 'Chuva', CHUVOSO: 'Chuvoso' }

export function DiarioObraPage() {
  const { perfilAtual } = usePerfilStore()
  const { obraAtiva } = useStore()
  const [diarios, setDiarios] = useState<Diario[]>([])
  const [obras, setObras] = useState<ObraRef[]>([])
  const [perfis, setPerfis] = useState<Record<string, PerfilRef>>({})
  const [loading, setLoading] = useState(true)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [filtroObra, setFiltroObra] = useState('todas')
  const [filtroBusca, setFiltroBusca] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Form
  const [fObraId, setFObraId] = useState('')
  const [fData, setFData] = useState(new Date().toISOString().split('T')[0])
  const [fClimaManha, setFClimaManha] = useState('SOL')
  const [fClimaTarde, setFClimaTarde] = useState('SOL')
  const [fAtividades, setFAtividades] = useState('')
  const [fMOPropria, setFMOPropria] = useState(0)
  const [fMOTerceiros, setFMOTerceiros] = useState(0)
  const [fEquipamentos, setFEquipamentos] = useState('')
  const [fMateriais, setFMateriais] = useState('')
  const [fVisitantes, setFVisitantes] = useState('')
  const [fOcorrencias, setFOcorrencias] = useState('')
  const [fObs, setFObs] = useState('')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [dRes, oRes] = await Promise.all([
      supabase.from('diario_obra').select('*').order('data', { ascending: false }).limit(200),
      supabase.from('obras').select('id, nome_obra').eq('status', 'ATIVA').order('nome_obra'),
    ])
    if (dRes.data) {
      setDiarios(dRes.data)
      const uids = new Set(dRes.data.map((d: any) => d.criado_por).concat(dRes.data.filter((d: any) => d.validado_por).map((d: any) => d.validado_por)))
      if (uids.size > 0) {
        const { data: pData } = await supabase.from('perfis').select('id, nome, email').in('id', [...uids])
        if (pData) { const m: Record<string, PerfilRef> = {}; pData.forEach((p: any) => m[p.id] = p); setPerfis(m) }
      }
    }
    if (oRes.data) setObras(oRes.data)
    setLoading(false)
  }

  function resetForm() {
    setEditId(null); setFObraId(obraAtiva?.id || ''); setFData(new Date().toISOString().split('T')[0])
    setFClimaManha('SOL'); setFClimaTarde('SOL'); setFAtividades(''); setFMOPropria(0); setFMOTerceiros(0)
    setFEquipamentos(''); setFMateriais(''); setFVisitantes(''); setFOcorrencias(''); setFObs('')
  }

  function editDiario(d: Diario) {
    setEditId(d.id); setFObraId(d.obra_id); setFData(d.data)
    setFClimaManha(d.clima_manha); setFClimaTarde(d.clima_tarde); setFAtividades(d.atividades || '')
    setFMOPropria(d.mao_obra_propria); setFMOTerceiros(d.mao_obra_terceiros)
    setFEquipamentos(d.equipamentos || ''); setFMateriais(d.materiais_recebidos || '')
    setFVisitantes(d.visitantes || ''); setFOcorrencias(d.ocorrencias || ''); setFObs(d.observacoes || '')
    setShowForm(true)
  }

  async function salvar() {
    if (!fObraId || !fData) { toast.error('Obra e data obrigatórios'); return }
    setSaving(true)
    const payload = { obra_id: fObraId, data: fData, criado_por: perfilAtual!.id, clima_manha: fClimaManha, clima_tarde: fClimaTarde, atividades: fAtividades || null, mao_obra_propria: fMOPropria, mao_obra_terceiros: fMOTerceiros, equipamentos: fEquipamentos || null, materiais_recebidos: fMateriais || null, visitantes: fVisitantes || null, ocorrencias: fOcorrencias || null, observacoes: fObs || null }
    let err
    if (editId) {
      const { error } = await supabase.from('diario_obra').update(payload).eq('id', editId)
      err = error
    } else {
      const { error } = await supabase.from('diario_obra').insert(payload)
      err = error
    }
    if (err) { toast.error(err.message.includes('unique') ? 'Já existe diário para esta obra nesta data' : err.message) }
    else { toast.success(editId ? 'Diário atualizado!' : 'Diário registrado!'); setShowForm(false); resetForm(); fetchAll() }
    setSaving(false)
  }

  async function validar(d: Diario) {
    await supabase.from('diario_obra').update({ validado: true, validado_por: perfilAtual!.id, validado_em: new Date().toISOString() }).eq('id', d.id)
    toast.success('Diário validado!')
    fetchAll()
  }

  const obraMap = useMemo(() => { const m: Record<string, string> = {}; obras.forEach(o => m[o.id] = o.nome_obra); return m }, [obras])
  const filtrados = useMemo(() => {
    let list = diarios
    if (filtroObra !== 'todas') list = list.filter(d => d.obra_id === filtroObra)
    if (filtroBusca) { const q = filtroBusca.toLowerCase(); list = list.filter(d => (d.atividades || '').toLowerCase().includes(q) || (obraMap[d.obra_id] || '').toLowerCase().includes(q)) }
    return list
  }, [diarios, filtroObra, filtroBusca, obraMap])

  const ClimaBtn = ({ val, selected, onClick }: any) => { const Icon = CLIMA_ICON[val] || Sun; return (<button type="button" onClick={() => onClick(val)} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${selected === val ? 'bg-primary-500 text-white border-primary-500' : 'bg-white border-slate-200 text-slate-600'}`}><Icon size={14}/> {CLIMA_LABEL[val]}</button>) }

  return (
    <div className="p-6 max-w-5xl overflow-y-auto" style={{ height: '100%' }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><BookOpen size={24} className="text-primary-500"/> Diário de Obra</h1>
          <p className="text-sm text-slate-500">Registro diário de atividades, equipe e ocorrências</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchAll} className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm hover:bg-slate-50"><RefreshCw size={14}/> Atualizar</button>
          <button onClick={() => { resetForm(); setShowForm(true) }} className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg text-sm"><Plus size={14}/> Novo Diário</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <p className="text-[10px] text-slate-400 uppercase font-semibold">Total</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-white">{filtrados.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <p className="text-[10px] text-slate-400 uppercase font-semibold">Validados</p>
          <p className="text-2xl font-bold text-emerald-600">{filtrados.filter(d => d.validado).length}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <p className="text-[10px] text-slate-400 uppercase font-semibold">Pendentes</p>
          <p className="text-2xl font-bold text-primary-600">{filtrados.filter(d => !d.validado).length}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 mb-5 flex-wrap bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
        <Filter size={14} className="text-slate-400"/>
        <select value={filtroObra} onChange={e => setFiltroObra(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white max-w-52">
          <option value="todas">Todas as obras</option>
          {obras.map(o => <option key={o.id} value={o.id}>{o.nome_obra}</option>)}
        </select>
        <div className="relative flex-1 min-w-36">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input value={filtroBusca} onChange={e => setFiltroBusca(e.target.value)} placeholder="Buscar..." className="w-full pl-7 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white"/>
        </div>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-10 overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 mb-10">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-bold text-slate-800 dark:text-white">{editId ? 'Editar Diário' : 'Novo Diário de Obra'}</h2>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"><X size={18}/></button>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1">Obra *</label>
                  <select value={fObraId} onChange={e => setFObraId(e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm">
                    <option value="">Selecione...</option>
                    {obras.map(o => <option key={o.id} value={o.id}>{o.nome_obra}</option>)}
                  </select></div>
                <div><label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1">Data *</label>
                  <input type="date" value={fData} onChange={e => setFData(e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-2">Clima manhã</label>
                  <div className="flex gap-1.5 flex-wrap">{Object.keys(CLIMA_ICON).map(v => <ClimaBtn key={v} val={v} selected={fClimaManha} onClick={setFClimaManha}/>)}</div></div>
                <div><label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-2">Clima tarde</label>
                  <div className="flex gap-1.5 flex-wrap">{Object.keys(CLIMA_ICON).map(v => <ClimaBtn key={v} val={v} selected={fClimaTarde} onClick={setFClimaTarde}/>)}</div></div>
              </div>
              <div><label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1">Atividades executadas</label>
                <textarea value={fAtividades} onChange={e => setFAtividades(e.target.value)} rows={3} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm" placeholder="Descreva as atividades do dia..."/></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1">Mão de obra própria (qtd)</label>
                  <input type="number" min={0} value={fMOPropria} onChange={e => setFMOPropria(+e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/></div>
                <div><label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1">Mão de obra terceiros (qtd)</label>
                  <input type="number" min={0} value={fMOTerceiros} onChange={e => setFMOTerceiros(+e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/></div>
              </div>
              <div><label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1">Equipamentos em uso</label>
                <input value={fEquipamentos} onChange={e => setFEquipamentos(e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm" placeholder="Ex: Betoneira, retroescavadeira..."/></div>
              <div><label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1">Materiais recebidos</label>
                <input value={fMateriais} onChange={e => setFMateriais(e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm" placeholder="Ex: 500 sacos de cimento, 10t de ferro..."/></div>
              <div><label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1">Visitantes</label>
                <input value={fVisitantes} onChange={e => setFVisitantes(e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm" placeholder="Ex: Fiscal da prefeitura - João Silva"/></div>
              <div><label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1">Ocorrências</label>
                <textarea value={fOcorrencias} onChange={e => setFOcorrencias(e.target.value)} rows={2} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm" placeholder="Problemas, paralisações, chuva..."/></div>
              <div><label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1">Observações</label>
                <textarea value={fObs} onChange={e => setFObs(e.target.value)} rows={2} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/></div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-700">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600">Cancelar</button>
              <button onClick={salvar} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg text-sm disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} {editId ? 'Atualizar' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lista */}
      {filtrados.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
          <BookOpen size={36} className="mx-auto text-slate-300 mb-3"/>
          <p className="text-slate-400">{loading ? 'Carregando...' : 'Nenhum diário registrado'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtrados.map(d => {
            const aberto = expandido === d.id
            const ClimaM = CLIMA_ICON[d.clima_manha] || Sun
            const ClimaT = CLIMA_ICON[d.clima_tarde] || Sun
            return (
              <div key={d.id} className={`bg-white dark:bg-slate-800 border rounded-xl overflow-hidden transition-shadow hover:shadow-md ${d.validado ? 'border-emerald-200 dark:border-emerald-800' : 'border-slate-200 dark:border-slate-700'}`}>
                <div className="p-4 flex items-center gap-4 cursor-pointer" onClick={() => setExpandido(aberto ? null : d.id)}>
                  <div className="text-center shrink-0 w-14">
                    <p className="text-lg font-bold text-slate-800 dark:text-white">{new Date(d.data + 'T12:00:00').getDate()}</p>
                    <p className="text-[10px] text-slate-400 uppercase">{new Date(d.data + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-bold text-slate-800 dark:text-white">{obraMap[d.obra_id] || '—'}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium flex items-center gap-0.5"><ClimaM size={9}/> {CLIMA_LABEL[d.clima_manha]}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium flex items-center gap-0.5"><ClimaT size={9}/> {CLIMA_LABEL[d.clima_tarde]}</span>
                      {d.validado && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center gap-0.5"><CheckCircle2 size={9}/> Validado</span>}
                      {d.ocorrencias && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-bold flex items-center gap-0.5"><AlertTriangle size={9}/> Ocorrência</span>}
                    </div>
                    <div className="flex gap-3 text-[10px] text-slate-400">
                      <span>MO: {d.mao_obra_propria + d.mao_obra_terceiros} ({d.mao_obra_propria} própria + {d.mao_obra_terceiros} terceiros)</span>
                      <span>Por: {perfis[d.criado_por]?.nome || '—'}</span>
                    </div>
                    {d.atividades && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">{d.atividades}</p>}
                  </div>
                  {aberto ? <ChevronUp size={16} className="text-primary-500"/> : <ChevronDown size={16} className="text-slate-400"/>}
                </div>
                {aberto && (
                  <div className="border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 p-5 space-y-3">
                    {d.atividades && <div><p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Atividades</p><p className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap">{d.atividades}</p></div>}
                    {d.equipamentos && <div><p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Equipamentos</p><p className="text-xs text-slate-600 dark:text-slate-400">{d.equipamentos}</p></div>}
                    {d.materiais_recebidos && <div><p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Materiais recebidos</p><p className="text-xs text-slate-600 dark:text-slate-400">{d.materiais_recebidos}</p></div>}
                    {d.visitantes && <div><p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Visitantes</p><p className="text-xs text-slate-600 dark:text-slate-400">{d.visitantes}</p></div>}
                    {d.ocorrencias && <div><p className="text-xs font-bold text-red-700 mb-1">Ocorrências</p><p className="text-xs text-red-600">{d.ocorrencias}</p></div>}
                    {d.observacoes && <div><p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Observações</p><p className="text-xs text-slate-600 dark:text-slate-400">{d.observacoes}</p></div>}
                    {d.validado && <p className="text-[10px] text-emerald-600">Validado por {perfis[d.validado_por || '']?.nome || '—'} em {d.validado_em ? new Date(d.validado_em).toLocaleDateString('pt-BR') : ''}</p>}
                    <div className="flex gap-2 pt-2">
                      <button onClick={() => editDiario(d)} className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-100"><Edit3 size={12}/> Editar</button>
                      {!d.validado && (perfilAtual?.role === 'ADMIN' || perfilAtual?.role === 'GESTOR' || perfilAtual?.role === 'ENGENHEIRO') && (
                        <button onClick={() => validar(d)} className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-xs"><CheckCircle2 size={12}/> Validar</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
