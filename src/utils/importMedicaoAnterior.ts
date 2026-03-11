import ExcelJS from 'exceljs'

/**
 * Importa uma medição anterior (já executada) de um arquivo Excel.
 *
 * O arquivo deve ter pelo menos 2 colunas:
 *   ITEM | QTD_MEDIDA (ou QUANTIDADE MEDIDA, ACUMULADO, EXECUTADO, etc.)
 *
 * Pode ter mais colunas (são ignoradas). Aceita formatos:
 *   - Planilha com cabeçalho padrão (ITEM, QTD)
 *   - Export do próprio sistema (colunas: ITEM, ..., AC.UND ou ACUM)
 *   - Planilha simples (duas colunas: item e quantidade)
 */

export interface MedicaoAnteriorItem {
  item: string       // Ex: "1.1", "2.3"
  quantidade: number // Quantidade já medida
}

export async function importarMedicaoAnterior(file: File): Promise<MedicaoAnteriorItem[]> {
  const buffer = await file.arrayBuffer()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)

  let ws: ExcelJS.Worksheet | null = null
  let maxRows = 0
  wb.eachSheet(sheet => { if (sheet.rowCount > maxRows) { maxRows = sheet.rowCount; ws = sheet } })
  if (!ws) throw new Error('Planilha sem abas válidas')
  return parseMedicaoAnterior(ws as ExcelJS.Worksheet)
}

interface ColMapMA { item: number; qtd: number; _headerRow: number }

const KEYWORDS_ITEM = ['item']
const KEYWORDS_QTD = [
  'quantidade medida', 'qtd medida', 'qtd_medida', 'acumulado', 'ac.und',
  'executado', 'qtd executada', 'qtd acumulada', 'medido', 'qtd',
  'quantidade', 'acum', 'total medido',
]

function detectarColunasMA(ws: ExcelJS.Worksheet): ColMapMA | null {
  let best: ColMapMA | null = null
  let bestScore = 0

  ws.eachRow((row, rowIndex) => {
    if (rowIndex > 20) return
    let colItem = 0, colQtd = 0, score = 0

    row.eachCell({ includeEmpty: false }, (cell, colIndex) => {
      const raw = cell.value
      if (typeof raw === 'number' || raw instanceof Date) return
      const val = String(raw ?? '').toLowerCase().replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
      if (!val) return

      if (!colItem && KEYWORDS_ITEM.some(k => val === k)) { colItem = colIndex; score += 10 }
      if (!colQtd && KEYWORDS_QTD.some(k => val === k || val.includes(k))) { colQtd = colIndex; score += 10 }
    })

    if (colItem && colQtd && score > bestScore) {
      bestScore = score
      best = { item: colItem, qtd: colQtd, _headerRow: rowIndex }
    }
  })

  // Fallback: se tem só 2 colunas, assume col A = item, col B = qtd
  if (!best) {
    const firstRow = ws.getRow(1)
    const numCols = firstRow.cellCount
    if (numCols >= 2) {
      // Verifica se primeira linha de dados parece item
      for (let r = 1; r <= 5; r++) {
        const row = ws.getRow(r)
        const a = String(row.getCell(1).value ?? '').trim()
        const b = row.getCell(2).value
        if (/^\d+(\.\d+)*$/.test(a) && typeof b === 'number' && b > 0) {
          return { item: 1, qtd: 2, _headerRow: r - 1 }
        }
      }
    }
  }

  return best
}

function parseMedicaoAnterior(ws: ExcelJS.Worksheet): MedicaoAnteriorItem[] {
  const colMap = detectarColunasMA(ws)
  if (!colMap) {
    throw new Error(
      'Não foi possível identificar as colunas ITEM e QUANTIDADE MEDIDA. ' +
      'A planilha deve ter pelo menos: coluna ITEM (ex: 1.1, 2.3) e coluna com a quantidade já medida.'
    )
  }

  const items: MedicaoAnteriorItem[] = []

  ws.eachRow((row, rowIndex) => {
    if (rowIndex <= colMap._headerRow) return

    const itemRaw = String(row.getCell(colMap.item).value ?? '').trim()
    if (!itemRaw || !/^\d+(\.\d+)*$/.test(itemRaw)) return

    // Ignora itens de grupo (ex: "1", "2" sem sub-item)
    if (!itemRaw.includes('.')) return

    const val = row.getCell(colMap.qtd).value
    let qtd = 0
    if (typeof val === 'number') qtd = val
    else {
      const str = String(val ?? '').replace(/[R$\s.]/g, '').replace(',', '.')
      qtd = Number(str)
    }

    if (isNaN(qtd) || qtd <= 0) return

    items.push({ item: itemRaw, quantidade: qtd })
  })

  return items
}