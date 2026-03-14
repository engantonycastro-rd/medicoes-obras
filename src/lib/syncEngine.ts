import { supabase } from './supabase'
import {
  getApontamentosPendentes, atualizarStatusApt,
  getFotosBySyncId, atualizarStatusFoto, countPendentes,
  cacheObras, cacheFuncoes, cacheKanbanItens,
} from './offlineStore'

type SyncCallback = (status: { pendentes: number; sincronizando: boolean; online: boolean; erro?: string }) => void

let listeners: SyncCallback[] = []
let syncing = false
let online = typeof navigator !== 'undefined' ? navigator.onLine : true

function sanitize(name: string): string {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_')
}

// ─── Notificar listeners ──────────────────────────────────────────────────

async function notify(extra?: { erro?: string }) {
  const pendentes = await countPendentes()
  listeners.forEach(cb => cb({ pendentes, sincronizando: syncing, online, erro: extra?.erro }))
}

export function onSyncStatus(cb: SyncCallback) {
  listeners.push(cb)
  notify()
  return () => { listeners = listeners.filter(l => l !== cb) }
}

// ─── Detectar conectividade ───────────────────────────────────────────────

export function initConnectivityListener() {
  window.addEventListener('online', () => { online = true; notify(); syncAll() })
  window.addEventListener('offline', () => { online = false; notify() })
  // Verifica a cada 30s
  setInterval(async () => {
    try {
      const r = await fetch('/favicon.ico', { method: 'HEAD', cache: 'no-store' })
      const wasOffline = !online
      online = r.ok
      if (wasOffline && online) syncAll()
    } catch { online = false }
    notify()
  }, 30000)
}

// ─── Sincronizar tudo ─────────────────────────────────────────────────────

export async function syncAll(): Promise<void> {
  if (syncing || !online) return
  syncing = true; notify()

  try {
    const pendentes = await getApontamentosPendentes()
    for (const apt of pendentes) {
      try {
        await atualizarStatusApt(apt.sync_id, 'SINCRONIZANDO')
        notify()

        // 1. Cria apontamento no Supabase
        const { data: created, error } = await supabase.from('apontamentos').insert({
          obra_id: apt.obra_id, apontador_id: (await supabase.auth.getUser()).data.user?.id,
          data: apt.data, hora: apt.hora, turno: apt.turno, clima: apt.clima,
          latitude: apt.latitude, longitude: apt.longitude,
          atividades: apt.atividades || null, equipamentos: apt.equipamentos || null,
          ocorrencias: apt.ocorrencias, observacoes: apt.observacoes || null,
          sync_id: apt.sync_id,
        }).select().single()

        if (error) throw error

        // 2. Mão de obra
        const moRows = apt.mao_obra.filter(m => m.quantidade > 0).map(m => ({
          apontamento_id: created.id, funcao_id: m.funcao_id, quantidade: m.quantidade,
        }))
        if (moRows.length > 0) await supabase.from('apontamento_mao_obra').insert(moRows)

        // 3. PQE
        const pqeRows = apt.pqe.filter(p => p.status).map(p => ({
          apontamento_id: created.id, kanban_item_id: p.kanban_item_id,
          status: p.status, observacao: p.observacao || null,
        }))
        if (pqeRows.length > 0) await supabase.from('apontamento_pqe').insert(pqeRows)

        // 4. Fotos
        const fotos = await getFotosBySyncId(apt.sync_id)
        for (const foto of fotos) {
          try {
            const path = `fotos/${Date.now()}_${sanitize(foto.nome)}`
            const { error: upErr } = await supabase.storage.from('apontamentos').upload(path, foto.blob)
            if (upErr) throw upErr

            await supabase.from('apontamento_fotos').insert({
              apontamento_id: created.id, url: path, path, nome: foto.nome, legenda: foto.legenda,
            })
            await atualizarStatusFoto(foto.id, 'SINCRONIZADO')
          } catch (fErr: any) {
            console.warn('Erro upload foto:', fErr)
          }
        }

        await atualizarStatusApt(apt.sync_id, 'SINCRONIZADO')
      } catch (err: any) {
        console.error('Erro sync apontamento:', err)
        await atualizarStatusApt(apt.sync_id, 'ERRO', err.message)
      }
      notify()
    }
  } finally {
    syncing = false; notify()
  }
}

// ─── Cache de dados para uso offline ──────────────────────────────────────

export async function syncCacheFromServer(userId: string): Promise<void> {
  try {
    // 1. Get obra IDs vinculadas ao apontador
    const { data: vinculos, error: vErr } = await supabase.from('apontador_obras').select('obra_id').eq('user_id', userId)
    if (vErr) { console.warn('Erro vinculos:', vErr); return }
    if (!vinculos || vinculos.length === 0) { console.log('Nenhuma obra vinculada'); return }

    const obraIds = vinculos.map((v: any) => v.obra_id)

    // 2. Buscar dados das obras separadamente (evita JOIN com RLS)
    const { data: obrasData } = await supabase.from('obras').select('id, nome_obra, local_obra, contrato_id').in('id', obraIds)
    if (obrasData && obrasData.length > 0) {
      const contratoIds = [...new Set(obrasData.map((o: any) => o.contrato_id).filter(Boolean))]
      let contratoMap: Record<string, string> = {}
      if (contratoIds.length > 0) {
        const { data: cData } = await supabase.from('contratos').select('id, nome_obra').in('id', contratoIds)
        if (cData) cData.forEach((c: any) => { contratoMap[c.id] = c.nome_obra })
      }
      const obras = obrasData.map((o: any) => ({
        id: o.id, nome_obra: o.nome_obra, local_obra: o.local_obra,
        contrato_nome: contratoMap[o.contrato_id] || '',
      }))
      await cacheObras(obras)
    }

    // 3. Funções de mão de obra
    const { data: funcoes } = await supabase.from('funcoes_mao_obra').select('id, nome, ordem').eq('ativo', true).order('ordem')
    if (funcoes) await cacheFuncoes(funcoes)

    // 4. Kanban itens em execução (para PQE)
    const { data: cards } = await supabase.from('kanban_cards').select('id, obra_id').in('obra_id', obraIds).eq('status', 'EM_EXECUCAO')
    if (cards && cards.length > 0) {
      const cardIds = cards.map((c: any) => c.id)
      const { data: itens } = await supabase.from('kanban_itens').select('id, card_id, descricao').in('card_id', cardIds)
      if (itens) {
        const cardObraMap = new Map(cards.map((c: any) => [c.id, c.obra_id]))
        await cacheKanbanItens(itens.map((i: any) => ({ ...i, obra_id: cardObraMap.get(i.card_id) || '' })))
      }
    }
  } catch (err) { console.warn('Erro ao cachear dados:', err) }
}