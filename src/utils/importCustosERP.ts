import ExcelJS from 'exceljs'

/**
 * Parser de relatórios do TOTVS RM exportados em Excel.
 *
 * Suporta 3 formatos comuns de exportação:
 *
 * Formato A — Relatório de Movimentos (TMOV):
 *   Nº Doc | Série | Fornecedor | CNPJ | Data Emissão | Valor | Centro Custo | Descrição
 *
 * Formato B — Extrato de Contas a Pagar (FLAN):
 *   Nº Título | Fornecedor | CNPJ | Emissão | Vencimento | Valor | Status | Descrição
 *
 * Formato C — Relatório genérico (detectado por keywords):
 *   Qualquer combinação que tenha pelo menos: descrição/fornecedor + valor + data
 */

export interface CustoERP {
  tipo_documento: 'NF_ENTRADA' | 'NF_SAIDA' | 'FOLHA' | 'EQUIPAMENTO' | 'SERVICO_TERCEIRO' | 'OUTROS'
  numero_documento: string | null
  serie: string | null
  fornecedor: string | null
  cnpj_fornecedor: string | null
  valor_total: number
  valor_desconto: number
  valor_liquido: number
  data_emissao: string | null       // YYYY-MM-DD
  data_vencimento: string | null    // YYYY-MM-DD
  data_pagamento: string | null     // YYYY-MM-DD
  centro_custo: string | null
  conta_contabil: string | null
  categoria: string | null
  descricao: string | null
  status_pagamento: 'PENDENTE' | 'PAGO' | 'VENCIDO' | 'CANCELADO'
  id_erp: string | null
}

export async function importarCustosERP(file: File): Promise<CustoERP[]> {
  const buffer = await file.arrayBuffer()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)

  // Escolhe a aba com mais linhas
  let ws: ExcelJS.Worksheet | null = null
  let maxRows = 0
  wb.eachSheet(sheet => {
    if (sheet.rowCount > maxRows) { maxRows = sheet.rowCount; ws = sheet }
  })

  if (!ws) throw new Error('Planilha sem abas válidas')
  return parseCustos(ws as ExcelJS.Worksheet)
}

// ─── DETECÇÃO DE COLUNAS ────────────────────────────────────────────────────

interface CustColMap {
  numero: number
  serie: number
  fornecedor: number
  cnpj: number
  data_emissao: number
  data_vencimento: number
  data_pagamento: number
  valor: number
  valor_desc: number
  valor_liq: number
  centro_custo: number
  conta: number
  descricao: number
  status: number
  tipo: number
  id_erp: number
  _headerRow: number
}

const CUST_KEYWORDS: Record<keyof Omit<CustColMap, '_headerRow'>, { exact: string[]; partial: string[] }> = {
  numero:          { exact: ['nº doc','nº documento','número','n° titulo','nº título','nº','nota fiscal','nf'], partial: ['documento','titulo','nº'] },
  serie:           { exact: ['série','serie'], partial: ['série'] },
  fornecedor:      { exact: ['fornecedor','razão social','razao social','emitente','cliente/fornecedor'], partial: ['fornecedor','razão','razao'] },
  cnpj:            { exact: ['cnpj','cnpj/cpf','cpf/cnpj'], partial: ['cnpj'] },
  data_emissao:    { exact: ['data emissão','dt emissão','emissão','data','dt. emissão','data emissao'], partial: ['emissão','emissao'] },
  data_vencimento: { exact: ['vencimento','data vencimento','dt vencimento','dt. vencimento'], partial: ['vencimento'] },
  data_pagamento:  { exact: ['pagamento','data pagamento','dt pagamento','dt. pagamento','baixa'], partial: ['pagamento','baixa'] },
  valor:           { exact: ['valor','valor total','valor bruto','vlr total','total'], partial: ['valor total','vlr total'] },
  valor_desc:      { exact: ['desconto','valor desconto','vlr desconto'], partial: ['desconto'] },
  valor_liq:       { exact: ['valor líquido','vlr líquido','valor liquido','líquido','liquido'], partial: ['líquido','liquido'] },
  centro_custo:    { exact: ['centro de custo','centro custo','cc','c.custo'], partial: ['centro custo','c.custo'] },
  conta:           { exact: ['conta contábil','conta','classificação','conta contabil'], partial: ['contábil','contabil'] },
  descricao:       { exact: ['descrição','descricao','histórico','historico','observação','obs'], partial: ['descrição','descricao','histórico'] },
  status:          { exact: ['status','situação','situacao','status pagamento'], partial: ['status','situação'] },
  tipo:            { exact: ['tipo','tipo documento','tipo mov','natureza'], partial: ['tipo doc','natureza'] },
  id_erp:          { exact: ['id','idmov','código mov','cod mov','identificador'], partial: ['idmov'] },
}

function detectarColunasCusto(ws: ExcelJS.Worksheet): CustColMap | null {
  let melhorLinha = 0
  let melhorMapa: Partial<Omit<CustColMap, '_headerRow'>> = {}
  let melhorScore = 0

  ws.eachRow((row, rowIndex) => {
    if (rowIndex > 30) return
    const candidato: Partial<Omit<CustColMap, '_headerRow'>> = {}
    let nFound = 0

    row.eachCell({ includeEmpty: false }, (cell, colIndex) => {
      const raw = cell.value
      if (typeof raw === 'number' || raw instanceof Date) return
      const val = String(raw ?? '').toLowerCase().replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
      if (!val || val.length > 60) return

      for (const [key, rules] of Object.entries(CUST_KEYWORDS) as [keyof typeof CUST_KEYWORDS, typeof CUST_KEYWORDS[keyof typeof CUST_KEYWORDS]][]) {
        if (candidato[key]) continue
        if (rules.exact.some(w => val === w || val.startsWith(w))) {
          candidato[key] = colIndex; nFound++; continue
        }
        if (rules.partial.some(w => val.includes(w))) {
          candidato[key] = colIndex; nFound++
        }
      }
    })

    const score = nFound * 10 + (candidato.valor ? 100 : 0) + (candidato.fornecedor ? 50 : 0)
    if (score > melhorScore) {
      melhorScore = score; melhorMapa = candidato; melhorLinha = rowIndex
    }
  })

  // Mínimo: precisa de valor
  if (!melhorMapa.valor && !melhorMapa.valor_liq) return null

  return {
    _headerRow:      melhorLinha,
    numero:          melhorMapa.numero || 0,
    serie:           melhorMapa.serie || 0,
    fornecedor:      melhorMapa.fornecedor || 0,
    cnpj:            melhorMapa.cnpj || 0,
    data_emissao:    melhorMapa.data_emissao || 0,
    data_vencimento: melhorMapa.data_vencimento || 0,
    data_pagamento:  melhorMapa.data_pagamento || 0,
    valor:           melhorMapa.valor || 0,
    valor_desc:      melhorMapa.valor_desc || 0,
    valor_liq:       melhorMapa.valor_liq || melhorMapa.valor || 0,
    centro_custo:    melhorMapa.centro_custo || 0,
    conta:           melhorMapa.conta || 0,
    descricao:       melhorMapa.descricao || 0,
    status:          melhorMapa.status || 0,
    tipo:            melhorMapa.tipo || 0,
    id_erp:          melhorMapa.id_erp || 0,
  }
}

// ─── PARSER ─────────────────────────────────────────────────────────────────

function parseCustos(ws: ExcelJS.Worksheet): CustoERP[] {
  const colMap = detectarColunasCusto(ws)
  if (!colMap) {
    throw new Error(
      'Não foi possível identificar as colunas do relatório. ' +
      'São necessárias pelo menos: Valor e Fornecedor/Descrição. ' +
      'Verifique se o arquivo é um relatório de movimentos ou contas a pagar do TOTVS RM.'
    )
  }

  const custos: CustoERP[] = []

  ws.eachRow((row, rowIndex) => {
    if (rowIndex <= colMap._headerRow) return

    const valor = getNum(row, colMap.valor) ?? getNum(row, colMap.valor_liq) ?? 0
    if (valor === 0) return  // Ignora linhas sem valor

    const fornecedor = getStr(row, colMap.fornecedor)
    const descricao = getStr(row, colMap.descricao)
    if (!fornecedor && !descricao) return  // Precisa de pelo menos um identificador

    const valorDesc = getNum(row, colMap.valor_desc) ?? 0
    const valorLiq = getNum(row, colMap.valor_liq) ?? (valor - Math.abs(valorDesc))

    const statusRaw = getStr(row, colMap.status)?.toLowerCase() || ''
    let statusPag: CustoERP['status_pagamento'] = 'PENDENTE'
    if (statusRaw.includes('pago') || statusRaw.includes('baixad') || statusRaw.includes('quitad')) statusPag = 'PAGO'
    else if (statusRaw.includes('vencid')) statusPag = 'VENCIDO'
    else if (statusRaw.includes('cancel')) statusPag = 'CANCELADO'

    const tipoRaw = getStr(row, colMap.tipo)?.toLowerCase() || ''
    let tipo: CustoERP['tipo_documento'] = 'OUTROS'
    if (tipoRaw.includes('entrada') || tipoRaw.includes('nf-e') || tipoRaw.includes('compra')) tipo = 'NF_ENTRADA'
    else if (tipoRaw.includes('saída') || tipoRaw.includes('saida') || tipoRaw.includes('fatura')) tipo = 'NF_SAIDA'
    else if (tipoRaw.includes('folha') || tipoRaw.includes('rh') || tipoRaw.includes('salário')) tipo = 'FOLHA'
    else if (tipoRaw.includes('equip') || tipoRaw.includes('locação') || tipoRaw.includes('locacao')) tipo = 'EQUIPAMENTO'
    else if (tipoRaw.includes('terceiro') || tipoRaw.includes('subem') || tipoRaw.includes('serviço')) tipo = 'SERVICO_TERCEIRO'

    // Categorização automática por descrição se tipo não detectado
    if (tipo === 'OUTROS' && descricao) {
      const d = descricao.toLowerCase()
      if (d.includes('cimento') || d.includes('areia') || d.includes('tijolo') || d.includes('ferro') || d.includes('material')) tipo = 'NF_ENTRADA'
      else if (d.includes('mão de obra') || d.includes('mao de obra') || d.includes('salário') || d.includes('encargo')) tipo = 'FOLHA'
      else if (d.includes('aluguel') || d.includes('locação') || d.includes('equipamento') || d.includes('betoneira') || d.includes('andaime')) tipo = 'EQUIPAMENTO'
    }

    custos.push({
      tipo_documento: tipo,
      numero_documento: getStr(row, colMap.numero) || null,
      serie: getStr(row, colMap.serie) || null,
      fornecedor: fornecedor || null,
      cnpj_fornecedor: getStr(row, colMap.cnpj) || null,
      valor_total: Math.abs(valor),
      valor_desconto: Math.abs(valorDesc),
      valor_liquido: Math.abs(valorLiq),
      data_emissao: getDate(row, colMap.data_emissao),
      data_vencimento: getDate(row, colMap.data_vencimento),
      data_pagamento: getDate(row, colMap.data_pagamento),
      centro_custo: getStr(row, colMap.centro_custo) || null,
      conta_contabil: getStr(row, colMap.conta) || null,
      categoria: tipo === 'NF_ENTRADA' ? 'Material' : tipo === 'FOLHA' ? 'Mão de Obra' : tipo === 'EQUIPAMENTO' ? 'Equipamento' : tipo === 'SERVICO_TERCEIRO' ? 'Serviço Terceiro' : 'Outros',
      descricao: descricao || fornecedor || null,
      status_pagamento: statusPag,
      id_erp: getStr(row, colMap.id_erp) || null,
    })
  })

  return custos
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

function getStr(row: ExcelJS.Row, col: number): string {
  if (!col) return ''
  const val = row.getCell(col).value
  if (val === null || val === undefined) return ''
  if (typeof val === 'object' && 'richText' in (val as any)) {
    return ((val as any).richText as Array<{ text: string }>).map(rt => rt.text).join('')
  }
  return String(val).trim()
}

function getNum(row: ExcelJS.Row, col: number): number | null {
  if (!col) return null
  const val = row.getCell(col).value
  if (val === null || val === undefined || val === '') return null
  if (typeof val === 'number') return val
  const str = String(val).replace(/[R$\s.]/g, '').replace(',', '.')
  const n = Number(str)
  return isNaN(n) ? null : n
}

function getDate(row: ExcelJS.Row, col: number): string | null {
  if (!col) return null
  const val = row.getCell(col).value
  if (!val) return null
  if (val instanceof Date) {
    return val.toISOString().split('T')[0]
  }
  const str = String(val).trim()
  // DD/MM/YYYY
  const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str
  return null
}