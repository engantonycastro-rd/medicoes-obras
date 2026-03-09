import { create } from 'zustand'
import { Contrato, Obra, Servico, Medicao, LinhaMemoria, FotoMedicao, LogoSistema } from '../types'
import { supabase } from './supabase'

interface Store {
  // Estado global
  contratos:        Contrato[]
  contratoAtivo:    Contrato | null
  obras:            Obra[]          // obras do contrato ativo
  obraAtiva:        Obra | null
  servicos:         Servico[]
  medicaoAtiva:     Medicao | null
  linhasPorServico: Map<string, LinhaMemoria[]>
  fotos:            FotoMedicao[]
  logos:            LogoSistema[]
  logoSelecionada:  string | null   // base64 em uso na exportação
  loading:          boolean
  error:            string | null

  // Contratos
  fetchContratos:    () => Promise<void>
  setContratoAtivo:  (c: Contrato | null) => void
  criarContrato:     (d: Omit<Contrato,'id'|'created_at'|'updated_at'>) => Promise<Contrato>
  atualizarContrato: (id: string, d: Partial<Contrato>) => Promise<void>
  deletarContrato:   (id: string) => Promise<void>

  // Obras
  fetchObras:    (contratoId: string) => Promise<Obra[]>
  setObraAtiva:  (o: Obra | null) => void
  criarObra:     (d: Omit<Obra,'id'|'created_at'|'updated_at'>) => Promise<Obra>
  atualizarObra: (id: string, d: Partial<Obra>) => Promise<void>
  deletarObra:   (id: string) => Promise<void>

  // Serviços
  fetchServicos:  (obraId: string) => Promise<void>
  salvarServicos: (obraId: string, contratoId: string, servicos: import('../types').ServicoImportado[]) => Promise<void>

  // Medições
  fetchMedicoes:       (obraId: string) => Promise<Medicao[]>
  setMedicaoAtiva:     (m: Medicao | null) => void
  criarMedicao:        (obraId: string, contratoId: string) => Promise<Medicao>
  atualizarMedicao:    (id: string, d: Partial<Medicao>) => Promise<void>
  efetuarMedicao:      (medicaoId: string) => Promise<void>
  criarProximaMedicao: (obraId: string, contratoId: string, medicaoAtualId: string) => Promise<Medicao>
  deletarMedicao:      (id: string) => Promise<void>

  // Memória
  fetchLinhasMedicao: (medicaoId: string) => Promise<void>
  salvarLinha:        (l: Omit<LinhaMemoria,'id'|'created_at'|'updated_at'>) => Promise<LinhaMemoria>
  atualizarLinha:     (id: string, d: Partial<LinhaMemoria>) => Promise<void>
  deletarLinha:       (id: string) => Promise<void>
  reordenarLinhas:    (servicoId: string, linhas: LinhaMemoria[]) => void

  // Fotos
  fetchFotos:    (medicaoId: string) => Promise<void>
  adicionarFoto: (f: Omit<FotoMedicao,'id'|'created_at'>) => Promise<FotoMedicao>
  atualizarFoto: (id: string, d: Partial<FotoMedicao>) => Promise<void>
  deletarFoto:   (id: string) => Promise<void>

  // Logos
  fetchLogos:        () => Promise<void>
  adicionarLogo:     (d: Omit<LogoSistema,'id'|'created_at'>) => Promise<LogoSistema>
  deletarLogo:       (id: string) => Promise<void>
  setLogoSelecionada:(base64: string | null) => void
}

export const useStore = create<Store>((set, get) => ({
  contratos: [], contratoAtivo: null, obras: [], obraAtiva: null,
  servicos: [], medicaoAtiva: null, linhasPorServico: new Map(),
  fotos: [], logos: [], logoSelecionada: null, loading: false, error: null,

  // ── CONTRATOS ────────────────────────────────────────────────────────────────
  fetchContratos: async () => {
    set({ loading: true })
    const { data, error } = await supabase.from('contratos').select('*').order('created_at', { ascending: false })
    if (error) { set({ error: error.message, loading: false }); return }
    set({ contratos: (data || []) as Contrato[], loading: false })
  },
  setContratoAtivo: (c) => set({ contratoAtivo: c, obraAtiva: null, obras: [] }),
  criarContrato: async (data) => {
    set({ loading: true })
    const user = (await supabase.auth.getUser()).data.user
    const { data: d, error } = await supabase.from('contratos').insert({ ...data, user_id: user?.id }).select().single()
    if (error) { set({ error: error.message, loading: false }); throw error }
    const c = d as Contrato
    set(s => ({ contratos: [c, ...s.contratos], loading: false }))
    return c
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
    set(s => ({ contratos: s.contratos.filter(c => c.id !== id), contratoAtivo: s.contratoAtivo?.id === id ? null : s.contratoAtivo }))
  },

  // ── OBRAS ────────────────────────────────────────────────────────────────────
  fetchObras: async (contratoId) => {
    const { data, error } = await supabase.from('obras').select('*').eq('contrato_id', contratoId).order('created_at')
    if (error) { set({ error: error.message }); return [] }
    set({ obras: (data || []) as Obra[] })
    return (data || []) as Obra[]
  },
  setObraAtiva: (o) => set({ obraAtiva: o }),
  criarObra: async (data) => {
    const user = (await supabase.auth.getUser()).data.user
    const { data: d, error } = await supabase.from('obras').insert({ ...data, user_id: user?.id }).select().single()
    if (error) { set({ error: error.message }); throw error }
    const o = d as Obra
    set(s => ({ obras: [...s.obras, o] }))
    return o
  },
  atualizarObra: async (id, data) => {
    const { error } = await supabase.from('obras').update(data).eq('id', id)
    if (error) { set({ error: error.message }); throw error }
    set(s => ({
      obras: s.obras.map(o => o.id === id ? { ...o, ...data } : o),
      obraAtiva: s.obraAtiva?.id === id ? { ...s.obraAtiva, ...data } : s.obraAtiva,
    }))
  },
  deletarObra: async (id) => {
    const { error } = await supabase.from('obras').delete().eq('id', id)
    if (error) { set({ error: error.message }); throw error }
    set(s => ({ obras: s.obras.filter(o => o.id !== id), obraAtiva: s.obraAtiva?.id === id ? null : s.obraAtiva }))
  },

  // ── SERVIÇOS ──────────────────────────────────────────────────────────────────
  fetchServicos: async (obraId) => {
    const { data, error } = await supabase.from('servicos').select('*').eq('obra_id', obraId).order('ordem')
    if (error) { set({ error: error.message }); return }
    set({ servicos: (data || []) as Servico[] })
  },
  salvarServicos: async (obraId, contratoId, importados) => {
    set({ loading: true })
    await supabase.from('servicos').delete().eq('obra_id', obraId)
    const rows = importados.map(s => ({
      contrato_id: contratoId, obra_id: obraId,
      item: s.item, fonte: s.fonte, codigo: s.codigo || null,
      descricao: s.descricao, unidade: s.unidade, quantidade: s.quantidade,
      preco_unitario: s.preco_unitario, is_grupo: s.is_grupo, grupo_item: s.grupo_item || null, ordem: s.ordem,
    }))
    const { data, error } = await supabase.from('servicos').insert(rows).select()
    if (error) { set({ error: error.message, loading: false }); throw error }
    set({ servicos: (data || []) as Servico[], loading: false })
  },

  // ── MEDIÇÕES ──────────────────────────────────────────────────────────────────
  fetchMedicoes: async (obraId) => {
    const { data, error } = await supabase.from('medicoes').select('*').eq('obra_id', obraId).order('numero')
    if (error) { set({ error: error.message }); return [] }
    return (data || []) as Medicao[]
  },
  setMedicaoAtiva: (m) => set({ medicaoAtiva: m }),
  criarMedicao: async (obraId, contratoId) => {
    const medicoes = await get().fetchMedicoes(obraId)
    const num = (medicoes.length || 0) + 1
    const ord = ['1ª','2ª','3ª','4ª','5ª','6ª','7ª','8ª','9ª','10ª','11ª','12ª','13ª','14ª','15ª']
    const { data, error } = await supabase.from('medicoes').insert({
      contrato_id: contratoId, obra_id: obraId, numero: num,
      numero_extenso: ord[num-1] || `${num}ª`,
      data_medicao: new Date().toISOString().split('T')[0], status: 'RASCUNHO',
    }).select().single()
    if (error) { set({ error: error.message }); throw error }
    return data as Medicao
  },
  atualizarMedicao: async (id, data) => {
    const { error } = await supabase.from('medicoes').update(data).eq('id', id)
    if (error) { set({ error: error.message }); throw error }
    set(s => ({ medicaoAtiva: s.medicaoAtiva?.id === id ? { ...s.medicaoAtiva, ...data } : s.medicaoAtiva }))
  },
  efetuarMedicao: async (medicaoId) => {
    set({ loading: true })
    const { error } = await supabase.from('medicoes').update({ status: 'APROVADA' }).eq('id', medicaoId)
    if (error) { set({ error: error.message, loading: false }); throw error }
    set(s => ({
      medicaoAtiva: s.medicaoAtiva?.id === medicaoId ? { ...s.medicaoAtiva, status: 'APROVADA' as const } : s.medicaoAtiva,
      loading: false,
    }))
  },
  deletarMedicao: async (id) => {
    const { error } = await supabase.from('medicoes').delete().eq('id', id)
    if (error) { set({ error: error.message }); throw error }
  },
  criarProximaMedicao: async (obraId, contratoId, medicaoAtualId) => {
    set({ loading: true })
    await get().efetuarMedicao(medicaoAtualId)
    const { data: todasLinhas } = await supabase.from('linhas_memoria').select('*').eq('medicao_id', medicaoAtualId)
    const medicoes = await get().fetchMedicoes(obraId)
    const num = (medicoes.length || 0) + 1
    const ord = ['1ª','2ª','3ª','4ª','5ª','6ª','7ª','8ª','9ª','10ª','11ª','12ª','13ª','14ª','15ª']
    const { data: novaMed, error } = await supabase.from('medicoes').insert({
      contrato_id: contratoId, obra_id: obraId, numero: num,
      numero_extenso: ord[num-1] || `${num}ª`,
      data_medicao: new Date().toISOString().split('T')[0], status: 'RASCUNHO',
    }).select().single()
    if (error) { set({ error: error.message, loading: false }); throw error }
    const nova = novaMed as Medicao
    if (todasLinhas?.length) {
      const linhasPagar = (todasLinhas as any[]).filter(l => l.status !== 'Não executado')
      if (linhasPagar.length) {
        await supabase.from('linhas_memoria').insert(linhasPagar.map(l => ({
          medicao_id: nova.id, servico_id: l.servico_id, sub_item: l.sub_item,
          descricao_calculo: l.descricao_calculo, largura: l.largura, comprimento: l.comprimento,
          altura: l.altura, perimetro: l.perimetro, area: l.area, volume: l.volume,
          kg: l.kg, outros: l.outros, desconto_dim: l.desconto_dim,
          quantidade: l.quantidade, total: l.total, status: 'Pago', observacao: l.observacao,
        })))
      }
    }
    set({ loading: false })
    return nova
  },

  // ── MEMÓRIA ───────────────────────────────────────────────────────────────────
  fetchLinhasMedicao: async (medicaoId) => {
    const { data, error } = await supabase.from('linhas_memoria').select('*').eq('medicao_id', medicaoId).order('sub_item')
    if (error) { set({ error: error.message }); return }
    const mapa = new Map<string, LinhaMemoria[]>()
    for (const l of (data || []) as LinhaMemoria[]) {
      const arr = mapa.get(l.servico_id) || []; arr.push(l); mapa.set(l.servico_id, arr)
    }
    set({ linhasPorServico: mapa })
  },
  salvarLinha: async (linha) => {
    const { data, error } = await supabase.from('linhas_memoria').insert(linha).select().single()
    if (error) { set({ error: error.message }); throw error }
    const nova = data as LinhaMemoria
    set(s => {
      const m = new Map(s.linhasPorServico)
      m.set(nova.servico_id, [...(m.get(nova.servico_id) || []), nova])
      return { linhasPorServico: m }
    })
    return nova
  },
  atualizarLinha: async (id, data) => {
    const { error } = await supabase.from('linhas_memoria').update(data).eq('id', id)
    if (error) { set({ error: error.message }); throw error }
    set(s => {
      const m = new Map(s.linhasPorServico)
      m.forEach((linhas, k) => m.set(k, linhas.map(l => l.id === id ? { ...l, ...data } : l)))
      return { linhasPorServico: m }
    })
  },
  deletarLinha: async (id) => {
    const { error } = await supabase.from('linhas_memoria').delete().eq('id', id)
    if (error) { set({ error: error.message }); throw error }
    set(s => {
      const m = new Map(s.linhasPorServico)
      m.forEach((linhas, k) => m.set(k, linhas.filter(l => l.id !== id)))
      return { linhasPorServico: m }
    })
  },
  reordenarLinhas: (servicoId, linhas) => {
    set(s => { const m = new Map(s.linhasPorServico); m.set(servicoId, linhas); return { linhasPorServico: m } })
  },

  // ── FOTOS ─────────────────────────────────────────────────────────────────────
  fetchFotos: async (medicaoId) => {
    const { data, error } = await supabase.from('fotos_medicao').select('*').eq('medicao_id', medicaoId).order('ordem')
    if (error) { set({ error: error.message }); return }
    set({ fotos: (data || []) as FotoMedicao[] })
  },
  adicionarFoto: async (foto) => {
    const { data, error } = await supabase.from('fotos_medicao').insert(foto).select().single()
    if (error) { set({ error: error.message }); throw error }
    const nova = data as FotoMedicao
    set(s => ({ fotos: [...s.fotos, nova] }))
    return nova
  },
  atualizarFoto: async (id, data) => {
    const { error } = await supabase.from('fotos_medicao').update(data).eq('id', id)
    if (error) { set({ error: error.message }); throw error }
    set(s => ({ fotos: s.fotos.map(f => f.id === id ? { ...f, ...data } : f) }))
  },
  deletarFoto: async (id) => {
    const { error } = await supabase.from('fotos_medicao').delete().eq('id', id)
    if (error) { set({ error: error.message }); throw error }
    set(s => ({ fotos: s.fotos.filter(f => f.id !== id) }))
  },

  // ── LOGOS ─────────────────────────────────────────────────────────────────────
  fetchLogos: async () => {
    const { data, error } = await supabase.from('logos_sistema').select('*').order('created_at')
    if (error) { set({ error: error.message }); return }
    set({ logos: (data || []) as LogoSistema[] })
  },
  adicionarLogo: async (logo) => {
    const user = (await supabase.auth.getUser()).data.user
    const { data, error } = await supabase.from('logos_sistema').insert({ ...logo, criado_por: user?.id }).select().single()
    if (error) { set({ error: error.message }); throw error }
    const nova = data as LogoSistema
    set(s => ({ logos: [...s.logos, nova] }))
    return nova
  },
  deletarLogo: async (id) => {
    const { error } = await supabase.from('logos_sistema').delete().eq('id', id)
    if (error) { set({ error: error.message }); throw error }
    set(s => ({ logos: s.logos.filter(l => l.id !== id) }))
  },
  setLogoSelecionada: (base64) => set({ logoSelecionada: base64 }),
}))
