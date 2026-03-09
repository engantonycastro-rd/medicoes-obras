import { useEffect, useState, useRef, useCallback } from 'react'
import {
  Camera, Trash2, X, Plus, ImageOff, FileDown,
  ChevronUp, ChevronDown, GripVertical, RefreshCw, Eye, EyeOff
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '../lib/store'
import { FotoMedicao } from '../types'
import jsPDF from 'jspdf'

interface Props {
  medicaoId: string
  isAprovada: boolean
}

// ─── PDF Generator (portado do sistema de relatórios) ─────────────────────────

async function toDataURL(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = reject
    img.src = src
  })
}

function drawHeader(doc: jsPDF, info: ReportInfo, pageWidth: number, marginX: number, headerY: number) {
  const headerH = 46
  const logoW = 28

  doc.setDrawColor(60, 60, 60)
  doc.setLineWidth(0.5)
  doc.rect(marginX, headerY, pageWidth - marginX * 2, headerH)

  doc.setFillColor(232, 80, 10)
  doc.rect(marginX, headerY, logoW, headerH, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(255, 255, 255)
  doc.text('RD', marginX + logoW / 2, headerY + 16, { align: 'center' })
  doc.setFontSize(6)
  doc.text('CONSTRUTORA', marginX + logoW / 2, headerY + 22, { align: 'center' })

  doc.setDrawColor(60, 60, 60)
  doc.line(marginX + logoW, headerY, marginX + logoW, headerY + headerH)

  doc.setTextColor(30, 30, 30)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('RD SOLUÇÕES LTDA', pageWidth / 2, headerY + 7, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.text('CNPJ: 43.357.757/0001-40', pageWidth / 2, headerY + 12, { align: 'center' })
  doc.text('RUA BELA VISTA, 874, JARDINS, SÃO GONÇALO DO AMARANTE/RN - CEP: 59293-576', pageWidth / 2, headerY + 16.5, { align: 'center' })
  doc.text('email: rd_solucoes@outlook.com / tel.: (84) 99641-8124', pageWidth / 2, headerY + 21, { align: 'center' })

  const tableY = headerY + 25
  const tableH = 9
  const rowH = tableH / 2
  const colW = pageWidth - marginX * 2 - logoW
  const tx = marginX + logoW

  doc.setDrawColor(150, 150, 150)
  doc.setLineWidth(0.3)
  doc.rect(tx, tableY, colW, tableH)
  doc.line(tx, tableY + rowH, tx + colW, tableY + rowH)

  const obraLblW = 14, obraValW = colW - 14 - 16 - 22
  doc.line(tx + obraLblW, tableY, tx + obraLblW, tableY + rowH)
  doc.line(tx + obraLblW + obraValW, tableY, tx + obraLblW + obraValW, tableY + rowH)
  doc.line(tx + obraLblW + obraValW + 16, tableY, tx + obraLblW + obraValW + 16, tableY + rowH)

  const medLblW = 18, medValW = 16, exeLblW = 32, exeValW = colW - medLblW - medValW - exeLblW - 12 - 18
  doc.line(tx + medLblW, tableY + rowH, tx + medLblW, tableY + tableH)
  doc.line(tx + medLblW + medValW, tableY + rowH, tx + medLblW + medValW, tableY + tableH)
  doc.line(tx + medLblW + medValW + exeLblW, tableY + rowH, tx + medLblW + medValW + exeLblW, tableY + tableH)
  doc.line(tx + medLblW + medValW + exeLblW + exeValW, tableY + rowH, tx + medLblW + medValW + exeLblW + exeValW, tableY + tableH)
  doc.line(tx + medLblW + medValW + exeLblW + exeValW + 12, tableY + rowH, tx + medLblW + medValW + exeLblW + exeValW + 12, tableY + tableH)

  const cellTextY1 = tableY + rowH * 0.65
  const cellTextY2 = tableY + rowH + rowH * 0.65

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.setTextColor(30, 30, 30)

  doc.text('OBRA:', tx + 1, cellTextY1)
  const obraText = doc.splitTextToSize(info.obra, obraValW - 2)
  doc.setFont('helvetica', 'normal')
  doc.text(obraText[0] || '', tx + obraLblW + 1, cellTextY1)
  doc.setFont('helvetica', 'bold')
  doc.text('LOCAL:', tx + obraLblW + obraValW + 1, cellTextY1)
  doc.setFont('helvetica', 'normal')
  doc.text(info.local, tx + obraLblW + obraValW + 16 + 1, cellTextY1)

  doc.setFont('helvetica', 'bold')
  doc.text('MEDIÇÃO:', tx + 1, cellTextY2)
  doc.setFont('helvetica', 'normal')
  doc.text(info.medicao, tx + medLblW + 1, cellTextY2)
  doc.setFont('helvetica', 'bold')
  doc.text('EMPRESA EXECUTORA', tx + medLblW + medValW + 1, cellTextY2)
  doc.setFont('helvetica', 'normal')
  doc.text('RD SOLUÇÕES LTDA', tx + medLblW + medValW + exeLblW + 1, cellTextY2)
  doc.setFont('helvetica', 'bold')
  doc.text('DATA:', tx + medLblW + medValW + exeLblW + exeValW + 1, cellTextY2)
  doc.setFont('helvetica', 'normal')
  doc.text(info.data, tx + medLblW + medValW + exeLblW + exeValW + 12 + 1, cellTextY2)
}

function drawSectionTitle(doc: jsPDF, marginX: number, pageWidth: number, y: number) {
  doc.setFillColor(44, 62, 107)
  doc.rect(marginX, y, pageWidth - marginX * 2, 8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(255, 255, 255)
  doc.text('REGISTRO FOTOGRÁFICO DOS SERVIÇOS EXECUTADOS:', pageWidth / 2, y + 5.5, { align: 'center' })
}

interface ReportInfo {
  obra: string
  local: string
  medicao: string
  data: string
}

async function generateRelatorioFotograficoPDF(info: ReportInfo, fotos: FotoMedicao[]) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const pageWidth = 210
  const pageHeight = 297
  const marginX = 14
  const marginY = 12
  const contentWidth = pageWidth - marginX * 2

  const headerH = 46
  const sectionTitleH = 8
  const captionH = 6
  const photoRowH = 56
  const rowGap = 4
  const colGap = 4

  const imgDataList = await Promise.all(fotos.map(f => toDataURL(f.base64)))

  let currentY = marginY
  let photoIndex = 0
  let isFirstPage = true

  const photoColW = (contentWidth - colGap) / 2

  const drawPageHeader = () => {
    drawHeader(doc, info, pageWidth, marginX, currentY)
    currentY += headerH + 2
    drawSectionTitle(doc, marginX, pageWidth, currentY)
    currentY += sectionTitleH + 4
  }

  while (photoIndex < fotos.length) {
    if (isFirstPage) {
      drawPageHeader()
      isFirstPage = false
    } else {
      doc.addPage()
      currentY = marginY
      drawPageHeader()
    }

    const availableH = pageHeight - currentY - marginY
    const rowTotalH = photoRowH + captionH + rowGap
    const rowsPerPage = Math.max(1, Math.floor(availableH / rowTotalH))

    for (let row = 0; row < rowsPerPage && photoIndex < fotos.length; row++) {
      const rowY = currentY

      for (let col = 0; col < 2 && photoIndex < fotos.length; col++) {
        const foto = fotos[photoIndex]
        const imgData = imgDataList[photoIndex]
        const figNum = photoIndex + 1
        const cellX = marginX + col * (photoColW + colGap)

        doc.setDrawColor(180, 180, 180)
        doc.setLineWidth(0.3)
        doc.rect(cellX, rowY, photoColW, photoRowH)

        try {
          doc.addImage(imgData, 'JPEG', cellX + 0.5, rowY + 0.5, photoColW - 1, photoRowH - 1, undefined, 'FAST')
        } catch {
          doc.setFillColor(220, 220, 220)
          doc.rect(cellX + 0.5, rowY + 0.5, photoColW - 1, photoRowH - 1, 'F')
        }

        const capY = rowY + photoRowH
        doc.setFillColor(250, 250, 250)
        doc.rect(cellX, capY, photoColW, captionH, 'F')
        doc.setDrawColor(180, 180, 180)
        doc.rect(cellX, capY, photoColW, captionH)

        const captionText = foto.legenda
          ? `Figura ${figNum}: ${foto.legenda}`
          : `Figura ${figNum}`

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(6.5)
        doc.setTextColor(60, 60, 60)
        doc.text(captionText, cellX + photoColW / 2, capY + captionH / 2 + 1.5, { align: 'center' })

        photoIndex++
      }

      currentY += photoRowH + captionH + rowGap
    }
  }

  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(150, 150, 150)
    doc.text(`Página ${i} / ${totalPages}`, pageWidth - marginX, pageHeight - 6, { align: 'right' })
    doc.text('RD Soluções Ltda – CNPJ 43.357.757/0001-40', marginX, pageHeight - 6)
  }

  const date = new Date().toISOString().slice(0, 10)
  doc.save(`Relatorio_Fotografico_Medicao${info.medicao}_${date}.pdf`)
}

// ─── Componente Principal ─────────────────────────────────────────────────────

let localIdCounter = 1
function genLocalId() { return localIdCounter++ }

export function RelatorioFotografico({ medicaoId, isAprovada }: Props) {
  const { fotos, fetchFotos, adicionarFoto, atualizarFoto, deletarFoto, contratoAtivo, obraAtiva, medicaoAtiva } = useStore()
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [preview, setPreview] = useState<{ base64: string; legenda: string } | null>(null)
  const [mostraPrevia, setMostraPrevia] = useState(false)
  const [dragging, setDragging] = useState<string | null>(null)
  const [localFotos, setLocalFotos] = useState<FotoMedicao[]>([])
  const dragOver = useRef<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchFotos(medicaoId)
  }, [medicaoId])

  const fotosDaMedicao = fotos
    .filter(f => f.medicao_id === medicaoId)
    .sort((a, b) => a.ordem - b.ordem)

  // Sync local order with store
  useEffect(() => {
    setLocalFotos(fotosDaMedicao)
  }, [fotos])

  // Drag reorder
  const handleDragStart = (id: string) => setDragging(id)
  const handleDragEnter = (id: string) => { dragOver.current = id }
  const handleDragEnd = () => {
    if (dragging && dragOver.current && dragging !== dragOver.current) {
      setLocalFotos(prev => {
        const arr = [...prev]
        const from = arr.findIndex(f => f.id === dragging)
        const to = arr.findIndex(f => f.id === dragOver.current)
        const [item] = arr.splice(from, 1)
        arr.splice(to, 0, item)
        // Update ordem in DB
        arr.forEach((f, i) => {
          if (f.ordem !== i) atualizarFoto(f.id, { ordem: i })
        })
        return arr.map((f, i) => ({ ...f, ordem: i }))
      })
    }
    setDragging(null)
    dragOver.current = null
  }

  const movePhoto = (id: string, dir: number) => {
    setLocalFotos(prev => {
      const arr = [...prev]
      const idx = arr.findIndex(f => f.id === id)
      const swap = idx + dir
      if (swap < 0 || swap >= arr.length) return prev;
      [arr[idx], arr[swap]] = [arr[swap], arr[idx]]
      atualizarFoto(arr[idx].id, { ordem: idx })
      atualizarFoto(arr[swap].id, { ordem: swap })
      return arr.map((f, i) => ({ ...f, ordem: i }))
    })
  }

  // Multiple file drop
  const handleFiles = useCallback((files: File[]) => {
    files.forEach(file => {
      if (file.size > 5 * 1024 * 1024) { toast.error(`${file.name}: máx 5MB`); return }
      const reader = new FileReader()
      reader.onload = () => {
        setPreview({ base64: reader.result as string, legenda: '' })
      }
      reader.readAsDataURL(file)
    })
  }, [])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 1) {
      // Multiple files: add all without preview
      files.forEach(file => {
        if (file.size > 5 * 1024 * 1024) { toast.error(`${file.name}: máx 5MB`); return }
        const reader = new FileReader()
        reader.onload = async () => {
          try {
            await adicionarFoto({
              medicao_id: medicaoId,
              servico_id: null,
              base64: reader.result as string,
              legenda: '',
              ordem: fotos.filter(f => f.medicao_id === medicaoId).length,
            })
          } catch { toast.error('Erro ao adicionar foto') }
        }
        reader.readAsDataURL(file)
      })
      toast.success(`${files.length} foto(s) adicionada(s)!`)
    } else if (files.length === 1) {
      handleFiles(files)
    }
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    if (files.length === 0) return
    if (files.length > 1) {
      files.forEach(async file => {
        if (file.size > 5 * 1024 * 1024) return
        const reader = new FileReader()
        reader.onload = async () => {
          await adicionarFoto({
            medicao_id: medicaoId, servico_id: null,
            base64: reader.result as string, legenda: '',
            ordem: fotos.filter(f => f.medicao_id === medicaoId).length,
          })
        }
        reader.readAsDataURL(file)
      })
      toast.success(`${files.length} foto(s) adicionada(s)!`)
    } else {
      handleFiles(files)
    }
  }

  async function confirmarFoto() {
    if (!preview) return
    setLoading(true)
    try {
      await adicionarFoto({
        medicao_id: medicaoId, servico_id: null,
        base64: preview.base64, legenda: preview.legenda,
        ordem: fotosDaMedicao.length,
      })
      setPreview(null)
      toast.success('Foto adicionada!')
    } catch { toast.error('Erro ao adicionar foto') }
    finally { setLoading(false) }
  }

  async function handleDeletar(id: string) {
    if (!confirm('Remover esta foto?')) return
    try { await deletarFoto(id); toast.success('Foto removida') }
    catch { toast.error('Erro ao remover') }
  }

  async function handleGerarPDF() {
    if (localFotos.length === 0) { toast.error('Adicione ao menos uma foto!'); return }
    setGenerating(true)
    try {
      const info: ReportInfo = {
        obra: obraAtiva?.nome_obra || contratoAtivo?.nome_obra || 'Obra',
        local: obraAtiva?.local_obra || contratoAtivo?.local_obra || '',
        medicao: medicaoAtiva?.numero?.toString() || '1',
        data: new Date().toLocaleDateString('pt-BR'),
      }
      await generateRelatorioFotograficoPDF(info, localFotos)
      toast.success('Relatório PDF gerado!')
    } catch (e) {
      console.error(e)
      toast.error('Erro ao gerar PDF')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="bg-purple-50 border border-purple-200 rounded-xl p-5 mb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
            <Camera size={16} className="text-white" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-sm">Relatório Fotográfico</h3>
            <p className="text-xs text-slate-500">
              {localFotos.length} foto{localFotos.length !== 1 ? 's' : ''} nesta medição
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Prévia */}
          {localFotos.length > 0 && (
            <button
              onClick={() => setMostraPrevia(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50 transition-all"
            >
              {mostraPrevia ? <EyeOff size={13}/> : <Eye size={13}/>}
              {mostraPrevia ? 'Ocultar prévia' : 'Prévia'}
            </button>
          )}

          {/* Gerar PDF */}
          {localFotos.length > 0 && (
            <button
              onClick={handleGerarPDF}
              disabled={generating}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-all disabled:opacity-50"
            >
              {generating
                ? <><RefreshCw size={13} className="animate-spin"/> Gerando…</>
                : <><FileDown size={13}/> Gerar PDF</>
              }
            </button>
          )}

          {/* Adicionar foto */}
          {!isAprovada && (
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium rounded-lg transition-all"
            >
              <Plus size={13}/> Adicionar Foto
            </button>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileInput}
          className="hidden"
        />
      </div>

      {/* Drop zone (quando não tem fotos) */}
      {!isAprovada && localFotos.length === 0 && !preview && (
        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-purple-300 rounded-xl p-8 text-center cursor-pointer hover:border-purple-500 hover:bg-purple-50 transition-all mb-4"
        >
          <Camera size={32} className="mx-auto text-purple-300 mb-2" />
          <p className="text-sm font-medium text-slate-600">Arraste fotos aqui ou clique para selecionar</p>
          <p className="text-xs text-slate-400 mt-1">PNG, JPG, WEBP • múltiplas fotos permitidas • máx 5MB cada</p>
        </div>
      )}

      {/* Preview de confirmação (foto única) */}
      {preview && (
        <div className="mb-4 bg-white border border-purple-300 rounded-xl p-4">
          <p className="text-xs font-semibold text-slate-600 mb-3">Nova foto — adicione uma legenda:</p>
          <div className="flex gap-4">
            <img src={preview.base64} alt="preview" className="w-40 h-28 object-cover rounded-lg border border-slate-200 shrink-0" />
            <div className="flex-1 flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Legenda (opcional)</label>
                <input
                  value={preview.legenda}
                  onChange={e => setPreview(p => p ? { ...p, legenda: e.target.value } : null)}
                  placeholder="Ex: Parede após demolição — Item 2.1"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                  autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') confirmarFoto() }}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPreview(null)}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
                >
                  <X size={14}/>
                </button>
                <button
                  onClick={confirmarFoto}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {loading ? 'Salvando...' : 'Confirmar Foto'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Grid de fotos */}
      {localFotos.length === 0 && !preview ? (
        isAprovada && (
          <div className="text-center py-8 border-2 border-dashed border-purple-200 rounded-xl">
            <ImageOff size={28} className="mx-auto text-purple-300 mb-2" />
            <p className="text-slate-400 text-sm">Nenhuma foto registrada nesta medição</p>
          </div>
        )
      ) : (
        <>
          {/* Drop zone extra quando já tem fotos */}
          {!isAprovada && localFotos.length > 0 && (
            <div
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              className="border border-dashed border-purple-300 rounded-lg px-4 py-2 text-center text-xs text-slate-400 mb-3 hover:border-purple-400 transition-all cursor-pointer"
              onClick={() => fileRef.current?.click()}
            >
              + Arraste mais fotos aqui
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {localFotos.map((foto, idx) => (
              <div
                key={foto.id}
                className={`group relative bg-white rounded-xl border shadow-sm hover:shadow-md transition-all ${
                  dragging === foto.id ? 'opacity-50 scale-95' : ''
                } border-slate-200`}
                draggable={!isAprovada}
                onDragStart={() => handleDragStart(foto.id)}
                onDragEnter={() => handleDragEnter(foto.id)}
                onDragEnd={handleDragEnd}
                onDragOver={e => e.preventDefault()}
              >
                {/* Número e controles de ordem */}
                <div className="flex items-center justify-between px-2 pt-2 pb-1">
                  <span className="text-xs font-bold text-purple-600">Figura {idx + 1}</span>
                  {!isAprovada && (
                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={() => movePhoto(foto.id, -1)}
                        disabled={idx === 0}
                        className="p-0.5 rounded hover:bg-slate-100 disabled:opacity-30"
                      >
                        <ChevronUp size={12}/>
                      </button>
                      <button
                        onClick={() => movePhoto(foto.id, 1)}
                        disabled={idx === localFotos.length - 1}
                        className="p-0.5 rounded hover:bg-slate-100 disabled:opacity-30"
                      >
                        <ChevronDown size={12}/>
                      </button>
                      <GripVertical size={12} className="text-slate-300 cursor-grab" />
                    </div>
                  )}
                </div>

                {/* Imagem */}
                <div className="px-2">
                  <img
                    src={foto.base64}
                    alt={foto.legenda}
                    className="w-full h-32 object-cover rounded-lg border border-slate-100"
                  />
                </div>

                {/* Legenda */}
                <div className="p-2">
                  {isAprovada ? (
                    <p className="text-xs text-slate-600 line-clamp-2">{foto.legenda || '—'}</p>
                  ) : (
                    <input
                      value={foto.legenda}
                      onChange={e => atualizarFoto(foto.id, { legenda: e.target.value })}
                      placeholder="Legenda..."
                      className="w-full text-xs border-b border-transparent hover:border-slate-300 focus:border-purple-400 outline-none bg-transparent py-0.5"
                    />
                  )}
                </div>

                {/* Botão deletar */}
                {!isAprovada && (
                  <button
                    onClick={() => handleDeletar(foto.id)}
                    className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                  >
                    <Trash2 size={12}/>
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Prévia do relatório */}
      {mostraPrevia && localFotos.length > 0 && (
        <div className="mt-6 border-t border-purple-200 pt-4">
          <p className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Eye size={13}/> Prévia do Relatório
          </p>
          <div className="bg-white border border-slate-200 rounded-xl overflow-auto p-4 max-h-[600px]">
            <ReportPreview
              info={{
                obra: obraAtiva?.nome_obra || contratoAtivo?.nome_obra || 'Obra',
                local: obraAtiva?.local_obra || contratoAtivo?.local_obra || '',
                medicao: medicaoAtiva?.numero?.toString() || '1',
                data: new Date().toLocaleDateString('pt-BR'),
              }}
              fotos={localFotos}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Componente de Prévia ─────────────────────────────────────────────────────

function ReportPreview({ info, fotos }: { info: ReportInfo; fotos: FotoMedicao[] }) {
  const rows: FotoMedicao[][] = []
  for (let i = 0; i < fotos.length; i += 2) {
    rows.push(fotos.slice(i, i + 2))
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '11px', width: '100%', minWidth: '500px' }}>
      {/* Header */}
      <div style={{ display: 'flex', border: '1px solid #333', marginBottom: '4px' }}>
        <div style={{ background: '#e8500a', color: '#fff', width: '70px', minWidth: '70px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px', fontWeight: 'bold', fontSize: '16px' }}>
          RD<br/><span style={{ fontSize: '7px', fontWeight: 'normal' }}>CONSTRUTORA</span>
        </div>
        <div style={{ flex: 1, padding: '6px 10px', borderLeft: '1px solid #333' }}>
          <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '13px' }}>RD SOLUÇÕES LTDA</div>
          <div style={{ textAlign: 'center', fontSize: '9px', color: '#444' }}>CNPJ: 43.357.757/0001-40</div>
          <div style={{ textAlign: 'center', fontSize: '8px', color: '#444' }}>RUA BELA VISTA, 874, JARDINS, SÃO GONÇALO DO AMARANTE/RN</div>
          <div style={{ textAlign: 'center', fontSize: '8px', color: '#444' }}>email: rd_solucoes@outlook.com / tel.: (84) 99641-8124</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '4px', fontSize: '9px' }}>
            <tbody>
              <tr>
                <td style={{ border: '1px solid #aaa', padding: '2px 4px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>OBRA:</td>
                <td style={{ border: '1px solid #aaa', padding: '2px 4px' }}>{info.obra}</td>
                <td style={{ border: '1px solid #aaa', padding: '2px 4px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>LOCAL:</td>
                <td style={{ border: '1px solid #aaa', padding: '2px 4px' }}>{info.local}</td>
              </tr>
              <tr>
                <td style={{ border: '1px solid #aaa', padding: '2px 4px', fontWeight: 'bold' }}>MEDIÇÃO:</td>
                <td style={{ border: '1px solid #aaa', padding: '2px 4px' }}>{info.medicao}</td>
                <td style={{ border: '1px solid #aaa', padding: '2px 4px', fontWeight: 'bold' }}>DATA:</td>
                <td style={{ border: '1px solid #aaa', padding: '2px 4px' }}>{info.data}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Título seção */}
      <div style={{ background: '#2c3e6b', color: '#fff', textAlign: 'center', padding: '5px', fontWeight: 'bold', fontSize: '10px', marginBottom: '6px' }}>
        REGISTRO FOTOGRÁFICO DOS SERVIÇOS EXECUTADOS:
      </div>

      {/* Grid de fotos 2x2 */}
      {rows.map((row, ri) => (
        <div key={ri} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          {row.map((foto, ci) => (
            <div key={foto.id} style={{ flex: 1, border: '1px solid #ccc', borderRadius: '4px', overflow: 'hidden' }}>
              <img src={foto.base64} alt={foto.legenda} style={{ width: '100%', height: '160px', objectFit: 'cover', display: 'block' }}/>
              <div style={{ background: '#fafafa', borderTop: '1px solid #ddd', padding: '4px 6px', fontSize: '9px', textAlign: 'center', color: '#444' }}>
                Figura {ri * 2 + ci + 1}{foto.legenda ? `: ${foto.legenda}` : ''}
              </div>
            </div>
          ))}
          {row.length === 1 && <div style={{ flex: 1 }}/>}
        </div>
      ))}
    </div>
  )
}
