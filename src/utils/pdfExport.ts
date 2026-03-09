import { Contrato, Obra, Medicao, Servico, LinhaMemoria } from '../types'
import {
  calcPrecoComDesconto, calcPrecoComBDI, calcPrecoTotal,
  calcResumoServico, calcValoresMedicao, valorPorExtenso,
} from './calculations'

// ─── PDF EXPORT via HTML → window.print() ────────────────────────────────────
// Gera um HTML completo otimizado para impressão A4 paisagem e abre numa nova aba

export async function gerarMedicaoPDF(
  contrato: Contrato,
  obra: Obra,
  medicao: Medicao,
  servicos: Servico[],
  linhasPorServico: Map<string, LinhaMemoria[]>,
  logoBase64?: string | null
): Promise<void> {
  const htmlMED = gerarHTMLMED(contrato, obra, medicao, servicos, linhasPorServico, logoBase64)
  const htmlMEM = gerarHTMLMEM(contrato, obra, medicao, servicos, linhasPorServico)
  const html = montarDocumento(contrato, obra, medicao, htmlMED, htmlMEM)

  const blob = new Blob([html], { type: 'text/html; charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const win  = window.open(url, '_blank')
  if (win) {
    win.addEventListener('load', () => {
      setTimeout(() => { win.print(); URL.revokeObjectURL(url) }, 800)
    })
  }
}

// ─── DOCUMENTO COMPLETO ───────────────────────────────────────────────────────

function montarDocumento(contrato: Contrato, obra: Obra, medicao: Medicao, med: string, mem: string) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>${obra.nome_obra} — ${medicao.numero_extenso} Medição</title>
<style>
  @page { size: A4 landscape; margin: 10mm 8mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Arial Narrow', Arial, sans-serif; font-size: 7.5pt; color: #1a1a1a; background: white; }
  .page-break { page-break-after: always; }

  /* ── CABEÇALHO ─── */
  .cabecalho { display: flex; border: 1.5px solid #1F3864; margin-bottom: 2mm; }
  .cab-logo  { width: 28mm; min-height: 18mm; display: flex; align-items: center; justify-content: center;
               border-right: 1px solid #1F3864; padding: 2mm; background: #fff; }
  .cab-logo img { max-height: 14mm; max-width: 26mm; object-fit: contain; }
  .cab-logo span { font-size: 7pt; color: #555; text-align: center; }
  .cab-centro { flex: 1; display: flex; flex-direction: column; }
  .cab-orgao  { background: #1F3864; color: white; font-weight: bold; font-size: 9pt;
                text-align: center; padding: 2mm; }
  .cab-subdiv { background: #2E75B6; color: white; font-size: 7.5pt;
                text-align: center; padding: 1mm 2mm; }
  .cab-obra   { background: #DEEAF1; font-size: 7pt; text-align: center; padding: 1mm 2mm; font-weight: bold; }
  .cab-contrato { background: #DEEAF1; font-size: 6.5pt; text-align: center; padding: 0.5mm 2mm; }
  .cab-dir    { width: 28mm; display: flex; flex-direction: column; border-left: 1px solid #1F3864; }
  .cab-dir-num { background: #ED7D31; color: white; font-weight: bold; font-size: 11pt;
                 text-align: center; padding: 2mm 1mm; flex: 1; display: flex; align-items: center; justify-content: center; }
  .cab-dir-info { background: #DEEAF1; font-size: 6pt; text-align: center; padding: 1mm; border-top: 1px solid #1F3864; }

  /* ── TABELA MED ─── */
  .tabela-med { width: 100%; border-collapse: collapse; }
  .tabela-med th, .tabela-med td { border: 0.5px solid #aaa; padding: 0.5mm 1mm; white-space: nowrap; }
  .th-base    { background: #1F3864; color: white; font-weight: bold; font-size: 6.5pt; text-align: center; }
  .th-med     { background: #2E75B6; color: white; font-weight: bold; font-size: 6.5pt; text-align: center; }
  .tr-grupo   { background: #BDD7EE; font-weight: bold; }
  .tr-par     { background: #F2F7FC; }
  .tr-impar   { background: #FFFFFF; }
  .td-desc    { max-width: 60mm; overflow: hidden; text-overflow: ellipsis; text-align: left !important; }
  .td-n       { background: #FFF2CC; font-weight: bold; }
  .td-100     { background: #70AD47; color: white; }
  .tr-total   { background: #1F3864; color: white; font-weight: bold; }
  .num        { text-align: right; }
  .ctr        { text-align: center; }

  /* ── EXTENSO + DEMO ─── */
  .extenso    { background: #FFF8E7; border: 1px solid #ED7D31; padding: 2mm 3mm; margin: 2mm 0;
                font-weight: bold; font-size: 8pt; }
  .demo-titulo { background: #1F3864; color: white; font-weight: bold; font-size: 8pt;
                 padding: 2mm; margin-top: 3mm; }
  .demo-table { width: 80mm; border-collapse: collapse; margin-top: 1mm; }
  .demo-table td { border: 0.5px solid #aaa; padding: 1mm 2mm; font-size: 7.5pt; }
  .demo-par   { background: #EBF3FB; }
  .demo-impar { background: #FFFFFF; }
  .demo-val   { font-weight: bold; text-align: right; width: 30mm; }

  /* ── MEM ─── */
  .tabela-mem { width: 100%; border-collapse: collapse; margin-top: 2mm; }
  .tabela-mem th, .tabela-mem td { border: 0.5px solid #aaa; padding: 0.5mm 1.5mm; }
  .th-mem     { background: #1F3864; color: white; font-weight: bold; font-size: 6.5pt; text-align: center; }
  .tr-srv     { background: #BDD7EE; font-weight: bold; font-size: 7pt; }
  .tr-apagar  { background: #E2EFDA; }
  .tr-pago    { background: #DDEEFF; }
  .tr-tot-mem { background: #D9D9D9; font-weight: bold; }
  .tr-tot-ant { background: #DDEEFF; font-weight: bold; }
  .tr-tot-mes { background: #FFF2CC; font-weight: bold; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page-break { page-break-after: always; }
  }
</style>
</head>
<body>
${med}
<div class="page-break"></div>
${mem}
</body>
</html>`
}

// ─── ABA MED ──────────────────────────────────────────────────────────────────

function gerarHTMLMED(
  contrato: Contrato, obra: Obra, medicao: Medicao,
  servicos: Servico[], linhasPorServico: Map<string, LinhaMemoria[]>, logoBase64?: string | null
): string {
  const fmtN = (n: number, d = 2) => n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })
  const fmtC = (n: number) => `R$ ${fmtN(n)}`
  const dataFmt = medicao.data_medicao
    ? new Date(medicao.data_medicao + 'T00:00:00').toLocaleDateString('pt-BR') : '—'

  const logoHtml = logoBase64
    ? `<img src="${logoBase64}" alt="Logo"/>`
    : `<span>${contrato.empresa_executora}</span>`

  let rows = ''
  let rowIdx = 0
  const servicosOrd = [...servicos].sort((a, b) => a.ordem - b.ordem)
  const vals = calcValoresMedicao(servicos, linhasPorServico, obra)

  for (const srv of servicosOrd) {
    const pDesc = calcPrecoComDesconto(srv.preco_unitario, obra.desconto_percentual)
    const pBDI  = calcPrecoComBDI(pDesc, obra.bdi_percentual)
    const pTot  = calcPrecoTotal(srv.quantidade, pBDI)

    if (srv.is_grupo) {
      rows += `<tr class="tr-grupo">
        <td class="ctr">${srv.item}</td>
        <td colspan="3" class="td-desc" style="text-align:left">${srv.descricao}</td>
        <td colspan="4"></td>
        <td class="num">${fmtN(pTot)}</td>
        <td colspan="14"></td>
      </tr>`
      continue
    }

    const { qtdAnterior, qtdPeriodo, qtdAcumulada, qtdSaldo } = calcResumoServico(srv, linhasPorServico.get(srv.id) || [])
    const cls = rowIdx % 2 === 0 ? 'tr-par' : 'tr-impar'
    const saldoPerc = srv.quantidade > 0 ? 1 - (qtdAcumulada / srv.quantidade) : 1
    const saldoCls  = saldoPerc <= 0 ? ' td-100' : ''
    const perCls    = qtdPeriodo > 0 ? ' td-n' : ''

    rows += `<tr class="${cls}">
      <td class="ctr">${srv.item}</td>
      <td class="ctr" style="font-size:6pt">${srv.fonte}</td>
      <td class="ctr" style="font-size:6pt">${srv.codigo}</td>
      <td class="td-desc">${srv.descricao}</td>
      <td class="ctr">${srv.unidade}</td>
      <td class="num">${fmtN(srv.quantidade, 4)}</td>
      <td class="num">${fmtN(srv.preco_unitario)}</td>
      <td class="num">${fmtN(pDesc)}</td>
      <td class="num">${fmtN(pBDI)}</td>
      <td class="num">${fmtN(pTot)}</td>
      <td class="ctr">—</td>
      <td class="num">${fmtN(srv.quantidade, 4)}</td>
      <td class="num">${fmtN(qtdAnterior, 4)}</td>
      <td class="num${perCls}">${fmtN(qtdPeriodo, 4)}</td>
      <td class="num">${fmtN(qtdAcumulada, 4)}</td>
      <td class="num">${fmtN(qtdSaldo, 4)}</td>
      <td class="num">${fmtN(pDesc)}</td>
      <td class="num">${fmtN(pBDI)}</td>
      <td class="num">${fmtN(qtdAnterior * pBDI)}</td>
      <td class="num">${fmtN(qtdAcumulada * pBDI)}</td>
      <td class="num${perCls}">${fmtN(qtdPeriodo * pBDI)}</td>
      <td class="num${saldoCls}">${fmtN(pTot - qtdAcumulada * pBDI)}</td>
      <td class="num${saldoCls}">${fmtN(saldoPerc * 100, 2)}%</td>
    </tr>`
    rowIdx++
  }

  const demoRows = [
    ['Valor Total do Orçamento', fmtC(vals.totalOrcamento), 'demo-par'],
    [`${medicao.numero_extenso} Medição (Período)`, fmtC(vals.valorPeriodo), 'demo-impar'],
    ['Percentual da Medição', fmtN(vals.percentualPeriodo * 100) + '%', 'demo-par'],
    ['Faturado Acumulado', fmtC(vals.valorAcumulado), 'demo-impar'],
    ['Percentual Acumulado', fmtN(vals.percentualAcumulado * 100) + '%', 'demo-par'],
    ['Saldo do Contrato', fmtC(vals.valorSaldo), 'demo-impar'],
    ['Percentual do Saldo', fmtN(vals.percentualSaldo * 100) + '%', 'demo-par'],
  ].map(([l, v, cls]) => `<tr class="${cls}"><td>${l}</td><td class="demo-val">${v}</td></tr>`).join('')

  return `
<div class="cabecalho">
  <div class="cab-logo">${logoHtml}</div>
  <div class="cab-centro">
    <div class="cab-orgao">${contrato.orgao_nome}</div>
    <div class="cab-subdiv">${contrato.orgao_subdivisao || ''}</div>
    <div class="cab-obra">OBRA: ${obra.nome_obra} &nbsp;|&nbsp; LOCAL: ${obra.local_obra}</div>
    <div class="cab-contrato">Contrato: ${obra.numero_contrato || '—'} &nbsp;|&nbsp; Empresa: ${contrato.empresa_executora}</div>
  </div>
  <div class="cab-dir">
    <div class="cab-dir-num">${medicao.numero_extenso} MEDIÇÃO</div>
    <div class="cab-dir-info">Data: ${dataFmt}</div>
    <div class="cab-dir-info">Desc: ${(obra.desconto_percentual*100).toFixed(2)}% | BDI: ${(obra.bdi_percentual*100).toFixed(2)}%</div>
  </div>
</div>

<table class="tabela-med">
  <colgroup>
    <col style="width:6mm"/><col style="width:11mm"/><col style="width:12mm"/>
    <col style="width:55mm"/><col style="width:7mm"/><col style="width:11mm"/>
    <col style="width:13mm"/><col style="width:13mm"/><col style="width:13mm"/>
    <col style="width:13mm"/><col style="width:7mm"/>
    <col style="width:11mm"/><col style="width:12mm"/><col style="width:12mm"/>
    <col style="width:12mm"/><col style="width:12mm"/>
    <col style="width:11mm"/><col style="width:11mm"/>
    <col style="width:13mm"/><col style="width:13mm"/><col style="width:13mm"/>
    <col style="width:13mm"/><col style="width:8mm"/>
  </colgroup>
  <thead>
    <tr>
      <th class="th-base" colspan="11">PLANILHA BASE</th>
      <th class="th-med" colspan="12">PLANILHA DE MEDIÇÃO</th>
    </tr>
    <tr>
      <th class="th-base">ITEM</th><th class="th-base">FONTE</th><th class="th-base">CÓDIGO</th>
      <th class="th-base">DESCRIÇÃO</th><th class="th-base">UNID</th><th class="th-base">QTD</th>
      <th class="th-base">PU R$</th><th class="th-base">c/Desc</th><th class="th-base">c/BDI</th>
      <th class="th-base">TOTAL R$</th><th class="th-base">PESO%</th>
      <th class="th-med">PREV</th><th class="th-med">ANT ACUM</th>
      <th class="th-med">PERÍODO</th><th class="th-med">ACUM</th><th class="th-med">SALDO</th>
      <th class="th-med">UNIT</th><th class="th-med">UNIT BDI</th>
      <th class="th-med">ANT R$</th><th class="th-med">ACUM R$</th>
      <th class="th-med">PERÍODO R$</th><th class="th-med">SALDO R$</th><th class="th-med">SALDO%</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
    <tr class="tr-total">
      <td colspan="9" style="text-align:center;font-size:8pt">TOTAIS GERAIS</td>
      <td class="num">${fmtN(vals.totalOrcamento)}</td>
      <td></td><td></td><td></td><td></td>
      <td class="num">${fmtN(vals.valorAcumulado / (servicos.filter(s=>!s.is_grupo)[0]?.preco_unitario || 1) || 0, 0)}</td>
      <td></td><td></td><td></td>
      <td class="num">${fmtN(vals.valorAcumulado)}</td>
      <td class="num">${fmtN(vals.valorAcumulado)}</td>
      <td class="num">${fmtN(vals.valorPeriodo)}</td>
      <td class="num">${fmtN(vals.valorSaldo)}</td>
      <td></td>
    </tr>
  </tbody>
</table>

<div class="extenso">
  A presente medição importa o valor de: ${valorPorExtenso(vals.valorPeriodo).toUpperCase()} —
  ${new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(vals.valorPeriodo)}
</div>

<div class="demo-titulo">DEMONSTRATIVO FINANCEIRO</div>
<table class="demo-table"><tbody>${demoRows}</tbody></table>`
}

// ─── ABA MEM ──────────────────────────────────────────────────────────────────

function gerarHTMLMEM(
  contrato: Contrato, obra: Obra, medicao: Medicao,
  servicos: Servico[], linhasPorServico: Map<string, LinhaMemoria[]>
): string {
  const fmtN = (n: number | null | undefined, d = 4) =>
    n == null ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })

  let rows = ''
  const servicosOrd = servicos.filter(s => !s.is_grupo).sort((a, b) => a.ordem - b.ordem)

  for (const srv of servicosOrd) {
    const linhas = (linhasPorServico.get(srv.id) || []).sort((a, b) => a.sub_item.localeCompare(b.sub_item))
    rows += `<tr class="tr-srv">
      <td class="ctr">${srv.item}</td>
      <td colspan="13" style="text-align:left">${srv.descricao} — ${srv.unidade}</td>
    </tr>`

    for (const l of linhas) {
      const cls = l.status === 'A pagar' ? 'tr-apagar' : l.status === 'Pago' ? 'tr-pago' : ''
      rows += `<tr class="${cls}">
        <td class="ctr" style="font-size:6.5pt">${l.sub_item}</td>
        <td>${l.descricao_calculo}</td>
        <td class="num">${fmtN(l.largura)}</td>
        <td class="num">${fmtN(l.comprimento)}</td>
        <td class="num">${fmtN(l.altura)}</td>
        <td class="num">${fmtN(l.perimetro)}</td>
        <td class="num">${fmtN(l.area)}</td>
        <td class="num">${fmtN(l.volume)}</td>
        <td class="num">${fmtN(l.kg)}</td>
        <td class="num">${fmtN(l.outros)}</td>
        <td class="num">${fmtN(l.desconto_dim)}</td>
        <td class="num">${fmtN(l.quantidade)}</td>
        <td class="num" style="font-weight:bold">${fmtN(l.total)}</td>
        <td class="ctr">${l.status}</td>
      </tr>`
    }

    const qtdAnt  = linhas.filter(l => l.status === 'Pago').reduce((s, l) => s + l.total, 0)
    const qtdPer  = linhas.filter(l => l.status === 'A pagar').reduce((s, l) => s + l.total, 0)
    rows += `
      <tr class="tr-tot-mem"><td colspan="12" style="text-align:right">TOTAL ACUMULADO:</td><td class="num">${fmtN(qtdAnt + qtdPer)}</td><td></td></tr>
      <tr class="tr-tot-ant"><td colspan="12" style="text-align:right">TOTAL ACUMULADO ANTERIOR:</td><td class="num">${fmtN(qtdAnt)}</td><td></td></tr>
      <tr class="tr-tot-mes"><td colspan="12" style="text-align:right">TOTAL DO MÊS (A PAGAR):</td><td class="num">${fmtN(qtdPer)}</td><td></td></tr>
      <tr><td colspan="14" style="height:3mm"></td></tr>`
  }

  return `
<h2 style="font-size:10pt;font-weight:bold;margin-bottom:2mm;color:#1F3864">
  MEMÓRIA DE CÁLCULO — ${obra.nome_obra} — ${medicao.numero_extenso} MEDIÇÃO
</h2>
<table class="tabela-mem">
  <thead>
    <tr>
      <th class="th-mem" style="width:10mm">ITEM</th>
      <th class="th-mem">DESCRIÇÃO</th>
      <th class="th-mem" style="width:12mm">Larg.</th>
      <th class="th-mem" style="width:12mm">Comp.</th>
      <th class="th-mem" style="width:12mm">Alt.</th>
      <th class="th-mem" style="width:12mm">Perim.</th>
      <th class="th-mem" style="width:12mm">Área</th>
      <th class="th-mem" style="width:12mm">Vol.</th>
      <th class="th-mem" style="width:12mm">Kg</th>
      <th class="th-mem" style="width:12mm">Outros</th>
      <th class="th-mem" style="width:12mm">Desc.</th>
      <th class="th-mem" style="width:12mm">Qtde</th>
      <th class="th-mem" style="width:14mm">TOTAL</th>
      <th class="th-mem" style="width:18mm">STATUS</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>`
}
