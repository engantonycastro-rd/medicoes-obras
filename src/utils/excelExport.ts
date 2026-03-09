import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import { Contrato, Obra, Medicao, Servico, LinhaMemoria } from '../types'
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
  obra: Obra,
  medicao: Medicao,
  servicos: Servico[],
  linhasPorServico: Map<string, LinhaMemoria[]>,
  logoBase64?: string | null
): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'MediObras'
  wb.created = new Date()

  if (contrato.tipo === 'PREFEITURA') {
    await gerarAbaBM01(wb, contrato, obra, medicao, servicos, linhasPorServico)
    await gerarAbaPREV02(wb, contrato, obra, medicao, servicos, linhasPorServico)
    await gerarAbaMEM(wb, contrato, obra, medicao, servicos, linhasPorServico, 'PREFEITURA')
  } else {
    await gerarAbaMED(wb, contrato, obra, medicao, servicos, linhasPorServico, logoBase64)
    await gerarAbaMEM(wb, contrato, obra, medicao, servicos, linhasPorServico)
  }

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const nome = `${obra.nome_obra.replace(/\s+/g, '_')}_${medicao.numero_extenso}_MEDICAO.xlsx`
  saveAs(blob, nome)
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA MED
// ═══════════════════════════════════════════════════════════════════════════════

async function gerarAbaMED(
  wb: ExcelJS.Workbook,
  contrato: Contrato,
  obra: Obra,
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
  cel(ws, 'D4', `OBRA: ${obra.nome_obra}  |  LOCAL: ${obra.local_obra}`, {
    font: fNegrita(9),
    fill: fill(AZUL_CABEC),
    align: al('center'),
    border: { bottom: { style: 'thin' } },
  })
  cel(ws, 'D5', `Contrato: ${obra.numero_contrato || '—'}  |  Empresa: ${contrato.empresa_executora}`, {
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
  cel(ws, 'U4', `Desc: ${(obra.desconto_percentual * 100).toFixed(2)}%  |  BDI: ${(obra.bdi_percentual * 100).toFixed(2)}%`, {
    font: fNormal(8),
    fill: fill(AZUL_CABEC),
    align: al('center'),
  })
  cel(ws, 'U5', `${obra.data_base_planilha || ''}  |  Prazo: ${obra.prazo_execucao_dias}d`, {
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
    ['G8','SINAPI'],['H8',`C/ DESCONTO\n(${(obra.desconto_percentual*100).toFixed(2)}%)`],
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
    const precoDesc = calcPrecoComDesconto(srv.preco_unitario, obra.desconto_percentual)
    const precoBDI  = calcPrecoComBDI(precoDesc, obra.bdi_percentual)
    const precoTotal = calcPrecoTotal(srv.quantidade, precoBDI)
    ws.getRow(row).height = srv.descricao.length > 80 ? 42 : 26

    if (srv.is_grupo) {
      ws.mergeCells(`D${row}:F${row}`)
      'ABCDEFGHIJKLMNOPQRSTUVW'.split('').forEach(c => {
        const cell = ws.getCell(`${c}${row}`)
        cell.fill   = fill(COR_LINHA_AZUL)
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
      // precoBDI já calculado com o BDI real do contrato — não usar valor fixo 1.2452
      const precoBDIdemo = precoBDI

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

  const vals = calcValoresMedicao(servicos, linhasPorServico, obra)

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
  obra: Obra,
  medicao: Medicao,
  servicos: Servico[],
  linhasPorServico: Map<string, LinhaMemoria[]>,
  palette?: 'ESTADO' | 'PREFEITURA'
) {
  const isPref = palette === 'PREFEITURA'
  // Prefeitura usa paleta do BM 01: azul escuro nos grupos, azul claro no cabeçalho, branco nos dados
  const COR_HDR_GRUPO  = isPref ? '1F497D' : AZUL_ESCURO
  const COR_HDR_CABEC  = isPref ? 'DCE6F1' : AZUL_ESCURO
  const COR_SUB_CABEC  = isPref ? 'DCE6F1' : AZUL_MEDIO
  const COR_LINHA_AZUL = isPref ? 'DCE6F1' : AZUL_CLARO
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

  cel(ws, 'A2', contrato.orgao_nome,              { font: fBranca(11), fill: fill(COR_HDR_GRUPO), align: al('center') })
  cel(ws, 'A3', contrato.orgao_subdivisao || '',   { font: fBranca(9),  fill: fill(COR_SUB_CABEC), align: al('center') })
  cel(ws, 'A4', obra.nome_obra,               { font: fNegrita(9), fill: fill(COR_LINHA_AZUL), align: al('center') })
  cel(ws, 'A5', 'MEMÓRIA DE CÁLCULO',             { font: { ...fBranca(12) }, fill: fill(COR_HDR_GRUPO), align: al('center') })

  // Headers MEM
  ws.getRow(7).height = 28
  const headersMEM = ['ITEM','DESCRIÇÃO','Larg.','Comp.','Altura','Perim.','Área','Vol.','Kg','Outros','Desc.','Qtde','TOTAL','OBSERVAÇÃO']
  headersMEM.forEach((h, i) => {
    cel(ws, `${String.fromCharCode(65 + i)}7`, h, {
      font: fBranca(9), fill: fill(COR_HDR_GRUPO), align: al('center'), border: borda(),
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

// ═══════════════════════════════════════════════════════════════════════════════
// PREFEITURAS — helpers compartilhados
// ═══════════════════════════════════════════════════════════════════════════════

function pfThin(): Partial<ExcelJS.Borders> {
  const t = { style: 'thin' as ExcelJS.BorderStyle }
  return { top: t, bottom: t, left: t, right: t }
}
function pfThinTopBot(): Partial<ExcelJS.Borders> {
  const t = { style: 'thin' as ExcelJS.BorderStyle }
  return { top: t, bottom: t }
}
function pfThinTopBotRight(): Partial<ExcelJS.Borders> {
  const t = { style: 'thin' as ExcelJS.BorderStyle }
  return { top: t, bottom: t, right: t }
}
function pfThinTopBotLeft(): Partial<ExcelJS.Borders> {
  const t = { style: 'thin' as ExcelJS.BorderStyle }
  return { top: t, bottom: t, left: t }
}

function pfFill(hex: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${hex}` } }
}

// Cores da paleta BM 01 / PREV 02 usadas na Memória de Cálculo (MEM)
const PF_CINZA_HDR  = 'D4D4D4'   // cabeçalho cinza (VALOR ACUMULADO, SALDO EM CONTRATO)
const PF_AZUL_GRUPO = '1F497D'   // linha de grupo/etapa — azul escuro
const PF_AZUL_CABEC = 'DCE6F1'   // cabeçalho da tabela — azul muito claro
const PF_BRANCO     = 'FFFFFF'

function pfSet(
  ws: ExcelJS.Worksheet,
  addr: string,
  val: ExcelJS.CellValue,
  opts?: { font?: Partial<ExcelJS.Font>; align?: Partial<ExcelJS.Alignment>; fill?: ExcelJS.Fill; border?: Partial<ExcelJS.Borders>; numFmt?: string }
) {
  const c = ws.getCell(addr)
  c.value = val
  if (opts?.font)   c.font      = opts.font  as ExcelJS.Font
  if (opts?.align)  c.alignment = opts.align as ExcelJS.Alignment
  if (opts?.fill)   c.fill      = opts.fill
  if (opts?.border) c.border    = opts.border as ExcelJS.Borders
  if (opts?.numFmt) c.numFmt    = opts.numFmt
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA BM 01  (Boletim de Medição — Prefeituras)
// ═══════════════════════════════════════════════════════════════════════════════
async function gerarAbaBM01(
  wb: ExcelJS.Workbook,
  contrato: Contrato,
  obra: Obra,
  medicao: Medicao,
  servicos: Servico[],
  linhasPorServico: Map<string, LinhaMemoria[]>
): Promise<void> {
  const ws = wb.addWorksheet('BM 01')

  // ── Fonts ──────────────────────────────────────────────────────────────────
  const f8       = (bold = false): Partial<ExcelJS.Font> => ({ name: 'Arial', size: 8, bold })
  const f6       = (bold = false): Partial<ExcelJS.Font> => ({ name: 'Arial', size: 6, bold })
  const f10bold  = (): Partial<ExcelJS.Font> => ({ name: 'Arial', size: 10, bold: true })

  // ── Alignments ─────────────────────────────────────────────────────────────
  const aC  = { horizontal: 'center', vertical: 'center', wrapText: true } as Partial<ExcelJS.Alignment>
  const aL  = { horizontal: 'left',   vertical: 'center', wrapText: true } as Partial<ExcelJS.Alignment>
  const aR  = { horizontal: 'right',  vertical: 'center', wrapText: true } as Partial<ExcelJS.Alignment>
  const aLT = { horizontal: 'left',   vertical: 'top',    wrapText: true } as Partial<ExcelJS.Alignment>

  // ── Widths — exatamente como no modelo ─────────────────────────────────────
  // A      B       C        D       E      F     G       H     I       J      K       L     M     N     O       P       Q     R
  const W = [9.33, 13.44, 59.66, 9.66, 5.11, 8.0, 7.89, 7.89, 14.55, 10.0, 11.11, 7.89, 10.0, 10.0, 11.44, 11.78, 10.0, 7.89]
  W.forEach((w, i) => { ws.getColumn(i + 1).width = w })

  // ── Row heights ────────────────────────────────────────────────────────────
  ws.getRow(1).height  = 14.4
  ws.getRow(11).height = 12
  ws.getRow(12).height = 26.4

  // ── Formatos numéricos ─────────────────────────────────────────────────────
  const N2  = '#,##0.00'
  const N4  = '#,##0.0000'
  const PCT = '0.00%'
  const DAT = 'DD/MM/YYYY'

  // ─────────────────────────────────────────────────────────────────────────
  // CABEÇALHO — rows 1–9
  // ─────────────────────────────────────────────────────────────────────────

  // A1:B9 — bloco logo (vazio)
  ws.mergeCells('A1:B9')

  // Linha 1
  ws.mergeCells('D1:G1')
  pfSet(ws, 'C1', 'CONCEDENTE',         { font: f8(),     align: aL })
  pfSet(ws, 'D1', 'Data de emissão BM', { font: f8(),     align: aL })
  ws.mergeCells('H1:I1')
  pfSet(ws, 'H1', 'Período de referência', { font: f8(), align: aL })
  ws.mergeCells('J1:L2')
  pfSet(ws, 'J1', 'VALOR DA O.S. SEM DESCONTO', { font: f8(), align: aC })
  ws.mergeCells('M1:R9')
  pfSet(ws, 'M1', [
    'RD CONSTRUTORA LTDA',
    'RUA BELA VISTA, 874, JARDINS, SÃO GONÇALO DO AMARANTE/RN',
    'CEP: 59293-576, CNPJ: 43.357.757/0001-40',
    'email: rd_solucoes@outlook.com',
    'tel.: (84) 99641-8124',
  ].join('\n'), { font: f10bold(), align: aLT })

  // Linha 2
  ws.mergeCells('D2:G2')
  pfSet(ws, 'C2', contrato.orgao_nome || '',         { font: f8(true), align: aL })
  pfSet(ws, 'D2', { formula: 'G9' } as any,          { font: f8(true), align: aL, numFmt: DAT })
  ws.mergeCells('H2:I2')
  pfSet(ws, 'H2', '', { font: f8(true), align: aL })

  // Linha 3
  ws.mergeCells('D3:I3')
  pfSet(ws, 'C3', 'CONVENETE',                    { font: f8(),     align: aL })
  pfSet(ws, 'D3', 'OBJETIVO DA ORDEM DE SERVIÇO', { font: f8(),     align: aL })

  // Linha 4–6
  ws.mergeCells('D4:I6')
  pfSet(ws, 'C4', contrato.orgao_nome || '',  { font: f8(true), align: aL })
  pfSet(ws, 'D4', obra.nome_obra || '',       { font: f8(true), align: aL })
  ws.mergeCells('C5:C6')
  pfSet(ws, 'C5', 'PROCESSO LICITATÓRIO', { font: f8(), align: aL })

  // J3:L4 — valor total OS
  ws.mergeCells('J3:L4')
  // será preenchido após iterar serviços

  // J5:L5 — VALOR ACUMULADO
  ws.mergeCells('J5:L5')
  pfSet(ws, 'J5', 'VALOR ACUMULADO', {
    font: f8(), align: aC,
    fill: pfFill(PF_CINZA_HDR),
    border: pfThin(),
  })
  // J6:L6 — valor
  ws.mergeCells('J6:L6')
  pfSet(ws, 'J6', { formula: 'SUM(P14:P10000)' } as any, {
    font: f8(true), align: aR,
    border: pfThin(), numFmt: N2,
  })

  // Linha 7
  ws.mergeCells('D7:I7')
  pfSet(ws, 'C7', 'EMPRESA CONTRATADA', { font: f8(), align: aL })
  pfSet(ws, 'D7', 'CNPJ',              { font: f8(), align: aL })
  ws.mergeCells('J7:L7')
  pfSet(ws, 'J7', 'SALDO EM CONTRATO', {
    font: f8(), align: aC,
    fill: pfFill(PF_CINZA_HDR),
    border: pfThin(),
  })

  // Linha 8
  ws.mergeCells('D8:I8')
  pfSet(ws, 'C8', contrato.empresa_executora || '', { font: f8(true), align: aL })
  pfSet(ws, 'D8', '43.357.757/0001-40',            { font: f8(true), align: aL })
  ws.mergeCells('J8:L8')
  pfSet(ws, 'J8', { formula: 'J3-J6' } as any, {
    font: f8(true), align: aR,
    border: pfThin(), numFmt: N2,
  })

  // Linha 9
  ws.mergeCells('D9:F9')
  pfSet(ws, 'C9', `BOLETIM DE MEDIÇÃO - N° ${medicao.numero}`, { font: f8(true), align: aL })
  pfSet(ws, 'D9', 'EMISSÃO DO BM', { font: f8(), align: aL })
  ws.mergeCells('G9:H9')
  pfSet(ws, 'G9',
    medicao.data_medicao ? new Date(medicao.data_medicao + 'T00:00:00') : null,
    { font: f8(true), align: aC, numFmt: DAT }
  )
  pfSet(ws, 'I9', 'VALOR (R$)', { font: f8(true), align: aC })
  ws.mergeCells('J9:L9')
  pfSet(ws, 'J9', { formula: 'SUM(O14:O10000)' } as any, {
    font: f8(true), align: aR, numFmt: N2,
  })

  // ── Row 10 vazia ────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────────────
  // CABEÇALHO DA TABELA — rows 11–12
  // ─────────────────────────────────────────────────────────────────────────
  ws.mergeCells('A11:A12')
  ws.mergeCells('B11:B12')
  ws.mergeCells('C11:C12')
  ws.mergeCells('D11:D12')
  ws.mergeCells('E11:E12')
  ws.mergeCells('F11:F12')
  ws.mergeCells('G11:H11')
  ws.mergeCells('I11:I12')
  ws.mergeCells('J11:R11')

  const hFill = pfFill(PF_AZUL_CABEC)
  const hOpts = (txt: string) => ({
    font: f6(true), align: aC, fill: hFill, border: pfThin(),
  })

  ;[
    ['A11','ITEM'], ['B11','CÓDIGO'], ['C11','DESCRIÇÃO'], ['D11','FONTE'],
    ['E11','UNID'], ['F11','QUANTIDADE'], ['G11','PREÇO UNITÁRIO R$'], ['I11','PREÇO TOTAL R$'],
  ].forEach(([addr, txt]) => pfSet(ws, addr, txt, hOpts(txt)))

  pfSet(ws, 'J11', 'PLANILHA DE MEDIÇÃO', hOpts('PLANILHA DE MEDIÇÃO'))

  ;[
    ['G12','SEM BDI'], ['H12','COM BDI'],
    ['J12','ACUMULADO ANTERIOR'], ['K12','MED. NO PERÍODO'], ['L12','(%)'],
    ['M12','ACUMULADO ATUAL (UND)'], ['N12','SALDO (UND)'],
    ['O12','MED. ATUAL (R$)'], ['P12','ACUMULADO (R$)'], ['Q12','SALDO (R$)'], ['R12','(%)'],
  ].forEach(([addr, txt]) => pfSet(ws, addr, txt, hOpts(txt as string)))

  // ─────────────────────────────────────────────────────────────────────────
  // DADOS
  // ─────────────────────────────────────────────────────────────────────────
  const grupos   = servicos.filter(s =>  s.is_grupo).sort((a,b) => a.ordem - b.ordem)
  const itens    = servicos.filter(s => !s.is_grupo)
  let row = 13
  const grupoIRows: { gRow: number; iRows: number[] }[] = []

  for (const grp of grupos) {
    ws.getRow(row).height = 14
    const gRow = row

    // Mescla B..H para título do grupo
    ws.mergeCells(`B${row}:H${row}`)

    // Bordas do grupo: A e I têm borda completa; B:H têm top+bottom+borda exterior
    pfSet(ws, `A${row}`, grp.item, {
      font: f6(true), align: { horizontal: 'left', vertical: 'center', wrapText: true } as Partial<ExcelJS.Alignment>,
      border: pfThin(),
    })
    pfSet(ws, `B${row}`, grp.descricao, {
      font: f6(true), align: aL,
      border: pfThin(),
    })
    pfSet(ws, `I${row}`, null, { border: pfThin() })
    // Colunas J..R: borda top+left na J, top no resto, top+right no R
    const thin = { style: 'thin' as ExcelJS.BorderStyle }
    ws.getCell(`J${row}`).border = { top: thin, left: thin }
    for (const col of ['K','L','M','N','O','P','Q']) {
      ws.getCell(`${col}${row}`).border = { top: thin }
    }
    ws.getCell(`R${row}`).border = { top: thin, right: thin }

    row++
    const iRows: number[] = []

    // Filhos deste grupo
    const filhos = itens.filter(s =>
      s.grupo_item === grp.item ||
      s.grupo_item === `${grp.item}.0` ||
      s.grupo_item === String(parseFloat(grp.item))
    )

    for (const srv of filhos) {
      ws.getRow(row).height = 27
      const r = row
      const linhas  = linhasPorServico.get(srv.id) || []
      const { qtdAnterior, qtdPeriodo } = calcResumoServico(srv, linhas)
      const pDesc   = calcPrecoComDesconto(srv.preco_unitario, obra.desconto_percentual)
      const pBDI    = calcPrecoComBDI(pDesc, obra.bdi_percentual)

      pfSet(ws, `A${r}`, srv.item,        { font: f6(), align: aL,  border: pfThin() })
      pfSet(ws, `B${r}`, srv.codigo,      { font: f6(), align: aC,  border: pfThin() })
      pfSet(ws, `C${r}`, srv.descricao,   { font: f6(), align: aL,  border: pfThin() })
      pfSet(ws, `D${r}`, srv.fonte,       { font: f6(), align: aC,  border: pfThin() })
      pfSet(ws, `E${r}`, srv.unidade,     { font: f6(), align: aC,  border: pfThin() })
      pfSet(ws, `F${r}`, srv.quantidade,  { font: f6(), align: aR,  border: pfThin(), numFmt: N4 })
      pfSet(ws, `G${r}`, pDesc,           { font: f6(), align: aR,  border: pfThin(), numFmt: N2 })
      pfSet(ws, `H${r}`, pBDI,            { font: f6(), align: aR,  border: pfThin(), numFmt: N2 })
      pfSet(ws, `I${r}`, pBDI * srv.quantidade, { font: f6(), align: aR, border: pfThin(), numFmt: N2 })
      pfSet(ws, `J${r}`, qtdAnterior,     { font: f6(), align: aC,  border: pfThinTopBotLeft(), numFmt: N4 })
      pfSet(ws, `K${r}`, qtdPeriodo,      { font: f6(), align: aC,  border: pfThin(), numFmt: N4 })

      // L = %  K/F
      ws.getCell(`L${r}`).value  = { formula: `IF(F${r}=0,0,K${r}/F${r})` } as any
      ws.getCell(`L${r}`).font   = f6() as ExcelJS.Font
      ws.getCell(`L${r}`).alignment = aC as ExcelJS.Alignment
      ws.getCell(`L${r}`).border = pfThin() as ExcelJS.Borders
      ws.getCell(`L${r}`).numFmt = PCT

      // M = J+K
      ws.getCell(`M${r}`).value  = { formula: `J${r}+K${r}` } as any
      ws.getCell(`M${r}`).font   = f6() as ExcelJS.Font
      ws.getCell(`M${r}`).alignment = aC as ExcelJS.Alignment
      ws.getCell(`M${r}`).border = pfThin() as ExcelJS.Borders
      ws.getCell(`M${r}`).numFmt = N4

      // N = F-M
      ws.getCell(`N${r}`).value  = { formula: `F${r}-M${r}` } as any
      ws.getCell(`N${r}`).font   = f6() as ExcelJS.Font
      ws.getCell(`N${r}`).alignment = aC as ExcelJS.Alignment
      ws.getCell(`N${r}`).border = pfThin() as ExcelJS.Borders
      ws.getCell(`N${r}`).numFmt = N4

      // O = K*H  (MED ATUAL R$)
      ws.getCell(`O${r}`).value  = { formula: `K${r}*H${r}` } as any
      ws.getCell(`O${r}`).font   = f6() as ExcelJS.Font
      ws.getCell(`O${r}`).alignment = aC as ExcelJS.Alignment
      ws.getCell(`O${r}`).border = pfThin() as ExcelJS.Borders
      ws.getCell(`O${r}`).numFmt = N2

      // P = M*H  (ACUMULADO R$)
      ws.getCell(`P${r}`).value  = { formula: `M${r}*H${r}` } as any
      ws.getCell(`P${r}`).font   = f6() as ExcelJS.Font
      ws.getCell(`P${r}`).alignment = aC as ExcelJS.Alignment
      ws.getCell(`P${r}`).border = pfThin() as ExcelJS.Borders
      ws.getCell(`P${r}`).numFmt = N2

      // Q = H*N  (SALDO R$)
      ws.getCell(`Q${r}`).value  = { formula: `H${r}*N${r}` } as any
      ws.getCell(`Q${r}`).font   = f6() as ExcelJS.Font
      ws.getCell(`Q${r}`).alignment = aC as ExcelJS.Alignment
      ws.getCell(`Q${r}`).border = pfThin() as ExcelJS.Borders
      ws.getCell(`Q${r}`).numFmt = N2

      // R = M/F  (%)
      ws.getCell(`R${r}`).value  = { formula: `IF(F${r}=0,0,M${r}/F${r})` } as any
      ws.getCell(`R${r}`).font   = f6() as ExcelJS.Font
      ws.getCell(`R${r}`).alignment = aC as ExcelJS.Alignment
      ws.getCell(`R${r}`).border = pfThin() as ExcelJS.Borders
      ws.getCell(`R${r}`).numFmt = PCT

      iRows.push(row)
      row++
    }
    grupoIRows.push({ gRow, iRows })
  }

  // ── Totais dos grupos em I (soma dos filhos) ─────────────────────────────
  let totalOsRef = ''
  for (const { gRow, iRows } of grupoIRows) {
    if (iRows.length > 0) {
      const formula = iRows.map(r => `I${r}`).join('+')
      ws.getCell(`I${gRow}`).value  = { formula } as any
      ws.getCell(`I${gRow}`).font   = f6(true) as ExcelJS.Font
      ws.getCell(`I${gRow}`).alignment = aR as ExcelJS.Alignment
      ws.getCell(`I${gRow}`).numFmt = N2
    }
    totalOsRef += (totalOsRef ? ',' : '') + `I${gRow}`
  }

  // ── J3:L4 = valor total OS ───────────────────────────────────────────────
  if (totalOsRef) {
    ws.getCell('J3').value  = { formula: `SUM(${totalOsRef})` } as any
    ws.getCell('J3').font   = f8(true) as ExcelJS.Font
    ws.getCell('J3').alignment = aR as ExcelJS.Alignment
    ws.getCell('J3').numFmt = N2
  }

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 12 }]
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA PREV 02  (Previsão — Prefeituras, c/ coluna extra DESCONTO)
// ═══════════════════════════════════════════════════════════════════════════════
async function gerarAbaPREV02(
  wb: ExcelJS.Workbook,
  contrato: Contrato,
  obra: Obra,
  medicao: Medicao,
  servicos: Servico[],
  linhasPorServico: Map<string, LinhaMemoria[]>
): Promise<void> {
  const ws = wb.addWorksheet('PREV 02')

  const f8       = (bold = false): Partial<ExcelJS.Font> => ({ name: 'Arial', size: 8, bold })
  const f6       = (bold = false): Partial<ExcelJS.Font> => ({ name: 'Arial', size: 6, bold })
  const f10bold  = (): Partial<ExcelJS.Font> => ({ name: 'Arial', size: 10, bold: true })

  const aC  = { horizontal: 'center', vertical: 'center', wrapText: true } as Partial<ExcelJS.Alignment>
  const aL  = { horizontal: 'left',   vertical: 'center', wrapText: true } as Partial<ExcelJS.Alignment>
  const aR  = { horizontal: 'right',  vertical: 'center', wrapText: true } as Partial<ExcelJS.Alignment>
  const aLT = { horizontal: 'left',   vertical: 'top',    wrapText: true } as Partial<ExcelJS.Alignment>

  // PREV 02: 19 colunas (A..S), C um pouco mais estreita, J extra (DESCONTO)
  const W = [9.33, 13.44, 52.78, 9.66, 5.11, 8.0, 7.89, 7.89, 13.11, 10.0, 10.0, 11.11, 7.89, 10.0, 10.0, 11.44, 11.78, 10.0, 7.89]
  W.forEach((w, i) => { ws.getColumn(i + 1).width = w })

  ws.getRow(1).height  = 14.4
  ws.getRow(11).height = 12
  ws.getRow(12).height = 26.4

  const N2  = '#,##0.00'
  const N4  = '#,##0.0000'
  const PCT = '0.00%'
  const DAT = 'DD/MM/YYYY'

  // ── Cabeçalho ───────────────────────────────────────────────────────────────
  ws.mergeCells('A1:B9')
  ws.mergeCells('D1:G1')
  pfSet(ws, 'C1', 'CONCEDENTE',         { font: f8(),     align: aL })
  pfSet(ws, 'D1', 'Data de emissão BM', { font: f8(),     align: aL })
  ws.mergeCells('H1:J1')
  pfSet(ws, 'H1', 'Período de referência', { font: f8(), align: aL })

  // K1:M1 — VALOR DO CONTRATO
  ws.mergeCells('K1:M1')
  pfSet(ws, 'K1', 'VALOR DO CONTRATO', {
    font: f8(), align: aC,
    fill: pfFill(PF_CINZA_HDR), border: pfThin(),
  })
  ws.mergeCells('N1:R9')
  pfSet(ws, 'N1', [
    'RD CONSTRUTORA LTDA',
    'RUA BELA VISTA, 874, JARDINS, SÃO GONÇALO DO AMARANTE/RN',
    'CEP: 59293-576, CNPJ: 43.357.757/0001-40',
    'email: rd_solucoes@outlook.com',
    'tel.: (84) 99641-8124',
  ].join('\n'), { font: f10bold(), align: aLT })

  ws.mergeCells('D2:G2')
  pfSet(ws, 'C2', contrato.orgao_nome || '',      { font: f8(true), align: aL })
  pfSet(ws, 'D2', { formula: 'G9' } as any,       { font: f8(true), align: aL, numFmt: DAT })
  ws.mergeCells('H2:J2')
  ws.mergeCells('K2:M2')
  // K2 = SUM dos grupos I — preenchido depois

  ws.mergeCells('D3:J3')
  pfSet(ws, 'C3', 'CONVENETE',                    { font: f8(),     align: aL })
  pfSet(ws, 'D3', 'OBJETIVO DA ORDEM DE SERVIÇO', { font: f8(),     align: aL })
  ws.mergeCells('K3:M3')
  pfSet(ws, 'K3', `VALOR DA O.S. ${contrato.numero_contrato || ''}`, { font: f8(), align: aL })

  ws.mergeCells('D4:J6')
  pfSet(ws, 'C4', contrato.orgao_nome || '',  { font: f8(true), align: aL })
  pfSet(ws, 'D4', obra.nome_obra || '',       { font: f8(true), align: aL })
  ws.mergeCells('C5:C6')
  pfSet(ws, 'C5', 'PROCESSO LICITATÓRIO', { font: f8(), align: aL })
  ws.mergeCells('K4:M4')
  // K4 = =K2 preenchido depois

  // K5:M5 — VALOR ACUMULADO
  ws.mergeCells('K5:M5')
  pfSet(ws, 'K5', 'VALOR ACUMULADO', {
    font: f8(), align: aC,
    fill: pfFill(PF_CINZA_HDR), border: pfThin(),
  })
  ws.mergeCells('K6:M6')
  pfSet(ws, 'K6', { formula: 'SUM(Q14:Q10000)' } as any, {
    font: f8(true), align: aR, border: pfThin(), numFmt: N2,
  })

  ws.mergeCells('D7:J7')
  pfSet(ws, 'C7', 'EMPRESA CONTRATADA', { font: f8(), align: aL })
  pfSet(ws, 'D7', 'CNPJ',              { font: f8(), align: aL })
  ws.mergeCells('K7:M7')
  pfSet(ws, 'K7', 'SALDO EM CONTRATO', {
    font: f8(), align: aC,
    fill: pfFill(PF_CINZA_HDR), border: pfThin(),
  })

  ws.mergeCells('D8:J8')
  pfSet(ws, 'C8', contrato.empresa_executora || '', { font: f8(true), align: aL })
  pfSet(ws, 'D8', '43.357.757/0001-40',            { font: f8(true), align: aL })
  ws.mergeCells('K8:M8')
  pfSet(ws, 'K8', { formula: 'K2-K6' } as any, {
    font: f8(true), align: aR, border: pfThin(), numFmt: N2,
  })

  ws.mergeCells('D9:F9')
  pfSet(ws, 'C9', `BOLETIM DE MEDIÇÃO - N° ${medicao.numero}`, { font: f8(true), align: aL })
  pfSet(ws, 'D9', 'EMISSÃO DO BM', { font: f8(), align: aL })
  ws.mergeCells('G9:H9')
  pfSet(ws, 'G9',
    medicao.data_medicao ? new Date(medicao.data_medicao + 'T00:00:00') : null,
    { font: f8(true), align: aC, numFmt: DAT }
  )
  ws.mergeCells('I9:J9')
  pfSet(ws, 'I9', 'VALOR MEDIDO NO PERÍODO:', { font: f8(), align: aL })
  ws.mergeCells('K9:M9')
  pfSet(ws, 'K9', { formula: 'SUM(P14:P10000)' } as any, {
    font: f8(true), align: aR, numFmt: N2,
  })

  // ── Cabeçalho tabela rows 11–12 ─────────────────────────────────────────────
  ws.mergeCells('A11:A12')
  ws.mergeCells('B11:B12')
  ws.mergeCells('C11:C12')
  ws.mergeCells('D11:D12')
  ws.mergeCells('E11:E12')
  ws.mergeCells('F11:F12')
  ws.mergeCells('G11:H11')
  ws.mergeCells('I11:J11')
  ws.mergeCells('K11:S11')

  const hFill = pfFill(PF_AZUL_CABEC)
  const hO = { font: f6(true), align: aC, fill: hFill, border: pfThin() }

  ;[
    ['A11','ITEM'], ['B11','CÓDIGO'], ['C11','DESCRIÇÃO'], ['D11','FONTE'],
    ['E11','UNID'], ['F11','QUANTIDADE'], ['G11','PREÇO UNITÁRIO R$'], ['I11','PREÇO TOTAL R$'],
  ].forEach(([addr, txt]) => pfSet(ws, addr, txt, hO))

  pfSet(ws, 'K11', 'PLANILHA DE MEDIÇÃO', hO)

  const descPct = (obra.desconto_percentual * 100).toFixed(1)
  ;[
    ['G12','SEM BDI'], ['H12','COM BDI'], ['I12','COM BDI'], [`J12`,`DESCONTO ${descPct}%`],
    ['K12','ACUMULADO ANTERIOR'], ['L12','MED. NO PERÍODO'], ['M12','(%)'],
    ['N12','ACUMULADO ATUAL (UND)'], ['O12','SALDO (UND)'],
    ['P12','MED. ATUAL (R$)'], ['Q12','ACUMULADO (R$)'], ['R12','SALDO (R$)'], ['S12','(%)'],
  ].forEach(([addr, txt]) => pfSet(ws, addr, txt, hO))

  // ── Dados ─────────────────────────────────────────────────────────────────
  const grupos   = servicos.filter(s =>  s.is_grupo).sort((a,b) => a.ordem - b.ordem)
  const itens    = servicos.filter(s => !s.is_grupo)
  let row = 13
  const grupoIRows: { gRow: number; iRows: number[] }[] = []

  for (const grp of grupos) {
    ws.getRow(row).height = 14
    const gRow = row

    ws.mergeCells(`B${row}:H${row}`)
    pfSet(ws, `A${row}`, grp.item,      { font: f6(true), align: aL, border: pfThin() })
    pfSet(ws, `B${row}`, grp.descricao, { font: f6(true), align: aL, border: pfThin() })
    pfSet(ws, `I${row}`, null, { border: pfThin() })
    pfSet(ws, `J${row}`, null, { border: pfThin() })

    const thin = { style: 'thin' as ExcelJS.BorderStyle }
    ws.getCell(`K${row}`).border = { top: thin, left: thin }
    for (const col of ['L','M','N','O','P','Q','R']) {
      ws.getCell(`${col}${row}`).border = { top: thin }
    }
    ws.getCell(`S${row}`).border = { top: thin, right: thin }

    row++
    const iRows: number[] = []

    const filhos = itens.filter(s =>
      s.grupo_item === grp.item ||
      s.grupo_item === `${grp.item}.0` ||
      s.grupo_item === String(parseFloat(grp.item))
    )

    for (const srv of filhos) {
      ws.getRow(row).height = 27
      const r = row
      const linhas = linhasPorServico.get(srv.id) || []
      const { qtdAnterior, qtdPeriodo } = calcResumoServico(srv, linhas)
      const pDesc = calcPrecoComDesconto(srv.preco_unitario, obra.desconto_percentual)
      const pBDI  = calcPrecoComBDI(pDesc, obra.bdi_percentual)
      const pComBDI = pBDI * srv.quantidade

      pfSet(ws, `A${r}`, srv.item,       { font: f6(), align: aL, border: pfThin() })
      pfSet(ws, `B${r}`, srv.codigo,     { font: f6(), align: aC, border: pfThin() })
      pfSet(ws, `C${r}`, srv.descricao,  { font: f6(), align: aL, border: pfThin() })
      pfSet(ws, `D${r}`, srv.fonte,      { font: f6(), align: aC, border: pfThin() })
      pfSet(ws, `E${r}`, srv.unidade,    { font: f6(), align: aC, border: pfThin() })
      pfSet(ws, `F${r}`, srv.quantidade, { font: f6(), align: aR, border: pfThin(), numFmt: N4 })
      pfSet(ws, `G${r}`, pDesc,          { font: f6(), align: aR, border: pfThin(), numFmt: N2 })
      pfSet(ws, `H${r}`, pBDI,           { font: f6(), align: aR, border: pfThin(), numFmt: N2 })
      pfSet(ws, `I${r}`, pComBDI,        { font: f6(), align: aR, border: pfThin(), numFmt: N2 })

      // J = preço total com desconto aplicado (I * fator_desconto = I14*0.988)
      ws.getCell(`J${r}`).value     = { formula: `I${r}*(1-${obra.desconto_percentual})` } as any
      ws.getCell(`J${r}`).font      = f6() as ExcelJS.Font
      ws.getCell(`J${r}`).alignment = aR as ExcelJS.Alignment
      ws.getCell(`J${r}`).border    = pfThin() as ExcelJS.Borders
      ws.getCell(`J${r}`).numFmt    = N2

      pfSet(ws, `K${r}`, qtdAnterior, { font: f6(), align: aC, border: pfThinTopBotLeft(), numFmt: N4 })
      pfSet(ws, `L${r}`, qtdPeriodo,  { font: f6(), align: aC, border: pfThin(), numFmt: N4 })

      // M = L/F  (%)
      ws.getCell(`M${r}`).value     = { formula: `IF(F${r}=0,0,L${r}/F${r})` } as any
      ws.getCell(`M${r}`).font      = f6() as ExcelJS.Font
      ws.getCell(`M${r}`).alignment = aC as ExcelJS.Alignment
      ws.getCell(`M${r}`).border    = pfThin() as ExcelJS.Borders
      ws.getCell(`M${r}`).numFmt    = PCT

      // N = K+L  (acumulado atual UND)
      ws.getCell(`N${r}`).value     = { formula: `K${r}+L${r}` } as any
      ws.getCell(`N${r}`).font      = f6() as ExcelJS.Font
      ws.getCell(`N${r}`).alignment = aC as ExcelJS.Alignment
      ws.getCell(`N${r}`).border    = pfThin() as ExcelJS.Borders
      ws.getCell(`N${r}`).numFmt    = N4

      // O = F-N  (saldo UND)
      ws.getCell(`O${r}`).value     = { formula: `F${r}-N${r}` } as any
      ws.getCell(`O${r}`).font      = f6() as ExcelJS.Font
      ws.getCell(`O${r}`).alignment = aC as ExcelJS.Alignment
      ws.getCell(`O${r}`).border    = pfThin() as ExcelJS.Borders
      ws.getCell(`O${r}`).numFmt    = N4

      // P = L*H*0.988  (med atual R$, com desconto)
      ws.getCell(`P${r}`).value     = { formula: `L${r}*H${r}*(1-${obra.desconto_percentual})` } as any
      ws.getCell(`P${r}`).font      = f6() as ExcelJS.Font
      ws.getCell(`P${r}`).alignment = aC as ExcelJS.Alignment
      ws.getCell(`P${r}`).border    = pfThin() as ExcelJS.Borders
      ws.getCell(`P${r}`).numFmt    = N2

      // Q = N*H*0.988  (acumulado R$, com desconto)
      ws.getCell(`Q${r}`).value     = { formula: `N${r}*H${r}*(1-${obra.desconto_percentual})` } as any
      ws.getCell(`Q${r}`).font      = f6() as ExcelJS.Font
      ws.getCell(`Q${r}`).alignment = aC as ExcelJS.Alignment
      ws.getCell(`Q${r}`).border    = pfThin() as ExcelJS.Borders
      ws.getCell(`Q${r}`).numFmt    = N2

      // R = H*O*0.988  (saldo R$, com desconto)
      ws.getCell(`R${r}`).value     = { formula: `H${r}*O${r}*(1-${obra.desconto_percentual})` } as any
      ws.getCell(`R${r}`).font      = f6() as ExcelJS.Font
      ws.getCell(`R${r}`).alignment = aC as ExcelJS.Alignment
      ws.getCell(`R${r}`).border    = pfThin() as ExcelJS.Borders
      ws.getCell(`R${r}`).numFmt    = N2

      // S = N/F  (%)
      ws.getCell(`S${r}`).value     = { formula: `IF(F${r}=0,0,N${r}/F${r})` } as any
      ws.getCell(`S${r}`).font      = f6() as ExcelJS.Font
      ws.getCell(`S${r}`).alignment = aC as ExcelJS.Alignment
      ws.getCell(`S${r}`).border    = pfThin() as ExcelJS.Borders
      ws.getCell(`S${r}`).numFmt    = PCT

      iRows.push(row)
      row++
    }
    grupoIRows.push({ gRow, iRows })
  }

  // ── Totais dos grupos em I e J ────────────────────────────────────────────
  let totalOsRef = ''
  for (const { gRow, iRows } of grupoIRows) {
    if (iRows.length > 0) {
      const fmI = iRows.map(r => `I${r}`).join('+')
      ws.getCell(`I${gRow}`).value     = { formula: fmI } as any
      ws.getCell(`I${gRow}`).font      = f6(true) as ExcelJS.Font
      ws.getCell(`I${gRow}`).alignment = aR as ExcelJS.Alignment
      ws.getCell(`I${gRow}`).numFmt    = N2
      ws.getCell(`I${gRow}`).border    = pfThin() as ExcelJS.Borders

      const fmJ = iRows.map(r => `J${r}`).join('+')
      ws.getCell(`J${gRow}`).value     = { formula: fmJ } as any
      ws.getCell(`J${gRow}`).font      = f6(true) as ExcelJS.Font
      ws.getCell(`J${gRow}`).alignment = aR as ExcelJS.Alignment
      ws.getCell(`J${gRow}`).numFmt    = N2
      ws.getCell(`J${gRow}`).border    = pfThin() as ExcelJS.Borders
    }
    totalOsRef += (totalOsRef ? ',' : '') + `I${gRow}`
  }

  // K2 = valor total OS  |  K4 = =K2
  if (totalOsRef) {
    ws.getCell('K2').value     = { formula: `SUM(${totalOsRef})` } as any
    ws.getCell('K2').font      = f8(true) as ExcelJS.Font
    ws.getCell('K2').alignment = aR as ExcelJS.Alignment
    ws.getCell('K2').numFmt    = N2
    ws.getCell('K4').value     = { formula: 'K2' } as any
    ws.getCell('K4').font      = f8(true) as ExcelJS.Font
    ws.getCell('K4').alignment = aR as ExcelJS.Alignment
    ws.getCell('K4').numFmt    = N2
  }

  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 12 }]
}