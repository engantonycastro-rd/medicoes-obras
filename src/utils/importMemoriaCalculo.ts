import ExcelJS from 'exceljs'

export interface MemoriaCalcItem {
  item_servico: string
  descricao: string
  formula: string
  variaveis: Record<string, number>
  quantidade_prevista: number
  ordem: number
}

export async function importarMemoriaCalculo(file: File): Promise<MemoriaCalcItem[]> {
  const buffer = await file.arrayBuffer()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)

  let ws: ExcelJS.Worksheet | null = null
  let maxRows = 0
  wb.eachSheet(sheet => {
    if (sheet.rowCount > maxRows) { maxRows = sheet.rowCount; ws = sheet }
  })
  if (!ws) throw new Error('Planilha sem abas válidas')

  return parseMemoria(ws as ExcelJS.Worksheet, maxRows)
}

const VAR_MAP: Record<string, string> = {
  'LARG': 'largura', 'LARGURA': 'largura',
  'COMP': 'comprimento', 'COMPRIMENTO': 'comprimento',
  'ALT': 'altura', 'ALTURA': 'altura',
  'AREA': 'area', 'ÁREA': 'area',
  'PERIMETRO': 'perimetro',
  'VOL': 'volume', 'VOLUME': 'volume',
  'KG': 'kg',
}

function getVal(row: ExcelJS.Row, col: number): string | number | null {
  try {
    const cell = row.getCell(col)
    let val = cell.value
    if (val === null || val === undefined) return null
    if (typeof val === 'object' && val !== null) {
      if ('richText' in val) return (val as any).richText.map((rt: any) => rt.text).join('')
      if ('result' in val) return (val as any).result
      return String(val)
    }
    return val as string | number
  } catch { return null }
}

function parseMemoria(ws: ExcelJS.Worksheet, totalRows: number): MemoriaCalcItem[] {
  const itens: MemoriaCalcItem[] = []
  let ordem = 0
  let r = 1

  while (r <= totalRows) {
    const row = ws.getRow(r)
    const cellA = getVal(row, 1)

    // Detecta cabeçalho do item (ex: "1.2. 103689 FORNECIMENTO...")
    const itemMatch = typeof cellA === 'string' ? cellA.match(/^(\d+\.\d+)\.?\s/) : null
    if (!itemMatch) { r++; continue }

    const itemNum = itemMatch[1]

    // Próxima linha: headers das variáveis
    r++
    if (r > totalRows) break
    const hRow = ws.getRow(r)
    const headers: { col: number; name: string }[] = []
    let colQtd = 0
    for (let c = 1; c <= 9; c++) {
      const val = getVal(hRow, c)
      if (val && typeof val === 'string') {
        const name = val.trim().toUpperCase()
        if (name === 'QTD' || name === 'QUANTIDADE') colQtd = c
        else if (name.length > 0 && name.length < 30) headers.push({ col: c, name })
      }
    }

    // Linhas de dados (subitens)
    r++
    while (r <= totalRows) {
      const dRow = ws.getRow(r)
      const a = getVal(dRow, 1)
      const b = getVal(dRow, 2)

      // Verifica TOTAL (fim do bloco)
      let isTotal = false
      for (let c = 1; c <= 9; c++) {
        const v = getVal(dRow, c)
        if (v && typeof v === 'string' && v.includes('TOTAL DA MEM')) { isTotal = true; break }
      }
      if (isTotal) { r++; break }

      // Verifica se é próximo item (novo bloco)
      if (a && typeof a === 'string' && /^\d+\.\d+\.?\s/.test(a)) break

      // Se tem descrição (col A) e fórmula (col B)
      if (a && typeof a === 'string' && a.trim().length > 0 && b) {
        const descricao = String(a).trim()
        const formula = String(b).trim()

        const variaveis: Record<string, number> = {}
        for (const h of headers) {
          const val = getVal(dRow, h.col)
          if (val !== null) {
            const num = typeof val === 'number' ? val : parseFloat(String(val))
            if (!isNaN(num)) variaveis[h.name] = num
          }
        }

        let qtd = 0
        if (colQtd) {
          const v = getVal(dRow, colQtd)
          if (v !== null && typeof v === 'number') qtd = v
          else if (v !== null) { const n = parseFloat(String(v)); if (!isNaN(n)) qtd = n }
        }
        if (qtd === 0) {
          for (let c = 9; c >= 3; c--) {
            const v = getVal(dRow, c)
            if (v !== null) {
              const n = typeof v === 'number' ? v : parseFloat(String(v))
              if (!isNaN(n) && n > 0) { qtd = n; break }
            }
          }
        }

        if (qtd !== 0) {
          itens.push({ item_servico: itemNum, descricao, formula, variaveis, quantidade_prevista: qtd, ordem: ordem++ })
        }
      }
      r++
    }
  }

  return itens
}

export { VAR_MAP }
