import { useEffect, useState, useRef } from 'react'
import {
  FolderOpen, Upload, Trash2, Download, Image, FileText, Briefcase,
  Camera, Loader2, Eye, X, RefreshCw,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '../lib/store'
import { usePerfilStore } from '../lib/perfilStore'
import { supabase } from '../lib/supabase'
import { ObraSelectorBar } from '../components/ObraSelectorBar'
import { formatDate } from '../utils/calculations'

interface Documento {
  id: string; obra_id: string; pasta: string; nome_arquivo: string
  url: string; tamanho_bytes: number; tipo_mime: string | null
  origem: string; apontamento_id: string | null; observacao: string | null
  uploaded_by: string | null; created_at: string
}

const PASTAS = [
  { key: 'fotos', label: 'Fotos da Obra', icon: Camera, color: 'from-emerald-500 to-emerald-600', accept: 'image/*' },
  { key: 'projetos', label: 'Projetos', icon: FileText, color: 'from-blue-500 to-blue-600', accept: '.pdf,.dwg,.dxf,.xlsx,.xls,.docx,.doc,.png,.jpg,.jpeg' },
  { key: 'administrativos', label: 'Doc. Administrativos', icon: Briefcase, color: 'from-purple-500 to-purple-600', accept: '.pdf,.xlsx,.xls,.docx,.doc,.png,.jpg,.jpeg,.txt' },
]

const BUCKET = 'obra-documentos'
const MAX_FILE_MB = 50

export function RepositorioObrasPage() {
  const { obraAtiva, contratoAtivo } = useStore()
  const { perfilAtual } = usePerfilStore()
  const [documentos, setDocumentos] = useState<Documento[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [pastaAtiva, setPastaAtiva] = useState('fotos')
  const [importandoFotos, setImportandoFotos] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (obraAtiva) fetchDocumentos()
  }, [obraAtiva])

  async function fetchDocumentos() {
    if (!obraAtiva) return
    setLoading(true)
    const { data } = await supabase.from('obra_documentos')
      .select('*').eq('obra_id', obraAtiva.id).order('created_at', { ascending: false })
    setDocumentos((data || []) as Documento[])
    setLoading(false)
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || !obraAtiva) return
    setUploading(true)
    let ok = 0
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        toast.error(`${file.name} excede ${MAX_FILE_MB}MB`)
        continue
      }
      const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
      const path = `${obraAtiva.id}/${pastaAtiva}/${Date.now()}_${Math.random().toString(36).slice(2,8)}.${ext}`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type })
      if (upErr) { toast.error(`Erro ao enviar ${file.name}`); continue }

      // Gera signed URL (1 ano)
      const { data: signedData } = await supabase.storage.from(BUCKET).createSignedUrl(path, 365 * 24 * 3600)
      const url = signedData?.signedUrl || ''

      const { error: dbErr } = await supabase.from('obra_documentos').insert({
        obra_id: obraAtiva.id, pasta: pastaAtiva,
        nome_arquivo: file.name, url, tamanho_bytes: file.size,
        tipo_mime: file.type, origem: 'upload',
        uploaded_by: perfilAtual?.id || null,
      })
      if (dbErr) { toast.error(`Erro ao registrar ${file.name}`); continue }
      ok++
    }
    if (ok > 0) { toast.success(`${ok} arquivo(s) enviado(s)!`); fetchDocumentos() }
    setUploading(false)
    e.target.value = ''
  }

  async function importarFotosApontamento() {
    if (!obraAtiva) return
    setImportandoFotos(true)
    try {
      // Busca apontamentos com foto desta obra
      const { data: aponts } = await supabase.from('apontamentos')
        .select('id, foto_url, foto_path, data, descricao')
        .eq('obra_id', obraAtiva.id)
        .not('foto_url', 'is', null)

      if (!aponts || aponts.length === 0) {
        toast('Nenhum apontamento com foto nesta obra', { icon: 'ℹ️' })
        setImportandoFotos(false); return
      }

      // Verifica quais já foram importados
      const idsExistentes = new Set(documentos.filter(d => d.apontamento_id).map(d => d.apontamento_id))
      const novos = aponts.filter((a: any) => !idsExistentes.has(a.id))

      if (novos.length === 0) {
        toast('Todas as fotos já foram importadas', { icon: '✅' })
        setImportandoFotos(false); return
      }

      let ok = 0
      for (const ap of novos as any[]) {
        // Gera signed URL para a foto
        let url = ap.foto_url
        if (ap.foto_path) {
          const { data: sig } = await supabase.storage.from('apontamentos').createSignedUrl(ap.foto_path, 365 * 24 * 3600)
          if (sig?.signedUrl) url = sig.signedUrl
        }

        const { error } = await supabase.from('obra_documentos').insert({
          obra_id: obraAtiva.id, pasta: 'fotos',
          nome_arquivo: `Apontamento ${formatDate(ap.data)} - ${(ap.descricao || '').slice(0, 50)}`,
          url, tamanho_bytes: 0, tipo_mime: 'image/jpeg',
          origem: 'apontamento', apontamento_id: ap.id,
          uploaded_by: perfilAtual?.id || null,
        })
        if (!error) ok++
      }
      toast.success(`${ok} foto(s) importada(s) dos apontamentos!`)
      fetchDocumentos()
    } catch (err: any) { toast.error(err?.message || 'Erro ao importar') }
    setImportandoFotos(false)
  }

  async function excluirDoc(doc: Documento) {
    if (!confirm(`Excluir "${doc.nome_arquivo}"?`)) return
    // Tenta deletar do storage (se foi upload nosso)
    if (doc.origem === 'upload' && doc.url) {
      try {
        const pathMatch = doc.url.match(/obra-documentos\/(.+?)\?/)
        if (pathMatch) await supabase.storage.from(BUCKET).remove([pathMatch[1]])
      } catch {}
    }
    await supabase.from('obra_documentos').delete().eq('id', doc.id)
    setDocumentos(prev => prev.filter(d => d.id !== doc.id))
    toast.success('Arquivo excluído')
  }

  function formatSize(bytes: number) {
    if (!bytes) return '—'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / 1048576).toFixed(1)} MB`
  }

  function isImage(mime: string | null, nome: string) {
    if (mime?.startsWith('image/')) return true
    return /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(nome)
  }

  const pastaInfo = PASTAS.find(p => p.key === pastaAtiva)!
  const docsFiltrados = documentos.filter(d => d.pasta === pastaAtiva)

  if (!obraAtiva || !contratoAtivo) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white mb-2 flex items-center gap-2">
          <FolderOpen size={24} className="text-primary-500"/> Repositório de Documentos
        </h1>
        <p className="text-sm text-slate-500 mb-4">Selecione a obra para acessar os documentos</p>
        <ObraSelectorBar />
      </div>
    )
  }

  return (
    <div className="p-8 max-w-6xl">
      <ObraSelectorBar />

      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs text-slate-400 mb-0.5">{contratoAtivo.nome_obra} › <span className="text-primary-600 font-medium">{obraAtiva.nome_obra}</span></p>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <FolderOpen size={24} className="text-primary-500"/> Repositório
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">{documentos.length} arquivo(s)</span>
          <button onClick={fetchDocumentos} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
            <RefreshCw size={14}/>
          </button>
        </div>
      </div>

      {/* Pasta tabs */}
      <div className="flex gap-3 mb-6">
        {PASTAS.map(p => {
          const qtd = documentos.filter(d => d.pasta === p.key).length
          const ativo = pastaAtiva === p.key
          return (
            <button key={p.key} onClick={() => setPastaAtiva(p.key)}
              className={`flex items-center gap-2.5 px-5 py-3 rounded-xl text-sm font-medium transition-all ${
                ativo
                  ? 'bg-gradient-to-br ' + p.color + ' text-white shadow-lg'
                  : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
              }`}>
              <p.icon size={16}/>
              <span>{p.label}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${ativo ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-700'}`}>{qtd}</span>
            </button>
          )
        })}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-medium rounded-lg disabled:opacity-50">
          {uploading ? <Loader2 size={14} className="animate-spin"/> : <Upload size={14}/>}
          {uploading ? 'Enviando...' : 'Enviar Arquivos'}
        </button>
        <input ref={fileRef} type="file" multiple accept={pastaInfo.accept} onChange={handleUpload} className="hidden"/>

        {pastaAtiva === 'fotos' && (
          <button onClick={importarFotosApontamento} disabled={importandoFotos}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg disabled:opacity-50">
            {importandoFotos ? <Loader2 size={14} className="animate-spin"/> : <Camera size={14}/>}
            {importandoFotos ? 'Importando...' : 'Importar dos Apontamentos'}
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-16"><Loader2 size={24} className="mx-auto text-slate-400 animate-spin"/></div>
      ) : docsFiltrados.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
          <pastaInfo.icon size={36} className="mx-auto text-slate-300 mb-3"/>
          <p className="text-slate-500 font-medium">Nenhum arquivo em {pastaInfo.label}</p>
          <p className="text-slate-400 text-sm mt-1">Clique em "Enviar Arquivos" para adicionar</p>
        </div>
      ) : pastaAtiva === 'fotos' ? (
        /* Grid de fotos */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {docsFiltrados.map(doc => (
            <div key={doc.id} className="group relative bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
              <div className="aspect-square bg-slate-100 dark:bg-slate-900 flex items-center justify-center cursor-pointer"
                onClick={() => setPreviewUrl(doc.url)}>
                {isImage(doc.tipo_mime, doc.nome_arquivo) ? (
                  <img src={doc.url} alt={doc.nome_arquivo} className="w-full h-full object-cover"/>
                ) : (
                  <FileText size={32} className="text-slate-300"/>
                )}
              </div>
              <div className="p-2">
                <p className="text-[10px] text-slate-600 dark:text-slate-400 truncate font-medium">{doc.nome_arquivo}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[9px] text-slate-400">{formatDate(doc.created_at)}</span>
                  {doc.origem === 'apontamento' && <span className="text-[8px] px-1 bg-amber-100 text-amber-700 rounded">APT</span>}
                </div>
              </div>
              <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                <a href={doc.url} target="_blank" rel="noreferrer"
                  className="p-1.5 bg-white/90 dark:bg-slate-800/90 rounded-lg shadow text-slate-600 hover:text-blue-600">
                  <Download size={12}/>
                </a>
                <button onClick={() => excluirDoc(doc)}
                  className="p-1.5 bg-white/90 dark:bg-slate-800/90 rounded-lg shadow text-slate-600 hover:text-red-600">
                  <Trash2 size={12}/>
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Lista de arquivos */
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900 text-slate-500">
                <th className="px-4 py-2.5 text-left text-xs font-semibold">Arquivo</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold">Tamanho</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold">Data</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {docsFiltrados.map(doc => (
                <tr key={doc.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center shrink-0">
                        {isImage(doc.tipo_mime, doc.nome_arquivo) ? <Image size={14} className="text-emerald-500"/>
                        : <FileText size={14} className="text-blue-500"/>}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-slate-700 dark:text-slate-300 truncate text-xs">{doc.nome_arquivo}</p>
                        {doc.observacao && <p className="text-[10px] text-slate-400 truncate">{doc.observacao}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{formatSize(doc.tamanho_bytes)}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{formatDate(doc.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {isImage(doc.tipo_mime, doc.nome_arquivo) && (
                        <button onClick={() => setPreviewUrl(doc.url)}
                          className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50"><Eye size={14}/></button>
                      )}
                      <a href={doc.url} target="_blank" rel="noreferrer"
                        className="p-1.5 rounded text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"><Download size={14}/></a>
                      <button onClick={() => excluirDoc(doc)}
                        className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"><Trash2 size={14}/></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Lightbox preview */}
      {previewUrl && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setPreviewUrl(null)}>
          <button className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white"><X size={24}/></button>
          <img src={previewUrl} alt="Preview" className="max-w-full max-h-[90vh] rounded-xl shadow-2xl" onClick={e => e.stopPropagation()}/>
        </div>
      )}
    </div>
  )
}
