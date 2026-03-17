import { useEffect, useState, useRef } from 'react'
import { Settings, Image, Plus, Trash2, CheckCircle2, Upload, Crown, Lock, TableProperties, FileSpreadsheet, ToggleLeft, ToggleRight, Zap, Palette, Wrench, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '../lib/store'
import { usePerfilStore } from '../lib/perfilStore'
import { useModeloStore } from '../lib/modeloStore'
import { ModeloEditor } from '../components/ModeloEditor'
import { supabase } from '../lib/supabase'

type Aba = 'logos' | 'modelos' | 'exportacao' | 'aparencia' | 'manutencao'

export function ConfigPage() {
  const { logos, fetchLogos, adicionarLogo, deletarLogo, logoSelecionada, setLogoSelecionada } = useStore()
  const { perfilAtual } = usePerfilStore()
  const { excelHabilitado, setExcelHabilitado, medir100Habilitado, setMedir100Habilitado, corTema, setCorTema } = useModeloStore()
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
              ? 'border-primary-500 text-primary-600'
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
        {isAdmin && (
          <button onClick={() => setAbaAtiva('aparencia')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium -mb-px border-b-2 transition-colors ${
              abaAtiva === 'aparencia'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            <Palette size={15}/> Aparência
            <span className="px-1.5 py-0.5 bg-primary-100 text-primary-700 rounded-md text-[10px] font-bold">ADMIN</span>
          </button>
        )}
        {isAdmin && (
          <button onClick={() => setAbaAtiva('manutencao')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium -mb-px border-b-2 transition-colors ${
              abaAtiva === 'manutencao'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            <Wrench size={15}/> Manutenção
            <span className="px-1.5 py-0.5 bg-red-100 text-red-600 rounded-md text-[10px] font-bold">ADMIN</span>
          </button>
        )}
      </div>

      {/* ── ABA LOGOS ─────────────────────────────────────────────────────── */}
      {abaAtiva === 'logos' && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-primary-100 rounded-xl flex items-center justify-center">
                <Image size={18} className="text-primary-600"/>
              </div>
              <div>
                <h2 className="font-bold text-slate-800">Logos do Sistema</h2>
                <p className="text-xs text-slate-500 mt-0.5">Logos disponíveis para usar na exportação das medições</p>
              </div>
            </div>
            {isAdmin && (
              <span className="flex items-center gap-1.5 text-xs text-primary-600 font-medium">
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
                      !isAdmin ? 'cursor-pointer hover:border-primary-300' : 'cursor-default'
                    } ${logoSelecionada === logo.base64 ? 'border-primary-500 bg-primary-50' : 'border-slate-200'}`}
                  >
                    <img src={logo.base64} alt={logo.nome} className="h-14 w-auto object-contain"/>
                    <p className="text-xs font-semibold text-slate-700 text-center truncate w-full">{logo.nome}</p>
                    {logo.descricao && <p className="text-xs text-slate-400 text-center line-clamp-2">{logo.descricao}</p>}
                    {logoSelecionada === logo.base64 && (
                      <div className="absolute top-2 left-2 w-5 h-5 bg-primary-500 rounded-full flex items-center justify-center">
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
                    className="w-36 h-24 bg-white border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-primary-400 hover:bg-primary-50 transition-all shrink-0">
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
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"/>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-600 mb-1 block">Descrição (opcional)</label>
                      <input value={descLogo} onChange={e => setDescLogo(e.target.value)}
                        placeholder="Ex: Logo usada em obras estaduais"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"/>
                    </div>
                    <button onClick={handleSalvarLogo} disabled={salvando || !preview || !nomeLogo.trim()}
                      className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition-all self-start">
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

            {/* Toggle MEDIR 100% */}
            <div className="flex items-center justify-between p-4 border border-slate-200 rounded-xl bg-white">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                  medir100Habilitado ? 'bg-primary-100' : 'bg-slate-100'
                }`}>
                  <Zap size={20} className={medir100Habilitado ? 'text-primary-600' : 'text-slate-400'}/>
                </div>
                <div>
                  <p className="font-semibold text-slate-800 text-sm">Medir 100% (ação rápida)</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {medir100Habilitado
                      ? 'Habilitado — botão visível na Memória de Cálculo para administradores. Preenche todos os serviços automaticamente com a quantidade prevista.'
                      : 'Desabilitado — botão oculto para todos os usuários'
                    }
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setMedir100Habilitado(!medir100Habilitado)
                  toast.success(medir100Habilitado ? 'Medir 100% desabilitado' : 'Medir 100% habilitado')
                }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${
                  medir100Habilitado
                    ? 'bg-primary-500 hover:bg-primary-600 text-white'
                    : 'bg-slate-200 hover:bg-slate-300 text-slate-600'
                }`}>
                {medir100Habilitado ? <ToggleRight size={18}/> : <ToggleLeft size={18}/>}
                {medir100Habilitado ? 'Habilitado' : 'Desabilitado'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ABA APARÊNCIA ─────────────────────────────────────────────────── */}
      {abaAtiva === 'aparencia' && isAdmin && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
            <h3 className="text-base font-bold text-slate-800 dark:text-white mb-1 flex items-center gap-2"><Palette size={18}/> Tema de cores</h3>
            <p className="text-xs text-slate-500 mb-6">Escolha a cor primária do sistema. Afeta botões, menus ativos, barras de progresso e destaques em todas as telas.</p>

            <div className="grid grid-cols-2 gap-4">
              {/* Laranja RD */}
              <button onClick={() => { setCorTema('orange'); toast.success('Tema laranja RD aplicado!') }}
                className={`relative border-2 rounded-2xl p-5 transition-all text-left ${corTema === 'orange' ? 'border-orange-500 shadow-lg shadow-orange-500/10' : 'border-slate-200 dark:border-slate-700 hover:border-orange-300'}`}>
                {corTema === 'orange' && <div className="absolute top-3 right-3"><CheckCircle2 size={20} className="text-orange-500"/></div>}
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-[#E8611A] rounded-xl flex items-center justify-center"><span className="text-white font-bold text-sm">RD</span></div>
                  <div>
                    <p className="font-bold text-slate-800 dark:text-white text-sm">Laranja RD</p>
                    <p className="text-[10px] text-slate-400">Identidade visual oficial</p>
                  </div>
                </div>
                <div className="flex gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-[#FFF7ED]" title="#FFF7ED"></div>
                  <div className="w-8 h-8 rounded-lg bg-[#FDBA74]" title="#FDBA74"></div>
                  <div className="w-8 h-8 rounded-lg bg-[#E8611A]" title="#E8611A"></div>
                  <div className="w-8 h-8 rounded-lg bg-[#C2410C]" title="#C2410C"></div>
                  <div className="w-8 h-8 rounded-lg bg-[#7C2D12]" title="#7C2D12"></div>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 h-2 rounded-full bg-[#E8611A]"></div>
                  <div className="w-16 h-2 rounded-full bg-slate-200"></div>
                </div>
                <p className="text-[10px] text-slate-400 mt-3">Cor extraída da identidade visual da RD Construtora. Mais vibrante e alinhada com a marca.</p>
              </button>

              {/* Amber Clássico */}
              <button onClick={() => { setCorTema('amber'); toast.success('Tema amber clássico aplicado!') }}
                className={`relative border-2 rounded-2xl p-5 transition-all text-left ${corTema === 'amber' ? 'border-amber-500 shadow-lg shadow-amber-500/10' : 'border-slate-200 dark:border-slate-700 hover:border-amber-300'}`}>
                {corTema === 'amber' && <div className="absolute top-3 right-3"><CheckCircle2 size={20} className="text-amber-500"/></div>}
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-[#F59E0B] rounded-xl flex items-center justify-center"><span className="text-white font-bold text-sm">RD</span></div>
                  <div>
                    <p className="font-bold text-slate-800 dark:text-white text-sm">Amber Clássico</p>
                    <p className="text-[10px] text-slate-400">Tema original do sistema</p>
                  </div>
                </div>
                <div className="flex gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-[#FFFBEB]" title="#FFFBEB"></div>
                  <div className="w-8 h-8 rounded-lg bg-[#FCD34D]" title="#FCD34D"></div>
                  <div className="w-8 h-8 rounded-lg bg-[#F59E0B]" title="#F59E0B"></div>
                  <div className="w-8 h-8 rounded-lg bg-[#D97706]" title="#D97706"></div>
                  <div className="w-8 h-8 rounded-lg bg-[#78350F]" title="#78350F"></div>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 h-2 rounded-full bg-[#F59E0B]"></div>
                  <div className="w-16 h-2 rounded-full bg-slate-200"></div>
                </div>
                <p className="text-[10px] text-slate-400 mt-3">Tema dourado original. Tom mais quente e corporativo, menos vibrante.</p>
              </button>
            </div>

            <div className="mt-4 bg-primary-50 border border-primary-200 rounded-xl px-4 py-3 text-xs text-primary-700">
              Tema atual: <strong>{corTema === 'orange' ? 'Laranja RD' : 'Amber Clássico'}</strong> — a mudança é aplicada instantaneamente para todos os usuários.
            </div>
          </div>
        </div>
      )}

      {/* ── ABA MANUTENÇÃO ──────────────────────────────────────────────── */}
      {abaAtiva === 'manutencao' && isAdmin && (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2"><Wrench size={18}/> Manutenção do Sistema</h2>
            <p className="text-xs text-slate-400 mt-1">Ferramentas de correção e manutenção</p>
          </div>
          <div className="p-6 space-y-4">
            <FixFotosButton />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Componente: Correção de fotos corrompidas ──────────────────────────────

function FixFotosButton() {
  const [fixing, setFixing] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [stats, setStats] = useState({ total: 0, fixed: 0, errors: 0, skipped: 0 })

  async function fixFotos() {
    setFixing(true)
    setLog(['Iniciando correção de fotos...'])
    const s = { total: 0, fixed: 0, errors: 0, skipped: 0 }

    try {
      // 1. Busca todas as fotos de apontamentos
      const { data: fotos, error } = await supabase.from('apontamento_fotos').select('id, path, nome')
      if (error) throw error
      if (!fotos || fotos.length === 0) {
        setLog(prev => [...prev, 'Nenhuma foto encontrada.'])
        setFixing(false)
        return
      }

      s.total = fotos.length
      setLog(prev => [...prev, `${fotos.length} fotos encontradas. Processando...`])

      for (const foto of fotos) {
        try {
          // Verifica se path já tem extensão de imagem
          const hasExt = /\.(jpg|jpeg|png|webp)$/i.test(foto.path)

          // Download do blob
          const { data: blob, error: dlErr } = await supabase.storage.from('apontamentos').download(foto.path)
          if (dlErr || !blob) {
            s.errors++
            setLog(prev => [...prev, `✗ ${foto.nome}: erro ao baixar`])
            continue
          }

          // Verifica se o blob é uma imagem válida
          const isImage = blob.type.startsWith('image/')
          if (isImage && hasExt) {
            s.skipped++
            continue // Já está OK
          }

          // Re-upload com contentType correto
          const mimeType = blob.type.startsWith('image/') ? blob.type : 'image/jpeg'
          const ext = mimeType.includes('png') ? '.png' : '.jpg'
          let newPath = foto.path

          // Se não tem extensão, cria novo path
          if (!hasExt) {
            newPath = foto.path.replace(/\/?$/, '') + ext
          }

          if (newPath !== foto.path) {
            // Upload no novo path
            const { error: upErr } = await supabase.storage.from('apontamentos').upload(newPath, blob, {
              contentType: mimeType, upsert: true,
            })
            if (upErr) { s.errors++; continue }

            // Atualiza path no banco
            await supabase.from('apontamento_fotos').update({ path: newPath, url: newPath }).eq('id', foto.id)

            // Remove arquivo antigo
            await supabase.storage.from('apontamentos').remove([foto.path])
          } else {
            // Mesmo path, só re-upload com contentType
            const { error: upErr } = await supabase.storage.from('apontamentos').update(newPath, blob, {
              contentType: mimeType, upsert: true,
            })
            if (upErr) { s.errors++; continue }
          }

          s.fixed++
          if (s.fixed % 5 === 0) {
            setLog(prev => [...prev, `Corrigidas ${s.fixed} de ${s.total}...`])
            setStats({ ...s })
          }
        } catch (fErr: any) {
          s.errors++
          setLog(prev => [...prev, `✗ ${foto.nome}: ${fErr.message}`])
        }
      }

      setStats(s)
      setLog(prev => [...prev, `✓ Concluído! ${s.fixed} corrigidas, ${s.skipped} já OK, ${s.errors} erros.`])
    } catch (err: any) {
      setLog(prev => [...prev, `Erro geral: ${err.message}`])
    }
    setFixing(false)
  }

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="font-bold text-slate-800 dark:text-white text-sm flex items-center gap-2">
            <Image size={15} className="text-blue-500"/> Corrigir fotos de apontamentos
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            Corrige fotos que foram enviadas sem contentType (aparecem corrompidas). Re-upload com formato JPEG.
          </p>
        </div>
        <button onClick={fixFotos} disabled={fixing}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg text-sm disabled:opacity-50">
          {fixing ? <Loader2 size={14} className="animate-spin"/> : <Wrench size={14}/>}
          {fixing ? 'Corrigindo...' : 'Executar correção'}
        </button>
      </div>
      {stats.total > 0 && (
        <div className="flex gap-4 text-xs mb-2">
          <span className="text-slate-500">Total: {stats.total}</span>
          <span className="text-emerald-600 font-semibold">Corrigidas: {stats.fixed}</span>
          <span className="text-slate-400">Já OK: {stats.skipped}</span>
          <span className="text-red-500">Erros: {stats.errors}</span>
        </div>
      )}
      {log.length > 0 && (
        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-3 max-h-40 overflow-y-auto font-mono text-[10px] text-slate-600 dark:text-slate-400 space-y-0.5">
          {log.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
    </div>
  )
}
