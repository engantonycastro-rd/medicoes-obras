import { useEffect, useState, useMemo } from 'react'
import {
  HelpCircle, Plus, Trash2, Pencil, ChevronDown, ChevronUp, Search,
  Image, Video, Upload, X, Save, Loader2, Eye, Filter, BookOpen,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { usePerfilStore } from '../lib/perfilStore'
import { formatDate } from '../utils/calculations'
import { supabase } from '../lib/supabase'

interface Midia { tipo: 'imagem' | 'video'; url: string; nome: string; path: string }

interface FAQ {
  id: string; created_at: string; titulo: string; categoria: string
  conteudo: string; midias: Midia[]; ordem: number; ativo: boolean
}

const CATEGORIAS_DEFAULT = ['Geral', 'Contratos', 'Obras', 'Medições', 'Serviços', 'Custos ERP', 'Orçamentos', 'Planejamento', 'Usuários', 'Configurações']

export function FAQPage() {
  const { perfilAtual } = usePerfilStore()
  const isAdmin = perfilAtual?.role === 'ADMIN'

  const [faqs, setFaqs] = useState<FAQ[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [catFiltro, setCatFiltro] = useState('todas')
  const [expandido, setExpandido] = useState<string | null>(null)

  // Editor
  const [editando, setEditando] = useState<FAQ | null>(null)
  const [showEditor, setShowEditor] = useState(false)
  const [eTitulo, setETitulo] = useState('')
  const [eCategoria, setECategoria] = useState('Geral')
  const [eConteudo, setEConteudo] = useState('')
  const [eMidias, setEMidias] = useState<Midia[]>([])
  const [uploading, setUploading] = useState(false)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => { fetchFaqs() }, [])

  async function fetchFaqs() {
    setLoading(true)
    const { data } = await supabase.from('faq_tutoriais').select('*').eq('ativo', true).order('ordem').order('created_at')
    if (data) setFaqs(data as FAQ[])
    setLoading(false)
  }

  function abrirEditor(faq?: FAQ) {
    if (faq) {
      setEditando(faq); setETitulo(faq.titulo); setECategoria(faq.categoria)
      setEConteudo(faq.conteudo); setEMidias(Array.isArray(faq.midias) ? faq.midias : [])
    } else {
      setEditando(null); setETitulo(''); setECategoria('Geral'); setEConteudo(''); setEMidias([])
    }
    setShowEditor(true)
  }

  function fecharEditor() { setShowEditor(false); setEditando(null) }

  async function uploadMidia(file: File) {
    setUploading(true)
    try {
      const isVideo = file.type.startsWith('video/')
      const tipo: 'imagem' | 'video' = isVideo ? 'video' : 'imagem'
      const safeName = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_')
      const path = `${tipo}s/${Date.now()}_${safeName}`

      const { error } = await supabase.storage.from('faq').upload(path, file)
      if (error) throw error

      const { data: urlData } = supabase.storage.from('faq').getPublicUrl(path)
      const url = urlData.publicUrl

      setEMidias(prev => [...prev, { tipo, url, nome: file.name, path }])
      toast.success(`${tipo === 'video' ? 'Vídeo' : 'Imagem'} adicionado(a)!`)
    } catch (err: any) { toast.error(err.message || 'Erro no upload') }
    setUploading(false)
  }

  async function removerMidia(idx: number) {
    const m = eMidias[idx]
    if (m.path) await supabase.storage.from('faq').remove([m.path])
    setEMidias(prev => prev.filter((_, i) => i !== idx))
  }

  async function salvar() {
    if (!eTitulo.trim()) { toast.error('Título obrigatório'); return }
    if (!eConteudo.trim()) { toast.error('Conteúdo obrigatório'); return }
    setSalvando(true)
    try {
      const payload = {
        titulo: eTitulo, categoria: eCategoria, conteudo: eConteudo, midias: eMidias,
        criado_por: perfilAtual!.id,
      }
      if (editando) {
        await supabase.from('faq_tutoriais').update(payload).eq('id', editando.id)
        toast.success('Tutorial atualizado!')
      } else {
        const maxOrdem = faqs.length > 0 ? Math.max(...faqs.map(f => f.ordem)) + 1 : 0
        await supabase.from('faq_tutoriais').insert({ ...payload, ordem: maxOrdem })
        toast.success('Tutorial criado!')
      }
      fecharEditor()
      fetchFaqs()
    } catch (err: any) { toast.error(err.message) }
    setSalvando(false)
  }

  async function excluir(faq: FAQ) {
    if (!confirm(`Excluir o tutorial "${faq.titulo}"?`)) return
    if (Array.isArray(faq.midias) && faq.midias.length > 0) {
      await supabase.storage.from('faq').remove(faq.midias.map(m => m.path))
    }
    await supabase.from('faq_tutoriais').delete().eq('id', faq.id)
    setFaqs(prev => prev.filter(f => f.id !== faq.id))
    toast.success('Tutorial excluído!')
  }

  const categorias = useMemo(() => {
    const cats = new Set(faqs.map(f => f.categoria))
    return [...cats].sort()
  }, [faqs])

  const filtrados = useMemo(() => {
    let list = faqs
    if (catFiltro !== 'todas') list = list.filter(f => f.categoria === catFiltro)
    if (busca) {
      const q = busca.toLowerCase()
      list = list.filter(f => f.titulo.toLowerCase().includes(q) || f.conteudo.toLowerCase().includes(q) || f.categoria.toLowerCase().includes(q))
    }
    return list
  }, [faqs, catFiltro, busca])

  return (
    <div className="p-6 max-w-4xl overflow-y-auto" style={{ height: '100%' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-sm">
            <BookOpen size={22} className="text-white"/>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Central de Ajuda</h1>
            <p className="text-sm text-slate-500">Tutoriais e guias do sistema</p>
          </div>
        </div>
        {isAdmin && (
          <button onClick={() => abrirEditor()}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-medium rounded-lg text-sm shadow-sm">
            <Plus size={15}/> Novo Tutorial
          </button>
        )}
      </div>

      {/* Busca + Filtro */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar tutorial..."
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"/>
        </div>
        {categorias.length > 1 && (
          <select value={catFiltro} onChange={e => setCatFiltro(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white min-w-40">
            <option value="todas">Todas as categorias</option>
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      {/* Editor */}
      {showEditor && (
        <div className="bg-indigo-50 border-2 border-indigo-300 rounded-2xl p-5 mb-6">
          <p className="font-bold text-indigo-800 mb-4">{editando ? 'Editar Tutorial' : 'Novo Tutorial'}</p>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-600 block mb-1">Título *</label>
              <input value={eTitulo} onChange={e => setETitulo(e.target.value)}
                placeholder="Ex: Como importar planilha de serviços" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"/>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Categoria</label>
              <select value={eCategoria} onChange={e => setECategoria(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                {CATEGORIAS_DEFAULT.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Mídias (imagens / vídeos)</label>
              <div className="flex gap-2">
                <label className={`flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white cursor-pointer hover:border-indigo-300 ${uploading ? 'opacity-50' : ''}`}>
                  {uploading ? <Loader2 size={12} className="animate-spin"/> : <Upload size={12}/>} Anexar
                  <input type="file" accept="image/*,video/*" onChange={e => { const f = e.target.files?.[0]; if (f) uploadMidia(f); e.target.value = '' }} className="hidden" disabled={uploading}/>
                </label>
              </div>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-600 block mb-1">Conteúdo * (texto do tutorial)</label>
              <textarea value={eConteudo} onChange={e => setEConteudo(e.target.value)} rows={8}
                placeholder={"Passo 1: Acesse a aba de Serviços...\n\nPasso 2: Clique em Importar Planilha...\n\nDica: Use o formato XLSX para melhor compatibilidade."}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono"/>
              <p className="text-[10px] text-slate-400 mt-0.5">Use linhas em branco para separar parágrafos</p>
            </div>

            {/* Mídias anexadas */}
            {eMidias.length > 0 && (
              <div className="col-span-2">
                <p className="text-xs font-semibold text-slate-600 mb-2">Mídias anexadas ({eMidias.length})</p>
                <div className="grid grid-cols-3 gap-3">
                  {eMidias.map((m, i) => (
                    <div key={i} className="relative bg-white border border-slate-200 rounded-lg overflow-hidden group">
                      {m.tipo === 'imagem' ? (
                        <img src={m.url} alt={m.nome} className="w-full h-28 object-cover"/>
                      ) : (
                        <div className="w-full h-28 bg-slate-100 flex items-center justify-center">
                          <Video size={24} className="text-slate-400"/>
                        </div>
                      )}
                      <p className="text-[10px] text-slate-500 px-2 py-1 truncate">{m.nome}</p>
                      <button onClick={() => removerMidia(i)}
                        className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                        <X size={10}/>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={fecharEditor} className="px-4 py-2 border border-slate-200 rounded-lg text-sm bg-white">Cancelar</button>
            <button onClick={salvar} disabled={salvando}
              className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-sm disabled:opacity-50">
              {salvando ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} {editando ? 'Salvar' : 'Publicar Tutorial'}
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="text-center py-16 text-slate-400"><Loader2 size={24} className="animate-spin mx-auto"/> Carregando...</div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-xl">
          <BookOpen size={36} className="mx-auto text-slate-300 mb-3"/>
          <p className="text-slate-500">{busca || catFiltro !== 'todas' ? 'Nenhum tutorial encontrado' : 'Nenhum tutorial cadastrado'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtrados.map(faq => {
            const aberto = expandido === faq.id
            const midias = Array.isArray(faq.midias) ? faq.midias : []
            return (
              <div key={faq.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
                {/* Header */}
                <div className="px-5 py-4 flex items-center gap-4 cursor-pointer" onClick={() => setExpandido(aberto ? null : faq.id)}>
                  <div className="w-9 h-9 bg-indigo-100 rounded-lg flex items-center justify-center shrink-0">
                    <BookOpen size={16} className="text-indigo-600"/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-800 text-sm">{faq.titulo}</h3>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-medium">{faq.categoria}</span>
                      {midias.length > 0 && (
                        <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                          {midias.some(m => m.tipo === 'imagem') && <Image size={10}/>}
                          {midias.some(m => m.tipo === 'video') && <Video size={10}/>}
                          {midias.length}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isAdmin && (
                      <>
                        <button onClick={e => { e.stopPropagation(); abrirEditor(faq) }}
                          className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50"><Pencil size={14}/></button>
                        <button onClick={e => { e.stopPropagation(); excluir(faq) }}
                          className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50"><Trash2 size={14}/></button>
                      </>
                    )}
                    {aberto ? <ChevronUp size={16} className="text-indigo-500 ml-1"/> : <ChevronDown size={16} className="text-slate-400 ml-1"/>}
                  </div>
                </div>

                {/* Conteúdo expandido */}
                {aberto && (
                  <div className="border-t border-slate-100 px-5 py-5 bg-slate-50/50">
                    {/* Texto do tutorial */}
                    <div className="prose prose-sm max-w-none mb-4">
                      {faq.conteudo.split('\n').map((line, i) => {
                        const trimmed = line.trim()
                        if (!trimmed) return <br key={i}/>
                        // Detecta títulos simples (linhas que começam com "Passo" ou são curtas e em caps)
                        if (/^(passo\s+\d|etapa\s+\d|dica:|atenção:|obs:|importante:)/i.test(trimmed)) {
                          return <p key={i} className="text-sm font-bold text-slate-800 mt-3 mb-1">{trimmed}</p>
                        }
                        return <p key={i} className="text-sm text-slate-600 leading-relaxed">{trimmed}</p>
                      })}
                    </div>

                    {/* Mídias */}
                    {midias.length > 0 && (
                      <div className="space-y-4">
                        {midias.map((m, i) => (
                          <div key={i}>
                            {m.tipo === 'imagem' ? (
                              <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                                <img src={m.url} alt={m.nome} className="w-full max-h-[500px] object-contain bg-white"/>
                                <p className="text-[10px] text-slate-400 px-3 py-1.5 bg-slate-50">{m.nome}</p>
                              </div>
                            ) : (
                              <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                                <video controls className="w-full max-h-[500px] bg-black">
                                  <source src={m.url} type="video/mp4"/>
                                  Seu navegador não suporta vídeos.
                                </video>
                                <p className="text-[10px] text-slate-400 px-3 py-1.5 bg-slate-50">{m.nome}</p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <p className="text-[10px] text-slate-300 mt-4">Publicado em {formatDate(faq.created_at)}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}