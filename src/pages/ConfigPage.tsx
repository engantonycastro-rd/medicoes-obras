import { useEffect, useState, useRef } from 'react'
import { Settings, Image, Plus, Trash2, CheckCircle2, Upload, Crown, Lock, TableProperties, FileSpreadsheet, ToggleLeft, ToggleRight } from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '../lib/store'
import { usePerfilStore } from '../lib/perfilStore'
import { useModeloStore } from '../lib/modeloStore'
import { ModeloEditor } from '../components/ModeloEditor'

type Aba = 'logos' | 'modelos' | 'exportacao'

export function ConfigPage() {
  const { logos, fetchLogos, adicionarLogo, deletarLogo, logoSelecionada, setLogoSelecionada } = useStore()
  const { perfilAtual } = usePerfilStore()
  const { excelHabilitado, setExcelHabilitado } = useModeloStore()
  const isAdmin = perfilAtual?.role === 'ADMIN'

  const [abaAtiva,  setAbaAtiva]  = useState<Aba>('logos')
  const [nomeLogo,  setNomeLogo]  = useState('')
  const [descLogo,  setDescLogo]  = useState('')
  const [preview,   setPreview]   = useState<string | null>(null)
  const [salvando,  setSalvando]  = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { fetchLogos() }, [])

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 1024 * 1024) { toast.error('Logo muito grande (máx 1MB)'); return }
    const r = new FileReader()
    r.onload = () => setPreview(r.result as string)
    r.readAsDataURL(file)
    e.target.value = ''
  }

  async function handleSalvarLogo() {
    if (!preview || !nomeLogo.trim()) { toast.error('Nome e imagem são obrigatórios'); return }
    setSalvando(true)
    try {
      await adicionarLogo({ nome: nomeLogo.trim(), descricao: descLogo || null, base64: preview, criado_por: null })
      setNomeLogo(''); setDescLogo(''); setPreview(null)
      toast.success('Logo cadastrada!')
    } catch { toast.error('Erro ao salvar logo') }
    finally { setSalvando(false) }
  }

  async function handleDeletar(id: string, nome: string) {
    if (!confirm(`Remover a logo "${nome}"?`)) return
    try { await deletarLogo(id); toast.success('Logo removida') }
    catch { toast.error('Erro ao remover') }
  }

  return (
    <div className="p-8 max-w-5xl">
      {/* Título */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
          <Settings size={20} className="text-slate-600"/>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Configurações</h1>
          <p className="text-slate-500 text-sm">Gerencie logos, modelos de planilha e preferências do sistema</p>
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        <button onClick={() => setAbaAtiva('logos')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-medium -mb-px border-b-2 transition-colors ${
            abaAtiva === 'logos'
              ? 'border-amber-500 text-amber-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}>
          <Image size={15}/> Logos do Sistema
        </button>
        {/* Modelos só para admin */}
        {isAdmin && (
          <button onClick={() => setAbaAtiva('modelos')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium -mb-px border-b-2 transition-colors ${
              abaAtiva === 'modelos'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            <TableProperties size={15}/> Modelos de Planilha
            <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-600 rounded-md text-[10px] font-bold">ADMIN</span>
          </button>
        )}
        {isAdmin && (
          <button onClick={() => setAbaAtiva('exportacao')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium -mb-px border-b-2 transition-colors ${
              abaAtiva === 'exportacao'
                ? 'border-emerald-500 text-emerald-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            <FileSpreadsheet size={15}/> Exportação
            <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-600 rounded-md text-[10px] font-bold">ADMIN</span>
          </button>
        )}
      </div>

      {/* ── ABA LOGOS ─────────────────────────────────────────────────────── */}
      {abaAtiva === 'logos' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center">
                <Image size={18} className="text-amber-600"/>
              </div>
              <div>
                <h2 className="font-bold text-slate-800">Logos do Sistema</h2>
                <p className="text-xs text-slate-500 mt-0.5">Logos disponíveis para usar na exportação das medições</p>
              </div>
            </div>
            {isAdmin && (
              <span className="flex items-center gap-1.5 text-xs text-amber-600 font-medium">
                <Crown size={12}/> Gerenciado pelo Admin
              </span>
            )}
          </div>

          <div className="p-5">
            {/* Grid de logos */}
            {logos.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl mb-5">
                <Image size={28} className="mx-auto text-slate-300 mb-2"/>
                <p className="text-slate-400 text-sm">Nenhuma logo cadastrada</p>
                {isAdmin && <p className="text-slate-400 text-xs mt-1">Adicione logos abaixo</p>}
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-4 mb-6">
                {logos.map(logo => (
                  <div key={logo.id}
                    onClick={() => !isAdmin && setLogoSelecionada(logoSelecionada === logo.base64 ? null : logo.base64)}
                    className={`group relative bg-slate-50 border-2 rounded-xl p-4 flex flex-col items-center gap-2 transition-all ${
                      !isAdmin ? 'cursor-pointer hover:border-amber-300' : 'cursor-default'
                    } ${logoSelecionada === logo.base64 ? 'border-amber-500 bg-amber-50' : 'border-slate-200'}`}
                  >
                    <img src={logo.base64} alt={logo.nome} className="h-14 w-auto object-contain"/>
                    <p className="text-xs font-semibold text-slate-700 text-center truncate w-full">{logo.nome}</p>
                    {logo.descricao && <p className="text-xs text-slate-400 text-center line-clamp-2">{logo.descricao}</p>}
                    {logoSelecionada === logo.base64 && (
                      <div className="absolute top-2 left-2 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center">
                        <CheckCircle2 size={12} className="text-white"/>
                      </div>
                    )}
                    {isAdmin && (
                      <button onClick={() => handleDeletar(logo.id, logo.nome)}
                        className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 size={12}/>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Form nova logo (admin) */}
            {isAdmin ? (
              <div className="bg-slate-50 rounded-xl p-5 border border-dashed border-slate-300">
                <p className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                  <Plus size={15}/> Cadastrar Nova Logo
                </p>
                <div className="flex gap-5">
                  <div onClick={() => fileRef.current?.click()}
                    className="w-36 h-24 bg-white border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-amber-400 hover:bg-amber-50 transition-all shrink-0">
                    {preview ? (
                      <img src={preview} alt="preview" className="max-h-20 max-w-32 object-contain p-2"/>
                    ) : (
                      <>
                        <Upload size={20} className="text-slate-400 mb-1"/>
                        <span className="text-xs text-slate-400">Clique para upload</span>
                        <span className="text-xs text-slate-400">PNG/JPG — máx 1MB</span>
                      </>
                    )}
                  </div>
                  <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden"/>

                  <div className="flex-1 flex flex-col gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-600 mb-1 block">Nome da Logo *</label>
                      <input value={nomeLogo} onChange={e => setNomeLogo(e.target.value)}
                        placeholder="Ex: SEEC-RN, FUNDASE, Estado do RN..."
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"/>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-600 mb-1 block">Descrição (opcional)</label>
                      <input value={descLogo} onChange={e => setDescLogo(e.target.value)}
                        placeholder="Ex: Logo usada em obras estaduais"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"/>
                    </div>
                    <button onClick={handleSalvarLogo} disabled={salvando || !preview || !nomeLogo.trim()}
                      className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition-all self-start">
                      <Plus size={15}/> {salvando ? 'Salvando...' : 'Cadastrar Logo'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                <Lock size={16} className="text-slate-400 shrink-0"/>
                <p className="text-sm text-slate-500">
                  O cadastro de logos é restrito ao <strong>Administrador</strong>.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ABA MODELOS (só admin) ────────────────────────────────────────── */}
      {abaAtiva === 'modelos' && isAdmin && (
        <ModeloEditor/>
      )}

      {/* ── ABA EXPORTAÇÃO (só admin) ─────────────────────────────────────── */}
      {abaAtiva === 'exportacao' && isAdmin && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-3 p-5 border-b border-slate-100">
            <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center">
              <FileSpreadsheet size={18} className="text-emerald-600"/>
            </div>
            <div>
              <h2 className="font-bold text-slate-800">Configurações de Exportação</h2>
              <p className="text-xs text-slate-500 mt-0.5">Controle quais formatos de exportação estão disponíveis para os usuários</p>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* Toggle Excel */}
            <div className="flex items-center justify-between p-4 border border-slate-200 rounded-xl bg-white">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  excelHabilitado ? 'bg-emerald-100' : 'bg-slate-100'
                }`}>
                  <FileSpreadsheet size={20} className={excelHabilitado ? 'text-emerald-600' : 'text-slate-400'}/>
                </div>
                <div>
                  <p className="font-semibold text-slate-800 text-sm">Exportação Excel (.xlsx)</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {excelHabilitado
                      ? 'Habilitado — botões de exportar Excel visíveis nas páginas de Medições e Memória'
                      : 'Desabilitado — botões de exportar Excel ocultos para todos os usuários'
                    }
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setExcelHabilitado(!excelHabilitado)
                  toast.success(excelHabilitado ? 'Exportação Excel desabilitada' : 'Exportação Excel habilitada')
                }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  excelHabilitado
                    ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                    : 'bg-slate-200 hover:bg-slate-300 text-slate-600'
                }`}>
                {excelHabilitado ? <ToggleRight size={18}/> : <ToggleLeft size={18}/>}
                {excelHabilitado ? 'Habilitado' : 'Desabilitado'}
              </button>
            </div>

            {/* Info PDF */}
            <div className="flex items-center justify-between p-4 border border-slate-200 rounded-xl bg-white">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-red-100">
                  <Settings size={20} className="text-red-500"/>
                </div>
                <div>
                  <p className="font-semibold text-slate-800 text-sm">Exportação PDF</p>
                  <p className="text-xs text-slate-500 mt-0.5">Sempre habilitado — formato padrão de entrega das medições</p>
                </div>
              </div>
              <span className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold">Sempre Ativo</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}