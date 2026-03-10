import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Trash2, ChevronDown, ChevronUp, AlertCircle,
  Save, Download, CheckCircle2, Clock, XCircle, Camera, FileDown, Filter,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '../lib/store'
import { Servico, LinhaMemoria, StatusLinhaMemoria } from '../types'
import {
  calcularTotalLinha, calcResumoServico, formatCurrency, formatNumber,
  calcPrecoComDesconto, calcPrecoComBDI, calcValoresMedicao,
} from '../utils/calculations'
import { gerarMedicaoExcel } from '../utils/excelExport'
import { gerarMedicaoPDF } from '../utils/pdfExport'
import { RelatorioFotografico } from '../components/RelatorioFotografico'

const STATUS_CONFIG: Record<StatusLinhaMemoria, { label: string; color: string; icon: React.ReactNode }> = {
  'A pagar':      { label: 'A pagar',      color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <Clock size={12}/> },
  'Pago':         { label: 'Pago',         color: 'bg-blue-50 text-blue-700 border-blue-200',          icon: <CheckCircle2 size={12}/> },
  'Não executado':{ label: 'Não executado',color: 'bg-red-50 text-red-700 border-red-200',             icon: <XCircle size={12}/> },
}

interface ServicoCardProps {
  servico: Servico; medicaoId: string; linhas: LinhaMemoria[]; expandido: boolean; onToggle: () => void
  onSalvarLinha: (l: Omit<LinhaMemoria,'id'|'created_at'|'updated_at'>) => Promise<void>
  onAtualizarLinha: (id: string, d: Partial<LinhaMemoria>) => Promise<void>
  onDeletarLinha: (id: string) => Promise<void>
  desconto: number; bdi: number
}

export function MemoriaPage() {
  const {
    contratoAtivo, obraAtiva, medicaoAtiva, servicos, linhasPorServico,
    fetchServicos, fetchLinhasMedicao, salvarLinha, atualizarLinha, deletarLinha,
    logoSelecionada, fotos, fetchFotos, fetchMedicoes,
  } = useStore()
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())
  const [mostraFotos, setMostraFotos] = useState(false)
  const [medicoesDaObra, setMedicoesDaObra] = useState<import('../types').Medicao[]>([])
  // null = todas; string = item do grupo (ex: "2")
  const [etapaFiltro, setEtapaFiltro] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!obraAtiva || !medicaoAtiva) return
    fetchServicos(obraAtiva.id)
    fetchLinhasMedicao(medicaoAtiva.id)
    fetchFotos(medicaoAtiva.id)
    fetchMedicoes(obraAtiva.id).then(setMedicoesDaObra).catch(() => {})
  }, [obraAtiva, medicaoAtiva])

  // Todos os grupos (etapas) em ordem
  const etapas = useMemo(
    () => servicos.filter(s => s.is_grupo).sort((a, b) => a.ordem - b.ordem),
    [servicos]
  )

  // Badge por etapa: quantos serviços filhos têm linhas lançadas
  const contagemPorEtapa = useMemo(() => {
    const map = new Map<string, { total: number; comLinhas: number }>()
    for (const etapa of etapas) {
      const filhos = servicos.filter(s => {
        if (s.is_grupo) return false
        // item do filho começa com "ETAPA." — ex: etapa "2" → filhos "2.1", "2.2"…
        return s.item.startsWith(`${etapa.item}.`)
      })
      const comLinhas = filhos.filter(s => (linhasPorServico.get(s.id) ?? []).length > 0).length
      map.set(etapa.item, { total: filhos.length, comLinhas })
    }
    return map
  }, [etapas, servicos, linhasPorServico])

  const servicosOrdenados = useMemo(() => {
    const todos = servicos.filter(s => !s.is_grupo).sort((a, b) => a.ordem - b.ordem)
    if (!etapaFiltro) return todos
    // filtra pelo prefixo do item: etapa "2" → itens "2.1", "2.2", "2.10"…
    return todos.filter(s => s.item.startsWith(`${etapaFiltro}.`))
  }, [servicos, etapaFiltro])

  const totalPeriodo = servicosOrdenados.reduce((sum, srv) => {
    const linhas = linhasPorServico.get(srv.id) || []
    const { qtdPeriodo } = calcResumoServico(srv, linhas)
    const precoDesc = calcPrecoComDesconto(srv.preco_unitario, obraAtiva?.desconto_percentual ?? 0)
    const precoBDI  = calcPrecoComBDI(precoDesc, obraAtiva?.bdi_percentual ?? 0)
    return sum + qtdPeriodo * p