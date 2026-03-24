import ExcelJS from 'exceljs'
import { ServicoImportado } from '../types'
import { isItemGrupo, getGrupoItem } from './calculations'

export type ModoImportacao = 'SEM_BDI' | 'COM_BDI'

export async function importarOrcamento(file: File, modo: ModoImportacao = 'SEM_BDI'): Promise<ServicoImportado[]> {
  const buffer = await file.arrayBuffer()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  let ws: ExcelJS.Worksheet | null = null
  let maxRows = 0
  wb.eachSheet(sheet => { if (sheet.rowCount > maxRows) { maxRows = sheet.rowCount; ws = sheet } })
  if (!ws) throw new Error('Planilha sem abas válidas')
  return parseServicos(ws as ExcelJS.Worksheet, modo)
}

interface ColMap {
  item: number; fonte: number; codigo: number; descricao: number
  unidade: number; quantidade: number; preco_unitario: number
  preco_total: number; _headerRow: number
}

function parseServicos(ws: ExcelJS.Worksheet, modo: ModoImportacao): ServicoImportado[] {
  const colMap = detectarColunas(ws)
  if (!colMap) throw new Error('Não foi possível identificar as colunas obrigatórias (ITEM, DESCRIÇÃO, QTD, PREÇO).')
  if (modo === 'COM_BDI' && !colMap.preco_total) throw new Error('Modo COM BDI requer coluna de PREÇO TOTAL na planilha.')

  const servicos: ServicoImportado[] = []
  let ordem = 0
  ws.eachRow((row, rowIndex) => {
    if (rowIndex <= colMap._headerRow) return
    const item = getCellStr(row, colMap.item)
    const descricao = getCellStr(row, colMap.descricao)
    if (!item || !descricao) return
    const itemLower = item.toLowerCase()
    if (itemLower.includes('total') || itemLower.includes('valor')) return
    if (!/^\d+(\.\d+)*$/.test(item.trim())) return

    const fonte = getCellStr(row, colMap.fonte) || 'SINAPI'
    const codigo = getCellStr(row, colMap.codigo)
    const unidade = getCellStr(row, colMap.unidade) || 'UN'
    const qtd = getCellNum(row, colMap.quantidade) ?? 0
    const precoUn = getCellNum(row, colMap.preco_unitario) ?? 0
    const precoTot = colMap.preco_total ? (getCellNum(row, colMap.preco_total) ?? 0) : 0
    const grupo = isItemGrupo(item)

    servicos.push({
      item: item.trim(), fonte: fonte.trim(), codigo: codigo?.trim() || '',
      descricao: descricao.trim(), unidade: unidade.trim(),
      quantidade: grupo ? 0 : qtd,
      preco_unitario: grupo ? 0 : precoUn,
      is_grupo: grupo,
      grupo_item: grupo ? null : getGrupoItem(item) || null,
      ordem: ordem++,
      preco_total_fixo: (modo === 'COM_BDI' && !grupo && precoTot > 0) ? precoTot : null,
    })
  })
  return servicos
}

const KEYWORDS: Record<keyof Omit<ColMap, '_headerRow'>, { exact: string[]; partial: string[] }> = {
  item:           { exact: ['item'], partial: [] },
  fonte:          { exact: ['fonte', 'referencia', 'referência', 'tabela', 'própria', 'propria'], partial: ['fonte'] },
  codigo:         { exact: ['código', 'codigo', 'cód', 'cod', 'cód.'], partial: ['código', 'codigo'] },
  descricao:      { exact: ['descrição', 'descricao', 'especificação', 'especificacao', 'serviço', 'servico', 'discriminação', 'discriminacao'], partial: ['descri', 'discrimin'] },
  unidade:        { exact: ['unid', 'und', 'un', 'unidade', 'unid.'], partial: [] },
  quantidade:     { exact: ['quantidade', 'qtd', 'qtde', 'quant.', 'quant', 'quantid e', 'quantidad e'], partial: ['quantid', 'qtd'] },
  preco_unitario: { exact: ['preço unitário', 'preco unitario', 'valor unitário', 'valor unitario', 'pu', 'p.u.', 'preço unit.', 'preço unitário r$', 'preco unitario r$'], partial: ['unitário', 'unitario', 'preço unit'] },
  preco_total:    { exact: ['preço total', 'preco total', 'valor total', 'total r$', 'pt', 'p.t.', 'preço total r$', 'preco total r$', 'preço total com bdi'], partial: ['preço total', 'preco total'] },
}

function detectarColunas(ws: ExcelJS.Worksheet): ColMap | null {
  let melhorLinha = 0, melhorMapa: Partial<Omit<ColMap, '_headerRow'>> = {}, melhorScore = 0
  ws.eachRow((row, rowIndex) => {
    if (rowIndex > 40) return
    const candidato: Partial<Omit<ColMap, '_headerRow'>> = {}
    let pontosExato = 0, pontosParcial = 0
    row.eachCell({ includeEmpty: false }, (cell, colIndex) => {
      const raw = cell.value
      if (typeof raw === 'number' || raw instanceof Date) return
      const val = String(raw ?? '').toLowerCase().replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
      if (!val || val.length > 80) return
      for (const [key, rules] of Object.entries(KEYWORDS) as [keyof typeof KEYWORDS, typeof KEYWORDS[keyof typeof KEYWORDS]][]) {
        if (candidato[key]) continue
        if (key === 'preco_total' && (val.includes('unitário') || val.includes('unitario'))) continue
        if (rules.exact.some(w => val === w)) { candidato[key] = colIndex; pontosExato += 3; continue }
        if (key !== 'unidade' && rules.partial.some(w => val.includes(w))) { candidato[key] = colIndex; pontosParcial += 1 }
      }
    })
    const required: (keyof Omit<ColMap, '_headerRow'>)[] = ['item', 'descricao', 'quantidade', 'preco_unitario']
    const nObrig = required.filter(k => candidato[k]).length
    const score = nObrig * 100 + Object.keys(candidato).length * 10 + pontosExato + pontosParcial
    if (score > melhorScore) { melhorScore = score; melhorMapa = candidato; melhorLinha = rowIndex }
  })
  const required: (keyof Omit<ColMap, '_headerRow'>)[] = ['item', 'descricao', 'quantidade', 'preco_unitario']
  if (!required.every(k => melhorMapa[k])) return null
  let headerRow = melhorLinha
  for (let offset = 1; offset <= 5; offset++) {
    const nextRow = ws.getRow(headerRow + offset)
    if (!nextRow) break
    const itemVal = String(nextRow.getCell(melhorMapa.item!).value ?? '').trim()
    if (/^\d+(\.\d+)*$/.test(itemVal)) { headerRow = headerRow + offset - 1; break }
  }
  return {
    _headerRow: headerRow, item: melhorMapa.item!, fonte: melhorMapa.fonte || 0,
    codigo: melhorMapa.codigo || 0, descricao: melhorMapa.descricao!, unidade: melhorMapa.unidade || 0,
    quantidade: melhorMapa.quantidade!, preco_unitario: melhorMapa.preco_unitario!, preco_total: melhorMapa.preco_total || 0,
  }
}

function getCellStr(row: ExcelJS.Row, col: number): string {
  if (!col) return ''
  const cell = row.getCell(col); const val = cell.value
  if (val === null || val === undefined) return ''
  if (typeof val === 'object' && val !== null && 'richText' in (val as object))
    return ((val as any).richText as Array<{ text: string }>).map(rt => rt.text).join('')
  return String(val).trim()
}

function getCellNum(row: ExcelJS.Row, col: number): number | null {
  if (!col) return null
  const val = row.getCell(col).value
  if (val === null || val === undefined || val === '') return null
  const n = Number(val); return isNaN(n) ? null : n
}
