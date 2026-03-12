import ExcelJS from 'exceljs'
import * as pdfjsLib from 'pdfjs-dist'

// Worker do PDF.js via unpkg (mais confiável que cdnjs para versões específicas)
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`

export interface Alteracao {
  tipo: 'ADICIONADO' | 'REMOVIDO' | 'ALTERADO'
  item: string
  descricao: string
  detalhes?: string
}

export interface ComparativoResult {
  alteracoes: Alteracao[]
  resumo: {
    adicionados: number; removidos: number; alterados: number
    totalOriginal: number; totalRevisado: number
  }
  modo: 'EXCEL' | 'PDF' | 'TEXTO'
}

/**
 * Compara dois arquivos (Excel ou PDF) e retorna diferenças.
 */
export async function compararOrcamentos(
  originalBuffer: ArrayBuffer,
  revisadoBuffer: ArrayBuffer,
  nomeOriginal: string,
  nomeRevisado: string,
): Promise<ComparativoResult> {
  const isExcelOrig = /\.xlsx?$/i.test(nomeOriginal)
  const isExcelRev  = /\.xlsx?$/i.test(nomeRevisado)
  const isPdfOrig   = /\.pdf$/i.test(nomeOriginal)
  const isPdfRev    = /\.pdf$/i.test(nomeRevisado)

  // Ambos Excel → comparação estruturada
  if (isExcelOrig && isExcelRev) {
    return compararExcel(originalBuffer, revisadoBuffer)
  }

  // Ambos PDF → comparação por texto extraído
  if (isPdfOrig && isPdfRev) {
    return compararPDF(originalBuffer, revisadoBuffer)
  }

  // Misto → extrai texto de ambos e compara
  const textoOrig = isExcelOrig ? await extrairTextoExcel(originalBuffer) : isPdfOrig ? await extrairTextoPDF(originalBuffer) : []
  const textoRev  = isExcelRev  ? await extrairTextoExcel(revisadoBuffer) : isPdfRev  ? await extrairTextoPDF(revisadoBuffer)  : []
  return compararTextos(textoOrig, textoRev)
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXCEL COMPARISON (célula por célula)
// ═══════════════════════════════════════════════════════════════════════════════

interface RowData {
  key: string; descricao: string
  cells: Record<string, string | number | null>
}

async function compararExcel(origBuf: ArrayBuffer, revBuf: ArrayBuffer): Promise<ComparativoResult> {
  const wbO = new ExcelJS.Workbook(); await wbO.xlsx.load(origBuf)
  const wbR = new ExcelJS.Workbook(); await wbR.xlsx.load(revBuf)
  const rowsO = extrairLinhasExcel(getMaiorAba(wbO))
  const rowsR = extrairLinhasExcel(getMaiorAba(wbR))

  const mapO = new Map(rowsO.map(r => [r.key, r]))
  const mapR = new Map(rowsR.map(r => [r.key, r]))
  const alteracoes: Alteracao[] = []

  for (const [key, orig] of mapO) {
    const rev = mapR.get(key)
    if (!rev) continue
    const diffs = diffCelulas(orig, rev)
    if (diffs.length > 0) {
      alteracoes.push({ tipo: 'ALTERADO', item: key, descricao: `Item ${key}: ${orig.descricao || rev.descricao}`, detalhes: diffs.join('; ') })
    }
  }
  for (const [key, rev] of mapR) {
    if (!mapO.has(key)) alteracoes.push({ tipo: 'ADICIONADO', item: key, descricao: `Item ${key} adicionado: ${rev.descricao}` })
  }
  for (const [key, orig] of mapO) {
    if (!mapR.has(key)) alteracoes.push({ tipo: 'REMOVIDO', item: key, descricao: `Item ${key} removido: ${orig.descricao}` })
  }

  alteracoes.sort((a, b) => ({ REMOVIDO: 0, ALTERADO: 1, ADICIONADO: 2 }[a.tipo] ?? 9) - ({ REMOVIDO: 0, ALTERADO: 1, ADICIONADO: 2 }[b.tipo] ?? 9))

  return {
    alteracoes,
    resumo: {
      adicionados: alteracoes.filter(a => a.tipo === 'ADICIONADO').length,
      removidos: alteracoes.filter(a => a.tipo === 'REMOVIDO').length,
      alterados: alteracoes.filter(a => a.tipo === 'ALTERADO').length,
      totalOriginal: rowsO.length, totalRevisado: rowsR.length,
    },
    modo: 'EXCEL',
  }
}

function getMaiorAba(wb: ExcelJS.Workbook): ExcelJS.Worksheet {
  let best: ExcelJS.Worksheet | null = null, max = 0
  wb.eachSheet(s => { if (s.rowCount > max) { max = s.rowCount; best = s } })
  return best || wb.worksheets[0]
}

function extrairLinhasExcel(ws: ExcelJS.Worksheet): RowData[] {
  const hdr = detectHeader(ws)
  const headers: string[] = []
  let itemCol = 0, descCol = 0
  ws.getRow(hdr).eachCell({ includeEmpty: false }, (c, ci) => {
    const v = norm(c.value).toLowerCase()
    headers[ci] = v
    if (!itemCol && /^(item|código|codigo|cod|nº)$/.test(v)) itemCol = ci
    if (!descCol && /descrição|descricao|serviço|servico|nome/.test(v)) descCol = ci
  })
  if (!itemCol) itemCol = 1
  if (!descCol) descCol = itemCol + 1

  const rows: RowData[] = []
  ws.eachRow((row, ri) => {
    if (ri <= hdr) return
    const key = norm(row.getCell(itemCol).value)
    if (!key || key === '0') return
    const cells: Record<string, string | number | null> = {}
    row.eachCell({ includeEmpty: false }, (c, ci) => {
      const k = headers[ci] || `col${ci}`
      const v = c.value
      cells[k] = v instanceof Date ? v.toISOString().split('T')[0] : typeof v === 'number' ? Math.round(v * 10000) / 10000 : norm(v)
    })
    rows.push({ key, descricao: norm(row.getCell(descCol).value), cells })
  })
  return rows
}

function detectHeader(ws: ExcelJS.Worksheet): number {
  let best = 1, bScore = 0
  const kw = ['item', 'descrição', 'descricao', 'unid', 'quant', 'preço', 'preco', 'valor', 'total']
  ws.eachRow((row, ri) => {
    if (ri > 15) return
    let s = 0
    row.eachCell({ includeEmpty: false }, c => { if (kw.some(k => norm(c.value).toLowerCase().includes(k))) s++ })
    if (s > bScore) { bScore = s; best = ri }
  })
  return best
}

function diffCelulas(orig: RowData, rev: RowData): string[] {
  const diffs: string[] = []
  const allKeys = new Set([...Object.keys(orig.cells), ...Object.keys(rev.cells)])
  const ignorar = ['col1', 'item', 'código', 'codigo']
  for (const k of allKeys) {
    if (ignorar.some(ig => k.includes(ig))) continue
    const vO = orig.cells[k], vR = rev.cells[k]
    if (vO === vR || (vO == null && vR == null) || (vO === '' && vR == null) || (vO == null && vR === '')) continue
    if (typeof vO === 'number' && typeof vR === 'number') {
      if (Math.abs(vO - vR) < 0.001) continue
      const pct = vO !== 0 ? ((vR - vO) / vO * 100).toFixed(1) : 'novo'
      diffs.push(`${k}: ${fmtN(vO)} → ${fmtN(vR)} (${pct}%)`)
    } else {
      const sO = String(vO || '').trim(), sR = String(vR || '').trim()
      if (sO === sR) continue
      diffs.push(sO.length > 40 || sR.length > 40 ? `${k}: texto alterado` : `${k}: "${sO || '—'}" → "${sR || '—'}"`)
    }
  }
  return diffs
}

// ═══════════════════════════════════════════════════════════════════════════════
// PDF COMPARISON (extrai texto e compara linhas)
// ═══════════════════════════════════════════════════════════════════════════════

async function extrairTextoPDF(buffer: ArrayBuffer): Promise<string[]> {
  // Tenta com worker, se falhar tenta sem worker
  let pdf
  try {
    pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise
  } catch {
    // Fallback: desativa worker e tenta novamente
    pdfjsLib.GlobalWorkerOptions.workerSrc = ''
    pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer), useWorkerFetch: false, isEvalSupported: false } as any).promise
  }

  const linhas: string[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    const yMap = new Map<number, string[]>()
    for (const item of content.items as any[]) {
      if (!item.str?.trim()) continue
      const y = Math.round(item.transform[5])
      if (!yMap.has(y)) yMap.set(y, [])
      yMap.get(y)!.push(item.str.trim())
    }
    const sorted = [...yMap.entries()].sort((a, b) => b[0] - a[0])
    for (const [, words] of sorted) {
      const line = words.join(' ').trim()
      if (line) linhas.push(line)
    }
  }
  return linhas
}

async function extrairTextoExcel(buffer: ArrayBuffer): Promise<string[]> {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buffer)
  const ws = getMaiorAba(wb)
  const linhas: string[] = []
  ws.eachRow(row => {
    const parts: string[] = []
    row.eachCell({ includeEmpty: false }, c => {
      const v = c.value
      if (v !== null && v !== undefined && v !== '') parts.push(String(v instanceof Date ? v.toISOString().split('T')[0] : v).trim())
    })
    if (parts.length > 0) linhas.push(parts.join(' | '))
  })
  return linhas
}

async function compararPDF(origBuf: ArrayBuffer, revBuf: ArrayBuffer): Promise<ComparativoResult> {
  const linhasO = await extrairTextoPDF(origBuf)
  const linhasR = await extrairTextoPDF(revBuf)
  return compararTextos(linhasO, linhasR)
}

function compararTextos(linhasO: string[], linhasR: string[]): ComparativoResult {
  // Normaliza e cria sets
  const normO = linhasO.map(l => normLinha(l))
  const normR = linhasR.map(l => normLinha(l))
  const setO = new Set(normO)
  const setR = new Set(normR)

  const alteracoes: Alteracao[] = []

  // Linhas removidas (no original mas não no revisado)
  let removidos = 0
  for (let i = 0; i < normO.length; i++) {
    if (!setR.has(normO[i]) && normO[i].length > 5) {
      // Procura linha similar no revisado (edit distance)
      const similar = encontrarSimilar(normO[i], normR)
      if (similar) {
        alteracoes.push({
          tipo: 'ALTERADO',
          item: `L${i + 1}`,
          descricao: truncar(linhasO[i], 80),
          detalhes: `Alterado para: ${truncar(similar.texto, 80)}`,
        })
        setR.delete(similar.norm)  // marca como processado
      } else {
        alteracoes.push({ tipo: 'REMOVIDO', item: `L${i + 1}`, descricao: truncar(linhasO[i], 100) })
        removidos++
      }
    }
  }

  // Linhas adicionadas (no revisado mas não no original)
  let adicionados = 0
  for (let i = 0; i < normR.length; i++) {
    if (!setO.has(normR[i]) && setR.has(normR[i]) && normR[i].length > 5) {
      alteracoes.push({ tipo: 'ADICIONADO', item: `L${i + 1}`, descricao: truncar(linhasR[i], 100) })
      adicionados++
    }
  }

  alteracoes.sort((a, b) => ({ REMOVIDO: 0, ALTERADO: 1, ADICIONADO: 2 }[a.tipo] ?? 9) - ({ REMOVIDO: 0, ALTERADO: 1, ADICIONADO: 2 }[b.tipo] ?? 9))

  // Limita a 50 alterações para não travar a UI
  const limitadas = alteracoes.slice(0, 50)
  if (alteracoes.length > 50) {
    limitadas.push({ tipo: 'ALTERADO', item: '...', descricao: `E mais ${alteracoes.length - 50} diferença(s)` })
  }

  return {
    alteracoes: limitadas,
    resumo: {
      adicionados, removidos,
      alterados: alteracoes.filter(a => a.tipo === 'ALTERADO').length,
      totalOriginal: linhasO.length, totalRevisado: linhasR.length,
    },
    modo: 'PDF',
  }
}

// Encontra linha similar (>70% de semelhança)
function encontrarSimilar(needle: string, haystack: string[]): { texto: string; norm: string } | null {
  let bestScore = 0, bestIdx = -1
  const words = new Set(needle.split(/\s+/))
  for (let i = 0; i < haystack.length; i++) {
    const hWords = new Set(haystack[i].split(/\s+/))
    let match = 0
    for (const w of words) { if (hWords.has(w)) match++ }
    const score = match / Math.max(words.size, hWords.size)
    if (score > bestScore && score >= 0.5) { bestScore = score; bestIdx = i }
  }
  if (bestIdx >= 0) return { texto: haystack[bestIdx], norm: haystack[bestIdx] }
  return null
}

function normLinha(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase()
}

function truncar(s: string, max: number): string {
  return s.length > max ? s.substring(0, max) + '...' : s
}

function norm(v: any): string {
  if (v == null) return ''
  if (typeof v === 'object' && 'richText' in v) return (v.richText as { text: string }[]).map(r => r.text).join('').trim()
  return String(v).trim()
}

function fmtN(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 4 })
}