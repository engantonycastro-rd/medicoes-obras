import { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Trash2, ChevronDown, ChevronUp, AlertCircle,
  Save, Download, CheckCircle2, Clock, XCircle, Camera, FileDown, Filter, Zap, Keyboard, ArrowLeft,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '../lib/store'
import { usePerfilStore } from '../lib/perfilStore'
import { Servico, LinhaMemoria, StatusLinhaMemoria } from '../types'
import {
  calcularTotalLinha, calcResumoServico, formatCurrency, formatNumber,
  calcPrecoComBDI, calcValoresMedicao,
} from '../utils/calculations'
import { gerarMedicaoExcel } from '../utils/excelExport'
import { gerarMedicaoPDF } from '../utils/pdfExport'
import { RelatorioFotografico } from '../components/RelatorioFotografico'
import { ModeloExportModal } from '../components/ModeloExportModal'
import type { ModeloPlanilha } from '../lib/modeloStore'
import { useModeloStore } from '../lib/modeloStore'

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
  const [exportModal, setExportModal] = useState<'xlsx'|'pdf'|null>(null)
  const { excelHabilitado, medir100Habilitado } = useModeloStore()
  const { perfilAtual } = usePerfilStore()
  const isAdmin = perfilAtual?.role === 'ADMIN'
  // null = todas; string = item do grupo (ex: "2")
  const [etapaFiltro, setEtapaFiltro] = useState<string | null>(null)
  const [mostrarAtalhos, setMostrarAtalhos] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (!obraAtiva || !medicaoAtiva) return
    fetchServicos(obraAtiva.id)
    fetchLinhasMedicao(medicaoAtiva.id)
    fetchFotos(medicaoAtiva.id)
    fetchMedicoes(obraAtiva.id).then(setMedicoesDaObra).catch(() => {})
  }, [obraAtiva, medicaoAtiva])

  // ── ATALHOS GLOBAIS ──────────────────────────────────────────────────────
  useEffect(() => {
    function handleGlobalKey(e: KeyboardEvent) {
      // Ctrl+S — salva forçado (flush debounced updates)
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        toast.success('Salvamento forçado', { icon: '💾', duration: 1500 })
        const active = document.activeElement as HTMLElement
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
          active.blur()
          setTimeout(() => active.focus(), 50)
        }
      }
      // Ctrl+E — expandir/recolher todos
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault()
        const srvIds = servicos.filter(s => !s.is_grupo).map(s => s.id)
        setExpandidos(prev => prev.size > 0 ? new Set() : new Set(srvIds))
      }
      // ? — mostrar atalhos
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && document.activeElement?.tagName !== 'INPUT') {
        setMostrarAtalhos(p => !p)
      }
    }
    window.addEventListener('keydown', handleGlobalKey)
    return () => window.removeEventListener('keydown', handleGlobalKey)
  }, [servicos])

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
    const puBDI  = calcPrecoComBDI(srv.preco_unitario, obraAtiva?.bdi_percentual ?? 0)
    const fatorDesc = 1 - (obraAtiva?.desconto_percentual ?? 0)
    return sum + Math.round(qtdPeriodo * puBDI * fatorDesc * 100) / 100
  }, 0)

  async function handleExportXlsx() {
    if (!contratoAtivo || !obraAtiva || !medicaoAtiva) return
    setExportModal('xlsx')
  }

  async function handleExportPDF() {
    if (!contratoAtivo || !obraAtiva || !medicaoAtiva) return
    setExportModal('pdf')
  }

  async function confirmarExport(modelo: ModeloPlanilha) {
    if (!contratoAtivo || !obraAtiva || !medicaoAtiva) return
    const tipo = exportModal
    setExportModal(null)

    // Usa medicaoAtiva diretamente (estado local, tem periodo_referencia)
    const med = medicaoAtiva

    if (tipo === 'xlsx') {
      try {
        await gerarMedicaoExcel(contratoAtivo, obraAtiva, med, servicos, linhasPorServico, logoSelecionada, modelo)
        toast.success('Excel exportado!')
      } catch (err) { console.error(err); toast.error('Erro ao exportar Excel') }
    } else {
      try {
        const todasMedicoes = await fetchMedicoes(obraAtiva.id)
        const anteriores = todasMedicoes
          .filter(m => m.numero < med.numero && m.status === 'APROVADA')
          .sort((a, b) => a.numero - b.numero)
        const anterioresComValor: { numero_extenso: string; valorPeriodo: number }[] = []
        for (const m of anteriores) {
          await fetchLinhasMedicao(m.id)
          const st = useStore.getState()
          const vals = calcValoresMedicao(servicos, st.linhasPorServico, obraAtiva)
          anterioresComValor.push({ numero_extenso: m.numero_extenso, valorPeriodo: vals.valorPeriodo })
        }
        await fetchLinhasMedicao(med.id)

        await gerarMedicaoPDF(
          contratoAtivo, obraAtiva, med,
          servicos, linhasPorServico, logoSelecionada,
          fotos.length > 0 ? fotos : undefined,
          anterioresComValor.length > 0 ? anterioresComValor : undefined,
          modelo
        )
        toast.success('PDF gerado!')
      } catch (err) { console.error(err); toast.error('Erro ao gerar PDF') }
    }
  }

  if (!obraAtiva || !medicaoAtiva || !contratoAtivo) {
    return (
      <div className="p-8">
        <div className="bg-primary-50 border border-primary-200 rounded-xl p-6 flex items-center gap-4">
          <AlertCircle size={24} className="text-primary-500 shrink-0" />
          <div>
            <p className="font-semibold text-primary-800">Nenhuma medição selecionada</p>
            <p className="text-sm text-primary-600 mt-1">Acesse via <strong>Contratos → Obra → Medições</strong>.</p>
          </div>
        </div>
      </div>
    )
  }

  async function handleMedir100() {
    if (!medicaoAtiva || !obraAtiva) return
    const todosServicos = servicos.filter(s => !s.is_grupo).sort((a, b) => a.ordem - b.ordem)
    
    // Calcula quantos serviços têm saldo > 0
    const servicosComSaldo = todosServicos.filter(srv => {
      const linhas = linhasPorServico.get(srv.id) || []
      const { qtdSaldo } = calcResumoServico(srv, linhas)
      return qtdSaldo > 0 && srv.quantidade > 0
    })

    if (servicosComSaldo.length === 0) {
      toast('Todos os serviços já estão com 100% medidos!', { icon: '✅' })
      return
    }

    if (!confirm(
      `MEDIR 100%\n\n` +
      `Serão preenchidos ${servicosComSaldo.length} serviço(s) com o saldo restante.\n` +
      `Cada um receberá uma linha "TOTAL" com a quantidade prevista.\n\n` +
      `Deseja continuar?`
    )) return

    let criados = 0
    let erros = 0

    for (const srv of servicosComSaldo) {
      const linhas = linhasPorServico.get(srv.id) || []
      const { qtdSaldo } = calcResumoServico(srv, linhas)
      if (qtdSaldo <= 0) continue

      // Calcula próximo sub_item
      const existentes = linhas.map(l => l.sub_item).filter(s => s.startsWith(`${srv.item}.`))
      let nextNum = 1
      if (existentes.length > 0) {
        const nums = existentes.map(s => parseInt(s.split('.').pop() || '0')).filter(n => !isNaN(n))
        nextNum = Math.max(...nums) + 1
      }

      try {
        await salvarLinha({
          medicao_id: medicaoAtiva.id,
          servico_id: srv.id,
          sub_item: `${srv.item}.${nextNum}`,
          descricao_calculo: 'TOTAL',
          largura: null, comprimento: null, altura: null,
          perimetro: null, area: null, volume: null,
          kg: null, outros: null, desconto_dim: null,
          quantidade: qtdSaldo,
          total: qtdSaldo,
          status: 'A pagar' as any,
          observacao: null,
        })
        criados++
      } catch {
        erros++
      }
    }

    if (criados > 0) toast.success(`${criados} serviço(s) medidos a 100%!`)
    if (erros > 0) toast.error(`${erros} erro(s) ao criar linhas`)
  }

  const isAprovada = medicaoAtiva.status === 'APROVADA'

  return (
    <div className="flex flex-col h-full">
      {/* Top Bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <span>{contratoAtivo.nome_obra}</span>
            <span>›</span>
            <span className="text-primary-600 font-medium">{obraAtiva.nome_obra}</span>
            <span>›</span>
            <span>{medicaoAtiva.numero_extenso} Medição</span>
            <span className={`px-2 py-0.5 rounded-full font-medium border text-xs ml-1 ${
              isAprovada ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-primary-100 text-primary-700 border-primary-200'
            }`}>{medicaoAtiva.status}</span>
          </div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <button onClick={() => navigate('/medicoes')} title="Voltar para Medições"
              className="p-1.5 rounded-lg text-slate-400 hover:text-primary-600 hover:bg-primary-50 transition-all">
              <ArrowLeft size={20}/>
            </button>
            Memória de Cálculo
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right mr-4">
            <p className="text-xs text-slate-400">
              {etapaFiltro ? `Período — Etapa ${etapaFiltro}` : 'Total do Período'}
            </p>
            <p className="text-xl font-bold text-primary-600">{formatCurrency(totalPeriodo)}</p>
          </div>
          <button onClick={() => { setExpandidos(new Set(servicosOrdenados.map(s => s.id))) }}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50">
            Expandir todos
          </button>
          <button onClick={() => setExpandidos(new Set())}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50">
            Recolher
          </button>
          <button onClick={() => setMostraFotos(!mostraFotos)}
            className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-medium transition-all ${
              mostraFotos ? 'bg-purple-600 text-white border-purple-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}>
            <Camera size={13}/> Fotos
          </button>
          {isAdmin && medir100Habilitado && !isAprovada && (
            <button onClick={handleMedir100}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-primary-300 rounded-lg text-xs font-bold
                text-primary-700 bg-primary-50 hover:bg-primary-100 hover:border-primary-400 transition-all">
              <Zap size={13}/> Medir 100%
            </button>
          )}
          {excelHabilitado && (
            <button onClick={handleExportXlsx}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50 transition-all">
              <Download size={13}/> .xlsx
            </button>
          )}
          <button onClick={handleExportPDF}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 hover:border-red-300 hover:text-red-600 hover:bg-red-50 transition-all">
            <FileDown size={13}/> .pdf
          </button>
          <button onClick={() => setMostrarAtalhos(true)} title="Atalhos de teclado (?)"
            className="p-1.5 border border-slate-200 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all">
            <Keyboard size={14}/>
          </button>
        </div>
      </div>

      {/* ── Barra de filtro por etapa ───────────────────────────────────── */}
      {etapas.length > 0 && (
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-2 shrink-0">
          <div className="flex items-center gap-2 overflow-x-auto">
            <Filter size={12} className="text-slate-400 shrink-0" />
            <span className="text-xs text-slate-400 font-medium shrink-0">Etapa:</span>

            {/* chip Todas */}
            <button
              onClick={() => { setEtapaFiltro(null); setExpandidos(new Set()) }}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition-all whitespace-nowrap ${
                !etapaFiltro
                  ? 'bg-primary-500 text-white border-primary-500 shadow-sm'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-primary-300 hover:text-primary-600'
              }`}
            >
              Todas
            </button>

            {/* um chip por etapa */}
            {etapas.map(etapa => {
              const ativo  = etapaFiltro === etapa.item
              const cnt    = contagemPorEtapa.get(etapa.item)
              const temLanc = (cnt?.comLinhas ?? 0) > 0
              return (
                <button
                  key={etapa.id}
                  title={etapa.descricao}
                  onClick={() => {
                    setEtapaFiltro(ativo ? null : etapa.item)
                    setExpandidos(new Set())
                  }}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-all whitespace-nowrap ${
                    ativo
                      ? 'bg-primary-500 text-white border-primary-500 shadow-sm'
                      : temLanc
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:border-emerald-400'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-primary-300 hover:text-primary-600'
                  }`}
                >
                  <span className={`font-bold ${ativo ? 'text-white' : 'text-primary-600'}`}>
                    {etapa.item}
                  </span>
                  <span className="max-w-[160px] truncate">{etapa.descricao}</span>
                  {cnt && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none ${
                      ativo      ? 'bg-white/30 text-white'
                      : temLanc  ? 'bg-emerald-200 text-emerald-800'
                                 : 'bg-slate-100 text-slate-500'
                    }`}>
                      {cnt.comLinhas}/{cnt.total}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Conteúdo */}
      <div className="flex-1 overflow-y-auto p-6 space-y-3">
        {mostraFotos && (
          <RelatorioFotografico medicaoId={medicaoAtiva.id} isAprovada={isAprovada} />
        )}

        {/* Banner da etapa ativa */}
        {etapaFiltro && (() => {
          const etapa = etapas.find(e => e.item === etapaFiltro)
          return etapa ? (
            <div className="flex items-center gap-3 bg-primary-50 border border-primary-200 rounded-xl px-4 py-3">
              <div className="w-9 h-9 bg-primary-500 rounded-xl flex items-center justify-center font-bold text-white text-sm shrink-0">
                {etapa.item}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-primary-500 font-semibold uppercase tracking-widest">Etapa filtrada</p>
                <p className="text-sm font-bold text-primary-800 truncate">{etapa.descricao}</p>
              </div>
              <span className="text-xs text-primary-600 bg-primary-100 px-2.5 py-1 rounded-full font-semibold shrink-0">
                {servicosOrdenados.length} serviço{servicosOrdenados.length !== 1 ? 's' : ''}
              </span>
              <button
                onClick={() => { setEtapaFiltro(null); setExpandidos(new Set()) }}
                className="p-1.5 rounded-lg text-primary-400 hover:text-red-500 hover:bg-red-50 transition-all"
                title="Remover filtro"
              >
                <XCircle size={15}/>
              </button>
            </div>
          ) : null
        })()}

        {servicosOrdenados.length === 0 ? (
          <div className="text-center py-16">
            <AlertCircle size={36} className="mx-auto text-slate-300 mb-3" />
            {etapaFiltro ? (
              <>
                <p className="text-slate-500 font-medium">Nenhum serviço nesta etapa</p>
                <p className="text-slate-400 text-sm mt-1">
                  A etapa <strong>{etapaFiltro}</strong> não possui serviços cadastrados.
                </p>
                <button onClick={() => setEtapaFiltro(null)}
                  className="mt-3 text-xs text-primary-600 hover:underline">
                  Ver todas as etapas
                </button>
              </>
            ) : (
              <>
                <p className="text-slate-500 font-medium">Nenhum serviço encontrado</p>
                <p className="text-slate-400 text-sm mt-1">Importe um orçamento primeiro em <strong>Serviços</strong>.</p>
              </>
            )}
          </div>
        ) : servicosOrdenados.map(servico => (
          <ServicoCard
            key={servico.id}
            servico={servico}
            medicaoId={medicaoAtiva.id}
            linhas={linhasPorServico.get(servico.id) || []}
            expandido={expandidos.has(servico.id)}
            onToggle={() => {
              const n = new Set(expandidos)
              n.has(servico.id) ? n.delete(servico.id) : n.add(servico.id)
              setExpandidos(n)
            }}
            onSalvarLinha={async (l) => { await salvarLinha(l) }}
            onAtualizarLinha={atualizarLinha}
            onDeletarLinha={deletarLinha}
            desconto={obraAtiva.desconto_percentual}
            bdi={obraAtiva.bdi_percentual}
          />
        ))}
      </div>

      {/* Modal seleção de modelo para exportação */}
      {exportModal && (
        <ModeloExportModal
          tipo={exportModal}
          onConfirmar={confirmarExport}
          onFechar={() => setExportModal(null)}
        />
      )}

      {/* Modal atalhos de teclado */}
      {mostrarAtalhos && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setMostrarAtalhos(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3">
              <Keyboard size={20} className="text-primary-500"/>
              <h2 className="font-bold text-lg text-slate-800 dark:text-slate-200">Atalhos de Teclado</h2>
            </div>
            <div className="px-6 py-4 space-y-3">
              {[
                ['Ctrl + S', 'Forçar salvamento de todas as alterações pendentes'],
                ['Ctrl + E', 'Expandir / Recolher todos os serviços'],
                ['Enter', 'Salvar nova linha de memória e limpar para a próxima'],
                ['Tab', 'Navegar entre campos na linha de memória'],
                ['Shift + Tab', 'Voltar para o campo anterior'],
                ['?', 'Abrir/fechar este painel de atalhos'],
              ].map(([tecla, desc]) => (
                <div key={tecla} className="flex items-center gap-3">
                  <span className="kbd-hint shrink-0 min-w-24 text-center">{tecla}</span>
                  <span className="text-sm text-slate-600 dark:text-slate-400">{desc}</span>
                </div>
              ))}
            </div>
            <div className="px-6 py-3 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700 text-center">
              <button onClick={() => setMostrarAtalhos(false)}
                className="px-6 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-semibold">
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── SERVICO CARD ─────────────────────────────────────────────────────────────

function ServicoCard({ servico, medicaoId, linhas, expandido, onToggle, onSalvarLinha, onAtualizarLinha, onDeletarLinha, desconto, bdi }: ServicoCardProps) {
  const { qtdAnterior, qtdPeriodo, qtdAcumulada, qtdSaldo } = calcResumoServico(servico, linhas)
  const puBDI  = calcPrecoComBDI(servico.preco_unitario, bdi)
  const fatorDesc = 1 - desconto
  const valorPeriodo = Math.round(qtdPeriodo * puBDI * fatorDesc * 100) / 100
  const progresso = servico.quantidade > 0 ? Math.min(100, (qtdAcumulada / servico.quantidade) * 100) : 0
  const [novaLinha, setNovaLinha] = useState<Partial<LinhaMemoria>>({})
  const [salvandoNova, setSalvandoNova] = useState(false)
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle'|'saving'|'saved'>('idle')
  const descInputRef = useRef<HTMLInputElement>(null)

  // ── Debounced update for existing lines ──────────────────────────────────
  // Updates UI immediately via store, debounces DB writes
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const pendingRef = useRef<Map<string, Partial<LinhaMemoria>>>(new Map())

  function debouncedUpdate(linhaId: string, changes: Partial<LinhaMemoria>) {
    // 1. Update store immediately for responsive UI
    const currentState = useStore.getState()
    const newMap = new Map(currentState.linhasPorServico)
    newMap.forEach((arr, k) => newMap.set(k, arr.map(l => l.id === linhaId ? { ...l, ...changes } : l)))
    useStore.setState({ linhasPorServico: newMap })

    // 2. Merge pending DB changes
    const prev = pendingRef.current.get(linhaId) || {}
    const merged = { ...prev, ...changes }
    pendingRef.current.set(linhaId, merged)

    // 3. Clear existing timer and set new one
    const existing = timersRef.current.get(linhaId)
    if (existing) clearTimeout(existing)

    setAutoSaveStatus('saving')

    const timer = setTimeout(async () => {
      const data = pendingRef.current.get(linhaId)
      if (!data) return
      pendingRef.current.delete(linhaId)
      timersRef.current.delete(linhaId)
      try {
        // DB write only — store already updated above
        const { error } = await (await import('../lib/supabase')).supabase
          .from('linhas_memoria').update(data).eq('id', linhaId)
        if (error) throw error
        setAutoSaveStatus('saved')
        setTimeout(() => setAutoSaveStatus(s => s === 'saved' ? 'idle' : s), 2000)
      } catch {
        toast.error('Erro ao salvar')
        setAutoSaveStatus('idle')
      }
    }, 800)
    timersRef.current.set(linhaId, timer)
  }

  // Flush pending saves on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach(t => clearTimeout(t))
      pendingRef.current.forEach(async (data, id) => {
        try {
          const { supabase } = await import('../lib/supabase')
          await supabase.from('linhas_memoria').update(data).eq('id', id)
        } catch {}
      })
    }
  }, [])

  // ── Auto-create new line ─────────────────────────────────────────────────
  function proximoSubItem() {
    const existentes = linhas.map(l => l.sub_item).filter(s => s.startsWith(`${servico.item}.`))
    if (!existentes.length) return `${servico.item}.1`
    const nums = existentes.map(s => parseInt(s.split('.').pop() || '0')).filter(n => !isNaN(n))
    return `${servico.item}.${Math.max(...nums) + 1}`
  }

  function calcTotal(l: Partial<LinhaMemoria>): number {
    const tmp = { largura: null, comprimento: null, altura: null, perimetro: null, area: null, volume: null, kg: null, outros: null, desconto_dim: null, quantidade: null, ...l } as LinhaMemoria
    return calcularTotalLinha(tmp)
  }

  const autoCreateTimerRef = useRef<ReturnType<typeof setTimeout>|null>(null)

  function handleNovaLinhaChange(changes: Partial<LinhaMemoria>) {
    const updated = { ...novaLinha, ...changes }
    setNovaLinha(updated)

    // Auto-create: quando tem descrição E pelo menos um valor numérico
    const temDescricao = (updated.descricao_calculo || '').trim().length > 0
    const temValor = ['largura','comprimento','altura','perimetro','area','volume','kg','outros','desconto_dim','quantidade']
      .some(k => (updated as any)[k] != null && (updated as any)[k] !== '')

    if (temDescricao && temValor) {
      if (autoCreateTimerRef.current) clearTimeout(autoCreateTimerRef.current)
      autoCreateTimerRef.current = setTimeout(() => autoCreateLinha(updated), 1200)
    }
  }

  async function autoCreateLinha(data: Partial<LinhaMemoria>) {
    if (!data.descricao_calculo?.trim()) return
    if (salvandoNova) return
    setSalvandoNova(true)
    setAutoSaveStatus('saving')
    try {
      await onSalvarLinha({
        medicao_id: medicaoId, servico_id: servico.id,
        sub_item: proximoSubItem(),
        descricao_calculo: data.descricao_calculo || '',
        largura: data.largura ?? null, comprimento: data.comprimento ?? null,
        altura: data.altura ?? null, perimetro: data.perimetro ?? null,
        area: data.area ?? null, volume: data.volume ?? null,
        kg: data.kg ?? null, outros: data.outros ?? null,
        desconto_dim: data.desconto_dim ?? null, quantidade: data.quantidade ?? null,
        total: calcTotal(data),
        status: (data.status as StatusLinhaMemoria) ?? 'A pagar',
        observacao: data.observacao ?? null,
      })
      setNovaLinha({})
      setAutoSaveStatus('saved')
      setTimeout(() => setAutoSaveStatus(s => s === 'saved' ? 'idle' : s), 2000)
    } catch { toast.error('Erro ao criar linha') }
    finally { setSalvandoNova(false) }
  }

  // Manual save (Enter key or button click) — refocuses description for quick entry
  async function handleSalvarManual() {
    if (autoCreateTimerRef.current) clearTimeout(autoCreateTimerRef.current)
    if (!novaLinha.descricao_calculo?.trim()) { toast.error('Descrição obrigatória'); return }
    await autoCreateLinha(novaLinha)
    // Refoca no campo descrição para digitar a próxima linha
    setTimeout(() => descInputRef.current?.focus(), 100)
  }

  const fieldCls = "w-full border border-slate-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary-400"
  const numFieldNew = (k: keyof LinhaMemoria) => (
    <input type="number" step="any" className={fieldCls + " text-right"}
      value={(novaLinha as any)[k] ?? ''}
      onChange={e => handleNovaLinhaChange({ [k]: e.target.value === '' ? null : Number(e.target.value) })}
      onKeyDown={e => { if (e.key === 'Enter') handleSalvarManual() }}
    />
  )

  return (
    <div className={`bg-white rounded-xl border-2 transition-all ${progresso >= 100 ? 'border-emerald-300 bg-emerald-50/20' : progresso > 0 ? 'border-primary-300' : 'border-slate-200'}`}>
      <div className="flex items-center gap-4 p-4 cursor-pointer" onClick={onToggle}>
        <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center shrink-0 font-bold text-slate-600 text-sm">
          {servico.item}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-800 truncate">{servico.descricao}</h3>
            <span className="text-xs text-slate-400 shrink-0">{servico.unidade}</span>
          </div>
          <div className="flex items-center gap-3 mt-1.5">
            <div className="flex-1 bg-slate-100 rounded-full h-2">
              <div className={`h-2 rounded-full transition-all ${progresso >= 100 ? 'bg-emerald-500' : 'bg-primary-500'}`} style={{ width: `${progresso}%` }} />
            </div>
            <span className="text-xs font-semibold text-slate-600 shrink-0">{progresso.toFixed(1)}%</span>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4 text-right shrink-0">
          {[['Previsto', servico.quantidade], ['Anterior', qtdAnterior], ['Período', qtdPeriodo], ['Saldo', qtdSaldo]].map(([l, v]) => (
            <div key={l as string}>
              <p className="text-xs text-slate-400">{l}</p>
              <p className={`text-sm font-semibold ${l === 'Período' && (v as number) > 0 ? 'text-primary-600' : 'text-slate-700'}`}>
                {formatNumber(v as number)}
              </p>
            </div>
          ))}
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-slate-400">Valor Período</p>
          <p className="text-base font-bold text-primary-600">{formatCurrency(valorPeriodo)}</p>
        </div>
        {expandido ? <ChevronUp size={18} className="text-primary-500 shrink-0" /> : <ChevronDown size={18} className="text-slate-400 shrink-0" />}
      </div>

      {expandido && (
        <div className="border-t border-slate-100 p-4">

          {/* Autosave indicator */}
          <div className="flex items-center justify-end mb-2 h-4">
            {autoSaveStatus === 'saving' && (
              <span className="text-xs text-primary-500 flex items-center gap-1 animate-pulse">
                <span className="w-1.5 h-1.5 bg-primary-500 rounded-full"/>Salvando...
              </span>
            )}
            {autoSaveStatus === 'saved' && (
              <span className="text-xs text-emerald-500 flex items-center gap-1">
                <CheckCircle2 size={11}/>Salvo automaticamente
              </span>
            )}
          </div>

          {/* Tabela de linhas existentes */}
          {linhas.length > 0 && (
            <div className="mb-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-600">
                    {['Sub-Item','Descrição','Larg.','Comp.','Alt.','Peri.','Área','Vol.','Kg','Out.','Desc.','Qtde','TOTAL','Status',''].map(h => (
                      <th key={h} className="px-2 py-1.5 text-center font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...linhas].sort((a, b) => a.sub_item.localeCompare(b.sub_item)).map(linha => {
                    const cfg = STATUS_CONFIG[linha.status]
                    return (
                      <tr key={linha.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-2 py-1.5 text-center font-mono">{linha.sub_item}</td>
                        <td className="px-2 py-1.5 min-w-32">
                          <input value={linha.descricao_calculo}
                            onChange={e => debouncedUpdate(linha.id, { descricao_calculo: e.target.value })}
                            className="w-full bg-transparent border-b border-transparent hover:border-slate-300 focus:border-primary-400 outline-none py-0.5 transition-colors" />
                        </td>
                        {(['largura','comprimento','altura','perimetro','area','volume','kg','outros','desconto_dim','quantidade'] as (keyof LinhaMemoria)[]).map(k => (
                          <td key={k} className="px-1 py-1.5">
                            <input type="number" step="any" value={(linha as any)[k] ?? ''}
                              onChange={e => {
                                const val = e.target.value === '' ? null : Number(e.target.value)
                                const updated = { ...linha, [k]: val }
                                const total = calcularTotalLinha(updated as LinhaMemoria)
                                debouncedUpdate(linha.id, { [k]: val, total })
                              }}
                              className="w-16 text-right bg-transparent border-b border-transparent hover:border-slate-300 focus:border-primary-400 outline-none py-0.5 transition-colors" />
                          </td>
                        ))}
                        <td className="px-2 py-1.5 text-right font-bold text-slate-800">{formatNumber(linha.total)}</td>
                        <td className="px-2 py-1.5">
                          <select value={linha.status} onChange={e => {
                            onAtualizarLinha(linha.id, { status: e.target.value as StatusLinhaMemoria })
                          }}
                            className={`text-xs px-2 py-1 rounded-full border font-medium ${cfg.color}`}>
                            {Object.keys(STATUS_CONFIG).map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-1.5">
                          <button onClick={() => onDeletarLinha(linha.id)} className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all">
                            <Trash2 size={13}/>
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Totais */}
          <div className="flex justify-end gap-6 text-sm mb-4 px-2">
            {[['TOTAL ACUMULADO:', qtdAnterior + qtdPeriodo], ['TOTAL ACUMULADO ANTERIOR:', qtdAnterior], ['TOTAL DO MÊS (A PAGAR):', qtdPeriodo]].map(([l, v]) => (
              <div key={l as string} className="text-right">
                <span className="text-xs text-slate-500">{l} </span>
                <span className="font-bold text-slate-800">{formatNumber(v as number)}</span>
              </div>
            ))}
          </div>

          {/* Nova linha — autosave */}
          <div className="bg-slate-50 rounded-xl p-3 border border-dashed border-slate-300">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">+ Adicionar Linha</p>
              <span className="text-[10px] text-slate-400">Auto-salva • <span className="kbd-hint">Enter</span> salvar • <span className="kbd-hint">Tab</span> próximo campo</span>
            </div>
            <div className="grid grid-cols-12 gap-1.5 items-end">
              <div className="col-span-3">
                <label className="text-xs text-slate-500 mb-1 block">Descrição *</label>
                <input ref={descInputRef} value={novaLinha.descricao_calculo || ''}
                  onChange={e => handleNovaLinhaChange({ descricao_calculo: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Enter') handleSalvarManual() }}
                  placeholder="Ex: Parede sala" className={fieldCls} />
              </div>
              {(['largura','comprimento','altura','area','volume','kg','outros','desconto_dim','quantidade'] as (keyof LinhaMemoria)[]).map(k => (
                <div key={k}>
                  <label className="text-xs text-slate-500 mb-1 block capitalize">{k === 'desconto_dim' ? 'Desc.' : k === 'comprimento' ? 'Comp.' : k.charAt(0).toUpperCase()+k.slice(1,4)+'.'}</label>
                  {numFieldNew(k)}
                </div>
              ))}
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Total</label>
                <div className={fieldCls + " bg-white text-right font-bold"}>{formatNumber(calcTotal(novaLinha))}</div>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Status</label>
                <select className={fieldCls} value={novaLinha.status || 'A pagar'} onChange={e => handleNovaLinhaChange({ status: e.target.value as StatusLinhaMemoria })}>
                  {Object.keys(STATUS_CONFIG).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="flex items-end">
                <button onClick={handleSalvarManual} disabled={salvandoNova}
                  className="w-full flex items-center justify-center gap-1 px-3 py-1.5 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-xs font-semibold disabled:opacity-50 transition-all">
                  <Save size={12}/> {salvandoNova ? '...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}