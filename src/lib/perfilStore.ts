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
  alterarRole: (userId: string, role: 'ADMIN' | 'ENGENHEIRO') => Promise<void>
  atualizarNome: (userId: string, nome: string) => Promise<void>
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
      .maybeSingle()          // não lança erro se não encontrar

    if (error) {
      console.warn('Erro ao buscar perfil:', error.message)
    }

    if (!data) {
      // Perfil não existe → cria como ENGENHEIRO inativo para aparecer na fila do admin
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
    set({ loading: true })
    const { data, error } = await supabase
      .from('perfis')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) { set({ error: error.message, loading: false }); return }
    set({ perfis: (data || []) as Perfil[], loading: false })
  },

  ativarUsuario: async (userId) => {
    const { error } = await supabase
      .from('perfis').update({ ativo: true }).eq('id', userId)
    if (error) { set({ error: error.message }); throw error }
    set(s => ({ perfis: s.perfis.map(p => p.id === userId ? { ...p, ativo: true } : p) }))
  },

  desativarUsuario: async (userId) => {
    const { error } = await supabase
      .from('perfis').update({ ativo: false }).eq('id', userId)
    if (error) { set({ error: error.message }); throw error }
    set(s => ({ perfis: s.perfis.map(p => p.id === userId ? { ...p, ativo: false } : p) }))
  },

  alterarRole: async (userId, role) => {
    const { error } = await supabase
      .from('perfis').update({ role }).eq('id', userId)
    if (error) { set({ error: error.message }); throw error }
    set(s => ({ perfis: s.perfis.map(p => p.id === userId ? { ...p, role } : p) }))
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
}))
