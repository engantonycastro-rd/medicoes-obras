import { useEffect, useState, useRef } from 'react'
import { Camera, Trash2, GripVertical, X, Plus, ImageOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '../lib/store'
import { FotoMedicao } from '../types'

interface Props { medicaoId: string; isAprovada: boolean }

export function RelatorioFotografico({ medicaoId, isAprovada }: Props) {
  const { fotos, fetchFotos, adicionarFoto, atualizarFoto, deletarFoto } = useStore()
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<{ base64: string; legenda: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchFotos(medicaoId)
  }, [medicaoId])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 3 * 1024 * 1024) { toast.error('Foto muito grande (máx 3MB)'); return }
    const reader = new FileReader()
    reader.onload = () => setPreview({ base64: reader.result as string, legenda: '' })
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  async function confirmarFoto() {
    if (!preview) return
    setLoading(true)
    try {
      await adicionarFoto({
        medicao_id: medicaoId, servico_id: null,
        base64: preview.base64, legenda: preview.legenda,
        ordem: fotos.length,
      })
      setPreview(null)
      toast.success('Foto adicionada!')
    } catch { toast.error('Erro ao adicionar foto') }
    finally { setLoading(false) }
  }

  async function handleDeletar(id: string) {
    if (!confirm('Remover esta foto?')) return
    try { await deletarFoto(id); toast.success('Foto removida') }
    catch { toast.error('Erro ao remover') }
  }

  const fotosDaMedicao = fotos.filter(f => f.medicao_id === medicaoId)

  return (
    <div className="bg-purple-50 border border-purple-200 rounded-xl p-5 mb-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
            <Camera size={16} className="text-white" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-sm">Relatório Fotográfico</h3>
            <p className="text-xs text-slate-500">{fotosDaMedicao.length} foto{fotosDaMedicao.length !== 1 ? 's' : ''} nesta medição</p>
          </div>
        </div>
        {!isAprovada && (
          <button onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium rounded-lg transition-all">
            <Plus size={13}/> Adicionar Foto
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
      </div>

      {/* Preview de confirmação */}
      {preview && (
        <div className="mb-4 bg-white border border-purple-300 rounded-xl p-4">
          <div className="flex gap-4">
            <img src={preview.base64} alt="preview" className="w-40 h-28 object-cover rounded-lg border border-slate-200 shrink-0" />
            <div className="flex-1 flex flex-col gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Legenda da foto</label>
                <input value={preview.legenda} onChange={e => setPreview(p => p ? { ...p, legenda: e.target.value } : null)}
                  placeholder="Ex: Parede após demolição — Item 2.1"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setPreview(null)} className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
                  <X size={14}/>
                </button>
                <button onClick={confirmarFoto} disabled={loading}
                  className="flex items-center gap-2 px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                  {loading ? 'Salvando...' : 'Confirmar Foto'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Grid de fotos */}
      {fotosDaMedicao.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed border-purple-200 rounded-xl">
          <ImageOff size={28} className="mx-auto text-purple-300 mb-2" />
          <p className="text-slate-400 text-sm">Nenhuma foto adicionada</p>
          {!isAprovada && <p className="text-slate-400 text-xs mt-1">Clique em "Adicionar Foto" para incluir registros fotográficos</p>}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-3">
          {fotosDaMedicao.sort((a, b) => a.ordem - b.ordem).map((foto, idx) => (
            <div key={foto.id} className="group relative bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-all">
              <img src={foto.base64} alt={foto.legenda} className="w-full h-32 object-cover" />
              <div className="p-2">
                {isAprovada ? (
                  <p className="text-xs text-slate-600 line-clamp-2">{foto.legenda || '—'}</p>
                ) : (
                  <input value={foto.legenda} onChange={e => atualizarFoto(foto.id, { legenda: e.target.value })}
                    placeholder="Legenda..."
                    className="w-full text-xs border-b border-transparent hover:border-slate-300 focus:border-purple-400 outline-none bg-transparent py-0.5" />
                )}
                <p className="text-xs text-slate-400 mt-0.5">Foto {idx + 1}</p>
              </div>
              {!isAprovada && (
                <button onClick={() => handleDeletar(foto.id)}
                  className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                  <Trash2 size={12}/>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
