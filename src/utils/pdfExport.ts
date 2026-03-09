import jsPDF from 'jspdf'
import { Contrato, Obra, Medicao, Servico, LinhaMemoria, FotoMedicao } from '../types'
import {
  calcPrecoComDesconto, calcPrecoComBDI, calcPrecoTotal,
  calcResumoServico, calcValoresMedicao, valorPorExtenso,
} from './calculations'

// ─── PALETAS ─────────────────────────────────────────────────────────────────
const PALETA = {
  ESTADO: {
    hdrPrincipal : '#1F3864', hdrSub      : '#2E75B6', hdrCabec    : '#DEEAF1',
    hdrDir       : '#ED7D31', thBase      : '#1F3864', thMed       : '#2E75B6',
    trGrupo      : '#BDD7EE', trTotal     : '#1F3864', extensoBg   : '#FFF8E7',
    extensoBdr   : '#ED7D31', demoBdr     : '#1F3864', memTitulo   : '#1F3864',
    memSub       : '#2E75B6', memGrupo    : '#BDD7EE', memGrupoFnt : '#1F3864',
    memApagar    : '#E2EFDA', memPago     : '#DDEEFF', memTotAc    : '#D9D9D9',
    memTotAnt    : '#DDEEFF', memTotMes   : '#FFF2CC', thMem       : '#1F3864',
    faixaTopo    : '#ED7D31', hdrDirBg    : '#ED7D31',
  },
  PREFEITURA: {
    hdrPrincipal : '#375623', hdrSub      : '#70AD47', hdrCabec    : '#E2EFDA',
    hdrDir       : '#375623', thBase      : '#375623', thMed       : '#70AD47',
    trGrupo      : '#E2EFDA', trTotal     : '#375623', extensoBg   : '#F0FFF0',
    extensoBdr   : '#70AD47', demoBdr     : '#375623', memTitulo   : '#375623',
    memSub       : '#70AD47', memGrupo    : '#E2EFDA', memGrupoFnt : '#375623',
    memApagar    : '#C6EFCE', memPago     : '#BDD7EE', memTotAc    : '#A9D08E',
    memTotAnt    : '#C6EFCE', memTotMes   : '#FFEB9C', thMem       : '#375623',
    faixaTopo    : '#70AD47', hdrDirBg    : '#375623',
  },
}

// ─── ENTRADA PRINCIPAL ────────────────────────────────────────────────────────
export async function gerarMedicaoPDF(
  contrato: Contrato,
  obra: Obra,
  medicao: Medicao,
  servicos: Servico[],
  linhasPorServico: Map<string, LinhaMemoria[]>,
  logoBase64?: string | null,
  fotos?: FotoMedicao[],
  medicoesAnteriores?: { numero_extenso: string; valorPeriodo: number }[]
): Promise<void> {
  const isPref = contrato.tipo === 'PREFEITURA'
  const p = isPref ? PALETA.PREFEITURA : PALETA.ESTADO

  const htmlMED = gerarHTMLMED(contrato, obra, medicao, servicos, linhasPorServico, logoBase64, medicoesAnteriores, p, isPref)
  const htmlMEM = gerarHTMLMEM(contrato, obra, medicao, servicos, linhasPorServico, p, isPref)
  const html    = montarDocumento(obra, medicao, htmlMED, htmlMEM, p)

  const blob = new Blob([html], { type: 'text/html; charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const win  = window.open(url, '_blank')
  if (win) {
    win.addEventListener('load', () => {
      setTimeout(() => { win.print(); URL.revokeObjectURL(url) }, 800)
    })
  }

  if (fotos && fotos.length > 0) {
    await gerarFotosPDF(contrato, obra, medicao, fotos)
  }
}

// ─── DOCUMENTO COMPLETO ───────────────────────────────────────────────────────
type Paleta = typeof PALETA.ESTADO

function montarDocumento(obra: Obra, medicao: Medicao, med: string, mem: string, p: Paleta) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>${obra.nome_obra} — ${medicao.numero_extenso} Medição</title>
<style>
  @page { size: A4 landscape; margin: 10mm 8mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 7pt; color: #1a1a1a; background: white; }
  .page-break { page-break-after: always; }

  /* ── CABEÇALHO PREFEITURA ─── */
  .cab-pref         { display: table; width: 100%; border: 1px solid #999; margin-bottom: 1.5mm; font-size: 6.5pt; }
  .cab-pref-row     { display: table-row; }
  .cab-pref-lbl     { display: table-cell; padding: 0.8mm 1.5mm; color: #333; vertical-align: middle; white-space: nowrap; border-right: 1px solid #ddd; border-bottom: 1px solid #ddd; min-width: 22mm; }
  .cab-pref-val     { display: table-cell; padding: 0.8mm 1.5mm; font-weight: bold; vertical-align: middle; border-right: 1px solid #ddd; border-bottom: 1px solid #ddd; }
  .cab-pref-right   { position: absolute; right: 0; top: 0; width: 48mm; font-size: 6.5pt; padding: 2mm; line-height: 1.5; }
  .cab-pref-wrap    { position: relative; }
  .cab-kv-table     { width: 100%; border-collapse: collapse; margin-bottom: 1.5mm; font-size: 6.5pt; border: 1px solid #aaa; }
  .cab-kv-table td  { padding: 0.8mm 1.5mm; border: 0.5px solid #ccc; vertical-align: middle; }
  .cab-kv-lbl       { color: #333; min-width: 22mm; white-space: nowrap; }
  .cab-kv-val       { font-weight: bold; }
  .cab-kv-hl        { background: #D4D4D4; font-weight: bold; text-align: right; }
  .cab-kv-val-hl    { background: #FFFFFF; font-weight: bold; text-align: right; }
  .cab-kv-verde     { background: #E2EFDA; font-weight: bold; text-align: right; font-size: 7pt; }
  .cab-empresa      { font-size: 7pt; line-height: 1.5; padding: 2mm; vertical-align: top; }

  /* ── CABEÇALHO ESTADO ─── */
  .cabecalho { display: flex; border: 1.5px solid ${p.hdrPrincipal}; margin-bottom: 2mm; }
  .cab-logo  { width: 28mm; min-height: 18mm; display: flex; align-items: center; justify-content: center;
               border-right: 1px solid ${p.hdrPrincipal}; padding: 2mm; background: #fff; }
  .cab-logo img { max-height: 14mm; max-width: 26mm; object-fit: contain; }
  .cab-logo span { font-size: 7pt; color: #555; text-align: center; }
  .cab-centro { flex: 1; display: flex; flex-direction: column; }
  .cab-orgao  { background: ${p.hdrPrincipal}; color: white; font-weight: bold; font-size: 9pt; text-align: center; padding: 2mm; }
  .cab-subdiv { background: ${p.hdrSub}; color: white; font-size: 7.5pt; text-align: center; padding: 1mm 2mm; }
  .cab-obra   { background: ${p.hdrCabec}; font-size: 7pt; text-align: center; padding: 1mm 2mm; font-weight: bold; }
  .cab-contrato { background: ${p.hdrCabec}; font-size: 6.5pt; text-align: center; padding: 0.5mm 2mm; }
  .cab-dir    { width: 28mm; display: flex; flex-direction: column; border-left: 1px solid ${p.hdrPrincipal}; }
  .cab-dir-num { background: ${p.hdrDirBg}; color: white; font-weight: bold; font-size: 11pt;
                 text-align: center; padding: 2mm 1mm; flex: 1; display: flex; align-items: center; justify-content: center; }
  .cab-dir-info { background: ${p.hdrCabec}; font-size: 6pt; text-align: center; padding: 1mm; border-top: 1px solid ${p.hdrPrincipal}; }

  /* ── TABELA MEDIÇÃO ─── */
  .tabela-med { width: 100%; border-collapse: collapse; }
  .tabela-med th, .tabela-med td { border: 0.5px solid #aaa; padding: 0.4mm 0.8mm; vertical-align: middle; font-size: 6.5pt; }
  .th-base  { background: ${p.thBase}; color: white; font-weight: bold; text-align: center; white-space: nowrap; }
  .th-med   { background: ${p.thMed};  color: white; font-weight: bold; text-align: center; white-space: nowrap; }
  .tr-grupo { background: ${p.trGrupo}; font-weight: bold; }
  .tr-par   { background: #F9F9F9; }
  .tr-impar { background: #FFFFFF; }
  .td-desc  { text-align: left !important; white-space: normal !important; word-break: break-word; min-width: 35mm; max-width: 60mm; line-height: 1.3; }
  .td-per   { background: #C6EFCE; font-weight: bold; }
  .td-100   { background: ${p.hdrSub}; color: white; }
  .tr-total { background: ${p.trTotal}; color: white; font-weight: bold; }
  .num      { text-align: right; white-space: nowrap; }
  .ctr      { text-align: center; white-space: nowrap; }

  /* ── EXTENSO E DEMO ─── */
  .extenso     { background: ${p.extensoBg}; border: 1.5px solid ${p.extensoBdr}; padding: 2mm 3mm; margin: 2mm 0;
                 font-weight: bold; font-size: 8pt; }
  .demo-titulo { background: ${p.demoBdr}; color: white; font-weight: bold; font-size: 8pt; padding: 2mm; margin-top: 3mm; }
  .demo-table  { width: 80mm; border-collapse: collapse; margin-top: 1mm; }
  .demo-table td { border: 0.5px solid #aaa; padding: 1mm 2mm; font-size: 7.5pt; }
  .demo-par    { background: #F4FAF4; }
  .demo-impar  { background: #FFFFFF; }
  .demo-val    { font-weight: bold; text-align: right; width: 30mm; }

  /* ── MEMÓRIA ─── */
  .mem-titulo  { font-size: 10pt; font-weight: bold; margin-bottom: 2mm; color: ${p.memTitulo}; padding: 2mm;
                 background: ${p.memGrupo}; border-left: 4px solid ${p.memTitulo}; }
  .tabela-mem  { width: 100%; border-collapse: collapse; margin-top: 2mm; }
  .tabela-mem th, .tabela-mem td { border: 0.5px solid #aaa; padding: 0.5mm 1mm; font-size: 6.5pt; vertical-align: middle; }
  .th-mem      { background: ${p.thMem}; color: white; font-weight: bold; text-align: center; white-space: nowrap; }
  .tr-srv      { background: ${p.memGrupo}; font-weight: bold; color: ${p.memGrupoFnt}; }
  .tr-apagar   { background: ${p.memApagar}; }
  .tr-pago     { background: ${p.memPago}; }
  .tr-tot-mem  { background: ${p.memTotAc};  font-weight: bold; }
  .tr-tot-ant  { background: ${p.memTotAnt}; font-weight: bold; }
  .tr-tot-mes  { background: ${p.memTotMes}; font-weight: bold; }

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

// ─── HTML MEDIÇÃO ─────────────────────────────────────────────────────────────
function gerarHTMLMED(
  contrato: Contrato, obra: Obra, medicao: Medicao,
  servicos: Servico[], linhasPorServico: Map<string, LinhaMemoria[]>,
  logoBase64: string | null | undefined,
  medicoesAnteriores: { numero_extenso: string; valorPeriodo: number }[] | undefined,
  p: Paleta, isPref: boolean
): string {
  const fmtN = (n: number, d = 2) => n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })
  const fmtC = (n: number) => `R$ ${fmtN(n)}`
  const dataFmt = medicao.data_medicao
    ? new Date(medicao.data_medicao + 'T00:00:00').toLocaleDateString('pt-BR') : '—'

  const vals = calcValoresMedicao(servicos, linhasPorServico, obra)

  // ── Cabeçalho adaptado ──────────────────────────────────────────────────────
  let cabHtml = ''
  if (isPref) {
    // Cabeçalho no estilo PREV 02: tabela de 2 colunas com labels
    cabHtml = `
<table style="width:100%;border-collapse:collapse;font-size:6.5pt;margin-bottom:2mm;" border="0">
<tr>
  <td style="width:52%" valign="top">
    <table style="width:100%;border-collapse:collapse;border:1px solid #aaa;">
      <tr>
        <td style="padding:0.8mm 1.5mm;color:#555;white-space:nowrap;border-bottom:0.5px solid #ddd;border-right:0.5px solid #ddd;width:24mm">CONCEDENTE</td>
        <td style="padding:0.8mm 1.5mm;border-bottom:0.5px solid #ddd;border-right:0.5px solid #ddd;">Data de emissão BM</td>
        <td style="padding:0.8mm 1.5mm;border-bottom:0.5px solid #ddd;">Período de referência</td>
      </tr>
      <tr>
        <td style="padding:0.8mm 1.5mm;font-weight:bold;border-bottom:0.5px solid #ddd;border-right:0.5px solid #ddd;">${contrato.orgao_nome||''}</td>
        <td style="padding:0.8mm 1.5mm;font-weight:bold;border-bottom:0.5px solid #ddd;border-right:0.5px solid #ddd;">${dataFmt}</td>
        <td style="padding:0.8mm 1.5mm;font-weight:bold;border-bottom:0.5px solid #ddd;">${dataFmt}</td>
      </tr>
      <tr>
        <td style="padding:0.8mm 1.5mm;color:#555;border-bottom:0.5px solid #ddd;border-right:0.5px solid #ddd;">CONVENETE</td>
        <td colspan="2" style="padding:0.8mm 1.5mm;color:#555;border-bottom:0.5px solid #ddd;">OBJETIVO DA ORDEM DE SERVIÇO</td>
      </tr>
      <tr>
        <td style="padding:0.8mm 1.5mm;font-weight:bold;border-bottom:0.5px solid #ddd;border-right:0.5px solid #ddd;">${contrato.orgao_nome||''}</td>
        <td colspan="2" style="padding:0.8mm 1.5mm;font-weight:bold;border-bottom:0.5px solid #ddd;">${obra.nome_obra||''}</td>
      </tr>
      <tr>
        <td style="padding:0.8mm 1.5mm;color:#555;border-bottom:0.5px solid #ddd;border-right:0.5px solid #ddd;">PROCESSO LICITATÓRIO</td>
        <td colspan="2" style="padding:0.8mm 1.5mm;border-bottom:0.5px solid #ddd;">&nbsp;</td>
      </tr>
      <tr>
        <td style="padding:0.8mm 1.5mm;color:#555;border-bottom:0.5px solid #ddd;border-right:0.5px solid #ddd;">EMPRESA CONTRATADA</td>
        <td style="padding:0.8mm 1.5mm;color:#555;border-bottom:0.5px solid #ddd;border-right:0.5px solid #ddd;">CNPJ</td>
        <td style="padding:0.8mm 1.5mm;border-bottom:0.5px solid #ddd;">&nbsp;</td>
      </tr>
      <tr>
        <td style="padding:0.8mm 1.5mm;font-weight:bold;border-bottom:0.5px solid #ddd;border-right:0.5px solid #ddd;">${contrato.empresa_executora||''}</td>
        <td style="padding:0.8mm 1.5mm;font-weight:bold;border-bottom:0.5px solid #ddd;border-right:0.5px solid #ddd;">43.357.757/0001-40</td>
        <td style="padding:0.8mm 1.5mm;border-bottom:0.5px solid #ddd;">&nbsp;</td>
      </tr>
      <tr>
        <td style="padding:0.8mm 1.5mm;font-weight:bold;border-right:0.5px solid #ddd;">BOLETIM DE MEDIÇÃO - N° ${medicao.numero}</td>
        <td style="padding:0.8mm 1.5mm;color:#555;border-right:0.5px solid #ddd;">EMISSÃO DO BM &nbsp; <strong>${dataFmt}</strong></td>
        <td style="padding:0.8mm 1.5mm;color:#555;">VALOR MEDIDO NO PERÍODO: &nbsp; <strong style="background:#C6EFCE;padding:0.5mm 1mm;border-radius:1mm">${fmtC(vals.valorPeriodo)}</strong></td>
      </tr>
    </table>
  </td>
  <td style="width:24%;vertical-align:top;padding-left:2mm;">
    <table style="width:100%;border-collapse:collapse;border:1px solid #aaa;font-size:6.5pt;">
      <tr>
        <td style="padding:0.8mm 1.5mm;background:#D4D4D4;font-weight:bold;text-align:center;border-bottom:0.5px solid #aaa;">VALOR DO CONTRATO</td>
      </tr>
      <tr>
        <td style="padding:0.8mm 1.5mm;font-weight:bold;text-align:right;border-bottom:0.5px solid #aaa;">${fmtC(vals.totalOrcamento)}</td>
      </tr>
      <tr>
        <td style="padding:0.8mm 1.5mm;color:#555;font-size:6pt;border-bottom:0.5px solid #aaa;">VALOR DA O.S. ${contrato.numero_contrato||''}</td>
      </tr>
      <tr>
        <td style="padding:0.8mm 1.5mm;font-weight:bold;text-align:right;border-bottom:0.5px solid #aaa;">${fmtC(vals.totalOrcamento)}</td>
      </tr>
      <tr>
        <td style="padding:0.8mm 1.5mm;background:#D4D4D4;font-weight:bold;text-align:center;border-bottom:0.5px solid #aaa;">VALOR ACUMULADO</td>
      </tr>
      <tr>
        <td style="padding:0.8mm 1.5mm;font-weight:bold;text-align:right;border-bottom:0.5px solid #aaa;">${fmtC(vals.valorAcumulado)}</td>
      </tr>
      <tr>
        <td style="padding:0.8mm 1.5mm;background:#D4D4D4;font-weight:bold;text-align:center;border-bottom:0.5px solid #aaa;">SALDO EM CONTRATO</td>
      </tr>
      <tr>
        <td style="padding:0.8mm 1.5mm;font-weight:bold;text-align:right;">${fmtC(vals.valorSaldo)}</td>
      </tr>
    </table>
  </td>
  <td style="width:24%;vertical-align:top;padding-left:2mm;font-size:6.5pt;line-height:1.6;">
    <strong>RD CONSTRUTORA LTDA</strong><br/>
    RUA BELA VISTA, 874, JARDINS,<br/>
    SÃO GONÇALO DO AMARANTE/RN<br/>
    CEP: 59293-576<br/>
    CNPJ: 43.357.757/0001-40<br/>
    email: rd_solucoes@outlook.com<br/>
    tel.: (84) 99641-8124
  </td>
</tr>
</table>`
  } else {
    // Cabeçalho estado (laranja/azul)
    const logoHtml = logoBase64
      ? `<img src="${logoBase64}" alt="Logo"/>`
      : `<span>${contrato.empresa_executora}</span>`
    cabHtml = `
<div class="cabecalho">
  <div class="cab-logo">${logoHtml}</div>
  <div class="cab-centro">
    <div class="cab-orgao">${contrato.orgao_nome}</div>
    <div class="cab-subdiv">${contrato.orgao_subdivisao||''}</div>
    <div class="cab-obra">OBRA: ${obra.nome_obra} &nbsp;|&nbsp; LOCAL: ${obra.local_obra}</div>
    <div class="cab-contrato">Contrato: ${obra.numero_contrato||'—'} &nbsp;|&nbsp; Empresa: ${contrato.empresa_executora}</div>
  </div>
  <div class="cab-dir">
    <div class="cab-dir-num">${medicao.numero_extenso} MEDIÇÃO</div>
    <div class="cab-dir-info">Data: ${dataFmt}</div>
    <div class="cab-dir-info">Desc: ${(obra.desconto_percentual*100).toFixed(2)}% | BDI: ${(obra.bdi_percentual*100).toFixed(2)}%</div>
  </div>
</div>`
  }

  // ── Linhas da tabela ────────────────────────────────────────────────────────
  let rows = ''
  let rowIdx = 0
  const desconto = obra.desconto_percentual
  for (const srv of [...servicos].sort((a,b) => a.ordem - b.ordem)) {
    const pDesc  = calcPrecoComDesconto(srv.preco_unitario, desconto)
    const pBDI   = calcPrecoComBDI(pDesc, obra.bdi_percentual)
    const pTot   = calcPrecoTotal(srv.quantidade, pBDI)
    const pTotDc = pTot * (1 - desconto)

    if (srv.is_grupo) {
      rows += `<tr class="tr-grupo">
        <td class="ctr">${srv.item}</td>
        <td colspan="3" class="td-desc">${srv.descricao}</td>
        <td colspan="2"></td>
        <td class="num">${fmtN(pDesc)}</td>
        <td class="num">${fmtN(pBDI)}</td>
        <td class="num">${fmtN(pTot)}</td>
        ${isPref ? `<td class="num">${fmtN(pTotDc)}</td>` : '<td></td>'}
        <td colspan="${isPref?9:12}"></td>
      </tr>`
      continue
    }

    const linhas = linhasPorServico.get(srv.id) || []
    const { qtdAnterior, qtdPeriodo, qtdAcumulada, qtdSaldo } = calcResumoServico(srv, linhas)
    const cls     = rowIdx % 2 === 0 ? 'tr-par' : 'tr-impar'
    const pctAcum = srv.quantidade > 0 ? (qtdAcumulada / srv.quantidade) : 0
    const perCls  = qtdPeriodo > 0 ? ' td-per' : ''
    const c100Cls = pctAcum >= 1 ? ' td-100' : ''

    if (isPref) {
      // PREV 02 style: 19 colunas
      const medAtualR  = qtdPeriodo  * pBDI * (1 - desconto)
      const acumR      = qtdAcumulada * pBDI * (1 - desconto)
      const saldoR     = qtdSaldo    * pBDI * (1 - desconto)
      rows += `<tr class="${cls}">
        <td class="ctr">${srv.item}</td>
        <td class="ctr" style="font-size:6pt">${srv.codigo}</td>
        <td class="td-desc">${srv.descricao}</td>
        <td class="ctr" style="font-size:6pt">${srv.fonte}</td>
        <td class="ctr">${srv.unidade}</td>
        <td class="num">${fmtN(srv.quantidade,4)}</td>
        <td class="num">${fmtN(pDesc)}</td>
        <td class="num">${fmtN(pBDI)}</td>
        <td class="num">${fmtN(pTot)}</td>
        <td class="num">${fmtN(pTotDc)}</td>
        <td class="num${qtdAnterior>0?' td-per':''}">${fmtN(qtdAnterior,4)}</td>
        <td class="num${perCls}">${fmtN(qtdPeriodo,4)}</td>
        <td class="num${perCls}">${fmtN(pctAcum*100,2)}%</td>
        <td class="num">${fmtN(qtdAcumulada,4)}</td>
        <td class="num">${fmtN(qtdSaldo,4)}</td>
        <td class="num${perCls}">${fmtN(medAtualR)}</td>
        <td class="num">${fmtN(acumR)}</td>
        <td class="num">${fmtN(saldoR)}</td>
        <td class="num${c100Cls}">${fmtN(pctAcum*100,2)}%</td>
      </tr>`
    } else {
      rows += `<tr class="${cls}">
        <td class="ctr">${srv.item}</td>
        <td class="ctr" style="font-size:6pt">${srv.fonte}</td>
        <td class="ctr" style="font-size:6pt">${srv.codigo}</td>
        <td class="td-desc">${srv.descricao}</td>
        <td class="ctr">${srv.unidade}</td>
        <td class="num">${fmtN(srv.quantidade,4)}</td>
        <td class="num">${fmtN(srv.preco_unitario)}</td>
        <td class="num">${fmtN(pDesc)}</td>
        <td class="num">${fmtN(pBDI)}</td>
        <td class="num">${fmtN(pTot)}</td>
        <td class="ctr">—</td>
        <td class="num">${fmtN(srv.quantidade,4)}</td>
        <td class="num">${fmtN(qtdAnterior,4)}</td>
        <td class="num${perCls}">${fmtN(qtdPeriodo,4)}</td>
        <td class="num">${fmtN(qtdAcumulada,4)}</td>
        <td class="num">${fmtN(qtdSaldo,4)}</td>
        <td class="num">${fmtN(pDesc)}</td>
        <td class="num">${fmtN(pBDI)}</td>
        <td class="num">${fmtN(qtdAnterior*pBDI)}</td>
        <td class="num">${fmtN(qtdAcumulada*pBDI)}</td>
        <td class="num${perCls}">${fmtN(qtdPeriodo*pBDI)}</td>
        <td class="num${c100Cls}">${fmtN(pTot - qtdAcumulada*pBDI)}</td>
        <td class="num${c100Cls}">${fmtN((1-pctAcum)*100,2)}%</td>
      </tr>`
    }
    rowIdx++
  }

  // ── Cabeçalho da tabela ─────────────────────────────────────────────────────
  let tblHead = ''
  if (isPref) {
    tblHead = `
<colgroup>
  <col style="width:5mm"/><col style="width:12mm"/><col style="width:52mm"/>
  <col style="width:8mm"/><col style="width:6mm"/><col style="width:10mm"/>
  <col style="width:10mm"/><col style="width:10mm"/><col style="width:12mm"/><col style="width:12mm"/>
  <col style="width:10mm"/><col style="width:10mm"/><col style="width:8mm"/>
  <col style="width:10mm"/><col style="width:10mm"/>
  <col style="width:12mm"/><col style="width:12mm"/><col style="width:12mm"/><col style="width:8mm"/>
</colgroup>
<thead>
  <tr>
    <th class="th-base" rowspan="2">ITEM</th>
    <th class="th-base" rowspan="2">CÓDIGO</th>
    <th class="th-base" rowspan="2">DESCRIÇÃO</th>
    <th class="th-base" rowspan="2">FONTE</th>
    <th class="th-base" rowspan="2">UNID</th>
    <th class="th-base" rowspan="2">QTD</th>
    <th class="th-base" colspan="2">PREÇO UNITÁRIO R$</th>
    <th class="th-base" colspan="2">PREÇO TOTAL R$</th>
    <th class="th-med" colspan="9" style="background:${p.thMed}">PLANILHA DE MEDIÇÃO</th>
  </tr>
  <tr>
    <th class="th-base">SEM BDI</th><th class="th-base">COM BDI</th>
    <th class="th-base">COM BDI</th><th class="th-base">DESC ${(obra.desconto_percentual*100).toFixed(1)}%</th>
    <th class="th-med">ACUM ANT</th><th class="th-med">MED PERÍODO</th><th class="th-med">%</th>
    <th class="th-med">ACUM (UND)</th><th class="th-med">SALDO (UND)</th>
    <th class="th-med">MED (R$)</th><th class="th-med">ACUM (R$)</th><th class="th-med">SALDO (R$)</th><th class="th-med">%</th>
  </tr>
</thead>`
  } else {
    tblHead = `
<colgroup>
  <col style="width:5mm"/><col style="width:9mm"/><col style="width:11mm"/>
  <col style="width:50mm"/><col style="width:6mm"/><col style="width:10mm"/>
  <col style="width:11mm"/><col style="width:11mm"/><col style="width:11mm"/>
  <col style="width:12mm"/><col style="width:6mm"/>
  <col style="width:10mm"/><col style="width:11mm"/><col style="width:11mm"/>
  <col style="width:11mm"/><col style="width:11mm"/>
  <col style="width:10mm"/><col style="width:10mm"/>
  <col style="width:12mm"/><col style="width:12mm"/><col style="width:12mm"/>
  <col style="width:12mm"/><col style="width:7mm"/>
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
</thead>`
  }

  // ── Demonstrativo ───────────────────────────────────────────────────────────
  const antRowsHtml = (medicoesAnteriores||[]).map((m,i) => {
    const cls = i%2===0?'demo-par':'demo-impar'
    return `<tr class="${cls}"><td>${m.numero_extenso} Medição (Anterior)</td><td class="demo-val">${fmtC(m.valorPeriodo)}</td></tr>`
  }).join('')

  const demoRows = [
    `<tr class="demo-par"><td><strong>Valor Total do Orçamento</strong></td><td class="demo-val">${fmtC(vals.totalOrcamento)}</td></tr>`,
    antRowsHtml,
    vals.valorAcumulado - vals.valorPeriodo > 0
      ? `<tr class="demo-impar"><td><strong>Total Faturado Anterior</strong></td><td class="demo-val">${fmtC(vals.valorAcumulado-vals.valorPeriodo)}</td></tr>` : '',
    `<tr style="background:${isPref?'#C6EFCE':'#FFF2CC'}"><td><strong>${medicao.numero_extenso} Medição — Período</strong></td><td class="demo-val" style="color:${isPref?'#375623':'#C00000'};font-weight:bold">${fmtC(vals.valorPeriodo)}</td></tr>`,
    `<tr class="demo-par"><td>Percentual da Medição</td><td class="demo-val">${fmtN(vals.percentualPeriodo*100)}%</td></tr>`,
    `<tr class="demo-impar"><td><strong>Faturado Acumulado</strong></td><td class="demo-val">${fmtC(vals.valorAcumulado)}</td></tr>`,
    `<tr class="demo-par"><td>Percentual Acumulado</td><td class="demo-val">${fmtN(vals.percentualAcumulado*100)}%</td></tr>`,
    `<tr style="background:${isPref?'#E2EFDA':'#E2EFDA'}"><td><strong>Saldo do Contrato</strong></td><td class="demo-val" style="color:#375623">${fmtC(vals.valorSaldo)}</td></tr>`,
    `<tr class="demo-impar"><td>Percentual do Saldo</td><td class="demo-val">${fmtN(vals.percentualSaldo*100)}%</td></tr>`,
  ].join('')

  const totalColspan = isPref ? 9 : 9
  return `
${cabHtml}
<table class="tabela-med">
  ${tblHead}
  <tbody>
    ${rows}
    <tr class="tr-total">
      <td colspan="${totalColspan}" style="text-align:center;font-size:8pt">TOTAIS GERAIS</td>
      <td class="num">${fmtN(vals.totalOrcamento)}</td>
      ${isPref
        ? `<td class="num">${fmtN(vals.totalOrcamento*(1-desconto))}</td>
           <td colspan="4"></td>
           <td class="num">${fmtN(vals.valorPeriodo)}</td>
           <td class="num">${fmtN(vals.valorAcumulado)}</td>
           <td class="num">${fmtN(vals.valorSaldo)}</td>
           <td></td>`
        : `<td></td><td></td><td></td>
           <td class="num">${fmtN(vals.valorAcumulado)}</td>
           <td></td><td></td><td></td>
           <td class="num">${fmtN(vals.valorAcumulado)}</td>
           <td class="num">${fmtN(vals.valorPeriodo)}</td>
           <td class="num">${fmtN(vals.valorSaldo)}</td>
           <td></td>`
      }
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

// ─── HTML MEMÓRIA ─────────────────────────────────────────────────────────────
function gerarHTMLMEM(
  contrato: Contrato, obra: Obra, medicao: Medicao,
  servicos: Servico[], linhasPorServico: Map<string, LinhaMemoria[]>,
  p: Paleta, isPref: boolean
): string {
  const fmtN = (n: number | null | undefined, d = 4) =>
    n == null ? '—' : n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })

  let rows = ''
  const servicosOrd = servicos.filter(s => !s.is_grupo).sort((a,b) => a.ordem - b.ordem)

  for (const srv of servicosOrd) {
    const linhas = (linhasPorServico.get(srv.id)||[]).sort((a,b) => a.sub_item.localeCompare(b.sub_item))
    if (!linhas.length) continue

    rows += `<tr class="tr-srv">
      <td class="ctr">${srv.item}</td>
      <td colspan="13" style="text-align:left">${srv.descricao} — ${srv.unidade}</td>
    </tr>`

    for (const l of linhas) {
      const cls = l.status==='A pagar' ? 'tr-apagar' : l.status==='Pago' ? 'tr-pago' : ''
      rows += `<tr class="${cls}">
        <td class="ctr" style="font-size:6pt">${l.sub_item}</td>
        <td style="font-size:6pt">${l.descricao_calculo}</td>
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
        <td class="ctr" style="font-size:6pt">${l.status}</td>
      </tr>`
    }

    const qtdAnt = linhas.filter(l=>l.status==='Pago').reduce((s,l)=>s+l.total,0)
    const qtdPer = linhas.filter(l=>l.status==='A pagar').reduce((s,l)=>s+l.total,0)
    rows += `
      <tr class="tr-tot-mem"><td colspan="12" style="text-align:right">TOTAL ACUMULADO:</td><td class="num">${fmtN(qtdAnt+qtdPer)}</td><td></td></tr>
      <tr class="tr-tot-ant"><td colspan="12" style="text-align:right">TOTAL ACUMULADO ANTERIOR:</td><td class="num">${fmtN(qtdAnt)}</td><td></td></tr>
      <tr class="tr-tot-mes"><td colspan="12" style="text-align:right">TOTAL DO MÊS (A PAGAR):</td><td class="num">${fmtN(qtdPer)}</td><td></td></tr>
      <tr><td colspan="14" style="height:3mm"></td></tr>`
  }

  const dataFmt = medicao.data_medicao
    ? new Date(medicao.data_medicao+'T00:00:00').toLocaleDateString('pt-BR') : '—'

  return `
<div class="mem-titulo">
  MEMÓRIA DE CÁLCULO &nbsp;|&nbsp; ${obra.nome_obra} &nbsp;|&nbsp; ${medicao.numero_extenso} MEDIÇÃO &nbsp;|&nbsp; ${dataFmt}
</div>
<table class="tabela-mem">
  <thead>
    <tr>
      <th class="th-mem" style="width:10mm">ITEM</th>
      <th class="th-mem">DESCRIÇÃO DO CÁLCULO</th>
      <th class="th-mem" style="width:11mm">Larg.</th>
      <th class="th-mem" style="width:11mm">Comp.</th>
      <th class="th-mem" style="width:11mm">Alt.</th>
      <th class="th-mem" style="width:11mm">Perim.</th>
      <th class="th-mem" style="width:11mm">Área</th>
      <th class="th-mem" style="width:11mm">Vol.</th>
      <th class="th-mem" style="width:11mm">Kg</th>
      <th class="th-mem" style="width:11mm">Outros</th>
      <th class="th-mem" style="width:11mm">Desc.</th>
      <th class="th-mem" style="width:11mm">Qtde</th>
      <th class="th-mem" style="width:14mm">TOTAL</th>
      <th class="th-mem" style="width:16mm">STATUS</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>`
}

// ─── FOTOS (inalterado) ───────────────────────────────────────────────────────
async function toBase64FromSrc(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = reject
    img.src = src
  })
}

export async function gerarFotosPDF(
  contrato: Contrato, obra: Obra, medicao: Medicao, fotos: FotoMedicao[]
): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth=210, pageHeight=297, marginX=14, marginY=12
  const contentW=pageWidth-marginX*2
  const headerH=46, sectionH=8, captionH=6, photoRowH=56, rowGap=4, colGap=4
  const photoColW=(contentW-colGap)/2
  const dataFmt=medicao.data_medicao?new Date(medicao.data_medicao+'T00:00:00').toLocaleDateString('pt-BR'):'—'
  const imgDataList = await Promise.all(fotos.map(f=>toBase64FromSrc(f.base64)))
  let currentY=marginY, photoIndex=0, isFirstPage=true

  const drawPageElements = () => {
    doc.setDrawColor(60,60,60); doc.setLineWidth(0.5)
    doc.rect(marginX, currentY, contentW, headerH)
    doc.setFillColor(232,80,10)
    doc.rect(marginX, currentY, 28, headerH, 'F')
    doc.setFont('helvetica','bold'); doc.setFontSize(14); doc.setTextColor(255,255,255)
    doc.text('RD', marginX+14, currentY+16, {align:'center'})
    doc.setFontSize(6); doc.text('CONSTRUTORA', marginX+14, currentY+22, {align:'center'})
    doc.line(marginX+28, currentY, marginX+28, currentY+headerH)
    doc.setTextColor(30,30,30); doc.setFont('helvetica','bold'); doc.setFontSize(11)
    doc.text(contrato.empresa_executora||'RD SOLUÇÕES LTDA', pageWidth/2, currentY+7, {align:'center'})
    doc.setFont('helvetica','normal'); doc.setFontSize(7)
    doc.text('CNPJ: 43.357.757/0001-40', pageWidth/2, currentY+12, {align:'center'})
    doc.text('RUA BELA VISTA, 874, JARDINS, SÃO GONÇALO DO AMARANTE/RN', pageWidth/2, currentY+16.5, {align:'center'})
    doc.text('email: rd_solucoes@outlook.com / tel.: (84) 99641-8124', pageWidth/2, currentY+21, {align:'center'})
    const tableY=currentY+25, tableH=9, rowH=tableH/2, colW=contentW-28, tx=marginX+28
    doc.setDrawColor(150,150,150); doc.setLineWidth(0.3)
    doc.rect(tx,tableY,colW,tableH)
    doc.line(tx,tableY+rowH,tx+colW,tableY+rowH)
    const y1=tableY+rowH*0.65, y2=tableY+rowH+rowH*0.65
    doc.setFontSize(6.5); doc.setTextColor(30,30,30)
    doc.setFont('helvetica','bold'); doc.text('OBRA:', tx+1, y1)
    doc.setFont('helvetica','normal'); doc.text(obra.nome_obra||'', tx+14, y1)
    doc.setFont('helvetica','bold'); doc.text('MEDIÇÃO:', tx+1, y2)
    doc.setFont('helvetica','normal'); doc.text(medicao.numero_extenso, tx+18, y2)
    doc.setFont('helvetica','bold'); doc.text('DATA:', tx+50, y2)
    doc.setFont('helvetica','normal'); doc.text(dataFmt, tx+62, y2)
    currentY += headerH+2
    doc.setFillColor(55,86,35); doc.rect(marginX, currentY, contentW, sectionH, 'F')
    doc.setFont('helvetica','bold'); doc.setFontSize(8); doc.setTextColor(255,255,255)
    doc.text('REGISTRO FOTOGRÁFICO DOS SERVIÇOS EXECUTADOS', pageWidth/2, currentY+5.5, {align:'center'})
    currentY += sectionH+4
  }

  while (photoIndex < fotos.length) {
    if (isFirstPage) { drawPageElements(); isFirstPage=false }
    else { doc.addPage(); currentY=marginY; drawPageElements() }
    const availableH=pageHeight-currentY-marginY
    const rowsPerPage=Math.max(1, Math.floor(availableH/(photoRowH+captionH+rowGap)))
    for (let row=0; row<rowsPerPage && photoIndex<fotos.length; row++) {
      const rowY=currentY
      for (let col=0; col<2 && photoIndex<fotos.length; col++) {
        const foto=fotos[photoIndex], imgData=imgDataList[photoIndex]
        const figNum=photoIndex+1, cellX=marginX+col*(photoColW+colGap)
        doc.setDrawColor(180,180,180); doc.setLineWidth(0.3)
        doc.rect(cellX,rowY,photoColW,photoRowH)
        try { doc.addImage(imgData,'JPEG',cellX+0.5,rowY+0.5,photoColW-1,photoRowH-1,undefined,'FAST') }
        catch { doc.setFillColor(220,220,220); doc.rect(cellX+0.5,rowY+0.5,photoColW-1,photoRowH-1,'F') }
        const capY=rowY+photoRowH
        doc.setFillColor(250,250,250); doc.rect(cellX,capY,photoColW,captionH,'F')
        doc.setDrawColor(180,180,180); doc.rect(cellX,capY,photoColW,captionH)
        doc.setFont('helvetica','normal'); doc.setFontSize(6.5); doc.setTextColor(60,60,60)
        doc.text(foto.legenda?`Figura ${figNum}: ${foto.legenda}`:`Figura ${figNum}`, cellX+photoColW/2, capY+captionH/2+1.5, {align:'center'})
        photoIndex++
      }
      currentY += photoRowH+captionH+rowGap
    }
  }

  const totalPages=doc.getNumberOfPages()
  for (let i=1;i<=totalPages;i++) {
    doc.setPage(i); doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(150,150,150)
    doc.text(`Página ${i} / ${totalPages}`, pageWidth-marginX, pageHeight-6, {align:'right'})
  }

  const pdfBlob=doc.output('blob'), pdfUrl=URL.createObjectURL(pdfBlob)
  const win=window.open(pdfUrl,'_blank')
  if (win) { win.addEventListener('load',()=>{ setTimeout(()=>{ win.print(); URL.revokeObjectURL(pdfUrl) },800) }) }
}
