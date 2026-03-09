import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, FileText, Calendar, ChevronRight, AlertCircle,
  Download, CheckCircle2, ArrowRight, Lock, Clock, Image
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '../lib/store'
import { Medicao } from '../types'
import { formatDate } from '../utils/calculations'
import { gerarMedicaoExcel } from '../utils/excelExport'

export function MedicoesPage() {
  const {
    contratoAtivo, fetchMedicoes, criarMedicao, criarProximaMedicao,
    efetuarMedicao, setMedicaoAtiva, fetchServicos, fetchLinhasMedicao,
    servicos, linhasPorServico, logoBase64, setLogoBase64, loading,
  } = useStore()
  const [medicoes, setMedicoes] = useState<Medicao[]>([])
  const [carregando, setCarregando] = useState(false)
  const [confirmModal, setConfirmModal] = useState<{
    tipo: 'efetivar' | 'proxima'
    medicao: Medicao
  } | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!contratoAtivo) return
    load()
  }, [contratoAtivo])

  async function load() {
    if (!contratoAtivo) return
    setCarregando(true)
    const [meds] = await Promise.all([
      fetchMedicoes(contratoAtivo.id),
      fetchServicos(contratoAtivo.id),
    ])
    setMedicoes(meds)
    setCarregando(false)
  }

  async function handleCriar() {
    if (!contratoAtivo) return
    // Só permite criar 1ª se não existe nenhuma, ou se a última está APROVADA
    const ultima = medicoes[medicoes.length - 1]
    if (ultima && ultima.status !== 'APROVADA') {
      toast.error(`Efetive a ${ultima.numero_extenso} Medição antes de criar uma nova.`)
      return
    }
    try {
      const nova = await criarMedicao(contratoAtivo.id)
      toast.success(`${nova.numero_extenso} Medição criada!`)
      await load()
    } catch {
      toast.error('Erro ao criar medição')
    }
  }

  async function handleEfetivar(m: Medicao) {
    setConfirmModal({ tipo: 'efetivar', medicao: m })
  }

  async function handleCriarProxima(m: Medicao) {
    setConfirmModal({ tipo: 'proxima', medicao: m })
  }

  async function confirmarAcao() {
    if (!confirmModal || !contratoAtivo) return
    const { tipo, medicao } = confirmModal
    setConfirmModal(null)
    try {
      if (tipo === 'efetivar') {
        await efetuarMedicao(medicao.id, contratoAtivo.id)
        toast.success(`${medicao.numero_extenso} Medição aprovada! Todas as linhas "A pagar" foram marcadas como "Pago".`)
      } else {
        const nova = await criarProximaMedicao(contratoAtivo.id, medicao.id)
        toast.success(`${nova.numero_extenso} Medição criada com acumulado anterior importado!`)
      }
      await load()
    } catch {
      toast.error('Erro ao processar operação')
    }
  }

  async function abrirMedicao(m: Medicao) {
    setMedicaoAtiva(m)
    await fetchLinhasMedicao(m.id)
    navigate('/memoria')
  }

  async function handleExport(e: React.MouseEvent, m: Medicao) {
    e.stopPropagation()
    if (!contratoAtivo) return
    try {
      await fetchLinhasMedicao(m.id)
      const state = useStore.getState()
      await gerarMedicaoExcel(contratoAtivo, m, state.servicos, state.linhasPorServico, state.logoBase64)
      toast.success('Planilha exportada!')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao exportar planilha')
    }
  }

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Apenas imagens são aceitas'); return }
    if (file.size > 500 * 1024) { toast.error('Imagem muito grande. Máximo 500KB.'); return }
    const reader = new FileReader()
    reader.onload = () => {
      setLogoBase64(reader.result as string)
      toast.success('Logo carregada!')
    }
    reader.readAsDataURL(file)
  }

  const statusConfig: Record<string, { label: string; badge: string; icon: React.ReactNode }> = {
    RASCUNHO: { label: 'Rascunho',  badge: 'bg-slate-100 text-slate-600 border-slate-200',   icon: <Clock size={11} /> },
    ENVIADA:  { label: 'Enviada',   badge: 'bg-blue-100 text-blue-700 border-blue-200',       icon: <ArrowRight size={11} /> },
    APROVADA: { label: 'Aprovada',  badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: <CheckCircle2 size={11} /> },
  }

  if (!contratoAtivo) {
    return (
      <div className="p-8">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 flex items-center gap-4">
          <AlertCircle size={24} className="text-amber-500 shrink-0" />
          <div>
            <p className="font-semibold text-amber-800">Nenhum contrato selecionado</p>
            <p className="text-sm text-amber-600 mt-1">
              Acesse <strong>Contratos</strong> e selecione um contrato para gerenciar as medições.
            </p>
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
          <p className="text-xs font-medium text-amber-600 uppercase tracking-wider mb-1">
            {contratoAtivo.nome_obra}
          </p>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Medições</h1>
          <p className="text-slate-500 text-sm mt-1">{contratoAtivo.local_obra}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/servicos')}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200
              text-slate-600 font-medium rounded-lg text-sm hover:bg-slate-50 transition-all"
          >
            Ver Serviços
          </button>
          {/* Só mostra "Nova Medição" se não há medições ou a última está APROVADA */}
          {(!ultimaMedicao || ultimaMedicao.status === 'APROVADA') && (
            <button
              onClick={handleCriar}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600
                text-white font-medium rounded-lg shadow-sm transition-all text-sm disabled:opacity-50"
            >
              <Plus size={16} />
              Nova Medição
            </button>
          )}
        </div>
      </div>

      {/* Painel info + logo */}
      <div className="grid grid-cols-3 gap-4 mb-8 mt-5">
        {/* Info contrato */}
        <div className="col-span-2 bg-slate-800 rounded-xl p-4 flex gap-6 text-white">
          {[
            ['Desconto', `${(contratoAtivo.desconto_percentual * 100).toFixed(2)}%`],
            ['BDI', `${(contratoAtivo.bdi_percentual * 100).toFixed(2)}%`],
            ['Prazo', `${contratoAtivo.prazo_execucao_dias} dias`],
            ['Data Base', contratoAtivo.data_base_planilha || '—'],
            ['Empresa', contratoAtivo.empresa_executora],
          ].map(([label, val]) => (
            <div key={label} className="flex flex-col">
              <span className="text-xs text-slate-400">{label}</span>
              <span className="text-sm font-semibold text-white mt-0.5 truncate max-w-32">{val}</span>
            </div>
          ))}
        </div>

        {/* Upload de logo */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-2">
          <p className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
            <Image size={13} />
            Logo para exportação (.xlsx)
          </p>
          {logoBase64 ? (
            <div className="flex items-center gap-3 flex-1">
              <img src={logoBase64} alt="Logo" className="h-12 object-contain rounded border border-slate-100" />
              <div className="flex flex-col gap-1">
                <span className="text-xs text-emerald-600 font-medium">✓ Logo carregada</span>
                <button
                  onClick={() => setLogoBase64(null)}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Remover
                </button>
              </div>
            </div>
          ) : (
            <label className="flex-1 border-2 border-dashed border-slate-200 rounded-lg
              flex items-center justify-center gap-2 text-xs text-slate-400
              hover:border-amber-300 hover:text-amber-600 cursor-pointer transition-all p-2">
              <Plus size={14} />
              Carregar logo (PNG/JPG)
              <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            </label>
          )}
          <p className="text-xs text-slate-400">Aparece no cabeçalho da planilha exportada</p>
        </div>
      </div>

      {/* Lista de medições */}
      {carregando ? (
        <div className="py-20 text-center text-slate-400">Carregando medições...</div>
      ) : medicoes.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-slate-200 rounded-xl">
          <FileText size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">Nenhuma medição criada</p>
          <p className="text-slate-400 text-sm mt-1">Crie a primeira medição para este contrato</p>
          <button
            onClick={handleCriar}
            className="mt-4 flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600
              text-white font-medium rounded-lg text-sm mx-auto transition-all"
          >
            <Plus size={16} />
            Criar 1ª Medição
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {medicoes.map((m, idx) => {
            const cfg = statusConfig[m.status]
            const isUltima = idx === medicoes.length - 1
            const isAprovada = m.status === 'APROVADA'
            const isRascunho = m.status === 'RASCUNHO'

            return (
              <div
                key={m.id}
                className={`bg-white border rounded-xl p-5 transition-all ${
                  isAprovada
                    ? 'border-emerald-200 bg-emerald-50/30'
                    : isRascunho && isUltima
                      ? 'border-amber-300 shadow-md shadow-amber-100'
                      : 'border-slate-200'
                }`}
              >
                <div className="flex items-center gap-4">
                  {/* Número */}
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center shrink-0 text-xl font-bold ${
                    isAprovada ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-50 text-amber-600'
                  }`}>
                    {m.numero_extenso}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0" onClick={() => abrirMedicao(m)} style={{ cursor: 'pointer' }}>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-slate-800">{m.numero_extenso} Medição</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium border flex items-center gap-1 ${cfg.badge}`}>
                        {cfg.icon}
                        {cfg.label}
                      </span>
                      {isAprovada && (
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Lock size={11} />
                          Bloqueada para edição
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-slate-500">
                      <span className="flex items-center gap-1.5">
                        <Calendar size={13} />
                        {formatDate(m.data_medicao)}
                      </span>
                      {m.observacoes && <span className="truncate max-w-xs">{m.observacoes}</span>}
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Exportar sempre disponível */}
                    <button
                      onClick={e => handleExport(e, m)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200
                        text-slate-600 text-xs hover:border-emerald-300 hover:text-emerald-600
                        hover:bg-emerald-50 transition-all"
                    >
                      <Download size={13} />
                      Exportar .xlsx
                    </button>

                    {/* Efetivar — só na última em rascunho */}
                    {isRascunho && isUltima && (
                      <button
                        onClick={() => handleEfetivar(m)}
                        disabled={loading}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                          bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium
                          transition-all disabled:opacity-50"
                      >
                        <CheckCircle2 size={13} />
                        Efetivar Medição
                      </button>
                    )}

                    {/* Criar próxima — só na última aprovada */}
                    {isAprovada && isUltima && (
                      <button
                        onClick={() => handleCriarProxima(m)}
                        disabled={loading}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                          bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium
                          transition-all disabled:opacity-50"
                      >
                        <ArrowRight size={13} />
                        Criar {medicoes.length + 1 <= 15
                          ? ['','1ª','2ª','3ª','4ª','5ª','6ª','7ª','8ª','9ª','10ª','11ª','12ª','13ª','14ª','15ª'][medicoes.length + 1]
                          : `${medicoes.length + 1}ª`
                        } Medição
                      </button>
                    )}

                    <ChevronRight
                      size={18}
                      className="text-slate-300 hover:text-amber-400 transition-colors cursor-pointer"
                      onClick={() => abrirMedicao(m)}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal de confirmação */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            {confirmModal.tipo === 'efetivar' ? (
              <>
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
                  <CheckCircle2 size={24} className="text-blue-600" />
                </div>
                <h2 className="text-lg font-bold text-slate-800 mb-2">
                  Efetivar {confirmModal.medicao.numero_extenso} Medição?
                </h2>
                <p className="text-slate-600 text-sm mb-2">
                  Esta ação irá:
                </p>
                <ul className="text-sm text-slate-600 space-y-1 mb-5 ml-4">
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 mt-0.5">✓</span>
                    Mudar o status de <strong>Rascunho → Aprovada</strong>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 mt-0.5">✓</span>
                    Todas as linhas <strong>"A pagar"</strong> serão marcadas como <strong>"Pago"</strong>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-500 mt-0.5">⚠</span>
                    A medição ficará <strong>bloqueada para edição</strong>
                  </li>
                </ul>
              </>
            ) : (
              <>
                <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center mb-4">
                  <ArrowRight size={24} className="text-amber-600" />
                </div>
                <h2 className="text-lg font-bold text-slate-800 mb-2">
                  Criar próxima medição?
                </h2>
                <p className="text-slate-600 text-sm mb-2">
                  Esta ação irá:
                </p>
                <ul className="text-sm text-slate-600 space-y-1 mb-5 ml-4">
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-500 mt-0.5">✓</span>
                    Efetivar a {confirmModal.medicao.numero_extenso} medição (se ainda rascunho)
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-500 mt-0.5">✓</span>
                    Criar nova medição em branco
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-500 mt-0.5">✓</span>
                    Importar automaticamente o <strong>acumulado anterior</strong> (linhas "Pago")
                  </li>
                </ul>
              </>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setConfirmModal(null)}
                className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarAcao}
                className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-all ${
                  confirmModal.tipo === 'efetivar'
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : 'bg-amber-500 hover:bg-amber-600'
                }`}
              >
                {confirmModal.tipo === 'efetivar' ? 'Confirmar Efetivação' : 'Confirmar e Criar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
