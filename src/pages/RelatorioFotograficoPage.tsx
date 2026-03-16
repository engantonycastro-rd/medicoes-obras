import { useEffect, useState } from 'react'
import { Camera, Download, RefreshCw, Filter, Loader2, Image, Calendar, Building2 } from 'lucide-react'
import toast from 'react-hot-toast'
import jsPDF from 'jspdf'
import { supabase } from '../lib/supabase'

interface Foto { id: string; apontamento_id: string; url: string; path: string; nome: string | null; legenda: string | null; created_at: string; data?: string; obra_nome?: string }

export function RelatorioFotograficoPage() {
  const [fotos, setFotos] = useState<Foto[]>([])
  const [obras, setObras] = useState<{ id: string; nome_obra: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [gerando, setGerando] = useState(false)
  const [filtroObra, setFiltroObra] = useState('')
  const [filtroDataIni, setFiltroDataIni] = useState('')
  const [filtroDataFim, setFiltroDataFim] = useState('')
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set())
  const [lightbox, setLightbox] = useState<string | null>(null)

  useEffect(() => { fetchObras() }, [])

  async function fetchObras() {
    const { data } = await supabase.from('obras').select('id, nome_obra').eq('status', 'ATIVA').order('nome_obra')
    if (data) setObras(data)
    setLoading(false)
  }

  async function fetchFotos() {
    if (!filtroObra) { toast.error('Selecione uma obra'); return }
    setLoading(true)
    let q = supabase.from('apontamento_fotos').select('id, apontamento_id, url, path, nome, legenda, created_at, apontamentos(data, obra_id)').order('created_at', { ascending: false })
    const { data } = await q
    if (data) {
      let fotosProcessadas = data.filter((f: any) => f.apontamentos?.obra_id === filtroObra).map((f: any) => ({
        ...f, data: f.apontamentos?.data, obra_nome: obras.find(o => o.id === filtroObra)?.nome_obra || '',
      }))
      if (filtroDataIni) fotosProcessadas = fotosProcessadas.filter(f => (f.data || '') >= filtroDataIni)
      if (filtroDataFim) fotosProcessadas = fotosProcessadas.filter(f => (f.data || '') <= filtroDataFim)
      setFotos(fotosProcessadas)
      setSelecionadas(new Set(fotosProcessadas.map(f => f.id)))
    }
    setLoading(false)
  }

  function toggleFoto(id: string) {
    setSelecionadas(prev => {
      const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n
    })
  }
  function toggleTodas() {
    if (selecionadas.size === fotos.length) setSelecionadas(new Set())
    else setSelecionadas(new Set(fotos.map(f => f.id)))
  }

  function getPublicUrl(path: string) {
    return supabase.storage.from('apontamentos').getPublicUrl(path).data.publicUrl
  }

  async function gerarPDF() {
    const fotosSel = fotos.filter(f => selecionadas.has(f.id))
    if (fotosSel.length === 0) { toast.error('Selecione pelo menos uma foto'); return }
    setGerando(true)

    try {
      const obraNome = obras.find(o => o.id === filtroObra)?.nome_obra || 'Obra'
      const doc = new jsPDF()

      // Capa
      doc.setFontSize(20); doc.text('RELATÓRIO FOTOGRÁFICO', 105, 60, { align: 'center' })
      doc.setFontSize(14); doc.text(obraNome, 105, 75, { align: 'center' })
      doc.setFontSize(10)
      const periodo = filtroDataIni && filtroDataFim ? `Período: ${new Date(filtroDataIni + 'T12:00:00').toLocaleDateString('pt-BR')} a ${new Date(filtroDataFim + 'T12:00:00').toLocaleDateString('pt-BR')}` : `Gerado em: ${new Date().toLocaleDateString('pt-BR')}`
      doc.text(periodo, 105, 90, { align: 'center' })
      doc.text(`Total de fotos: ${fotosSel.length}`, 105, 100, { align: 'center' })
      doc.setFontSize(9); doc.text('RD Construtora — Central de Obras', 105, 280, { align: 'center' })

      // Fotos - 2 por página
      for (let i = 0; i < fotosSel.length; i += 2) {
        doc.addPage()
        for (let j = 0; j < 2 && i + j < fotosSel.length; j++) {
          const foto = fotosSel[i + j]
          const yBase = j === 0 ? 15 : 155
          try {
            const resp = await fetch(getPublicUrl(foto.path))
            const blob = await resp.blob()
            const base64 = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(blob) })
            doc.addImage(base64, 'JPEG', 15, yBase, 180, 120)
          } catch { doc.setFillColor(240, 240, 240); doc.rect(15, yBase, 180, 120, 'F'); doc.setFontSize(9); doc.text('Foto indisponível', 105, yBase + 60, { align: 'center' }) }
          doc.setFontSize(8); doc.setTextColor(100)
          doc.text(`Data: ${foto.data ? new Date(foto.data + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}`, 15, yBase + 125)
          if (foto.legenda) doc.text(`${foto.legenda}`, 15, yBase + 131)
          doc.setTextColor(0)
        }
      }

      doc.save(`Relatorio_Fotografico_${obraNome.replace(/\s+/g, '_')}.pdf`)
      toast.success('PDF gerado!')
    } catch (err: any) { toast.error('Erro: ' + err.message) }
    setGerando(false)
  }

  return (
    <div className="p-6 max-w-5xl overflow-y-auto" style={{ height: '100%' }}>
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><Camera size={24} className="text-primary-500"/> Relatório Fotográfico</h1>
          <p className="text-sm text-slate-500">Gere PDFs com fotos dos apontamentos de obra</p></div>
      </div>

      {/* Filtros */}
      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4 mb-5 space-y-3">
        <p className="text-xs font-bold text-slate-700 dark:text-white">Filtros</p>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-48"><label className="text-xs text-slate-500 block mb-1">Obra *</label>
            <select value={filtroObra} onChange={e => setFiltroObra(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white">
              <option value="">Selecione...</option>{obras.map(o => <option key={o.id} value={o.id}>{o.nome_obra}</option>)}</select></div>
          <div><label className="text-xs text-slate-500 block mb-1">De</label>
            <input type="date" value={filtroDataIni} onChange={e => setFiltroDataIni(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white"/></div>
          <div><label className="text-xs text-slate-500 block mb-1">Até</label>
            <input type="date" value={filtroDataFim} onChange={e => setFiltroDataFim(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white"/></div>
          <button onClick={fetchFotos} className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg text-xs"><RefreshCw size={12}/> Buscar fotos</button>
        </div>
      </div>

      {/* Fotos */}
      {fotos.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <button onClick={toggleTodas} className="text-xs text-blue-600 hover:underline">
                {selecionadas.size === fotos.length ? 'Desmarcar todas' : 'Selecionar todas'}
              </button>
              <span className="text-xs text-slate-400">{selecionadas.size} de {fotos.length} selecionadas</span>
            </div>
            <button onClick={gerarPDF} disabled={gerando || selecionadas.size === 0}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg text-sm disabled:opacity-50">
              {gerando ? <Loader2 size={14} className="animate-spin"/> : <Download size={14}/>} Gerar PDF ({selecionadas.size} fotos)
            </button>
          </div>

          <div className="grid grid-cols-3 lg:grid-cols-4 gap-3">
            {fotos.map(f => {
              const selected = selecionadas.has(f.id)
              const url = getPublicUrl(f.path)
              return (
                <div key={f.id} className={`relative border-2 rounded-xl overflow-hidden cursor-pointer transition-all ${selected ? 'border-primary-500 shadow-md' : 'border-slate-200 dark:border-slate-700'}`}
                  onClick={() => toggleFoto(f.id)}>
                  <img src={url} alt={f.legenda || ''} className="w-full h-32 object-cover" loading="lazy"/>
                  <div className="p-2">
                    {f.legenda && <p className="text-[10px] text-slate-600 dark:text-slate-400 truncate">{f.legenda}</p>}
                    <p className="text-[9px] text-slate-400">{f.data ? new Date(f.data + 'T12:00:00').toLocaleDateString('pt-BR') : ''}</p>
                  </div>
                  {selected && <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-primary-500 rounded-full flex items-center justify-center"><span className="text-white text-[10px] font-bold">✓</span></div>}
                  <button onClick={e => { e.stopPropagation(); setLightbox(url) }} className="absolute top-1.5 left-1.5 w-5 h-5 bg-black/40 rounded-full flex items-center justify-center text-white"><Image size={10}/></button>
                </div>
              )
            })}
          </div>
        </>
      )}

      {fotos.length === 0 && !loading && filtroObra && (
        <div className="text-center py-16 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
          <Camera size={36} className="mx-auto text-slate-300 mb-3"/>
          <p className="text-slate-400">Nenhuma foto encontrada para esta obra no período</p>
        </div>
      )}
      {!filtroObra && (
        <div className="text-center py-16 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
          <Camera size={36} className="mx-auto text-slate-300 mb-3"/>
          <p className="text-slate-400">Selecione uma obra e clique em "Buscar fotos"</p>
        </div>
      )}

      {lightbox && <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setLightbox(null)}><button onClick={() => setLightbox(null)} className="absolute top-4 right-4 p-2 bg-white/20 rounded-full text-white hover:bg-white/40">✕</button><img src={lightbox} className="max-w-full max-h-full object-contain rounded-lg"/></div>}
    </div>
  )
}
