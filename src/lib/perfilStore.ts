import { create } from 'zustand'
import { Perfil } from '../types'
import { supabase } from './supabase'

interface PerfilStore {
  perfilAtual: Perfil | null
  perfis: Perfil[]
  loading: boolean
  error: string | null

  fetchPerfilAtual: () => Promise<Perfil | null>
  fetchTodosPerfis: () => Promise<void>
  ativarUsuario: (userId: string) => Promise<void>
  desativarUsuario: (userId: string) => Promise<void>
  alterarRole: (userId: string, role: 'ADMIN' | 'GESTOR' | 'ENGENHEIRO' | 'APONTADOR') => Promise<void>
  atualizarNome: (userId: string, nome: string) => Promise<void>
  atribuirGestor: (userId: string, gestorId: string | null) => Promise<void>
}

export const usePerfilStore = create<PerfilStore>((set) => ({
  perfilAtual: null,
  perfis: [],
  loading: false,
  error: null,

  fetchPerfilAtual: async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await supabase
      .from('perfis')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()

    if (error) {
      console.warn('Erro ao buscar perfil:', error.message)
    }

    if (!data) {
      const { data: criado } = await supabase.from('perfis').upsert({
        id: user.id,
        email: user.email || '',
        role: 'ENGENHEIRO',
        ativo: false,
      }, { onConflict: 'id' }).select().maybeSingle()

      const novo = criado as Perfil | null
      set({ perfilAtual: novo })
      return novo
    }

    set({ perfilAtual: data as Perfil })
    return data as Perfil
  },

  fetchTodosPerfis: async () => {
    set({ loading: true, error: null })
    const { data, error } = await supabase
      .from('perfis')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Erro fetchTodosPerfis:', error.message)
      set({ error: error.message, loading: false })
      return
    }
    set({ perfis: (data || []) as Perfil[], loading: false })
  },

  ativarUsuario: async (userId) => {
    const { error } = await supabase
      .from('perfis').update({ ativo: true }).eq('id', userId)
    if (error) { set({ error: error.message }); throw error }
    set(s => ({ perfis: s.perfis.map(p => p.id === userId ? { ...p, ativo: true } : p) }))
    // Notifica o usuário ativado
    try { await supabase.rpc('criar_notificacao', {
      p_user_id: userId, p_tipo: 'sucesso',
      p_titulo: 'Acesso liberado!',
      p_mensagem: 'Seu cadastro foi aprovado. Bem-vindo ao sistema!',
      p_link: '/',
    }) } catch {}
  },

  desativarUsuario: async (userId) => {
    const { error } = await supabase
      .from('perfis').update({ ativo: false }).eq('id', userId)
    if (error) { set({ error: error.message }); throw error }
    set(s => ({ perfis: s.perfis.map(p => p.id === userId ? { ...p, ativo: false } : p) }))
  },

  alterarRole: async (userId, role) => {
    // Se está saindo de GESTOR, limpa gestor_id dos membros da equipe
    const state = usePerfilStore.getState()
    const antigoRole = state.perfis.find(p => p.id === userId)?.role
    if (antigoRole === 'GESTOR' && role !== 'GESTOR') {
      await supabase.from('perfis').update({ gestor_id: null }).eq('gestor_id', userId)
    }
    // Se está virando GESTOR, limpa seu próprio gestor_id (não pode ter gestor)
    const updates: Record<string, any> = { role }
    if (role === 'GESTOR' || role === 'ADMIN') updates.gestor_id = null

    const { error } = await supabase.from('perfis').update(updates).eq('id', userId)
    if (error) { set({ error: error.message }); throw error }

    set(s => ({
      perfis: s.perfis.map(p => {
        if (p.id === userId) return { ...p, ...updates }
        // Se removeu GESTOR, limpa membros
        if (antigoRole === 'GESTOR' && role !== 'GESTOR' && p.gestor_id === userId) return { ...p, gestor_id: null }
        return p
      }),
    }))
  },

  atualizarNome: async (userId, nome) => {
    const { error } = await supabase
      .from('perfis').update({ nome }).eq('id', userId)
    if (error) { set({ error: error.message }); throw error }
    set(s => ({
      perfis: s.perfis.map(p => p.id === userId ? { ...p, nome } : p),
      perfilAtual: s.perfilAtual?.id === userId ? { ...s.perfilAtual, nome } : s.perfilAtual,
    }))
  },

  atribuirGestor: async (userId, gestorId) => {
    const { error } = await supabase.from('perfis').update({ gestor_id: gestorId }).eq('id', userId)
    if (error) { set({ error: error.message }); throw error }
    set(s => ({
      perfis: s.perfis.map(p => p.id === userId ? { ...p, gestor_id: gestorId } : p),
    }))
  },
}))