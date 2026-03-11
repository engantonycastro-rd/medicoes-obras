/**
 * TOTVS RM API Service
 *
 * Conecta com o TOTVS RM via API REST Framework.
 *
 * ARQUITETURA:
 * Como o TOTVS RM geralmente roda na rede interna da empresa,
 * as chamadas passam por um proxy (Node.js) que roda na mesma rede.
 *
 * Frontend → Proxy (rede interna) → TOTVS RM API
 *
 * O proxy é um script simples que repassa as requisições.
 * Se o RM estiver exposto externamente, o proxy não é necessário.
 */

export interface TOTVSConfig {
  host: string           // URL do proxy ou do RM direto. Ex: http://192.168.1.100:3333
  usuario: string        // Usuário do RM
  senha: string          // Senha do RM
  coligada: number       // Código da coligada (1 = padrão)
  filial: number
  contexto: string       // 'TOTVS' ou contexto customizado
  timeout_ms: number
  ativo: boolean
}

export interface TOTVSMovimento {
  id_erp: string
  tipo: string
  numero_documento: string
  serie: string | null
  fornecedor: string
  cnpj: string | null
  valor_bruto: number
  valor_liquido: number
  data_emissao: string
  data_vencimento: string | null
  data_pagamento: string | null
  centro_custo: string | null
  conta_contabil: string | null
  descricao: string | null
  status: string
}

export interface TOTVSContaPagar {
  id_erp: string
  numero_titulo: string
  fornecedor: string
  cnpj: string | null
  valor: number
  data_emissao: string
  data_vencimento: string
  data_pagamento: string | null
  status: string
  centro_custo: string | null
  descricao: string | null
}

export interface TOTVSSyncResult {
  sucesso: boolean
  mensagem: string
  registros: number
  dados: any[]
}

// ─── AUTH ────────────────────────────────────────────────────────────────────

function buildHeaders(config: TOTVSConfig): Record<string, string> {
  const credentials = btoa(`${config.usuario}:${config.senha}`)
  return {
    'Authorization': `Basic ${credentials}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'x-totvs-context': config.contexto || 'TOTVS',
  }
}

// ─── CHAMADA BASE ────────────────────────────────────────────────────────────

async function callRM(
  config: TOTVSConfig,
  endpoint: string,
  method: 'GET' | 'POST' = 'GET',
  body?: any
): Promise<any> {
  const url = `${config.host.replace(/\/+$/, '')}/${endpoint.replace(/^\/+/, '')}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeout_ms || 30000)

  try {
    const response = await fetch(url, {
      method,
      headers: buildHeaders(config),
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`TOTVS RM API [${response.status}]: ${text || response.statusText}`)
    }

    return await response.json()
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(`Timeout: TOTVS RM não respondeu em ${config.timeout_ms / 1000}s. Verifique se o proxy está rodando.`)
    }
    if (err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError')) {
      throw new Error('Não foi possível conectar ao TOTVS RM. Verifique se o proxy está rodando e acessível.')
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

// ─── CONSULTAS SQL (via consultaSQL endpoint) ────────────────────────────────

/**
 * Executa uma consulta SQL no banco do RM via endpoint consultaSQL.
 * Este é o método mais flexível do TOTVS RM API Framework.
 */
async function executarConsultaSQL(config: TOTVSConfig, sql: string, params?: Record<string, any>): Promise<any[]> {
  const result = await callRM(config, 'api/framework/v1/consultaSQL', 'POST', {
    codSentenca: '',        // vazio = SQL direto
    codColigada: config.coligada,
    codFilial: config.filial,
    parameters: params || {},
    sqlStatement: sql,
  })

  // O RM retorna em formatos variados dependendo da versão
  if (Array.isArray(result)) return result
  if (result?.data && Array.isArray(result.data)) return result.data
  if (result?.items && Array.isArray(result.items)) return result.items
  if (result?.result && Array.isArray(result.result)) return result.result
  return []
}

// ─── QUERIES ESPECÍFICAS ─────────────────────────────────────────────────────

/**
 * Busca movimentos financeiros (notas fiscais, compras, etc.)
 * Tabela principal: TMOV (Movimentos)
 */
export async function buscarMovimentos(
  config: TOTVSConfig,
  centroCusto?: string,
  dataInicio?: string,
  dataFim?: string,
): Promise<TOTVSSyncResult> {
  try {
    let where = `M.CODCOLIGADA = ${config.coligada}`
    if (centroCusto) where += ` AND M.CODCCUSTO LIKE '${centroCusto}%'`
    if (dataInicio) where += ` AND M.DATAEMISSAO >= '${dataInicio}'`
    if (dataFim) where += ` AND M.DATAEMISSAO <= '${dataFim}'`

    const sql = `
      SELECT
        M.IDMOV AS id_erp,
        TM.DESCRICAO AS tipo,
        M.NUMEROMOV AS numero_documento,
        M.SERIE AS serie,
        CF.NOME AS fornecedor,
        CF.CGCCFO AS cnpj,
        M.VALORBRUTO AS valor_bruto,
        M.VALORLIQUIDO AS valor_liquido,
        M.DATAEMISSAO AS data_emissao,
        M.DATAVENCIMENTO AS data_vencimento,
        M.DATABAIXA AS data_pagamento,
        M.CODCCUSTO AS centro_custo,
        M.CODCONTA AS conta_contabil,
        M.HISTORICOLONGO AS descricao,
        CASE
          WHEN M.DATABAIXA IS NOT NULL THEN 'PAGO'
          WHEN M.DATAVENCIMENTO < GETDATE() THEN 'VENCIDO'
          WHEN M.STATUS = 'C' THEN 'CANCELADO'
          ELSE 'PENDENTE'
        END AS status
      FROM TMOV M (NOLOCK)
      LEFT JOIN FCFO CF (NOLOCK) ON CF.CODCFO = M.CODCFO AND CF.CODCOLIGADA = M.CODCOLIGADA
      LEFT JOIN TTMV TM (NOLOCK) ON TM.CODTMV = M.CODTMV AND TM.CODCOLIGADA = M.CODCOLIGADA
      WHERE ${where}
      ORDER BY M.DATAEMISSAO DESC
    `

    const dados = await executarConsultaSQL(config, sql)
    return {
      sucesso: true,
      mensagem: `${dados.length} movimentos encontrados`,
      registros: dados.length,
      dados,
    }
  } catch (err: any) {
    return { sucesso: false, mensagem: err.message, registros: 0, dados: [] }
  }
}

/**
 * Busca contas a pagar/receber
 * Tabela principal: FLAN (Lançamentos Financeiros)
 */
export async function buscarContasPagar(
  config: TOTVSConfig,
  centroCusto?: string,
  dataInicio?: string,
  dataFim?: string,
): Promise<TOTVSSyncResult> {
  try {
    let where = `L.CODCOLIGADA = ${config.coligada} AND L.PAESSION = 1` // 1 = a pagar
    if (centroCusto) where += ` AND L.CODCCUSTO LIKE '${centroCusto}%'`
    if (dataInicio) where += ` AND L.DATAEMISSAO >= '${dataInicio}'`
    if (dataFim) where += ` AND L.DATAEMISSAO <= '${dataFim}'`

    const sql = `
      SELECT
        L.IDLAN AS id_erp,
        L.NUMERODOCUMENTO AS numero_titulo,
        CF.NOME AS fornecedor,
        CF.CGCCFO AS cnpj,
        L.VALORDOCUMENTO AS valor,
        L.DATAEMISSAO AS data_emissao,
        L.DATAVENCIMENTO AS data_vencimento,
        L.DATABAIXA AS data_pagamento,
        L.CODCCUSTO AS centro_custo,
        L.HISTORICOLONGO AS descricao,
        CASE
          WHEN L.DATABAIXA IS NOT NULL THEN 'PAGO'
          WHEN L.DATAVENCIMENTO < GETDATE() THEN 'VENCIDO'
          WHEN L.STATUSLAN = 'C' THEN 'CANCELADO'
          ELSE 'PENDENTE'
        END AS status
      FROM FLAN L (NOLOCK)
      LEFT JOIN FCFO CF (NOLOCK) ON CF.CODCFO = L.CODCFO AND CF.CODCOLIGADA = L.CODCOLIGADA
      WHERE ${where}
      ORDER BY L.DATAVENCIMENTO DESC
    `

    const dados = await executarConsultaSQL(config, sql)
    return {
      sucesso: true,
      mensagem: `${dados.length} títulos encontrados`,
      registros: dados.length,
      dados,
    }
  } catch (err: any) {
    return { sucesso: false, mensagem: err.message, registros: 0, dados: [] }
  }
}

/**
 * Busca notas fiscais de entrada (compras de materiais/serviços)
 */
export async function buscarNotasFiscais(
  config: TOTVSConfig,
  centroCusto?: string,
  dataInicio?: string,
  dataFim?: string,
): Promise<TOTVSSyncResult> {
  try {
    let where = `M.CODCOLIGADA = ${config.coligada}`
    // Filtra tipos de movimento que são NFs de entrada
    where += ` AND TM.APLICACAO IN ('C','E')` // C=Compra, E=Entrada
    if (centroCusto) where += ` AND M.CODCCUSTO LIKE '${centroCusto}%'`
    if (dataInicio) where += ` AND M.DATAEMISSAO >= '${dataInicio}'`
    if (dataFim) where += ` AND M.DATAEMISSAO <= '${dataFim}'`

    const sql = `
      SELECT
        M.IDMOV AS id_erp,
        'NF_ENTRADA' AS tipo,
        M.NUMEROMOV AS numero_documento,
        M.SERIE AS serie,
        CF.NOME AS fornecedor,
        CF.CGCCFO AS cnpj,
        M.VALORBRUTO AS valor_bruto,
        M.VALORLIQUIDO AS valor_liquido,
        M.DATAEMISSAO AS data_emissao,
        M.CODCCUSTO AS centro_custo,
        M.CODCONTA AS conta_contabil,
        ISNULL(M.HISTORICOLONGO, TM.DESCRICAO) AS descricao
      FROM TMOV M (NOLOCK)
      LEFT JOIN FCFO CF (NOLOCK) ON CF.CODCFO = M.CODCFO AND CF.CODCOLIGADA = M.CODCOLIGADA
      LEFT JOIN TTMV TM (NOLOCK) ON TM.CODTMV = M.CODTMV AND TM.CODCOLIGADA = M.CODCOLIGADA
      WHERE ${where}
      ORDER BY M.DATAEMISSAO DESC
    `

    const dados = await executarConsultaSQL(config, sql)
    return {
      sucesso: true,
      mensagem: `${dados.length} NFs encontradas`,
      registros: dados.length,
      dados,
    }
  } catch (err: any) {
    return { sucesso: false, mensagem: err.message, registros: 0, dados: [] }
  }
}

/**
 * Busca centros de custo disponíveis (para mapeamento com obras)
 */
export async function buscarCentrosCusto(config: TOTVSConfig): Promise<TOTVSSyncResult> {
  try {
    const sql = `
      SELECT
        CC.CODCCUSTO AS codigo,
        CC.NOME AS nome,
        CC.CODCCUSTOPAI AS codigo_pai
      FROM GCCUSTO CC (NOLOCK)
      WHERE CC.CODCOLIGADA = ${config.coligada}
        AND CC.ATIVO = 'S'
      ORDER BY CC.CODCCUSTO
    `
    const dados = await executarConsultaSQL(config, sql)
    return { sucesso: true, mensagem: `${dados.length} centros de custo`, registros: dados.length, dados }
  } catch (err: any) {
    return { sucesso: false, mensagem: err.message, registros: 0, dados: [] }
  }
}

/**
 * Testa a conexão com o TOTVS RM
 */
export async function testarConexao(config: TOTVSConfig): Promise<{ ok: boolean; mensagem: string }> {
  try {
    const sql = `SELECT GETDATE() AS data_servidor, @@SERVERNAME AS servidor`
    const dados = await executarConsultaSQL(config, sql)
    if (dados.length > 0) {
      return { ok: true, mensagem: `Conectado ao servidor ${dados[0].servidor || 'RM'} em ${dados[0].data_servidor || 'OK'}` }
    }
    return { ok: true, mensagem: 'Conexão OK' }
  } catch (err: any) {
    return { ok: false, mensagem: err.message }
  }
}

// ─── MAPEAMENTO DE DADOS RM → CUSTOS_ERP ─────────────────────────────────────

export function mapMovimentoToCusto(mov: any): {
  tipo_documento: string; numero_documento: string|null; serie: string|null
  fornecedor: string|null; cnpj_fornecedor: string|null
  valor_total: number; valor_desconto: number; valor_liquido: number
  data_emissao: string|null; data_vencimento: string|null; data_pagamento: string|null
  centro_custo: string|null; conta_contabil: string|null
  descricao: string|null; status_pagamento: string; id_erp: string|null
  categoria: string|null
} {
  const tipoRaw = String(mov.tipo || '').toLowerCase()
  let tipo = 'OUTROS'
  if (tipoRaw.includes('entrada') || tipoRaw.includes('compra') || tipoRaw.includes('nf_entrada')) tipo = 'NF_ENTRADA'
  else if (tipoRaw.includes('saída') || tipoRaw.includes('saida') || tipoRaw.includes('fatura') || tipoRaw.includes('nf_saida')) tipo = 'NF_SAIDA'
  else if (tipoRaw.includes('folha') || tipoRaw.includes('rh')) tipo = 'FOLHA'

  let statusPag = 'PENDENTE'
  const st = String(mov.status || '').toUpperCase()
  if (st.includes('PAGO') || st.includes('BAIXAD')) statusPag = 'PAGO'
  else if (st.includes('VENCIDO')) statusPag = 'VENCIDO'
  else if (st.includes('CANCEL')) statusPag = 'CANCELADO'

  const formatDate = (d: any) => {
    if (!d) return null
    if (typeof d === 'string' && d.includes('T')) return d.split('T')[0]
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d
    try { return new Date(d).toISOString().split('T')[0] } catch { return null }
  }

  return {
    tipo_documento: tipo,
    numero_documento: String(mov.numero_documento || mov.numero_titulo || '') || null,
    serie: mov.serie || null,
    fornecedor: mov.fornecedor || null,
    cnpj_fornecedor: mov.cnpj || null,
    valor_total: Math.abs(Number(mov.valor_bruto || mov.valor || 0)),
    valor_desconto: 0,
    valor_liquido: Math.abs(Number(mov.valor_liquido || mov.valor || 0)),
    data_emissao: formatDate(mov.data_emissao),
    data_vencimento: formatDate(mov.data_vencimento),
    data_pagamento: formatDate(mov.data_pagamento),
    centro_custo: mov.centro_custo || null,
    conta_contabil: mov.conta_contabil || null,
    descricao: mov.descricao || null,
    status_pagamento: statusPag,
    id_erp: String(mov.id_erp || '') || null,
    categoria: tipo === 'NF_ENTRADA' ? 'Material' : tipo === 'FOLHA' ? 'Mão de Obra' : 'Outros',
  }
}