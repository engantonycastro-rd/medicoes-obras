import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, FileText, Calendar, ChevronRight, AlertCircle, Download,
  CheckCircle2, ArrowRight, Lock, Clock, Trash2, Image, Upload
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '../lib/store'
import { usePerfilStore } from '../lib/perfilStore'
import { Medicao } from '../types'
import { formatDate, calcValoresMedicao } from '../utils/calculations'
import { gerarMedicaoExcel } from '../utils/excelExport'
import { gerarMedicaoPDF } from '../utils/pdfExport'
import { ModeloExportModal } from '../components/ModeloExportModal'
import type { ModeloPlanilha } from '../lib/modeloStore'
import { useModeloStore } from '../lib/modeloStore'
import { importarMedicaoAnterior, MedicaoAnteriorItem } from '../utils/importMedicaoAnterior'

export function MedicoesPage() {
  const {
    contratoAtivo, obraAtiva, fetchMedicoes, criarMedicao, criarProximaMedicao,
    efetuarMedicao, deletarMedicao, atualizarMedicao, setMedicaoAtiva, fetchServicos,
    fetchLinhasMedicao, servicos, linhasPorServico, logos, fetchLogos,
    logoSelecionada, setLogoSelecionada, loading, fetchFotos,
    importarMedicaoAnterior: importarMedAnteriorStore,
  } = useStore()
  const { perfilAtual } = usePerfilStore()
  const isAdmin = perfilAtual?.role === 'ADMIN'
  const isGestor = perfilAtual?.role === 'GESTOR'
  const isEngenheiro = perfilAtual?.role === 'ENGENHEIRO'
  const [medicoes, setMedicoes] = useState<Medicao[]>([])
  const [carregando, setCarregando] = useState(false)
  const [confirmModal, setConfirmModal] = useState<{ tipo: 'efetivar'|'proxima'|'deletar'; medicao: Medicao } | null>(null)
  const [exportModal, setExportModal] = useState<{ tipo: 'xlsx'|'pdf'; medicao: Medicao } | null>(null)
  const { excelHabilitado } = useModeloStore()
  const navigate = useNavigate()

  // Import medição anterior
  const importFileRef = useRef<HTMLInputElement>(null)
  const [importPreview, setImportPreview] = useState<MedicaoAnteriorItem[]>([])
  const [importNumero, setImportNumero] = useState(1)
  const [importando, setImportando] = useState(false)

  useEffect(() => {
    if (!obraAtiva || !contratoAtivo) return
    load()
    fetchLogos()
  }, [obraAtiva])

  async function load() {
    if (!obraAtiva || !contratoAtivo) return
    setCarregando(true)
    const [meds] = await Promise.all([
      fetchMedicoes(obraAtiva.id),
      fetchServicos(obraAtiva.id),
    ])
    setMedicoes(meds)
    setCarregando(false)
  }

  async function handleCriar() {
    if (!obraAtiva || !contratoAtivo) return
    const ultima = medicoes[medicoes.length - 1]
    if (ultima && ultima.status !== 'APROVADA') {
      toast.error(`Efetive a ${ultima.numero_extenso} Medição antes de criar uma nova.`); return
    }
    try {
      const nova = await criarMedicao(obraAtiva.id, contratoAtivo.id)
      toast.success(`${nova.numero_extenso} Medição criada!`)
    } catch { toast.error('Erro ao criar medição'); return }
    await load()
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const items = await importarMedicaoAnterior(file)
      setImportPreview(items)
      // Sugere o número da próxima medição
      const existentes = medicoes.map(m => m.numero)
      let next = 1
      while (existentes.includes(next)) next++
      setImportNumero(next)
      toast.success(`${items.length} itens carregados — revise e confirme.`)
    } catch (err: any) { toast.error(err.message || 'Erro ao ler arquivo') }
    e.target.value = ''
  }

  async function confirmarImportAnterior() {
    if (!obraAtiva || !contratoAtivo || importPreview.length === 0) return
    setImportando(true)
    try {
      const med = await importarMedAnteriorStore(obraAtiva.id, contratoAtivo.id, importNumero, importPreview)
      toast.success(`${med.numero_extenso} Medição anterior importada com ${importPreview.length} itens!`)
      setImportPreview([])
      await load()
    } catch (err: any) { toast.error(err.message || 'Erro ao importar') }
    setImportando(false)
  }

  async function confirmarAcao() {
    if (!confirmModal || !obraAtiva || !contratoAtivo) return
    const { tipo, medicao } = confirmModal
    setConfirmModal(null)
    try {
      if (tipo === 'efetivar') {
        await efetuarMedicao(medicao.id)
        toast.success(`${medicao.numero_extenso} Medição aprovada!`)
      } else if (tipo === 'proxima') {
        const nova = await criarProximaMedicao(obraAtiva.id, contratoAtivo.id, medicao.id)
        toast.success(`${nova.numero_extenso} Medição criada com acumulado!`)
      } else if (tipo === 'deletar') {
        await deletarMedicao(medicao.id)
        toast.success('Medição removida.')
      }
      await load()
    } catch { toast.error('Erro ao processar') }
  }

  async function abrirMedicao(m: Medicao) {
    setMedicaoAtiva(m)
    await fetchLinhasMedicao(m.id)
    navigate('/memoria')
  }

  async function handleExportXlsx(e: React.MouseEvent, m: Medicao) {
    e.stopPropagation()
    if (!obraAtiva || !contratoAtivo) return
    setExportModal({ tipo: 'xlsx', medicao: m })
  }

  async function handleExportPDF(e: React.MouseEvent, m: Medicao) {
    e.stopPropagation()
    if (!obraAtiva || !contratoAtivo) return
    setExportModal({ tipo: 'pdf', medicao: m })
  }

  async function confirmarExport(modelo: ModeloPlanilha) {
    if (!exportModal || !obraAtiva || !contratoAtivo) return
    const tipo = exportModal.tipo
    const medicaoId = exportModal.medicao.id
    setExportModal(null)

    // Usa o estado LOCAL (tem periodo_referencia atualizado pelo salvarPeriodo)
    // DB pode não ter a coluna ainda, então local é mais confiável
    const mLocal = medicoes.find(x => x.id === medicaoId) || exportModal.medicao

    if (tipo === 'xlsx') {
      try {
        await fetchLinhasMedicao(mLocal.id)
        const state = useStore.getState()
        await gerarMedicaoExcel(contratoAtivo, obraAtiva, mLocal, state.servicos, state.linhasPorServico, state.logoSelecionada, modelo)
        toast.success('Excel exportado!')
      } catch (err) { console.error(err); toast.error('Erro ao exportar Excel') }
    } else {
      try {
        await fetchFotos(mLocal.id)
        // Busca todas as medições do DB apenas para calcular anteriores
        const todasMedicoes = await fetchMedicoes(obraAtiva.id)
        const anterioresComValor: { numero_extenso: string; valorPeriodo: number }[] = []
        for (const ant of todasMedicoes.filter(x => x.numero < mLocal.numero && x.status === 'APROVADA').sort((a,b) => a.numero - b.numero)) {
          await fetchLinhasMedicao(ant.id)
          const st = useStore.getState()
          const vals = calcValoresMedicao(st.servicos, st.linhasPorServico, obraAtiva)
          anterioresComValor.push({ numero_extenso: ant.numero_extenso, valorPeriodo: vals.valorPeriodo })
        }
        await fetchLinhasMedicao(mLocal.id)
        const state = useStore.getState()
        const fotosAtuais = state.fotos

        await gerarMedicaoPDF(
          contratoAtivo, obraAtiva, mLocal,
          state.servicos, state.linhasPorServico, state.logoSelecionada,
          fotosAtuais.length > 0 ? fotosAtuais : undefined,
          anterioresComValor.length > 0 ? anterioresComValor : undefined,
          modelo
        )
        toast.success('PDF exportado!')
      } catch (err) { console.error(err); toast.error('Erro ao exportar PDF') }
    }
  }

  async function salvarPeriodo(medicao: Medicao, periodo: string) {
    try {
      await atualizarMedicao(medicao.id, { periodo_referencia: periodo || null } as any)
      setMedicoes(prev => prev.map(m => m.id === medicao.id ? { ...m, periodo_referencia: periodo || null } : m))
    } catch { toast.error('Erro ao salvar período') }
  }

  const statusCfg: Record<string, { label: string; badge: string; icon: React.ReactNode }> = {
    RASCUNHO: { label: 'Rascunho', badge: 'bg-slate-100 text-slate-600 border-slate-200', icon: <Clock size={11}/> },
    ENVIADA:  { label: 'Enviada',  badge: 'bg-blue-100 text-blue-700 border-blue-200',    icon: <ArrowRight size={11}/> },
    APROVADA: { label: 'Aprovada', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: <CheckCircle2 size={11}/> },
  }
  const ordEN = ['','1ª','2ª','3ª','4ª','5ª','6ª','7ª','8ª','9ª','10ª','11ª','12ª','13ª','14ª','15ª']

  if (!obraAtiva || !contratoAtivo) {
    return (
      <div className="p-8">
        <div className="bg-primary-50 border border-primary-200 rounded-xl p-6 flex items-center gap-4">
          <AlertCircle size={24} className="text-primary-500 shrink-0" />
          <div>
            <p className="font-semibold text-primary-800">Nenhuma obra selecionada</p>
            <p className="text-sm text-primary-600 mt-1">Vá em <strong>Contratos</strong>, expanda um contrato e clique em uma obra.</p>
          </div>
        </div>
      </div>
    )
  }

  const ultimaMedicao = medicoes[medicoes.length - 1]

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-xs text-slate-400 mb-0.5">
            {contratoAtivo.nome_obra} <span className="text-slate-300">›</span>
          </p>
          <p className="text-xs font-medium text-primary-600 uppercase tracking-wider mb-1">{obraAtiva.nome_obra}</p>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Medições</h1>
          <p className="text-slate-500 text-sm mt-1">{obraAtiva.local_obra}</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => navigate('/servicos')}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 font-medium rounded-lg text-sm hover:bg-slate-50">
            Ver Serviços
          </button>
          {(isAdmin || isGestor || isEngenheiro) && medicoes.length === 0 && (
            <>
              <button onClick={() => importFileRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 border border-purple-200 text-purple-600 font-medium rounded-lg text-sm hover:bg-purple-50">
                <Upload size={15}/> Importar Anterior
              </button>
              <input ref={importFileRef} type="file" accept=".xlsx,.xls" onChange={handleImportFile} className="hidden"/>
            </>
          )}
          {(!ultimaMedicao || ultimaMedicao.status === 'APROVADA') && (
            <button onClick={handleCriar} disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg text-sm shadow-sm disabled:opacity-50">
              <Plus size={16} /> Nova Medição
            </button>
          )}
        </div>
      </div>

      {/* Info obra + seletor de logo */}
      <div className="grid grid-cols-3 gap-4 mt-5 mb-8">
        <div className="col-span-2 bg-slate-800 rounded-xl p-4 flex gap-6 text-white">
          {[
            ['Desconto', `${(obraAtiva.desconto_percentual * 100).toFixed(2)}%`],
            ['BDI',      `${(obraAtiva.bdi_percentual * 100).toFixed(2)}%`],
            ['Prazo',    `${obraAtiva.prazo_execucao_dias} dias`],
            ['Data Base', obraAtiva.data_base_planilha || '—'],
            ['Nº Contrato', obraAtiva.numero_contrato || '—'],
          ].map(([label, val]) => (
            <div key={label} className="flex flex-col">
              <span className="text-xs text-slate-400">{label}</span>
              <span className="text-sm font-semibold mt-0.5 truncate max-w-32">{val}</span>
            </div>
          ))}
        </div>

        {/* Seletor de logo */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-2">
          <p className="text-xs font-semibold text-slate-600 flex items-center gap-1.5"><Image size={13}/>Logo na exportação</p>
          {logos.length > 0 ? (
            <div className="flex flex-wrap gap-2 flex-1">
              {logos.map(logo => (
                <button key={logo.id}
                  onClick={() => setLogoSelecionada(logoSelecionada === logo.base64 ? null : logo.base64)}
                  className={`relative p-1 rounded-lg border-2 transition-all ${
                    logoSelecionada === logo.base64 ? 'border-primary-500' : 'border-slate-100 hover:border-primary-200'
                  }`}
                  title={logo.nome}
                >
                  <img src={logo.base64} alt={logo.nome} className="h-8 w-auto max-w-16 object-contain" />
                  {logoSelecionada === logo.base64 && (
                    <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-primary-500 rounded-full flex items-center justify-center">
                      <CheckCircle2 size={10} className="text-white" />
                    </div>
                  )}
                </button>
              ))}
              {logoSelecionada && (
                <button onClick={() => setLogoSelecionada(null)} className="text-xs text-red-500 hover:underline self-end">Remover</button>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-400 flex-1 flex items-center">Adicione logos em <strong className="ml-1">Config → Logos</strong></p>
          )}
        </div>
      </div>

      {/* Lista */}
      {carregando ? (
        <div className="py-16 text-center text-slate-400">Carregando medições...</div>
      ) : medicoes.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-xl">
          <FileText size={36} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">Nenhuma medição criada</p>
          <button onClick={handleCriar}
            className="mt-4 flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg text-sm mx-auto">
            <Plus size={16}/> Criar 1ª Medição
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {medicoes.map((m, idx) => {
            const cfg = statusCfg[m.status]
            const isUltima = idx === medicoes.length - 1
            const isAprovada = m.status === 'APROVADA'
            const isRascunho = m.status === 'RASCUNHO'
            return (
              <div key={m.id} className={`bg-white border rounded-xl p-5 transition-all ${
                isAprovada ? 'border-emerald-200 bg-emerald-50/20' :
                isRascunho && isUltima ? 'border-primary-300 shadow-md shadow-primary-100' : 'border-slate-200'
              }`}>
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 text-xl font-bold ${
                    isAprovada ? 'bg-emerald-100 text-emerald-700' : 'bg-primary-50 text-primary-600'
                  }`}>{m.numero_extenso}</div>

                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => abrirMedicao(m)}>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-slate-800">{m.numero_extenso} Medição</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium border flex items-center gap-1 ${cfg.badge}`}>
                        {cfg.icon}{cfg.label}
                      </span>
                      {isAprovada && <span className="text-xs text-slate-400 flex items-center gap-1"><Lock size={11}/>Bloqueada</span>}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-slate-500">
                      <span className="flex items-center gap-1.5"><Calendar size={13}/>{formatDate(m.data_medicao)}</span>
                      {m.periodo_referencia && (
                        <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">
                          Período: {m.periodo_referencia}
                        </span>
                      )}
                      {m.observacoes && <span className="truncate max-w-xs">{m.observacoes}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Exportar Excel — só se habilitado */}
                    {excelHabilitado && (
                      <button onClick={e => handleExportXlsx(e, m)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200
                          text-slate-600 text-xs hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50 transition-all">
                        <Download size={13}/> .xlsx
                      </button>
                    )}
                    {/* Exportar PDF */}
                    <button onClick={e => handleExportPDF(e, m)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200
                        text-slate-600 text-xs hover:border-red-300 hover:text-red-600 hover:bg-red-50 transition-all">
                      <Download size={13}/> .pdf
                    </button>
                    {/* Efetivar */}
                    {isRascunho && isUltima && (
                      <button onClick={() => setConfirmModal({ tipo: 'efetivar', medicao: m })} disabled={loading}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-all">
                        <CheckCircle2 size={13}/> Efetivar
                      </button>
                    )}
                    {/* Criar próxima */}
                    {isAprovada && isUltima && (
                      <button onClick={() => setConfirmModal({ tipo: 'proxima', medicao: m })} disabled={loading}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white text-xs font-medium transition-all">
                        <ArrowRight size={13}/> Criar {ordEN[Math.max(...medicoes.map(x => x.numero)) + 1] || `${Math.max(...medicoes.map(x => x.numero))+1}ª`} Med.
                      </button>
                    )}
                    {/* Deletar — admin e gestor podem deletar medição */}
                    {(isAdmin || isGestor) && (
                      <button onClick={() => setConfirmModal({ tipo: 'deletar', medicao: m })}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-200
                          text-red-600 text-xs hover:bg-red-50 transition-all">
                        <Trash2 size={13}/>
                      </button>
                    )}
                    <ChevronRight size={18} className="text-slate-300 hover:text-primary-400 cursor-pointer ml-1"
                      onClick={() => abrirMedicao(m)} />
                  </div>
                </div>

                {/* Campo período de referência */}
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-3">
                  <label className="text-xs text-slate-500 font-medium shrink-0 flex items-center gap-1.5">
                    <Calendar size={12}/> Período:
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 02/03/2026 à 10/03/2026"
                    defaultValue={m.periodo_referencia || ''}
                    onBlur={e => {
                      const val = e.target.value.trim()
                      if (val !== (m.periodo_referencia || '')) salvarPeriodo(m, val)
                    }}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                    className="flex-1 max-w-xs border border-slate-200 rounded-lg px-3 py-1.5 text-xs
                      focus:outline-none focus:ring-1 focus:ring-primary-400 focus:border-primary-400
                      placeholder:text-slate-300"
                  />
                  {m.periodo_referencia && (
                    <span className="text-xs text-emerald-500 flex items-center gap-1"><CheckCircle2 size={11}/> Salvo</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal confirmação */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            {confirmModal.tipo === 'deletar' ? (
              <>
                <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center mb-4"><Trash2 size={24} className="text-red-600"/></div>
                <h2 className="text-lg font-bold text-slate-800 mb-2">Deletar {confirmModal.medicao.numero_extenso} Medição?</h2>
                <p className="text-sm text-slate-500 mb-5">Esta ação removerá permanentemente a medição, toda a memória de cálculo e fotos vinculadas. Não pode ser desfeita.</p>
              </>
            ) : confirmModal.tipo === 'efetivar' ? (
              <>
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4"><CheckCircle2 size={24} className="text-blue-600"/></div>
                <h2 className="text-lg font-bold text-slate-800 mb-2">Efetivar {confirmModal.medicao.numero_extenso} Medição?</h2>
                <ul className="text-sm text-slate-600 space-y-1 mb-5 ml-2">
                  <li>✓ Muda status: <strong>Rascunho → Aprovada</strong></li>
                  <li>✓ Registra como oficialmente entregue</li>
                  <li>⚠ A virada "A pagar → Pago" ocorre ao criar a próxima</li>
                </ul>
              </>
            ) : (
              <>
                <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center mb-4"><ArrowRight size={24} className="text-primary-600"/></div>
                <h2 className="text-lg font-bold text-slate-800 mb-2">Criar próxima medição?</h2>
                <ul className="text-sm text-slate-600 space-y-1 mb-5 ml-2">
                  <li>✓ Efetiva a medição atual</li>
                  <li>✓ Cria nova medição em rascunho</li>
                  <li>✓ Importa acumulado anterior (linhas "Pago")</li>
                </ul>
              </>
            )}
            <div className="flex gap-3">
              <button onClick={() => setConfirmModal(null)} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={confirmarAcao} className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white ${
                confirmModal.tipo === 'deletar' ? 'bg-red-600 hover:bg-red-700' :
                confirmModal.tipo === 'efetivar' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-primary-500 hover:bg-primary-600'
              }`}>
                {confirmModal.tipo === 'deletar' ? 'Sim, deletar' : confirmModal.tipo === 'efetivar' ? 'Confirmar' : 'Criar Medição'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal seleção de modelo para exportação */}
      {exportModal && (
        <ModeloExportModal
          tipo={exportModal.tipo}
          onConfirmar={confirmarExport}
          onFechar={() => setExportModal(null)}
        />
      )}

      {/* Modal importação de medição anterior */}
      {importPreview.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setImportPreview([])}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                <Upload size={20} className="text-purple-600"/>
              </div>
              <div>
                <h2 className="font-bold text-lg text-slate-800">Importar Medição Anterior</h2>
                <p className="text-xs text-slate-500">{importPreview.length} serviços detectados — serão criados como "Pago"</p>
              </div>
            </div>

            <div className="px-6 py-3 bg-purple-50 border-b border-purple-200 flex items-center gap-4">
              <label className="text-sm font-medium text-purple-800">Nº da medição:</label>
              <input type="number" min={1} value={importNumero} onChange={e => setImportNumero(Number(e.target.value))}
                className="w-20 border border-purple-300 rounded-lg px-3 py-1.5 text-sm text-center font-bold bg-white"/>
              <p className="text-xs text-purple-600">Esta medição será criada como APROVADA com todas as linhas status "Pago"</p>
            </div>

            <div className="flex-1 overflow-auto px-6 py-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 text-left font-semibold w-20">Item</th>
                    <th className="py-2 text-left font-semibold">Serviço</th>
                    <th className="py-2 text-right font-semibold w-28">Qtd Medida</th>
                    <th className="py-2 text-right font-semibold w-28">Qtd Prevista</th>
                    <th className="py-2 text-center font-semibold w-16">%</th>
                  </tr>
                </thead>
                <tbody>
                  {importPreview.map((imp, i) => {
                    const srv = servicos.find(s => s.item === imp.item)
                    const pct = srv && srv.quantidade > 0 ? (imp.quantidade / srv.quantidade * 100) : 0
                    return (
                      <tr key={i} className={`border-b border-slate-50 ${!srv ? 'bg-red-50' : pct > 100 ? 'bg-primary-50' : ''}`}>
                        <td className="py-2 font-mono font-medium text-slate-700">{imp.item}</td>
                        <td className="py-2 text-slate-600 truncate max-w-64">{srv?.descricao || <span className="text-red-500 font-medium">Serviço não encontrado</span>}</td>
                        <td className="py-2 text-right font-bold text-slate-800">{imp.quantidade.toFixed(2)}</td>
                        <td className="py-2 text-right text-slate-500">{srv?.quantidade.toFixed(2) || '—'}</td>
                        <td className="py-2 text-center">
                          {srv ? <span className={`text-[10px] font-bold ${pct > 100 ? 'text-red-500' : pct >= 100 ? 'text-emerald-600' : 'text-slate-600'}`}>{pct.toFixed(0)}%</span> : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {importPreview.some(imp => !servicos.find(s => s.item === imp.item)) && (
                <p className="text-xs text-red-500 mt-2 bg-red-50 px-3 py-2 rounded-lg">
                  ⚠ Itens em vermelho não foram encontrados nos serviços desta obra e serão ignorados.
                </p>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-200 flex gap-3">
              <button onClick={() => setImportPreview([])}
                className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={confirmarImportAnterior} disabled={importando}
                className="flex-1 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg text-sm disabled:opacity-50">
                {importando ? 'Importando...' : `Confirmar (${importPreview.filter(imp => servicos.find(s => s.item === imp.item)).length} itens)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}