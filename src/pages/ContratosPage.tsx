import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Building2, ChevronRight, Search, FileSpreadsheet, Trash2, Pencil } from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '../../lib/store'
import { Contrato } from '../../types'
import { formatDate, formatCurrency } from '../../utils/calculations'
import { ContratoModal } from '../components/contracts/ContratoModal'

export function ContratosPage() {
  const { contratos, fetchContratos, setContratoAtivo, deletarContrato, loading } = useStore()
  const [busca, setBusca] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Contrato | null>(null)
  const navigate = useNavigate()

  useEffect(() => { fetchContratos() }, [])

  const filtrados = contratos.filter(c =>
    c.nome_obra.toLowerCase().includes(busca.toLowerCase()) ||
    c.local_obra.toLowerCase().includes(busca.toLowerCase()) ||
    (c.numero_contrato || '').includes(busca)
  )

  function abrirContrato(c: Contrato) {
    setContratoAtivo(c)
    navigate(`/medicoes`)
  }

  async function handleDeletar(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    if (!confirm('Deletar este contrato e todos os dados relacionados?')) return
    try {
      await deletarContrato(id)
      toast.success('Contrato removido')
    } catch {
      toast.error('Erro ao remover contrato')
    }
  }

  function handleEditar(e: React.MouseEvent, c: Contrato) {
    e.stopPropagation()
    setEditando(c)
    setModalOpen(true)
  }

  const statusColor: Record<string, string> = {
    ATIVO:     'bg-emerald-100 text-emerald-700',
    CONCLUIDO: 'bg-slate-100 text-slate-600',
    SUSPENSO:  'bg-amber-100 text-amber-700',
  }

  const tipoColor: Record<string, string> = {
    ESTADO:      'bg-blue-100 text-blue-700',
    PREFEITURA:  'bg-purple-100 text-purple-700',
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Contratos</h1>
          <p className="text-slate-500 text-sm mt-1">Gerencie seus contratos de obras públicas</p>
        </div>
        <button
          onClick={() => { setEditando(null); setModalOpen(true) }}
          className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600
            text-white font-medium rounded-lg shadow-sm transition-all text-sm"
        >
          <Plus size={16} />
          Novo Contrato
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por obra, local ou número do contrato..."
          className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm
            focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Total de Contratos', val: contratos.length, icon: Building2, color: 'text-blue-600 bg-blue-50' },
          { label: 'Ativos', val: contratos.filter(c => c.status === 'ATIVO').length, icon: FileSpreadsheet, color: 'text-emerald-600 bg-emerald-50' },
          { label: 'Concluídos', val: contratos.filter(c => c.status === 'CONCLUIDO').length, icon: Building2, color: 'text-slate-600 bg-slate-100' },
        ].map(({ label, val, icon: Icon, color }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-xl p-5 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
              <Icon size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{val}</p>
              <p className="text-sm text-slate-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          Carregando contratos...
        </div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-20">
          <Building2 size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">Nenhum contrato encontrado</p>
          <p className="text-slate-400 text-sm mt-1">
            {busca ? 'Tente outra busca' : 'Crie seu primeiro contrato para começar'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtrados.map(c => (
            <div
              key={c.id}
              onClick={() => abrirContrato(c)}
              className="bg-white border border-slate-200 rounded-xl p-5 flex items-center gap-5
                cursor-pointer hover:border-amber-300 hover:shadow-md transition-all group"
            >
              <div className="w-11 h-11 bg-slate-100 rounded-xl flex items-center justify-center shrink-0">
                <Building2 size={20} className="text-slate-500" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-slate-800 truncate">{c.nome_obra}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${tipoColor[c.tipo]}`}>
                    {c.tipo}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${statusColor[c.status]}`}>
                    {c.status}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm text-slate-500">
                  <span>{c.local_obra}</span>
                  {c.numero_contrato && <span>Contrato: {c.numero_contrato}</span>}
                  {c.data_ordem_servico && <span>OS: {formatDate(c.data_ordem_servico)}</span>}
                </div>
              </div>

              <div className="text-right shrink-0">
                <p className="text-xs text-slate-400">{c.empresa_executora}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Desconto: {(c.desconto_percentual * 100).toFixed(2)}%
                </p>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={e => handleEditar(e, c)}
                  className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={e => handleDeletar(e, c.id)}
                  className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all"
                >
                  <Trash2 size={16} />
                </button>
                <ChevronRight size={18} className="text-slate-300 group-hover:text-amber-400 transition-colors ml-1" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <ContratoModal
          contrato={editando}
          onClose={() => { setModalOpen(false); setEditando(null) }}
        />
      )}
    </div>
  )
}
