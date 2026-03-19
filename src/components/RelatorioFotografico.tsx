import { useEffect, useState, useRef, useCallback } from 'react'
import {
  Camera, Trash2, X, Plus, ImageOff, FileDown,
  ChevronUp, ChevronDown, GripVertical, RefreshCw, Eye, EyeOff, Crop
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

function drawHeader(doc: jsPDF, info: ReportInfo, pageWidth: number, marginX: number, headerY: number, logoData?: string | null) {
  const headerH = 46
  const logoW = 28
  const contentW = pageWidth - marginX * 2

  doc.setDrawColor(60, 60, 60)
  doc.setLineWidth(0.5)
  doc.rect(marginX, headerY, contentW, headerH)

  // Logo
  if (logoData) {
    doc.addImage(logoData, 'PNG', marginX + 2, headerY + 2, 24, 20)
  } else {
    doc.setFillColor(232, 80, 10)
    doc.rect(marginX, headerY, logoW, 24, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(255, 255, 255)
    doc.text('RD', marginX + logoW / 2, headerY + 16, { align: 'center' })
    doc.setFontSize(6)
    doc.text('CONSTRUTORA', marginX + logoW / 2, headerY + 22, { align: 'center' })
  }

  doc.setDrawColor(60, 60, 60)
  doc.line(marginX + logoW, headerY, marginX + logoW, headerY + 24)

  doc.setTextColor(30, 30, 30)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('RD SOLUÇÕES LTDA', pageWidth / 2, headerY + 7, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.text('CNPJ: 43.357.757/0001-40', pageWidth / 2, headerY + 12, { align: 'center' })
  doc.text('RUA BELA VISTA, 874, JARDINS, SÃO GONÇALO DO AMARANTE/RN – CEP: 59293-576', pageWidth / 2, headerY + 16.5, { align: 'center' })
  doc.text('email: rd_solucoes@outlook.com / tel.: (84) 99641-6124', pageWidth / 2, headerY + 21, { align: 'center' })

  const tableY = headerY + 25
  const tableH = 9
  const rowH = tableH / 2
  const colW = contentW - logoW
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
  doc.setFillColor(232, 80, 10)
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
  const marginX = 10
  const marginY = 8
  const contentWidth = pageWidth - marginX * 2

  const headerH = 46
  const sectionTitleH = 8
  const captionH = 8
  const photoRowH = 80
  const rowGap = 6
  const colGap = 6

  // Load logo
  let logoData: string | null = null
  try {
    const resp = await fetch('/logo-rd.png')
    const blob = await resp.blob()
    logoData = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(blob) })
  } catch {}

  const imgDataList = await Promise.all(fotos.map(f => toDataURL(f.base64)))

  let currentY = marginY
  let photoIndex = 0
  let isFirstPage = true

  const photoColW = (contentWidth - colGap) / 2

  const drawPageHeader = () => {
    drawHeader(doc, info, pageWidth, marginX, currentY, logoData)
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

        const capY = rowY + photoRowH + 1
        const captionText = foto.legenda
          ? `Figura ${figNum}: ${foto.legenda}`
          : `Figura ${figNum}`

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7)
        doc.setTextColor(80, 80, 80)
        doc.text(captionText, cellX + photoColW / 2, capY + 3, { align: 'center' })

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

// ─── ImageCropper Modal ───────────────────────────────────────────────────────

interface CropperProps {
  src: string
  onConfirm: (croppedBase64: string) => void
  onCancel: () => void
}

function ImageCropper({ src, onConfirm, onCancel }: CropperProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [imgLoaded, setImgLoaded] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState<string | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0, w: 0, h: 0 })
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0, offsetX: 0, offsetY: 0 })
  const dragStart = useRef({ mx: 0, my: 0, cx: 0, cy: 0 })

  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      const maxW = Math.min(window.innerWidth * 0.75, 760)
      const maxH = window.innerHeight * 0.55
      const ratio = img.naturalWidth / img.naturalHeight
      let w = maxW, h = maxW / ratio
      if (h > maxH) { h = maxH; w = h * ratio }
      const offsetX = (maxW - w) / 2
      const offsetY = 0
      setDisplaySize({ w, h, offsetX, offsetY })
      const margin = Math.min(w, h) * 0.1
      setCrop({ x: margin, y: margin, w: w - margin * 2, h: h - margin * 2 })
      setImgLoaded(true)
    }
    img.src = src
  }, [src])

  const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val))
  const MIN = 40

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const rect = containerRef.current!.getBoundingClientRect()
    const client = 'touches' in e ? e.touches[0] : e
    return { x: client.clientX - rect.left - displaySize.offsetX, y: client.clientY - rect.top - displaySize.offsetY }
  }

  const getHandle = (pos: { x: number; y: number }) => {
    const { x, y, w, h } = crop
    const r = 10
    if (Math.abs(pos.x - x) < r && Math.abs(pos.y - y) < r) return 'nw'
    if (Math.abs(pos.x - (x + w)) < r && Math.abs(pos.y - y) < r) return 'ne'
    if (Math.abs(pos.x - x) < r && Math.abs(pos.y - (y + h)) < r) return 'sw'
    if (Math.abs(pos.x - (x + w)) < r && Math.abs(pos.y - (y + h)) < r) return 'se'
    if (pos.x > x && pos.x < x + w && pos.y > y && pos.y < y + h) return 'move'
    return null
  }

  const onMouseDown = (e: React.MouseEvent) => {
    const pos = getPos(e)
    const handle = getHandle(pos)
    if (!handle) return
    e.preventDefault()
    dragStart.current = { mx: pos.x, my: pos.y, cx: crop.x, cy: crop.y }
    if (handle === 'move') setIsDragging(true)
    else setIsResizing(handle)
  }

  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging && !isResizing) return
    const pos = getPos(e)
    const dx = pos.x - dragStart.current.mx
    const dy = pos.y - dragStart.current.my
    const { w: dw, h: dh } = displaySize

    if (isDragging) {
      setCrop(c => ({
        ...c,
        x: clamp(dragStart.current.cx + dx, 0, dw - c.w),
        y: clamp(dragStart.current.cy + dy, 0, dh - c.h),
      }))
    } else if (isResizing) {
      setCrop(c => {
        let { x, y, w, h } = c
        const ox = dragStart.current.cx, oy = dragStart.current.cy
        if (isResizing.includes('e')) w = clamp(w + dx, MIN, dw - ox)
        if (isResizing.includes('s')) h = clamp(h + dy, MIN, dh - oy)
        if (isResizing.includes('w')) {
          const nx = clamp(ox + dx, 0, ox + w - MIN)
          w = w + (ox - nx); x = nx
        }
        if (isResizing.includes('n')) {
          const ny = clamp(oy + dy, 0, oy + h - MIN)
          h = h + (oy - ny); y = ny
        }
        return { x, y, w: Math.max(w, MIN), h: Math.max(h, MIN) }
      })
    }
  }

  const onMouseUp = () => { setIsDragging(false); setIsResizing(null) }

  const getCursor = () => {
    if (isDragging) return 'grabbing'
    if (isResizing) return isResizing === 'move' ? 'grab' : `${isResizing}-resize`
    return 'default'
  }

  const handleConfirm = () => {
    const img = imgRef.current!
    const { w: dw, h: dh } = displaySize
    const scaleX = img.naturalWidth / dw
    const scaleY = img.naturalHeight / dh
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(crop.w * scaleX)
    canvas.height = Math.round(crop.h * scaleY)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(
      img,
      Math.round(crop.x * scaleX), Math.round(crop.y * scaleY),
      Math.round(crop.w * scaleX), Math.round(crop.h * scaleY),
      0, 0, canvas.width, canvas.height
    )
    onConfirm(canvas.toDataURL('image/jpeg', 0.9))
  }

  const handles = imgLoaded ? [
    { id: 'nw', x: crop.x, y: crop.y },
    { id: 'ne', x: crop.x + crop.w, y: crop.y },
    { id: 'sw', x: crop.x, y: crop.y + crop.h },
    { id: 'se', x: crop.x + crop.w, y: crop.y + crop.h },
  ] : []

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Crop size={16} className="text-primary-600" />
            <span className="font-semibold text-slate-800 text-sm">Recortar imagem</span>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
            <X size={16}/>
          </button>
        </div>

        {/* Canvas area */}
        <div className="bg-slate-900 flex items-center justify-center px-4 py-4" style={{ minHeight: '300px' }}>
          {!imgLoaded ? (
            <div className="text-slate-400 text-sm animate-pulse">Carregando imagem...</div>
          ) : (
            <div
              ref={containerRef}
              style={{ position: 'relative', width: displaySize.w + displaySize.offsetX * 2, height: displaySize.h, cursor: getCursor(), userSelect: 'none' }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
            >
              {/* Imagem base */}
              <img
                ref={imgRef}
                src={src}
                alt="crop"
                style={{
                  position: 'absolute',
                  left: displaySize.offsetX,
                  top: 0,
                  width: displaySize.w,
                  height: displaySize.h,
                  display: 'block',
                  pointerEvents: 'none',
                  userSelect: 'none',
                  draggable: false,
                }}
              />

              {/* Overlay escuro fora do crop */}
              {[
                // Top
                { left: displaySize.offsetX, top: 0, width: displaySize.w, height: crop.y },
                // Bottom
                { left: displaySize.offsetX, top: crop.y + crop.h, width: displaySize.w, height: displaySize.h - crop.y - crop.h },
                // Left
                { left: displaySize.offsetX, top: crop.y, width: crop.x, height: crop.h },
                // Right
                { left: displaySize.offsetX + crop.x + crop.w, top: crop.y, width: displaySize.w - crop.x - crop.w, height: crop.h },
              ].map((s, i) => (
                <div key={i} style={{ position: 'absolute', background: 'rgba(0,0,0,0.55)', pointerEvents: 'none', ...s }} />
              ))}

              {/* Borda do crop */}
              <div style={{
                position: 'absolute',
                left: displaySize.offsetX + crop.x,
                top: crop.y,
                width: crop.w,
                height: crop.h,
                border: '2px solid #f59e0b',
                boxSizing: 'border-box',
                pointerEvents: 'none',
              }}>
                {/* Grade de terços */}
                {[1/3, 2/3].map(t => (
                  <div key={`v${t}`} style={{ position:'absolute', left:`${t*100}%`, top:0, width:1, height:'100%', background:'rgba(245,158,11,0.4)' }}/>
                ))}
                {[1/3, 2/3].map(t => (
                  <div key={`h${t}`} style={{ position:'absolute', top:`${t*100}%`, left:0, width:'100%', height:1, background:'rgba(245,158,11,0.4)' }}/>
                ))}
              </div>

              {/* Handles nos 4 cantos */}
              {handles.map(h => (
                <div key={h.id} style={{
                  position: 'absolute',
                  left: displaySize.offsetX + h.x - 7,
                  top: h.y - 7,
                  width: 14, height: 14,
                  background: '#f59e0b',
                  border: '2px solid white',
                  borderRadius: '50%',
                  cursor: `${h.id}-resize`,
                  zIndex: 10,
                  pointerEvents: 'none',
                }}/>
              ))}
            </div>
          )}
        </div>

        {/* Info + botões */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 bg-slate-50">
          <p className="text-xs text-slate-500">
            Arraste para mover · Cantos para redimensionar
          </p>
          <div className="flex gap-2">
            <button onClick={onCancel} className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-100 text-slate-600">
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={!imgLoaded}
              className="px-4 py-2 text-sm bg-primary-500 hover:bg-primary-600 text-white rounded-lg font-medium disabled:opacity-50 flex items-center gap-1.5"
            >
              <Crop size={13}/> Aplicar Recorte
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── FotoCard isolado (evita re-render do grid ao digitar legenda) ────────────

interface FotoCardProps {
  foto: FotoMedicao
  idx: number
  total: number
  isAprovada: boolean
  dragging: string | null
  onDragStart: (id: string) => void
  onDragEnter: (id: string) => void
  onDragEnd: () => void
  onMove: (id: string, dir: number) => void
  onDeletar: (id: string) => void
  onLegendaChange: (id: string, legenda: string) => void
  onCrop: (id: string, newBase64: string) => void
}

function FotoCard({
  foto, idx, total, isAprovada, dragging,
  onDragStart, onDragEnter, onDragEnd, onMove, onDeletar, onLegendaChange, onCrop,
}: FotoCardProps) {
  const [legenda, setLegenda] = useState(foto.legenda)
  const [showCropper, setShowCropper] = useState(false)

  useEffect(() => {
    setLegenda(foto.legenda)
  }, [foto.id])

  return (
    <>
      {showCropper && (
        <ImageCropper
          src={foto.base64}
          onConfirm={(cropped) => { onCrop(foto.id, cropped); setShowCropper(false) }}
          onCancel={() => setShowCropper(false)}
        />
      )}

      <div
        className={`group relative bg-white rounded-xl border shadow-sm hover:shadow-md transition-all ${
          dragging === foto.id ? 'opacity-50 scale-95' : ''
        } border-slate-200`}
        draggable={!isAprovada}
        onDragStart={() => onDragStart(foto.id)}
        onDragEnter={() => onDragEnter(foto.id)}
        onDragEnd={onDragEnd}
        onDragOver={e => e.preventDefault()}
      >
        <div className="flex items-center justify-between px-2 pt-2 pb-1">
          <span className="text-xs font-bold text-primary-600">Figura {idx + 1}</span>
          {!isAprovada && (
            <div className="flex items-center gap-0.5">
              <button onClick={() => onMove(foto.id, -1)} disabled={idx === 0} className="p-0.5 rounded hover:bg-slate-100 disabled:opacity-30">
                <ChevronUp size={12}/>
              </button>
              <button onClick={() => onMove(foto.id, 1)} disabled={idx === total - 1} className="p-0.5 rounded hover:bg-slate-100 disabled:opacity-30">
                <ChevronDown size={12}/>
              </button>
              <GripVertical size={12} className="text-slate-300 cursor-grab" />
            </div>
          )}
        </div>

        {/* Imagem com botão crop no hover */}
        <div className="px-2 relative">
          <img src={foto.base64} alt={legenda} className="w-full h-32 object-cover rounded-lg border border-slate-100" />
          {!isAprovada && (
            <button
              onClick={() => setShowCropper(true)}
              title="Recortar imagem"
              className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2.5 py-1 bg-black/60 hover:bg-primary-500 text-white text-xs rounded-full opacity-0 group-hover:opacity-100 transition-all"
            >
              <Crop size={11}/> Recortar
            </button>
          )}
        </div>

        <div className="p-2">
          {isAprovada ? (
            <p className="text-xs text-slate-600 line-clamp-2">{legenda || '—'}</p>
          ) : (
            <input
              value={legenda}
              onChange={e => setLegenda(e.target.value)}
              onBlur={() => onLegendaChange(foto.id, legenda)}
              placeholder="Legenda..."
              className="w-full text-xs border-b border-transparent hover:border-slate-300 focus:border-primary-400 outline-none bg-transparent py-0.5"
            />
          )}
        </div>

        {!isAprovada && (
          <button
            onClick={() => onDeletar(foto.id)}
            className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
          >
            <Trash2 size={12}/>
          </button>
        )}
      </div>
    </>
  )
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
    <div className="bg-primary-50 border border-primary-200 rounded-xl p-5 mb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center">
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
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-500 hover:bg-primary-600 text-white text-xs font-medium rounded-lg transition-all"
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
          className="border-2 border-dashed border-primary-300 rounded-xl p-8 text-center cursor-pointer hover:border-primary-500 hover:bg-primary-50 transition-all mb-4"
        >
          <Camera size={32} className="mx-auto text-primary-400 mb-2" />
          <p className="text-sm font-medium text-slate-600">Arraste fotos aqui ou clique para selecionar</p>
          <p className="text-xs text-slate-400 mt-1">PNG, JPG, WEBP • múltiplas fotos permitidas • máx 5MB cada</p>
        </div>
      )}

      {/* Preview de confirmação (foto única) */}
      {preview && (
        <div className="mb-4 bg-white border border-primary-300 rounded-xl p-4">
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
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
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
                  className="flex items-center gap-2 px-4 py-1.5 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
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
          <div className="text-center py-8 border-2 border-dashed border-primary-200 rounded-xl">
            <ImageOff size={28} className="mx-auto text-primary-400 mb-2" />
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
              className="border border-dashed border-primary-300 rounded-lg px-4 py-2 text-center text-xs text-slate-400 mb-3 hover:border-primary-400 transition-all cursor-pointer"
              onClick={() => fileRef.current?.click()}
            >
              + Arraste mais fotos aqui
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {localFotos.map((foto, idx) => (
              <FotoCard
                key={foto.id}
                foto={foto}
                idx={idx}
                total={localFotos.length}
                isAprovada={isAprovada}
                dragging={dragging}
                onDragStart={handleDragStart}
                onDragEnter={handleDragEnter}
                onDragEnd={handleDragEnd}
                onMove={movePhoto}
                onDeletar={handleDeletar}
                onLegendaChange={(id, legenda) => atualizarFoto(id, { legenda })}
                onCrop={(id, newBase64) => {
                  atualizarFoto(id, { base64: newBase64 })
                  setLocalFotos(prev => prev.map(f => f.id === id ? { ...f, base64: newBase64 } : f))
                  toast.success('Recorte aplicado!')
                }}
              />
            ))}
          </div>
        </>
      )}

      {/* Prévia do relatório */}
      {mostraPrevia && localFotos.length > 0 && (
        <div className="mt-6 border-t border-primary-200 pt-4">
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