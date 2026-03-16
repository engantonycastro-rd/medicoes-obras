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
 *   Row A: "1.2. 103689 DESCRIÇÃO DO SERVIÇO (UND)"
 *   Row B: headers de variáveis (COMP, LARG, ALT, QTD, etc.)
 *   Rows seguintes: subitens com descrição, fórmula, valores, quantidade
 *   Row com "TOTAL DA MEMÓRIA DE CÁLCULO:" encerra o bloco
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

function parseMemoria(ws: ExcelJS.Worksheet): MemoriaCalcItem[] {
  const itens: MemoriaCalcItem[] = []
  let ordem = 0
  let r = 1

  while (r <= ws.maxRow) {
    const cellA = getCellVal(ws, r, 1)

    // Detecta linha de cabeçalho do item (ex: "1.2. 103689 FORNECIMENTO...")
    const itemMatch = typeof cellA === 'string' ? cellA.match(/^(\d+\.\d+)\.?\s/) : null
    if (!itemMatch) { r++; continue }

    const itemNum = itemMatch[1]
    
    // Próxima linha: headers das variáveis
    r++
    if (r > ws.maxRow) break
    const headers: { col: number; name: string }[] = []
    for (let c = 1; c <= 9; c++) {
      const val = getCellVal(ws, r, c)
      if (val && typeof val === 'string') {
        const name = val.trim().toUpperCase()
        if (name && name !== 'QTD' && name !== 'QUANTIDADE') {
          headers.push({ col: c, name })
        }
      }
    }
    // Encontra coluna de QTD/QUANTIDADE (última coluna numérica do header)
    let colQtd = 0
    for (let c = 1; c <= 9; c++) {
      const val = getCellVal(ws, r, c)
      if (val && typeof val === 'string') {
        const name = val.trim().toUpperCase()
        if (name === 'QTD' || name === 'QUANTIDADE') {
          colQtd = c
        }
      }
    }

    // Linhas de dados (subitens)
    r++
    while (r <= ws.maxRow) {
      const a = getCellVal(ws, r, 1)
      const b = getCellVal(ws, r, 2)

      // Verifica se é TOTAL (fim do bloco)
      let isTotal = false
      for (let c = 1; c <= 9; c++) {
        const v = getCellVal(ws, r, c)
        if (v && typeof v === 'string' && v.includes('TOTAL DA MEMÓRIA')) {
          isTotal = true; break
        }
      }
      if (isTotal) { r++; break }

      // Verifica se é próximo item (novo bloco)
      if (a && typeof a === 'string' && /^\d+\.\d+\.?\s/.test(a)) break

      // Se tem descrição (col A) e fórmula ou é linha de dados
      if (a && typeof a === 'string' && a.trim().length > 0 && b) {
        const descricao = String(a).trim()
        const formula = String(b).trim()

        // Lê valores das variáveis
        const variaveis: Record<string, number> = {}
        for (const h of headers) {
          const val = getCellVal(ws, r, h.col)
          if (val !== null && val !== undefined) {
            const num = typeof val === 'number' ? val : parseFloat(String(val))
            if (!isNaN(num)) {
              variaveis[h.name] = num
            }
          }
        }

        // Lê quantidade (última coluna numérica da linha ou colQtd)
        let qtd = 0
        if (colQtd) {
          const v = getCellVal(ws, r, colQtd)
          if (v !== null && typeof v === 'number') qtd = v
        }
        // Se não encontrou por colQtd, pega a última coluna numérica
        if (qtd === 0) {
          for (let c = 9; c >= 3; c--) {
            const v = getCellVal(ws, r, c)
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

      r++
    }
  }

  return itens
}

function getCellVal(ws: ExcelJS.Worksheet, row: number, col: number): any {
  const cell = ws.getCell(row, col)
  if (!cell) return null
  const val = cell.value
  if (val === null || val === undefined) return null
  if (typeof val === 'object' && val !== null && 'richText' in (val as object)) {
    return ((val as any).richText as Array<{ text: string }>).map(rt => rt.text).join('')
  }
  return val
}

export { VAR_MAP }
