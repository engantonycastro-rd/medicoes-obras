import { LinhaMemoria, Servico, Contrato, Obra } from '../types'

// ─── FORMATAÇÃO ───────────────────────────────────────────────────────────────

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatPercent(value: number, decimals = 2): string {
  return `${(value * 100).toFixed(decimals)}%`
}

export function formatNumber(value: number, decimals = 4): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value)
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  try {
    const date = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00')
    if (isNaN(date.getTime())) return ''
    return new Intl.DateTimeFormat('pt-BR').format(date)
  } catch {
    return ''
  }
}

// ─── ORDINAIS ────────────────────────────────────────────────────────────────

export function toOrdinalFeminino(n: number): string {
  const ordinais = ['1ª','2ª','3ª','4ª','5ª','6ª','7ª','8ª','9ª','10ª',
                    '11ª','12ª','13ª','14ª','15ª','16ª','17ª','18ª','19ª','20ª']
  return ordinais[n - 1] || `${n}ª`
}

// ─── CÁLCULOS DA MEMÓRIA ─────────────────────────────────────────────────────

/**
 * Calcula o TOTAL de uma linha de memória baseado nos campos dimensionais.
 * Regra: produto de todos os campos não-nulos e não-zero.
 * Equivalente à fórmula Excel:
 *   =IF(SUM(C:L)<>0, PRODUCT(C,D,E,F,G,H,I,J,L), 0) - K
 */
export function calcularTotalLinha(linha: Partial<LinhaMemoria>): number {
  const campos = [
    linha.largura,
    linha.comprimento,
    linha.altura,
    linha.perimetro,
    linha.area,
    linha.volume,
    linha.kg,
    linha.outros,
    linha.quantidade,
  ]

  const validos = campos.filter(v => v !== null && v !== undefined && v !== 0)

  if (validos.length === 0) return 0

  const produto = validos.reduce<number>((acc, v) => acc * (v as number), 1)
  const desconto = linha.desconto_dim ?? 0

  return produto - desconto
}

// ─── CÁLCULOS DO SERVIÇO ──────────────────────────────────────────────────────

export function calcPrecoComDesconto(preco: number, desconto: number): number {
  return preco * (1 - desconto)
}

/** Arredondamento compatível com Excel ROUND (half-up, não banker's rounding) */
function r2(value: number): number {
  return Math.round(value * 100 + 1e-10) / 100
}

export function calcPrecoComBDI(preco: number, bdi: number): number {
  return r2(preco * (1 + bdi))
}

export function calcPrecoTotal(quantidade: number, precoUnitario: number): number {
  return r2(quantidade * precoUnitario)
}

/** Total do serviço: BDI no unitário (arredondado Excel) → qtd × PU_BDI (arredondado) */
export function calcTotalServicoBDI(quantidade: number, precoUnitario: number, bdi: number): number {
  const puBDI = calcPrecoComBDI(precoUnitario, bdi)
  return calcPrecoTotal(quantidade, puBDI)
}

/** Total com desconto: soma de PT_BDI × (1 - desconto) — desconto aplicado no total */
export function calcTotalServico(quantidade: number, precoUnitario: number, bdi: number, desconto: number): number {
  const ptBDI = calcTotalServicoBDI(quantidade, precoUnitario, bdi)
  return r2(ptBDI * (1 - desconto))
}

/** 
 * Preço total de um serviço respeitando preco_total_fixo (importação COM BDI).
 * Se preco_total_fixo está preenchido, retorna ele direto — ZERO cálculo.
 * Senão, calcula normalmente (BDI + desconto).
 */
export function getPrecoTotalServico(srv: Servico, bdi: number, desconto: number): number {
  if (srv.preco_total_fixo != null && srv.preco_total_fixo > 0) {
    return srv.preco_total_fixo
  }
  return calcTotalServico(srv.quantidade, srv.preco_unitario, bdi, desconto)
}

/** Preço total BDI de um serviço (sem desconto). Respeita preco_total_fixo. */
export function getPrecoTotalBDI(srv: Servico, bdi: number): number {
  if (srv.preco_total_fixo != null && srv.preco_total_fixo > 0) {
    return srv.preco_total_fixo
  }
  return calcTotalServicoBDI(srv.quantidade, srv.preco_unitario, bdi)
}

/** PU efetivo de um serviço para medição. Se fixo, calcula PU = PT / QTD. */
export function getPUEfetivo(srv: Servico, bdi: number): number {
  if (srv.preco_total_fixo != null && srv.preco_total_fixo > 0 && srv.quantidade > 0) {
    return srv.preco_total_fixo / srv.quantidade
  }
  return calcPrecoComBDI(srv.preco_unitario, bdi)
}

// ─── RESUMO DO SERVIÇO NA MEDIÇÃO ────────────────────────────────────────────

export interface ResumoLinhasServico {
  qtdAnterior: number
  qtdPeriodo: number
  qtdAcumulada: number
  qtdSaldo: number
}

export function calcResumoServico(
  servico: Servico,
  linhas: LinhaMemoria[]
): ResumoLinhasServico {
  const qtdAnterior = linhas
    .filter(l => l.status === 'Pago')
    .reduce((sum, l) => sum + l.total, 0)

  const qtdPeriodo = linhas
    .filter(l => l.status === 'A pagar')
    .reduce((sum, l) => sum + l.total, 0)

  const qtdAcumulada = qtdAnterior + qtdPeriodo
  const qtdSaldo = servico.quantidade - qtdAcumulada

  return { qtdAnterior, qtdPeriodo, qtdAcumulada, qtdSaldo }
}

// ─── VALOR TOTAL DA MEDIÇÃO ───────────────────────────────────────────────────

export interface ValoresMedicao {
  totalOrcamento: number
  valorPeriodo: number
  valorAcumulado: number
  valorSaldo: number
  percentualPeriodo: number
  percentualAcumulado: number
  percentualSaldo: number
}

export function calcValoresMedicao(
  servicos: Servico[],
  linhasPorServico: Map<string, LinhaMemoria[]>,
  contrato: Contrato | Obra
): ValoresMedicao {
  let totalOrcamentoBDI = 0
  let valorPeriodo = 0
  let valorAcumulado = 0

  // Arredonda compatível com Excel ROUND (half-up)
  const er2 = (n: number) => Math.round(n * 100 + 1e-10) / 100

  for (const srv of servicos) {
    if (srv.is_grupo) continue

    // Se tem preco_total_fixo: valor exato da planilha, zero cálculo
    const precoTotal = getPrecoTotalServico(srv, contrato.bdi_percentual, contrato.desconto_percentual)
    const ptBDI = getPrecoTotalBDI(srv, contrato.bdi_percentual)
    totalOrcamentoBDI += ptBDI

    const linhas = linhasPorServico.get(srv.id) || []
    const { qtdAnterior, qtdPeriodo, qtdAcumulada } = calcResumoServico(srv, linhas)

    // PU efetivo: se fixo, PU = PT / QTD; senão, PU com BDI arredondado
    const puEfetivo = getPUEfetivo(srv, contrato.bdi_percentual)
    const temFixo = srv.preco_total_fixo != null && srv.preco_total_fixo > 0
    const fatorDesc = temFixo ? 1 : (1 - contrato.desconto_percentual)

    // Quando 100% medido, usa o valor do contrato (evita diferença de arredondamento)
    if (qtdAcumulada >= srv.quantidade && srv.quantidade > 0) {
      valorAcumulado += precoTotal
      if (qtdAnterior === 0) {
        valorPeriodo += precoTotal
      } else {
        const valAnterior = er2(er2(qtdAnterior * puEfetivo) * fatorDesc)
        valorPeriodo += precoTotal - valAnterior
      }
    } else {
      // Parcialmente medido
      valorAcumulado += er2(er2((qtdAnterior + qtdPeriodo) * puEfetivo) * fatorDesc)
      valorPeriodo += er2(er2(qtdPeriodo * puEfetivo) * fatorDesc)
    }
  }

  // Total: soma de getPrecoTotalServico (respeita fixo automaticamente)
  let totalOrcamento = 0
  for (const srv of servicos) {
    if (srv.is_grupo) continue
    totalOrcamento += getPrecoTotalServico(srv, contrato.bdi_percentual, contrato.desconto_percentual)
  }
  const valorSaldo = totalOrcamento - valorAcumulado

  return {
    totalOrcamento,
    valorPeriodo,
    valorAcumulado,
    valorSaldo,
    percentualPeriodo: totalOrcamento > 0 ? valorPeriodo / totalOrcamento : 0,
    percentualAcumulado: totalOrcamento > 0 ? valorAcumulado / totalOrcamento : 0,
    percentualSaldo: totalOrcamento > 0 ? valorSaldo / totalOrcamento : 0,
  }
}

// ─── IMPORT DE ORÇAMENTO ─────────────────────────────────────────────────────

/**
 * Determina se um item é de grupo (ex: "1.0", "2.0", "10") vs serviço (ex: "1.1")
 */
export function isItemGrupo(item: string): boolean {
  // Remove espaços
  const clean = item.trim()
  // Grupo: número inteiro ou com ".0" no final
  return /^\d+\.0$/.test(clean) || /^\d+$/.test(clean)
}

/**
 * Determina o grupo pai de um item (ex: "1.3" → "1.0", "12.5" → "12.0")
 */
export function getGrupoItem(item: string): string | undefined {
  const match = item.match(/^(\d+)\./)
  if (!match) return undefined
  return `${match[1]}.0`
}

// ─── GERAÇÃO DE SUB-ITEM ────────────────────────────────────────────────────

export function gerarSubItem(itemPai: string, indice: number): string {
  // ex: itemPai = "1.1", indice = 1 → "1.1.1"
  return `${itemPai}.${indice}`
}

// ─── NÚMERO POR EXTENSO (R$) ────────────────────────────────────────────────

const unidades = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
  'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
const dezenas = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']
const centenas = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos',
  'seiscentos', 'setecentos', 'oitocentos', 'novecentos']

function numPorExtenso(n: number): string {
  if (n === 0) return 'zero'
  if (n === 100) return 'cem'
  if (n < 20) return unidades[n]
  if (n < 100) {
    const d = Math.floor(n / 10)
    const u = n % 10
    return u === 0 ? dezenas[d] : `${dezenas[d]} e ${unidades[u]}`
  }
  if (n < 1000) {
    const c = Math.floor(n / 100)
    const resto = n % 100
    return resto === 0 ? centenas[c] : `${centenas[c]} e ${numPorExtenso(resto)}`
  }
  if (n < 1000000) {
    const mil = Math.floor(n / 1000)
    const resto = n % 1000
    const milStr = mil === 1 ? 'mil' : `${numPorExtenso(mil)} mil`
    return resto === 0 ? milStr : `${milStr} e ${numPorExtenso(resto)}`
  }
  return n.toString()
}

export function valorPorExtenso(valor: number): string {
  const inteiro = Math.floor(valor)
  const centavos = Math.round((valor - inteiro) * 100)

  const parteInteira = numPorExtenso(inteiro)
  const sufixoInteiro = inteiro === 1 ? 'real' : 'reais'

  if (centavos === 0) {
    return `${parteInteira} ${sufixoInteiro}`
  }

  const parteCentavos = numPorExtenso(centavos)
  const sufixoCentavos = centavos === 1 ? 'centavo' : 'centavos'

  return `${parteInteira} ${sufixoInteiro} e ${parteCentavos} ${sufixoCentavos}`
}