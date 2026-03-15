/**
 * gerarComparativoPDF.ts
 * Gera PDF profissional de comparativo de orçamentos no estilo RD Construtora
 * 3 páginas: Resumo Financeiro, Comparativo Detalhado, Checklist de Melhorias
 */
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

// ─── TIPOS ──────────────────────────────────────────────────────────────────
export interface ItemComparativo {
  status: 'NOVO' | 'REMOVIDO' | 'MODIFICADO' | 'SUBSTITUIDO' | 'MANTIDO' | 'EXPANDIDO'
  grupo: string
  codigo: string
  descricao: string
  qtd: string
  unidade: string
  valorUnitV1: number | null
  totalV1: number | null
  valorUnitV2: number | null
  totalV2: number | null
  observacao: string
}

export interface GrupoAjuste {
  numero: number
  grupo: string
  tipo: string
  impactoR$: number
  detalhamento: string
}

export interface ChecklistItem {
  prioridade: 'ALTA' | 'MEDIA' | 'BAIXA'
  grupo: string
  descricao: string
}

export interface DadosComparativoPDF {
  // Header
  nomeObra: string
  localidade: string
  dataBase: string
  bdi: string
  linkOrcamento?: string

  // Resumo financeiro
  valorSemBDI_V1: number
  valorSemBDI_V2: number
  valorBDI_V1: number
  valorBDI_V2: number
  valorTotal_V1: number
  valorTotal_V2: number

  // Ajustes principais (página 1)
  ajustes: GrupoAjuste[]

  // Comparativo detalhado item a item (página 2)
  itens: ItemComparativo[]

  // Checklist de melhorias (página 3)
  checklist: ChecklistItem[]
}

// ─── CORES ──────────────────────────────────────────────────────────────────
const COR = {
  laranja: [232, 97, 26] as [number, number, number],
  cinzaEscuro: [30, 41, 59] as [number, number, number],
  cinzaMedio: [100, 116, 139] as [number, number, number],
  cinzaClaro: [241, 245, 249] as [number, number, number],
  branco: [255, 255, 255] as [number, number, number],
  verde: [16, 185, 129] as [number, number, number],
  vermelho: [220, 38, 38] as [number, number, number],
  azul: [59, 130, 246] as [number, number, number],
  amarelo: [245, 158, 11] as [number, number, number],
  roxo: [139, 92, 246] as [number, number, number],
  // Status
  bgNovo: [220, 252, 231] as [number, number, number],
  bgRemovido: [254, 226, 226] as [number, number, number],
  bgModificado: [254, 249, 195] as [number, number, number],
  bgSubstituido: [219, 234, 254] as [number, number, number],
  bgMantido: [241, 245, 249] as [number, number, number],
  bgExpandido: [237, 233, 254] as [number, number, number],
  txtNovo: [5, 150, 105] as [number, number, number],
  txtRemovido: [185, 28, 28] as [number, number, number],
  txtModificado: [146, 64, 14] as [number, number, number],
  txtSubstituido: [30, 64, 175] as [number, number, number],
  txtMantido: [71, 85, 105] as [number, number, number],
  txtExpandido: [91, 33, 182] as [number, number, number],
}

const STATUS_BG: Record<string, [number, number, number]> = {
  NOVO: COR.bgNovo, REMOVIDO: COR.bgRemovido, MODIFICADO: COR.bgModificado,
  SUBSTITUIDO: COR.bgSubstituido, MANTIDO: COR.bgMantido, EXPANDIDO: COR.bgExpandido,
}
const STATUS_TXT: Record<string, [number, number, number]> = {
  NOVO: COR.txtNovo, REMOVIDO: COR.txtRemovido, MODIFICADO: COR.txtModificado,
  SUBSTITUIDO: COR.txtSubstituido, MANTIDO: COR.txtMantido, EXPANDIDO: COR.txtExpandido,
}

function fmt(v: number | null): string {
  if (v === null || v === undefined) return '—'
  return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtShort(v: number): string {
  const prefix = v >= 0 ? '+' : ''
  return prefix + 'R$ ' + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

// ─── GERADOR ────────────────────────────────────────────────────────────────
export function gerarComparativoPDF(dados: DadosComparativoPDF): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 14

  // ═══════════════════════════════════════════════════════════════════════════
  // PÁGINA 1: RESUMO FINANCEIRO
  // ═══════════════════════════════════════════════════════════════════════════

  // Header com faixa laranja
  doc.setFillColor(...COR.cinzaEscuro)
  doc.rect(0, 0, pageW, 32, 'F')
  doc.setFillColor(...COR.laranja)
  doc.rect(0, 32, pageW, 3, 'F')

  doc.setTextColor(...COR.branco)
  doc.setFontSize(9)
  doc.text('SETOR DE ORÇAMENTOS', pageW / 2, 10, { align: 'center' })
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text('COMPARATIVO DE ORÇAMENTOS', pageW / 2, 19, { align: 'center' })
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(dados.nomeObra.toUpperCase(), pageW / 2, 27, { align: 'center' })

  // Sub-header
  let y = 40
  doc.setTextColor(...COR.cinzaMedio)
  doc.setFontSize(8)
  doc.text(`${dados.localidade} | Data base: ${dados.dataBase} | BDI: ${dados.bdi}`, pageW / 2, y, { align: 'center' })

  if (dados.linkOrcamento) {
    y += 5
    doc.setTextColor(...COR.azul)
    doc.textWithLink('Link de acesso do orçamento atualizado', margin, y, { url: dados.linkOrcamento })
  }

  // ── RESUMO FINANCEIRO ──
  y += 10
  doc.setFillColor(...COR.cinzaEscuro)
  doc.rect(margin, y, pageW - margin * 2, 7, 'F')
  doc.setTextColor(...COR.branco)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('RESUMO FINANCEIRO', pageW / 2, y + 5, { align: 'center' })
  y += 9

  const diffSemBDI = dados.valorSemBDI_V2 - dados.valorSemBDI_V1
  const diffBDI = dados.valorBDI_V2 - dados.valorBDI_V1
  const diffTotal = dados.valorTotal_V2 - dados.valorTotal_V1
  const pctTotal = dados.valorTotal_V1 > 0 ? (diffTotal / dados.valorTotal_V1 * 100) : 0
  const statusLabel = diffTotal > 0 ? 'Aumentou' : diffTotal < 0 ? 'Diminuiu' : 'Igual'

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['DESCRIÇÃO', 'VERSÃO 1', 'VERSÃO 2', 'DIFERENÇA R$', 'DIFERENÇA %', 'STATUS']],
    body: [
      ['Valor sem BDI', fmt(dados.valorSemBDI_V1), fmt(dados.valorSemBDI_V2), fmtShort(diffSemBDI), `${pctTotal >= 0 ? '+' : ''}${pctTotal.toFixed(1)}%`, statusLabel],
      ['Valor BDI', fmt(dados.valorBDI_V1), fmt(dados.valorBDI_V2), fmtShort(diffBDI), `${pctTotal >= 0 ? '+' : ''}${pctTotal.toFixed(1)}%`, statusLabel],
      ['VALOR TOTAL', fmt(dados.valorTotal_V1), fmt(dados.valorTotal_V2), fmtShort(diffTotal), `${pctTotal >= 0 ? '+' : ''}${pctTotal.toFixed(1)}%`, statusLabel],
    ],
    styles: { fontSize: 7.5, cellPadding: 2.5, halign: 'center' },
    headStyles: { fillColor: COR.cinzaEscuro, textColor: COR.branco, fontStyle: 'bold', fontSize: 7 },
    bodyStyles: { textColor: COR.cinzaEscuro },
    columnStyles: { 0: { halign: 'left', fontStyle: 'bold' } },
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.row.index === 2) {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fillColor = COR.cinzaClaro
      }
    },
  })

  y = (doc as any).lastAutoTable.finalY + 8

  // ── LEGENDA DE CORES ──
  doc.setFillColor(...COR.cinzaEscuro)
  doc.rect(margin, y, pageW - margin * 2, 7, 'F')
  doc.setTextColor(...COR.branco)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('LEGENDA DE CORES', pageW / 2, y + 5, { align: 'center' })
  y += 9

  const legendas = [
    { status: 'NOVO', desc: 'Serviço adicionado na Versão 2' },
    { status: 'SUBSTITUIDO', desc: 'Item da V1 trocado por outro equivalente/melhorado na V2' },
    { status: 'MODIFICADO', desc: 'Mesmo item, preço, fonte ou especificação alterada' },
    { status: 'REMOVIDO', desc: 'Serviço da V1 não consta na V2' },
    { status: 'MANTIDO', desc: 'Serviço mantido sem alteração relevante' },
  ]

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    body: legendas.map(l => [l.status, l.desc]),
    styles: { fontSize: 7, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 28, fontStyle: 'bold', halign: 'center' }, 1: { cellWidth: 'auto' } },
    didParseCell: (data: any) => {
      if (data.column.index === 0 && data.section === 'body') {
        const st = legendas[data.row.index]?.status
        if (st && STATUS_BG[st]) {
          data.cell.styles.fillColor = STATUS_BG[st]
          data.cell.styles.textColor = STATUS_TXT[st]
        }
      }
    },
  })

  y = (doc as any).lastAutoTable.finalY + 8

  // ── PRINCIPAIS AJUSTES ──
  doc.setFillColor(...COR.cinzaEscuro)
  doc.rect(margin, y, pageW - margin * 2, 7, 'F')
  doc.setTextColor(...COR.branco)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text('PRINCIPAIS AJUSTES FEITOS', pageW / 2, y + 5, { align: 'center' })
  y += 9

  if (dados.ajustes.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['#', 'GRUPO', 'TIPO', 'IMPACTO R$', 'DETALHAMENTO']],
      body: dados.ajustes.map(a => [
        String(a.numero), a.grupo, a.tipo, fmtShort(a.impactoR$), a.detalhamento,
      ]),
      styles: { fontSize: 7, cellPadding: 2.5, overflow: 'linebreak' },
      headStyles: { fillColor: COR.cinzaEscuro, textColor: COR.branco, fontStyle: 'bold', fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 28 },
        2: { cellWidth: 26, halign: 'center' },
        3: { cellWidth: 22, halign: 'right' },
        4: { cellWidth: 'auto' },
      },
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 3) {
          const val = dados.ajustes[data.row.index]?.impactoR$
          if (val !== undefined) {
            data.cell.styles.textColor = val >= 0 ? COR.txtRemovido : COR.txtNovo
            data.cell.styles.fontStyle = 'bold'
          }
        }
      },
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PÁGINA 2: COMPARATIVO DETALHADO
  // ═══════════════════════════════════════════════════════════════════════════
  doc.addPage()

  // Header
  doc.setFillColor(...COR.cinzaEscuro)
  doc.rect(0, 0, pageW, 22, 'F')
  doc.setFillColor(...COR.laranja)
  doc.rect(0, 22, pageW, 2, 'F')
  doc.setTextColor(...COR.branco)
  doc.setFontSize(9)
  doc.text('SETOR DE ORÇAMENTOS', pageW / 2, 9, { align: 'center' })
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('COMPARATIVO DETALHADO ITEM A ITEM - V1 vs V2', pageW / 2, 17, { align: 'center' })

  if (dados.itens.length > 0) {
    autoTable(doc, {
      startY: 28,
      margin: { left: 6, right: 6 },
      head: [['STATUS', 'GRUPO', 'CÓD. V1', 'DESCRIÇÃO', 'QTD', 'R$ Unit V1', 'Total V1', 'R$ Unit V2', 'Total V2', 'OBSERVAÇÃO']],
      body: dados.itens.map(item => [
        item.status,
        item.grupo,
        item.codigo || '—',
        item.descricao,
        item.qtd ? `${item.qtd} ${item.unidade}` : '—',
        item.valorUnitV1 !== null ? fmt(item.valorUnitV1) : '—',
        item.totalV1 !== null ? fmt(item.totalV1) : '—',
        item.valorUnitV2 !== null ? fmt(item.valorUnitV2) : '—',
        item.totalV2 !== null ? fmt(item.totalV2) : '—',
        item.observacao,
      ]),
      styles: { fontSize: 5.5, cellPadding: 1.5, overflow: 'linebreak', lineWidth: 0.1 },
      headStyles: { fillColor: COR.cinzaEscuro, textColor: COR.branco, fontStyle: 'bold', fontSize: 5.5, halign: 'center' },
      columnStyles: {
        0: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
        1: { cellWidth: 18 },
        2: { cellWidth: 17 },
        3: { cellWidth: 32 },
        4: { cellWidth: 14, halign: 'center' },
        5: { cellWidth: 16, halign: 'right' },
        6: { cellWidth: 18, halign: 'right' },
        7: { cellWidth: 16, halign: 'right' },
        8: { cellWidth: 18, halign: 'right', fontStyle: 'bold' },
        9: { cellWidth: 'auto' },
      },
      didParseCell: (data: any) => {
        if (data.section === 'body') {
          const item = dados.itens[data.row.index]
          if (item && data.column.index === 0) {
            const bg = STATUS_BG[item.status]
            const txt = STATUS_TXT[item.status]
            if (bg) data.cell.styles.fillColor = bg
            if (txt) data.cell.styles.textColor = txt
          }
          // Total V2 col bold colored
          if (item && data.column.index === 8) {
            if (item.status === 'REMOVIDO') data.cell.styles.textColor = COR.txtRemovido
            else if (item.status === 'NOVO') data.cell.styles.textColor = COR.txtNovo
          }
        }
      },
    })

    // Total row
    const totalV1 = dados.itens.reduce((s, i) => s + (i.totalV1 || 0), 0)
    const totalV2 = dados.itens.reduce((s, i) => s + (i.totalV2 || 0), 0)
    const finalY = (doc as any).lastAutoTable.finalY + 2

    doc.setFillColor(...COR.cinzaClaro)
    doc.rect(6, finalY, pageW - 12, 7, 'F')
    doc.setFontSize(7)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...COR.cinzaEscuro)
    doc.text('TOTAL (sem BDI)', 8, finalY + 5)
    doc.text(fmt(totalV1), 120, finalY + 5, { align: 'right' })
    doc.text('→', 125, finalY + 5)
    doc.setTextColor(...COR.laranja)
    doc.text(fmt(totalV2), 160, finalY + 5, { align: 'right' })
    doc.setTextColor(...COR.cinzaMedio)
    doc.setFont('helvetica', 'normal')
    const diff = totalV2 - totalV1
    const pct = totalV1 > 0 ? (diff / totalV1 * 100) : 0
    doc.text(`Diferença: ${fmtShort(diff)} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`, 165, finalY + 5)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PÁGINA 3: CHECKLIST DE MELHORIAS
  // ═══════════════════════════════════════════════════════════════════════════
  if (dados.checklist.length > 0) {
    doc.addPage()

    // Header
    doc.setFillColor(...COR.cinzaEscuro)
    doc.rect(0, 0, pageW, 22, 'F')
    doc.setFillColor(...COR.laranja)
    doc.rect(0, 22, pageW, 2, 'F')
    doc.setTextColor(...COR.branco)
    doc.setFontSize(9)
    doc.text('SETOR DE ORÇAMENTOS', pageW / 2, 9, { align: 'center' })
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text('CHECKLIST DE MELHORIAS', pageW / 2, 17, { align: 'center' })

    doc.setTextColor(...COR.cinzaMedio)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'italic')
    doc.text('Use este checklist para verificar e aplicar as melhorias da Versão 2 em futuros orçamentos.', pageW / 2, 28, { align: 'center' })

    const prioridadeBg: Record<string, [number, number, number]> = {
      ALTA: [254, 226, 226], MEDIA: [254, 249, 195], BAIXA: [241, 245, 249],
    }
    const prioridadeTxt: Record<string, [number, number, number]> = {
      ALTA: [185, 28, 28], MEDIA: [146, 64, 14], BAIXA: [71, 85, 105],
    }

    autoTable(doc, {
      startY: 33,
      margin: { left: margin, right: margin },
      head: [['OK?', 'PRIORIDADE', 'GRUPO', 'O QUE FAZER / DETALHE', 'FEITO?']],
      body: dados.checklist.map(c => ['[ ]', c.prioridade, c.grupo, c.descricao, '']),
      styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak' },
      headStyles: { fillColor: COR.cinzaEscuro, textColor: COR.branco, fontStyle: 'bold', fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
        2: { cellWidth: 26 },
        3: { cellWidth: 'auto' },
        4: { cellWidth: 14, halign: 'center' },
      },
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 1) {
          const prio = dados.checklist[data.row.index]?.prioridade
          if (prio && prioridadeBg[prio]) {
            data.cell.styles.fillColor = prioridadeBg[prio]
            data.cell.styles.textColor = prioridadeTxt[prio]
          }
        }
      },
    })
  }

  // ── RODAPÉ em todas as páginas ──
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFontSize(6)
    doc.setTextColor(...COR.cinzaMedio)
    doc.text(`MedObras — Setor de Orçamentos | ${dados.nomeObra} | Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, margin, pageH - 5)
    doc.text(`Página ${i} de ${totalPages}`, pageW - margin, pageH - 5, { align: 'right' })
  }

  // Download
  const fileName = `Comparativo_Orcamento_${dados.nomeObra.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 40)}.pdf`
  doc.save(fileName)
}

// ─── HELPER: Gerar dados a partir do comparativo automático ─────────────────
export function gerarDadosFromAutoComp(
  autoComp: { alteracoes: { tipo: string; item: string; descricao: string; detalhes?: string }[]; resumo: any },
  orcamento: { titulo: string; valor_original: number; valor_revisado: number },
  bdi: number = 25,
): DadosComparativoPDF {
  const valorSemBDI_V1 = orcamento.valor_original / (1 + bdi / 100)
  const valorSemBDI_V2 = orcamento.valor_revisado / (1 + bdi / 100)

  // Agrupar alterações por grupo (extrair grupo do item/descrição)
  const grupoMap = new Map<string, { tipo: string; impacto: number; detalhes: string[] }>()

  const itens: ItemComparativo[] = autoComp.alteracoes.map(a => {
    const grupo = extrairGrupo(a.descricao)
    const status = a.tipo === 'ADICIONADO' ? 'NOVO' : a.tipo === 'REMOVIDO' ? 'REMOVIDO' : 'MODIFICADO'

    // Agregar por grupo
    if (!grupoMap.has(grupo)) grupoMap.set(grupo, { tipo: status, impacto: 0, detalhes: [] })
    const g = grupoMap.get(grupo)!
    g.detalhes.push(a.descricao)

    return {
      status: status as ItemComparativo['status'],
      grupo,
      codigo: a.item || '—',
      descricao: a.descricao.replace(/^Item\s+\S+:\s*/, ''),
      qtd: '',
      unidade: '',
      valorUnitV1: null,
      totalV1: null,
      valorUnitV2: null,
      totalV2: null,
      observacao: a.detalhes || '',
    }
  })

  const ajustes: GrupoAjuste[] = Array.from(grupoMap.entries()).map(([grupo, info], i) => ({
    numero: i + 1,
    grupo,
    tipo: info.tipo === 'NOVO' ? 'NOVO' : info.tipo === 'REMOVIDO' ? 'REMOVIDO' : 'MODIFICADO',
    impactoR$: 0,
    detalhamento: info.detalhes.slice(0, 2).join('. ').substring(0, 120),
  }))

  const checklist: ChecklistItem[] = autoComp.alteracoes
    .filter(a => a.tipo !== 'REMOVIDO')
    .slice(0, 12)
    .map(a => ({
      prioridade: a.tipo === 'ADICIONADO' ? 'ALTA' as const : 'MEDIA' as const,
      grupo: extrairGrupo(a.descricao),
      descricao: `${a.descricao}${a.detalhes ? '. ' + a.detalhes : ''}`.substring(0, 200),
    }))

  return {
    nomeObra: orcamento.titulo,
    localidade: 'Natal - RN',
    dataBase: new Date().toLocaleDateString('pt-BR'),
    bdi: `${bdi}%`,
    valorSemBDI_V1: Math.round(valorSemBDI_V1 * 100) / 100,
    valorSemBDI_V2: Math.round(valorSemBDI_V2 * 100) / 100,
    valorBDI_V1: Math.round((orcamento.valor_original - valorSemBDI_V1) * 100) / 100,
    valorBDI_V2: Math.round((orcamento.valor_revisado - valorSemBDI_V2) * 100) / 100,
    valorTotal_V1: orcamento.valor_original,
    valorTotal_V2: orcamento.valor_revisado,
    ajustes,
    itens,
    checklist,
  }
}

function extrairGrupo(desc: string): string {
  const lower = desc.toLowerCase()
  if (lower.includes('eletri') || lower.includes('luminaria') || lower.includes('tomada') || lower.includes('cabo')) return 'Inst. Elétricas'
  if (lower.includes('pintura') || lower.includes('tinta') || lower.includes('latex') || lower.includes('massa')) return 'Pintura'
  if (lower.includes('cobertura') || lower.includes('telha') || lower.includes('manta')) return 'Cobertura'
  if (lower.includes('alvenaria') || lower.includes('bloco') || lower.includes('reboco') || lower.includes('chapisco')) return 'Alvenaria'
  if (lower.includes('piso') || lower.includes('contrapiso') || lower.includes('cimentado')) return 'Piso'
  if (lower.includes('estrutura') || lower.includes('concreto') || lower.includes('baldrame')) return 'Estrutura'
  if (lower.includes('revestimento') || lower.includes('emboco')) return 'Revestimento'
  if (lower.includes('andaime') || lower.includes('entulho') || lower.includes('limpeza')) return 'Serv. Diversos'
  if (lower.includes('admin') || lower.includes('prelim')) return 'Serv. Preliminares'
  if (lower.includes('esquadria') || lower.includes('porta') || lower.includes('janela')) return 'Esquadrias'
  return 'Geral'
}
