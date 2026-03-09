import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import { Contrato, Medicao, Servico, LinhaMemoria } from '../types'
import {
  calcPrecoComDesconto, calcPrecoComBDI, calcPrecoTotal,
  calcResumoServico, calcValoresMedicao, valorPorExtenso,
} from './calculations'

// ─── CORES ────────────────────────────────────────────────────────────────────
const AZUL_ESCURO    = '1F3864'
const AZUL_MEDIO     = '2E75B6'
const AZUL_CLARO     = 'BDD7EE'
const AZUL_CABEC     = 'DEEAF1'
const CINZA_SUB      = 'D9D9D9'
const VERDE_OK       = '70AD47'
const LARANJA_DEST   = 'ED7D31'

const fBranca   = (sz = 9) => ({ color: { argb: 'FFFFFFFF' }, bold: true,  size: sz, name: 'Arial Narrow' })
const fNegrita  = (sz = 9) => ({ bold: true,  size: sz, name: 'Arial Narrow' })
const fNormal   = (sz = 9) => ({ bold: false, size: sz, name: 'Arial Narrow' })
const fLaranja  = (sz = 9) => ({ bold: true,  size: sz, name: 'Arial Narrow', color: { argb: `FF${LARANJA_DEST}` } })

function fill(hex: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${hex}` } }
}

function borda(estilo: 'thin' | 'medium' = 'thin'): Partial<ExcelJS.Borders> {
  const s = { style: estilo as ExcelJS.BorderStyle }
  return { top: s, bottom: s, left: s, right: s }
}

function al(h: ExcelJS.Alignment['horizontal'], v: ExcelJS.Alignment['vertical'] = 'middle'): Partial<ExcelJS.Alignment> {
  return { horizontal: h, vertical: v, wrapText: true }
}

function cel(
  ws: ExcelJS.Worksheet, addr: string, value: ExcelJS.CellValue,
  opts?: { fill?: ExcelJS.Fill; font?: any; align?: any; border?: any; numFmt?: string }
) {
  const c = ws.getCell(addr)
  c.value = value
  if (opts?.fill)   c.fill        = opts.fill
  if (opts?.font)   c.font        = opts.font
  if (opts?.align)  c.alignment   = opts.align
  if (opts?.border) c.border      = opts.border
  if (opts?.numFmt) c.numFmt      = opts.numFmt
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

export async function gerarMedicaoExcel(
  contrato: Contrato,
  medicao: Medicao,
  servicos: Servico[],
  linhasPorServico: Map<string, LinhaMemoria[]>,
  logoBase64?: string | null
): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'MediObras'
  wb.created = new Date()

  await gerarAbaMED(wb, contrato, medicao, servicos, linhasPorServico, logoBase64)
  await gerarAbaMEM(wb, contrato, medicao, servicos, linhasPorServico)

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const nome = `${contrato.nome_obra.replace(/\s+/g, '_')}_${medicao.numero_extenso}_MEDICAO.xlsx`
  saveAs(blob, nome)
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA MED
// ═══════════════════════════════════════════════════════════════════════════════

async function gerarAbaMED(
  wb: ExcelJS.Workbook,
  contrato: Contrato,
  medicao: Medicao,
  servicos: Servico[],
  linhasPorServico: Map<string, LinhaMemoria[]>,
  logoBase64?: string | null
) {
  const ws = wb.addWorksheet(`MED ${String(medicao.numero).padStart(2, '0')}`)

  // Larguras
  const larguras = [6, 14, 14, 48, 6, 10, 13, 13, 13, 14, 8,
                    10, 12, 12, 12, 12, 13, 13, 13, 13, 13, 13, 8]
  larguras.forEach((w, i) => ws.getColumn(i + 1).width = w)

  // ── CABEÇALHO REDESENHADO ─────────────────────────────────────────────────

  // Linha 1 — barra de cor sólida no topo (decorativa)
  ws.getRow(1).height = 8
  for (let c = 1; c <= 23; c++) {
    ws.getCell(1, c).fill = fill(LARANJA_DEST)
  }

  // Linha 2-5 — área do cabeçalho principal
  ws.getRow(2).height = 36
  ws.getRow(3).height = 20
  ws.getRow(4).height = 20
  ws.getRow(5).height = 16

  // Bloco esquerdo: logo (A2:C5)
  ws.mergeCells('A2:C5')
  ws.getCell('A2').fill = fill('FFFFFF')
  ws.getCell('A2').border = { bottom: { style: 'medium', color: { argb: `FF${AZUL_ESCURO}` } } }

  // Se tiver logo, embutir imagem
  if (logoBase64) {
    try {
      const base64Data = logoBase64.split(',')[1] || logoBase64
      const mimeMatch = logoBase64.match(/data:([^;]+);/)
      const ext = mimeMatch?.[1]?.includes('png') ? 'png' : 'jpeg'
      const imageId = wb.addImage({ base64: base64Data, extension: ext as 'png' | 'jpeg' })
      ws.addImage(imageId, {
        tl: { col: 0, row: 1 },
        br: { col: 3, row: 5 },
        editAs: 'oneCell',
      })
    } catch (e) {
      // logo falhou, deixa vazio
    }
  } else {
    // Sem logo: coloca texto da empresa
    cel(ws, 'A2', contrato.empresa_executora, {
      font: { ...fNegrita(10), color: { argb: `FF${AZUL_ESCURO}` } },
      align: al('center'),
    })
  }

  // Bloco central: órgão (D2:T5)
  ws.mergeCells('D2:T2')
  ws.mergeCells('D3:T3')
  ws.mergeCells('D4:T4')
  ws.mergeCells('D5:T5')

  cel(ws, 'D2', contrato.orgao_nome, {
    font: fBranca(11),
    fill: fill(AZUL_ESCURO),
    align: al('center'),
    border: borda('medium'),
  })
  cel(ws, 'D3', contrato.orgao_subdivisao || '', {
    font: fBranca(9),
    fill: fill(AZUL_MEDIO),
    align: al('center'),
  })
  cel(ws, 'D4', `OBRA: ${contrato.nome_obra}  |  LOCAL: ${contrato.local_obra}`, {
    font: fNegrita(9),
    fill: fill(AZUL_CABEC),
    align: al('center'),
    border: { bottom: { style: 'thin' } },
  })
  cel(ws, 'D5', `Contrato: ${contrato.numero_contrato || '—'}  |  Empresa: ${contrato.empresa_executora}`, {
    font: fNormal(8),
    fill: fill(AZUL_CABEC),
    align: al('center'),
  })

  // Bloco direito: dados da medição (U2:W5)
  ws.mergeCells('U2:W2')
  ws.mergeCells('U3:W3')
  ws.mergeCells('U4:W4')
  ws.mergeCells('U5:W5')

  cel(ws, 'U2', `${medicao.numero_extenso} MEDIÇÃO`, {
    font: { ...fBranca(14) },
    fill: fill(LARANJA_DEST),
    align: al('center'),
    border: borda('medium'),
  })
  cel(ws, 'U3', `Data: ${medicao.data_medicao ? new Date(medicao.data_medicao + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}`, {
    font: fNormal(8),
    fill: fill(AZUL_CABEC),
    align: al('center'),
  })
  cel(ws, 'U4', `Desc: ${(contrato.desconto_percentual * 100).toFixed(2)}%  |  BDI: ${(contrato.bdi_percentual * 100).toFixed(2)}%`, {
    font: fNormal(8),
    fill: fill(AZUL_CABEC),
    align: al('center'),
  })
  cel(ws, 'U5', `${contrato.data_base_planilha || ''}  |  Prazo: ${contrato.prazo_execucao_dias}d`, {
    font: fNormal(8),
    fill: fill(AZUL_CABEC),
    align: al('center'),
  })

  // ── Linha 6: divisor PLANILHA BASE / PLANILHA DE MEDIÇÃO ─────────────────
  ws.getRow(6).height = 16
  ws.mergeCells('A6:K6')
  ws.mergeCells('L6:W6')
  cel(ws, 'A6', 'PLANILHA BASE', {
    font: fBranca(9), fill: fill(AZUL_ESCURO), align: al('center'), border: borda(),
  })
  cel(ws, 'L6', 'PLANILHA DE MEDIÇÃO', {
    font: fBranca(9), fill: fill(AZUL_MEDIO), align: al('center'), border: borda(),
  })

  // ── Linhas 7/8: Headers colunas ──────────────────────────────────────────
  ws.getRow(7).height = 28
  ws.getRow(8).height = 30

  const h7: [string, string][] = [
    ['A7','ITEM'],['B7','FONTE'],['C7','CÓDIGO'],['D7','DESCRIÇÃO'],
    ['E7','UNID'],['F7','QUANTIDADE'],['G7','PREÇO\nUNITÁRIO R$'],
    ['J7','PREÇO\nTOTAL R$'],['K7','PESO (%)'],
    ['L7','QUANTIDADES'],['Q7','PREÇOS R$'],
  ]
  const h8: [string, string][] = [
    ['G8','SINAPI'],['H8',`C/ DESCONTO\n(${(contrato.desconto_percentual*100).toFixed(2)}%)`],
    ['I8','C/ BDI'],
    ['L8','PREVISTO'],['M8','ANTERIOR\nACUMULADA'],['N8','MEDIDA NO\nPERIODO'],
    ['O8','ACUMULADO'],['P8','SALDO\nCONTRATO'],
    ['Q8','UNITÁRIO'],['R8','UNIT.\nC/ BDI'],
    ['S8','ANT.\nACUMULADO'],['T8','ACUMULADO'],['U8','NO PERIODO'],
    ['V8','SALDO\nCONTRATO'],['W8','SALDO (%)'],
  ]

  h7.forEach(([addr, val]) => cel(ws, addr, val, {
    font: fBranca(8), fill: fill(AZUL_ESCURO), align: al('center'), border: borda(),
  }))
  h8.forEach(([addr, val]) => cel(ws, addr, val, {
    font: fBranca(8), fill: fill(AZUL_MEDIO), align: al('center'), border: borda(),
  }))

  // ── Dados ─────────────────────────────────────────────────────────────────
  let row = 9
  const servicosOrdenados = [...servicos].sort((a, b) => a.ordem - b.ordem)

  for (const srv of servicosOrdenados) {
    const precoDesc = calcPrecoComDesconto(srv.preco_unitario, contrato.desconto_percentual)
    const precoBDI  = calcPrecoComBDI(precoDesc, contrato.bdi_percentual)
    const precoTotal = calcPrecoTotal(srv.quantidade, precoBDI)
    ws.getRow(row).height = srv.descricao.length > 80 ? 42 : 26

    if (srv.is_grupo) {
      ws.mergeCells(`D${row}:F${row}`)
      'ABCDEFGHIJKLMNOPQRSTUVW'.split('').forEach(c => {
        const cell = ws.getCell(`${c}${row}`)
        cell.fill   = fill(AZUL_CLARO)
        cell.font   = fNegrita(9)
        cell.border = borda()
      })
      ws.getCell(`A${row}`).value = srv.item
      ws.getCell(`A${row}`).alignment = al('center')
      ws.getCell(`D${row}`).value = srv.descricao
      ws.getCell(`D${row}`).alignment = al('left')
      ws.getCell(`J${row}`).value = precoTotal
      ws.getCell(`J${row}`).numFmt = '#,##0.00'
      ws.getCell(`J${row}`).alignment = al('right')
    } else {
      const linhas = linhasPorServico.get(srv.id) || []
      const { qtdAnterior, qtdPeriodo, qtdAcumulada, qtdSaldo } = calcResumoServico(srv, linhas)
      const precoBDIdemo = Math.trunc(precoDesc * 1.2452 * 100) / 100

      type ColDef = [string, ExcelJS.CellValue, string, ExcelJS.Alignment['horizontal']]
      const cols: ColDef[] = [
        ['A', srv.item,            '@',          'center'],
        ['B', srv.fonte,           '@',          'center'],
        ['C', srv.codigo || '',    '@',          'center'],
        ['D', srv.descricao,       '@',          'left'],
        ['E', srv.unidade,         '@',          'center'],
        ['F', srv.quantidade,      '#,##0.0000', 'right'],
        ['G', srv.preco_unitario,  '#,##0.00',   'right'],
        ['H', precoDesc,           '#,##0.00',   'right'],
        ['I', precoBDI,            '#,##0.00',   'right'],
        ['J', precoTotal,          '#,##0.00',   'right'],
        ['K', 0,                   '0.00%',      'right'],
        ['L', srv.quantidade,      '#,##0.0000', 'right'],
        ['M', qtdAnterior,         '#,##0.0000', 'right'],
        ['N', qtdPeriodo,          '#,##0.0000', 'right'],
        ['O', qtdAcumulada,        '#,##0.0000', 'right'],
        ['P', qtdSaldo,            '#,##0.0000', 'right'],
        ['Q', precoDesc,           '#,##0.00',   'right'],
        ['R', precoBDIdemo,        '#,##0.00',   'right'],
        ['S', qtdAnterior * precoBDIdemo,  '#,##0.00', 'right'],
        ['T', qtdAcumulada * precoBDIdemo, '#,##0.00', 'right'],
        ['U', qtdPeriodo * precoBDIdemo,   '#,##0.00', 'right'],
        ['V', precoTotal - qtdAcumulada * precoBDIdemo, '#,##0.00', 'right'],
        ['W', precoTotal > 0 ? (precoTotal - qtdAcumulada * precoBDIdemo) / precoTotal : 0, '0.00%', 'right'],
      ]

      // Zebra nas linhas de serviço
      const rowFill = row % 2 === 0 ? fill('F2F7FC') : fill('FFFFFF')

      cols.forEach(([col, val, fmt, align]) => {
        const c = ws.getCell(`${col}${row}`)
        c.value     = val
        c.numFmt    = fmt
        c.font      = fNormal(8)
        c.fill      = rowFill
        c.border    = borda()
        c.alignment = al(align)
      })

      // Destaque na coluna N (medida no período)
      const cN = ws.getCell(`N${row}`)
      if (qtdPeriodo > 0) {
        cN.fill = fill('FFF2CC')
        cN.font = fNegrita(8)
      }

      // Verde se 100% executado
      if (qtdAcumulada >= srv.quantidade && srv.quantidade > 0) {
        ws.getCell(`W${row}`).fill = fill(VERDE_OK)
        ws.getCell(`W${row}`).font = fBranca(8)
      }
    }
    row++
  }

  // ── Linha de totais ──────────────────────────────────────────────────────
  const rowTotal = row
  ws.getRow(rowTotal).height = 22
  ws.mergeCells(`A${rowTotal}:I${rowTotal}`)

  cel(ws, `A${rowTotal}`, 'TOTAIS GERAIS DO ORÇAMENTO', {
    font: fBranca(10), fill: fill(AZUL_ESCURO), align: al('center'), border: borda('medium'),
  })

  const vals = calcValoresMedicao(servicos, linhasPorServico, contrato)

  const totaisCols: [string, number][] = [
    [`J${rowTotal}`, vals.totalOrcamento],
    [`T${rowTotal}`, vals.valorAcumulado],
    [`U${rowTotal}`, vals.valorPeriodo],
    [`V${rowTotal}`, vals.valorSaldo],
  ]
  totaisCols.forEach(([addr, val]) => {
    cel(ws, addr, val, {
      font: fBranca(9), fill: fill(AZUL_ESCURO), align: al('right'),
      border: borda('medium'), numFmt: '#,##0.00',
    })
  })

  // ── Extenso ──────────────────────────────────────────────────────────────
  const rowExt = rowTotal + 2
  ws.mergeCells(`A${rowExt}:W${rowExt}`)
  ws.getRow(rowExt).height = 24
  cel(ws, `A${rowExt}`,
    `A presente medição importa o valor de: ${valorPorExtenso(vals.valorPeriodo).toUpperCase()} — ${
      new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(vals.valorPeriodo)
    }`,
    { font: fNegrita(10), fill: fill('FFF8E7'), align: al('left'), border: { bottom: { style: 'medium', color: { argb: `FF${LARANJA_DEST}` } } } }
  )

  // ── Demonstrativo ────────────────────────────────────────────────────────
  const rowDemo = rowExt + 3
  ws.getRow(rowDemo - 1).height = 18

  ws.mergeCells(`A${rowDemo - 1}:E${rowDemo - 1}`)
  cel(ws, `A${rowDemo - 1}`, 'DEMONSTRATIVO FINANCEIRO', {
    font: fBranca(10), fill: fill(AZUL_ESCURO), align: al('center'), border: borda('medium'),
  })

  const demo = [
    ['VALOR TOTAL DO ORÇAMENTO GERAL',     vals.totalOrcamento,       '#,##0.00'],
    [`VALOR ${medicao.numero_extenso} MEDIÇÃO (R$)`, vals.valorPeriodo, '#,##0.00'],
    ['PERCENTUAL DA MEDIÇÃO',              vals.percentualPeriodo,    '0.00%'],
    ['FATURADO ACUMULADO',                 vals.valorAcumulado,       '#,##0.00'],
    ['PERCENTUAL FATURADO ACUMULADO',      vals.percentualAcumulado,  '0.00%'],
    ['SALDO DO CONTRATO',                  vals.valorSaldo,           '#,##0.00'],
    ['PERCENTUAL DO SALDO',                vals.percentualSaldo,      '0.00%'],
  ] as [string, number, string][]

  demo.forEach(([label, val, fmt], i) => {
    const r = rowDemo + i
    ws.getRow(r).height = 16
    ws.mergeCells(`A${r}:D${r}`)
    const bgRow = i % 2 === 0 ? fill('EBF3FB') : fill('FFFFFF')
    cel(ws, `A${r}`, label, {
      font: fNormal(9), fill: bgRow, align: al('left'), border: borda(),
    })
    cel(ws, `E${r}`, val, {
      font: fNegrita(9), fill: bgRow, align: al('right'), border: borda(), numFmt: fmt,
    })
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA MEM
// ═══════════════════════════════════════════════════════════════════════════════

async function gerarAbaMEM(
  wb: ExcelJS.Workbook,
  contrato: Contrato,
  medicao: Medicao,
  servicos: Servico[],
  linhasPorServico: Map<string, LinhaMemoria[]>
) {
  const ws = wb.addWorksheet(`MEM ${String(medicao.numero).padStart(2, '0')}`)
  const larguras = [8, 38, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 14, 22]
  larguras.forEach((w, i) => ws.getColumn(i + 1).width = w)

  // Cabeçalho
  ws.getRow(1).height = 8
  for (let c = 1; c <= 14; c++) ws.getCell(1, c).fill = fill(LARANJA_DEST)

  ws.mergeCells('A2:N2'); ws.getRow(2).height = 30
  ws.mergeCells('A3:N3'); ws.getRow(3).height = 16
  ws.mergeCells('A4:N4'); ws.getRow(4).height = 14
  ws.mergeCells('A5:N5'); ws.getRow(5).height = 20

  cel(ws, 'A2', contrato.orgao_nome,              { font: fBranca(11), fill: fill(AZUL_ESCURO), align: al('center') })
  cel(ws, 'A3', contrato.orgao_subdivisao || '',   { font: fBranca(9),  fill: fill(AZUL_MEDIO),  align: al('center') })
  cel(ws, 'A4', contrato.nome_obra,               { font: fNegrita(9), fill: fill(AZUL_CABEC),  align: al('center') })
  cel(ws, 'A5', 'MEMÓRIA DE CÁLCULO',             { font: { ...fBranca(12) }, fill: fill(AZUL_ESCURO), align: al('center') })

  // Headers MEM
  ws.getRow(7).height = 28
  const headersMEM = ['ITEM','DESCRIÇÃO','Larg.','Comp.','Altura','Perim.','Área','Vol.','Kg','Outros','Desc.','Qtde','TOTAL','OBSERVAÇÃO']
  headersMEM.forEach((h, i) => {
    cel(ws, `${String.fromCharCode(65 + i)}7`, h, {
      font: fBranca(9), fill: fill(AZUL_ESCURO), align: al('center'), border: borda(),
    })
  })

  let row = 8
  const servicosOrdenados = servicos.filter(s => !s.is_grupo).sort((a, b) => a.ordem - b.ordem)

  for (const srv of servicosOrdenados) {
    const linhas = linhasPorServico.get(srv.id) || []

    // Título do serviço
    ws.mergeCells(`A${row}:B${row}`)
    ws.getRow(row).height = 20
    'ABCDEFGHIJKLMN'.split('').forEach(c => {
      const cell = ws.getCell(`${c}${row}`)
      cell.fill   = fill(AZUL_CLARO)
      cell.font   = fNegrita(9)
      cell.border = borda()
    })
    ws.getCell(`A${row}`).value     = srv.item
    ws.getCell(`A${row}`).alignment = al('center')
    ws.getCell(`B${row}`).value     = srv.descricao
    ws.getCell(`B${row}`).alignment = al('left')
    row++

    // Linhas de cálculo
    for (const linha of [...linhas].sort((a, b) => a.sub_item.localeCompare(b.sub_item))) {
      ws.getRow(row).height = 16

      const statusFill = linha.status === 'A pagar'
        ? fill('E2EFDA')
        : linha.status === 'Pago'
          ? fill('DDEEFF')
          : fill('FCE4D6')

      const campos: [string, ExcelJS.CellValue, string][] = [
        ['A', linha.sub_item,           '@'],
        ['B', linha.descricao_calculo,  '@'],
        ['C', linha.largura ?? null,    '#,##0.0000'],
        ['D', linha.comprimento ?? null,'#,##0.0000'],
        ['E', linha.altura ?? null,     '#,##0.0000'],
        ['F', linha.perimetro ?? null,  '#,##0.0000'],
        ['G', linha.area ?? null,       '#,##0.0000'],
        ['H', linha.volume ?? null,     '#,##0.0000'],
        ['I', linha.kg ?? null,         '#,##0.0000'],
        ['J', linha.outros ?? null,     '#,##0.0000'],
        ['K', linha.desconto_dim ?? null,'#,##0.0000'],
        ['L', linha.quantidade ?? null, '#,##0.0000'],
        ['M', linha.total,              '#,##0.0000'],
        ['N', linha.status,             '@'],
      ]

      campos.forEach(([c, v, fmt]) => {
        const cell = ws.getCell(`${c}${row}`)
        cell.value     = v
        cell.fill      = statusFill
        cell.font      = ['A','B','N'].includes(c) ? fNormal(9) : fNormal(8)
        cell.border    = borda()
        cell.numFmt    = fmt
        cell.alignment = al(['A','B','N'].includes(c) ? 'left' : 'right')
        if (c === 'M') cell.font = fNegrita(9)
      })
      row++
    }

    // Totalizadores
    const qtdAnterior = linhas.filter(l => l.status === 'Pago').reduce((s, l) => s + l.total, 0)
    const qtdPeriodo  = linhas.filter(l => l.status === 'A pagar').reduce((s, l) => s + l.total, 0)

    const totalizadores: [string, number, ExcelJS.Fill][] = [
      ['TOTAL ACUMULADO',          qtdAnterior + qtdPeriodo, fill(CINZA_SUB)],
      ['TOTAL ACUMULADO ANTERIOR', qtdAnterior,               fill('DDEEFF')],
      ['TOTAL DO MÊS',             qtdPeriodo,                fill('FFF2CC')],
    ]

    totalizadores.forEach(([label, val, bg]) => {
      ws.getRow(row).height = 16
      ws.mergeCells(`A${row}:L${row}`)
      cel(ws, `A${row}`, label, { font: fNegrita(9), fill: bg, align: al('right'), border: borda() })
      cel(ws, `M${row}`, val,   { font: fNegrita(9), fill: bg, align: al('right'), border: borda(), numFmt: '#,##0.0000' })
      ws.getCell(`N${row}`).fill   = bg
      ws.getCell(`N${row}`).border = borda()
      row++
    })

    row++ // linha em branco
  }
}
