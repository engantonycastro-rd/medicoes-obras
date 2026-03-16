import ExcelJS from 'exceljs'
import { ServicoImportado } from '../types'
import { isItemGrupo, getGrupoItem } from './calculations'

export type ModoImportacao = 'SEM_BDI' | 'COM_BDI'

/**
 * Importa um arquivo de orçamento (.xlsx) e extrai os serviços.
 *
 * Modos:
 *  SEM_BDI (padrão): Lê preço unitário bruto — sistema aplica BDI e desconto
 *  COM_BDI:          Lê preço unitário já com BDI — sistema NÃO aplica BDI (desconto no total)
 */
export async function importarOrcamento(file: File, modo: ModoImportacao = 'SEM_BDI'): Promise<ServicoImportado[]> {
  const buffer = await file.arrayBuffer()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)

  // Escolhe a aba com mais linhas
  let ws: ExcelJS.Worksheet | null = null
  let maxRows = 0
  wb.eachSheet(sheet => {
    if (sheet.rowCount > maxRows) {
      maxRows = sheet.rowCount
      ws = sheet
    }
  })

  if (!ws) throw new Error('Planilha sem abas válidas')
  return parseServicos(ws as ExcelJS.Worksheet, modo)
}

interface ColMap {
  item: number
  fonte: number
  codigo: number
  descricao: number
  unidade: number
  quantidade: number
  preco_unitario: number
  preco_com_bdi: number
  _headerRow: number
}

// ─── PARSER PRINCIPAL ─────────────────────────────────────────────────────────

function parseServicos(ws: ExcelJS.Worksheet, modo: ModoImportacao): ServicoImportado[] {
  const colMap = detectarColunas(ws)
  if (!colMap) {
    throw new Error(
      'Não foi possível identificar as colunas obrigatórias (ITEM, DESCRIÇÃO, QTD, PREÇO). ' +
      'Verifique se o arquivo segue o modelo esperado.'
    )
  }

  // Se modo COM_BDI mas não encontrou coluna "COM BDI", tenta usar preco_unitario mesmo
  const colPreco = modo === 'COM_BDI' && colMap.preco_com_bdi
    ? colMap.preco_com_bdi
    : colMap.preco_unitario

  const servicos: ServicoImportado[] = []
  let ordem = 0

  ws.eachRow((row, rowIndex) => {
    if (rowIndex <= colMap._headerRow) return

    const item      = getCellStr(row, colMap.item)
    const descricao = getCellStr(row, colMap.descricao)
    if (!item || !descricao) return

    // Ignora linhas de totais
    const itemLower = item.toLowerCase()
    if (itemLower.includes('total') || itemLower.includes('valor')) return

    // Item deve parecer numerado (ex: "1", "1.1", "2.3.1")
    if (!/^\d+(\.\d+)*$/.test(item.trim())) return

    const fonte    = getCellStr(row, colMap.fonte) || 'SINAPI'
    const codigo   = getCellStr(row, colMap.codigo)
    const unidade  = getCellStr(row, colMap.unidade) || 'UN'
    const qtd      = getCellNum(row, colMap.quantidade) ?? 0
    const precoUn  = getCellNum(row, colPreco) ?? 0
    const grupo    = isItemGrupo(item)

    servicos.push({
      item: item.trim(),
      fonte: fonte.trim(),
      codigo: codigo?.trim() || '',
      descricao: descricao.trim(),
      unidade: unidade.trim(),
      quantidade: grupo ? 0 : qtd,
      preco_unitario: grupo ? 0 : precoUn,
      is_grupo: grupo,
      grupo_item: grupo ? null : getGrupoItem(item) || null,
      ordem: ordem++,
    })
  })

  return servicos
}

// ─── DETECÇÃO DE COLUNAS ──────────────────────────────────────────────────────
// IMPORTANTE: regras de match mais estritas para evitar falsos positivos
// ex: "UNITÁRIO" contém "UN" mas NÃO é coluna de unidade.

interface ColScore {
  col: number
  score: number
}

const KEYWORDS: Record<keyof Omit<ColMap, '_headerRow'>, { exact: string[]; partial: string[] }> = {
  item: {
    exact:   ['item'],
    partial: [],
  },
  fonte: {
    exact:   ['fonte', 'referencia', 'referência', 'tabela', 'própria', 'propria'],
    partial: ['fonte'],
  },
  codigo: {
    exact:   ['código', 'codigo', 'cód', 'cod', 'cód.'],
    partial: ['código', 'codigo'],
  },
  descricao: {
    exact:   ['descrição', 'descricao', 'especificação', 'especificacao', 'serviço', 'servico', 'discriminação', 'discriminacao'],
    partial: ['descri', 'discrimin'],
  },
  unidade: {
    exact:   ['unid', 'und', 'un', 'unidade', 'unid.'],
    partial: [],
  },
  quantidade: {
    exact:   ['quantidade', 'qtd', 'qtde', 'quant.', 'quant', 'quantid e', 'quantidad e'],
    partial: ['quantid', 'qtd'],
  },
  preco_unitario: {
    exact:   ['preço unitário', 'preco unitario', 'valor unitário', 'valor unitario',
              'pu', 'p.u.', 'preço unit.', 'preço unitário r$', 'preco unitario r$', 'sem bdi'],
    partial: ['unitário', 'unitario', 'preço unit', 'sem bdi'],
  },
  preco_com_bdi: {
    exact:   ['com bdi', 'c/ bdi', 'preço com bdi', 'pu com bdi', 'preço c/ bdi'],
    partial: ['com bdi', 'c/ bdi'],
  },
}

function detectarColunas(ws: ExcelJS.Worksheet): ColMap | null {
  // Candidatos: cada row recebe score = (nº de colunas obrigatórias encontradas * 10) + pontos parciais
  // Isso prioriza linhas com MAIS colunas distintas, não apenas matches fortes em poucas colunas
  let melhorLinha = 0
  let melhorMapa: Partial<Omit<ColMap, '_headerRow'>> = {}
  let melhorScore = 0

  ws.eachRow((row, rowIndex) => {
    if (rowIndex > 40) return

    const candidato: Partial<Omit<ColMap, '_headerRow'>> = {}
    let pontosExato = 0
    let pontosParcial = 0

    row.eachCell({ includeEmpty: false }, (cell, colIndex) => {
      const raw = cell.value
      // Ignora cells numéricas ou datas (cabeçalho real tem texto)
      if (typeof raw === 'number' || raw instanceof Date) return

      const val = String(raw ?? '')
        .toLowerCase()
        .replace(/\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

      if (!val || val.length > 80) return // Ignora textos muito longos (são dados, não headers)

      for (const [key, rules] of Object.entries(KEYWORDS) as [keyof typeof KEYWORDS, typeof KEYWORDS[keyof typeof KEYWORDS]][]) {
        if (candidato[key]) continue

        if (rules.exact.some(w => val === w)) {
          candidato[key] = colIndex
          pontosExato += 3
          continue
        }

        if (key !== 'unidade' && rules.partial.some(w => val.includes(w))) {
          candidato[key] = colIndex
          pontosParcial += 1
        }
      }
    })

    // Score composto: nº de colunas obrigatórias × 10 + pontos detalhados
    // Isso garante que uma linha com 4 matches obrigatórios sempre ganha de uma com 2
    const required: (keyof Omit<ColMap, '_headerRow'>)[] = ['item', 'descricao', 'quantidade', 'preco_unitario']
    const nObrig = required.filter(k => candidato[k]).length
    const nTotal = Object.keys(candidato).length
    const score = nObrig * 100 + nTotal * 10 + pontosExato + pontosParcial

    if (score > melhorScore) {
      melhorScore = score
      melhorMapa  = candidato
      melhorLinha = rowIndex
    }
  })

  const required: (keyof Omit<ColMap, '_headerRow'>)[] = ['item', 'descricao', 'quantidade', 'preco_unitario']
  if (!required.every(k => melhorMapa[k])) return null

  // Validação extra: verifica se a próxima linha tem dados tipo "1" ou "1.1" na coluna item
  // Se não, tenta avançar até 5 linhas procurando o início dos dados
  let headerRow = melhorLinha
  for (let offset = 1; offset <= 5; offset++) {
    const nextRow = ws.getRow(headerRow + offset)
    if (!nextRow) break
    const itemVal = String(nextRow.getCell(melhorMapa.item!).value ?? '').trim()
    if (/^\d+(\.\d+)*$/.test(itemVal)) {
      // Dados começam nesta linha, header é a linha anterior a ela menos o offset
      headerRow = headerRow + offset - 1
      break
    }
  }

  return {
    _headerRow:     headerRow,
    item:           melhorMapa.item!,
    fonte:          melhorMapa.fonte    || 0,
    codigo:         melhorMapa.codigo   || 0,
    descricao:      melhorMapa.descricao!,
    unidade:        melhorMapa.unidade  || 0,
    quantidade:     melhorMapa.quantidade!,
    preco_unitario: melhorMapa.preco_unitario!,
    preco_com_bdi:  melhorMapa.preco_com_bdi || detectarColComBDI(ws, headerRow),
  }
}

// ─── DETECTAR COLUNA "COM BDI" ─────────────────────────────────────────────
// Procura nas linhas próximas ao header por uma célula com texto "COM BDI"

function detectarColComBDI(ws: ExcelJS.Worksheet, headerRow: number): number {
  for (let r = Math.max(1, headerRow - 3); r <= headerRow + 3; r++) {
    const row = ws.getRow(r)
    if (!row) continue
    row.eachCell({ includeEmpty: false }, (cell, colIndex) => {
      const val = String(cell.value ?? '').toLowerCase().replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
      if (val === 'com bdi' || val === 'c/ bdi') {
        // Encontrou! Retorna via side effect (closure)
        ;(detectarColComBDI as any)._found = colIndex
      }
    })
    if ((detectarColComBDI as any)._found) {
      const col = (detectarColComBDI as any)._found
      ;(detectarColComBDI as any)._found = 0
      return col
    }
  }
  return 0
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function getCellStr(row: ExcelJS.Row, col: number): string {
  if (!col) return ''
  const cell = row.getCell(col)
  const val  = cell.value
  if (val === null || val === undefined) return ''
  if (typeof val === 'object' && val !== null && 'richText' in (val as object)) {
    return ((val as any).richText as Array<{ text: string }>).map(rt => rt.text).join('')
  }
  return String(val).trim()
}

function getCellNum(row: ExcelJS.Row, col: number): number | null {
  if (!col) return null
  const cell = row.getCell(col)
  const val  = cell.value
  if (val === null || val === undefined || val === '') return null
  const n = Number(val)
  return isNaN(n) ? null : n
}
