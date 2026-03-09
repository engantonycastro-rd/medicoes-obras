import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import {
  Contrato, Medicao, Servico, LinhaMemoria,
} from '../types'
import {
  calcPrecoComDesconto, calcPrecoComBDI, calcPrecoTotal,
  calcResumoServico, calcValoresMedicao, formatDate,
  toOrdinalFeminino, valorPorExtenso,
} from './calculations'

// ─── CORES E ESTILOS ─────────────────────────────────────────────────────────

const AZUL_CABECALHO  = '1F3864'
const AZUL_GRUPO      = 'BDD7EE'
const CINZA_SUBHEADER = 'D9D9D9'
const VERDE_OK        = '70AD47'
const VERMELHO_PEND   = 'FF0000'
const AMARELO_AVISO   = 'FFEB9C'

const fontBranca = { color: { argb: 'FFFFFFFF' }, bold: true, size: 9, name: 'Arial' }
const fontNegrita = { bold: true, size: 9, name: 'Arial' }
const fontNormal  = { size: 9, name: 'Arial' }

function fillSolido(hex: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${hex}` } }
}

function bordaThin(): Partial<ExcelJS.Borders> {
  const t = { style: 'thin' as const }
  return { top: t, bottom: t, left: t, right: t }
}

function alinhar(h: ExcelJS.Alignment['horizontal'], v: ExcelJS.Alignment['vertical'] = 'middle'): Partial<ExcelJS.Alignment> {
  return { horizontal: h, vertical: v, wrapText: true }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function aplicarCelula(
  ws: ExcelJS.Worksheet,
  cell: string,
  value: ExcelJS.CellValue,
  opts?: {
    fill?: ExcelJS.Fill
    font?: Partial<ExcelJS.Font>
    align?: Partial<ExcelJS.Alignment>
    border?: Partial<ExcelJS.Borders>
    numFmt?: string
  }
) {
  const c = ws.getCell(cell)
  c.value = value
  if (opts?.fill)   c.fill   = opts.fill
  if (opts?.font)   c.font   = opts.font
  if (opts?.align)  c.alignment = opts.align
  if (opts?.border) c.border  = opts.border
  if (opts?.numFmt) c.numFmt  = opts.numFmt
}

// ─── GERADOR PRINCIPAL ────────────────────────────────────────────────────────

export async function gerarMedicaoExcel(
  contrato: Contrato,
  medicao: Medicao,
  servicos: Servico[],
  linhasPorServico: Map<string, LinhaMemoria[]>
): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Sistema de Medições'
  wb.created = new Date()

  await gerarAbaMED(wb, contrato, medicao, servicos, linhasPorServico)
  await gerarAbaMEM(wb, contrato, medicao, servicos, linhasPorServico)

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })

  const nomeArquivo = `${contrato.nome_obra.replace(/\s+/g, '_')}_${medicao.numero_extenso}_MEDIÇÃO.xlsx`
  saveAs(blob, nomeArquivo)
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA: MED 01 — BOLETIM DE MEDIÇÃO
// ═══════════════════════════════════════════════════════════════════════════════

async function gerarAbaMED(
  wb: ExcelJS.Workbook,
  contrato: Contrato,
  medicao: Medicao,
  servicos: Servico[],
  linhasPorServico: Map<string, LinhaMemoria[]>
) {
  const ws = wb.addWorksheet(`MED ${String(medicao.numero).padStart(2, '0')}`)

  // Larguras das colunas (A=1 ... W=23)
  const larguras = [6, 14, 14, 45, 6, 10, 14, 14, 14, 14, 8,
                    10, 12, 12, 12, 12, 14, 14, 14, 14, 14, 14, 8]
  larguras.forEach((w, i) => {
    ws.getColumn(i + 1).width = w
  })

  // ── Linha 1: Órgão ──────────────────────────────────────────────────────────
  ws.mergeCells('C1:E1')
  ws.mergeCells('F1:W1')
  aplicarCelula(ws, 'C1', contrato.orgao_nome,
    { font: fontBranca, fill: fillSolido(AZUL_CABECALHO), align: alinhar('center') })
  aplicarCelula(ws, 'F1', 'PREVISÃO - BOLETIM DE MEDIÇÃO',
    { font: { ...fontBranca, size: 11 }, fill: fillSolido(AZUL_CABECALHO), align: alinhar('center') })
  ws.getRow(1).height = 20

  // ── Linha 2: Subdivisão ─────────────────────────────────────────────────────
  ws.mergeCells('C2:W2')
  aplicarCelula(ws, 'C2', contrato.orgao_subdivisao || '',
    { font: fontBranca, fill: fillSolido(AZUL_CABECALHO), align: alinhar('center') })
  ws.getRow(2).height = 16

  // ── Linha 3: Obra / Contrato ─────────────────────────────────────────────────
  ws.mergeCells('C3:D3')
  ws.mergeCells('F3:L3')
  aplicarCelula(ws, 'A3', 'OBRA:',       { font: fontNegrita })
  aplicarCelula(ws, 'C3', contrato.nome_obra, { font: fontNegrita })
  aplicarCelula(ws, 'E3', 'CONTRATO:',   { font: fontNegrita })
  aplicarCelula(ws, 'F3', contrato.numero_contrato || '', { font: fontNormal })
  aplicarCelula(ws, 'M3', 'MEDIÇÃO:',       { font: fontNegrita })
  aplicarCelula(ws, 'N3', 'DATA DA ORDEM SERVIÇO', { font: fontNormal, align: alinhar('center') })
  aplicarCelula(ws, 'P3', 'PRAZO EXECUÇÃO',  { font: fontNormal, align: alinhar('center') })
  aplicarCelula(ws, 'Q3', 'DATA MEDIÇÃO',    { font: fontNormal, align: alinhar('center') })
  aplicarCelula(ws, 'S3', 'DATA BASE PLANILHA', { font: fontNormal, align: alinhar('center') })
  aplicarCelula(ws, 'U3', 'EMPRESA EXECUTORA', { font: fontNormal, align: alinhar('center') })

  // ── Linha 4: Valores do cabeçalho ───────────────────────────────────────────
  aplicarCelula(ws, 'C4', contrato.local_obra, { font: fontNormal })
  aplicarCelula(ws, 'E4', 'DESCONTO:', { font: fontNegrita })
  aplicarCelula(ws, 'F4', contrato.desconto_percentual, { font: fontNormal, numFmt: '0.00%' })
  aplicarCelula(ws, 'M4', medicao.numero_extenso, { font: fontNegrita, align: alinhar('center') })
  aplicarCelula(ws, 'N4', contrato.data_ordem_servico ? new Date(contrato.data_ordem_servico) : '',
    { font: fontNormal, numFmt: 'DD/MM/YYYY', align: alinhar('center') })
  aplicarCelula(ws, 'P4', `${contrato.prazo_execucao_dias} dias`,
    { font: fontNormal, align: alinhar('center') })
  aplicarCelula(ws, 'Q4', new Date(medicao.data_medicao),
    { font: fontNormal, numFmt: 'DD/MM/YYYY', align: alinhar('center') })
  aplicarCelula(ws, 'S4', contrato.data_base_planilha || '',
    { font: fontNormal, align: alinhar('center') })
  aplicarCelula(ws, 'U4', contrato.empresa_executora,
    { font: fontNormal, align: alinhar('center') })

  // ── Linha 5: Divisor PLANILHA BASE / PLANILHA DE MEDIÇÃO ────────────────────
  ws.mergeCells('A5:K5')
  ws.mergeCells('L5:W5')
  aplicarCelula(ws, 'A5', 'PLANILHA BASE',
    { font: fontBranca, fill: fillSolido(AZUL_CABECALHO), align: alinhar('center') })
  aplicarCelula(ws, 'L5', 'PLANILHA DE MEDIÇÃO',
    { font: fontBranca, fill: fillSolido(AZUL_CABECALHO), align: alinhar('center') })
  ws.getRow(5).height = 18

  // ── Linha 6/7: Headers das colunas ──────────────────────────────────────────
  const headers6: [string, string][] = [
    ['A6', 'ITEM'], ['B6', 'FONTE'], ['C6', 'CÓDIGO'], ['D6', 'DESCRIÇÃO'],
    ['E6', 'UNID'], ['F6', 'QUANTIDADE'], ['G6', 'PREÇO UNITÁRIO R$'],
    ['J6', 'PREÇO\nTOTAL R$'], ['K6', 'PESO (%)'],
    ['L6', 'QUANTIDADES'], ['Q6', 'PREÇOS R$'],
  ]

  const headers7: [string, string][] = [
    ['G7', 'SINAPI'], ['H7', `COM DESCONTO\n(${(contrato.desconto_percentual * 100).toFixed(2)}%)`],
    ['I7', 'COM BDI'],
    ['L7', 'PREVISTO'], ['M7', 'ANTERIOR\nACUMULADA'], ['N7', 'MEDIDA NO\nPERIODO'],
    ['O7', 'ACUMULADO'], ['P7', 'SALDO DO\nCONTRATO'],
    ['Q7', 'UNITÁRIO'], ['R7', 'UNITÁRIO\nCOM BDI'],
    ['S7', 'ANTERIOR\nACUMULADO'], ['T7', 'ACUMULADO'], ['U7', 'NO PERIODO'],
    ['V7', 'SALDO DO\nCONTRATO'], ['W7', 'SALDO (%)'],
  ]

  headers6.forEach(([cell, val]) => {
    aplicarCelula(ws, cell, val, {
      font: fontBranca, fill: fillSolido(AZUL_CABECALHO),
      align: alinhar('center'), border: bordaThin(),
    })
  })

  headers7.forEach(([cell, val]) => {
    aplicarCelula(ws, cell, val, {
      font: fontBranca, fill: fillSolido(AZUL_CABECALHO),
      align: alinhar('center'), border: bordaThin(),
    })
  })

  ws.getRow(6).height = 28
  ws.getRow(7).height = 32

  // ── Dados dos serviços ───────────────────────────────────────────────────────
  let rowNum = 8
  let totalOrcamento = 0

  const servicosOrdenados = [...servicos].sort((a, b) => a.ordem - b.ordem)

  for (const srv of servicosOrdenados) {
    const row = ws.getRow(rowNum)
    row.height = srv.descricao.length > 80 ? 42 : 28

    const precoDesc = calcPrecoComDesconto(srv.preco_unitario, contrato.desconto_percentual)
    const precoBDI  = calcPrecoComBDI(precoDesc, contrato.bdi_percentual)
    const precoTotal = calcPrecoTotal(srv.quantidade, precoBDI)

    if (srv.is_grupo) {
      // ── Linha de grupo ──────────────────────────────────────────────────────
      ws.mergeCells(`D${rowNum}:F${rowNum}`)
      ;['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W']
        .forEach(col => {
          const c = ws.getCell(`${col}${rowNum}`)
          c.fill   = fillSolido(AZUL_GRUPO)
          c.font   = fontNegrita
          c.border = bordaThin()
        })
      ws.getCell(`A${rowNum}`).value = srv.item
      ws.getCell(`D${rowNum}`).value = srv.descricao
      ws.getCell(`J${rowNum}`).value = precoTotal
      ws.getCell(`J${rowNum}`).numFmt = '#,##0.00'
      ws.getCell(`K${rowNum}`).value = 0 // será calculado na totalização
      totalOrcamento += precoTotal
    } else {
      // ── Linha de serviço ────────────────────────────────────────────────────
      const linhas = linhasPorServico.get(srv.id) || []
      const { qtdAnterior, qtdPeriodo, qtdAcumulada, qtdSaldo } = calcResumoServico(srv, linhas)
      const precoBDIdemo = Math.trunc(precoDesc * 1.2452 * 100) / 100

      const cells: Record<string, ExcelJS.CellValue> = {
        A: srv.item, B: srv.fonte, C: srv.codigo || '',
        D: srv.descricao, E: srv.unidade,
        F: srv.quantidade,
        G: srv.preco_unitario, H: precoDesc, I: precoBDI,
        J: precoTotal, K: 0, // peso % calculado depois
        L: srv.quantidade,         // Previsto
        M: qtdAnterior,            // Anterior Acumulada
        N: qtdPeriodo,             // Medida no Período ← CHAVE
        O: qtdAcumulada,           // Acumulado
        P: qtdSaldo,               // Saldo do Contrato
        Q: precoDesc,              // Unitário
        R: precoBDIdemo,           // Unitário c/ BDI
        S: qtdAnterior * precoBDIdemo,  // Anterior Acumulado R$
        T: qtdAcumulada * precoBDIdemo, // Acumulado R$
        U: qtdPeriodo * precoBDIdemo,   // No Período R$
        V: precoTotal - (qtdAcumulada * precoBDIdemo), // Saldo R$
        W: precoTotal > 0 ? (precoTotal - qtdAcumulada * precoBDIdemo) / precoTotal : 0, // Saldo %
      }

      const numCols = ['F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V']
      const pctCols = ['K','W']

      Object.entries(cells).forEach(([col, val]) => {
        const c = ws.getCell(`${col}${rowNum}`)
        c.value  = val
        c.border = bordaThin()
        c.font   = fontNormal
        c.alignment = alinhar(numCols.includes(col) ? 'right' : col === 'D' ? 'left' : 'center')
        if (numCols.includes(col)) c.numFmt = '#,##0.0000'
        if (['G','H','I','J','Q','R','S','T','U','V'].includes(col)) c.numFmt = '#,##0.00'
        if (pctCols.includes(col)) c.numFmt = '0.00%'
      })

      // Status visual (coluna W = saldo %)
      const saldoCell = ws.getCell(`W${rowNum}`)
      if (qtdAcumulada >= srv.quantidade) {
        saldoCell.fill = fillSolido(VERDE_OK)
      }

      totalOrcamento += precoTotal
    }

    rowNum++
  }

  // ── Totais Gerais ─────────────────────────────────────────────────────────
  const rowTotal = rowNum
  ws.mergeCells(`A${rowTotal}:I${rowTotal}`)
  ws.getRow(rowTotal).height = 20

  const valores = calcValoresMedicao(servicos, linhasPorServico, contrato)

  aplicarCelula(ws, `A${rowTotal}`, 'TOTAIS GERAIS DO ORÇAMENTO',
    { font: fontBranca, fill: fillSolido(AZUL_CABECALHO), align: alinhar('center') })

  const totaisCells: Record<string, number> = {
    J: valores.totalOrcamento,
    T: valores.valorAcumulado,
    U: valores.valorPeriodo,
    V: valores.valorSaldo,
  }
  Object.entries(totaisCells).forEach(([col, val]) => {
    aplicarCelula(ws, `${col}${rowTotal}`, val, {
      font: fontBranca, fill: fillSolido(AZUL_CABECALHO),
      align: alinhar('right'), numFmt: '#,##0.00',
    })
  })

  // ── Extenso ───────────────────────────────────────────────────────────────
  const rowExtenso = rowTotal + 2
  ws.mergeCells(`A${rowExtenso}:W${rowExtenso}`)
  aplicarCelula(ws, `A${rowExtenso}`,
    `A presente medição importa o valor de: ${valorPorExtenso(valores.valorPeriodo).toUpperCase()} (${
      new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valores.valorPeriodo)
    })`,
    { font: { ...fontNegrita, size: 10 }, align: alinhar('left') })

  // ── Demonstrativo ─────────────────────────────────────────────────────────
  const rowDemo = rowExtenso + 3
  const labelsDemo = [
    ['VALOR TOTAL DO ORÇAMENTO GERAL', valores.totalOrcamento, '#,##0.00', ''],
    [`VALOR ${medicao.numero_extenso} MEDIÇÃO (R$)`, valores.valorPeriodo, '#,##0.00', ''],
    ['PERCENTUAL DA PRIMEIRA MEDIÇÃO', valores.percentualPeriodo, '0.00%', ''],
    ['FATURADO ACUMULADO', valores.valorAcumulado, '#,##0.00', ''],
    ['PERCENTUAL FATURADO ACUMULADO', valores.percentualAcumulado, '0.00%', ''],
    ['SALDO CONTRATO', valores.valorSaldo, '#,##0.00', ''],
    ['PERCENTUAL DO SALDO DO CONTRATO', valores.percentualSaldo, '0.00%', ''],
  ]

  ws.mergeCells(`A${rowDemo - 1}:E${rowDemo - 1}`)
  aplicarCelula(ws, `A${rowDemo - 1}`, 'DEMONSTRATIVO',
    { font: fontBranca, fill: fillSolido(AZUL_CABECALHO), align: alinhar('center') })

  labelsDemo.forEach(([label, val, fmt], i) => {
    const r = rowDemo + i
    ws.mergeCells(`A${r}:D${r}`)
    aplicarCelula(ws, `A${r}`, label as string,
      { font: fontNormal, fill: fillSolido(CINZA_SUBHEADER), border: bordaThin() })
    aplicarCelula(ws, `E${r}`, val as number,
      { font: fontNegrita, numFmt: fmt as string, align: alinhar('right'), border: bordaThin() })
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA: MEM 01 — MEMÓRIA DE CÁLCULO
// ═══════════════════════════════════════════════════════════════════════════════

async function gerarAbaMEM(
  wb: ExcelJS.Workbook,
  contrato: Contrato,
  medicao: Medicao,
  servicos: Servico[],
  linhasPorServico: Map<string, LinhaMemoria[]>
) {
  const ws = wb.addWorksheet(`MEM ${String(medicao.numero).padStart(2, '0')}`)

  // Larguras
  const larguras = [8, 35, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 14, 20]
  larguras.forEach((w, i) => ws.getColumn(i + 1).width = w)

  // ── Cabeçalho ─────────────────────────────────────────────────────────────
  ws.mergeCells('A1:N1')
  ws.mergeCells('A2:N2')
  ws.mergeCells('A3:N3')
  ws.mergeCells('A4:N4')
  ws.mergeCells('A5:N5')

  ;[
    [1, contrato.orgao_nome],
    [2, contrato.orgao_subdivisao || ''],
    [3, contrato.nome_obra],
    [4, medicao.numero_extenso],
    [5, 'MEMÓRIA DE CÁLCULO'],
  ].forEach(([r, txt]) => {
    aplicarCelula(ws, `A${r}`, txt as string,
      { font: { ...fontBranca, size: r === 5 ? 11 : 9, bold: true },
        fill: fillSolido(AZUL_CABECALHO), align: alinhar('center') })
    ws.getRow(r as number).height = 18
  })

  // ── Headers MEM ───────────────────────────────────────────────────────────
  ws.getRow(7).height = 28
  ;['ITEM','DESCRIÇÃO DOS SERVIÇOS','Larg.','Comp.','Altura','Perim.','Área','Vol.','Kg','Outros','Desc.','Qtde','TOTAL','OBSERVAÇÃO']
    .forEach((h, i) => {
      aplicarCelula(ws, `${String.fromCharCode(65 + i)}7`, h, {
        font: fontBranca, fill: fillSolido(AZUL_CABECALHO),
        align: alinhar('center'), border: bordaThin(),
      })
    })

  // ── Dados ──────────────────────────────────────────────────────────────────
  let rowNum = 8
  const servicosOrdenados = servicos.filter(s => !s.is_grupo).sort((a, b) => a.ordem - b.ordem)

  for (const srv of servicosOrdenados) {
    const linhas = linhasPorServico.get(srv.id) || []

    // Linha de título do serviço
    ws.mergeCells(`A${rowNum}:B${rowNum}`)
    aplicarCelula(ws, `A${rowNum}`, srv.item,
      { font: fontNegrita, fill: fillSolido(AZUL_GRUPO), border: bordaThin() })
    aplicarCelula(ws, `B${rowNum}`, srv.descricao,
      { font: fontNegrita, fill: fillSolido(AZUL_GRUPO), border: bordaThin(), align: alinhar('left') })
    ws.getRow(rowNum).height = 20
    rowNum++

    // Linhas de cálculo
    const linhasOrdenadas = [...linhas].sort((a, b) => a.sub_item.localeCompare(b.sub_item))

    for (const linha of linhasOrdenadas) {
      const r = ws.getRow(rowNum)
      r.height = 16

      const statusFill = linha.status === 'A pagar'
        ? fillSolido('E2EFDA')
        : linha.status === 'Pago'
          ? fillSolido('DDEBF7')
          : fillSolido('FCE4D6')

      const camposCols: [string, ExcelJS.CellValue, string][] = [
        ['A', linha.sub_item, '@'],
        ['B', linha.descricao_calculo, '@'],
        ['C', linha.largura ?? null, '#,##0.0000'],
        ['D', linha.comprimento ?? null, '#,##0.0000'],
        ['E', linha.altura ?? null, '#,##0.0000'],
        ['F', linha.perimetro ?? null, '#,##0.0000'],
        ['G', linha.area ?? null, '#,##0.0000'],
        ['H', linha.volume ?? null, '#,##0.0000'],
        ['I', linha.kg ?? null, '#,##0.0000'],
        ['J', linha.outros ?? null, '#,##0.0000'],
        ['K', linha.desconto_dim ?? null, '#,##0.0000'],
        ['L', linha.quantidade ?? null, '#,##0.0000'],
        ['M', linha.total, '#,##0.0000'],
        ['N', linha.status, '@'],
      ]

      camposCols.forEach(([col, val, fmt]) => {
        const c = ws.getCell(`${col}${rowNum}`)
        c.value  = val
        c.fill   = statusFill
        c.font   = fontNormal
        c.border = bordaThin()
        c.numFmt = fmt
        c.alignment = alinhar(['A','B','N'].includes(col) ? 'left' : 'right')
        if (col === 'M') c.font = { ...fontNegrita }
      })

      if (linha.observacao) {
        ws.getCell(`N${rowNum}`).note = linha.observacao
      }

      rowNum++
    }

    // Linha de totalização do serviço
    const qtdAnterior = linhas.filter(l => l.status === 'Pago').reduce((s, l) => s + l.total, 0)
    const qtdPeriodo  = linhas.filter(l => l.status === 'A pagar').reduce((s, l) => s + l.total, 0)
    const totalAcum   = qtdAnterior + qtdPeriodo

    ;[
      ['TOTAL ACUMULADO', totalAcum],
      ['TOTAL ACUMULADO ANTERIOR', qtdAnterior],
      ['TOTAL DO MÊS', qtdPeriodo],
    ].forEach(([label, val]) => {
      ws.mergeCells(`A${rowNum}:L${rowNum}`)
      aplicarCelula(ws, `A${rowNum}`, label as string,
        { font: fontNegrita, fill: fillSolido(CINZA_SUBHEADER),
          align: alinhar('right'), border: bordaThin() })
      aplicarCelula(ws, `M${rowNum}`, val as number,
        { font: fontNegrita, fill: fillSolido(CINZA_SUBHEADER),
          numFmt: '#,##0.0000', align: alinhar('right'), border: bordaThin() })
      rowNum++
    })

    // Linha em branco entre serviços
    rowNum++
  }
}
