import { openDB, DBSchema, IDBPDatabase } from 'idb'

// ─── Schema ────────────────────────────────────────────────────────────────

interface AppDB extends DBSchema {
  'obras-cache': { key: string; value: { id: string; nome_obra: string; local_obra: string; contrato_nome: string } }
  'funcoes-cache': { key: string; value: { id: string; nome: string; ordem: number } }
  'kanban-cache': { key: string; value: { id: string; card_id: string; descricao: string; obra_id: string } }
  'apontamentos-offline': {
    key: string
    value: {
      sync_id: string; obra_id: string; data: string; hora: string
      turno: string; clima: string; latitude: number | null; longitude: number | null
      atividades: string; equipamentos: string; ocorrencias: any[]
      observacoes: string; mao_obra: { funcao_id: string; funcao_nome: string; quantidade: number }[]
      pqe: { kanban_item_id: string; descricao: string; status: string; observacao: string }[]
      created_at: string; status: 'PENDENTE' | 'SINCRONIZANDO' | 'SINCRONIZADO' | 'ERRO'
      erro?: string
    }
    indexes: { 'by-status': string; 'by-obra': string }
  }
  'fotos-offline': {
    key: string
    value: {
      id: string; sync_id: string; blob: Blob; nome: string; legenda: string
      mimeType?: string
      status: 'PENDENTE' | 'SINCRONIZADO' | 'ERRO'
    }
    indexes: { 'by-sync': string; 'by-status': string }
  }
}

let dbInstance: IDBPDatabase<AppDB> | null = null

export async function getDB(): Promise<IDBPDatabase<AppDB>> {
  if (dbInstance) return dbInstance
  try {
    dbInstance = await openDB<AppDB>('rd-apontamentos', 2, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('obras-cache')) db.createObjectStore('obras-cache', { keyPath: 'id' })
        if (!db.objectStoreNames.contains('funcoes-cache')) db.createObjectStore('funcoes-cache', { keyPath: 'id' })
        if (!db.objectStoreNames.contains('kanban-cache')) db.createObjectStore('kanban-cache', { keyPath: 'id' })
        if (!db.objectStoreNames.contains('apontamentos-offline')) {
          const s = db.createObjectStore('apontamentos-offline', { keyPath: 'sync_id' })
          s.createIndex('by-status', 'status')
          s.createIndex('by-obra', 'obra_id')
        }
        if (!db.objectStoreNames.contains('fotos-offline')) {
          const s = db.createObjectStore('fotos-offline', { keyPath: 'id' })
          s.createIndex('by-sync', 'sync_id')
          s.createIndex('by-status', 'status')
        }
      },
    })
  } catch (err) {
    console.warn('IndexedDB não disponível:', err)
    throw err
  }
  return dbInstance
}

// ─── Cache: obras, funções, kanban ─────────────────────────────────────────

export async function cacheObras(obras: any[]) {
  const db = await getDB()
  const tx = db.transaction('obras-cache', 'readwrite')
  await tx.store.clear()
  for (const o of obras) await tx.store.put(o)
  await tx.done
}
export async function getCachedObras() {
  return (await getDB()).getAll('obras-cache')
}

export async function cacheFuncoes(funcoes: any[]) {
  const db = await getDB()
  const tx = db.transaction('funcoes-cache', 'readwrite')
  await tx.store.clear()
  for (const f of funcoes) await tx.store.put(f)
  await tx.done
}
export async function getCachedFuncoes() {
  return (await getDB()).getAll('funcoes-cache')
}

export async function cacheKanbanItens(itens: any[]) {
  const db = await getDB()
  const tx = db.transaction('kanban-cache', 'readwrite')
  await tx.store.clear()
  for (const i of itens) await tx.store.put(i)
  await tx.done
}
export async function getCachedKanbanItens(obraId: string) {
  const all = await (await getDB()).getAll('kanban-cache')
  return all.filter(i => i.obra_id === obraId)
}

// ─── Apontamentos offline ──────────────────────────────────────────────────

export async function salvarApontamentoOffline(apt: AppDB['apontamentos-offline']['value']) {
  const db = await getDB()
  await db.put('apontamentos-offline', apt)
}

export async function getApontamentosPendentes() {
  const db = await getDB()
  return db.getAllFromIndex('apontamentos-offline', 'by-status', 'PENDENTE')
}

export async function getApontamentosComErro() {
  const db = await getDB()
  return db.getAllFromIndex('apontamentos-offline', 'by-status', 'ERRO')
}

export async function getApontamentosOffline(obraId?: string) {
  const db = await getDB()
  if (obraId) return db.getAllFromIndex('apontamentos-offline', 'by-obra', obraId)
  return db.getAll('apontamentos-offline')
}

export async function atualizarStatusApt(syncId: string, status: string, erro?: string) {
  const db = await getDB()
  const apt = await db.get('apontamentos-offline', syncId)
  if (apt) { apt.status = status as any; apt.erro = erro; await db.put('apontamentos-offline', apt) }
}

export async function countPendentes(): Promise<number> {
  const db = await getDB()
  const pend = await db.countFromIndex('apontamentos-offline', 'by-status', 'PENDENTE')
  const erro = await db.countFromIndex('apontamentos-offline', 'by-status', 'ERRO')
  return pend + erro
}

// ─── Fotos offline ─────────────────────────────────────────────────────────

export async function salvarFotoOffline(foto: AppDB['fotos-offline']['value']) {
  await (await getDB()).put('fotos-offline', foto)
}

export async function getFotosPendentes() {
  return (await getDB()).getAllFromIndex('fotos-offline', 'by-status', 'PENDENTE')
}

export async function getFotosBySyncId(syncId: string) {
  return (await getDB()).getAllFromIndex('fotos-offline', 'by-sync', syncId)
}

export async function atualizarStatusFoto(id: string, status: string) {
  const db = await getDB()
  const f = await db.get('fotos-offline', id)
  if (f) { f.status = status as any; await db.put('fotos-offline', f) }
}
