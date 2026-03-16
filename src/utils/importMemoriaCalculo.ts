import ExcelJS from 'exceljs'

export interface MemoriaCalcItem {
  item_servico: string
  descricao: string
  formula: string
  variaveis: Record<string, number>
  quantidade_prevista: number
  ordem: number
}

/**
 * Importa planilha de memória de cálculo.
 * Estrutura esperada:
 *   Row: "1.2. 103689 DESCRIÇÃO DO SERVIÇO (UND)" — cabeçalho do item
 *   Row: headers de variáveis (COMP, LARG, ALT, QTD, etc.)
 *   Rows: subitens com descrição (col A), fórmula (col B), valores, quantidade
 *   Row: "TOTAL DA MEMÓRIA DE CÁLCULO: X" — encerra o bloco
 */
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

  return parseMemoria(ws as ExcelJS.Worksheet)
}

// Variáveis conhecidas que mapeiam para campos fixos do sistema
const VAR_MAP: Record<string, string> = {
  'LARG': 'largura', 'LARGURA': 'largura',
  'COMP': 'comprimento', 'COMPRIMENTO': 'comprimento',
  'ALT': 'altura', 'ALTURA': 'altura',
  'AREA': 'area', 'ÁREA': 'area',
  'PERIMETRO': 'perimetro',
  'VOL': 'volume', 'VOLUME': 'volume',
  'KG': 'kg',
}

interface RawRow {
  rowIndex: number
  cells: (string | number | null)[]
}

function parseMemoria(ws: ExcelJS.Worksheet): MemoriaCalcItem[] {
  // 1. Coleta todas as linhas em array (eachRow é o método confiável do ExcelJS)
  const rows: RawRow[] = []
  ws.eachRow({ includeEmpty: false }, (row, rowIndex) => {
    const cells: (string | number | null)[] = []
    for (let c = 1; c <= 9; c++) {
      const cell = row.getCell(c)
      let val = cell.value
      if (val === null || val === undefined) { cells.push(null); continue }
      if (typeof val === 'object' && val !== null && 'richText' in (val as object)) {
        val = ((val as any).richText as Array<{ text: string }>).map(rt => rt.text).join('')
      }
      cells.push(typeof val === 'number' ? val : String(val))
    }
    rows.push({ rowIndex, cells })
  })

  // 2. Processa sequencialmente
  const itens: MemoriaCalcItem[] = []
  let ordem = 0
  let i = 0

  while (i < rows.length) {
    const r = rows[i]
    const cellA = r.cells[0]

    // Detecta cabeçalho do item (ex: "1.2. 103689 FORNECIMENTO...")
    const itemMatch = typeof cellA === 'string' ? cellA.match(/^(\d+\.\d+)\.?\s/) : null
    if (!itemMatch) { i++; continue }

    const itemNum = itemMatch[1]
    
    // Próxima linha: headers das variáveis
    i++
    if (i >= rows.length) break
    const headerRow = rows[i]
    const headers: { col: number; name: string }[] = []
    let colQtd = 0
    for (let c = 0; c < 9; c++) {
      const val = headerRow.cells[c]
      if (val && typeof val === 'string') {
        const name = val.trim().toUpperCase()
        if (name === 'QTD' || name === 'QUANTIDADE') {
          colQtd = c
        } else if (name.length > 0 && name.length < 30) {
          headers.push({ col: c, name })
        }
      }
    }

    // Linhas de dados (subitens)
    i++
    while (i < rows.length) {
      const dr = rows[i]
      const a = dr.cells[0]
      const b = dr.cells[1]

      // Verifica TOTAL (fim do bloco)
      let isTotal = false
      for (const v of dr.cells) {
        if (v && typeof v === 'string' && v.includes('TOTAL DA MEM')) {
          isTotal = true; break
        }
      }
      if (isTotal) { i++; break }

      // Verifica se é próximo item (novo bloco)
      if (a && typeof a === 'string' && /^\d+\.\d+\.?\s/.test(a)) break

      // Se tem descrição (col A) e fórmula (col B)
      if (a && typeof a === 'string' && a.trim().length > 0 && b) {
        const descricao = String(a).trim()
        const formula = String(b).trim()

        // Lê valores das variáveis
        const variaveis: Record<string, number> = {}
        for (const h of headers) {
          const val = dr.cells[h.col]
          if (val !== null && val !== undefined) {
            const num = typeof val === 'number' ? val : parseFloat(String(val))
            if (!isNaN(num)) variaveis[h.name] = num
          }
        }

        // Lê quantidade
        let qtd = 0
        if (colQtd) {
          const v = dr.cells[colQtd]
          if (v !== null && typeof v === 'number') qtd = v
        }
        // Fallback: última coluna numérica > 0
        if (qtd === 0) {
          for (let c = 8; c >= 2; c--) {
            const v = dr.cells[c]
            if (v !== null && typeof v === 'number' && v > 0) { qtd = v; break }
          }
        }

        if (qtd !== 0) {
          itens.push({
            item_servico: itemNum,
            descricao,
            formula,
            variaveis,
            quantidade_prevista: qtd,
            ordem: ordem++,
          })
        }
      }

      i++
    }
  }

  return itens
}

export { VAR_MAP }
