import ExcelJS from 'exceljs'
import { ServicoImportado } from '../types'
import { isItemGrupo, getGrupoItem } from './calculations'

/**
 * Importa um arquivo de orçamento (.xlsx) e extrai os serviços.
 *
 * Suporta dois formatos detectados automaticamente:
 *  Formato A (SEEC):   ITEM | FONTE | CÓDIGO | DESCRIÇÃO | UNID | QTD | PU
 *  Formato B (FUNDASE/RD): ITEM | CÓDIGO | DESCRIÇÃO | FONTE | UND | QTD | PU | PT
 */
export async function importarOrcamento(file: File): Promise<ServicoImportado[]> {
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
  _headerRow: number
}

// ─── PARSER PRINCIPAL ─────────────────────────────────────────────────────────

function parseServicos(ws: ExcelJS.Worksheet): ServicoImportado[] {
  const colMap = detectarColunas(ws)
  if (!colMap) {
    throw new Error(
      'Não foi possível identificar as colunas obrigatórias (ITEM, DESCRIÇÃO, QTD, PREÇO). ' +
      'Verifique se o arquivo segue o modelo esperado.'
    )
  }

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
    const precoUn  = getCellNum(row, colMap.preco_unitario) ?? 0
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
    exact:   ['código', 'codigo', 'cód', 'cod'],
    partial: ['código', 'codigo'],
  },
  descricao: {
    exact:   ['descrição', 'descricao', 'especificação', 'especificacao', 'serviço', 'servico'],
    partial: ['descri'],
  },
  unidade: {
    // Match EXATO — evita pegar "unitário"
    exact:   ['unid', 'und', 'un', 'unidade', 'unid.'],
    partial: [],
  },
  quantidade: {
    exact:   ['quantidade', 'qtd', 'qtde', 'quant.', 'quant'],
    partial: ['quantid', 'qtd'],
  },
  preco_unitario: {
    exact:   ['preço unitário', 'preco unitario', 'valor unitário', 'valor unitario',
              'pu', 'p.u.', 'preço unit.'],
    partial: ['unitário', 'unitario'],
  },
}

function detectarColunas(ws: ExcelJS.Worksheet): ColMap | null {
  let melhorLinha = 0
  let melhorMapa: Partial<Omit<ColMap, '_headerRow'>> = {}
  let melhorPontos = 0

  ws.eachRow((row, rowIndex) => {
    if (rowIndex > 30) return

    const candidato: Partial<Omit<ColMap, '_headerRow'>> = {}
    let pontos = 0

    row.eachCell({ includeEmpty: false }, (cell, colIndex) => {
      // Normaliza: minúsculas, remove quebras de linha e espaços duplos
      const val = String(cell.value ?? '')
        .toLowerCase()
        .replace(/\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()

      if (!val) return

      for (const [key, rules] of Object.entries(KEYWORDS) as [keyof typeof KEYWORDS, typeof KEYWORDS[keyof typeof KEYWORDS]][]) {
        // Já encontrou essa coluna com score melhor? Pula
        if (candidato[key]) continue

        // Match exato tem prioridade máxima
        if (rules.exact.some(w => val === w)) {
          candidato[key] = colIndex
          pontos += 3
          continue
        }

        // Match parcial — mas NÃO para 'unidade' (evita "unitário")
        if (key !== 'unidade' && rules.partial.some(w => val.includes(w))) {
          candidato[key] = colIndex
          pontos += 1
        }
      }
    })

    if (pontos > melhorPontos) {
      melhorPontos = pontos
      melhorMapa   = candidato
      melhorLinha  = rowIndex
    }
  })

  const required: (keyof Omit<ColMap, '_headerRow'>)[] = ['item', 'descricao', 'quantidade', 'preco_unitario']
  if (!required.every(k => melhorMapa[k])) return null

  return {
    _headerRow:     melhorLinha,
    item:           melhorMapa.item!,
    fonte:          melhorMapa.fonte    || 0,
    codigo:         melhorMapa.codigo   || 0,
    descricao:      melhorMapa.descricao!,
    unidade:        melhorMapa.unidade  || 0,
    quantidade:     melhorMapa.quantidade!,
    preco_unitario: melhorMapa.preco_unitario!,
  }
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