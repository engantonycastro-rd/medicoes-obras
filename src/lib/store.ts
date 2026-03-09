import { create } from 'zustand'
import { Contrato, Medicao, Servico, LinhaMemoria } from '../types'
import { supabase } from '../lib/supabase'

interface Store {
  contratos: Contrato[]
  contratoAtivo: Contrato | null
  medicaoAtiva: Medicao | null
  servicos: Servico[]
  linhasPorServico: Map<string, LinhaMemoria[]>
  logoBase64: string | null
  loading: boolean
  error: string | null

  fetchContratos: () => Promise<void>
  setContratoAtivo: (c: Contrato | null) => void
  criarContrato: (data: Omit<Contrato, 'id' | 'created_at' | 'updated_at'>) => Promise<Contrato>
  atualizarContrato: (id: string, data: Partial<Contrato>) => Promise<void>
  deletarContrato: (id: string) => Promise<void>
  fetchServicos: (contratoId: string) => Promise<void>
  salvarServicos: (contratoId: string, servicos: import('../types').ServicoImportado[]) => Promise<void>
  fetchMedicoes: (contratoId: string) => Promise<Medicao[]>
  setMedicaoAtiva: (m: Medicao | null) => void
  criarMedicao: (contratoId: string) => Promise<Medicao>
  atualizarMedicao: (id: string, data: Partial<Medicao>) => Promise<void>
  efetuarMedicao: (medicaoId: string, contratoId: string) => Promise<void>
  criarProximaMedicao: (contratoId: string, medicaoAtualId: string) => Promise<Medicao>
  fetchLinhasMedicao: (medicaoId: string) => Promise<void>
  salvarLinha: (linha: Omit<LinhaMemoria, 'id' | 'created_at' | 'updated_at'>) => Promise<LinhaMemoria>
  atualizarLinha: (id: string, data: Partial<LinhaMemoria>) => Promise<void>
  deletarLinha: (id: string) => Promise<void>
  reordenarLinhas: (servicoId: string, linhas: LinhaMemoria[]) => void
  setLogoBase64: (logo: string | null) => void
}

export const useStore = create<Store>((set, get) => ({
  contratos: [],
  contratoAtivo: null,
  medicaoAtiva: null,
  servicos: [],
  linhasPorServico: new Map(),
  logoBase64: null,
  loading: false,
  error: null,

  fetchContratos: async () => {
    set({ loading: true, error: null })
    const { data, error } = await supabase.from('contratos').select('*').order('created_at', { ascending: false })
    if (error) { set({ error: error.message, loading: false }); return }
    set({ contratos: (data || []) as Contrato[], loading: false })
  },

  setContratoAtivo: (c) => set({ contratoAtivo: c }),

  criarContrato: async (data) => {
    set({ loading: true })
    const user = (await supabase.auth.getUser()).data.user
    const { data: created, error } = await supabase.from('contratos').insert({ ...data, user_id: user?.id }).select().single()
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

  fetchServicos: async (contratoId) => {
    const { data, error } = await supabase.from('servicos').select('*').eq('contrato_id', contratoId).order('ordem')
    if (error) { set({ error: error.message }); return }
    set({ servicos: (data || []) as Servico[] })
  },

  salvarServicos: async (contratoId, importados) => {
    set({ loading: true })
    await supabase.from('servicos').delete().eq('contrato_id', contratoId)
    const rows = importados.map(s => ({
      contrato_id: contratoId, item: s.item, fonte: s.fonte, codigo: s.codigo || null,
      descricao: s.descricao, unidade: s.unidade, quantidade: s.quantidade,
      preco_unitario: s.preco_unitario, is_grupo: s.is_grupo, grupo_item: s.grupo_item || null, ordem: s.ordem,
    }))
    const { data, error } = await supabase.from('servicos').insert(rows).select()
    if (error) { set({ error: error.message, loading: false }); throw error }
    set({ servicos: (data || []) as Servico[], loading: false })
  },

  fetchMedicoes: async (contratoId) => {
    const { data, error } = await supabase.from('medicoes').select('*').eq('contrato_id', contratoId).order('numero')
    if (error) { set({ error: error.message }); return [] }
    return (data || []) as Medicao[]
  },

  setMedicaoAtiva: (m) => set({ medicaoAtiva: m }),

  criarMedicao: async (contratoId) => {
    const medicoes = await get().fetchMedicoes(contratoId)
    const proximo = (medicoes.length || 0) + 1
    const ordinais = ['1ª','2ª','3ª','4ª','5ª','6ª','7ª','8ª','9ª','10ª','11ª','12ª','13ª','14ª','15ª']
    const numExtenso = ordinais[proximo - 1] || `${proximo}ª`
    const { data, error } = await supabase.from('medicoes').insert({
      contrato_id: contratoId, numero: proximo, numero_extenso: numExtenso,
      data_medicao: new Date().toISOString().split('T')[0], status: 'RASCUNHO',
    }).select().single()
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

  efetuarMedicao: async (medicaoId, _contratoId) => {
    set({ loading: true })
    // Apenas muda o status da medição para APROVADA.
    // As linhas NÃO são alteradas aqui — a virada A pagar → Pago
    // só acontece ao criar a próxima medição.
    const { error: errMed } = await supabase.from('medicoes').update({ status: 'APROVADA' }).eq('id', medicaoId)
    if (errMed) { set({ error: errMed.message, loading: false }); throw errMed }
    set(s => ({
      medicaoAtiva: s.medicaoAtiva?.id === medicaoId
        ? { ...s.medicaoAtiva, status: 'APROVADA' as const }
        : s.medicaoAtiva,
      loading: false,
    }))
  },

  criarProximaMedicao: async (contratoId, medicaoAtualId) => {
    set({ loading: true })

    // 1. Efetiva a medição atual (só muda status, sem mexer nas linhas)
    await get().efetuarMedicao(medicaoAtualId, contratoId)

    // 2. Busca TODAS as linhas da medição atual (Pago + A pagar)
    //    "Pago" = já era acumulado anterior
    //    "A pagar" = foi medido neste período — agora vira "Pago" na próxima
    const { data: todasLinhas } = await supabase.from('linhas_memoria')
      .select('*').eq('medicao_id', medicaoAtualId)

    // 3. Cria a nova medição
    const medicoes = await get().fetchMedicoes(contratoId)
    const proximo = (medicoes.length || 0) + 1
    const ordinais = ['1ª','2ª','3ª','4ª','5ª','6ª','7ª','8ª','9ª','10ª','11ª','12ª','13ª','14ª','15ª']
    const numExtenso = ordinais[proximo - 1] || `${proximo}ª`

    const { data: novaMed, error: errNova } = await supabase.from('medicoes').insert({
      contrato_id: contratoId, numero: proximo, numero_extenso: numExtenso,
      data_medicao: new Date().toISOString().split('T')[0], status: 'RASCUNHO',
    }).select().single()
    if (errNova) { set({ error: errNova.message, loading: false }); throw errNova }
    const novaMedicao = novaMed as Medicao

    // 4. Copia as linhas para a nova medição, TODAS como "Pago" (acumulado anterior)
    //    Linhas "Não executado" são descartadas
    if (todasLinhas && todasLinhas.length > 0) {
      const linhasParaCopiar = (todasLinhas as any[]).filter(l => l.status !== 'Não executado')
      if (linhasParaCopiar.length > 0) {
        const novasLinhas = linhasParaCopiar.map(l => ({
          medicao_id: novaMedicao.id,
          servico_id: l.servico_id,
          sub_item: l.sub_item,
          descricao_calculo: l.descricao_calculo,
          largura: l.largura, comprimento: l.comprimento, altura: l.altura,
          perimetro: l.perimetro, area: l.area, volume: l.volume,
          kg: l.kg, outros: l.outros, desconto_dim: l.desconto_dim,
          quantidade: l.quantidade, total: l.total,
          status: 'Pago',  // ← virada acontece AQUI ao criar próxima medição
          observacao: l.observacao,
        }))
        await supabase.from('linhas_memoria').insert(novasLinhas)
      }
    }

    set({ loading: false })
    return novaMedicao
  },

  fetchLinhasMedicao: async (medicaoId) => {
    const { data, error } = await supabase.from('linhas_memoria').select('*').eq('medicao_id', medicaoId).order('sub_item')
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
    const { data, error } = await supabase.from('linhas_memoria').insert(linha).select().single()
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

  setLogoBase64: (logo) => set({ logoBase64: logo }),
}))
