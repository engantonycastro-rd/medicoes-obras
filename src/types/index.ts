export type TipoContrato = 'ESTADO' | 'PREFEITURA'
export type StatusMedicao = 'RASCUNHO' | 'ENVIADA' | 'APROVADA'
export type StatusLinhaMemoria = 'A pagar' | 'Pago' | 'Não executado'
export type FonteOrcamento = 'SINAPI' | 'ORSE' | 'SEINFRA' | 'CAERN' | 'Composições Próprias' | string
export type RolePerfil = 'ADMIN' | 'ENGENHEIRO'

export interface Perfil {
  id: string
  created_at: string
  updated_at: string
  email: string
  nome: string | null
  role: RolePerfil
  ativo: boolean
  criado_por: string | null
}

export interface Contrato {
  id: string
  created_at: string
  updated_at: string
  nome_obra: string
  local_obra: string
  numero_contrato: string | null
  tipo: TipoContrato
  orgao_nome: string
  orgao_subdivisao: string | null
  empresa_executora: string
  desconto_percentual: number
  bdi_percentual: number
  bdi_preco_unitario: number | null
  data_base_planilha: string | null
  data_ordem_servico: string | null
  prazo_execucao_dias: number | null
  status: 'ATIVO' | 'CONCLUIDO' | 'SUSPENSO'
  user_id: string
}

export interface Servico {
  id: string
  contrato_id: string
  created_at: string
  item: string
  fonte: FonteOrcamento
  codigo: string
  descricao: string
  unidade: string
  quantidade: number
  preco_unitario: number
  is_grupo: boolean
  grupo_item: string | null
  ordem: number
}

export interface Medicao {
  id: string
  contrato_id: string
  created_at: string
  updated_at: string
  numero: number
  numero_extenso: string
  data_medicao: string
  status: StatusMedicao
  observacoes: string | null
}

export interface LinhaMemoria {
  id: string
  medicao_id: string
  servico_id: string
  created_at: string
  updated_at: string
  sub_item: string
  descricao_calculo: string
  largura: number | null
  comprimento: number | null
  altura: number | null
  perimetro: number | null
  area: number | null
  volume: number | null
  kg: number | null
  outros: number | null
  desconto_dim: number | null
  quantidade: number | null
  total: number
  status: StatusLinhaMemoria
  observacao: string | null
}

export interface ServicoImportado {
  item: string
  fonte: string
  codigo: string
  descricao: string
  unidade: string
  quantidade: number
  preco_unitario: number
  is_grupo: boolean
  grupo_item: string | null
  ordem: number
}

export interface ResumoLinhasServico {
  qtdAnterior: number
  qtdPeriodo: number
  qtdAcumulada: number
  qtdSaldo: number
}
