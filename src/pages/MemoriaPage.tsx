import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Trash2, ChevronDown, ChevronUp, AlertCircle,
  Save, Download, CheckCircle2, Clock, XCircle, Calculator
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '../lib/store'
import { Servico, LinhaMemoria, StatusLinhaMemoria } from '../types'
import {
  calcularTotalLinha, calcResumoServico, formatCurrency, formatNumber,
  calcPrecoComDesconto, calcPrecoComBDI,
} from '../utils/calculations'
import { gerarMedicaoExcel } from '../utils/excelExport'

// ─── STATUS CONFIG ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<StatusLinhaMemoria, { label: string; color: string; icon: React.ReactNode }> = {
  'A pagar':        { label: 'A pagar',       color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <Clock size={12} /> },
  'Pago':           { label: 'Pago',           color: 'bg-blue-50 text-blue-700 border-blue-200',         icon: <CheckCircle2 size={12} /> },
  'Não executado':  { label: 'Não executado',  color: 'bg-slate-50 text-slate-500 border-slate-200',      icon: <XCircle size={12} /> },
}

// ─── CAMPOS DIMENSIONAIS ────────────────────────────────────────────────────────

const CAMPOS: Array<{ key: keyof LinhaMemoria; label: string; short: string }> = [
  { key: 'largura',      label: 'Largura',     short: 'Larg.' },
  { key: 'comprimento',  label: 'Comprimento', short: 'Comp.' },
  { key: 'altura',       label: 'Altura',      short: 'Alt.'  },
  { key: 'perimetro',    label: 'Perímetro',   short: 'Peri.' },
  { key: 'area',         label: 'Área',        short: 'Área'  },
  { key: 'volume',       label: 'Volume',      short: 'Vol.'  },
  { key: 'kg',           label: 'Kg',          short: 'Kg'    },
  { key: 'outros',       label: 'Outros',      short: 'Out.'  },
  { key: 'desconto_dim', label: 'Desconto',    short: 'Desc.' },
  { key: 'quantidade',   label: 'Quantidade',  short: 'Qtde'  },
]

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════════════════════

export function MemoriaPage() {
  const {
    contratoAtivo, medicaoAtiva, servicos,
    linhasPorServico, salvarLinha, atualizarLinha, deletarLinha,
    fetchServicos, fetchLinhasMedicao,
  } = useStore()

  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (!contratoAtivo || !medicaoAtiva) return
    load()
  }, [contratoAtivo, medicaoAtiva])

  async function load() {
    if (!contratoAtivo || !medicaoAtiva) return
    setLoading(true)
    await Promise.all([
      fetchServicos(contratoAtivo.id),
      fetchLinhasMedicao(medicaoAtiva.id),
    ])
    setLoading(false)
  }

  const servicosOrdenados = useMemo(
    () => servicos.filter(s => !s.is_grupo).sort((a, b) => a.ordem - b.ordem),
    [servicos]
  )

  function toggleExpand(srvId: string) {
    setExpandidos(prev => {
      const next = new Set(prev)
      if (next.has(srvId)) next.delete(srvId)
      else next.add(srvId)
      return next
    })
  }

  function expandirTodos() {
    setExpandidos(new Set(servicosOrdenados.map(s => s.id)))
  }

  function recolherTodos() {
    setExpandidos(new Set())
  }

  async function handleExportar() {
    if (!contratoAtivo || !medicaoAtiva) return
    try {
      await gerarMedicaoExcel(contratoAtivo, medicaoAtiva, servicos, linhasPorServico)
      toast.success('Planilha exportada com sucesso!')
    } catch (err) {
      console.error(err)
      toast.error('Erro ao exportar planilha')
    }
  }

  if (!contratoAtivo || !medicaoAtiva) {
    return (
      <div className="p-8">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 flex items-center gap-4">
          <AlertCircle size={24} className="text-amber-500 shrink-0" />
          <div>
            <p className="font-semibold text-amber-800">Nenhuma medição selecionada</p>
            <p className="text-sm text-amber-600 mt-1">
              Acesse <strong>Medições</strong> e selecione uma medição para editar a memória de cálculo.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const totalPeriodo = servicosOrdenados.reduce((sum, srv) => {
    const linhas = linhasPorServico.get(srv.id) || []
    const { qtdPeriodo } = calcResumoServico(srv, linhas)
    const precoDesc = calcPrecoComDesconto(srv.preco_unitario, contratoAtivo.desconto_percentual)
    const precoBDI  = Math.trunc(precoDesc * 1.2452 * 100) / 100
    return sum + qtdPeriodo * precoBDI
  }, 0)

  return (
    <div className="flex flex-col h-full">
      {/* ── Top Bar ─────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-amber-600 uppercase tracking-wider">
              {contratoAtivo.nome_obra}
            </span>
            <span className="text-slate-300">›</span>
            <span className="text-sm font-semibold text-slate-700">
              {medicaoAtiva.numero_extenso} Medição
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ml-1
              ${medicaoAtiva.status === 'RASCUNHO' ? 'bg-slate-100 text-slate-600' :
                medicaoAtiva.status === 'APROVADA' ? 'bg-emerald-100 text-emerald-700' :
                'bg-blue-100 text-blue-700'}`}
            >
              {medicaoAtiva.status}
            </span>
          </div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight mt-0.5">
            Memória de Cálculo
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-slate-400">Total do Período</p>
            <p className="text-lg font-bold text-amber-600">{formatCurrency(totalPeriodo)}</p>
          </div>
          <button
            onClick={expandirTodos}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
          >
            Expandir todos
          </button>
          <button
            onClick={recolherTodos}
            className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
          >
            Recolher
          </button>
          <button
            onClick={handleExportar}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700
              text-white font-medium rounded-lg text-sm transition-all"
          >
            <Download size={15} />
            Exportar .xlsx
          </button>
        </div>
      </div>

      {/* ── Lista de Serviços ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-6 space-y-3">
        {loading ? (
          <div className="py-20 text-center text-slate-400">Carregando serviços...</div>
        ) : servicosOrdenados.length === 0 ? (
          <div className="text-center py-20">
            <Calculator size={40} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium">Nenhum serviço cadastrado</p>
            <p className="text-slate-400 text-sm mt-1">
              Importe um orçamento na aba <strong>Serviços</strong> primeiro.
            </p>
          </div>
        ) : (
          servicosOrdenados.map(srv => (
            <ServicoCard
              key={srv.id}
              servico={srv}
              medicaoId={medicaoAtiva.id}
              linhas={linhasPorServico.get(srv.id) || []}
              expandido={expandidos.has(srv.id)}
              onToggle={() => toggleExpand(srv.id)}
              onSalvarLinha={salvarLinha}
              onAtualizarLinha={atualizarLinha}
              onDeletarLinha={deletarLinha}
              desconto={contratoAtivo.desconto_percentual}
              bdi={contratoAtivo.bdi_percentual}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICO CARD
// ═══════════════════════════════════════════════════════════════════════════════

interface ServicoCardProps {
  servico: Servico
  medicaoId: string
  linhas: LinhaMemoria[]
  expandido: boolean
  onToggle: () => void
  onSalvarLinha: (l: Omit<LinhaMemoria, 'id' | 'created_at' | 'updated_at'>) => Promise<LinhaMemoria>
  onAtualizarLinha: (id: string, data: Partial<LinhaMemoria>) => Promise<void>
  onDeletarLinha: (id: string) => Promise<void>
  desconto: number
  bdi: number
}

function ServicoCard({
  servico, medicaoId, linhas, expandido, onToggle,
  onSalvarLinha, onAtualizarLinha, onDeletarLinha,
  desconto, bdi,
}: ServicoCardProps) {
  const { qtdAnterior, qtdPeriodo, qtdAcumulada, qtdSaldo } = calcResumoServico(servico, linhas)
  const precoDesc = calcPrecoComDesconto(servico.preco_unitario, desconto)
  const precoBDIdemo = Math.trunc(precoDesc * 1.2452 * 100) / 100
  const valorPeriodo = qtdPeriodo * precoBDIdemo
  const progresso = servico.quantidade > 0
    ? Math.min(100, (qtdAcumulada / servico.quantidade) * 100)
    : 0

  function proximoSubItem(): string {
    const existentes = linhas.map(l => l.sub_item).filter(s => s.startsWith(`${servico.item}.`))
    if (existentes.length === 0) return `${servico.item}.1`
    const nums = existentes.map(s => parseInt(s.split('.').pop() || '0'))
    return `${servico.item}.${Math.max(...nums) + 1}`
  }

  async function adicionarLinha() {
    try {
      await onSalvarLinha({
        medicao_id: medicaoId,
        servico_id: servico.id,
        sub_item: proximoSubItem(),
        descricao_calculo: '',
        total: 0,
        status: 'A pagar',
      })
      toast.success('Linha adicionada')
    } catch {
      toast.error('Erro ao adicionar linha')
    }
  }

  return (
    <div className={`bg-white rounded-xl border transition-all ${
      expandido ? 'border-amber-300 shadow-md' : 'border-slate-200 hover:border-slate-300'
    }`}>
      {/* Header do serviço */}
      <div
        className="flex items-center gap-4 p-4 cursor-pointer select-none"
        onClick={onToggle}
      >
        <div className="shrink-0 w-14 text-center">
          <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded">
            {servico.item}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-medium text-slate-800 text-sm leading-snug truncate">
              {servico.descricao}
            </p>
            <span className="text-xs text-slate-400 shrink-0">{servico.unidade}</span>
          </div>
          {/* Barra de progresso */}
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-slate-100 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full transition-all ${
                  progresso >= 100 ? 'bg-emerald-500' : 'bg-amber-400'
                }`}
                style={{ width: `${progresso}%` }}
              />
            </div>
            <span className="text-xs text-slate-400 shrink-0">{progresso.toFixed(0)}%</span>
          </div>
        </div>

        {/* Resumo numérico */}
        <div className="hidden lg:flex items-center gap-6 shrink-0 text-right">
          <div>
            <p className="text-xs text-slate-400">Previsto</p>
            <p className="text-sm font-medium text-slate-700">{formatNumber(servico.quantidade)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Anterior</p>
            <p className="text-sm font-medium text-slate-600">{formatNumber(qtdAnterior)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Período</p>
            <p className="text-sm font-bold text-amber-600">{formatNumber(qtdPeriodo)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Saldo</p>
            <p className="text-sm font-medium text-slate-500">{formatNumber(qtdSaldo)}</p>
          </div>
          <div className="min-w-24">
            <p className="text-xs text-slate-400">Valor Período</p>
            <p className="text-sm font-bold text-emerald-600">{formatCurrency(valorPeriodo)}</p>
          </div>
        </div>

        <div className="shrink-0 text-slate-400">
          {expandido ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </div>

      {/* Corpo expandido */}
      {expandido && (
        <div className="border-t border-slate-100">
          {/* Tabela de linhas */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-3 py-2 text-left font-medium text-slate-500 w-20">Sub-Item</th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500 min-w-36">Descrição</th>
                  {CAMPOS.map(c => (
                    <th key={String(c.key)} className="px-2 py-2 text-right font-medium text-slate-400 w-20">
                      {c.short}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-medium text-slate-600 w-24">TOTAL</th>
                  <th className="px-3 py-2 text-center font-medium text-slate-500 w-32">Status</th>
                  <th className="px-2 py-2 w-8" />
                </tr>
              </thead>
              <tbody>
                {linhas.length === 0 && (
                  <tr>
                    <td colSpan={14} className="px-4 py-6 text-center text-slate-400">
                      Nenhuma linha. Clique em "+ Adicionar Linha" para incluir o medido.
                    </td>
                  </tr>
                )}
                {linhas.map(linha => (
                  <LinhaRow
                    key={linha.id}
                    linha={linha}
                    onAtualizar={onAtualizarLinha}
                    onDeletar={onDeletarLinha}
                  />
                ))}
              </tbody>
              {/* Totais */}
              {linhas.length > 0 && (
                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-200 font-semibold">
                    <td colSpan={12} className="px-3 py-2 text-right text-slate-600 text-xs">
                      TOTAL ACUMULADO:
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700">
                      {formatNumber(qtdAcumulada, 4)}
                    </td>
                    <td />
                    <td />
                  </tr>
                  <tr className="bg-blue-50 font-semibold">
                    <td colSpan={12} className="px-3 py-2 text-right text-blue-600 text-xs">
                      TOTAL ACUMULADO ANTERIOR:
                    </td>
                    <td className="px-3 py-2 text-right text-blue-700">
                      {formatNumber(qtdAnterior, 4)}
                    </td>
                    <td />
                    <td />
                  </tr>
                  <tr className="bg-amber-50 font-semibold">
                    <td colSpan={12} className="px-3 py-2 text-right text-amber-700 text-xs">
                      TOTAL DO MÊS (A PAGAR):
                    </td>
                    <td className="px-3 py-2 text-right text-amber-800">
                      {formatNumber(qtdPeriodo, 4)}
                    </td>
                    <td />
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <div className="px-4 py-3 flex justify-between items-center border-t border-slate-100">
            <div className="text-xs text-slate-500 space-x-4">
              <span>Prev: <strong>{formatNumber(servico.quantidade)}</strong></span>
              <span className="text-blue-600">Anterior: <strong>{formatNumber(qtdAnterior)}</strong></span>
              <span className="text-amber-600">Período: <strong>{formatNumber(qtdPeriodo)}</strong></span>
              <span className="text-emerald-600">Valor: <strong>{formatCurrency(valorPeriodo)}</strong></span>
            </div>
            <button
              onClick={adicionarLinha}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                bg-amber-50 text-amber-700 border border-amber-200 rounded-lg
                hover:bg-amber-100 transition-all"
            >
              <Plus size={13} />
              Adicionar Linha
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// LINHA ROW - editável inline
// ═══════════════════════════════════════════════════════════════════════════════

interface LinhaRowProps {
  linha: LinhaMemoria
  onAtualizar: (id: string, data: Partial<LinhaMemoria>) => Promise<void>
  onDeletar: (id: string) => Promise<void>
}

function LinhaRow({ linha, onAtualizar, onDeletar }: LinhaRowProps) {
  const [editado, setEditado] = useState<Partial<LinhaMemoria>>({})
  const [salvando, setSalvando] = useState(false)

  const atual = { ...linha, ...editado }
  const totalCalc = calcularTotalLinha(atual)
  const temEdicao = Object.keys(editado).length > 0

  function handleChange(key: keyof LinhaMemoria, value: string | number | null) {
    const numVal = value === '' || value === null ? null : Number(value)
    const newEditado = { ...editado, [key]: isNaN(numVal as number) ? null : numVal }
    const novoTotal = calcularTotalLinha({ ...atual, [key]: numVal })
    setEditado({ ...newEditado, total: novoTotal })
  }

  function handleDescChange(val: string) {
    setEditado(e => ({ ...e, descricao_calculo: val }))
  }

  function handleStatusChange(val: StatusLinhaMemoria) {
    setEditado(e => ({ ...e, status: val }))
  }

  async function handleSalvar() {
    if (!temEdicao) return
    setSalvando(true)
    try {
      await onAtualizar(linha.id, { ...editado, total: totalCalc })
      setEditado({})
      toast.success('Salvo')
    } catch {
      toast.error('Erro ao salvar')
    }
    setSalvando(false)
  }

  async function handleDeletar() {
    if (!confirm('Remover esta linha?')) return
    try {
      await onDeletar(linha.id)
    } catch {
      toast.error('Erro ao remover')
    }
  }

  const rowBg = atual.status === 'A pagar'
    ? 'bg-emerald-50/40 hover:bg-emerald-50'
    : atual.status === 'Pago'
      ? 'bg-blue-50/40 hover:bg-blue-50'
      : 'bg-slate-50/40 hover:bg-slate-50'

  return (
    <tr className={`border-b border-slate-50 ${rowBg} ${temEdicao ? 'ring-1 ring-inset ring-amber-300' : ''}`}>
      {/* Sub-item */}
      <td className="px-3 py-1.5">
        <span className="font-mono text-xs text-slate-500">{linha.sub_item}</span>
      </td>

      {/* Descrição */}
      <td className="px-2 py-1.5">
        <input
          value={atual.descricao_calculo || ''}
          onChange={e => handleDescChange(e.target.value)}
          onBlur={temEdicao ? handleSalvar : undefined}
          className="w-full bg-transparent border-0 text-xs text-slate-700 focus:outline-none
            focus:ring-1 focus:ring-amber-300 rounded px-1 py-0.5 min-w-28"
          placeholder="Descrição do cálculo..."
        />
      </td>

      {/* Campos dimensionais */}
      {CAMPOS.map(campo => (
        <td key={String(campo.key)} className="px-1 py-1.5">
          <input
            type="number"
            step="any"
            value={atual[campo.key] === null || atual[campo.key] === undefined
              ? '' : String(atual[campo.key])}
            onChange={e => handleChange(campo.key, e.target.value)}
            onBlur={temEdicao ? handleSalvar : undefined}
            className="w-full bg-transparent border-0 text-xs text-right text-slate-700
              focus:outline-none focus:ring-1 focus:ring-amber-300 rounded px-1 py-0.5
              placeholder:text-slate-300"
            placeholder="—"
          />
        </td>
      ))}

      {/* Total calculado */}
      <td className="px-3 py-1.5 text-right">
        <span className={`text-xs font-semibold ${
          totalCalc > 0 ? 'text-slate-800' : 'text-slate-400'
        }`}>
          {formatNumber(totalCalc, 4)}
        </span>
      </td>

      {/* Status */}
      <td className="px-2 py-1.5 text-center">
        <select
          value={atual.status}
          onChange={e => {
            handleStatusChange(e.target.value as StatusLinhaMemoria)
            onAtualizar(linha.id, { status: e.target.value as StatusLinhaMemoria })
          }}
          className={`text-xs px-2 py-1 rounded-full border font-medium cursor-pointer
            focus:outline-none transition-all ${STATUS_CONFIG[atual.status as StatusLinhaMemoria]?.color}`}
        >
          {Object.keys(STATUS_CONFIG).map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </td>

      {/* Ações */}
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-1">
          {temEdicao && (
            <button
              onClick={handleSalvar}
              disabled={salvando}
              className="p-1 rounded text-amber-600 hover:bg-amber-100 transition-all"
              title="Salvar"
            >
              <Save size={13} />
            </button>
          )}
          <button
            onClick={handleDeletar}
            className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </td>
    </tr>
  )
}
