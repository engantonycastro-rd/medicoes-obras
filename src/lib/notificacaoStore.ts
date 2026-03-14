import { create } from 'zustand'
import { supabase } from './supabase'

export interface Notificacao {
  id: string
  created_at: string
  user_id: string
  tipo: 'info' | 'sucesso' | 'alerta' | 'erro'
  titulo: string
  mensagem: string | null
  lida: boolean
  link: string | null
}

interface NotificacaoStore {
  notificacoes: Notificacao[]
  naoLidas: number
  loading: boolean

  fetchNotificacoes: () => Promise<void>
  marcarComoLida: (id: string) => Promise<void>
  marcarTodasComoLidas: () => Promise<void>
  deletarNotificacao: (id: string) => Promise<void>
  limparLidas: () => Promise<void>

  // Helpers para criar notificações via RPC
  notificarUsuario: (userId: string, tipo: Notificacao['tipo'], titulo: string, mensagem?: string, link?: string) => Promise<void>
  notificarAdmins: (tipo: Notificacao['tipo'], titulo: string, mensagem?: string, link?: string) => Promise<void>
  notificarEquipe: (gestorId: string, tipo: Notificacao['tipo'], titulo: string, mensagem?: string, link?: string) => Promise<void>

  // Realtime
  iniciarRealtime: () => void
  pararRealtime: () => void
}

let realtimeChannel: any = null

export const useNotificacaoStore = create<NotificacaoStore>((set, get) => ({
  notificacoes: [],
  naoLidas: 0,
  loading: false,

  fetchNotificacoes: async () => {
    set({ loading: true })
    const { data, error } = await supabase
      .from('notificacoes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) { console.warn('Erro fetch notificações:', error.message); set({ loading: false }); return }
    const notifs = (data || []) as Notificacao[]
    set({
      notificacoes: notifs,
      naoLidas: notifs.filter(n => !n.lida).length,
      loading: false,
    })
  },

  marcarComoLida: async (id) => {
    await supabase.from('notificacoes').update({ lida: true }).eq('id', id)
    set(s => {
      const notificacoes = s.notificacoes.map(n => n.id === id ? { ...n, lida: true } : n)
      return { notificacoes, naoLidas: notificacoes.filter(n => !n.lida).length }
    })
  },

  marcarTodasComoLidas: async () => {
    const ids = get().notificacoes.filter(n => !n.lida).map(n => n.id)
    if (ids.length === 0) return
    await supabase.from('notificacoes').update({ lida: true }).in('id', ids)
    set(s => ({
      notificacoes: s.notificacoes.map(n => ({ ...n, lida: true })),
      naoLidas: 0,
    }))
  },

  deletarNotificacao: async (id) => {
    await supabase.from('notificacoes').delete().eq('id', id)
    set(s => {
      const notificacoes = s.notificacoes.filter(n => n.id !== id)
      return { notificacoes, naoLidas: notificacoes.filter(n => !n.lida).length }
    })
  },

  limparLidas: async () => {
    const ids = get().notificacoes.filter(n => n.lida).map(n => n.id)
    if (ids.length === 0) return
    for (const id of ids) await supabase.from('notificacoes').delete().eq('id', id)
    set(s => ({
      notificacoes: s.notificacoes.filter(n => !n.lida),
    }))
  },

  notificarUsuario: async (userId, tipo, titulo, mensagem, link) => {
    await supabase.rpc('criar_notificacao', {
      p_user_id: userId, p_tipo: tipo, p_titulo: titulo,
      p_mensagem: mensagem || null, p_link: link || null,
    })
  },

  notificarAdmins: async (tipo, titulo, mensagem, link) => {
    await supabase.rpc('notificar_admins', {
      p_tipo: tipo, p_titulo: titulo,
      p_mensagem: mensagem || null, p_link: link || null,
    })
  },

  notificarEquipe: async (gestorId, tipo, titulo, mensagem, link) => {
    await supabase.rpc('notificar_equipe', {
      p_gestor_id: gestorId, p_tipo: tipo, p_titulo: titulo,
      p_mensagem: mensagem || null, p_link: link || null,
    })
  },

  iniciarRealtime: () => {
    if (realtimeChannel) return
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      realtimeChannel = supabase
        .channel('notificacoes-realtime')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'notificacoes',
          filter: `user_id=eq.${user.id}`,
        }, (payload) => {
          const nova = payload.new as Notificacao
          set(s => ({
            notificacoes: [nova, ...s.notificacoes].slice(0, 50),
            naoLidas: s.naoLidas + 1,
          }))
        })
        .subscribe()
    })
  },

  pararRealtime: () => {
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel)
      realtimeChannel = null
    }
  },
}))
