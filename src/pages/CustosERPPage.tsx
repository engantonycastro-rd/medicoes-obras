import { useEffect, useState, useMemo, useRef } from 'react'
import {
  Upload, FileSpreadsheet, DollarSign, TrendingUp, AlertTriangle,
  CheckCircle2, Clock, XCircle, Trash2, RefreshCw, Filter,
  Building2, Receipt, ArrowUpRight, ArrowDownRight, Settings,
  Wifi, WifiOff, Play, Loader2, ChevronDown, ChevronUp, Eye, EyeOff,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '../lib/store'
import { usePerfilStore } from '../lib/perfilStore'
import { Obra } from '../types'
import { formatCurrency, formatDate } from '../utils/calculations'
import { importarCustosERP, CustoERP } from '../utils/importCustosERP'
import { TOTVSConfig, testarConexao, buscarMovimentos, buscarContasPagar, buscarNotasFiscais, buscarCentrosCusto, mapMovimentoToCusto } from '../lib/totvsRM'
import { supabase } from '../lib/supabase'

// ─── Types ──────────────────────────────────────────────────────────────────

interface CustoRow {
  id: string; created_at: string; obra_id: string; contrato_id: string
  tipo_documento: string; numero_documento: string|null; fornecedor: string|null
  cnpj_fornecedor: string|null; valor_total: number; valor_liquido: number
  data_emissao: string|null; data_vencimento: string|null
  centro_custo: string|null; categoria: string|null; descricao: string|null
  status_pagamento: string; id_erp: string|null; origem: string
}

const TIPO_LABEL: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  NF_ENTRADA:       { label: 'NF Entrada',       color: 'bg-blue-100 text-blue-700',    icon: <ArrowDownRight size={11}/> },
  NF_SAIDA:         { label: 'NF Saída',         color: 'bg-emerald-100 text-emerald-700', icon: <ArrowUpRight size={11}/> },
  FOLHA:            { label: 'Folha',            color: 'bg-purple-100 text-purple-700', icon: <DollarSign size={11}/> },
  EQUIPAMENTO:      { label: 'Equipamento',      color: 'bg-amber-100 text-amber-700',  icon: <Building2 size={11}/> },
  SERVICO_TERCEIRO: { label: 'Serv. Terceiro',   color: 'bg-orange-100 text-orange-700', icon: <Receipt size={11}/> },
  OUTROS:           { label: 'Outros',           color: 'bg-slate-100 text-slate-600',  icon: <FileSpreadsheet size={11}/> },
}
const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  PENDENTE:  { label: 'Pendente',  color: 'bg-amber-100 text-amber-700 border-amber-200' },
  PAGO:      { label: 'Pago',      color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  VENCIDO:   { label: 'Vencido',   color: 'bg-red-100 text-red-700 border-red-200' },
  CANCELADO: { label: 'Cancelado', color: 'bg-slate-100 text-slate-500 border-slate-200' },
}

// ─── Component ──────────────────────────────────────────────────────────────

export function CustosERPPage() {
  const { contratos, fetchContratos, fetchObras } = useStore()
  const { perfilAtual } = usePerfilStore()
  const isAdmin = perfilAtual?.role === 'ADMIN'
  const fileRef = useRef<HTMLInputElement>(null)

  // Data
  const [custos, setCustos] = useState<CustoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [todasObras, setTodasObras] = useState<(Obra & { contrato_nome: string })[]>([])

  // TOTVS Config
  const [config, setConfig] = useState<TOTVSConfig>({
    host: '', usuario: '', senha: '', coligada: 1, filial: 1,
    contexto: 'TOTVS', timeout_ms: 30000, ativo: false,
  })
  const [configAberto, setConfigAberto] = useState(false)
  const [senhaVisivel, setSenhaVisivel] = useState(false)
  const [testando, setTestando] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [sincronizando, setSincronizando] = useState(false)

  // Import Excel
  const [preview, setPreview] = useState<CustoERP[]>([])
  const [importing, setImporting] = useState(false)
  const [obraImport, setObraImport] = useState<{ obraId: string; contratoId: string } | null>(null)

  // Filtros
  const [obraFiltro, setObraFiltro] = useState('todas')
  const [tipoFiltro, setTipoFiltro] = useState('todos')
  const [statusFiltro, setStatusFiltro] = useState('todos')

  // Sync params
  const [syncObra, setSyncObra] = useState('')
  const [syncCC, setSyncCC] = useState('')
  const [syncDtIni, setSyncDtIni] = useState('')
  const [syncDtFim, setSyncDtFim] = useState('')

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchContratos().then(async () => {
      const store = useStore.getState()
      const obrasAll: (Obra & { contrato_nome: string })[] = []
      for (const c of store.contratos) {
        const obs = await fetchObras(c.id)
        for (const o of obs) obrasAll.push({ ...o, contrato_nome: c.nome_obra })
      }
      setTodasObras(obrasAll)
      if (obrasAll.length > 0) {
        setObraImport({ obraId: obrasAll[0].id, contratoId: obrasAll[0].contrato_id })
        setSyncObra(obrasAll[0].id)
      }
    })
    fetchCustos()
    loadConfig()
  }, [])

  async function fetchCustos() {
    setLoading(true)
    const { data } = await supabase.from('custos_erp').select('*').order('data_emissao', { ascending: false }).limit(500)
    if (data) setCustos(data as CustoRow[])
    setLoading(false)
  }

  async function loadConfig() {
    const { data } = await supabase.from('totvs_config').select('*').limit(1).maybeSingle()
    if (data) {
      setConfig({
        host: data.host || '', usuario: data.usuario || '', senha: data.senha || '',
        coligada: data.coligada || 1, filial: data.filial || 1,
        contexto: data.contexto || 'TOTVS', timeout_ms: data.timeout_ms || 30000,
        ativo: data.ativo || false,
      })
    }
  }

  async function salvarConfig() {
    const { data: existing } = await supabase.from('totvs_config').select('id').limit(1).maybeSingle()
    const user = (await supabase.auth.getUser()).data.user
    const payload = { ...config, atualizado_por: user?.id }

    if (existing) {
      await supabase.from('totvs_config').update(payload).eq('id', existing.id)
    } else {
      await supabase.from('totvs_config').insert(payload)
    }
    toast.success('Configuração TOTVS salva!')
  }

  // ── Test Connection ───────────────────────────────────────────────────────

  async function handleTestarConexao() {
    if (!config.host) { toast.error('Configure o Host primeiro'); return }
    setTestando(true); setTestResult(null)
    const result = await testarConexao(config)
    setTestResult({ ok: result.ok, msg: result.mensagem })
    setTestando(false)
    if (result.ok) toast.success('Conexão OK!'); else toast.error(result.mensagem)
  }

  // ── Sync from RM ──────────────────────────────────────────────────────────

  async function handleSync(tipo: 'movimentos' | 'contas_pagar' | 'notas_fiscais') {
    if (!config.host || !config.ativo) { toast.error('Configure e ative a conexão TOTVS primeiro'); return }
    if (!syncObra) { toast.error('Selecione uma obra'); return }
    const obra = todasObras.find(o => o.id === syncObra)
    if (!obra) return

    setSincronizando(true)
    try {
      let result
      if (tipo === 'movimentos') result = await buscarMovimentos(config, syncCC || undefined, syncDtIni || undefined, syncDtFim || undefined)
      else if (tipo === 'contas_pagar') result = await buscarContasPagar(config, syncCC || undefined, syncDtIni || undefined, syncDtFim || undefined)
      else result = await buscarNotasFiscais(config, syncCC || undefined, syncDtIni || undefined, syncDtFim || undefined)

      if (!result.sucesso) { toast.error(result.mensagem); setSincronizando(false); return }
      if (result.registros === 0) { toast.success('Nenhum registro encontrado para os filtros'); setSincronizando(false); return }

      // Mapeia e insere
      const user = (await supabase.auth.getUser()).data.user
      const mapped = result.dados.map(d => ({
        ...mapMovimentoToCusto(d),
        obra_id: obra.id,
        contrato_id: obra.contrato_id,
        importado_por: user?.id,
        origem: 'API_RM' as const,
      }))

      // Deduplica por id_erp (não insere se já existe)
      const existingIds = new Set(custos.filter(c => c.id_erp).map(c => c.id_erp))
      const novos = mapped.filter(m => !m.id_erp || !existingIds.has(m.id_erp))

      if (novos.length === 0) { toast.success('Todos os registros já estão importados'); setSincronizando(false); return }

      const CHUNK = 50
      for (let i = 0; i < novos.length; i += CHUNK) {
        const { error } = await supabase.from('custos_erp').insert(novos.slice(i, i + CHUNK))
        if (error) throw error
      }

      // Atualiza última sync
      const { data: cfgRow } = await supabase.from('totvs_config').select('id').limit(1).maybeSingle()
      if (cfgRow) await supabase.from('totvs_config').update({ ultima_sync: new Date().toISOString(), status_sync: 'SUCESSO' }).eq('id', cfgRow.id)

      toast.success(`${novos.length} registros sincronizados do RM!`)
      fetchCustos()
    } catch (err: any) {
      toast.error(err.message || 'Erro na sincronização')
    }
    setSincronizando(false)
  }

  // ── Excel Import ──────────────────────────────────────────────────────────

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setImporting(true)
    try { const items = await importarCustosERP(file); setPreview(items); toast.success(`${items.length} registros carregados`) }
    catch (err: any) { toast.error(err.message || 'Erro ao ler arquivo') }
    setImporting(false); e.target.value = ''
  }

  async function confirmarImport() {
    if (!obraImport || preview.length === 0) return
    setImporting(true)
    try {
      const user = (await supabase.auth.getUser()).data.user
      const rows = preview.map(c => ({ obra_id: obraImport.obraId, contrato_id: obraImport.contratoId, importado_por: user?.id, ...c, origem: 'IMPORT_EXCEL' }))
      for (let i = 0; i < rows.length; i += 50) {
        const { error } = await supabase.from('custos_erp').insert(rows.slice(i, i + 50))
        if (error) throw error
      }
      toast.success(`${rows.length} custos importados!`); setPreview([]); fetchCustos()
    } catch (err: any) { toast.error(err.message) }
    setImporting(false)
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  const custosFiltrados = useMemo(() => {
    let list = custos
    if (obraFiltro !== 'todas') list = list.filter(c => c.obra_id === obraFiltro)
    if (tipoFiltro !== 'todos') list = list.filter(c => c.tipo_documento === tipoFiltro)
    if (statusFiltro !== 'todos') list = list.filter(c => c.status_pagamento === statusFiltro)
    return list
  }, [custos, obraFiltro, tipoFiltro, statusFiltro])

  const stats = useMemo(() => {
    const total = custosFiltrados.reduce((s, c) => s + c.valor_liquido, 0)
    const pago = custosFiltrados.filter(c => c.status_pagamento === 'PAGO').reduce((s, c) => s + c.valor_liquido, 0)
    const pendente = custosFiltrados.filter(c => c.status_pagamento === 'PENDENTE').reduce((s, c) => s + c.valor_liquido, 0)
    const vencido = custosFiltrados.filter(c => c.status_pagamento === 'VENCIDO').reduce((s, c) => s + c.valor_liquido, 0)
    return { total, pago, pendente, vencido, qtd: custosFiltrados.length }
  }, [custosFiltrados])

  const porTipo = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of custosFiltrados) map.set(c.tipo_documento, (map.get(c.tipo_documento) || 0) + c.valor_liquido)
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [custosFiltrados])

  const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"

  // ── RENDER ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-7xl overflow-y-auto" style={{ height: '100%' }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Custos ERP — TOTVS RM</h1>
          <p className="text-sm text-slate-500 mt-0.5">Sincronização via API REST e importação de relatórios</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchCustos} disabled={loading}
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/> Atualizar
          </button>
          <button onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
            <Upload size={14}/> Import Excel
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden"/>
        </div>
      </div>

      {/* ═══ TOTVS CONFIG (admin) ═══ */}
      {isAdmin && (
        <div className="bg-white rounded-xl border border-slate-200 mb-6 overflow-hidden">
          <button onClick={() => setConfigAberto(!configAberto)}
            className="w-full flex items-center gap-3 px-5 py-3.5 bg-gradient-to-r from-slate-800 to-slate-900 text-white hover:from-slate-700 transition-all">
            <Settings size={16}/>
            <span className="font-bold text-sm flex-1 text-left">Conexão TOTVS RM</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${config.ativo ? 'bg-emerald-500' : 'bg-slate-600'}`}>
              {config.ativo ? 'ATIVO' : 'INATIVO'}
            </span>
            {configAberto ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
          </button>

          {configAberto && (
            <div className="p-5 space-y-4 bg-slate-50/50">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
                <p className="font-bold mb-1">Como configurar:</p>
                <p>1. Rode o proxy (<code className="bg-blue-100 px-1 rounded">node proxy/totvs-proxy.mjs</code>) num servidor da rede interna da empresa</p>
                <p>2. Informe o IP:porta do proxy no campo Host abaixo</p>
                <p>3. Informe as credenciais do TOTVS RM e teste a conexão</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Host do Proxy / TOTVS RM</label>
                  <input value={config.host} onChange={e => setConfig(p => ({...p, host: e.target.value}))}
                    placeholder="http://192.168.1.100:3333" className={inputCls}/>
                  <p className="text-[10px] text-slate-400 mt-0.5">URL do proxy que roda na rede interna da empresa</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Usuário RM</label>
                  <input value={config.usuario} onChange={e => setConfig(p => ({...p, usuario: e.target.value}))}
                    placeholder="mestre" className={inputCls}/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Senha RM</label>
                  <div className="relative">
                    <input type={senhaVisivel ? 'text' : 'password'} value={config.senha}
                      onChange={e => setConfig(p => ({...p, senha: e.target.value}))} placeholder="••••••" className={inputCls}/>
                    <button onClick={() => setSenhaVisivel(!senhaVisivel)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {senhaVisivel ? <EyeOff size={14}/> : <Eye size={14}/>}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Coligada</label>
                  <input type="number" value={config.coligada} onChange={e => setConfig(p => ({...p, coligada: Number(e.target.value)}))}
                    className={inputCls}/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Filial</label>
                  <input type="number" value={config.filial} onChange={e => setConfig(p => ({...p, filial: Number(e.target.value)}))}
                    className={inputCls}/>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button onClick={handleTestarConexao} disabled={testando}
                  className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-white">
                  {testando ? <Loader2 size={14} className="animate-spin"/> : <Wifi size={14}/>}
                  Testar Conexão
                </button>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={config.ativo} onChange={e => setConfig(p => ({...p, ativo: e.target.checked}))}
                    className="rounded border-slate-300 text-amber-500 focus:ring-amber-400"/>
                  <span className="text-slate-700 font-medium">Integração ativa</span>
                </label>
                <button onClick={salvarConfig}
                  className="flex items-center gap-2 px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg text-sm ml-auto">
                  <CheckCircle2 size={14}/> Salvar Configuração
                </button>
              </div>

              {testResult && (
                <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm ${testResult.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {testResult.ok ? <CheckCircle2 size={14}/> : <XCircle size={14}/>}
                  {testResult.msg}
                </div>
              )}

              {/* ── Sync Panel ── */}
              {config.ativo && (
                <div className="bg-white border border-slate-200 rounded-xl p-4 mt-3">
                  <p className="font-bold text-sm text-slate-700 mb-3 flex items-center gap-2"><TrendingUp size={14} className="text-amber-500"/> Sincronizar do TOTVS RM</p>
                  <div className="grid grid-cols-4 gap-3 mb-3">
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 block mb-1">Obra destino</label>
                      <select value={syncObra} onChange={e => setSyncObra(e.target.value)} className={inputCls + ' text-xs'}>
                        {todasObras.map(o => <option key={o.id} value={o.id}>{o.contrato_nome} › {o.nome_obra}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 block mb-1">Centro de Custo (opc.)</label>
                      <input value={syncCC} onChange={e => setSyncCC(e.target.value)} placeholder="Ex: 01.001" className={inputCls + ' text-xs'}/>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 block mb-1">Data início</label>
                      <input type="date" value={syncDtIni} onChange={e => setSyncDtIni(e.target.value)} className={inputCls + ' text-xs'}/>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 block mb-1">Data fim</label>
                      <input type="date" value={syncDtFim} onChange={e => setSyncDtFim(e.target.value)} className={inputCls + ' text-xs'}/>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {(['movimentos','contas_pagar','notas_fiscais'] as const).map(tipo => (
                      <button key={tipo} onClick={() => handleSync(tipo)} disabled={sincronizando}
                        className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium disabled:opacity-50">
                        {sincronizando ? <Loader2 size={12} className="animate-spin"/> : <Play size={12}/>}
                        {tipo === 'movimentos' ? 'Movimentos' : tipo === 'contas_pagar' ? 'Contas a Pagar' : 'Notas Fiscais'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══ EXCEL PREVIEW ═══ */}
      {preview.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="font-bold text-amber-800">{preview.length} registros — Total: {formatCurrency(preview.reduce((s, c) => s + c.valor_liquido, 0))}</p>
            <div className="flex items-center gap-3">
              <select value={obraImport?.obraId||''} onChange={e => { const o=todasObras.find(x=>x.id===e.target.value); if(o) setObraImport({obraId:o.id,contratoId:o.contrato_id}) }}
                className="border border-amber-300 rounded-lg px-3 py-1.5 text-sm bg-white min-w-52">
                {todasObras.map(o => <option key={o.id} value={o.id}>{o.contrato_nome} › {o.nome_obra}</option>)}
              </select>
              <button onClick={() => setPreview([])} className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white">Cancelar</button>
              <button onClick={confirmarImport} disabled={importing}
                className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-sm">
                <CheckCircle2 size={13} className="inline mr-1"/> Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ STATS ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Custos', value: formatCurrency(stats.total), icon: DollarSign, color: 'from-slate-600 to-slate-700', sub: `${stats.qtd} docs` },
          { label: 'Pago', value: formatCurrency(stats.pago), icon: CheckCircle2, color: 'from-emerald-500 to-emerald-600' },
          { label: 'Pendente', value: formatCurrency(stats.pendente), icon: Clock, color: 'from-amber-500 to-amber-600' },
          { label: 'Vencido', value: formatCurrency(stats.vencido), icon: AlertTriangle, color: stats.vencido > 0 ? 'from-red-500 to-red-600' : 'from-slate-400 to-slate-500' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 p-5">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shadow-sm mb-3`}><Icon size={20} className="text-white"/></div>
            <p className="text-xl font-bold text-slate-800">{value}</p>
            <p className="text-xs text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      {/* ═══ BREAKDOWN ═══ */}
      {porTipo.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
          <p className="font-bold text-sm text-slate-700 mb-3">Custos por Categoria</p>
          <div className="space-y-2">
            {porTipo.map(([tipo, valor]) => {
              const pct = stats.total > 0 ? (valor / stats.total) * 100 : 0
              const cfg = TIPO_LABEL[tipo] || TIPO_LABEL.OUTROS
              return (
                <div key={tipo} className="flex items-center gap-3">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1 w-28 shrink-0 ${cfg.color}`}>{cfg.icon} {cfg.label}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden">
                    <div className="h-3 rounded-full bg-gradient-to-r from-amber-400 to-amber-500" style={{ width: `${pct}%` }}/>
                  </div>
                  <span className="text-xs font-bold text-slate-700 w-28 text-right shrink-0">{formatCurrency(valor)} <span className="text-slate-400 font-normal">({pct.toFixed(1)}%)</span></span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ═══ FILTROS ═══ */}
      <div className="flex items-center gap-3 mb-4">
        <Filter size={14} className="text-slate-400"/>
        <select value={obraFiltro} onChange={e => setObraFiltro(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs bg-white">
          <option value="todas">Todas as obras</option>
          {todasObras.map(o => <option key={o.id} value={o.id}>{o.contrato_nome} › {o.nome_obra}</option>)}
        </select>
        <select value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs bg-white">
          <option value="todos">Todos os tipos</option>
          {Object.entries(TIPO_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={statusFiltro} onChange={e => setStatusFiltro(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs bg-white">
          <option value="todos">Todos os status</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* ═══ TABELA ═══ */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="bg-slate-50 text-slate-500">
              {['Tipo','Origem','Fornecedor','Descrição','Nº Doc','Data','Valor','Status',''].map(h => (
                <th key={h} className="px-4 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {custosFiltrados.length === 0 ? (
                <tr><td colSpan={9} className="py-12 text-center text-slate-400">
                  {custos.length === 0 ? 'Nenhum custo importado. Use a API do RM ou importe um Excel.' : 'Nenhum resultado.'}
                </td></tr>
              ) : custosFiltrados.slice(0, 100).map(c => {
                const tp = TIPO_LABEL[c.tipo_documento] || TIPO_LABEL.OUTROS
                const st = STATUS_LABEL[c.status_pagamento] || STATUS_LABEL.PENDENTE
                return (
                  <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-4 py-2.5"><span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium inline-flex items-center gap-1 ${tp.color}`}>{tp.icon} {tp.label}</span></td>
                    <td className="px-4 py-2.5"><span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${c.origem === 'API_RM' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'}`}>{c.origem === 'API_RM' ? 'API' : 'Excel'}</span></td>
                    <td className="px-4 py-2.5 text-slate-700 max-w-40 truncate font-medium">{c.fornecedor || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-500 max-w-48 truncate">{c.descricao || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-500 font-mono">{c.numero_documento || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-500">{c.data_emissao ? formatDate(c.data_emissao) : '—'}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-slate-800">{formatCurrency(c.valor_liquido)}</td>
                    <td className="px-4 py-2.5"><span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${st.color}`}>{st.label}</span></td>
                    <td className="px-4 py-2.5">{isAdmin && <button onClick={() => { if(confirm('Excluir?')) supabase.from('custos_erp').delete().eq('id',c.id).then(()=>{setCustos(p=>p.filter(x=>x.id!==c.id));toast.success('Excluído')})}} className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50"><Trash2 size={12}/></button>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}