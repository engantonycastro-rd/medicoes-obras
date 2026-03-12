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
  moverObra:     (obraId: string, novoContratoId: string) => Promise<void>

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
  importarMedicaoAnterior: (obraId: string, contratoId: string, numero: number, items: {item:string;quantidade:number}[]) => Promise<Medicao>

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
  moverObra: async (obraId, novoContratoId) => {
    const { error } = await supabase.from('obras').update({ contrato_id: novoContratoId }).eq('id', obraId)
    if (error) { set({ error: error.message }); throw error }
    // Atualiza também os serviços e medições vinculados
    await supabase.from('servicos').update({ contrato_id: novoContratoId }).eq('obra_id', obraId)
    await supabase.from('medicoes').update({ contrato_id: novoContratoId }).eq('obra_id', obraId)
  },

  // ── SERVIÇOS ──────────────────────────────────────────────────────────────────
  fetchServicos: async (obraId) => {
    const { data, error } = await supabase.from('servicos').select('*').eq('obra_id', obraId).order('ordem')
    if (error) { set({ error: error.message }); return }
    set({ servicos: (data || []) as Servico[] })
  },
  salvarServicos: async (obraId, contratoId, importados) => {
    set({ loading: true })

    // 1. Deleta serviços existentes (verifica erro)
    const { error: delErr } = await supabase.from('servicos').delete().eq('obra_id', obraId)
    if (delErr) {
      console.warn('Erro ao limpar serviços antigos (pode ser obra nova):', delErr.message)
      // Tenta com RPC se RLS bloquear
      try {
        await supabase.rpc('delete_servicos_obra', { p_obra_id: obraId })
      } catch {}
    }

    // 2. Deduplica por item (mantém a primeira ocorrência)
    const seen = new Set<string>()
    const unicos = importados.filter(s => {
      const key = s.item.trim()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    // 3. Monta rows com valores explícitos (nunca undefined)
    const rows = unicos.map(s => ({
      contrato_id: contratoId,
      obra_id: obraId,
      item: s.item,
      fonte: s.fonte || 'SINAPI',
      codigo: s.codigo || null,
      descricao: s.descricao,
      unidade: s.unidade || 'UN',
      quantidade: s.quantidade ?? 0,
      preco_unitario: s.preco_unitario ?? 0,
      is_grupo: s.is_grupo ?? false,
      grupo_item: s.grupo_item ?? null,
      ordem: s.ordem ?? 0,
    }))

    // 4. Insere em chunks de 50 para evitar limites do Supabase
    const CHUNK = 50
    let allData: any[] = []
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK)
      const { data, error } = await supabase.from('servicos').insert(chunk).select()
      if (error) {
        set({ error: `Erro ao importar (lote ${Math.floor(i/CHUNK)+1}): ${error.message}`, loading: false })
        throw error
      }
      if (data) allData = [...allData, ...data]
    }

    set({ servicos: allData as Servico[], loading: false })
  },

  // ── MEDIÇÕES ──────────────────────────────────────────────────────────────────
  fetchMedicoes: async (obraId) => {
    const { data, error } = await supabase.from('medicoes').select('*').eq('obra_id', obraId).order('numero')
    if (error) { set({ error: error.message }); return [] }
    return (data || []) as Medicao[]
  },
  setMedicaoAtiva: (m) => set({ medicaoAtiva: m }),
  criarMedicao: async (obraId, contratoId) => {
    set({ error: null })
    const medicoes = await get().fetchMedicoes(obraId)
    const num = (medicoes.length || 0) + 1
    const ord = ['1ª','2ª','3ª','4ª','5ª','6ª','7ª','8ª','9ª','10ª','11ª','12ª','13ª','14ª','15ª']
    const { data, error } = await supabase.from('medicoes').insert({
      contrato_id: contratoId, obra_id: obraId, numero: num,
      numero_extenso: ord[num-1] || `${num}ª`,
      data_medicao: new Date().toISOString().split('T')[0], status: 'RASCUNHO',
    }).select().single()
    if (error) { set({ error: error.message }); throw error }
    supabase.rpc('notificar_admins', {
      p_tipo: 'info', p_titulo: `${ord[num-1] || num+'ª'} Medição criada`,
      p_mensagem: `Nova medição iniciada na obra`, p_link: '/medicoes',
    }).then(() => {}).catch(() => {})
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
    // Notifica admins (fire-and-forget)
    supabase.rpc('notificar_admins', {
      p_tipo: 'sucesso', p_titulo: 'Medição efetivada',
      p_mensagem: 'Uma medição foi aprovada/efetivada', p_link: '/medicoes',
    }).catch(() => {})
  },
  deletarMedicao: async (id) => {
    set({ error: null })
    const { error } = await supabase.from('medicoes').delete().eq('id', id)
    if (error) { set({ error: error.message }); throw error }
  },

  importarMedicaoAnterior: async (obraId, contratoId, numero, items) => {
    set({ loading: true })
    const ord = ['1ª','2ª','3ª','4ª','5ª','6ª','7ª','8ª','9ª','10ª','11ª','12ª','13ª','14ª','15ª']

    // 1. Cria a medição como APROVADA
    const { data: medData, error: medErr } = await supabase.from('medicoes').insert({
      contrato_id: contratoId, obra_id: obraId, numero,
      numero_extenso: ord[numero-1] || `${numero}ª`,
      data_medicao: new Date().toISOString().split('T')[0],
      status: 'APROVADA',
      observacoes: 'Medição anterior importada',
    }).select().single()
    if (medErr) { set({ error: medErr.message, loading: false }); throw medErr }
    const medicao = medData as Medicao

    // 2. Busca serviços da obra para mapear item → servico_id
    const { data: servData } = await supabase.from('servicos').select('*').eq('obra_id', obraId)
    const servicos = (servData || []) as Array<{ id: string; item: string; is_grupo: boolean; quantidade: number }>

    const servicoMap = new Map<string, typeof servicos[0]>()
    for (const s of servicos) servicoMap.set(s.item, s)

    // 3. Cria linhas de memória como "Pago"
    const linhas: any[] = []
    let ignorados = 0
    for (const imp of items) {
      const srv = servicoMap.get(imp.item)
      if (!srv || srv.is_grupo) { ignorados++; continue }

      linhas.push({
        medicao_id: medicao.id,
        servico_id: srv.id,
        sub_item: `${imp.item}.1`,
        descricao_calculo: 'MEDIÇÃO ANTERIOR',
        largura: null, comprimento: null, altura: null,
        perimetro: null, area: null, volume: null,
        kg: null, outros: null, desconto_dim: null,
        quantidade: imp.quantidade,
        total: imp.quantidade,
        status: 'Pago',
        observacao: 'Importado de medição anterior',
      })
    }

    if (linhas.length > 0) {
      for (let i = 0; i < linhas.length; i += 50) {
        const { error } = await supabase.from('linhas_memoria').insert(linhas.slice(i, i + 50))
        if (error) { set({ error: error.message, loading: false }); throw error }
      }
    }

    set({ loading: false })
    return medicao
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