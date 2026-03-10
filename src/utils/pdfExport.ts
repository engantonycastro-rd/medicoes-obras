import jsPDF from 'jspdf'
import { Contrato, Obra, Medicao, Servico, LinhaMemoria, FotoMedicao } from '../types'
import {
  calcPrecoComDesconto, calcPrecoComBDI, calcPrecoTotal,
  calcResumoServico, calcValoresMedicao, valorPorExtenso,
} from './calculations'

// ─── PALETAS ─────────────────────────────────────────────────────────────────
const PAL = {
  ESTADO: {
    hdrPrincipal:'#1F3864', hdrSub:'#2E75B6', hdrCabec:'#DEEAF1',
    hdrDirBg:'#ED7D31', thBase:'#1F3864', thMed:'#2E75B6',
    trGrupo:'#BDD7EE', trTotal:'#1F3864',
    extensoBg:'#FFF8E7', extensoBdr:'#ED7D31',
    memTitulo:'#1F3864', memSub:'#2E75B6', memGrupo:'#BDD7EE', memGrupoFnt:'#1F3864',
    memApagar:'#E2EFDA', memPago:'#DDEEFF',
    memTotAc:'#D9D9D9', memTotAnt:'#DDEEFF', memTotMes:'#FFF2CC',
    thMem:'#1F3864', faixaTopo:'#ED7D31',
  },
  PREFEITURA: {
    hdrPrincipal:'#375623', hdrSub:'#70AD47', hdrCabec:'#E2EFDA',
    hdrDirBg:'#375623', thBase:'#4E6B30', thMed:'#70AD47',
    trGrupo:'#E2EFDA', trTotal:'#375623',
    extensoBg:'#F0FFF0', extensoBdr:'#70AD47',
    memTitulo:'#375623', memSub:'#70AD47', memGrupo:'#E2EFDA', memGrupoFnt:'#375623',
    memApagar:'#C6EFCE', memPago:'#BDD7EE',
    memTotAc:'#A9D08E', memTotAnt:'#C6EFCE', memTotMes:'#FFEB9C',
    thMem:'#375623', faixaTopo:'#70AD47',
  },
}
type Pal = typeof PAL.ESTADO

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
  const p = isPref ? PAL.PREFEITURA : PAL.ESTADO

  const htmlMED = gerarHTMLMED(contrato, obra, medicao, servicos, linhasPorServico, logoBase64, medicoesAnteriores, p, isPref)
  const htmlMEM = gerarHTMLMEM(contrato, obra, medicao, servicos, linhasPorServico, p, isPref)
  const html    = montarDoc(obra, medicao, htmlMED, htmlMEM)

  const blob = new Blob([html], { type: 'text/html; charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const win  = window.open(url, '_blank')
  if (win) win.addEventListener('load', () => setTimeout(() => { win.print(); URL.revokeObjectURL(url) }, 800))

  if (fotos && fotos.length > 0) await gerarFotosPDF(contrato, obra, medicao, fotos)
}

// ─── CSS COMPARTILHADO ────────────────────────────────────────────────────────
function montarDoc(obra: Obra, medicao: Medicao, med: string, mem: string) {
  return `<!DOCTYPE html>
<html lang="pt-BR"><head>
<meta charset="UTF-8"/>
<title>${obra.nome_obra} — ${medicao.numero_extenso} Medição</title>
<style>
  @page { size: A4 landscape; margin: 6mm 5mm; }
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:6.5pt;color:#111;background:#fff}
  .page-break{page-break-after:always}

  /* ===== CABEÇALHO PREFEITURA (estilo PREV 02) ===== */
  .pf-cab{width:100%;border-collapse:collapse;border:1px solid #888;margin-bottom:1.5mm;font-size:6.5pt}
  .pf-cab td{padding:0.7mm 1.2mm;vertical-align:middle;border:0.4px solid #bbb}
  .pf-lbl{color:#444;white-space:nowrap;font-size:6pt}
  .pf-val{font-weight:bold}
  .pf-hl{background:#D4D4D4;font-weight:bold;text-align:right;font-size:6.5pt}
  .pf-hl-val{font-weight:bold;text-align:right;font-size:7pt}
  .pf-verde{background:#C6EFCE;font-weight:bold;text-align:right;font-size:7pt}
  .pf-logo-cell{width:22mm;text-align:center;vertical-align:middle;border-right:1px solid #888}
  .pf-logo-cell img{max-width:20mm;max-height:16mm;object-fit:contain}
  .pf-empresa{font-size:6pt;line-height:1.5;vertical-align:top;text-align:left;padding:1.5mm}

  /* ===== CABEÇALHO ESTADO ===== */
  .est-cab{display:flex;border:1.5px solid #1F3864;margin-bottom:2mm}
  .est-logo{width:26mm;display:flex;align-items:center;justify-content:center;border-right:1px solid #1F3864;padding:1.5mm;background:#fff}
  .est-logo img{max-height:13mm;max-width:24mm;object-fit:contain}
  .est-logo span{font-size:6.5pt;color:#555;text-align:center}
  .est-centro{flex:1;display:flex;flex-direction:column}
  .est-orgao{background:#1F3864;color:#fff;font-weight:bold;font-size:8.5pt;text-align:center;padding:1.5mm}
  .est-sub{background:#2E75B6;color:#fff;font-size:7pt;text-align:center;padding:0.8mm}
  .est-obra{background:#DEEAF1;font-size:6.5pt;text-align:center;padding:0.8mm;font-weight:bold}
  .est-ctr{background:#DEEAF1;font-size:6pt;text-align:center;padding:0.5mm}
  .est-dir{width:26mm;display:flex;flex-direction:column;border-left:1px solid #1F3864}
  .est-dir-num{background:#ED7D31;color:#fff;font-weight:bold;font-size:10pt;text-align:center;padding:1.5mm;flex:1;display:flex;align-items:center;justify-content:center}
  .est-dir-info{background:#DEEAF1;font-size:5.5pt;text-align:center;padding:0.8mm;border-top:1px solid #1F3864}

  /* ===== TABELA MEDIÇÃO ===== */
  .t-med{width:100%;border-collapse:collapse;font-size:5.8pt}
  .t-med th,.t-med td{border:0.4px solid #999;padding:0.4mm 0.6mm;vertical-align:middle}
  .th-b{color:#fff;font-weight:bold;text-align:center;white-space:nowrap}
  .th-m{color:#fff;font-weight:bold;text-align:center;white-space:nowrap}
  .tr-g{font-weight:bold}
  .tr-par{background:#FAFAFA}
  .tr-imp{background:#fff}
  .td-desc{text-align:left!important;white-space:normal!important;word-break:break-word;line-height:1.25}
  .td-per{background:#C6EFCE;font-weight:bold}
  .td-100{background:#70AD47;color:#fff}
  .tr-tot{font-weight:bold}
  .num{text-align:right;white-space:nowrap}
  .ctr{text-align:center;white-space:nowrap}

  /* ===== EXTENSO / DEMO ===== */
  .extenso{padding:1.5mm 2.5mm;margin:1.5mm 0;font-weight:bold;font-size:7pt;border-width:1.2px;border-style:solid}
  .demo-titulo{color:#fff;font-weight:bold;font-size:7.5pt;padding:1.5mm;margin-top:2mm}
  .demo-t{width:76mm;border-collapse:collapse;margin-top:1mm}
  .demo-t td{border:0.4px solid #aaa;padding:0.8mm 1.5mm;font-size:6.5pt}
  .d-par{background:#F5F5F5}
  .d-imp{background:#fff}
  .d-val{font-weight:bold;text-align:right;width:28mm}

  /* ===== MEMÓRIA ===== */
  .mem-tit{font-size:9pt;font-weight:bold;margin-bottom:1.5mm;padding:1.5mm 2mm;border-left-width:4px;border-left-style:solid}
  .t-mem{width:100%;border-collapse:collapse;margin-top:1.5mm;font-size:5.8pt}
  .t-mem th,.t-mem td{border:0.4px solid #aaa;padding:0.4mm 0.7mm;vertical-align:middle}
  .th-mem{color:#fff;font-weight:bold;text-align:center;white-space:nowrap}
  .tr-srv{font-weight:bold}
  .tr-ap{} .tr-pg{} .tr-tam{font-weight:bold} .tr-tan{font-weight:bold} .tr-tme{font-weight:bold}

  @media print{
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .page-break{page-break-after:always}
    @page{margin:6mm 5mm}
  }
</style></head><body>
${med}
<div class="page-break"></div>
${mem}
</body></html>`
}

// ─── HTML MEDIÇÃO ─────────────────────────────────────────────────────────────
function gerarHTMLMED(
  contrato: Contrato, obra: Obra, medicao: Medicao,
  servicos: Servico[], linhasPorServico: Map<string, LinhaMemoria[]>,
  logoBase64: string|null|undefined,
  medicoesAnteriores: {numero_extenso:string;valorPeriodo:number}[]|undefined,
  p: Pal, isPref: boolean
): string {
  const fN = (n:number, d=2) => n.toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d})
  const fC = (n:number) => `R$ ${fN(n)}`
  const dataFmt = medicao.data_medicao
    ? new Date(medicao.data_medicao+'T00:00:00').toLocaleDateString('pt-BR') : '—'
  const vals = calcValoresMedicao(servicos, linhasPorServico, obra)
  const desc = obra.desconto_percentual

  // ── Cabeçalho ───────────────────────────────────────────────────────────────
  let cab = ''
  if (isPref) {
    const logoCell = logoBase64
      ? `<td class="pf-logo-cell" rowspan="9"><img src="${logoBase64}" alt="Logo"/></td>`
      : `<td class="pf-logo-cell" rowspan="9" style="font-weight:bold;font-size:7.5pt;color:#375623">RD<br/>CONSTRUTORA</td>`
    cab = `
<table class="pf-cab">
  <tr>
    ${logoCell}
    <td class="pf-lbl">CONCEDENTE</td>
    <td class="pf-lbl">Data de emissão BM</td>
    <td class="pf-lbl">Período de referência</td>
    <td class="pf-hl" colspan="2">VALOR DO CONTRATO</td>
    <td class="pf-empresa" rowspan="9" style="width:36mm">
      <strong>RD CONSTRUTORA LTDA</strong><br/>
      RUA BELA VISTA, 874, JARDINS,<br/>
      SÃO GONÇALO DO AMARANTE/RN<br/>
      CEP: 59293-576<br/>
      CNPJ: 43.357.757/0001-40<br/>
      email: rd_solucoes@outlook.com<br/>
      tel.: (84) 99641-8124
    </td>
  </tr>
  <tr>
    <td class="pf-val">${contrato.orgao_nome||''}</td>
    <td class="pf-val">${dataFmt}</td>
    <td class="pf-val">${dataFmt}</td>
    <td class="pf-hl-val" colspan="2">${fC(vals.totalOrcamento)}</td>
  </tr>
  <tr>
    <td class="pf-lbl">CONVENETE</td>
    <td colspan="2" class="pf-lbl">OBJETIVO DA ORDEM DE SERVIÇO</td>
    <td class="pf-lbl" colspan="2">VALOR DA O.S. ${contrato.numero_contrato||'01/2025'}</td>
  </tr>
  <tr>
    <td class="pf-val">${contrato.orgao_nome||''}</td>
    <td colspan="2" class="pf-val">${obra.nome_obra||''}</td>
    <td class="pf-hl-val" colspan="2">${fC(vals.totalOrcamento)}</td>
  </tr>
  <tr>
    <td class="pf-lbl">PROCESSO LICITATÓRIO</td>
    <td colspan="2" class="pf-val">${obra.numero_contrato||''}</td>
    <td class="pf-hl" colspan="2">VALOR ACUMULADO</td>
  </tr>
  <tr>
    <td class="pf-lbl">EMPRESA CONTRATADA</td>
    <td class="pf-lbl">CNPJ</td>
    <td class="pf-lbl"></td>
    <td class="pf-hl-val" colspan="2">${fC(vals.valorAcumulado)}</td>
  </tr>
  <tr>
    <td class="pf-val">${contrato.empresa_executora||''}</td>
    <td class="pf-val">43.357.757/0001-40</td>
    <td></td>
    <td class="pf-hl" colspan="2">SALDO EM CONTRATO</td>
  </tr>
  <tr>
    <td colspan="3"></td>
    <td class="pf-hl-val" colspan="2">${fC(vals.valorSaldo)}</td>
  </tr>
  <tr>
    <td class="pf-val" style="font-weight:bold">BOLETIM DE MEDIÇÃO - N° ${medicao.numero}</td>
    <td class="pf-lbl">EMISSÃO DO BM &nbsp;<strong>${dataFmt}</strong></td>
    <td class="pf-lbl">VALOR MEDIDO NO PERÍODO:</td>
    <td class="pf-verde" colspan="2">${fC(vals.valorPeriodo)}</td>
  </tr>
</table>`
  } else {
    const logoHtml = logoBase64
      ? `<img src="${logoBase64}" alt="Logo"/>`
      : `<span>${contrato.empresa_executora}</span>`
    cab = `
<div class="est-cab">
  <div class="est-logo">${logoHtml}</div>
  <div class="est-centro">
    <div class="est-orgao">${contrato.orgao_nome}</div>
    <div class="est-sub">${contrato.orgao_subdivisao||''}</div>
    <div class="est-obra">OBRA: ${obra.nome_obra} | LOCAL: ${obra.local_obra}</div>
    <div class="est-ctr">Contrato: ${obra.numero_contrato||'—'} | Empresa: ${contrato.empresa_executora}</div>
  </div>
  <div class="est-dir">
    <div class="est-dir-num">${medicao.numero_extenso} MEDIÇÃO</div>
    <div class="est-dir-info">Data: ${dataFmt}</div>
    <div class="est-dir-info">Desc: ${(desc*100).toFixed(2)}% | BDI: ${(obra.bdi_percentual*100).toFixed(2)}%</div>
  </div>
</div>`
  }

  // ── Cabeçalho da tabela ─────────────────────────────────────────────────────
  let thead = ''
  const thBStyle = `background:${p.thBase}`
  const thMStyle = `background:${p.thMed}`

  if (isPref) {
    thead = `
<colgroup>
  <col style="width:5mm"/><col style="width:11mm"/><col style="width:50mm"/>
  <col style="width:8mm"/><col style="width:6mm"/><col style="width:10mm"/>
  <col style="width:10mm"/><col style="width:10mm"/>
  <col style="width:12mm"/><col style="width:11mm"/>
  <col style="width:10mm"/><col style="width:10mm"/><col style="width:7mm"/>
  <col style="width:10mm"/><col style="width:10mm"/>
  <col style="width:11mm"/><col style="width:12mm"/><col style="width:11mm"/><col style="width:7mm"/>
</colgroup>
<thead>
  <tr>
    <th class="th-b" style="${thBStyle}" rowspan="2">ITEM</th>
    <th class="th-b" style="${thBStyle}" rowspan="2">CÓDIGO</th>
    <th class="th-b" style="${thBStyle}" rowspan="2">DESCRIÇÃO</th>
    <th class="th-b" style="${thBStyle}" rowspan="2">FONTE</th>
    <th class="th-b" style="${thBStyle}" rowspan="2">UNID</th>
    <th class="th-b" style="${thBStyle}" rowspan="2">QTD</th>
    <th class="th-b" style="${thBStyle}" colspan="2">PREÇO UNITÁRIO R$</th>
    <th class="th-b" style="${thBStyle}" colspan="2">PREÇO TOTAL R$</th>
    <th class="th-m" style="${thMStyle}" colspan="9">PLANILHA DE MEDIÇÃO</th>
  </tr>
  <tr>
    <th class="th-b" style="${thBStyle}">SEM BDI</th>
    <th class="th-b" style="${thBStyle}">COM BDI</th>
    <th class="th-b" style="${thBStyle}">COM BDI</th>
    <th class="th-b" style="${thBStyle}">DESCONTO ${(desc*100).toFixed(1)}%</th>
    <th class="th-m" style="${thMStyle}">ACUMULADO ANTERIOR</th>
    <th class="th-m" style="${thMStyle}">MED. NO PERÍODO</th>
    <th class="th-m" style="${thMStyle}">(%)</th>
    <th class="th-m" style="${thMStyle}">ACUMULADO ATUAL (UND)</th>
    <th class="th-m" style="${thMStyle}">SALDO (UND)</th>
    <th class="th-m" style="${thMStyle}">MED. ATUAL (R$)</th>
    <th class="th-m" style="${thMStyle}">ACUMULADO (R$)</th>
    <th class="th-m" style="${thMStyle}">SALDO (R$)</th>
    <th class="th-m" style="${thMStyle}">(%)</th>
  </tr>
</thead>`
  } else {
    thead = `
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
    <th class="th-b" style="${thBStyle}" colspan="11">PLANILHA BASE</th>
    <th class="th-m" style="${thMStyle}" colspan="12">PLANILHA DE MEDIÇÃO</th>
  </tr>
  <tr>
    <th class="th-b" style="${thBStyle}">ITEM</th><th class="th-b" style="${thBStyle}">FONTE</th>
    <th class="th-b" style="${thBStyle}">CÓDIGO</th><th class="th-b" style="${thBStyle}">DESCRIÇÃO</th>
    <th class="th-b" style="${thBStyle}">UNID</th><th class="th-b" style="${thBStyle}">QTD</th>
    <th class="th-b" style="${thBStyle}">PU R$</th><th class="th-b" style="${thBStyle}">c/Desc</th>
    <th class="th-b" style="${thBStyle}">c/BDI</th><th class="th-b" style="${thBStyle}">TOTAL R$</th>
    <th class="th-b" style="${thBStyle}">PESO%</th>
    <th class="th-m" style="${thMStyle}">PREV</th><th class="th-m" style="${thMStyle}">ANT ACUM</th>
    <th class="th-m" style="${thMStyle}">PERÍODO</th><th class="th-m" style="${thMStyle}">ACUM</th>
    <th class="th-m" style="${thMStyle}">SALDO</th>
    <th class="th-m" style="${thMStyle}">UNIT</th><th class="th-m" style="${thMStyle}">UNIT BDI</th>
    <th class="th-m" style="${thMStyle}">ANT R$</th><th class="th-m" style="${thMStyle}">ACUM R$</th>
    <th class="th-m" style="${thMStyle}">PERÍODO R$</th><th class="th-m" style="${thMStyle}">SALDO R$</th>
    <th class="th-m" style="${thMStyle}">SALDO%</th>
  </tr>
</thead>`
  }

  // ── Dados ───────────────────────────────────────────────────────────────────
  let rows = ''
  let ri = 0
  const grpBg = `background:${p.trGrupo}`

  for (const srv of [...servicos].sort((a,b)=>a.ordem-b.ordem)) {
    const pDesc = calcPrecoComDesconto(srv.preco_unitario, desc)
    const pBDI  = calcPrecoComBDI(pDesc, obra.bdi_percentual)
    const pTot  = calcPrecoTotal(srv.quantidade, pBDI)
    const pTotD = pTot * (1-desc)

    if (srv.is_grupo) {
      if (isPref) {
        rows += `<tr style="${grpBg};font-weight:bold">
          <td class="ctr">${srv.item}</td>
          <td></td>
          <td class="td-desc" colspan="1">${srv.descricao}</td>
          <td></td><td></td><td></td>
          <td></td><td></td>
          <td class="num">${fN(pTot)}</td>
          <td class="num">${fN(pTotD)}</td>
          <td colspan="9"></td>
        </tr>`
      } else {
        rows += `<tr style="${grpBg};font-weight:bold">
          <td class="ctr">${srv.item}</td>
          <td colspan="3" class="td-desc">${srv.descricao}</td>
          <td colspan="5"></td>
          <td class="num">${fN(pTot)}</td>
          <td colspan="13"></td>
        </tr>`
      }
      continue
    }

    const linhas = linhasPorServico.get(srv.id)||[]
    const { qtdAnterior, qtdPeriodo, qtdAcumulada, qtdSaldo } = calcResumoServico(srv, linhas)
    const cls = ri%2===0?'tr-par':'tr-imp'
    const pctAcum = srv.quantidade>0 ? qtdAcumulada/srv.quantidade : 0
    const pCls = qtdPeriodo>0?' td-per':''
    const c100 = pctAcum>=1?' td-100':''

    if (isPref) {
      const medR  = qtdPeriodo  * pBDI * (1-desc)
      const acumR = qtdAcumulada * pBDI * (1-desc)
      const saldR = qtdSaldo    * pBDI * (1-desc)
      rows += `<tr class="${cls}">
        <td class="ctr">${srv.item}</td>
        <td class="ctr">${srv.codigo}</td>
        <td class="td-desc">${srv.descricao}</td>
        <td class="ctr">${srv.fonte}</td>
        <td class="ctr">${srv.unidade}</td>
        <td class="num">${fN(srv.quantidade,4)}</td>
        <td class="num">${fN(pDesc)}</td>
        <td class="num">${fN(pBDI)}</td>
        <td class="num">${fN(pTot)}</td>
        <td class="num">${fN(pTotD)}</td>
        <td class="num${qtdAnterior>0?' td-per':''}">${fN(qtdAnterior,4)}</td>
        <td class="num${pCls}">${fN(qtdPeriodo,4)}</td>
        <td class="num${pCls}">${fN(pctAcum*100,2)}%</td>
        <td class="num">${fN(qtdAcumulada,4)}</td>
        <td class="num">${fN(qtdSaldo,4)}</td>
        <td class="num${pCls}">${fN(medR)}</td>
        <td class="num">${fN(acumR)}</td>
        <td class="num">${fN(saldR)}</td>
        <td class="num${c100}">${fN(pctAcum*100,2)}%</td>
      </tr>`
    } else {
      rows += `<tr class="${cls}">
        <td class="ctr">${srv.item}</td>
        <td class="ctr">${srv.fonte}</td>
        <td class="ctr">${srv.codigo}</td>
        <td class="td-desc">${srv.descricao}</td>
        <td class="ctr">${srv.unidade}</td>
        <td class="num">${fN(srv.quantidade,4)}</td>
        <td class="num">${fN(srv.preco_unitario)}</td>
        <td class="num">${fN(pDesc)}</td>
        <td class="num">${fN(pBDI)}</td>
        <td class="num">${fN(pTot)}</td>
        <td class="ctr">—</td>
        <td class="num">${fN(srv.quantidade,4)}</td>
        <td class="num">${fN(qtdAnterior,4)}</td>
        <td class="num${pCls}">${fN(qtdPeriodo,4)}</td>
        <td class="num">${fN(qtdAcumulada,4)}</td>
        <td class="num">${fN(qtdSaldo,4)}</td>
        <td class="num">${fN(pDesc)}</td>
        <td class="num">${fN(pBDI)}</td>
        <td class="num">${fN(qtdAnterior*pBDI)}</td>
        <td class="num">${fN(qtdAcumulada*pBDI)}</td>
        <td class="num${pCls}">${fN(qtdPeriodo*pBDI)}</td>
        <td class="num${c100}">${fN(pTot-qtdAcumulada*pBDI)}</td>
        <td class="num${c100}">${fN((1-pctAcum)*100,2)}%</td>
      </tr>`
    }
    ri++
  }

  // ── Linha de totais ─────────────────────────────────────────────────────────
  const totBg  = `background:${p.trTotal};color:#fff`
  let totRow = ''
  if (isPref) {
    totRow = `<tr style="${totBg}">
      <td colspan="8" style="text-align:center;font-size:7pt">TOTAIS GERAIS</td>
      <td class="num">${fN(vals.totalOrcamento)}</td>
      <td class="num">${fN(vals.totalOrcamento*(1-desc))}</td>
      <td colspan="4"></td>
      <td></td>
      <td class="num">${fN(vals.valorPeriodo)}</td>
      <td class="num">${fN(vals.valorAcumulado)}</td>
      <td class="num">${fN(vals.valorSaldo)}</td>
      <td></td>
    </tr>`
  } else {
    totRow = `<tr style="${totBg}">
      <td colspan="9" style="text-align:center;font-size:7pt">TOTAIS GERAIS</td>
      <td class="num">${fN(vals.totalOrcamento)}</td>
      <td></td><td></td><td></td><td></td>
      <td class="num">${fN(vals.valorAcumulado)}</td>
      <td></td><td></td><td></td>
      <td class="num">${fN(vals.valorAcumulado)}</td>
      <td class="num">${fN(vals.valorPeriodo)}</td>
      <td class="num">${fN(vals.valorSaldo)}</td>
      <td></td>
    </tr>`
  }

  // ── Demonstrativo ───────────────────────────────────────────────────────────
  const antRows = (medicoesAnteriores||[]).map((m,i)=>{
    const c=i%2===0?'d-par':'d-imp'
    return `<tr class="${c}"><td>${m.numero_extenso} Medição (Anterior)</td><td class="d-val">${fC(m.valorPeriodo)}</td></tr>`
  }).join('')

  const demoRows = [
    `<tr class="d-par"><td><strong>Valor Total do Orçamento</strong></td><td class="d-val">${fC(vals.totalOrcamento)}</td></tr>`,
    antRows,
    vals.valorAcumulado-vals.valorPeriodo>0
      ? `<tr class="d-imp"><td><strong>Total Faturado Anterior</strong></td><td class="d-val">${fC(vals.valorAcumulado-vals.valorPeriodo)}</td></tr>` : '',
    `<tr style="background:${isPref?'#C6EFCE':'#FFF2CC'}"><td><strong>${medicao.numero_extenso} Medição — Período Atual</strong></td>
     <td class="d-val" style="color:${isPref?'#375623':'#C00000'}">${fC(vals.valorPeriodo)}</td></tr>`,
    `<tr class="d-par"><td>Percentual da Medição</td><td class="d-val">${fN(vals.percentualPeriodo*100)}%</td></tr>`,
    `<tr class="d-imp"><td><strong>Faturado Acumulado</strong></td><td class="d-val">${fC(vals.valorAcumulado)}</td></tr>`,
    `<tr class="d-par"><td>Percentual Acumulado</td><td class="d-val">${fN(vals.percentualAcumulado*100)}%</td></tr>`,
    `<tr style="background:#E2EFDA"><td><strong>Saldo do Contrato</strong></td><td class="d-val" style="color:#375623">${fC(vals.valorSaldo)}</td></tr>`,
    `<tr class="d-imp"><td>Percentual do Saldo</td><td class="d-val">${fN(vals.percentualSaldo*100)}%</td></tr>`,
  ].join('')

  const extBg  = isPref?'#F0FFF0':'#FFF8E7'
  const extBdr = isPref?'#70AD47':'#ED7D31'
  const demBg  = isPref?'#375623':'#1F3864'

  return `
${cab}
<table class="t-med">
  ${thead}
  <tbody>
    ${rows}
    ${totRow}
  </tbody>
</table>
<div class="extenso" style="background:${extBg};border-color:${extBdr}">
  A presente medição importa o valor de: ${valorPorExtenso(vals.valorPeriodo).toUpperCase()} —
  ${new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(vals.valorPeriodo)}
</div>
<div class="demo-titulo" style="background:${demBg}">DEMONSTRATIVO FINANCEIRO</div>
<table class="demo-t"><tbody>${demoRows}</tbody></table>`
}

// ─── HTML MEMÓRIA ─────────────────────────────────────────────────────────────
function gerarHTMLMEM(
  contrato: Contrato, obra: Obra, medicao: Medicao,
  servicos: Servico[], linhasPorServico: Map<string, LinhaMemoria[]>,
  p: Pal, isPref: boolean
): string {
  const fN = (n:number|null|undefined, d=4) =>
    n==null?'—':n.toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d})
  const dataFmt = medicao.data_medicao
    ? new Date(medicao.data_medicao+'T00:00:00').toLocaleDateString('pt-BR') : '—'

  let rows = ''
  for (const srv of servicos.filter(s=>!s.is_grupo).sort((a,b)=>a.ordem-b.ordem)) {
    const linhas = (linhasPorServico.get(srv.id)||[]).sort((a,b)=>a.sub_item.localeCompare(b.sub_item))
    if (!linhas.length) continue

    rows += `<tr class="tr-srv" style="background:${p.memGrupo};color:${p.memGrupoFnt}">
      <td class="ctr">${srv.item}</td>
      <td colspan="13" style="text-align:left">${srv.descricao} — ${srv.unidade}</td>
    </tr>`

    for (const l of linhas) {
      const bg = l.status==='A pagar'?p.memApagar : l.status==='Pago'?p.memPago:'#FCE4D6'
      rows += `<tr style="background:${bg}">
        <td class="ctr">${l.sub_item}</td>
        <td style="font-size:5.8pt">${l.descricao_calculo}</td>
        <td class="num">${fN(l.largura)}</td><td class="num">${fN(l.comprimento)}</td>
        <td class="num">${fN(l.altura)}</td><td class="num">${fN(l.perimetro)}</td>
        <td class="num">${fN(l.area)}</td><td class="num">${fN(l.volume)}</td>
        <td class="num">${fN(l.kg)}</td><td class="num">${fN(l.outros)}</td>
        <td class="num">${fN(l.desconto_dim)}</td><td class="num">${fN(l.quantidade)}</td>
        <td class="num" style="font-weight:bold">${fN(l.total)}</td>
        <td class="ctr" style="font-size:5.5pt">${l.status}</td>
      </tr>`
    }

    const qtdAnt = linhas.filter(l=>l.status==='Pago').reduce((s,l)=>s+l.total,0)
    const qtdPer = linhas.filter(l=>l.status==='A pagar').reduce((s,l)=>s+l.total,0)
    rows += `
      <tr class="tr-tam" style="background:${p.memTotAc}"><td colspan="12" style="text-align:right">TOTAL ACUMULADO:</td><td class="num">${fN(qtdAnt+qtdPer)}</td><td></td></tr>
      <tr class="tr-tan" style="background:${p.memTotAnt}"><td colspan="12" style="text-align:right">TOTAL ACUMULADO ANTERIOR:</td><td class="num">${fN(qtdAnt)}</td><td></td></tr>
      <tr class="tr-tme" style="background:${p.memTotMes}"><td colspan="12" style="text-align:right">TOTAL DO MÊS (A PAGAR):</td><td class="num">${fN(qtdPer)}</td><td></td></tr>
      <tr><td colspan="14" style="height:2.5mm"></td></tr>`
  }

  return `
<div class="mem-tit" style="background:${p.memGrupo};color:${p.memTitulo};border-color:${p.memTitulo}">
  MEMÓRIA DE CÁLCULO &nbsp;|&nbsp; ${obra.nome_obra} &nbsp;|&nbsp; ${medicao.numero_extenso} MEDIÇÃO &nbsp;|&nbsp; ${dataFmt}
</div>
<table class="t-mem">
  <thead>
    <tr>
      <th class="th-mem" style="background:${p.thMem};width:10mm">ITEM</th>
      <th class="th-mem" style="background:${p.thMem}">DESCRIÇÃO DO CÁLCULO</th>
      <th class="th-mem" style="background:${p.thMem};width:10.5mm">Larg.</th>
      <th class="th-mem" style="background:${p.thMem};width:10.5mm">Comp.</th>
      <th class="th-mem" style="background:${p.thMem};width:10.5mm">Alt.</th>
      <th class="th-mem" style="background:${p.thMem};width:10.5mm">Perim.</th>
      <th class="th-mem" style="background:${p.thMem};width:10.5mm">Área</th>
      <th class="th-mem" style="background:${p.thMem};width:10.5mm">Vol.</th>
      <th class="th-mem" style="background:${p.thMem};width:10.5mm">Kg</th>
      <th class="th-mem" style="background:${p.thMem};width:10.5mm">Outros</th>
      <th class="th-mem" style="background:${p.thMem};width:10.5mm">Desc.</th>
      <th class="th-mem" style="background:${p.thMem};width:10.5mm">Qtde</th>
      <th class="th-mem" style="background:${p.thMem};width:13mm">TOTAL</th>
      <th class="th-mem" style="background:${p.thMem};width:15mm">STATUS</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>`
}

// ─── FOTOS PDF ────────────────────────────────────────────────────────────────
async function toB64(src:string):Promise<string>{
  return new Promise((res,rej)=>{
    const img=new Image();img.crossOrigin='anonymous'
    img.onload=()=>{const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const x=c.getContext('2d')!;x.drawImage(img,0,0);res(c.toDataURL('image/jpeg',0.85))};img.onerror=rej;img.src=src
  })
}

export async function gerarFotosPDF(
  contrato:Contrato, obra:Obra, medicao:Medicao, fotos:FotoMedicao[]
):Promise<void>{
  const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'})
  const pw=210,ph=297,mx=14,my=12,cw=pw-mx*2
  const hH=46,sH=8,cH=6,pRH=56,rG=4,cG=4,pcW=(cw-cG)/2
  const df=medicao.data_medicao?new Date(medicao.data_medicao+'T00:00:00').toLocaleDateString('pt-BR'):'—'
  const imgs=await Promise.all(fotos.map(f=>toB64(f.base64)))
  let cy=my,pi=0,first=true

  const drawHdr=()=>{
    doc.setDrawColor(60,60,60);doc.setLineWidth(0.5);doc.rect(mx,cy,cw,hH)
    doc.setFillColor(55,86,35);doc.rect(mx,cy,28,hH,'F')
    doc.setFont('helvetica','bold');doc.setFontSize(14);doc.setTextColor(255,255,255)
    doc.text('RD',mx+14,cy+16,{align:'center'});doc.setFontSize(6)
    doc.text('CONSTRUTORA',mx+14,cy+22,{align:'center'})
    doc.line(mx+28,cy,mx+28,cy+hH)
    doc.setTextColor(30,30,30);doc.setFont('helvetica','bold');doc.setFontSize(11)
    doc.text(contrato.empresa_executora||'RD SOLUÇÕES LTDA',pw/2,cy+7,{align:'center'})
    doc.setFont('helvetica','normal');doc.setFontSize(7)
    doc.text('CNPJ: 43.357.757/0001-40',pw/2,cy+12,{align:'center'})
    doc.text('RUA BELA VISTA, 874, JARDINS, SÃO GONÇALO DO AMARANTE/RN',pw/2,cy+16.5,{align:'center'})
    doc.text('email: rd_solucoes@outlook.com  /  tel.: (84) 99641-8124',pw/2,cy+21,{align:'center'})
    const tY=cy+25,tH=9,rH=tH/2,tx=mx+28
    doc.setDrawColor(150,150,150);doc.setLineWidth(0.3);doc.rect(tx,tY,cw-28,tH)
    doc.line(tx,tY+rH,tx+cw-28,tY+rH)
    const y1=tY+rH*0.65,y2=tY+rH+rH*0.65
    doc.setFontSize(6.5);doc.setTextColor(30,30,30)
    doc.setFont('helvetica','bold');doc.text('OBRA:',tx+1,y1)
    doc.setFont('helvetica','normal');doc.text(obra.nome_obra||'',tx+14,y1)
    doc.setFont('helvetica','bold');doc.text('MEDIÇÃO:',tx+1,y2)
    doc.setFont('helvetica','normal');doc.text(medicao.numero_extenso,tx+18,y2)
    doc.setFont('helvetica','bold');doc.text('DATA:',tx+50,y2)
    doc.setFont('helvetica','normal');doc.text(df,tx+62,y2)
    cy+=hH+2
    doc.setFillColor(55,86,35);doc.rect(mx,cy,cw,sH,'F')
    doc.setFont('helvetica','bold');doc.setFontSize(8);doc.setTextColor(255,255,255)
    doc.text('REGISTRO FOTOGRÁFICO DOS SERVIÇOS EXECUTADOS',pw/2,cy+5.5,{align:'center'})
    cy+=sH+4
  }

  while(pi<fotos.length){
    if(first){drawHdr();first=false}else{doc.addPage();cy=my;drawHdr()}
    const rpp=Math.max(1,Math.floor((ph-cy-my)/(pRH+cH+rG)))
    for(let r=0;r<rpp&&pi<fotos.length;r++){
      const ry=cy
      for(let c=0;c<2&&pi<fotos.length;c++){
        const f=fotos[pi],id=imgs[pi],fn=pi+1,cx2=mx+c*(pcW+cG)
        doc.setDrawColor(180,180,180);doc.setLineWidth(0.3);doc.rect(cx2,ry,pcW,pRH)
        try{doc.addImage(id,'JPEG',cx2+0.5,ry+0.5,pcW-1,pRH-1,undefined,'FAST')}
        catch{doc.setFillColor(220,220,220);doc.rect(cx2+0.5,ry+0.5,pcW-1,pRH-1,'F')}
        const cpY=ry+pRH
        doc.setFillColor(240,255,240);doc.rect(cx2,cpY,pcW,cH,'F')
        doc.setDrawColor(180,180,180);doc.rect(cx2,cpY,pcW,cH)
        doc.setFont('helvetica','normal');doc.setFontSize(6.5);doc.setTextColor(60,60,60)
        doc.text(f.legenda?`Figura ${fn}: ${f.legenda}`:`Figura ${fn}`,cx2+pcW/2,cpY+cH/2+1.5,{align:'center'})
        pi++
      }
      cy+=pRH+cH+rG
    }
  }
  const tp=doc.getNumberOfPages()
  for(let i=1;i<=tp;i++){
    doc.setPage(i);doc.setFont('helvetica','normal');doc.setFontSize(7);doc.setTextColor(150,150,150)
    doc.text(`Página ${i} / ${tp}`,pw-mx,ph-6,{align:'right'})
  }
  const bl=doc.output('blob'),u=URL.createObjectURL(bl),w=window.open(u,'_blank')
  if(w)w.addEventListener('load',()=>setTimeout(()=>{w.print();URL.revokeObjectURL(u)},800))
}
