import ExcelJS from 'exceljs'

export interface CustoERP {
  tipo_lancamento: 'A_PAGAR' | 'A_RECEBER'
  tipo_documento: string
  numero_documento: string | null
  serie: string | null
  fornecedor: string | null
  cnpj_fornecedor: string | null
  valor_total: number
  valor_desconto: number
  valor_liquido: number
  data_emissao: string | null
  data_vencimento: string | null
  data_pagamento: string | null
  centro_custo: string | null
  conta_contabil: string | null
  categoria: string | null
  descricao: string | null
  status_pagamento: 'PENDENTE' | 'PAGO' | 'VENCIDO' | 'CANCELADO' | 'PARCIAL' | 'VENCENDO'
  id_erp: string | null
  ref_lancamento: string | null
}

const STATUS_MAP: Record<string, CustoERP['status_pagamento']> = {
  '3': 'PAGO', '40': 'VENCIDO', '29': 'VENCENDO', '18': 'CANCELADO', '15': 'PARCIAL', '56': 'PENDENTE',
}

export async function importarCustosERP(file: File): Promise<CustoERP[]> {
  const buffer = await file.arrayBuffer()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  let ws: ExcelJS.Worksheet | null = null
  let maxRows = 0
  wb.eachSheet(sheet => { if (sheet.rowCount > maxRows) { maxRows = sheet.rowCount; ws = sheet } })
  if (!ws) throw new Error('Planilha sem abas válidas')
  return parseCustos(ws as ExcelJS.Worksheet)
}

interface ColMap {
  natureza: number; data_emissao: number; centro_custo: number; status_img: number
  ref_lanc: number; nome: number; valor: number; num_doc: number; historico: number
  cnpj: number; data_venc: number; data_pgto: number; valor_desc: number; serie: number
  _headerRow: number
}

const COL_KW: Record<keyof Omit<ColMap,'_headerRow'>, string[]> = {
  natureza:     ['imagem - natureza','natureza'],
  data_emissao: ['data de emissão','data de emissao'],
  centro_custo: ['centro de custo'],
  status_img:   ['imagem - status'],
  ref_lanc:     ['ref. lançamento','ref. lancamento','ref lançamento'],
  nome:         ['nome'],
  valor:        ['valor original'],
  num_doc:      ['número do documento','numero do documento'],
  historico:    ['histórico','historico'],
  cnpj:         ['cnpj/cpf','cnpj'],
  data_venc:    ['data de vencimento'],
  data_pgto:    ['data de pagamento'],
  valor_desc:   ['valor do desconto'],
  serie:        ['série do documento','serie do documento'],
}

function detectarColunas(ws: ExcelJS.Worksheet): ColMap | null {
  let bestRow=0, bestMap: Partial<Omit<ColMap,'_headerRow'>>={}, bestScore=0
  ws.eachRow((row, ri) => {
    if (ri > 10) return
    const c: Partial<Omit<ColMap,'_headerRow'>> = {}; let s = 0
    row.eachCell({ includeEmpty: false }, (cell, ci) => {
      const v = String(cell.value??'').toLowerCase().replace(/\n/g,' ').replace(/\s+/g,' ').trim()
      if (!v) return
      for (const [k, kws] of Object.entries(COL_KW) as [keyof typeof COL_KW, string[]][]) {
        if (c[k]) continue
        if (kws.some(w => v === w || v.startsWith(w))) { c[k] = ci; s++ }
      }
    })
    if (s > bestScore) { bestScore=s; bestMap=c; bestRow=ri }
  })
  if (!bestMap.valor && !bestMap.nome) return null
  const m = bestMap
  return { _headerRow:bestRow, natureza:m.natureza||0, data_emissao:m.data_emissao||0,
    centro_custo:m.centro_custo||0, status_img:m.status_img||0, ref_lanc:m.ref_lanc||0,
    nome:m.nome||0, valor:m.valor||0, num_doc:m.num_doc||0, historico:m.historico||0,
    cnpj:m.cnpj||0, data_venc:m.data_venc||0, data_pgto:m.data_pgto||0,
    valor_desc:m.valor_desc||0, serie:m.serie||0 }
}

function parseCustos(ws: ExcelJS.Worksheet): CustoERP[] {
  const cm = detectarColunas(ws)
  if (!cm) throw new Error('Colunas não identificadas. Necessário: "Valor Original" e "Nome".')
  const custos: CustoERP[] = []
  ws.eachRow((row, ri) => {
    if (ri <= cm._headerRow) return
    const valor = getNum(row, cm.valor)
    if (valor === null || valor === 0) return
    const nome = getStr(row, cm.nome)
    if (!nome) return
    const stCode = String(getStr(row, cm.status_img)||'').trim()
    const natCode = String(getStr(row, cm.natureza)||'2').trim()
    const hist = getStr(row, cm.historico)
    const vDesc = getNum(row, cm.valor_desc) ?? 0
    custos.push({
      tipo_lancamento: natCode === '1' ? 'A_RECEBER' : 'A_PAGAR',
      tipo_documento: 'OUTROS',
      numero_documento: getStr(row, cm.num_doc) || null,
      serie: getStr(row, cm.serie) || null,
      fornecedor: nome,
      cnpj_fornecedor: getStr(row, cm.cnpj) || null,
      valor_total: Math.abs(valor),
      valor_desconto: Math.abs(vDesc),
      valor_liquido: Math.abs(valor) - Math.abs(vDesc),
      data_emissao: getDate(row, cm.data_emissao),
      data_vencimento: getDate(row, cm.data_venc),
      data_pagamento: getDate(row, cm.data_pgto),
      centro_custo: getStr(row, cm.centro_custo) || null,
      conta_contabil: null,
      categoria: categorizar(hist, nome),
      descricao: hist || nome,
      status_pagamento: STATUS_MAP[stCode] || 'PENDENTE',
      id_erp: getStr(row, cm.ref_lanc) || null,
      ref_lancamento: getStr(row, cm.ref_lanc) || null,
    })
  })
  return custos
}

function categorizar(h: string|null, n: string|null): string {
  const t = ((h||'')+ ' '+(n||'')).toLowerCase()
  if (t.match(/material|cimento|areia|ferro|tijolo|constru[çc]/)) return 'Material'
  if (t.match(/mão de obra|mao de obra|salário|folha/)) return 'Mão de Obra'
  if (t.match(/aluguel|loca[çc]|equipamento|betoneira|andaime/)) return 'Equipamento'
  if (t.match(/combust[ií]vel|abastecimento|gasolina|diesel/)) return 'Combustível'
  if (t.match(/alimenta[çc]|refei[çc]|marmita/)) return 'Alimentação'
  if (t.match(/frete|transporte/)) return 'Transporte'
  if (t.match(/energia|cosern|energética/)) return 'Energia'
  return 'Outros'
}

function getStr(row: ExcelJS.Row, col: number): string {
  if (!col) return ''
  const v = row.getCell(col).value
  if (v===null||v===undefined) return ''
  if (typeof v==='object'&&'richText' in (v as any)) return ((v as any).richText as {text:string}[]).map(r=>r.text).join('')
  return String(v).trim()
}
function getNum(row: ExcelJS.Row, col: number): number|null {
  if (!col) return null
  const v = row.getCell(col).value
  if (v===null||v===undefined||v==='') return null
  if (typeof v==='number') return v
  const n = Number(String(v).replace(/[R$\s.]/g,'').replace(',','.'))
  return isNaN(n)?null:n
}
function getDate(row: ExcelJS.Row, col: number): string|null {
  if (!col) return null
  const v = row.getCell(col).value
  if (!v) return null
  if (v instanceof Date) return v.toISOString().split('T')[0]
  const s = String(v).trim()
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0,10)
  return null
}
