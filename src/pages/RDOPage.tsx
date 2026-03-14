import { useEffect, useState } from 'react'
import { FileText, Plus, CheckCircle2, Send, Edit3, Download, RefreshCw, Filter, ChevronDown, ChevronUp, Save, X, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import jsPDF from 'jspdf'
import { supabase } from '../lib/supabase'
import { usePerfilStore } from '../lib/perfilStore'

interface RDO { id: string; created_at: string; diario_id: string; obra_id: string; data: string; parecer_tecnico: string | null; pendencias: string | null; providencias: string | null; status: string; emitido_por: string | null; emitido_em: string | null; assinado_por: string | null; assinado_em: string | null }
interface Diario { id: string; data: string; obra_id: string; atividades: string; mao_obra_propria: number; mao_obra_terceiros: number; equipamentos: string; ocorrencias: string; clima_manha: string; clima_tarde: string; visitantes: string; observacoes: string }

export function RDOPage() {
  const { perfilAtual } = usePerfilStore()
  const isAdmin = perfilAtual?.role === 'ADMIN'
  const isGestor = perfilAtual?.role === 'GESTOR'
  const isEng = perfilAtual?.role === 'ENGENHEIRO'
  const canEmit = isAdmin || isGestor || isEng

  const [rdos, setRdos] = useState<RDO[]>([])
  const [diariosSemRDO, setDiariosSemRDO] = useState<Diario[]>([])
  const [obras, setObras] = useState<{ id: string; nome_obra: string }[]>([])
  const [perfis, setPerfis] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [diarioExpandido, setDiarioExpandido] = useState<Record<string, Diario | null>>({})
  const [filtroObra, setFiltroObra] = useState('todas')
  const [showForm, setShowForm] = useState(false); const [saving, setSaving] = useState(false)
  const [fDiarioId, setFDiarioId] = useState(''); const [fParecer, setFParecer] = useState(''); const [fPendencias, setFPendencias] = useState(''); const [fProvidencias, setFProvidencias] = useState('')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [rRes, dRes, oRes] = await Promise.all([
      supabase.from('rdo').select('*').order('data', { ascending: false }).limit(100),
      supabase.from('diario_obra').select('*').eq('validado', true).order('data', { ascending: false }),
      supabase.from('obras').select('id, nome_obra').eq('status', 'ATIVA').order('nome_obra'),
    ])
    if (rRes.data) {
      setRdos(rRes.data)
      const uids = new Set([...rRes.data.map((r: any) => r.emitido_por), ...rRes.data.map((r: any) => r.assinado_por)].filter(Boolean))
      if (uids.size > 0) { const { data: p } = await supabase.from('perfis').select('id, nome').in('id', [...uids]); if (p) { const m: Record<string, string> = {}; p.forEach((x: any) => m[x.id] = x.nome || 'Usuário'); setPerfis(m) } }
    }
    if (dRes.data && rRes.data) {
      const rdoDiarioIds = new Set(rRes.data.map((r: any) => r.diario_id))
      setDiariosSemRDO(dRes.data.filter((d: any) => !rdoDiarioIds.has(d.id)))
    }
    if (oRes.data) setObras(oRes.data)
    setLoading(false)
  }

  async function expandir(rdo: RDO) {
    if (expandido === rdo.id) { setExpandido(null); return }
    setExpandido(rdo.id)
    if (!diarioExpandido[rdo.diario_id]) {
      const { data } = await supabase.from('diario_obra').select('*').eq('id', rdo.diario_id).single()
      if (data) setDiarioExpandido(p => ({ ...p, [rdo.diario_id]: data }))
    }
  }

  async function criarRDO() {
    if (!fDiarioId) { toast.error('Selecione um diário'); return }
    setSaving(true)
    const diario = diariosSemRDO.find(d => d.id === fDiarioId)
    if (!diario) { toast.error('Diário não encontrado'); setSaving(false); return }
    const { error } = await supabase.from('rdo').insert({
      diario_id: fDiarioId, obra_id: diario.obra_id, data: diario.data,
      parecer_tecnico: fParecer || null, pendencias: fPendencias || null, providencias: fProvidencias || null,
      status: 'RASCUNHO',
    })
    if (error) toast.error(error.message); else { toast.success('RDO criado!'); setShowForm(false); fetchAll() }
    setSaving(false)
  }

  async function emitir(rdo: RDO) {
    await supabase.from('rdo').update({ status: 'EMITIDO', emitido_por: perfilAtual!.id, emitido_em: new Date().toISOString() }).eq('id', rdo.id)
    toast.success('RDO emitido!'); fetchAll()
  }
  async function assinar(rdo: RDO) {
    await supabase.from('rdo').update({ status: 'ASSINADO', assinado_por: perfilAtual!.id, assinado_em: new Date().toISOString() }).eq('id', rdo.id)
    toast.success('RDO assinado!'); fetchAll()
  }

  function gerarPDF(rdo: RDO) {
    const diario = diarioExpandido[rdo.diario_id]
    const obra = obras.find(o => o.id === rdo.obra_id)
    const doc = new jsPDF()
    doc.setFontSize(16); doc.text('RELATÓRIO DIÁRIO DE OBRA — RDO', 15, 20)
    doc.setFontSize(10); doc.text(`Obra: ${obra?.nome_obra || '—'}`, 15, 30)
    doc.text(`Data: ${new Date(rdo.data + 'T12:00:00').toLocaleDateString('pt-BR')}`, 15, 36)
    doc.text(`Status: ${rdo.status}`, 15, 42)
    let y = 54
    if (diario) {
      doc.setFontSize(11); doc.text('DADOS DO DIÁRIO:', 15, y); y += 8
      doc.setFontSize(9)
      doc.text(`Clima: Manhã - ${diario.clima_manha} / Tarde - ${diario.clima_tarde}`, 15, y); y += 6
      doc.text(`Mão de obra: ${diario.mao_obra_propria} própria + ${diario.mao_obra_terceiros} terceiros`, 15, y); y += 6
      if (diario.atividades) { const lines = doc.splitTextToSize(`Atividades: ${diario.atividades}`, 180); doc.text(lines, 15, y); y += lines.length * 5 + 4 }
      if (diario.equipamentos) { doc.text(`Equipamentos: ${diario.equipamentos}`, 15, y); y += 6 }
      if (diario.ocorrencias) { doc.text(`Ocorrências: ${diario.ocorrencias}`, 15, y); y += 6 }
      if (diario.visitantes) { doc.text(`Visitantes: ${diario.visitantes}`, 15, y); y += 6 }
    }
    y += 6
    doc.setFontSize(11); doc.text('PARECER TÉCNICO:', 15, y); y += 8
    doc.setFontSize(9)
    if (rdo.parecer_tecnico) { const lines = doc.splitTextToSize(rdo.parecer_tecnico, 180); doc.text(lines, 15, y); y += lines.length * 5 + 4 }
    if (rdo.pendencias) { doc.text(`Pendências: ${rdo.pendencias}`, 15, y); y += 6 }
    if (rdo.providencias) { doc.text(`Providências: ${rdo.providencias}`, 15, y); y += 6 }
    y += 15
    if (rdo.emitido_por) { doc.text(`Emitido por: ${perfis[rdo.emitido_por] || '—'} em ${rdo.emitido_em ? new Date(rdo.emitido_em).toLocaleDateString('pt-BR') : ''}`, 15, y); y += 6 }
    if (rdo.assinado_por) { doc.text(`Assinado por: ${perfis[rdo.assinado_por] || '—'} em ${rdo.assinado_em ? new Date(rdo.assinado_em).toLocaleDateString('pt-BR') : ''}`, 15, y) }
    doc.save(`RDO_${rdo.data}_${obra?.nome_obra?.replace(/\s+/g, '_') || 'obra'}.pdf`)
  }

  const obraMap: Record<string, string> = {}; obras.forEach(o => obraMap[o.id] = o.nome_obra)
  const filtrados = filtroObra === 'todas' ? rdos : rdos.filter(r => r.obra_id === filtroObra)
  const statusBadge = (s: string) => s === 'ASSINADO' ? 'bg-emerald-100 text-emerald-700' : s === 'EMITIDO' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'

  return (
    <div className="p-6 max-w-5xl overflow-y-auto" style={{ height: '100%' }}>
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><FileText size={24} className="text-amber-500"/> RDO — Relatório Diário de Obra</h1>
          <p className="text-sm text-slate-500">Gerado a partir dos diários validados</p></div>
        <div className="flex gap-2">
          <select value={filtroObra} onChange={e => setFiltroObra(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white">
            <option value="todas">Todas as obras</option>{obras.map(o => <option key={o.id} value={o.id}>{o.nome_obra}</option>)}</select>
          {canEmit && diariosSemRDO.length > 0 && <button onClick={() => { setFDiarioId(''); setFParecer(''); setFPendencias(''); setFProvidencias(''); setShowForm(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg text-sm"><Plus size={14}/> Gerar RDO</button>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4"><p className="text-[10px] text-slate-400 uppercase font-semibold">RDOs gerados</p><p className="text-2xl font-bold text-slate-800 dark:text-white">{filtrados.length}</p></div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4"><p className="text-[10px] text-emerald-600 uppercase font-semibold">Assinados</p><p className="text-2xl font-bold text-emerald-700">{filtrados.filter(r => r.status === 'ASSINADO').length}</p></div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4"><p className="text-[10px] text-amber-600 uppercase font-semibold">Diários aguardando RDO</p><p className="text-2xl font-bold text-amber-700">{diariosSemRDO.length}</p></div>
      </div>

      {filtrados.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl"><FileText size={36} className="mx-auto text-slate-300 mb-3"/><p className="text-slate-400">{loading ? 'Carregando...' : 'Nenhum RDO gerado'}</p></div>
      ) : (
        <div className="space-y-2">{filtrados.map(rdo => {
          const aberto = expandido === rdo.id
          const diario = diarioExpandido[rdo.diario_id]
          return (
            <div key={rdo.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <div className="p-4 flex items-center gap-4 cursor-pointer" onClick={() => expandir(rdo)}>
                <div className="text-center shrink-0 w-14"><p className="text-lg font-bold text-slate-800 dark:text-white">{new Date(rdo.data + 'T12:00:00').getDate()}</p><p className="text-[10px] text-slate-400 uppercase">{new Date(rdo.data + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short' })}</p></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5"><span className="text-sm font-bold text-slate-800 dark:text-white">{obraMap[rdo.obra_id] || '—'}</span><span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${statusBadge(rdo.status)}`}>{rdo.status}</span></div>
                  {rdo.parecer_tecnico && <p className="text-xs text-slate-500 truncate">{rdo.parecer_tecnico}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={e => { e.stopPropagation(); expandir(rdo).then(() => gerarPDF(rdo)) }} className="p-1.5 text-slate-300 hover:text-blue-500" title="Baixar PDF"><Download size={14}/></button>
                  {aberto ? <ChevronUp size={16} className="text-amber-500"/> : <ChevronDown size={16} className="text-slate-400"/>}
                </div>
              </div>
              {aberto && (
                <div className="border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 p-5 space-y-3">
                  {diario && (<div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-1">
                    <p className="text-xs font-bold text-blue-800">Dados do Diário</p>
                    <p className="text-xs text-blue-700">Clima: {diario.clima_manha} / {diario.clima_tarde} · MO: {diario.mao_obra_propria}+{diario.mao_obra_terceiros}</p>
                    {diario.atividades && <p className="text-xs text-blue-600">{diario.atividades}</p>}
                    {diario.ocorrencias && <p className="text-xs text-red-600">Ocorrências: {diario.ocorrencias}</p>}
                  </div>)}
                  {rdo.parecer_tecnico && <div><p className="text-xs font-bold text-slate-700 dark:text-slate-300">Parecer técnico</p><p className="text-xs text-slate-600 dark:text-slate-400">{rdo.parecer_tecnico}</p></div>}
                  {rdo.pendencias && <div><p className="text-xs font-bold text-slate-700">Pendências</p><p className="text-xs text-slate-600">{rdo.pendencias}</p></div>}
                  {rdo.providencias && <div><p className="text-xs font-bold text-slate-700">Providências</p><p className="text-xs text-slate-600">{rdo.providencias}</p></div>}
                  <div className="flex gap-2 pt-2">
                    {rdo.status === 'RASCUNHO' && canEmit && <button onClick={() => emitir(rdo)} className="flex items-center gap-1 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded-lg"><Send size={12}/> Emitir</button>}
                    {rdo.status === 'EMITIDO' && canEmit && <button onClick={() => assinar(rdo)} className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium rounded-lg"><CheckCircle2 size={12}/> Assinar</button>}
                    <button onClick={() => gerarPDF(rdo)} className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 text-xs text-slate-600 rounded-lg"><Download size={12}/> PDF</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}</div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 my-10 p-6 space-y-3">
            <h2 className="text-lg font-bold dark:text-white">Gerar RDO</h2>
            <div><label className="text-xs font-semibold text-slate-600 block mb-1">Diário validado *</label>
              <select value={fDiarioId} onChange={e => setFDiarioId(e.target.value)} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm">
                <option value="">Selecione...</option>
                {diariosSemRDO.map(d => <option key={d.id} value={d.id}>{obraMap[d.obra_id] || '—'} — {new Date(d.data + 'T12:00:00').toLocaleDateString('pt-BR')}</option>)}
              </select></div>
            <textarea value={fParecer} onChange={e => setFParecer(e.target.value)} placeholder="Parecer técnico" rows={3} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/>
            <textarea value={fPendencias} onChange={e => setFPendencias(e.target.value)} placeholder="Pendências" rows={2} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/>
            <textarea value={fProvidencias} onChange={e => setFProvidencias(e.target.value)} placeholder="Providências" rows={2} className="w-full border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"/>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm">Cancelar</button>
              <button onClick={criarRDO} disabled={saving} className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg text-sm">{saving ? 'Salvando...' : 'Gerar RDO'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
