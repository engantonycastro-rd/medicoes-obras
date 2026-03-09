import { create } from 'zustand'
import { Contrato, Medicao, Servico, LinhaMemoria } from '../types'
import { supabase } from '../lib/supabase'

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface Store {
  // Estado
  contratos: Contrato[]
  contratoAtivo: Contrato | null
  medicaoAtiva: Medicao | null
  servicos: Servico[]
  linhasPorServico: Map<string, LinhaMemoria[]>
  loading: boolean
  error: string | null

  // Contratos
  fetchContratos: () => Promise<void>
  setContratoAtivo: (c: Contrato | null) => void
  criarContrato: (data: Omit<Contrato, 'id' | 'created_at' | 'updated_at'>) => Promise<Contrato>
  atualizarContrato: (id: string, data: Partial<Contrato>) => Promise<void>
  deletarContrato: (id: string) => Promise<void>

  // Serviços
  fetchServicos: (contratoId: string) => Promise<void>
  salvarServicos: (contratoId: string, servicos: import('../types').ServicoImportado[]) => Promise<void>

  // Medições
  fetchMedicoes: (contratoId: string) => Promise<Medicao[]>
  setMedicaoAtiva: (m: Medicao | null) => void
  criarMedicao: (contratoId: string) => Promise<Medicao>
  atualizarMedicao: (id: string, data: Partial<Medicao>) => Promise<void>

  // Memória de Cálculo
  fetchLinhasMedicao: (medicaoId: string) => Promise<void>
  salvarLinha: (linha: Omit<LinhaMemoria, 'id' | 'created_at' | 'updated_at'>) => Promise<LinhaMemoria>
  atualizarLinha: (id: string, data: Partial<LinhaMemoria>) => Promise<void>
  deletarLinha: (id: string) => Promise<void>
  reordenarLinhas: (servicoId: string, linhas: LinhaMemoria[]) => void
}

// ─── STORE ────────────────────────────────────────────────────────────────────

export const useStore = create<Store>((set, get) => ({
  contratos: [],
  contratoAtivo: null,
  medicaoAtiva: null,
  servicos: [],
  linhasPorServico: new Map(),
  loading: false,
  error: null,

  // ── CONTRATOS ────────────────────────────────────────────────────────────────

  fetchContratos: async () => {
    set({ loading: true, error: null })
    const { data, error } = await supabase
      .from('contratos')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) { set({ error: error.message, loading: false }); return }
    set({ contratos: (data || []) as Contrato[], loading: false })
  },

  setContratoAtivo: (c) => set({ contratoAtivo: c }),

  criarContrato: async (data) => {
    set({ loading: true })
    const user = (await supabase.auth.getUser()).data.user
    const { data: created, error } = await supabase
      .from('contratos')
      .insert({ ...data, user_id: user?.id })
      .select()
      .single()

    if (error) { set({ error: error.message, loading: false }); throw error }
    const contrato = created as Contrato
    set(s => ({ contratos: [contrato, ...s.contratos], loading: false }))
    return contrato
  },

  atualizarContrato: async (id, data) => {
    const { error } = await supabase.from('contratos').update(data).eq('id', id)
    if (error) { set({ error: error.message }); throw error }
    set(s => ({
      contratos: s.contratos.map(c => c.id === id ? { ...c, ...data } : c),
      contratoAtivo: s.contratoAtivo?.id === id ? { ...s.contratoAtivo, ...data } : s.contratoAtivo,
    }))
  },

  deletarContrato: async (id) => {
    const { error } = await supabase.from('contratos').delete().eq('id', id)
    if (error) { set({ error: error.message }); throw error }
    set(s => ({
      contratos: s.contratos.filter(c => c.id !== id),
      contratoAtivo: s.contratoAtivo?.id === id ? null : s.contratoAtivo,
    }))
  },

  // ── SERVIÇOS ─────────────────────────────────────────────────────────────────

  fetchServicos: async (contratoId) => {
    const { data, error } = await supabase
      .from('servicos')
      .select('*')
      .eq('contrato_id', contratoId)
      .order('ordem')

    if (error) { set({ error: error.message }); return }
    set({ servicos: (data || []) as Servico[] })
  },

  salvarServicos: async (contratoId, importados) => {
    set({ loading: true })
    // Deleta todos os serviços existentes e reimporta
    await supabase.from('servicos').delete().eq('contrato_id', contratoId)

    const rows = importados.map(s => ({
      contrato_id: contratoId,
      item: s.item,
      fonte: s.fonte,
      codigo: s.codigo || null,
      descricao: s.descricao,
      unidade: s.unidade,
      quantidade: s.quantidade,
      preco_unitario: s.preco_unitario,
      is_grupo: s.is_grupo,
      grupo_item: s.grupo_item || null,
      ordem: s.ordem,
    }))

    const { data, error } = await supabase.from('servicos').insert(rows).select()
    if (error) { set({ error: error.message, loading: false }); throw error }
    set({ servicos: (data || []) as Servico[], loading: false })
  },

  // ── MEDIÇÕES ─────────────────────────────────────────────────────────────────

  fetchMedicoes: async (contratoId) => {
    const { data, error } = await supabase
      .from('medicoes')
      .select('*')
      .eq('contrato_id', contratoId)
      .order('numero')

    if (error) { set({ error: error.message }); return [] }
    return (data || []) as Medicao[]
  },

  setMedicaoAtiva: (m) => set({ medicaoAtiva: m }),

  criarMedicao: async (contratoId) => {
    const medicoes = await get().fetchMedicoes(contratoId)
    const proximo = (medicoes.length || 0) + 1
    const ordinais = ['1ª','2ª','3ª','4ª','5ª','6ª','7ª','8ª','9ª','10ª',
                      '11ª','12ª','13ª','14ª','15ª']
    const numExtenso = ordinais[proximo - 1] || `${proximo}ª`

    const { data, error } = await supabase
      .from('medicoes')
      .insert({
        contrato_id: contratoId,
        numero: proximo,
        numero_extenso: numExtenso,
        data_medicao: new Date().toISOString().split('T')[0],
        status: 'RASCUNHO',
      })
      .select()
      .single()

    if (error) { set({ error: error.message }); throw error }
    return data as Medicao
  },

  atualizarMedicao: async (id, data) => {
    const { error } = await supabase.from('medicoes').update(data).eq('id', id)
    if (error) { set({ error: error.message }); throw error }
    set(s => ({
      medicaoAtiva: s.medicaoAtiva?.id === id ? { ...s.medicaoAtiva, ...data } : s.medicaoAtiva,
    }))
  },

  // ── MEMÓRIA DE CÁLCULO ────────────────────────────────────────────────────────

  fetchLinhasMedicao: async (medicaoId) => {
    const { data, error } = await supabase
      .from('linhas_memoria')
      .select('*')
      .eq('medicao_id', medicaoId)
      .order('sub_item')

    if (error) { set({ error: error.message }); return }

    const mapa = new Map<string, LinhaMemoria[]>()
    for (const linha of (data || []) as LinhaMemoria[]) {
      const arr = mapa.get(linha.servico_id) || []
      arr.push(linha)
      mapa.set(linha.servico_id, arr)
    }
    set({ linhasPorServico: mapa })
  },

  salvarLinha: async (linha) => {
    const { data, error } = await supabase
      .from('linhas_memoria')
      .insert(linha)
      .select()
      .single()

    if (error) { set({ error: error.message }); throw error }
    const nova = data as LinhaMemoria

    set(s => {
      const mapa = new Map(s.linhasPorServico)
      const arr = [...(mapa.get(nova.servico_id) || []), nova]
      mapa.set(nova.servico_id, arr)
      return { linhasPorServico: mapa }
    })

    return nova
  },

  atualizarLinha: async (id, data) => {
    const { error } = await supabase.from('linhas_memoria').update(data).eq('id', id)
    if (error) { set({ error: error.message }); throw error }

    set(s => {
      const mapa = new Map(s.linhasPorServico)
      mapa.forEach((linhas, srvId) => {
        mapa.set(srvId, linhas.map(l => l.id === id ? { ...l, ...data } : l))
      })
      return { linhasPorServico: mapa }
    })
  },

  deletarLinha: async (id) => {
    const { error } = await supabase.from('linhas_memoria').delete().eq('id', id)
    if (error) { set({ error: error.message }); throw error }

    set(s => {
      const mapa = new Map(s.linhasPorServico)
      mapa.forEach((linhas, srvId) => {
        mapa.set(srvId, linhas.filter(l => l.id !== id))
      })
      return { linhasPorServico: mapa }
    })
  },

  reordenarLinhas: (servicoId, linhas) => {
    set(s => {
      const mapa = new Map(s.linhasPorServico)
      mapa.set(servicoId, linhas)
      return { linhasPorServico: mapa }
    })
  },
}))
