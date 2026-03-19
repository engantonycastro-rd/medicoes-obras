import { useEffect, useState } from 'react'
import { Camera, Download, RefreshCw, Filter, Loader2, Image, Calendar, Building2 } from 'lucide-react'
import toast from 'react-hot-toast'
import jsPDF from 'jspdf'
import { supabase } from '../lib/supabase'

interface Foto { id: string; apontamento_id: string; url: string; path: string; nome: string | null; legenda: string | null; created_at: string; data?: string; obra_nome?: string }

export function RelatorioFotograficoPage() {
  const [fotos, setFotos] = useState<Foto[]>([])
  const [obras, setObras] = useState<{ id: string; nome_obra: string; local_obra: string; contrato_id: string }[]>([])
  const [contratos, setContratos] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [gerando, setGerando] = useState(false)
  const [filtroObra, setFiltroObra] = useState('')
  const [filtroDataIni, setFiltroDataIni] = useState('')
  const [filtroDataFim, setFiltroDataFim] = useState('')
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set())
  const [lightbox, setLightbox] = useState<string | null>(null)

  useEffect(() => { fetchObras() }, [])

  async function fetchObras() {
    const { data } = await supabase.from('obras').select('id, nome_obra, local_obra, contrato_id').eq('status', 'ATIVA').order('nome_obra')
    if (data) {
      setObras(data)
      const cIds = [...new Set(data.map(o => o.contrato_id).filter(Boolean))]
      if (cIds.length > 0) {
        const { data: cData } = await supabase.from('contratos').select('id, empresa_executora').in('id', cIds)
        if (cData) {
          const m: Record<string, string> = {}
          cData.forEach((c: any) => { m[c.id] = c.empresa_executora })
          setContratos(m)
        }
      }
    }
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
      // Gera signed URLs para cada foto
      const comUrls = await Promise.all(fotosProcessadas.map(async (f: any) => {
        const { data: sd } = await supabase.storage.from('apontamentos').createSignedUrl(f.path, 3600)
        return { ...f, signedUrl: sd?.signedUrl || '' }
      }))
      setFotos(comUrls)
      setSelecionadas(new Set(comUrls.map(f => f.id)))
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

  function getFotoUrl(foto: any) {
    return foto.signedUrl || supabase.storage.from('apontamentos').getPublicUrl(foto.path).data.publicUrl
  }

  async function gerarPDF() {
    const fotosSel = fotos.filter(f => selecionadas.has(f.id))
    if (fotosSel.length === 0) { toast.error('Selecione pelo menos uma foto'); return }
    setGerando(true)

    try {
      const obra = obras.find(o => o.id === filtroObra)
      const obraNome = obra?.nome_obra || 'Obra'
      const obraLocal = obra?.local_obra || ''
      const empresa = obra ? (contratos[obra.contrato_id] || 'RD SOLUÇÕES LTDA') : 'RD SOLUÇÕES LTDA'
      const dataHoje = new Date().toLocaleDateString('pt-BR')
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pw = 210, marginX = 10
      const contentW = pw - marginX * 2

      function drawHeader(_pageNum: number) {
        const hY = 8
        const logoW = 30
        const companyH = 26

        // Outer border for company section
        doc.setDrawColor(60, 60, 60)
        doc.setLineWidth(0.5)
        doc.rect(marginX, hY, contentW, companyH)

        // Logo box - orange/red
        doc.setFillColor(207, 67, 18)
        doc.rect(marginX, hY, logoW, companyH, 'F')
        doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(255, 255, 255)
        doc.text('RD', marginX + logoW / 2, hY + 12, { align: 'center' })
        doc.setFontSize(5)
        doc.text('CONSTRUTORA', marginX + logoW / 2, hY + 18, { align: 'center' })

        // Vertical separator
        doc.setDrawColor(60, 60, 60)
        doc.line(marginX + logoW, hY, marginX + logoW, hY + companyH)

        // Company info
        const centerX = marginX + logoW + (contentW - logoW) / 2
        doc.setTextColor(30, 30, 30)
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
        doc.text(empresa, centerX, hY + 7, { align: 'center' })
        doc.setFont('helvetica', 'italic'); doc.setFontSize(6.5)
        doc.text('CNPJ: 43.357.757/0001-40', centerX, hY + 12, { align: 'center' })
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5)
        doc.text('RUA BELA VISTA, 874, JARDINS, SÃO GONÇALO DO AMARANTE/RN – CEP: 59293-576', centerX, hY + 16.5, { align: 'center' })
        doc.text('email: rd_solucoes@outlook.com / tel.: (84) 99641-6124', centerX, hY + 21, { align: 'center' })

        // Info table - Row 1: OBRA | LOCAL
        const tY = hY + companyH
        const rowH = 6
        doc.setDrawColor(100, 100, 100); doc.setLineWidth(0.3)
        doc.rect(marginX, tY, contentW, rowH)
        const localW = 40, obraLblW = 16
        doc.line(marginX + obraLblW, tY, marginX + obraLblW, tY + rowH)
        doc.line(marginX + contentW - localW, tY, marginX + contentW - localW, tY + rowH)
        doc.line(marginX + contentW - localW + 16, tY, marginX + contentW - localW + 16, tY + rowH)

        doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(30, 30, 30)
        doc.text('OBRA:', marginX + 2, tY + 4)
        doc.setFont('helvetica', 'normal')
        const obraT = doc.splitTextToSize(obraNome, contentW - obraLblW - localW - 4)
        doc.text(obraT[0] || '', marginX + obraLblW + 2, tY + 4)
        doc.setFont('helvetica', 'bold')
        doc.text('LOCAL:', marginX + contentW - localW + 2, tY + 4)
        doc.setFont('helvetica', 'normal')
        doc.text(obraLocal, marginX + contentW - localW + 18, tY + 4)

        // Row 2: EMPRESA EXECUTORA | DATA
        const t2Y = tY + rowH
        doc.rect(marginX, t2Y, contentW, rowH)
        const exeLblW = 34, dataLblW = 14, dataValW = 22
        const exeValW = contentW - exeLblW - dataLblW - dataValW
        doc.line(marginX + exeLblW, t2Y, marginX + exeLblW, t2Y + rowH)
        doc.line(marginX + exeLblW + exeValW, t2Y, marginX + exeLblW + exeValW, t2Y + rowH)
        doc.line(marginX + contentW - dataValW, t2Y, marginX + contentW - dataValW, t2Y + rowH)

        doc.setFont('helvetica', 'bold')
        doc.text('EMPRESA EXECUTORA', marginX + 2, t2Y + 4)
        doc.setFont('helvetica', 'normal')
        doc.text(empresa, marginX + exeLblW + 2, t2Y + 4)
        doc.setFont('helvetica', 'bold')
        doc.text('DATA:', marginX + exeLblW + exeValW + 2, t2Y + 4)
        doc.setFont('helvetica', 'normal')
        doc.text(dataHoje, marginX + contentW - dataValW + 2, t2Y + 4)

        // Orange banner
        const bY = t2Y + rowH + 2
        doc.setFillColor(232, 80, 10)
        doc.rect(marginX, bY, contentW, 7, 'F')
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(255, 255, 255)
        doc.text('REGISTRO FOTOGRÁFICO DOS SERVIÇOS EXECUTADOS:', pw / 2, bY + 5, { align: 'center' })
        doc.setTextColor(0, 0, 0)

        return bY + 9
      }

      // Generate pages with 4 photos each (2x2 grid)
      let figNum = 1
      for (let i = 0; i < fotosSel.length; i += 4) {
        if (i > 0) doc.addPage()
        const yStart = drawHeader(Math.floor(i / 4) + 1)
        const photoW = (contentW - 6) / 2  // gap 6mm between
        const photoH = 80
        const positions = [
          { x: marginX, y: yStart },
          { x: marginX + photoW + 6, y: yStart },
          { x: marginX, y: yStart + photoH + 18 },
          { x: marginX + photoW + 6, y: yStart + photoH + 18 },
        ]

        for (let j = 0; j < 4 && i + j < fotosSel.length; j++) {
          const foto = fotosSel[i + j]
          const pos = positions[j]
          try {
            const resp = await fetch(getFotoUrl(foto))
            const blob = await resp.blob()
            const base64 = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(blob) })
            doc.addImage(base64, 'JPEG', pos.x, pos.y, photoW, photoH)
          } catch {
            doc.setFillColor(240, 240, 240); doc.rect(pos.x, pos.y, photoW, photoH, 'F')
            doc.setFontSize(8); doc.setTextColor(150); doc.text('Foto indisponível', pos.x + photoW / 2, pos.y + photoH / 2, { align: 'center' })
            doc.setTextColor(0)
          }
          // Border around photo
          doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3)
          doc.rect(pos.x, pos.y, photoW, photoH)

          // Caption
          doc.setFontSize(7); doc.setTextColor(80, 80, 80)
          const caption = foto.legenda ? `Figura ${figNum}: ${foto.legenda}` : `Figura ${figNum}`
          doc.text(caption, pos.x + photoW / 2, pos.y + photoH + 4, { align: 'center' })
          if (foto.data) {
            doc.setFontSize(6); doc.setTextColor(150)
            doc.text(new Date(foto.data + 'T12:00:00').toLocaleDateString('pt-BR'), pos.x + photoW / 2, pos.y + photoH + 8, { align: 'center' })
          }
          doc.setTextColor(0)
          figNum++
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
              const url = getFotoUrl(f)
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
