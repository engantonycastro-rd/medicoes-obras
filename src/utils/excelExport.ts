import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import { Contrato, Obra, Medicao, Servico, LinhaMemoria } from '../types'
import {
  calcPrecoComBDI, calcTotalServico,
  calcResumoServico, calcValoresMedicao, valorPorExtenso,
} from './calculations'
import type { ModeloPlanilha, BorderStyle } from '../lib/modeloStore'
import { MODELO_ESTADO_DEFAULT, MODELO_PREFEITURA_DEFAULT } from '../lib/modeloStore'

// ─── HELPERS GENÉRICOS ───────────────────────────────────────────────────────
function solidFill(hex: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${hex}` } }
}

function makeBorder(style: BorderStyle): Partial<ExcelJS.Borders> {
  if (style === 'none') return {}
  const s = { style: style as ExcelJS.BorderStyle }
  return { top: s, bottom: s, left: s, right: s }
}

function thinBorder()   { return makeBorder('thin')   }
function mediumBorder() { return makeBorder('medium') }

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

// ─── Font builders dinâmicos baseados no modelo ──────────────────────────────
function mkFont(m: ModeloPlanilha) {
  const base  = m.fonte.nome_base
  const cabec = m.fonte.nome_cabec
  const ds    = m.fonte.tamanho_dados
  const ts    = m.fonte.tamanho_th
  const cs    = m.fonte.tamanho_cabec
  return {
    // white bold para headers
    fW: (sz = ts)  => ({ color: { argb: 'FFFFFFFF' }, bold: true,  size: sz, name: cabec }),
    fB: (sz = ds)  => ({ bold: true,  size: sz, name: base }),
    fN: (sz = ds)  => ({ bold: false, size: sz, name: base }),
    fC: (sz = cs)  => ({ bold: true,  size: sz, name: cabec }),
  }
}

// ─── ENTRADA PRINCIPAL ────────────────────────────────────────────────────────
export async function gerarMedicaoExcel(
  contrato: Contrato,
  obra: Obra,
  medicao: Medicao,
  servicos: Servico[],
  linhasPorServico: Map<string, LinhaMemoria[]>,
  logoBase64?: string | null,
  modelo?: ModeloPlanilha
): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'MediObras'
  wb.created = new Date()

  // Se não foi passado modelo, usa o padrão baseado no tipo do contrato
  const mod = modelo ?? (
    contrato.tipo === 'PREFEITURA' ? MODELO_PREFEITURA_DEFAULT : MODELO_ESTADO_DEFAULT
  )

  // Decide qual layout de aba usar baseado na "base" do modelo
  const isPref = mod.base === 'PREFEITURA'

  if (isPref) {
    await gerarAbaPREF(wb, contrato, obra, medicao, servicos, linhasPorServico, logoBase64, mod)
    await gerarAbaMEM(wb, contrato, obra, medicao, servicos, linhasPorServico, mod)
  } else {
    await gerarAbaESTADO(wb, contrato, obra, medicao, servicos, linhasPorServico, logoBase64, mod)
    await gerarAbaMEM(wb, contrato, obra, medicao, servicos, linhasPorServico, mod)
  }

  const buffer = await wb.xlsx.writeBuffer()
  const blob   = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  saveAs(blob, `${obra.nome_obra.replace(/\s+/g,'_')}_MED${String(medicao.numero).padStart(2,'0')}.xlsx`)
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA ESTADO (modelo azul/laranja — usa cores dinâmicas do ModeloPlanilha)

// ═══════════════════════════════════════════════════════════════════════════════
async function gerarAbaESTADO(
  wb: ExcelJS.Workbook,
  contrato: Contrato,
  obra: Obra,
  medicao: Medicao,
  servicos: Servico[],
  linhasPorServico: Map<string, LinhaMemoria[]>,
  logoBase64?: string | null,
  modelo?: ModeloPlanilha
) {
  const m   = modelo ?? MODELO_ESTADO_DEFAULT
  const { fW, fB, fN } = mkFont(m)
  const C   = m.cores
  const bD  = makeBorder(m.bordas.dados)
  const bC  = makeBorder(m.bordas.cabec)
  const bT  = makeBorder(m.bordas.totais)
  const bE  = makeBorder(m.bordas.externo)

  const abaNome = `MED ${String(medicao.numero).padStart(2,'0')}`
  const ws = wb.addWorksheet(abaNome)

  const larguras = [6,14,14,48,6,10,13,13,13,14,8,10,12,12,12,12,13,13,13,13,13,13,8]
  larguras.forEach((w, i) => ws.getColumn(i + 1).width = w)

  ws.getRow(1).height = 8
  for (let c = 1; c <= 23; c++) ws.getCell(1, c).fill = solidFill(C.hdr_topo)

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
      font: { ...fB(10), color: { argb: `FF${C.hdr_principal}` } }, align: align('center'),
    })
  }

  ws.mergeCells('D2:T2'); ws.mergeCells('D3:T3'); ws.mergeCells('D4:T4'); ws.mergeCells('D5:T5')
  setCell(ws,'D2', contrato.orgao_nome,    { font:fW(11), fill:solidFill(C.hdr_principal), align:align('center'), border:bE })
  setCell(ws,'D3', contrato.orgao_subdivisao||'', { font:fW(9), fill:solidFill(C.hdr_sub), align:align('center') })
  setCell(ws,'D4', `OBRA: ${obra.nome_obra}  |  LOCAL: ${obra.local_obra}`, { font:fB(9), fill:solidFill(C.hdr_cabec), align:align('center') })
  setCell(ws,'D5', `Contrato: ${obra.numero_contrato||'—'}  |  Empresa: ${contrato.empresa_executora}`, { font:fN(8), fill:solidFill(C.hdr_cabec), align:align('center') })

  const estadoDataFmt = medicao.data_medicao ? new Date(medicao.data_medicao+'T00:00:00').toLocaleDateString('pt-BR') : '—'
  const estadoPeriodo = (medicao as any).periodo_referencia || estadoDataFmt

  ws.mergeCells('U2:W2'); ws.mergeCells('U3:W3'); ws.mergeCells('U4:W4'); ws.mergeCells('U5:W5')
  setCell(ws,'U2',`${medicao.numero_extenso} MEDIÇÃO`, { font:{...fW(14)}, fill:solidFill(C.hdr_topo), align:align('center'), border:bE })
  setCell(ws,'U3',`Período: ${estadoPeriodo}`, { font:fN(8), fill:solidFill(C.hdr_cabec), align:align('center') })
  setCell(ws,'U4',`Desc: ${(obra.desconto_percentual*100).toFixed(2)}%  |  BDI: ${(obra.bdi_percentual*100).toFixed(2)}%`, { font:fN(8), fill:solidFill(C.hdr_cabec), align:align('center') })
  setCell(ws,'U5',`${obra.data_base_planilha||''}  |  Prazo: ${obra.prazo_execucao_dias}d`, { font:fN(8), fill:solidFill(C.hdr_cabec), align:align('center') })

  ws.getRow(6).height = 16
  ws.mergeCells('A6:K6'); ws.mergeCells('L6:W6')
  setCell(ws,'A6','PLANILHA BASE',       { font:fW(9), fill:solidFill(C.th_base),    align:align('center'), border:bC })
  setCell(ws,'L6','PLANILHA DE MEDIÇÃO', { font:fW(9), fill:solidFill(C.th_medicao), align:align('center'), border:bC })

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
  h7.forEach(([a,v]) => setCell(ws,a,v, { font:fW(8), fill:solidFill(C.th_base),    align:align('center'), border:bC }))
  h8.forEach(([a,v]) => setCell(ws,a,v, { font:fW(8), fill:solidFill(C.th_medicao), align:align('center'), border:bC }))

  let row = 9
  for (const srv of [...servicos].sort((a,b) => a.ordem - b.ordem)) {
    const pBDI     = calcPrecoComBDI(srv.preco_unitario, obra.bdi_percentual)
    const pTotalBDI = Math.round(srv.quantidade * pBDI * 100) / 100
    const pTotal   = calcTotalServico(srv.quantidade, srv.preco_unitario, obra.bdi_percentual, obra.desconto_percentual)
    ws.getRow(row).height = srv.descricao.length > 80 ? 42 : 26

    if (srv.is_grupo) {
      ws.mergeCells(`D${row}:F${row}`)
      'ABCDEFGHIJKLMNOPQRSTUVW'.split('').forEach(c => {
        const cell = ws.getCell(`${c}${row}`)
        cell.fill = solidFill(C.linha_grupo); cell.font = fB(9); cell.border = bD
      })
      ws.getCell(`A${row}`).value = srv.item;     ws.getCell(`A${row}`).alignment = align('center')
      ws.getCell(`D${row}`).value = srv.descricao; ws.getCell(`D${row}`).alignment = align('left')
      ws.getCell(`J${row}`).value = pTotal;       ws.getCell(`J${row}`).numFmt = '#,##0.00'; ws.getCell(`J${row}`).alignment = align('right')
    } else {
      const linhas = linhasPorServico.get(srv.id) || []
      const { qtdAnterior, qtdPeriodo, qtdAcumulada, qtdSaldo } = calcResumoServico(srv, linhas)
      const rowFill = row % 2 === 0 ? solidFill(C.linha_par) : solidFill(C.linha_impar)
      const pctAcum = srv.quantidade > 0 ? qtdAcumulada / srv.quantidade : 0
      const is100 = pctAcum >= 1 && srv.quantidade > 0
      const r2 = (n: number) => Math.round(n * 100) / 100
      const fD = 1 - obra.desconto_percentual
      const eAntR = r2(r2(qtdAnterior * pBDI) * fD)
      const eAcumR = is100 ? pTotal : r2(r2(qtdAcumulada * pBDI) * fD)
      const ePerR = is100 && qtdAnterior === 0 ? pTotal : is100 ? pTotal - eAntR : r2(r2(qtdPeriodo * pBDI) * fD)
      const eSaldR = is100 ? 0 : pTotal - eAcumR
      type CD = [string, ExcelJS.CellValue, string, ExcelJS.Alignment['horizontal']]
      const cols: CD[] = [
        ['A',srv.item,'@','center'],['B',srv.fonte,'@','center'],['C',srv.codigo||'','@','center'],
        ['D',srv.descricao,'@','left'],['E',srv.unidade,'@','center'],['F',srv.quantidade,'#,##0.00','right'],
        ['G',srv.preco_unitario,'R$ #,##0.00','right'],['H',pBDI,'R$ #,##0.00','right'],['I',pTotalBDI,'R$ #,##0.00','right'],
        ['J',pTotal,'R$ #,##0.00','right'],['K',0,'0.00%','right'],
        ['L',srv.quantidade,'#,##0.00','right'],['M',qtdAnterior,'#,##0.00','right'],
        ['N',qtdPeriodo,'#,##0.00','right'],['O',qtdAcumulada,'#,##0.00','right'],['P',qtdSaldo,'#,##0.00','right'],
        ['Q',pBDI,'R$ #,##0.00','right'],['R',pTotal,'R$ #,##0.00','right'],
        ['S',eAntR,'R$ #,##0.00','right'],['T',eAcumR,'R$ #,##0.00','right'],
        ['U',ePerR,'R$ #,##0.00','right'],
        ['V',eSaldR,'R$ #,##0.00','right'],
        ['W',is100 ? 0 : (pTotal > 0 ? eSaldR/pTotal : 0),'0.00%','right'],
      ]
      cols.forEach(([col, val, fmt, al]) => {
        const c = ws.getCell(`${col}${row}`)
        c.value = val; c.numFmt = fmt; c.font = fN(8); c.fill = rowFill; c.border = bD; c.alignment = align(al)
      })
      if (qtdPeriodo > 0)   { ws.getCell(`N${row}`).fill = solidFill(C.linha_periodo); ws.getCell(`N${row}`).font = fB(8) }
      if (qtdAcumulada >= srv.quantidade && srv.quantidade > 0) {
        ws.getCell(`W${row}`).fill = solidFill(C.linha_100pct); ws.getCell(`W${row}`).font = fW(8)
      }
    }
    row++
  }

  const rTot = row; ws.getRow(rTot).height = 22
  ws.mergeCells(`A${rTot}:I${rTot}`)
  setCell(ws,`A${rTot}`,'TOTAIS GERAIS DO ORÇAMENTO', { font:fW(10), fill:solidFill(C.linha_total), align:align('center'), border:bT })
  const vals = calcValoresMedicao(servicos, linhasPorServico, obra)
  ;[`J${rTot}`,`T${rTot}`,`U${rTot}`,`V${rTot}`].forEach((a, i) => {
    const v = [vals.totalOrcamento, vals.valorAcumulado, vals.valorPeriodo, vals.valorSaldo][i]
    setCell(ws, a, v, { font:fW(9), fill:solidFill(C.linha_total), align:align('right'), border:bT, numFmt:'R$ #,##0.00' })
  })

  const rExt = rTot + 2; ws.mergeCells(`A${rExt}:W${rExt}`); ws.getRow(rExt).height = 24
  setCell(ws,`A${rExt}`,
    `A presente medição importa o valor de: ${valorPorExtenso(vals.valorPeriodo).toUpperCase()} — ${new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(vals.valorPeriodo)}`,
    { font:fB(10), fill:solidFill(C.extenso_bg), align:align('left'), border:{ bottom:{style:'medium',color:{argb:`FF${C.extenso_borda}`}} } }
  )

  const rDemo = rExt + 3
  ws.mergeCells(`A${rDemo-1}:E${rDemo-1}`); ws.getRow(rDemo-1).height = 18
  setCell(ws,`A${rDemo-1}`,'DEMONSTRATIVO FINANCEIRO', { font:fW(10), fill:solidFill(C.demo_cabec), align:align('center'), border:bT })
  const demo: [string, number, string][] = [
    ['VALOR TOTAL DO ORÇAMENTO',         vals.totalOrcamento,      'R$ #,##0.00'],
    [`VALOR ${medicao.numero_extenso} MEDIÇÃO`, vals.valorPeriodo, 'R$ #,##0.00'],
    ['PERCENTUAL DA MEDIÇÃO',            vals.percentualPeriodo,   '0.00%'],
    ['FATURADO ACUMULADO',               vals.valorAcumulado,      'R$ #,##0.00'],
    ['PERCENTUAL ACUMULADO',             vals.percentualAcumulado, '0.00%'],
    ['SALDO DO CONTRATO',                vals.valorSaldo,          'R$ #,##0.00'],
    ['PERCENTUAL DO SALDO',              vals.percentualSaldo,     '0.00%'],
  ]
  demo.forEach(([label, val, fmt], i) => {
    const r = rDemo + i; ws.getRow(r).height = 16
    ws.mergeCells(`A${r}:D${r}`)
    const bg = i % 2 === 0 ? solidFill(C.hdr_cabec) : solidFill('FFFFFF')
    setCell(ws,`A${r}`,label, { font:fN(9), fill:bg, align:align('left'), border:bD })
    setCell(ws,`E${r}`,val,   { font:fB(9), fill:bg, align:align('right'), border:bD, numFmt:fmt })
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA PREFEITURA — MED 01, MED 02… (PREV 02 renomeada como MED XX)
// Layout: 19 colunas A–S, exatamente como o modelo PREV 02
// Novidades: cinza no cabeçalho, verde em PLANILHA DE MEDIÇÃO, verde nos dados
// ═══════════════════════════════════════════════════════════════════════════════

// Cores PREV 02 — prefeitura
const PF_CINZA_LOGO   = 'F2F2F2'
const PF_CINZA_HDR    = 'D4D4D4'
const PF_VERDE_DADOS  = 'C6EFCE'
const PF_VERDE_MED    = '70AD47'
const PF_BRANCO       = 'FFFFFF'
const PF_AZUL_TABCAB  = '8DB4E2'

// Helpers de fonte/alinhamento para PREF (compactos, Arial 6-9pt)
const pf6 = (bold = false): Partial<ExcelJS.Font> => ({ name:'Arial', size:6, bold })
const pf8 = (bold = false): Partial<ExcelJS.Font> => ({ name:'Arial', size:8, bold })
const pf9 = (bold = false): Partial<ExcelJS.Font> => ({ name:'Arial', size:9, bold })
const pfAL: Partial<ExcelJS.Alignment>  = { horizontal:'left',   vertical:'middle', wrapText:true }
const pfAC: Partial<ExcelJS.Alignment>  = { horizontal:'center', vertical:'middle', wrapText:true }
const pfAR: Partial<ExcelJS.Alignment>  = { horizontal:'right',  vertical:'middle', wrapText:true }
const pfALT: Partial<ExcelJS.Alignment> = { horizontal:'left',   vertical:'top',    wrapText:true }

async function gerarAbaPREF(
  wb: ExcelJS.Workbook,
  contrato: Contrato,
  obra: Obra,
  medicao: Medicao,
  servicos: Servico[],
  linhasPorServico: Map<string, LinhaMemoria[]>,
  logoBase64?: string | null,
  modelo?: ModeloPlanilha
) {
  const m  = modelo ?? MODELO_PREFEITURA_DEFAULT
  const C  = m.cores
  const bD = makeBorder(m.bordas.dados)
  const bT = makeBorder(m.bordas.totais)
  const abaNome = `MED ${String(medicao.numero).padStart(2,'0')}`
  const ws = wb.addWorksheet(abaNome)

  // 19 colunas A–S — logo maior (col A-C mais largas)
  const W = [12, 12, 52, 10, 6, 9, 8, 8, 13, 10, 10, 11, 8, 10, 10, 12, 12, 10, 8]
  W.forEach((w, i) => ws.getColumn(i + 1).width = w)

  const N2 = '#,##0.00', R2 = 'R$ #,##0.00', PCT = '0.00%', DAT = 'DD/MM/YYYY'
  const dataEmissao = medicao.data_medicao ? new Date(medicao.data_medicao + 'T00:00:00') : new Date()
  const dtFim = medicao.data_medicao ? new Date(medicao.data_medicao+'T00:00:00').toLocaleDateString('pt-BR') : '—'
  const periodoRef = (medicao as any).periodo_referencia || dtFim
  const vals = calcValoresMedicao(servicos, linhasPorServico, obra)

  // ── BLOCO LOGO (A1:C9) — 3 colunas, espaço amplo ──────────────────────
  ws.mergeCells('A1:B9')
  ws.getCell('A1').fill = solidFill(PF_CINZA_LOGO)
  ws.getCell('A1').border = thinBorder()
  if (logoBase64) {
    try {
      const base64Data = logoBase64.split(',')[1] || logoBase64
      const ext = logoBase64.includes('png') ? 'png' : 'jpeg'
      const imgId = wb.addImage({ base64: base64Data, extension: ext as 'png'|'jpeg' })
      ws.addImage(imgId, { tl:{col:0,row:0}, br:{col:2,row:9}, editAs:'oneCell' })
    } catch {}
  }

  // ── BLOCO EMPRESA RD (N1:S9) — fundo CINZA ────────────────────────────
  ws.mergeCells('N1:S9')
  setCell(ws,'N1',
    'RD CONSTRUTORA LTDA\nRUA BELA VISTA, 874, JARDINS, SÃO GONÇALO DO AMARANTE/RN\nCEP: 59293-576, CNPJ: 43.357.757/0001-40\nemail: rd_solucoes@outlook.com\ntel.: (84) 99641-8124',
    { font: pf8(true), align: pfALT, fill: solidFill(PF_CINZA_LOGO), border: thinBorder() }
  )

  // ── CABEÇALHO CENTRAL (D..M, linhas 1-9) — espelha PDF exatamente ─────
  for (let r = 1; r <= 9; r++) ws.getRow(r).height = 14

  // L1: labels
  setCell(ws,'D1','CONCEDENTE',     { font:pf6(), align:pfAL, border:thinBorder() })
  ws.mergeCells('E1:G1')
  setCell(ws,'E1','Data emissão BM',{ font:pf6(), align:pfAL, border:thinBorder() })
  ws.mergeCells('H1:J1')
  setCell(ws,'H1','Período ref.',   { font:pf6(), align:pfAL, border:thinBorder() })
  ws.mergeCells('K1:M1')
  setCell(ws,'K1','VALOR DO CONTRATO', { font:pf6(true), align:pfAC, fill:solidFill(PF_CINZA_HDR), border:thinBorder() })

  // L2: valores
  setCell(ws,'D2', contrato.orgao_nome||'', { font:pf6(true), align:pfAL, border:thinBorder() })
  ws.mergeCells('E2:G2')
  setCell(ws,'E2', dataEmissao,             { font:pf6(true), align:pfAL, border:thinBorder(), numFmt:DAT })
  ws.mergeCells('H2:J2')
  setCell(ws,'H2', periodoRef,                { font:pf6(true), align:pfAL, border:thinBorder() })
  ws.mergeCells('K2:M2')
  setCell(ws,'K2', vals.totalOrcamento,      { font:pf8(true), align:pfAR, border:thinBorder(), numFmt:N2 })

  // L3
  setCell(ws,'D3','CONVENENTE',               { font:pf6(), align:pfAL, border:thinBorder() })
  ws.mergeCells('E3:J3')
  setCell(ws,'E3','OBJETIVO DA O.S.',         { font:pf6(), align:pfAL, border:thinBorder() })
  ws.mergeCells('K3:M3')
  setCell(ws,'K3',`VALOR O.S. ${contrato.numero_contrato||''}`, { font:pf6(), align:pfAL, border:thinBorder() })

  // L4
  setCell(ws,'D4', contrato.orgao_nome||'',   { font:pf6(true), align:pfAL, border:thinBorder() })
  ws.mergeCells('E4:J4')
  setCell(ws,'E4', obra.nome_obra||'',         { font:pf6(true), align:pfAL, border:thinBorder() })
  ws.mergeCells('K4:M4')
  setCell(ws,'K4', vals.totalOrcamento,        { font:pf8(true), align:pfAR, border:thinBorder(), numFmt:N2 })

  // L5
  setCell(ws,'D5','PROC. LICITATÓRIO',        { font:pf6(), align:pfAL, border:thinBorder() })
  ws.mergeCells('E5:J5')
  setCell(ws,'E5', obra.numero_contrato||'',   { font:pf6(true), align:pfAL, border:thinBorder() })
  ws.mergeCells('K5:M5')
  setCell(ws,'K5','VALOR ACUMULADO',           { font:pf6(true), align:pfAC, fill:solidFill(PF_CINZA_HDR), border:thinBorder() })

  // L6
  setCell(ws,'D6','EMPRESA',                   { font:pf6(), align:pfAL, border:thinBorder() })
  ws.mergeCells('E6:F6')
  setCell(ws,'E6','CNPJ',                      { font:pf6(), align:pfAL, border:thinBorder() })
  ws.mergeCells('G6:J6')
  ws.getCell('G6').border = thinBorder()
  ws.mergeCells('K6:M6')
  setCell(ws,'K6', vals.valorAcumulado,        { font:pf8(true), align:pfAR, border:thinBorder(), numFmt:N2 })

  // L7
  setCell(ws,'D7', contrato.empresa_executora||'', { font:pf6(true), align:pfAL, border:thinBorder() })
  ws.mergeCells('E7:F7')
  setCell(ws,'E7','43.357.757/0001-40',            { font:pf6(true), align:pfAL, border:thinBorder() })
  ws.mergeCells('G7:J7')
  ws.getCell('G7').border = thinBorder()
  ws.mergeCells('K7:M7')
  setCell(ws,'K7','SALDO CONTRATO',            { font:pf6(true), align:pfAC, fill:solidFill(PF_CINZA_HDR), border:thinBorder() })

  // L8
  ws.mergeCells('D8:J8')
  ws.getCell('D8').border = thinBorder()
  ws.mergeCells('K8:M8')
  setCell(ws,'K8', vals.valorSaldo,            { font:pf8(true), align:pfAR, border:thinBorder(), numFmt:N2 })

  // L9
  setCell(ws,'D9',`BM N° ${medicao.numero}`,  { font:pf6(true), align:pfAL, border:thinBorder() })
  ws.mergeCells('E9:G9')
  setCell(ws,'E9',`EMISSÃO: ${dtFim}`,         { font:pf6(), align:pfAL, border:thinBorder() })
  ws.mergeCells('H9:J9')
  setCell(ws,'H9','VALOR MEDIDO:',             { font:pf6(), align:pfAL, border:thinBorder() })
  ws.mergeCells('K9:M9')
  setCell(ws,'K9', vals.valorPeriodo,          { font:pf9(true), align:pfAR, border:thinBorder(), numFmt:N2, fill:solidFill(PF_VERDE_DADOS) })

  // ── SEPARADOR (row 10) ─────────────────────────────────────────────────
  ws.getRow(10).height = 4

  // ── CABEÇALHO DA TABELA (rows 11-12) — labels idênticos ao PDF ─────────
  ws.getRow(11).height = 14
  ws.getRow(12).height = 26

  ws.mergeCells('A11:A12'); ws.mergeCells('B11:B12'); ws.mergeCells('C11:C12')
  ws.mergeCells('D11:D12'); ws.mergeCells('E11:E12'); ws.mergeCells('F11:F12')
  ws.mergeCells('G11:H11'); ws.mergeCells('I11:J11'); ws.mergeCells('K11:S11')

  const hFill = solidFill(PF_AZUL_TABCAB)
  ;[['A11','ITEM'],['B11','CÓDIGO'],['C11','DESCRIÇÃO'],['D11','FONTE'],['E11','UN'],['F11','QTD']].forEach(([a,t]) =>
    setCell(ws, a, t, { font:pf6(true), align:pfAC, fill:hFill, border:thinBorder() })
  )
  setCell(ws,'G11','P.UNIT. R$', { font:pf6(true), align:pfAC, fill:hFill, border:thinBorder() })
  setCell(ws,'I11','P.TOTAL R$', { font:pf6(true), align:pfAC, fill:hFill, border:thinBorder() })
  setCell(ws,'K11','PLANILHA DE MEDIÇÃO', {
    font:{ name:'Arial', size:7, bold:true, color:{ argb:'FFFFFFFF' } },
    align:pfAC, fill:solidFill(PF_VERDE_MED), border:thinBorder(),
  })

  ;['A12','B12','C12','D12','E12','F12'].forEach(a => setCell(ws, a, '', { fill:hFill, border:thinBorder() }))
  setCell(ws,'G12','S/BDI',  { font:pf6(true), align:pfAC, fill:hFill, border:thinBorder() })
  setCell(ws,'H12','C/BDI',  { font:pf6(true), align:pfAC, fill:hFill, border:thinBorder() })
  setCell(ws,'I12','C/BDI',  { font:pf6(true), align:pfAC, fill:hFill, border:thinBorder() })
  setCell(ws,'J12',`DESC.${(obra.desconto_percentual*100).toFixed(0)}%`, { font:pf6(true), align:pfAC, fill:hFill, border:thinBorder() })

  const verdeClaro = solidFill('C6EFCE')
  ;[['K12','AC.ANT'],['L12','MED.PER'],['M12','%'],['N12','AC.UND'],['O12','SALDO'],
    ['P12','MED.R$'],['Q12','AC.R$'],['R12','SALD.R$'],['S12','%']
  ].forEach(([a,t]) => setCell(ws, a, t, { font:pf6(true), align:pfAC, fill:verdeClaro, border:thinBorder() }))

  // ── DADOS ──────────────────────────────────────────────────────────────
  const grupos = servicos.filter(s =>  s.is_grupo).sort((a,b) => a.ordem - b.ordem)
  const itens  = servicos.filter(s => !s.is_grupo)
  let dataRow  = 13

  for (const grp of grupos) {
    ws.getRow(dataRow).height = 14
    const gFill = solidFill('D9D9D9')
    ws.mergeCells(`B${dataRow}:H${dataRow}`)
    ;['A','B','I','J'].forEach(c => {
      ws.getCell(`${c}${dataRow}`).fill = gFill; ws.getCell(`${c}${dataRow}`).border = thinBorder()
    })
    setCell(ws,`A${dataRow}`, grp.item,     { font:pf6(true), align:pfAL, fill:gFill, border:thinBorder() })
    setCell(ws,`B${dataRow}`, grp.descricao,{ font:pf6(true), align:pfAL, fill:gFill, border:thinBorder() })
    setCell(ws,`I${dataRow}`, null,          { fill:gFill, border:thinBorder() })
    setCell(ws,`J${dataRow}`, null,          { fill:gFill, border:thinBorder() })
    const thin = { style: 'thin' as ExcelJS.BorderStyle }
    ws.getCell(`K${dataRow}`).border = { top:thin, left:thin }
    'LMNOPQR'.split('').forEach(c => { ws.getCell(`${c}${dataRow}`).border = { top:thin } })
    ws.getCell(`S${dataRow}`).border = { top:thin, right:thin }
    dataRow++

    const filhos = itens.filter(s =>
      s.grupo_item === grp.item || s.grupo_item === `${grp.item}.0` || s.grupo_item === String(parseFloat(grp.item))
    )

    for (const srv of filhos) {
      ws.getRow(dataRow).height = 27
      const r = dataRow
      const linhas = linhasPorServico.get(srv.id) || []
      const { qtdAnterior, qtdPeriodo } = calcResumoServico(srv, linhas)
      const pBDI  = calcPrecoComBDI(srv.preco_unitario, obra.bdi_percentual)
      const pTot  = calcTotalServico(srv.quantidade, srv.preco_unitario, obra.bdi_percentual, obra.desconto_percentual)
      const temPeriodo = qtdPeriodo > 0
      const rowFill = temPeriodo ? solidFill(PF_VERDE_DADOS) : solidFill(PF_BRANCO)

      setCell(ws,`A${r}`, srv.item,       { font:pf6(), align:pfAL, border:thinBorder(), fill:rowFill })
      setCell(ws,`B${r}`, srv.codigo,     { font:pf6(), align:pfAC, border:thinBorder(), fill:rowFill })
      setCell(ws,`C${r}`, srv.descricao,  { font:pf6(), align:pfAL, border:thinBorder(), fill:rowFill })
      setCell(ws,`D${r}`, srv.fonte,      { font:pf6(), align:pfAC, border:thinBorder(), fill:rowFill })
      setCell(ws,`E${r}`, srv.unidade,    { font:pf6(), align:pfAC, border:thinBorder(), fill:rowFill })
      setCell(ws,`F${r}`, srv.quantidade, { font:pf6(), align:pfAR, border:thinBorder(), fill:rowFill, numFmt:N2 })
      setCell(ws,`G${r}`, pBDI,           { font:pf6(), align:pfAR, border:thinBorder(), fill:rowFill, numFmt:R2 })
      setCell(ws,`H${r}`, pBDI,           { font:pf6(), align:pfAR, border:thinBorder(), fill:rowFill, numFmt:R2 })
      setCell(ws,`I${r}`, pTot,           { font:pf6(), align:pfAR, border:thinBorder(), fill:rowFill, numFmt:R2 })

      ws.getCell(`J${r}`).value = { formula:`I${r}*(1-${obra.desconto_percentual})` } as any
      ws.getCell(`J${r}`).font = pf6() as ExcelJS.Font; ws.getCell(`J${r}`).alignment = pfAR as ExcelJS.Alignment
      ws.getCell(`J${r}`).border = thinBorder() as ExcelJS.Borders; ws.getCell(`J${r}`).numFmt = R2; ws.getCell(`J${r}`).fill = rowFill

      setCell(ws,`K${r}`, qtdAnterior, { font:pf6(), align:pfAC, border:thinBorder(), numFmt:N2,
        fill: qtdAnterior > 0 ? solidFill(PF_VERDE_DADOS) : solidFill(PF_BRANCO) })
      setCell(ws,`L${r}`, qtdPeriodo, { font:pf6(temPeriodo), align:pfAC, border:thinBorder(), numFmt:N2,
        fill: temPeriodo ? solidFill(PF_VERDE_DADOS) : solidFill(PF_BRANCO) })

      ws.getCell(`M${r}`).value = { formula:`IF(F${r}=0,0,L${r}/F${r})` } as any
      ws.getCell(`M${r}`).font = pf6() as ExcelJS.Font; ws.getCell(`M${r}`).alignment = pfAC as ExcelJS.Alignment
      ws.getCell(`M${r}`).border = thinBorder() as ExcelJS.Borders; ws.getCell(`M${r}`).numFmt = PCT
      ws.getCell(`M${r}`).fill = temPeriodo ? solidFill(PF_VERDE_DADOS) : solidFill(PF_BRANCO)

      ws.getCell(`N${r}`).value = { formula:`K${r}+L${r}` } as any
      ws.getCell(`N${r}`).font = pf6() as ExcelJS.Font; ws.getCell(`N${r}`).alignment = pfAC as ExcelJS.Alignment
      ws.getCell(`N${r}`).border = thinBorder() as ExcelJS.Borders; ws.getCell(`N${r}`).numFmt = N2; ws.getCell(`N${r}`).fill = solidFill(PF_BRANCO)

      ws.getCell(`O${r}`).value = { formula:`F${r}-N${r}` } as any
      ws.getCell(`O${r}`).font = pf6() as ExcelJS.Font; ws.getCell(`O${r}`).alignment = pfAC as ExcelJS.Alignment
      ws.getCell(`O${r}`).border = thinBorder() as ExcelJS.Borders; ws.getCell(`O${r}`).numFmt = N2; ws.getCell(`O${r}`).fill = solidFill(PF_BRANCO)

      ws.getCell(`P${r}`).value = { formula:`L${r}*H${r}*(1-${obra.desconto_percentual})` } as any
      ws.getCell(`P${r}`).font = pf6(temPeriodo) as ExcelJS.Font; ws.getCell(`P${r}`).alignment = pfAC as ExcelJS.Alignment
      ws.getCell(`P${r}`).border = thinBorder() as ExcelJS.Borders; ws.getCell(`P${r}`).numFmt = R2
      ws.getCell(`P${r}`).fill = temPeriodo ? solidFill(PF_VERDE_DADOS) : solidFill(PF_BRANCO)

      ws.getCell(`Q${r}`).value = { formula:`N${r}*H${r}*(1-${obra.desconto_percentual})` } as any
      ws.getCell(`Q${r}`).font = pf6() as ExcelJS.Font; ws.getCell(`Q${r}`).alignment = pfAC as ExcelJS.Alignment
      ws.getCell(`Q${r}`).border = thinBorder() as ExcelJS.Borders; ws.getCell(`Q${r}`).numFmt = R2; ws.getCell(`Q${r}`).fill = solidFill(PF_BRANCO)

      ws.getCell(`R${r}`).value = { formula:`H${r}*O${r}*(1-${obra.desconto_percentual})` } as any
      ws.getCell(`R${r}`).font = pf6() as ExcelJS.Font; ws.getCell(`R${r}`).alignment = pfAC as ExcelJS.Alignment
      ws.getCell(`R${r}`).border = thinBorder() as ExcelJS.Borders; ws.getCell(`R${r}`).numFmt = R2; ws.getCell(`R${r}`).fill = solidFill(PF_BRANCO)

      const pctAcum = srv.quantidade > 0 ? (qtdAnterior + qtdPeriodo) / srv.quantidade : 0
      ws.getCell(`S${r}`).value = { formula:`IF(F${r}=0,0,N${r}/F${r})` } as any
      ws.getCell(`S${r}`).font = pf6() as ExcelJS.Font; ws.getCell(`S${r}`).alignment = pfAC as ExcelJS.Alignment
      ws.getCell(`S${r}`).border = thinBorder() as ExcelJS.Borders; ws.getCell(`S${r}`).numFmt = PCT
      ws.getCell(`S${r}`).fill = pctAcum >= 1 ? solidFill(PF_VERDE_MED) : solidFill(PF_BRANCO)

      dataRow++
    }
  }

  // ── TOTAIS GERAIS (idêntico ao PDF) ────────────────────────────────────
  const rTot = dataRow
  ws.getRow(rTot).height = 20
  ws.mergeCells(`A${rTot}:H${rTot}`)
  const totFill = solidFill(m.cores.linha_total)
  const totFont: Partial<ExcelJS.Font> = { name:'Arial', size:7, bold:true, color:{ argb:'FFFFFFFF' } }
  setCell(ws,`A${rTot}`,'TOTAIS GERAIS', { font:totFont, fill:totFill, align:pfAC, border:bT })
  setCell(ws,`I${rTot}`, vals.totalOrcamento, { font:totFont, fill:totFill, align:pfAR, border:bT, numFmt:N2 })
  setCell(ws,`J${rTot}`, vals.totalOrcamento*(1-obra.desconto_percentual), { font:totFont, fill:totFill, align:pfAR, border:bT, numFmt:N2 })
  ;['K','L','M','N','O'].forEach(c => { ws.getCell(`${c}${rTot}`).fill = totFill; ws.getCell(`${c}${rTot}`).border = bT })
  setCell(ws,`P${rTot}`, vals.valorPeriodo,   { font:totFont, fill:totFill, align:pfAR, border:bT, numFmt:N2 })
  setCell(ws,`Q${rTot}`, vals.valorAcumulado, { font:totFont, fill:totFill, align:pfAR, border:bT, numFmt:N2 })
  setCell(ws,`R${rTot}`, vals.valorSaldo,     { font:totFont, fill:totFill, align:pfAR, border:bT, numFmt:N2 })
  ws.getCell(`S${rTot}`).fill = totFill; ws.getCell(`S${rTot}`).border = bT

  // ── EXTENSO (idêntico ao PDF) ──────────────────────────────────────────
  const rExt = rTot + 2
  ws.mergeCells(`A${rExt}:S${rExt}`)
  ws.getRow(rExt).height = 22
  setCell(ws,`A${rExt}`,
    `A presente medição importa o valor de: ${valorPorExtenso(vals.valorPeriodo).toUpperCase()} — ${new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(vals.valorPeriodo)}`,
    { font:{ name:'Arial', size:8, bold:true }, fill:solidFill(m.cores.extenso_bg), align:align('left'),
      border:{ bottom:{ style:'medium', color:{ argb:`FF${m.cores.extenso_borda}` } } } }
  )

  // ── DEMONSTRATIVO FINANCEIRO (idêntico ao PDF) ─────────────────────────
  const rDemo = rExt + 2
  ws.mergeCells(`A${rDemo}:E${rDemo}`)
  ws.getRow(rDemo).height = 18
  setCell(ws,`A${rDemo}`,'DEMONSTRATIVO FINANCEIRO', {
    font:{ name:'Arial', size:8, bold:true, color:{ argb:'FFFFFFFF' } },
    fill:solidFill(m.cores.demo_cabec), align:pfAC, border:bT,
  })

  const demo: [string, number, string][] = [
    ['Valor Total Orçamento',                     vals.totalOrcamento,       R2],
    [`${medicao.numero_extenso} Med. — Período`,  vals.valorPeriodo,         R2],
    ['% da Medição',                               vals.percentualPeriodo,   PCT],
    ['Faturado Acumulado',                         vals.valorAcumulado,       R2],
    ['% Acumulado',                                vals.percentualAcumulado, PCT],
    ['Saldo do Contrato',                          vals.valorSaldo,           R2],
    ['% do Saldo',                                 vals.percentualSaldo,     PCT],
  ]
  demo.forEach(([label, val, fmt], i) => {
    const r = rDemo + 1 + i
    ws.getRow(r).height = 15
    ws.mergeCells(`A${r}:D${r}`)
    const bg = i % 2 === 0 ? solidFill(m.cores.hdr_cabec) : solidFill('FFFFFF')
    setCell(ws,`A${r}`, label, { font:pf8(), fill:bg, align:pfAL, border:bD })
    setCell(ws,`E${r}`, val,   { font:pf8(true), fill:bg, align:pfAR, border:bD, numFmt:fmt })
  })

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
  modelo?: ModeloPlanilha
) {
  const m = modelo ?? MODELO_ESTADO_DEFAULT
  const isPref = m.base === 'PREFEITURA'

  // Paleta — usa cores do modelo
  const COR_TITULO    = m.cores.mem_titulo
  const COR_SUBTIT    = m.cores.hdr_sub
  const COR_GRUPO     = m.cores.mem_grupo
  const COR_GRUPO_FNT = m.cores.mem_titulo
  const COR_APAGAR    = m.cores.mem_apagar
  const COR_PAGO      = m.cores.mem_pago
  const COR_NEXEC     = 'FCE4D6'
  const COR_TOT_AC    = m.cores.mem_tot_acum
  const COR_TOT_ANT   = m.cores.mem_tot_ant
  const COR_TOT_MES   = m.cores.mem_tot_mes

  const abaNome = `MEM ${String(medicao.numero).padStart(2,'0')}`
  const ws = wb.addWorksheet(abaNome)
  const larguras = [8, 42, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 14, 22]
  larguras.forEach((w, i) => ws.getColumn(i + 1).width = w)

  // Faixa decorativa topo
  ws.getRow(1).height = 8
  for (let c = 1; c <= 14; c++)
    ws.getCell(1, c).fill = solidFill(m.cores.hdr_topo)

  // Cabeçalho
  ws.mergeCells('A2:N2'); ws.getRow(2).height = 30
  ws.mergeCells('A3:N3'); ws.getRow(3).height = 16
  ws.mergeCells('A4:N4'); ws.getRow(4).height = 14
  ws.mergeCells('A5:N5'); ws.getRow(5).height = 22

  const { fW: mfW, fB: mfB, fN: mfN } = mkFont(m)
  setCell(ws,'A2', contrato.orgao_nome,              { font:{...mfW(11), color:{argb:'FFFFFFFF'}}, fill:solidFill(COR_TITULO), align:align('center') })
  setCell(ws,'A3', contrato.orgao_subdivisao||'',    { font:{bold:true,size:9,name:m.fonte.nome_cabec,color:{argb:'FFFFFFFF'}}, fill:solidFill(COR_SUBTIT), align:align('center') })
  setCell(ws,'A4', obra.nome_obra,                    { font:mfB(9), fill:solidFill(COR_GRUPO), align:align('center') })
  setCell(ws,'A5','MEMÓRIA DE CÁLCULO',               { font:{bold:true,size:12,name:m.fonte.nome_cabec,color:{argb:'FFFFFFFF'}}, fill:solidFill(COR_TITULO), align:align('center') })

  // Sub-info
  ws.mergeCells('A6:N6'); ws.getRow(6).height = 14
  setCell(ws,'A6',`${medicao.numero_extenso} Medição  |  ${obra.local_obra}  |  ${medicao.data_medicao ? new Date(medicao.data_medicao+'T00:00:00').toLocaleDateString('pt-BR') : ''}`,
    { font:mfN(8), fill:solidFill(m.cores.hdr_cabec), align:align('center') }
  )

  // Cabeçalho da tabela
  ws.getRow(8).height = 30
  const hMEM = ['ITEM','DESCRIÇÃO','Larg.','Comp.','Altura','Perim.','Área','Vol.','Kg','Outros','Desc.','Qtde','TOTAL','OBSERVAÇÃO']
  hMEM.forEach((h, i) => {
    setCell(ws, `${String.fromCharCode(65+i)}8`, h, {
      font: { bold:true, size:9, name:m.fonte.nome_cabec, color:{argb:'FFFFFFFF'} },
      fill: solidFill(COR_SUBTIT), align: align('center'), border: thinBorder(),
    })
  })

  // Dados
  let row = 9
  const servicosOrdenados = servicos.filter(s => !s.is_grupo).sort((a,b) => a.ordem - b.ordem)

  for (const srv of servicosOrdenados) {
    const linhas = linhasPorServico.get(srv.id) || []

    // Só inclui serviços que possuem linhas de memória (igual ao PDF)
    if (!linhas.length) continue

    // Título do serviço
    ws.mergeCells(`A${row}:B${row}`); ws.getRow(row).height = 20
    'ABCDEFGHIJKLMN'.split('').forEach(c => {
      const cell = ws.getCell(`${c}${row}`)
      cell.fill = solidFill(COR_GRUPO)
      cell.font = { bold:true, size:9, name:m.fonte.nome_cabec, color:{argb:`FF${COR_GRUPO_FNT}`} }
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
        ['C', linha.largura??null,         '#,##0.00'],
        ['D', linha.comprimento??null,     '#,##0.00'],
        ['E', linha.altura??null,          '#,##0.00'],
        ['F', linha.perimetro??null,       '#,##0.00'],
        ['G', linha.area??null,            '#,##0.00'],
        ['H', linha.volume??null,          '#,##0.00'],
        ['I', linha.kg??null,              '#,##0.00'],
        ['J', linha.outros??null,          '#,##0.00'],
        ['K', linha.desconto_dim??null,    '#,##0.00'],
        ['L', linha.quantidade??null,      '#,##0.00'],
        ['M', linha.total,                 '#,##0.00'],
        ['N', linha.status,                '@'],
      ]
      campos.forEach(([c, v, fmt]) => {
        const cell = ws.getCell(`${c}${row}`)
        cell.value     = v
        cell.fill      = sf
        cell.font      = c === 'M' ? mfB(9) : mfN(c === 'A'||c === 'B'||c === 'N' ? 9 : 8)
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
      setCell(ws,`A${row}`, label, { font:mfB(9), fill:solidFill(cor), align:align('right'), border:thinBorder() })
      setCell(ws,`M${row}`, val,   { font:mfB(9), fill:solidFill(cor), align:align('right'), border:thinBorder(), numFmt:'#,##0.00' })
      ws.getCell(`N${row}`).fill = solidFill(cor); ws.getCell(`N${row}`).border = thinBorder()
      row++
    })
    row++ // espaço
  }
}
