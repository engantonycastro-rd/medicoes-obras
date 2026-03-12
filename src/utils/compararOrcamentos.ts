import ExcelJS from 'exceljs'

export interface Alteracao {
  tipo: 'ADICIONADO' | 'REMOVIDO' | 'ALTERADO'
  item: string
  descricao: string
  detalhes?: string
}

export interface ComparativoResult {
  alteracoes: Alteracao[]
  resumo: {
    adicionados: number
    removidos: number
    alterados: number
    totalOriginal: number
    totalRevisado: number
  }
}

interface RowData {
  rowNum: number
  key: string           // identificador (item ou coluna A)
  descricao: string     // descrição/nome do serviço
  cells: Record<string, string | number | null>  // todas as colunas
  raw: string[]         // valores como string para comparação
}

/**
 * Compara dois arquivos Excel (original vs revisado) e retorna as diferenças.
 * Funciona com qualquer layout — detecta header automaticamente e compara por item.
 */
export async function compararOrcamentos(
  originalBuffer: ArrayBuffer,
  revisadoBuffer: ArrayBuffer
): Promise<ComparativoResult> {
  const wbOrig = new ExcelJS.Workbook()
  const wbRev  = new ExcelJS.Workbook()
  await wbOrig.xlsx.load(originalBuffer)
  await wbRev.xlsx.load(revisadoBuffer)

  const wsOrig = getMaiorAba(wbOrig)
  const wsRev  = getMaiorAba(wbRev)

  const rowsOrig = extrairLinhas(wsOrig)
  const rowsRev  = extrairLinhas(wsRev)

  const alteracoes: Alteracao[] = []

  // Mapa por chave
  const mapOrig = new Map<string, RowData>()
  const mapRev  = new Map<string, RowData>()
  rowsOrig.forEach(r => mapOrig.set(r.key, r))
  rowsRev.forEach(r => mapRev.set(r.key, r))

  // 1. Itens alterados (existem nos dois)
  for (const [key, orig] of mapOrig) {
    const rev = mapRev.get(key)
    if (!rev) continue

    const diffs = compararCelulas(orig, rev)
    if (diffs.length > 0) {
      alteracoes.push({
        tipo: 'ALTERADO',
        item: key,
        descricao: `Item ${key}: ${orig.descricao || rev.descricao || ''}`,
        detalhes: diffs.join('; '),
      })
    }
  }

  // 2. Itens adicionados (só no revisado)
  for (const [key, rev] of mapRev) {
    if (!mapOrig.has(key)) {
      alteracoes.push({
        tipo: 'ADICIONADO',
        item: key,
        descricao: `Item ${key} adicionado: ${rev.descricao || ''}`,
      })
    }
  }

  // 3. Itens removidos (só no original)
  for (const [key, orig] of mapOrig) {
    if (!mapRev.has(key)) {
      alteracoes.push({
        tipo: 'REMOVIDO',
        item: key,
        descricao: `Item ${key} removido: ${orig.descricao || ''}`,
      })
    }
  }

  // Ordena: removidos primeiro, depois alterados, depois adicionados
  alteracoes.sort((a, b) => {
    const ordem = { REMOVIDO: 0, ALTERADO: 1, ADICIONADO: 2 }
    return (ordem[a.tipo] ?? 9) - (ordem[b.tipo] ?? 9)
  })

  return {
    alteracoes,
    resumo: {
      adicionados: alteracoes.filter(a => a.tipo === 'ADICIONADO').length,
      removidos: alteracoes.filter(a => a.tipo === 'REMOVIDO').length,
      alterados: alteracoes.filter(a => a.tipo === 'ALTERADO').length,
      totalOriginal: rowsOrig.length,
      totalRevisado: rowsRev.length,
    },
  }
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

function getMaiorAba(wb: ExcelJS.Workbook): ExcelJS.Worksheet {
  let best: ExcelJS.Worksheet | null = null
  let maxRows = 0
  wb.eachSheet(sheet => { if (sheet.rowCount > maxRows) { maxRows = sheet.rowCount; best = sheet } })
  return best || wb.worksheets[0]
}

function extrairLinhas(ws: ExcelJS.Worksheet): RowData[] {
  // Detecta header
  const headerRow = detectarHeader(ws)
  const headers: string[] = []
  let itemCol = 0, descCol = 0

  const row1 = ws.getRow(headerRow)
  row1.eachCell({ includeEmpty: false }, (cell, ci) => {
    const val = String(cell.value || '').toLowerCase().trim()
    headers[ci] = val
    if (!itemCol && (val === 'item' || val === 'código' || val === 'codigo' || val === 'cod' || val === 'nº'))
      itemCol = ci
    if (!descCol && (val.includes('descrição') || val.includes('descricao') || val === 'serviço' || val === 'servico' || val === 'nome'))
      descCol = ci
  })

  // Se não achou item, usa coluna A
  if (!itemCol) itemCol = 1
  if (!descCol) descCol = itemCol + 1

  const rows: RowData[] = []
  ws.eachRow((row, ri) => {
    if (ri <= headerRow) return
    const itemVal = normalizar(row.getCell(itemCol).value)
    if (!itemVal || itemVal === '0') return

    const cells: Record<string, string | number | null> = {}
    const rawParts: string[] = []
    row.eachCell({ includeEmpty: false }, (cell, ci) => {
      const key = headers[ci] || `col${ci}`
      const v = cell.value
      if (v instanceof Date) {
        cells[key] = v.toISOString().split('T')[0]
        rawParts.push(cells[key] as string)
      } else if (typeof v === 'number') {
        cells[key] = Math.round(v * 10000) / 10000  // normaliza precisão
        rawParts.push(String(cells[key]))
      } else {
        cells[key] = normalizar(v)
        rawParts.push(cells[key] as string)
      }
    })

    rows.push({
      rowNum: ri,
      key: itemVal,
      descricao: normalizar(row.getCell(descCol).value),
      cells,
      raw: rawParts,
    })
  })

  return rows
}

function detectarHeader(ws: ExcelJS.Worksheet): number {
  let bestRow = 1, bestScore = 0
  const keywords = ['item', 'descrição', 'descricao', 'unid', 'quant', 'preço', 'preco', 'valor', 'total', 'und', 'serviço', 'servico']

  ws.eachRow((row, ri) => {
    if (ri > 15) return
    let score = 0
    row.eachCell({ includeEmpty: false }, cell => {
      const v = String(cell.value || '').toLowerCase().trim()
      if (keywords.some(k => v.includes(k))) score++
    })
    if (score > bestScore) { bestScore = score; bestRow = ri }
  })

  return bestRow
}

function compararCelulas(orig: RowData, rev: RowData): string[] {
  const diffs: string[] = []
  const allKeys = new Set([...Object.keys(orig.cells), ...Object.keys(rev.cells)])

  // Ignora colunas de metadados
  const ignorar = ['col1', 'item', 'código', 'codigo', 'cod', 'nº']

  for (const key of allKeys) {
    if (ignorar.some(ig => key.toLowerCase().includes(ig))) continue

    const vO = orig.cells[key]
    const vR = rev.cells[key]

    if (vO === vR) continue
    if (vO === null && vR === null) continue
    if (vO === '' && vR === null) continue
    if (vO === null && vR === '') continue

    // Compara numéricos com tolerância
    if (typeof vO === 'number' && typeof vR === 'number') {
      if (Math.abs(vO - vR) < 0.001) continue
      const pct = vO !== 0 ? ((vR - vO) / vO * 100).toFixed(1) : 'novo'
      diffs.push(`${key}: ${formatNum(vO)} → ${formatNum(vR)} (${pct}%)`)
      continue
    }

    // Compara strings
    const sO = String(vO || '').trim()
    const sR = String(vR || '').trim()
    if (sO === sR) continue
    if (sO.length > 50 || sR.length > 50) {
      diffs.push(`${key}: texto alterado`)
    } else {
      diffs.push(`${key}: "${sO || '—'}" → "${sR || '—'}"`)
    }
  }

  return diffs
}

function normalizar(v: any): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object' && 'richText' in v)
    return (v.richText as Array<{ text: string }>).map(rt => rt.text).join('').trim()
  return String(v).trim()
}

function formatNum(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 4 })
}