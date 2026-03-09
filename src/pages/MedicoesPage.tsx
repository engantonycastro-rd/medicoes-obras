import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, FileText, Calendar, ChevronRight, AlertCircle, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '../lib/store'
import { Medicao } from '../types'
import { formatDate, formatCurrency, calcValoresMedicao } from '../utils/calculations'
import { gerarMedicaoExcel } from '../utils/excelExport'

export function MedicoesPage() {
  const {
    contratoAtivo, fetchMedicoes, criarMedicao, setMedicaoAtiva,
    fetchServicos, fetchLinhasMedicao, servicos, linhasPorServico,
  } = useStore()
  const [medicoes, setMedicoes] = useState<Medicao[]>([])
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (!contratoAtivo) return
    load()
  }, [contratoAtivo])

  async function load() {
    if (!contratoAtivo) return
    setLoading(true)
    const [meds] = await Promise.all([
      fetchMedicoes(contratoAtivo.id),
      fetchServicos(contratoAtivo.id),
    ])
    setMedicoes(meds)
    setLoading(false)
  }

  async function handleCriar() {
    if (!contratoAtivo) return
    try {
      const nova = await criarMedicao(contratoAtivo.id)
      toast.success(`${nova.numero_extenso} Medição criada!`)
      await load()
    } catch {
      toast.error('Erro ao criar medição')
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
      await gerarMedicaoExcel(contratoAtivo, m, state.servicos, state.linhasPorServico)
      toast.success('Planilha exportada!')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao exportar planilha')
    }
  }

  const statusBadge: Record<string, string> = {
    RASCUNHO: 'bg-slate-100 text-slate-600',
    ENVIADA:  'bg-blue-100 text-blue-700',
    APROVADA: 'bg-emerald-100 text-emerald-700',
  }

  if (!contratoAtivo) {
    return (
      <div className="p-8">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 flex items-center gap-4">
          <AlertCircle size={24} className="text-amber-500 shrink-0" />
          <div>
            <p className="font-semibold text-amber-800">Nenhum contrato selecionado</p>
            <p className="text-sm text-amber-600 mt-1">
              Acesse a aba <strong>Contratos</strong> e selecione um contrato para gerenciar as medições.
            </p>
          </div>
        </div>
      </div>
    )
  }

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
          <button
            onClick={handleCriar}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600
              text-white font-medium rounded-lg shadow-sm transition-all text-sm"
          >
            <Plus size={16} />
            Nova Medição
          </button>
        </div>
      </div>

      {/* Info do contrato */}
      <div className="bg-slate-800 rounded-xl p-4 flex gap-6 mb-8 mt-5 text-white">
        {[
          ['Desconto', `${(contratoAtivo.desconto_percentual * 100).toFixed(2)}%`],
          ['BDI', `${(contratoAtivo.bdi_percentual * 100).toFixed(2)}%`],
          ['Prazo', `${contratoAtivo.prazo_execucao_dias} dias`],
          ['Data Base', contratoAtivo.data_base_planilha || '—'],
          ['Empresa', contratoAtivo.empresa_executora],
        ].map(([label, val]) => (
          <div key={label} className="flex flex-col">
            <span className="text-xs text-slate-400">{label}</span>
            <span className="text-sm font-semibold text-white mt-0.5">{val}</span>
          </div>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="py-20 text-center text-slate-400">Carregando medições...</div>
      ) : medicoes.length === 0 ? (
        <div className="text-center py-20">
          <FileText size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">Nenhuma medição criada</p>
          <p className="text-slate-400 text-sm mt-1">Crie a primeira medição para este contrato</p>
        </div>
      ) : (
        <div className="space-y-3">
          {medicoes.map(m => (
            <div
              key={m.id}
              onClick={() => abrirMedicao(m)}
              className="bg-white border border-slate-200 rounded-xl p-5 flex items-center gap-5
                cursor-pointer hover:border-amber-300 hover:shadow-md transition-all group"
            >
              <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center shrink-0">
                <span className="text-xl font-bold text-amber-600">{m.numero_extenso}</span>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-slate-800">{m.numero_extenso} Medição</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge[m.status]}`}>
                    {m.status}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <Calendar size={13} />
                    {formatDate(m.data_medicao)}
                  </span>
                  {m.observacoes && <span className="truncate max-w-xs">{m.observacoes}</span>}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={e => handleExport(e, m)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200
                    text-slate-600 text-xs hover:border-emerald-300 hover:text-emerald-600
                    hover:bg-emerald-50 transition-all"
                >
                  <Download size={13} />
                  Exportar .xlsx
                </button>
                <ChevronRight size={18} className="text-slate-300 group-hover:text-amber-400 transition-colors" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
