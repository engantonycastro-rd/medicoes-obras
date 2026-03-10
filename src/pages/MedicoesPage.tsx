import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, FileText, Calendar, ChevronRight, AlertCircle, Download,
  CheckCircle2, ArrowRight, Lock, Clock, Trash2, Image
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

export function MedicoesPage() {
  const {
    contratoAtivo, obraAtiva, fetchMedicoes, criarMedicao, criarProximaMedicao,
    efetuarMedicao, deletarMedicao, setMedicaoAtiva, fetchServicos,
    fetchLinhasMedicao, servicos, linhasPorServico, logos, fetchLogos,
    logoSelecionada, setLogoSelecionada, loading, fetchFotos,
  } = useStore()
  const { perfilAtual } = usePerfilStore()
  const isAdmin = perfilAtual?.role === 'ADMIN'
  const [medicoes, setMedicoes] = useState<Medicao[]>([])
  const [carregando, setCarregando] = useState(false)
  const [confirmModal, setConfirmModal] = useState<{ tipo: 'efetivar'|'proxima'|'deletar'; medicao: Medicao } | null>(null)
  const [exportModal, setExportModal] = useState<{ tipo: 'xlsx'|'pdf'; medicao: Medicao } | null>(null)
  const navigate = useNavigate()

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
      await load()
    } catch { toast.error('Erro ao criar medição') }
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
    const m = exportModal.medicao
    const tipo = exportModal.tipo
    setExportModal(null)

    if (tipo === 'xlsx') {
      try {
        await fetchLinhasMedicao(m.id)
        const state = useStore.getState()
        await gerarMedicaoExcel(contratoAtivo, obraAtiva, m, state.servicos, state.linhasPorServico, state.logoSelecionada, modelo)
        toast.success('Excel exportado!')
      } catch (err) { console.error(err); toast.error('Erro ao exportar Excel') }
    } else {
      try {
        await fetchFotos(m.id)
        const todasMedicoes = await fetchMedicoes(obraAtiva.id)
        const anterioresComValor: { numero_extenso: string; valorPeriodo: number }[] = []
        for (const ant of todasMedicoes.filter(x => x.numero < m.numero && x.status === 'APROVADA').sort((a,b) => a.numero - b.numero)) {
          await fetchLinhasMedicao(ant.id)
          const st = useStore.getState()
          const vals = calcValoresMedicao(st.servicos, st.linhasPorServico, obraAtiva)
          anterioresComValor.push({ numero_extenso: ant.numero_extenso, valorPeriodo: vals.valorPeriodo })
        }
        await fetchLinhasMedicao(m.id)
        const state = useStore.getState()
        const fotosAtuais = state.fotos

        await gerarMedicaoPDF(
          contratoAtivo, obraAtiva, m,
          state.servicos, state.linhasPorServico, state.logoSelecionada,
          fotosAtuais.length > 0 ? fotosAtuais : undefined,
          anterioresComValor.length > 0 ? anterioresComValor : undefined,
          modelo
        )
        toast.success('PDF exportado!')
      } catch (err) { console.error(err); toast.error('Erro ao exportar PDF') }
    }
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
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 flex items-center gap-4">
          <AlertCircle size={24} className="text-amber-500 shrink-0" />
          <div>
            <p className="font-semibold text-amber-800">Nenhuma obra selecionada</p>
            <p className="text-sm text-amber-600 mt-1">Vá em <strong>Contratos</strong>, expanda um contrato e clique em uma obra.</p>
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
          <p className="text-xs font-medium text-amber-600 uppercase tracking-wider mb-1">{obraAtiva.nome_obra}</p>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Medições</h1>
          <p className="text-slate-500 text-sm mt-1">{obraAtiva.local_obra}</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => navigate('/servicos')}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-600 font-medium rounded-lg text-sm hover:bg-slate-50">
            Ver Serviços
          </button>
          {(!ultimaMedicao || ultimaMedicao.status === 'APROVADA') && (
            <button onClick={handleCriar} disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg text-sm shadow-sm disabled:opacity-50">
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
                    logoSelecionada === logo.base64 ? 'border-amber-500' : 'border-slate-100 hover:border-amber-200'
                  }`}
                  title={logo.nome}
                >
                  <img src={logo.base64} alt={logo.nome} className="h-8 w-auto max-w-16 object-contain" />
                  {logoSelecionada === logo.base64 && (
                    <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center">
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
            className="mt-4 flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg text-sm mx-auto">
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
                isRascunho && isUltima ? 'border-amber-300 shadow-md shadow-amber-100' : 'border-slate-200'
              }`}>
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 text-xl font-bold ${
                    isAprovada ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-50 text-amber-600'
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
                      {m.observacoes && <span className="truncate max-w-xs">{m.observacoes}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Exportar Excel */}
                    <button onClick={e => handleExportXlsx(e, m)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200
                        text-slate-600 text-xs hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50 transition-all">
                      <Download size={13}/> .xlsx
                    </button>
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
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium transition-all">
                        <ArrowRight size={13}/> Criar {ordEN[medicoes.length + 1] || `${medicoes.length+1}ª`} Med.
                      </button>
                    )}
                    {/* Deletar — só admin, só aprovadas */}
                    {isAdmin && isAprovada && (
                      <button onClick={() => setConfirmModal({ tipo: 'deletar', medicao: m })}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-200
                          text-red-600 text-xs hover:bg-red-50 transition-all">
                        <Trash2 size={13}/>
                      </button>
                    )}
                    <ChevronRight size={18} className="text-slate-300 hover:text-amber-400 cursor-pointer ml-1"
                      onClick={() => abrirMedicao(m)} />
                  </div>
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
                <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center mb-4"><ArrowRight size={24} className="text-amber-600"/></div>
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
                confirmModal.tipo === 'efetivar' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-amber-500 hover:bg-amber-600'
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
    </div>
  )
}