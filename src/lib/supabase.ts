import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check your .env file.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})

export type Database = {
  public: {
    Tables: {
      contratos: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          nome_obra: string
          local_obra: string
          numero_contrato: string | null
          tipo: 'ESTADO' | 'PREFEITURA'
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
        Insert: Omit<Database['public']['Tables']['contratos']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['contratos']['Insert']>
      }
      servicos: {
        Row: {
          id: string
          contrato_id: string
          created_at: string
          item: string
          fonte: string
          codigo: string | null
          descricao: string
          unidade: string
          quantidade: number
          preco_unitario: number
          is_grupo: boolean
          grupo_item: string | null
          ordem: number
        }
        Insert: Omit<Database['public']['Tables']['servicos']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['servicos']['Insert']>
      }
      medicoes: {
        Row: {
          id: string
          contrato_id: string
          created_at: string
          updated_at: string
          numero: number
          numero_extenso: string
          data_medicao: string
          status: 'RASCUNHO' | 'ENVIADA' | 'APROVADA'
          observacoes: string | null
        }
        Insert: Omit<Database['public']['Tables']['medicoes']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['medicoes']['Insert']>
      }
      linhas_memoria: {
        Row: {
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
          status: 'A pagar' | 'Pago' | 'Não executado'
          observacao: string | null
        }
        Insert: Omit<Database['public']['Tables']['linhas_memoria']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['linhas_memoria']['Insert']>
      }
    }
  }
}
