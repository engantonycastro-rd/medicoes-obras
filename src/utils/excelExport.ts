import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import { Contrato, Obra, Medicao, Servico, LinhaMemoria } from '../types'
import {
  calcPrecoComDesconto, calcPrecoComBDI, calcPrecoTotal,
  calcResumoServico, calcValoresMedicao, valorPorExtenso,
} from './calculations'

// ─── PALETA ESTADO ────────────────────────────────────────────────────────────
const AZ_ESCURO  = '1F3864'
const AZ_MEDIO   = '2E75B6'
const AZ_CLARO   = 'BDD7EE'
const AZ_CABEC   = 'DEEAF1'
const CINZA_SUB  = 'D9D9D9'
const VERDE_OK   = '70AD47'
const LARANJA    = 'ED7D31'

// ─── PALETA PREFEITURA ────────────────────────────────────────────────────────
const PF_CINZA_HDR  = 'D4D4D4'   // cabeçalho: VALOR DO CONTRATO, VALOR ACUMULADO, SALDO
const PF_VERDE_MED  = '70AD47'   // "PLANILHA DE MEDIÇÃO" header verde
const PF_VERDE_DADOS= 'E2EFDA'   // linhas com dados no período (verde claro)
const PF_AZUL_TABCAB= 'DCE6F1'   // cabeçalho da tabela (ITEM, CÓDIGO, etc.)
const PF_AZUL_PU    = 'DCE6F1'   // colunas PREÇO UNITÁRIO (G12, H12) = mesmo azul claro
const PF_BRANCO     = 'FFFFFF'
const PF_CINZA_LOGO = 'F2F2F2'   // bloco logo (A1:B9)

// ─── HELPERS GENÉRICOS ───────────────────────────────────────────────────────
function solidFill(hex: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${hex}` } }
}

function thinBorder(): Partial<ExcelJS.Borders> {
  const s = { style: 'thin' as ExcelJS.BorderStyle }
  return { top: s, bottom: s, left: s, right: s }
}

function mediumBorder(): Partial<ExcelJS.Borders> {
  const s = { style: 'medium' as ExcelJS.BorderStyle }
  return { top: s, bottom: s, left: s, right: s }
}

function align(h: ExcelJS.Alignment['horizontal'], v: ExcelJS.Alignment['vertical'] = 'middle'): Partial<ExcelJS.Alignment> {
  return { horizontal: h, vertical: v, wrapText: true }
}

function setCell(
  ws: ExcelJS.Worksheet, addr: string, val: ExcelJS.CellValue,
  opts?: { fill?: ExcelJS.Fill; font?: any; align?: any; border?: any; numFmt?: string }
) {
  const c = ws.getCell(addr)
  c.value = val
  if (opts?.fill)   c.fill      = opts.fill
  if (opts?.font)   c.font      = opts.font
  if (opts?.align)  c.alignment = opts.align
  if (opts?.border) c.border    = opts.border
  if (opts?.numFmt) c.numFmt    = opts.numFmt
}

// Fonts estado
const fW  = (sz = 9) => ({ color: { argb: 'FFFFFFFF' }, bold: true,  size: sz, name: 'Arial Narrow' })
const fB  = (sz = 9) => ({ bold: true,  size: sz, name: 'Arial Narrow' })
const fN  = (sz = 9) => ({ bold: false, size: sz, name: 'Arial Narrow' })

// Fonts prefeitura
const pf8  = (bold = false): Partial<ExcelJS.Font> => ({ name: 'Arial', size: 8, bold })
const pf9  = (bold = false): Partial<ExcelJS.Font> => ({ name: 'Arial', size: 9, bold })
const pf6  = (bold = false): Partial<ExcelJS.Font> => ({ name: 'Arial', size: 6, bold })
const pf10b= (): Partial<ExcelJS.Font> => ({ name: 'Arial', size: 10, bold: true })

const pfAC = { horizontal: 'center', vertical: 'center', wrapText: true } as Partial<ExcelJS.Alignment>
const pfAL = { horizontal: 'left',   vertical: 'center', wrapText: true } as Partial<ExcelJS.Alignment>
const pfAR = { horizontal: 'right',  vertical: 'center', wrapText: true } as Partial<ExcelJS.Alignment>
const pfALT= { horizontal: 'left',   vertical: 'top',    wrapText: true } as Partial<ExcelJS.Alignment>

// ─── ENTRADA PRINCIPAL ────────────────────────────────────────────────────────
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
    // Apenas UMA aba: MED 01, MED 02, etc.
    await gerarAbaPREF(wb, contrato, obra, medicao, servicos, linhasPorServico, logoBase64)
    await gerarAbaMEM(wb, contrato, obra, medicao, servicos, linhasPorServico, 'PREFEITURA')
  } else {
    await gerarAbaESTADO(wb, contrato, obra, medicao, servicos, linhasPorServico, logoBase64)
    await gerarAbaMEM(wb, contrato, obra, medicao, servicos, linhasPorServico, 'ESTADO')
  }

  const buffer = await wb.xlsx.writeBuffer()
  const blob   = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  saveAs(blob, `${obra.nome_obra.replace(/\s+/g,'_')}_MED${String(medicao.numero).padStart(2,'0')}.xlsx`)
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA ESTADO (modelo azul/laranja existente — inalterada)
// ═══════════════════════════════════════════════════════════════════════════════
async function gerarAbaESTADO(
  wb: ExcelJS.Workbook,
  contrato: Contrato,
  obra: Obra,
  medicao: Medicao,
  servicos: Servico[],
  linhasPorServico: Map<string, LinhaMemoria[]>,
  logoBase64?: string | null
) {
  const abaNome = `MED ${String(medicao.numero).padStart(2,'0')}`
  const ws = wb.addWorksheet(abaNome)

  const larguras = [6,14,14,48,6,10,13,13,13,14,8,10,12,12,12,12,13,13,13,13,13,13,8]
  larguras.forEach((w, i) => ws.getColumn(i + 1).width = w)

  ws.getRow(1).height = 8
  for (let c = 1; c <= 23; c++) ws.getCell(1, c).fill = solidFill(LARANJA)

  ws.getRow(2).height = 36; ws.getRow(3).height = 20
  ws.getRow(4).height = 20; ws.getRow(5).height = 16

  ws.mergeCells('A2:C5')
  ws.getCell('A2').fill = solidFill('FFFFFF')

  if (logoBase64) {
    try {
      const base64Data = logoBase64.split(',')[1] || logoBase64
      const ext = logoBase64.includes('png') ? 'png' : 'jpeg'
      const imageId = wb.addImage({ base64: base64Data, extension: ext as 'png'|'jpeg' })
      ws.addImage(imageId, { tl: { col:0, row:1 }, br: { col:3, row:5 }, editAs: 'oneCell' })
    } catch {}
  } else {
    setCell(ws, 'A2', contrato.empresa_executora, {
      font: { ...fB(10), color: { argb: `FF${AZ_ESCURO}` } }, align: align('center'),
    })
  }

  ws.mergeCells('D2:T2'); ws.mergeCells('D3:T3'); ws.mergeCells('D4:T4'); ws.mergeCells('D5:T5')
  setCell(ws,'D2', contrato.orgao_nome,    { font:fW(11), fill:solidFill(AZ_ESCURO), align:align('center'), border:mediumBorder() })
  setCell(ws,'D3', contrato.orgao_subdivisao||'', { font:fW(9), fill:solidFill(AZ_MEDIO), align:align('center') })
  setCell(ws,'D4', `OBRA: ${obra.nome_obra}  |  LOCAL: ${obra.local_obra}`, { font:fB(9), fill:solidFill(AZ_CABEC), align:align('center') })
  setCell(ws,'D5', `Contrato: ${obra.numero_contrato||'—'}  |  Empresa: ${contrato.empresa_executora}`, { font:fN(8), fill:solidFill(AZ_CABEC), align:align('center') })

  ws.mergeCells('U2:W2'); ws.mergeCells('U3:W3'); ws.mergeCells('U4:W4'); ws.mergeCells('U5:W5')
  setCell(ws,'U2',`${medicao.numero_extenso} MEDIÇÃO`, { font:{...fW(14)}, fill:solidFill(LARANJA), align:align('center'), border:mediumBorder() })
  setCell(ws,'U3',`Data: ${medicao.data_medicao ? new Date(medicao.data_medicao+'T00:00:00').toLocaleDateString('pt-BR') : '—'}`, { font:fN(8), fill:solidFill(AZ_CABEC), align:align('center') })
  setCell(ws,'U4',`Desc: ${(obra.desconto_percentual*100).toFixed(2)}%  |  BDI: ${(obra.bdi_percentual*100).toFixed(2)}%`, { font:fN(8), fill:solidFill(AZ_CABEC), align:align('center') })
  setCell(ws,'U5',`${obra.data_base_planilha||''}  |  Prazo: ${obra.prazo_execucao_dias}d`, { font:fN(8), fill:solidFill(AZ_CABEC), align:align('center') })

  ws.getRow(6).height = 16
  ws.mergeCells('A6:K6'); ws.mergeCells('L6:W6')
  setCell(ws,'A6','PLANILHA BASE',       { font:fW(9), fill:solidFill(AZ_ESCURO), align:align('center'), border:thinBorder() })
  setCell(ws,'L6','PLANILHA DE MEDIÇÃO', { font:fW(9), fill:solidFill(AZ_MEDIO),  align:align('center'), border:thinBorder() })

  ws.getRow(7).height = 28; ws.getRow(8).height = 30
  const h7: [string,string][] = [
    ['A7','ITEM'],['B7','FONTE'],['C7','CÓDIGO'],['D7','DESCRIÇÃO'],
    ['E7','UNID'],['F7','QUANTIDADE'],['G7','PREÇO\nUNITÁRIO R$'],
    ['J7','PREÇO\nTOTAL R$'],['K7','PESO (%)'],['L7','QUANTIDADES'],['Q7','PREÇOS R$'],
  ]
  const h8: [string,string][] = [
    ['G8','SINAPI'],['H8',`C/ DESCONTO\n(${(obra.desconto_percentual*100).toFixed(2)}%)`],
    ['I8','C/ BDI'],
    ['L8','PREVISTO'],['M8','ANTERIOR\nACUMULADA'],['N8','MEDIDA NO\nPERIODO'],
    ['O8','ACUMULADO'],['P8','SALDO\nCONTRATO'],['Q8','UNITÁRIO'],['R8','UNIT.\nC/ BDI'],
    ['S8','ANT.\nACUMULADO'],['T8','ACUMULADO'],['U8','NO PERIODO'],['V8','SALDO\nCONTRATO'],['W8','SALDO (%)'],
  ]
  h7.forEach(([a,v]) => setCell(ws,a,v, { font:fW(8), fill:solidFill(AZ_ESCURO), align:align('center'), border:thinBorder() }))
  h8.forEach(([a,v]) => setCell(ws,a,v, { font:fW(8), fill:solidFill(AZ_MEDIO),  align:align('center'), border:thinBorder() }))

  let row = 9
  const COR_GRUPO_ESTADO = AZ_CLARO
  for (const srv of [...servicos].sort((a,b) => a.ordem - b.ordem)) {
    const pDesc    = calcPrecoComDesconto(srv.preco_unitario, obra.desconto_percentual)
    const pBDI     = calcPrecoComBDI(pDesc, obra.bdi_percentual)
    const pTotal   = calcPrecoTotal(srv.quantidade, pBDI)
    ws.getRow(row).height = srv.descricao.length > 80 ? 42 : 26

    if (srv.is_grupo) {
      ws.mergeCells(`D${row}:F${row}`)
      'ABCDEFGHIJKLMNOPQRSTUVW'.split('').forEach(c => {
        const cell = ws.getCell(`${c}${row}`)
        cell.fill = solidFill(COR_GRUPO_ESTADO); cell.font = fB(9); cell.border = thinBorder()
      })
      ws.getCell(`A${row}`).value = srv.item;     ws.getCell(`A${row}`).alignment = align('center')
      ws.getCell(`D${row}`).value = srv.descricao; ws.getCell(`D${row}`).alignment = align('left')
      ws.getCell(`J${row}`).value = pTotal;       ws.getCell(`J${row}`).numFmt = '#,##0.00'; ws.getCell(`J${row}`).alignment = align('right')
    } else {
      const linhas = linhasPorServico.get(srv.id) || []
      const { qtdAnterior, qtdPeriodo, qtdAcumulada, qtdSaldo } = calcResumoServico(srv, linhas)
      const rowFill = row % 2 === 0 ? solidFill('F2F7FC') : solidFill('FFFFFF')
      type CD = [string, ExcelJS.CellValue, string, ExcelJS.Alignment['horizontal']]
      const cols: CD[] = [
        ['A',srv.item,'@','center'],['B',srv.fonte,'@','center'],['C',srv.codigo||'','@','center'],
        ['D',srv.descricao,'@','left'],['E',srv.unidade,'@','center'],['F',srv.quantidade,'#,##0.0000','right'],
        ['G',srv.preco_unitario,'#,##0.00','right'],['H',pDesc,'#,##0.00','right'],['I',pBDI,'#,##0.00','right'],
        ['J',pTotal,'#,##0.00','right'],['K',0,'0.00%','right'],
        ['L',srv.quantidade,'#,##0.0000','right'],['M',qtdAnterior,'#,##0.0000','right'],
        ['N',qtdPeriodo,'#,##0.0000','right'],['O',qtdAcumulada,'#,##0.0000','right'],['P',qtdSaldo,'#,##0.0000','right'],
        ['Q',pDesc,'#,##0.00','right'],['R',pBDI,'#,##0.00','right'],
        ['S',qtdAnterior*pBDI,'#,##0.00','right'],['T',qtdAcumulada*pBDI,'#,##0.00','right'],
        ['U',qtdPeriodo*pBDI,'#,##0.00','right'],
        ['V',pTotal - qtdAcumulada*pBDI,'#,##0.00','right'],
        ['W',pTotal > 0 ? (pTotal - qtdAcumulada*pBDI)/pTotal : 0,'0.00%','right'],
      ]
      cols.forEach(([col, val, fmt, al]) => {
        const c = ws.getCell(`${col}${row}`)
        c.value = val; c.numFmt = fmt; c.font = fN(8); c.fill = rowFill; c.border = thinBorder(); c.alignment = align(al)
      })
      if (qtdPeriodo > 0) { ws.getCell(`N${row}`).fill = solidFill('FFF2CC'); ws.getCell(`N${row}`).font = fB(8) }
      if (qtdAcumulada >= srv.quantidade && srv.quantidade > 0) {
        ws.getCell(`W${row}`).fill = solidFill(VERDE_OK); ws.getCell(`W${row}`).font = fW(8)
      }
    }
    row++
  }

  const rTot = row; ws.getRow(rTot).height = 22
  ws.mergeCells(`A${rTot}:I${rTot}`)
  setCell(ws,`A${rTot}`,'TOTAIS GERAIS DO ORÇAMENTO', { font:fW(10), fill:solidFill(AZ_ESCURO), align:align('center'), border:mediumBorder() })
  const vals = calcValoresMedicao(servicos, linhasPorServico, obra)
  ;[`J${rTot}`,`T${rTot}`,`U${rTot}`,`V${rTot}`].forEach((a, i) => {
    const v = [vals.totalOrcamento, vals.valorAcumulado, vals.valorPeriodo, vals.valorSaldo][i]
    setCell(ws, a, v, { font:fW(9), fill:solidFill(AZ_ESCURO), align:align('right'), border:mediumBorder(), numFmt:'#,##0.00' })
  })

  const rExt = rTot + 2; ws.mergeCells(`A${rExt}:W${rExt}`); ws.getRow(rExt).height = 24
  setCell(ws,`A${rExt}`,
    `A presente medição importa o valor de: ${valorPorExtenso(vals.valorPeriodo).toUpperCase()} — ${new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(vals.valorPeriodo)}`,
    { font:fB(10), fill:solidFill('FFF8E7'), align:align('left'), border:{ bottom:{style:'medium',color:{argb:`FF${LARANJA}`}} } }
  )

  const rDemo = rExt + 3
  ws.mergeCells(`A${rDemo-1}:E${rDemo-1}`); ws.getRow(rDemo-1).height = 18
  setCell(ws,`A${rDemo-1}`,'DEMONSTRATIVO FINANCEIRO', { font:fW(10), fill:solidFill(AZ_ESCURO), align:align('center'), border:mediumBorder() })
  const demo: [string, number, string][] = [
    ['VALOR TOTAL DO ORÇAMENTO',         vals.totalOrcamento,      '#,##0.00'],
    [`VALOR ${medicao.numero_extenso} MEDIÇÃO`, vals.valorPeriodo, '#,##0.00'],
    ['PERCENTUAL DA MEDIÇÃO',            vals.percentualPeriodo,   '0.00%'],
    ['FATURADO ACUMULADO',               vals.valorAcumulado,      '#,##0.00'],
    ['PERCENTUAL ACUMULADO',             vals.percentualAcumulado, '0.00%'],
    ['SALDO DO CONTRATO',                vals.valorSaldo,          '#,##0.00'],
    ['PERCENTUAL DO SALDO',              vals.percentualSaldo,     '0.00%'],
  ]
  demo.forEach(([label, val, fmt], i) => {
    const r = rDemo + i; ws.getRow(r).height = 16
    ws.mergeCells(`A${r}:D${r}`)
    const bg = i % 2 === 0 ? solidFill('EBF3FB') : solidFill('FFFFFF')
    setCell(ws,`A${r}`,label, { font:fN(9), fill:bg, align:align('left'), border:thinBorder() })
    setCell(ws,`E${r}`,val,   { font:fB(9), fill:bg, align:align('right'), border:thinBorder(), numFmt:fmt })
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA PREFEITURA — MED 01, MED 02… (PREV 02 renomeada como MED XX)
// Layout: 19 colunas A–S, exatamente como o modelo PREV 02
// Novidades: cinza no cabeçalho, verde em PLANILHA DE MEDIÇÃO, verde nos dados
// ═══════════════════════════════════════════════════════════════════════════════
async function gerarAbaPREF(
  wb: ExcelJS.Workbook,
  contrato: Contrato,
  obra: Obra,
  medicao: Medicao,
  servicos: Servico[],
  linhasPorServico: Map<string, LinhaMemoria[]>,
  logoBase64?: string | null
) {
  // Nome da aba = MED 01, MED 02…
  const abaNome = `MED ${String(medicao.numero).padStart(2,'0')}`
  const ws = wb.addWorksheet(abaNome)

  // Larguras exatamente como no modelo PREV 02
  const W = [9.33, 13.44, 52.78, 9.66, 5.11, 8.0, 7.89, 7.89, 13.11, 10.0, 10.0, 11.11, 7.89, 10.0, 10.0, 11.44, 11.78, 10.0, 7.89]
  W.forEach((w, i) => ws.getColumn(i + 1).width = w)

  ws.getRow(1).height  = 14.4
  ws.getRow(9).height  = 16
  ws.getRow(10).height = 8    // linha separadora
  ws.getRow(11).height = 12
  ws.getRow(12).height = 30

  const N2  = '#,##0.00'
  const N4  = '#,##0.0000'
  const PCT = '0.00%'
  const DAT = 'DD/MM/YYYY'

  const dataEmissao = medicao.data_medicao
    ? new Date(medicao.data_medicao + 'T00:00:00')
    : new Date()

  // ── BLOCO LOGO (A1:B9) ────────────────────────────────────────────────────
  ws.mergeCells('A1:B9')
  ws.getCell('A1').fill = solidFill(PF_CINZA_LOGO)
  if (logoBase64) {
    try {
      const base64Data = logoBase64.split(',')[1] || logoBase64
      const ext = logoBase64.includes('png') ? 'png' : 'jpeg'
      const imgId = wb.addImage({ base64: base64Data, extension: ext as 'png'|'jpeg' })
      ws.addImage(imgId, { tl:{col:0,row:0}, br:{col:2,row:9}, editAs:'oneCell' })
    } catch {}
  }

  // ── BLOCO EMPRESA RD (N1:S9) — fundo CINZA ───────────────────────────────
  ws.mergeCells('N1:S9')
  setCell(ws,'N1',
    'RD CONSTRUTORA LTDA\nRUA BELA VISTA, 874, JARDINS, SÃO GONÇALO DO AMARANTE/RN\nCEP: 59293-576, CNPJ: 43.357.757/0001-40\nemail: rd_solucoes@outlook.com\ntel.: (84) 99641-8124',
    { font: pf8(true), align: pfALT, fill: solidFill(PF_CINZA_LOGO) }
  )

  // ── LINHAS 1-9 CABEÇALHO CENTRAL (C..M) ─────────────────────────────────
  // L1: labels finos
  ws.mergeCells('D1:G1')
  setCell(ws,'C1','CONCEDENTE',          { font:pf8(), align:pfAL })
  setCell(ws,'D1','Data de emissão BM',  { font:pf8(), align:pfAL })
  ws.mergeCells('H1:J1')
  setCell(ws,'H1','Período de referência',{ font:pf8(), align:pfAL })
  // K1:M1 = VALOR DO CONTRATO — fundo CINZA
  ws.mergeCells('K1:M1')
  setCell(ws,'K1','VALOR DO CONTRATO', {
    font:pf8(), align:pfAC, fill:solidFill(PF_CINZA_HDR), border:thinBorder(),
  })

  // L2: concedente + data + período + valor contrato
  ws.mergeCells('D2:G2')
  setCell(ws,'C2', contrato.orgao_nome||'', { font:pf8(true), align:pfAL })
  setCell(ws,'D2', dataEmissao,              { font:pf8(true), align:pfAL, numFmt:DAT })
  ws.mergeCells('H2:J2')
  // período ex: "01/01/2026 a 06/02/2026" — usamos data_medicao como data final
  const dtFim = medicao.data_medicao ? new Date(medicao.data_medicao+'T00:00:00').toLocaleDateString('pt-BR') : '—'
  setCell(ws,'H2', dtFim, { font:pf8(true), align:pfAL })
  ws.mergeCells('K2:M2')
  // Preenchido depois com SUM dos grupos

  // L3: convenete + objetivo
  ws.mergeCells('D3:J3')
  setCell(ws,'C3','CONVENETE',                    { font:pf8(), align:pfAL })
  setCell(ws,'D3','OBJETIVO DA ORDEM DE SERVIÇO', { font:pf8(), align:pfAL })
  ws.mergeCells('K3:M3')
  setCell(ws,'K3',`VALOR DA O.S. ${contrato.numero_contrato||''}`, { font:pf8(), align:pfAL })

  // L4-6: concedente (nome grande) + processo licitatório + valor OS
  ws.mergeCells('D4:J6')
  setCell(ws,'C4', contrato.orgao_nome||'', { font:pf8(true), align:pfAL })
  setCell(ws,'D4', obra.nome_obra||'',       { font:pf8(true), align:pfAL })
  ws.mergeCells('C5:C6')
  setCell(ws,'C5','PROCESSO LICITATÓRIO', { font:pf8(), align:pfAL })
  ws.mergeCells('K4:M4')
  // K4 = =K2 (preenchido depois)
  ws.mergeCells('K5:M5')
  setCell(ws,'K5','VALOR ACUMULADO', {
    font:pf8(), align:pfAC, fill:solidFill(PF_CINZA_HDR), border:thinBorder(),
  })
  ws.mergeCells('K6:M6')
  setCell(ws,'K6',{ formula:'SUM(Q14:Q10000)' } as any, {
    font:pf8(true), align:pfAR, border:thinBorder(), numFmt:N2,
  })

  // L7: empresa
  ws.mergeCells('D7:J7')
  setCell(ws,'C7','EMPRESA CONTRATADA', { font:pf8(), align:pfAL })
  setCell(ws,'D7','CNPJ',               { font:pf8(), align:pfAL })
  ws.mergeCells('K7:M7')
  setCell(ws,'K7','SALDO EM CONTRATO', {
    font:pf8(), align:pfAC, fill:solidFill(PF_CINZA_HDR), border:thinBorder(),
  })

  // L8: empresa contratada + cnpj + saldo
  ws.mergeCells('D8:J8')
  setCell(ws,'C8', contrato.empresa_executora||'', { font:pf8(true), align:pfAL })
  setCell(ws,'D8','43.357.757/0001-40',             { font:pf8(true), align:pfAL })
  ws.mergeCells('K8:M8')
  setCell(ws,'K8',{ formula:'K2-K6' } as any, {
    font:pf8(true), align:pfAR, border:thinBorder(), numFmt:N2,
  })

  // L9: boletim
  ws.mergeCells('D9:F9')
  setCell(ws,'C9',`BOLETIM DE MEDIÇÃO - N° ${medicao.numero}`, { font:pf8(true), align:pfAL })
  setCell(ws,'D9','EMISSÃO DO BM', { font:pf8(), align:pfAL })
  ws.mergeCells('G9:H9')
  setCell(ws,'G9', dataEmissao, { font:pf8(true), align:pfAC, numFmt:DAT })
  ws.mergeCells('I9:J9')
  setCell(ws,'I9','VALOR MEDIDO NO PERÍODO:', { font:pf8(), align:pfAL })
  ws.mergeCells('K9:M9')
  setCell(ws,'K9',{ formula:'SUM(P14:P10000)' } as any, {
    font:pf9(true), align:pfAR, border:thinBorder(), numFmt:N2,
    fill: solidFill(PF_VERDE_DADOS),  // verde claro no valor medido
  })

  // ── CABEÇALHO DA TABELA (rows 11-12) ────────────────────────────────────
  // Mesclagens
  ws.mergeCells('A11:A12'); ws.mergeCells('B11:B12'); ws.mergeCells('C11:C12')
  ws.mergeCells('D11:D12'); ws.mergeCells('E11:E12'); ws.mergeCells('F11:F12')
  ws.mergeCells('G11:H11')  // PREÇO UNITÁRIO R$
  ws.mergeCells('I11:J11')  // PREÇO TOTAL R$ (com colunas COM BDI + DESCONTO)
  ws.mergeCells('K11:S11')  // PLANILHA DE MEDIÇÃO — VERDE

  // Fundo cinza/azul para colunas A-J (cabeçalho base)
  const hTabFill = solidFill(PF_AZUL_TABCAB)
  ;['A11','B11','C11','D11','E11','F11'].forEach(a =>
    setCell(ws, a, ['ITEM','CÓDIGO','DESCRIÇÃO','FONTE','UNID','QUANTIDADE'][['A11','B11','C11','D11','E11','F11'].indexOf(a)], {
      font:pf6(true), align:pfAC, fill:hTabFill, border:thinBorder(),
    })
  )
  setCell(ws,'G11','PREÇO UNITÁRIO R$',  { font:pf6(true), align:pfAC, fill:hTabFill, border:thinBorder() })
  setCell(ws,'I11','PREÇO TOTAL R$',     { font:pf6(true), align:pfAC, fill:hTabFill, border:thinBorder() })

  // K11-S11 = PLANILHA DE MEDIÇÃO — fundo VERDE
  setCell(ws,'K11','PLANILHA DE MEDIÇÃO', {
    font:{ name:'Arial', size:7, bold:true, color:{ argb:'FFFFFFFF' } },
    align:pfAC, fill:solidFill(PF_VERDE_MED), border:thinBorder(),
  })

  // Row 12 — sub-cabeçalhos
  ;['A12','B12','C12','D12','E12','F12'].forEach(a =>
    setCell(ws, a, '', { fill:hTabFill, border:thinBorder() })
  )
  // G12, H12 = SEM BDI / COM BDI — azul claro
  setCell(ws,'G12','SEM BDI', { font:pf6(true), align:pfAC, fill:hTabFill, border:thinBorder() })
  setCell(ws,'H12','COM BDI', { font:pf6(true), align:pfAC, fill:hTabFill, border:thinBorder() })
  // I12, J12 = COM BDI / DESCONTO — azul claro
  setCell(ws,'I12','COM BDI',                                        { font:pf6(true), align:pfAC, fill:hTabFill, border:thinBorder() })
  setCell(ws,'J12',`DESCONTO ${(obra.desconto_percentual*100).toFixed(1)}%`, { font:pf6(true), align:pfAC, fill:hTabFill, border:thinBorder() })
  // K12..S12 = sub-cabeçalhos verdes claros
  const verdeClaro = solidFill('C6EFCE')  // verde claro para sub-headers da planilha medição
  ;[
    ['K12','ACUMULADO ANTERIOR'],['L12','MED. NO PERÍODO'],['M12','(%)'],
    ['N12','ACUMULADO ATUAL (UND)'],['O12','SALDO (UND)'],
    ['P12','MED. ATUAL (R$)'],['Q12','ACUMULADO (R$)'],['R12','SALDO (R$)'],['S12','(%)'],
  ].forEach(([a,t]) => setCell(ws, a, t, { font:pf6(true), align:pfAC, fill:verdeClaro, border:thinBorder() }))

  // ── DADOS ─────────────────────────────────────────────────────────────────
  const grupos = servicos.filter(s =>  s.is_grupo).sort((a,b) => a.ordem - b.ordem)
  const itens  = servicos.filter(s => !s.is_grupo)
  let dataRow  = 13
  const grupoRefs: { gRow: number; iRows: number[] }[] = []

  for (const grp of grupos) {
    ws.getRow(dataRow).height = 14
    const gRow = dataRow

    ws.mergeCells(`B${dataRow}:H${dataRow}`)
    // Linha de grupo: fundo CINZA (como no modelo)
    const gFill = solidFill('D9D9D9')
    ;['A','B','C','D','E','F','G','H','I','J'].forEach(c =>
      { ws.getCell(`${c}${dataRow}`).fill = gFill; ws.getCell(`${c}${dataRow}`).border = thinBorder() }
    )
    setCell(ws,`A${dataRow}`, grp.item,     { font:pf6(true), align:pfAL, fill:gFill, border:thinBorder() })
    setCell(ws,`B${dataRow}`, grp.descricao,{ font:pf6(true), align:pfAL, fill:gFill, border:thinBorder() })
    setCell(ws,`I${dataRow}`, null,          { fill:gFill, border:thinBorder() })
    setCell(ws,`J${dataRow}`, null,          { fill:gFill, border:thinBorder() })

    // Colunas K..S grupo: apenas borda superior
    const thin = { style: 'thin' as ExcelJS.BorderStyle }
    ws.getCell(`K${dataRow}`).border = { top:thin, left:thin }
    'LMNOPQR'.split('').forEach(c => { ws.getCell(`${c}${dataRow}`).border = { top:thin } })
    ws.getCell(`S${dataRow}`).border = { top:thin, right:thin }

    dataRow++
    const iRows: number[] = []

    const filhos = itens.filter(s =>
      s.grupo_item === grp.item ||
      s.grupo_item === `${grp.item}.0` ||
      s.grupo_item === String(parseFloat(grp.item))
    )

    for (const srv of filhos) {
      ws.getRow(dataRow).height = 27
      const r = dataRow
      const linhas = linhasPorServico.get(srv.id) || []
      const { qtdAnterior, qtdPeriodo } = calcResumoServico(srv, linhas)
      const pDesc = calcPrecoComDesconto(srv.preco_unitario, obra.desconto_percentual)
      const pBDI  = calcPrecoComBDI(pDesc, obra.bdi_percentual)
      const pTot  = pBDI * srv.quantidade
      const temPeriodo = qtdPeriodo > 0

      // Fundo VERDE CLARO para linhas onde há medição no período
      const rowFill = temPeriodo ? solidFill(PF_VERDE_DADOS) : solidFill(PF_BRANCO)
      const rowFillNums = temPeriodo ? solidFill(PF_VERDE_DADOS) : solidFill('F9F9F9')

      setCell(ws,`A${r}`, srv.item,       { font:pf6(), align:pfAL, border:thinBorder(), fill:rowFill })
      setCell(ws,`B${r}`, srv.codigo,     { font:pf6(), align:pfAC, border:thinBorder(), fill:rowFill })
      setCell(ws,`C${r}`, srv.descricao,  { font:pf6(), align:pfAL, border:thinBorder(), fill:rowFill })
      setCell(ws,`D${r}`, srv.fonte,      { font:pf6(), align:pfAC, border:thinBorder(), fill:rowFill })
      setCell(ws,`E${r}`, srv.unidade,    { font:pf6(), align:pfAC, border:thinBorder(), fill:rowFill })
      setCell(ws,`F${r}`, srv.quantidade, { font:pf6(), align:pfAR, border:thinBorder(), fill:rowFill, numFmt:N4 })
      setCell(ws,`G${r}`, pDesc,          { font:pf6(), align:pfAR, border:thinBorder(), fill:rowFill, numFmt:N2 })
      setCell(ws,`H${r}`, pBDI,           { font:pf6(), align:pfAR, border:thinBorder(), fill:rowFill, numFmt:N2 })
      setCell(ws,`I${r}`, pTot,           { font:pf6(), align:pfAR, border:thinBorder(), fill:rowFill, numFmt:N2 })

      // J = I * (1 - desconto)
      ws.getCell(`J${r}`).value     = { formula:`I${r}*(1-${obra.desconto_percentual})` } as any
      ws.getCell(`J${r}`).font      = pf6() as ExcelJS.Font
      ws.getCell(`J${r}`).alignment = pfAR as ExcelJS.Alignment
      ws.getCell(`J${r}`).border    = thinBorder() as ExcelJS.Borders
      ws.getCell(`J${r}`).numFmt    = N2
      ws.getCell(`J${r}`).fill      = rowFill

      // K = acumulado anterior
      setCell(ws,`K${r}`, qtdAnterior, { font:pf6(), align:pfAC, border:thinBorder(), numFmt:N4,
        fill: qtdAnterior > 0 ? solidFill(PF_VERDE_DADOS) : solidFill(PF_BRANCO),
      })

      // L = medido no período — VERDE se > 0
      setCell(ws,`L${r}`, qtdPeriodo, { font:pf6(temPeriodo), align:pfAC, border:thinBorder(), numFmt:N4,
        fill: temPeriodo ? solidFill(PF_VERDE_DADOS) : solidFill(PF_BRANCO),
      })

      // M = L/F (%)
      ws.getCell(`M${r}`).value     = { formula:`IF(F${r}=0,0,L${r}/F${r})` } as any
      ws.getCell(`M${r}`).font      = pf6() as ExcelJS.Font
      ws.getCell(`M${r}`).alignment = pfAC as ExcelJS.Alignment
      ws.getCell(`M${r}`).border    = thinBorder() as ExcelJS.Borders
      ws.getCell(`M${r}`).numFmt    = PCT
      ws.getCell(`M${r}`).fill      = temPeriodo ? solidFill(PF_VERDE_DADOS) : solidFill(PF_BRANCO)

      // N = K+L
      ws.getCell(`N${r}`).value     = { formula:`K${r}+L${r}` } as any
      ws.getCell(`N${r}`).font      = pf6() as ExcelJS.Font
      ws.getCell(`N${r}`).alignment = pfAC as ExcelJS.Alignment
      ws.getCell(`N${r}`).border    = thinBorder() as ExcelJS.Borders
      ws.getCell(`N${r}`).numFmt    = N4
      ws.getCell(`N${r}`).fill      = solidFill(PF_BRANCO)

      // O = F-N (saldo UND)
      ws.getCell(`O${r}`).value     = { formula:`F${r}-N${r}` } as any
      ws.getCell(`O${r}`).font      = pf6() as ExcelJS.Font
      ws.getCell(`O${r}`).alignment = pfAC as ExcelJS.Alignment
      ws.getCell(`O${r}`).border    = thinBorder() as ExcelJS.Borders
      ws.getCell(`O${r}`).numFmt    = N4
      ws.getCell(`O${r}`).fill      = solidFill(PF_BRANCO)

      // P = L*H*(1-desconto) — MED ATUAL R$ — VERDE
      ws.getCell(`P${r}`).value     = { formula:`L${r}*H${r}*(1-${obra.desconto_percentual})` } as any
      ws.getCell(`P${r}`).font      = pf6(temPeriodo) as ExcelJS.Font
      ws.getCell(`P${r}`).alignment = pfAC as ExcelJS.Alignment
      ws.getCell(`P${r}`).border    = thinBorder() as ExcelJS.Borders
      ws.getCell(`P${r}`).numFmt    = N2
      ws.getCell(`P${r}`).fill      = temPeriodo ? solidFill(PF_VERDE_DADOS) : solidFill(PF_BRANCO)

      // Q = N*H*(1-desconto) — ACUMULADO R$
      ws.getCell(`Q${r}`).value     = { formula:`N${r}*H${r}*(1-${obra.desconto_percentual})` } as any
      ws.getCell(`Q${r}`).font      = pf6() as ExcelJS.Font
      ws.getCell(`Q${r}`).alignment = pfAC as ExcelJS.Alignment
      ws.getCell(`Q${r}`).border    = thinBorder() as ExcelJS.Borders
      ws.getCell(`Q${r}`).numFmt    = N2
      ws.getCell(`Q${r}`).fill      = solidFill(PF_BRANCO)

      // R = H*O*(1-desconto) — SALDO R$
      ws.getCell(`R${r}`).value     = { formula:`H${r}*O${r}*(1-${obra.desconto_percentual})` } as any
      ws.getCell(`R${r}`).font      = pf6() as ExcelJS.Font
      ws.getCell(`R${r}`).alignment = pfAC as ExcelJS.Alignment
      ws.getCell(`R${r}`).border    = thinBorder() as ExcelJS.Borders
      ws.getCell(`R${r}`).numFmt    = N2
      ws.getCell(`R${r}`).fill      = solidFill(PF_BRANCO)

      // S = N/F (%) — VERDE se 100%
      ws.getCell(`S${r}`).value     = { formula:`IF(F${r}=0,0,N${r}/F${r})` } as any
      ws.getCell(`S${r}`).font      = pf6() as ExcelJS.Font
      ws.getCell(`S${r}`).alignment = pfAC as ExcelJS.Alignment
      ws.getCell(`S${r}`).border    = thinBorder() as ExcelJS.Borders
      ws.getCell(`S${r}`).numFmt    = PCT
      // Verde sólido se item 100% executado
      const pctAcum = srv.quantidade > 0 ? (qtdAnterior + qtdPeriodo) / srv.quantidade : 0
      ws.getCell(`S${r}`).fill = pctAcum >= 1 ? solidFill(PF_VERDE_MED) : solidFill(PF_BRANCO)

      iRows.push(dataRow)
      dataRow++
    }
    grupoRefs.push({ gRow, iRows })
  }

  // ── Totais por grupo ──────────────────────────────────────────────────────
  let totalOsFormula = ''
  for (const { gRow, iRows } of grupoRefs) {
    if (!iRows.length) continue
    const fI = iRows.map(r => `I${r}`).join('+')
    const fJ = iRows.map(r => `J${r}`).join('+')
    ws.getCell(`I${gRow}`).value     = { formula: fI } as any
    ws.getCell(`I${gRow}`).font      = pf6(true) as ExcelJS.Font
    ws.getCell(`I${gRow}`).alignment = pfAR as ExcelJS.Alignment
    ws.getCell(`I${gRow}`).numFmt    = N2
    ws.getCell(`J${gRow}`).value     = { formula: fJ } as any
    ws.getCell(`J${gRow}`).font      = pf6(true) as ExcelJS.Font
    ws.getCell(`J${gRow}`).alignment = pfAR as ExcelJS.Alignment
    ws.getCell(`J${gRow}`).numFmt    = N2
    totalOsFormula += (totalOsFormula?',':'') + `I${gRow}`
  }
  if (totalOsFormula) {
    ws.getCell('K2').value = { formula:`SUM(${totalOsFormula})` } as any
    ws.getCell('K2').font  = pf8(true) as ExcelJS.Font
    ws.getCell('K2').alignment = pfAR as ExcelJS.Alignment
    ws.getCell('K2').numFmt    = N2
    ws.getCell('K4').value = { formula:'K2' } as any
    ws.getCell('K4').font  = pf8(true) as ExcelJS.Font
    ws.getCell('K4').alignment = pfAR as ExcelJS.Alignment
    ws.getCell('K4').numFmt    = N2
  }

  ws.views = [{ state:'frozen', xSplit:0, ySplit:12 }]
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA MEM — Memória de Cálculo (ESTADO=azul, PREFEITURA=verde)
// ═══════════════════════════════════════════════════════════════════════════════
async function gerarAbaMEM(
  wb: ExcelJS.Workbook,
  contrato: Contrato,
  obra: Obra,
  medicao: Medicao,
  servicos: Servico[],
  linhasPorServico: Map<string, LinhaMemoria[]>,
  palette: 'ESTADO' | 'PREFEITURA' = 'ESTADO'
) {
  const isPref = palette === 'PREFEITURA'

  // Paleta
  const COR_TITULO    = isPref ? '375623' : AZ_ESCURO   // título principal
  const COR_SUBTIT    = isPref ? '70AD47' : AZ_MEDIO    // subtítulo e cabeçalho
  const COR_GRUPO     = isPref ? 'E2EFDA' : AZ_CLARO    // linha de grupo
  const COR_GRUPO_FNT = isPref ? '375623' : AZ_ESCURO   // fonte do grupo
  const COR_APAGAR    = isPref ? 'C6EFCE' : 'E2EFDA'    // A pagar
  const COR_PAGO      = isPref ? 'BDD7EE' : 'DDEEFF'    // Pago
  const COR_NEXEC     = 'FCE4D6'                          // Não executado
  const COR_TOT_AC    = isPref ? 'A9D08E' : CINZA_SUB   // total acumulado
  const COR_TOT_ANT   = isPref ? 'C6EFCE' : 'DDEEFF'    // total anterior
  const COR_TOT_MES   = isPref ? 'FFEB9C' : 'FFF2CC'    // total mês

  const abaNome = `MEM ${String(medicao.numero).padStart(2,'0')}`
  const ws = wb.addWorksheet(abaNome)
  const larguras = [8, 42, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 14, 22]
  larguras.forEach((w, i) => ws.getColumn(i + 1).width = w)

  // Faixa decorativa topo
  ws.getRow(1).height = 8
  for (let c = 1; c <= 14; c++)
    ws.getCell(1, c).fill = solidFill(isPref ? '70AD47' : LARANJA)

  // Cabeçalho
  ws.mergeCells('A2:N2'); ws.getRow(2).height = 30
  ws.mergeCells('A3:N3'); ws.getRow(3).height = 16
  ws.mergeCells('A4:N4'); ws.getRow(4).height = 14
  ws.mergeCells('A5:N5'); ws.getRow(5).height = 22

  setCell(ws,'A2', contrato.orgao_nome,              { font:{...fW(11), color:{argb:`FF${isPref?'FFFFFFFF':'FFFFFFFF'}`}}, fill:solidFill(COR_TITULO), align:align('center') })
  setCell(ws,'A3', contrato.orgao_subdivisao||'',    { font:{bold:true,size:9,name:'Arial',color:{argb:`FF${isPref?'FFFFFFFF':'FFFFFFFF'}`}}, fill:solidFill(COR_SUBTIT), align:align('center') })
  setCell(ws,'A4', obra.nome_obra,                    { font:fB(9), fill:solidFill(COR_GRUPO), align:align('center') })
  setCell(ws,'A5','MEMÓRIA DE CÁLCULO',               { font:{bold:true,size:12,name:'Arial Narrow',color:{argb:'FFFFFFFF'}}, fill:solidFill(COR_TITULO), align:align('center') })

  // Sub-info
  ws.mergeCells('A6:N6'); ws.getRow(6).height = 14
  setCell(ws,'A6',`${medicao.numero_extenso} Medição  |  ${obra.local_obra}  |  ${medicao.data_medicao ? new Date(medicao.data_medicao+'T00:00:00').toLocaleDateString('pt-BR') : ''}`,
    { font:fN(8), fill:solidFill(isPref ? 'E2EFDA' : AZ_CABEC), align:align('center') }
  )

  // Cabeçalho da tabela
  ws.getRow(8).height = 30
  const hMEM = ['ITEM','DESCRIÇÃO','Larg.','Comp.','Altura','Perim.','Área','Vol.','Kg','Outros','Desc.','Qtde','TOTAL','OBSERVAÇÃO']
  hMEM.forEach((h, i) => {
    setCell(ws, `${String.fromCharCode(65+i)}8`, h, {
      font: { bold:true, size:9, name:'Arial Narrow', color:{argb:'FFFFFFFF'} },
      fill: solidFill(COR_SUBTIT), align: align('center'), border: thinBorder(),
    })
  })

  // Dados
  let row = 9
  const servicosOrdenados = servicos.filter(s => !s.is_grupo).sort((a,b) => a.ordem - b.ordem)

  for (const srv of servicosOrdenados) {
    const linhas = linhasPorServico.get(srv.id) || []

    // Título do serviço
    ws.mergeCells(`A${row}:B${row}`); ws.getRow(row).height = 20
    'ABCDEFGHIJKLMN'.split('').forEach(c => {
      const cell = ws.getCell(`${c}${row}`)
      cell.fill = solidFill(COR_GRUPO)
      cell.font = { bold:true, size:9, name:'Arial Narrow', color:{argb:`FF${COR_GRUPO_FNT}`} }
      cell.border = thinBorder()
    })
    ws.getCell(`A${row}`).value     = srv.item;     ws.getCell(`A${row}`).alignment = align('center')
    ws.getCell(`B${row}`).value     = `${srv.descricao} — ${srv.unidade}`
    ws.getCell(`B${row}`).alignment = align('left')
    row++

    // Linhas
    for (const linha of [...linhas].sort((a,b) => a.sub_item.localeCompare(b.sub_item))) {
      ws.getRow(row).height = 16
      const sf = linha.status === 'A pagar' ? solidFill(COR_APAGAR)
               : linha.status === 'Pago'    ? solidFill(COR_PAGO)
               :                              solidFill(COR_NEXEC)

      const campos: [string, ExcelJS.CellValue, string][] = [
        ['A', linha.sub_item,              '@'],
        ['B', linha.descricao_calculo,     '@'],
        ['C', linha.largura??null,         '#,##0.0000'],
        ['D', linha.comprimento??null,     '#,##0.0000'],
        ['E', linha.altura??null,          '#,##0.0000'],
        ['F', linha.perimetro??null,       '#,##0.0000'],
        ['G', linha.area??null,            '#,##0.0000'],
        ['H', linha.volume??null,          '#,##0.0000'],
        ['I', linha.kg??null,              '#,##0.0000'],
        ['J', linha.outros??null,          '#,##0.0000'],
        ['K', linha.desconto_dim??null,    '#,##0.0000'],
        ['L', linha.quantidade??null,      '#,##0.0000'],
        ['M', linha.total,                 '#,##0.0000'],
        ['N', linha.status,                '@'],
      ]
      campos.forEach(([c, v, fmt]) => {
        const cell = ws.getCell(`${c}${row}`)
        cell.value     = v
        cell.fill      = sf
        cell.font      = c === 'M' ? fB(9) : fN(c === 'A'||c === 'B'||c === 'N' ? 9 : 8)
        cell.border    = thinBorder()
        cell.numFmt    = fmt
        cell.alignment = align(c === 'A'||c === 'B'||c === 'N' ? 'left' : 'right')
      })
      row++
    }

    // Totalizadores
    const qtdAnt = linhas.filter(l => l.status==='Pago').reduce((s,l)=>s+l.total,0)
    const qtdPer = linhas.filter(l => l.status==='A pagar').reduce((s,l)=>s+l.total,0)
    const tots: [string, number, string][] = [
      ['TOTAL ACUMULADO',          qtdAnt+qtdPer, COR_TOT_AC],
      ['TOTAL ACUMULADO ANTERIOR', qtdAnt,        COR_TOT_ANT],
      ['TOTAL DO MÊS (A PAGAR)',   qtdPer,        COR_TOT_MES],
    ]
    tots.forEach(([label, val, cor]) => {
      ws.getRow(row).height = 16
      ws.mergeCells(`A${row}:L${row}`)
      setCell(ws,`A${row}`, label, { font:fB(9), fill:solidFill(cor), align:align('right'), border:thinBorder() })
      setCell(ws,`M${row}`, val,   { font:fB(9), fill:solidFill(cor), align:align('right'), border:thinBorder(), numFmt:'#,##0.0000' })
      ws.getCell(`N${row}`).fill = solidFill(cor); ws.getCell(`N${row}`).border = thinBorder()
      row++
    })
    row++ // espaço
  }
}
