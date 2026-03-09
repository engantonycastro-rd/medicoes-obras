import ExcelJS from 'exceljs'
import { ServicoImportado } from '../types'
import { isItemGrupo, getGrupoItem } from './calculations'

/**
 * Importa um arquivo de orçamento (.xlsx/.xls) e extrai os serviços.
 *
 * Suporta dois formatos:
 *  1. Formato SEEC: colunas ITEM | FONTE | CÓDIGO | DESCRIÇÃO | UNID | QTD | PREÇO UN
 *  2. Formato genérico: detectado automaticamente por heurística
 */
export async function importarOrcamento(file: File): Promise<ServicoImportado[]> {
  const buffer = await file.arrayBuffer()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)

  // Tenta encontrar a aba principal (primeira com mais dados)
  let ws: ExcelJS.Worksheet | null = null
  let maxRows = 0
  wb.eachSheet(sheet => {
    if (sheet.rowCount > maxRows) {
      maxRows = sheet.rowCount
      ws = sheet
    }
  })

  if (!ws) throw new Error('Planilha sem abas válidas')

  return parseServicos(ws as ExcelJS.Worksheet)
}

interface ColMap {
  item: number
  fonte: number
  codigo: number
  descricao: number
  unidade: number
  quantidade: number
  preco_unitario: number
}

function parseServicos(ws: ExcelJS.Worksheet): ServicoImportado[] {
  const colMap = detectarColunas(ws)
  if (!colMap) {
    throw new Error(
      'Não foi possível identificar as colunas obrigatórias (ITEM, DESCRIÇÃO, UNID, QUANTIDADE, PREÇO). ' +
      'Verifique se o arquivo segue o modelo esperado.'
    )
  }

  const servicos: ServicoImportado[] = []
  let ordem = 0

  ws.eachRow((row, rowIndex) => {
    if (rowIndex <= colMap._headerRow) return

    const item      = getCellStr(row, colMap.item)
    const descricao = getCellStr(row, colMap.descricao)

    // Ignora linhas sem item ou descrição
    if (!item || !descricao) return

    // Ignora linhas de totais
    const itemLower = item.toLowerCase()
    if (itemLower.includes('total') || itemLower.includes('valor')) return

    const fonte    = getCellStr(row, colMap.fonte) || 'SINAPI'
    const codigo   = getCellStr(row, colMap.codigo)
    const unidade  = getCellStr(row, colMap.unidade) || 'UN'
    const qtd      = getCellNum(row, colMap.quantidade) ?? 0
    const precoUn  = getCellNum(row, colMap.preco_unitario) ?? 0
    const grupo    = isItemGrupo(item)

    servicos.push({
      item,
      fonte,
      codigo: codigo || '',
      descricao: descricao.trim(),
      unidade,
      quantidade: qtd,
      preco_unitario: precoUn,
      is_grupo: grupo,
      grupo_item: grupo ? undefined : getGrupoItem(item),
      ordem: ordem++,
    })
  })

  return servicos
}

// ─── DETECÇÃO DE COLUNAS ──────────────────────────────────────────────────────

const KEYWORDS: Record<keyof ColMap | '_headerRow', string[]> = {
  _headerRow: [],
  item:           ['item'],
  fonte:          ['fonte', 'referencia', 'referência', 'tabela'],
  codigo:         ['código', 'codigo', 'cód', 'cod', 'código sinapi', 'código seinfra'],
  descricao:      ['descrição', 'descricao', 'serviço', 'servico', 'especificação'],
  unidade:        ['unid', 'und', 'un', 'unidade'],
  quantidade:     ['quantidade', 'qtd', 'qtde', 'quant'],
  preco_unitario: ['preço unitário', 'preco unitario', 'valor unitário', 'unit'],
}

function detectarColunas(ws: ExcelJS.Worksheet): (ColMap & { _headerRow: number }) | null {
  let headerRow = 0
  let best: Partial<ColMap> = {}
  let bestScore = 0

  ws.eachRow((row, rowIndex) => {
    if (rowIndex > 30) return // só busca nas primeiras 30 linhas

    const candidate: Partial<ColMap> = {}
    let score = 0

    row.eachCell((cell, colIndex) => {
      const val = String(cell.value || '').toLowerCase().trim()

      Object.entries(KEYWORDS).forEach(([key, words]) => {
        if (key === '_headerRow') return
        if (words.some(w => val.includes(w))) {
          candidate[key as keyof ColMap] = colIndex
          score++
        }
      })
    })

    if (score > bestScore) {
      bestScore = score
      best = candidate
      headerRow = rowIndex
    }
  })

  // Mínimo: item + descrição + quantidade + preço
  const required: (keyof ColMap)[] = ['item', 'descricao', 'quantidade', 'preco_unitario']
  if (!required.every(k => best[k])) return null

  return {
    _headerRow: headerRow,
    item:           best.item!,
    fonte:          best.fonte || 0,
    codigo:         best.codigo || 0,
    descricao:      best.descricao!,
    unidade:        best.unidade || 0,
    quantidade:     best.quantidade!,
    preco_unitario: best.preco_unitario!,
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function getCellStr(row: ExcelJS.Row, col: number): string {
  if (!col) return ''
  const cell = row.getCell(col)
  const val  = cell.value
  if (val === null || val === undefined) return ''
  if (typeof val === 'object' && val !== null && 'richText' in (val as object)) {
    return ((val as any).richText as Array<{text: string}>).map((rt) => rt.text).join('')
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
