// ─── ENUMS ────────────────────────────────────────────────────────────────────

export type TipoContrato = 'ESTADO' | 'PREFEITURA'
export type StatusMedicao = 'RASCUNHO' | 'ENVIADA' | 'APROVADA'
export type StatusLinhaMemoria = 'A pagar' | 'Pago' | 'Não executado'
export type FonteOrcamento = 'SINAPI' | 'ORSE' | 'SEINFRA' | 'CAERN' | 'Composições Próprias' | string

// ─── CONTRATO ─────────────────────────────────────────────────────────────────

export interface Contrato {
  id: string
  created_at: string
  updated_at: string

  // Identificação
  nome_obra: string
  local_obra: string
  numero_contrato: string
  tipo: TipoContrato

  // Órgão contratante
  orgao_nome: string           // ex: SEEC / Prefeitura de X
  orgao_subdivisao?: string    // ex: SUBCOORDENADORIA DE MANUTENÇÃO

  // Empresa
  empresa_executora: string

  // Financeiro
  desconto_percentual: number  // ex: 0.0429
  bdi_percentual: number       // ex: 0.30091
  bdi_preco_unitario?: number  // ex: 1.2452 (para cálculo do preço c/ BDI no demonstrativo)
  data_base_planilha: string   // ex: "SINAPI 01/2025"

  // Prazos
  data_ordem_servico: string
  prazo_execucao_dias: number

  // Controle
  status: 'ATIVO' | 'CONCLUIDO' | 'SUSPENSO'
  medicoes_count?: number
}

// ─── SERVIÇO (item do orçamento) ──────────────────────────────────────────────

export interface Servico {
  id: string
  contrato_id: string
  created_at: string

  // Identificação
  item: string          // ex: "1.1", "2.3"
  fonte: FonteOrcamento
  codigo: string        // ex: "103689", "COMP-ADM.1"
  descricao: string
  unidade: string
  quantidade: number
  preco_unitario: number

  // Calculados (derivados, mas armazenados para performance)
  preco_com_desconto?: number   // preco_unitario * (1 - desconto)
  preco_com_bdi?: number        // preco_com_desconto * (1 + bdi)
  preco_total?: number          // quantidade * preco_com_bdi

  // Organização
  is_grupo: boolean     // true = linha de grupo (ex: "1.0 SERVIÇOS PRELIMINARES")
  grupo_item?: string   // item do grupo pai, ex: "1.0"
  ordem: number
}

// ─── MEDIÇÃO ──────────────────────────────────────────────────────────────────

export interface Medicao {
  id: string
  contrato_id: string
  created_at: string
  updated_at: string

  numero: number           // 1, 2, 3...
  numero_extenso: string   // "1ª", "2ª"...
  data_medicao: string
  status: StatusMedicao
  observacoes?: string
}

// ─── LINHA DA MEMÓRIA DE CÁLCULO ──────────────────────────────────────────────

export interface LinhaMemoria {
  id: string
  medicao_id: string
  servico_id: string
  created_at: string
  updated_at: string

  // Sub-item (ex: "1.1.1", "1.1.2")
  sub_item: string
  descricao_calculo: string  // descrição livre da linha de cálculo

  // Campos dimensionais (todos opcionais — depende do tipo de serviço)
  largura?: number
  comprimento?: number
  altura?: number
  perimetro?: number
  area?: number
  volume?: number
  kg?: number
  outros?: number
  desconto_dim?: number    // fator de desconto dimensional (ex: 0.9)
  quantidade?: number      // multiplicador final

  // Resultado
  total: number            // calculado: produto dos campos preenchidos
  status: StatusLinhaMemoria
  observacao?: string
}

// ─── RESUMO POR SERVIÇO (computed de LinhaMemoria) ────────────────────────────

export interface ResumoServico {
  servico_id: string
  item: string

  // Quantidades
  quantidade_prevista: number
  quantidade_anterior_acumulada: number
  quantidade_medida_periodo: number
  quantidade_acumulada: number
  quantidade_saldo: number

  // Preços
  preco_unitario_bdi: number
  valor_anterior_acumulado: number
  valor_periodo: number
  valor_acumulado: number
  valor_saldo: number
  peso_percentual: number
  saldo_percentual: number
}

// ─── IMPORT DE ORÇAMENTO ──────────────────────────────────────────────────────

export interface ServicoImportado {
  item: string
  fonte: string
  codigo: string
  descricao: string
  unidade: string
  quantidade: number
  preco_unitario: number
  is_grupo: boolean
  grupo_item?: string
  ordem: number
}

// ─── STORE STATE ──────────────────────────────────────────────────────────────

export interface AppState {
  contratos: Contrato[]
  contratoAtivo: Contrato | null
  medicaoAtiva: Medicao | null
  loading: boolean
  error: string | null
}
