import jsPDF from 'jspdf'
import { Contrato, Obra, Medicao, Servico, LinhaMemoria, FotoMedicao } from '../types'
import {
  calcPrecoComBDI, calcTotalServico, calcTotalServicoBDI, getPrecoTotalServico, getPrecoTotalBDI, getPUEfetivo,
  calcResumoServico, calcValoresMedicao, valorPorExtenso,
} from './calculations'
import type { ModeloPlanilha } from '../lib/modeloStore'
import { MODELO_ESTADO_DEFAULT, MODELO_PREFEITURA_DEFAULT } from '../lib/modeloStore'

// ─── PALETAS ─────────────────────────────────────────────────────────────────
type Pal = {
  hdrPrincipal:string; hdrSub:string; hdrCabec:string;
  hdrDirBg:string; thBase:string; thMed:string;
  trGrupo:string; trTotal:string;
  extensoBg:string; extensoBdr:string;
  memTitulo:string; memSub:string; memGrupo:string; memGrupoFnt:string;
  memApagar:string; memPago:string;
  memTotAc:string; memTotAnt:string; memTotMes:string;
  thMem:string; faixaTopo:string;
  linhaPeriodo:string; linha100pct:string;
  linhaPar:string; linhaImpar:string; empresaBg:string;
}

function modelToPal(m: ModeloPlanilha): Pal {
  return {
    hdrPrincipal:`#${m.cores.hdr_principal}`, hdrSub:`#${m.cores.hdr_sub}`,
    hdrCabec:`#${m.cores.hdr_cabec}`, hdrDirBg:`#${m.cores.hdr_topo}`,
    thBase:`#${m.cores.th_base}`, thMed:`#${m.cores.th_medicao}`,
    trGrupo:`#${m.cores.linha_grupo}`, trTotal:`#${m.cores.linha_total}`,
    extensoBg:`#${m.cores.extenso_bg}`, extensoBdr:`#${m.cores.extenso_borda}`,
    memTitulo:`#${m.cores.mem_titulo}`, memSub:`#${m.cores.hdr_sub}`,
    memGrupo:`#${m.cores.mem_grupo}`, memGrupoFnt:`#${m.cores.mem_titulo}`,
    memApagar:`#${m.cores.mem_apagar}`, memPago:`#${m.cores.mem_pago}`,
    memTotAc:`#${m.cores.mem_tot_acum}`, memTotAnt:`#${m.cores.mem_tot_ant}`,
    memTotMes:`#${m.cores.mem_tot_mes}`, thMem:`#${m.cores.mem_titulo}`,
    faixaTopo:`#${m.cores.hdr_topo}`,
    linhaPeriodo:`#${m.cores.linha_periodo}`, linha100pct:`#${m.cores.linha_100pct}`,
    linhaPar:`#${m.cores.linha_par}`, linhaImpar:`#${m.cores.linha_impar}`,
    empresaBg:`#${m.cores.empresa_bg}`,
  }
}

// ─── ENTRADA PRINCIPAL ────────────────────────────────────────────────────────
export async function gerarMedicaoPDF(
  contrato: Contrato, obra: Obra, medicao: Medicao,
  servicos: Servico[], linhasPorServico: Map<string, LinhaMemoria[]>,
  logoBase64?: string | null, fotos?: FotoMedicao[],
  medicoesAnteriores?: { numero_extenso: string; valorPeriodo: number }[],
  modelo?: ModeloPlanilha
): Promise<void> {
  const mod = modelo ?? (contrato.tipo === 'PREFEITURA' ? MODELO_PREFEITURA_DEFAULT : MODELO_ESTADO_DEFAULT)
  const isPref = mod.base === 'PREFEITURA'
  const p = modelToPal(mod)
  const htmlMED = gerarHTMLMED(contrato, obra, medicao, servicos, linhasPorServico, logoBase64, medicoesAnteriores, p, isPref)
  const htmlMEM = gerarHTMLMEM(contrato, obra, medicao, servicos, linhasPorServico, p, isPref)
  const html = montarDoc(obra, medicao, htmlMED, htmlMEM, p)
  const blob = new Blob([html], { type: 'text/html; charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank')
  if (win) win.addEventListener('load', () => setTimeout(() => { win.print(); URL.revokeObjectURL(url) }, 800))
  if (fotos && fotos.length > 0) await gerarFotosPDF(contrato, obra, medicao, fotos)
}

// ─── WRAPPER HTML + CSS ──────────────────────────────────────────────────────
// A4 landscape = 297×210mm. Margin 4mm cada → útil ≈ 289×202mm.
// Tabelas usam width:100% + table-layout:fixed + colunas em % = encaixe perfeito.
function montarDoc(obra: Obra, medicao: Medicao, med: string, mem: string, p: Pal) {
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
<title>${obra.nome_obra} — ${medicao.numero_extenso} Medição</title>
<style>
@page{size:A4 landscape;margin:4mm}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:289mm;max-width:289mm;overflow-x:hidden;font-family:Arial,Helvetica,sans-serif;font-size:5pt;color:#111;background:#fff}
.pw{width:289mm;max-width:289mm;overflow:hidden}
.page-break{page-break-after:always}

/* PREF cabeçalho */
.pf-cab{width:100%;border-collapse:collapse;border:0.6px solid #000;margin-bottom:0.8mm;font-size:5pt;table-layout:auto}
.pf-cab td{padding:0.4mm 0.7mm;vertical-align:middle;border:0.3px solid #000}
.pf-lbl{color:#555;font-size:4.5pt;white-space:nowrap}
.pf-val{font-weight:bold;font-size:5pt}
.pf-hl{background:${p.hdrCabec};font-weight:bold;text-align:right;font-size:5pt}
.pf-hl-val{font-weight:bold;text-align:right;font-size:5.5pt}
.pf-verde{background:${p.linhaPeriodo};font-weight:bold;text-align:right;font-size:5.5pt}
.pf-logo-cell{width:28mm;text-align:center;vertical-align:middle;border-right:0.6px solid #000}
.pf-logo-cell img{max-width:26mm;max-height:18mm;object-fit:contain}
.pf-empresa{font-size:4.5pt;line-height:1.35;vertical-align:top;text-align:left;padding:0.8mm;width:28mm}

/* ESTADO cabeçalho */
.est-cab{display:flex;border:1px solid ${p.hdrPrincipal};margin-bottom:1mm}
.est-logo{width:20mm;min-width:20mm;display:flex;align-items:center;justify-content:center;border-right:0.6px solid ${p.hdrPrincipal};padding:0.8mm;background:#fff}
.est-logo img{max-height:10mm;max-width:18mm;object-fit:contain}
.est-logo span{font-size:5pt;color:#555;text-align:center}
.est-centro{flex:1;display:flex;flex-direction:column;min-width:0}
.est-orgao{background:${p.hdrPrincipal};color:#fff;font-weight:bold;font-size:6.5pt;text-align:center;padding:0.8mm}
.est-sub{background:${p.hdrSub};color:#fff;font-size:5.5pt;text-align:center;padding:0.5mm}
.est-obra{background:${p.hdrCabec};font-size:5pt;text-align:center;padding:0.5mm;font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.est-ctr{background:${p.hdrCabec};font-size:4.5pt;text-align:center;padding:0.3mm}
.est-dir{width:22mm;min-width:22mm;display:flex;flex-direction:column;border-left:0.6px solid ${p.hdrPrincipal}}
.est-dir-num{background:${p.hdrDirBg};color:#fff;font-weight:bold;font-size:8pt;text-align:center;padding:0.8mm;flex:1;display:flex;align-items:center;justify-content:center}
.est-dir-info{background:${p.hdrCabec};font-size:4pt;text-align:center;padding:0.4mm;border-top:0.4px solid ${p.hdrPrincipal}}

/* Tabela medição */
.t-med{width:100%;border-collapse:collapse;font-size:4.5pt;table-layout:fixed}
.t-med th,.t-med td{border:0.3px solid #000;padding:0.2mm 0.35mm;vertical-align:middle;overflow:hidden;text-overflow:ellipsis}
.th-b{color:#fff;font-weight:bold;text-align:center;font-size:4pt;line-height:1.15;white-space:normal;word-break:break-word}
.th-m{color:#fff;font-weight:bold;text-align:center;font-size:4pt;line-height:1.15;white-space:normal;word-break:break-word}
.tr-par{background:${p.linhaPar}} .tr-imp{background:${p.linhaImpar}}
.td-desc{text-align:left!important;white-space:normal!important;word-break:break-word;line-height:1.15;max-width:0}
.td-per{background:${p.linhaPeriodo};font-weight:bold}
.td-100{background:${p.linha100pct};color:#fff}
.num{text-align:right;white-space:nowrap} .ctr{text-align:center;white-space:nowrap}

/* Extenso / Demo */
.extenso{padding:0.8mm 1.5mm;margin:0.8mm 0;font-weight:bold;font-size:5.5pt;border-width:0.8px;border-style:solid}
.demo-titulo{color:#fff;font-weight:bold;font-size:6pt;padding:0.8mm;margin-top:1mm}
.demo-t{width:68mm;border-collapse:collapse;margin-top:0.6mm}
.demo-t td{border:0.3px solid #000;padding:0.5mm 1mm;font-size:5pt}
.d-par{background:#F5F5F5} .d-imp{background:#fff}
.d-val{font-weight:bold;text-align:right;width:24mm}

/* Memória */
.mem-tit{font-size:7pt;font-weight:bold;margin-bottom:0.8mm;padding:0.8mm 1.5mm;border-left-width:3px;border-left-style:solid}
.t-mem{width:100%;border-collapse:collapse;margin-top:0.8mm;font-size:4.5pt;table-layout:fixed}
.t-mem th,.t-mem td{border:0.3px solid #000;padding:0.2mm 0.4mm;vertical-align:middle;overflow:hidden;text-overflow:ellipsis}
.th-mem{color:#fff;font-weight:bold;text-align:center;font-size:4.5pt;white-space:nowrap}
.tr-srv{font-weight:bold}
.tr-tam{font-weight:bold} .tr-tan{font-weight:bold} .tr-tme{font-weight:bold}

thead{display:table-header-group} tbody{display:table-row-group} tr{page-break-inside:avoid}
@media print{
  body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  html,body{width:289mm;max-width:289mm}
  .page-break{page-break-after:always}
  @page{size:A4 landscape;margin:4mm}
  thead{display:table-header-group} tr{page-break-inside:avoid}
}
</style></head><body>
<div class="pw">${med}</div>
<div class="page-break"></div>
<div class="pw">${mem}</div>
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
  const dataFmt = medicao.data_medicao ? new Date(medicao.data_medicao+'T00:00:00').toLocaleDateString('pt-BR') : '—'
  const periodoRef = medicao.periodo_referencia || dataFmt
  const vals = calcValoresMedicao(servicos, linhasPorServico, obra)
  const desc = obra.desconto_percentual

  let cab = ''
  if (isPref) {
    const logoCell = logoBase64
      ? `<td class="pf-logo-cell" rowspan="9"><img src="${logoBase64}" alt="Logo"/></td>`
      : `<td class="pf-logo-cell" rowspan="9" style="font-weight:bold;font-size:6pt;color:${p.hdrPrincipal}">RD<br/>CONST.</td>`
    cab = `<table class="pf-cab">
  <tr>${logoCell}<td class="pf-lbl">CONCEDENTE</td><td class="pf-lbl">Data emissão BM</td><td class="pf-lbl">Período ref.</td><td class="pf-hl" colspan="2">VALOR DO CONTRATO</td>
    <td class="pf-empresa" rowspan="9"><strong>RD CONSTRUTORA LTDA</strong><br/>RUA BELA VISTA, 874, JARDINS,<br/>SÃO GONÇALO DO AMARANTE/RN<br/>CEP: 59293-576<br/>CNPJ: 43.357.757/0001-40<br/>rd_solucoes@outlook.com<br/>(84) 99641-8124</td></tr>
  <tr><td class="pf-val">${contrato.orgao_nome||''}</td><td class="pf-val">${dataFmt}</td><td class="pf-val">${periodoRef}</td><td class="pf-hl-val" colspan="2">${fC(vals.totalOrcamento)}</td></tr>
  <tr><td class="pf-lbl">CONVENENTE</td><td colspan="2" class="pf-lbl">OBJETIVO DA O.S.</td><td class="pf-lbl" colspan="2">VALOR O.S. ${contrato.numero_contrato||''}</td></tr>
  <tr><td class="pf-val">${contrato.orgao_nome||''}</td><td colspan="2" class="pf-val">${obra.nome_obra||''}</td><td class="pf-hl-val" colspan="2">${fC(vals.totalOrcamento)}</td></tr>
  <tr><td class="pf-lbl">PROC. LICITATÓRIO</td><td colspan="2" class="pf-val">${obra.numero_contrato||''}</td><td class="pf-hl" colspan="2">VALOR ACUMULADO</td></tr>
  <tr><td class="pf-lbl">EMPRESA</td><td class="pf-lbl">CNPJ</td><td></td><td class="pf-hl-val" colspan="2">${fC(vals.valorAcumulado)}</td></tr>
  <tr><td class="pf-val">${contrato.empresa_executora||''}</td><td class="pf-val">43.357.757/0001-40</td><td></td><td class="pf-hl" colspan="2">SALDO CONTRATO</td></tr>
  <tr><td colspan="3"></td><td class="pf-hl-val" colspan="2">${fC(vals.valorSaldo)}</td></tr>
  <tr><td class="pf-val">BM N° ${medicao.numero}</td><td class="pf-lbl">EMISSÃO: <strong>${dataFmt}</strong></td><td class="pf-lbl">VALOR MEDIDO:</td><td class="pf-verde" colspan="2">${fC(vals.valorPeriodo)}</td></tr>
</table>`
  } else {
    const logoHtml = logoBase64 ? `<img src="${logoBase64}" alt="Logo"/>` : `<span>${contrato.empresa_executora}</span>`
    cab = `<div class="est-cab">
  <div class="est-logo">${logoHtml}</div>
  <div class="est-centro">
    <div class="est-orgao">${contrato.orgao_nome}</div>
    <div class="est-sub">${contrato.orgao_subdivisao||''}</div>
    <div class="est-obra">OBRA: ${obra.nome_obra} | LOCAL: ${obra.local_obra}</div>
    <div class="est-ctr">Contrato: ${obra.numero_contrato||'—'} | Empresa: ${contrato.empresa_executora}</div>
  </div>
  <div class="est-dir">
    <div class="est-dir-num">${medicao.numero_extenso} MED.</div>
    <div class="est-dir-info">Data: ${dataFmt}</div>
    <div class="est-dir-info">Período: ${periodoRef}</div>
    <div class="est-dir-info">Desc: ${(desc*100).toFixed(2)}% | BDI: ${(obra.bdi_percentual*100).toFixed(2)}%</div>
  </div>
</div>`
  }

  const thB = `background:${p.thBase}`, thM = `background:${p.thMed}`
  let thead = ''
  if (isPref) {
    thead = `<colgroup>
  <col style="width:2.5%"/><col style="width:5%"/><col style="width:18%"/><col style="width:3.5%"/><col style="width:2.5%"/><col style="width:4.5%"/>
  <col style="width:4.5%"/><col style="width:4.5%"/><col style="width:5.5%"/><col style="width:5%"/>
  <col style="width:4.5%"/><col style="width:4.5%"/><col style="width:3.5%"/><col style="width:5%"/><col style="width:4.5%"/>
  <col style="width:5.5%"/><col style="width:5.5%"/><col style="width:5%"/><col style="width:3.5%"/>
</colgroup><thead>
  <tr><th class="th-b" style="${thB}" rowspan="2">ITEM</th><th class="th-b" style="${thB}" rowspan="2">CÓDIGO</th><th class="th-b" style="${thB}" rowspan="2">DESCRIÇÃO</th>
    <th class="th-b" style="${thB}" rowspan="2">FONTE</th><th class="th-b" style="${thB}" rowspan="2">UN</th><th class="th-b" style="${thB}" rowspan="2">QTD</th>
    <th class="th-b" style="${thB}" colspan="2">P.UNIT. R$</th><th class="th-b" style="${thB}" colspan="2">P.TOTAL R$</th>
    <th class="th-m" style="${thM}" colspan="9">PLANILHA DE MEDIÇÃO</th></tr>
  <tr><th class="th-b" style="${thB}">S/BDI</th><th class="th-b" style="${thB}">C/BDI</th><th class="th-b" style="${thB}">C/BDI</th><th class="th-b" style="${thB}">DESC.${(desc*100).toFixed(0)}%</th>
    <th class="th-m" style="${thM}">AC.ANT</th><th class="th-m" style="${thM}">MED.PER</th><th class="th-m" style="${thM}">%</th>
    <th class="th-m" style="${thM}">AC.UND</th><th class="th-m" style="${thM}">SALDO</th>
    <th class="th-m" style="${thM}">MED.R$</th><th class="th-m" style="${thM}">AC.R$</th><th class="th-m" style="${thM}">SALD.R$</th><th class="th-m" style="${thM}">%</th></tr>
</thead>`
  } else {
    thead = `<colgroup>
  <col style="width:2%"/><col style="width:3.5%"/><col style="width:4%"/><col style="width:17%"/><col style="width:2.5%"/><col style="width:4%"/>
  <col style="width:4.2%"/><col style="width:4.2%"/><col style="width:4.2%"/><col style="width:5%"/><col style="width:2.8%"/>
  <col style="width:4%"/><col style="width:4%"/><col style="width:4%"/><col style="width:4%"/><col style="width:4%"/>
  <col style="width:4%"/><col style="width:4%"/><col style="width:4.8%"/><col style="width:4.8%"/><col style="width:4.8%"/><col style="width:4.8%"/><col style="width:3%"/>
</colgroup><thead>
  <tr><th class="th-b" style="${thB}" colspan="11">PLANILHA BASE</th><th class="th-m" style="${thM}" colspan="12">PLANILHA DE MEDIÇÃO</th></tr>
  <tr><th class="th-b" style="${thB}">ITEM</th><th class="th-b" style="${thB}">FONTE</th><th class="th-b" style="${thB}">CÓD</th><th class="th-b" style="${thB}">DESCRIÇÃO</th>
    <th class="th-b" style="${thB}">UN</th><th class="th-b" style="${thB}">QTD</th><th class="th-b" style="${thB}">PU R$</th><th class="th-b" style="${thB}">c/Desc</th>
    <th class="th-b" style="${thB}">c/BDI</th><th class="th-b" style="${thB}">TOTAL</th><th class="th-b" style="${thB}">PESO%</th>
    <th class="th-m" style="${thM}">PREV</th><th class="th-m" style="${thM}">ANT.AC</th><th class="th-m" style="${thM}">PERÍODO</th><th class="th-m" style="${thM}">ACUM</th><th class="th-m" style="${thM}">SALDO</th>
    <th class="th-m" style="${thM}">UNIT</th><th class="th-m" style="${thM}">U.BDI</th><th class="th-m" style="${thM}">ANT.R$</th><th class="th-m" style="${thM}">AC.R$</th>
    <th class="th-m" style="${thM}">PER.R$</th><th class="th-m" style="${thM}">SALD.R$</th><th class="th-m" style="${thM}">%</th></tr>
</thead>`
  }

  let rows = '', ri = 0
  const grpBg = `background:${p.trGrupo}`
  for (const srv of [...servicos].sort((a,b)=>a.ordem-b.ordem)) {
    const pBDI  = getPUEfetivo(srv, obra.bdi_percentual)
    const pTotBDI = getPrecoTotalBDI(srv, obra.bdi_percentual)
    const pTot  = getPrecoTotalServico(srv, obra.bdi_percentual, desc)
    if (srv.is_grupo) {
      rows += isPref
        ? `<tr style="${grpBg};font-weight:bold"><td class="ctr">${srv.item}</td><td></td><td class="td-desc">${srv.descricao}</td><td></td><td></td><td></td><td></td><td></td><td class="num">${fC(pTotBDI)}</td><td class="num">${fC(pTot)}</td><td colspan="9"></td></tr>`
        : `<tr style="${grpBg};font-weight:bold"><td class="ctr">${srv.item}</td><td colspan="3" class="td-desc">${srv.descricao}</td><td colspan="5"></td><td class="num">${fC(pTot)}</td><td colspan="13"></td></tr>`
      continue
    }
    const linhas = linhasPorServico.get(srv.id)||[]
    const { qtdAnterior, qtdPeriodo, qtdAcumulada, qtdSaldo } = calcResumoServico(srv, linhas)
    const cls = ri%2===0?'tr-par':'tr-imp'
    const pctAcum = srv.quantidade>0?qtdAcumulada/srv.quantidade:0
    const is100 = pctAcum >= 1 && srv.quantidade > 0
    const temFixo = srv.preco_total_fixo != null && srv.preco_total_fixo > 0
    const fD = temFixo ? 1 : (1 - desc)
    const er2 = (n: number) => Math.round(n * 100 + 1e-10) / 100
    if (isPref) {
      // Prefeitura: período só destaca itens medidos, verde no 100%
      const pCls = qtdPeriodo>0?' td-per':''
      const c100 = pctAcum>=1?' td-100':''
      const medR  = is100 && qtdAnterior===0 ? pTot : is100 ? pTot - er2(er2(qtdAnterior*pBDI)*fD) : er2(er2(qtdPeriodo*pBDI)*fD)
      const acumR = is100 ? pTot : er2(er2(qtdAcumulada*pBDI)*fD)
      const saldR = is100 ? 0 : er2(er2(qtdSaldo*pBDI)*fD)
      rows += `<tr class="${cls}"><td class="ctr">${srv.item}</td><td class="ctr">${srv.codigo}</td><td class="td-desc">${srv.descricao}</td><td class="ctr">${srv.fonte}</td><td class="ctr">${srv.unidade}</td><td class="num">${fN(srv.quantidade)}</td><td class="num">${fC(pBDI)}</td><td class="num">${fC(pBDI)}</td><td class="num">${fC(pTotBDI)}</td><td class="num">${fC(pTot)}</td><td class="num${qtdAnterior>0?' td-per':''}">${fN(qtdAnterior)}</td><td class="num${pCls}">${fN(qtdPeriodo)}</td><td class="num${pCls}">${fN(pctAcum*100,2)}%</td><td class="num">${fN(qtdAcumulada)}</td><td class="num">${fN(qtdSaldo)}</td><td class="num${pCls}">${fC(medR)}</td><td class="num">${fC(acumR)}</td><td class="num">${fC(saldR)}</td><td class="num${c100}">${fN(pctAcum*100,2)}%</td></tr>`
    } else {
      // SEEC/Estado: período SEMPRE destacado (coluna inteira cinza), sem verde no 100%
      const pCls = ' td-per'
      const eAntR = er2(er2(qtdAnterior*pBDI)*fD)
      const eAcumR = is100 ? pTot : er2(er2(qtdAcumulada*pBDI)*fD)
      const ePerR = is100 && qtdAnterior===0 ? pTot : is100 ? pTot - eAntR : er2(er2(qtdPeriodo*pBDI)*fD)
      const eSaldR = is100 ? 0 : pTot - eAcumR
      rows += `<tr class="${cls}"><td class="ctr">${srv.item}</td><td class="ctr">${srv.fonte}</td><td class="ctr">${srv.codigo}</td><td class="td-desc">${srv.descricao}</td><td class="ctr">${srv.unidade}</td><td class="num">${fN(srv.quantidade)}</td><td class="num">${fC(srv.preco_unitario)}</td><td class="num">${fC(pBDI)}</td><td class="num">${fC(pTotBDI)}</td><td class="num">${fC(pTot)}</td><td class="ctr">—</td><td class="num">${fN(srv.quantidade)}</td><td class="num">${fN(qtdAnterior)}</td><td class="num${pCls}">${fN(qtdPeriodo)}</td><td class="num">${fN(qtdAcumulada)}</td><td class="num">${fN(qtdSaldo)}</td><td class="num">${fC(pBDI)}</td><td class="num">${fC(pTot)}</td><td class="num">${fC(eAntR)}</td><td class="num">${fC(eAcumR)}</td><td class="num${pCls}">${fC(ePerR)}</td><td class="num">${fC(eSaldR)}</td><td class="num">${fN((1-pctAcum)*100,2)}%</td></tr>`
    }
    ri++
  }

  const totBg = `background:${p.trTotal};color:#fff`
  const totRow = isPref
    ? `<tr style="${totBg}"><td colspan="8" style="text-align:center;font-size:5.5pt">TOTAIS GERAIS</td><td class="num">${fN(vals.totalOrcamento)}</td><td class="num">${fN(vals.totalOrcamento*(1-desc))}</td><td colspan="4"></td><td></td><td class="num">${fN(vals.valorPeriodo)}</td><td class="num">${fN(vals.valorAcumulado)}</td><td class="num">${fN(vals.valorSaldo)}</td><td></td></tr>`
    : `<tr style="${totBg}"><td colspan="9" style="text-align:center;font-size:5.5pt">TOTAIS GERAIS</td><td class="num">${fN(vals.totalOrcamento)}</td><td></td><td></td><td></td><td></td><td class="num">${fN(vals.valorAcumulado)}</td><td></td><td></td><td></td><td class="num">${fN(vals.valorAcumulado)}</td><td class="num">${fN(vals.valorPeriodo)}</td><td class="num">${fN(vals.valorSaldo)}</td><td></td></tr>`

  const antRows = (medicoesAnteriores||[]).map((m,i)=>`<tr class="${i%2===0?'d-par':'d-imp'}"><td>${m.numero_extenso} Med. (Anterior)</td><td class="d-val">${fC(m.valorPeriodo)}</td></tr>`).join('')
  const demoRows = [
    `<tr class="d-par"><td><strong>Valor Total Orçamento</strong></td><td class="d-val">${fC(vals.totalOrcamento)}</td></tr>`,
    antRows,
    vals.valorAcumulado-vals.valorPeriodo>0?`<tr class="d-imp"><td><strong>Total Fat. Anterior</strong></td><td class="d-val">${fC(vals.valorAcumulado-vals.valorPeriodo)}</td></tr>`:'',
    `<tr style="background:${p.linhaPeriodo}"><td><strong>${medicao.numero_extenso} Med. — Período</strong></td><td class="d-val" style="color:${p.hdrPrincipal}">${fC(vals.valorPeriodo)}</td></tr>`,
    `<tr class="d-par"><td>% da Medição</td><td class="d-val">${fN(vals.percentualPeriodo*100)}%</td></tr>`,
    `<tr class="d-imp"><td><strong>Faturado Acumulado</strong></td><td class="d-val">${fC(vals.valorAcumulado)}</td></tr>`,
    `<tr class="d-par"><td>% Acumulado</td><td class="d-val">${fN(vals.percentualAcumulado*100)}%</td></tr>`,
    `<tr style="background:${p.trGrupo}"><td><strong>Saldo do Contrato</strong></td><td class="d-val" style="color:${p.hdrPrincipal}">${fC(vals.valorSaldo)}</td></tr>`,
    `<tr class="d-imp"><td>% do Saldo</td><td class="d-val">${fN(vals.percentualSaldo*100)}%</td></tr>`,
  ].join('')

  return `${cab}
<table class="t-med">${thead}<tbody>${rows}${totRow}</tbody></table>
<div class="extenso" style="background:${p.extensoBg};border-color:${p.extensoBdr}">A presente medição importa o valor de: ${valorPorExtenso(vals.valorPeriodo).toUpperCase()} — ${new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(vals.valorPeriodo)}</div>
<div class="demo-titulo" style="background:${isPref?p.hdrPrincipal:p.memTitulo}">DEMONSTRATIVO FINANCEIRO</div>
<table class="demo-t"><tbody>${demoRows}</tbody></table>`
}

// ─── HTML MEMÓRIA ─────────────────────────────────────────────────────────────
function gerarHTMLMEM(
  contrato: Contrato, obra: Obra, medicao: Medicao,
  servicos: Servico[], linhasPorServico: Map<string, LinhaMemoria[]>,
  p: Pal, isPref: boolean
): string {
  const fN = (n:number|null|undefined, d=2) => n==null?'—':n.toLocaleString('pt-BR',{minimumFractionDigits:d,maximumFractionDigits:d})
  const dataFmt = medicao.data_medicao ? new Date(medicao.data_medicao+'T00:00:00').toLocaleDateString('pt-BR') : '—'
  const periodoRef = medicao.periodo_referencia || dataFmt
  let rows = ''
  for (const srv of servicos.filter(s=>!s.is_grupo).sort((a,b)=>a.ordem-b.ordem)) {
    const linhas = (linhasPorServico.get(srv.id)||[]).sort((a,b)=>a.sub_item.localeCompare(b.sub_item))
    if (!linhas.length) continue
    rows += `<tr class="tr-srv" style="background:${p.memGrupo};color:${p.memGrupoFnt}"><td class="ctr">${srv.item}</td><td colspan="13" style="text-align:left">${srv.descricao} — ${srv.unidade}</td></tr>`
    for (const l of linhas) {
      const bg = l.status==='A pagar'?p.memApagar:l.status==='Pago'?p.memPago:'#FCE4D6'
      rows += `<tr style="background:${bg}"><td class="ctr">${l.sub_item}</td><td style="font-size:4.5pt;text-align:left;white-space:normal;word-break:break-word">${l.descricao_calculo}</td><td class="num">${fN(l.largura)}</td><td class="num">${fN(l.comprimento)}</td><td class="num">${fN(l.altura)}</td><td class="num">${fN(l.perimetro)}</td><td class="num">${fN(l.area)}</td><td class="num">${fN(l.volume)}</td><td class="num">${fN(l.kg)}</td><td class="num">${fN(l.outros)}</td><td class="num">${fN(l.desconto_dim)}</td><td class="num">${fN(l.quantidade)}</td><td class="num" style="font-weight:bold">${fN(l.total)}</td><td class="ctr" style="font-size:4pt">${l.status}</td></tr>`
    }
    const qtdAnt=linhas.filter(l=>l.status==='Pago').reduce((s,l)=>s+l.total,0)
    const qtdPer=linhas.filter(l=>l.status==='A pagar').reduce((s,l)=>s+l.total,0)
    rows += `<tr class="tr-tam" style="background:${p.memTotAc}"><td colspan="12" style="text-align:right">TOTAL ACUMULADO:</td><td class="num">${fN(qtdAnt+qtdPer)}</td><td></td></tr>
      <tr class="tr-tan" style="background:${p.memTotAnt}"><td colspan="12" style="text-align:right">TOTAL ACUM. ANTERIOR:</td><td class="num">${fN(qtdAnt)}</td><td></td></tr>
      <tr class="tr-tme" style="background:${p.memTotMes}"><td colspan="12" style="text-align:right">TOTAL MÊS (A PAGAR):</td><td class="num">${fN(qtdPer)}</td><td></td></tr>
      <tr><td colspan="14" style="height:1mm"></td></tr>`
  }
  return `<div class="mem-tit" style="background:${p.memGrupo};color:${p.memTitulo};border-color:${p.memTitulo}">MEMÓRIA DE CÁLCULO &nbsp;|&nbsp; ${obra.nome_obra} &nbsp;|&nbsp; ${medicao.numero_extenso} MEDIÇÃO &nbsp;|&nbsp; ${periodoRef}</div>
<table class="t-mem"><colgroup><col style="width:4%"/><col style="width:22%"/><col style="width:5.5%"/><col style="width:5.5%"/><col style="width:5.5%"/><col style="width:5.5%"/><col style="width:5.5%"/><col style="width:5.5%"/><col style="width:5.5%"/><col style="width:5.5%"/><col style="width:5.5%"/><col style="width:5.5%"/><col style="width:7%"/><col style="width:7%"/></colgroup>
  <thead><tr><th class="th-mem" style="background:${p.thMem}">ITEM</th><th class="th-mem" style="background:${p.thMem}">DESCRIÇÃO</th><th class="th-mem" style="background:${p.thMem}">Larg.</th><th class="th-mem" style="background:${p.thMem}">Comp.</th><th class="th-mem" style="background:${p.thMem}">Alt.</th><th class="th-mem" style="background:${p.thMem}">Perim.</th><th class="th-mem" style="background:${p.thMem}">Área</th><th class="th-mem" style="background:${p.thMem}">Vol.</th><th class="th-mem" style="background:${p.thMem}">Kg</th><th class="th-mem" style="background:${p.thMem}">Outros</th><th class="th-mem" style="background:${p.thMem}">Desc.</th><th class="th-mem" style="background:${p.thMem}">Qtde</th><th class="th-mem" style="background:${p.thMem}">TOTAL</th><th class="th-mem" style="background:${p.thMem}">STATUS</th></tr></thead>
  <tbody>${rows}</tbody></table>`
}

// ─── FOTOS PDF ────────────────────────────────────────────────────────────────
async function toB64(src:string):Promise<string>{
  return new Promise((res,rej)=>{const img=new Image();img.crossOrigin='anonymous';img.onload=()=>{const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const x=c.getContext('2d')!;x.drawImage(img,0,0);res(c.toDataURL('image/jpeg',0.85))};img.onerror=rej;img.src=src})
}

export async function gerarFotosPDF(contrato:Contrato,obra:Obra,medicao:Medicao,fotos:FotoMedicao[]):Promise<void>{
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
    doc.text('RD',mx+14,cy+16,{align:'center'});doc.setFontSize(6);doc.text('CONSTRUTORA',mx+14,cy+22,{align:'center'})
    doc.line(mx+28,cy,mx+28,cy+hH)
    doc.setTextColor(30,30,30);doc.setFont('helvetica','bold');doc.setFontSize(11)
    doc.text(contrato.empresa_executora||'RD SOLUÇÕES LTDA',pw/2,cy+7,{align:'center'})
    doc.setFont('helvetica','normal');doc.setFontSize(7)
    doc.text('CNPJ: 43.357.757/0001-40',pw/2,cy+12,{align:'center'})
    doc.text('RUA BELA VISTA, 874, JARDINS, SÃO GONÇALO DO AMARANTE/RN',pw/2,cy+16.5,{align:'center'})
    doc.text('email: rd_solucoes@outlook.com  /  tel.: (84) 99641-8124',pw/2,cy+21,{align:'center'})
    const tY=cy+25,tH=9,rH=tH/2,tx=mx+28
    doc.setDrawColor(150,150,150);doc.setLineWidth(0.3);doc.rect(tx,tY,cw-28,tH);doc.line(tx,tY+rH,tx+cw-28,tY+rH)
    const y1=tY+rH*0.65,y2=tY+rH+rH*0.65
    doc.setFontSize(6.5);doc.setTextColor(30,30,30)
    doc.setFont('helvetica','bold');doc.text('OBRA:',tx+1,y1);doc.setFont('helvetica','normal');doc.text(obra.nome_obra||'',tx+14,y1)
    doc.setFont('helvetica','bold');doc.text('MEDIÇÃO:',tx+1,y2);doc.setFont('helvetica','normal');doc.text(medicao.numero_extenso,tx+18,y2)
    doc.setFont('helvetica','bold');doc.text('DATA:',tx+50,y2);doc.setFont('helvetica','normal');doc.text(df,tx+62,y2)
    cy+=hH+2;doc.setFillColor(55,86,35);doc.rect(mx,cy,cw,sH,'F')
    doc.setFont('helvetica','bold');doc.setFontSize(8);doc.setTextColor(255,255,255)
    doc.text('REGISTRO FOTOGRÁFICO DOS SERVIÇOS EXECUTADOS',pw/2,cy+5.5,{align:'center'});cy+=sH+4
  }
  while(pi<fotos.length){
    if(first){drawHdr();first=false}else{doc.addPage();cy=my;drawHdr()}
    const rpp=Math.max(1,Math.floor((ph-cy-my)/(pRH+cH+rG)))
    for(let r=0;r<rpp&&pi<fotos.length;r++){
      const ry=cy
      for(let c=0;c<2&&pi<fotos.length;c++){
        const f=fotos[pi],id=imgs[pi],fn=pi+1,cx2=mx+c*(pcW+cG)
        doc.setDrawColor(180,180,180);doc.setLineWidth(0.3);doc.rect(cx2,ry,pcW,pRH)
        try{doc.addImage(id,'JPEG',cx2+0.5,ry+0.5,pcW-1,pRH-1,undefined,'FAST')}catch{doc.setFillColor(220,220,220);doc.rect(cx2+0.5,ry+0.5,pcW-1,pRH-1,'F')}
        const cpY=ry+pRH;doc.setFillColor(240,255,240);doc.rect(cx2,cpY,pcW,cH,'F');doc.setDrawColor(180,180,180);doc.rect(cx2,cpY,pcW,cH)
        doc.setFont('helvetica','normal');doc.setFontSize(6.5);doc.setTextColor(60,60,60)
        doc.text(f.legenda?`Figura ${fn}: ${f.legenda}`:`Figura ${fn}`,cx2+pcW/2,cpY+cH/2+1.5,{align:'center'});pi++
      }
      cy+=pRH+cH+rG
    }
  }
  const tp=doc.getNumberOfPages()
  for(let i=1;i<=tp;i++){doc.setPage(i);doc.setFont('helvetica','normal');doc.setFontSize(7);doc.setTextColor(150,150,150);doc.text(`Página ${i} / ${tp}`,pw-mx,ph-6,{align:'right'})}
  const bl=doc.output('blob'),u=URL.createObjectURL(bl),w=window.open(u,'_blank')
  if(w)w.addEventListener('load',()=>setTimeout(()=>{w.print();URL.revokeObjectURL(u)},800))
}
