import { useEffect, useState, useCallback } from 'react'
import {
  ClipboardList, Camera, MapPin, Sun, Cloud, CloudRain, CloudDrizzle,
  ChevronRight, ChevronLeft, Check, AlertTriangle, Loader2, Wifi, WifiOff,
  RefreshCw, Clock, CheckCircle2, XCircle, Building2, Users, Plus, X,
  History, Send, Eye,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'
import { usePerfilStore } from '../lib/perfilStore'
import {
  getCachedObras, getCachedFuncoes, getCachedKanbanItens,
  salvarApontamentoOffline, salvarFotoOffline, getApontamentosOffline, countPendentes,
} from '../lib/offlineStore'
import { onSyncStatus, syncAll, syncCacheFromServer, initConnectivityListener } from '../lib/syncEngine'

const CLIMA_OPTS = [
  { val: 'SOL', label: 'Sol', icon: Sun },
  { val: 'NUBLADO', label: 'Nublado', icon: Cloud },
  { val: 'CHUVA', label: 'Chuva', icon: CloudRain },
  { val: 'CHUVOSO', label: 'Chuvoso', icon: CloudDrizzle },
]
const TURNO_OPTS = [
  { val: 'MANHA', label: 'Manhã' }, { val: 'TARDE', label: 'Tarde' }, { val: 'INTEGRAL', label: 'Integral' },
]
const OCORRENCIA_TIPOS = ['Atraso', 'Falta de material', 'Chuva', 'Acidente', 'Paralisação', 'Falta de mão de obra', 'Problema técnico']

interface ObraCache { id: string; nome_obra: string; local_obra: string; contrato_nome: string }
interface FuncaoCache { id: string; nome: string; ordem: number }
interface KanbanItemCache { id: string; descricao: string; obra_id: string }
interface FotoLocal { id: string; blob: Blob; preview: string; nome: string; legenda: string }

export function AppMobilePage() {
  const { perfilAtual } = usePerfilStore()
  const [tela, setTela] = useState<'obras' | 'wizard' | 'historico'>('obras')
  const [obras, setObras] = useState<ObraCache[]>([])
  const [obraSelecionada, setObraSelecionada] = useState<ObraCache | null>(null)
  const [syncStatus, setSyncStatus] = useState({ pendentes: 0, sincronizando: false, online: true, erro: '' })
  const [cacheLoaded, setCacheLoaded] = useState(false)

  // Wizard state
  const [step, setStep] = useState(0)
  const [wData, setWData] = useState(new Date().toISOString().split('T')[0])
  const [wHora, setWHora] = useState(new Date().toTimeString().substring(0, 5))
  const [wTurno, setWTurno] = useState('INTEGRAL')
  const [wClima, setWClima] = useState('SOL')
  const [wLat, setWLat] = useState<number | null>(null)
  const [wLng, setWLng] = useState<number | null>(null)
  const [wFuncoes, setWFuncoes] = useState<(FuncaoCache & { qtd: number })[]>([])
  const [wAtividades, setWAtividades] = useState('')
  const [wEquipamentos, setWEquipamentos] = useState('')
  const [wOcorrencias, setWOcorrencias] = useState<string[]>([])
  const [wObs, setWObs] = useState('')
  const [wPQE, setWPQE] = useState<(KanbanItemCache & { status: string; obs: string })[]>([])
  const [wFotos, setWFotos] = useState<FotoLocal[]>([])
  const [salvando, setSalvando] = useState(false)

  // Histórico
  const [historico, setHistorico] = useState<any[]>([])

  useEffect(() => {
    initConnectivityListener()
    const unsub = onSyncStatus(s => setSyncStatus({ ...s, erro: s.erro || '' }))
    return unsub
  }, [])

  useEffect(() => {
    if (perfilAtual) loadCache()
  }, [perfilAtual])

  async function loadCache() {
    if (!perfilAtual) return
    if (navigator.onLine) {
      await syncCacheFromServer(perfilAtual.id)
    }
    const obrasC = await getCachedObras()
    setObras(obrasC)
    setCacheLoaded(true)
  }

  async function selecionarObra(obra: ObraCache) {
    setObraSelecionada(obra)
    // Load funções e PQE para o wizard
    const funcoes = await getCachedFuncoes()
    setWFuncoes(funcoes.map(f => ({ ...f, qtd: 0 })))
    const kanban = await getCachedKanbanItens(obra.id)
    setWPQE(kanban.map(k => ({ ...k, status: '', obs: '' })))
    // GPS
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => { setWLat(pos.coords.latitude); setWLng(pos.coords.longitude) },
        () => {}, { enableHighAccuracy: true, timeout: 10000 }
      )
    }
    // Reset wizard
    setStep(0); setWData(new Date().toISOString().split('T')[0]); setWHora(new Date().toTimeString().substring(0, 5))
    setWTurno('INTEGRAL'); setWClima('SOL'); setWAtividades(''); setWEquipamentos(''); setWOcorrencias([])
    setWObs(''); setWFotos([])
    setTela('wizard')
  }

  async function verHistorico(obra: ObraCache) {
    setObraSelecionada(obra)
    const apts = await getApontamentosOffline(obra.id)
    setHistorico(apts.sort((a: any, b: any) => b.created_at.localeCompare(a.created_at)))
    setTela('historico')
  }

  function addFoto(file: File) {
    const id = crypto.randomUUID()
    const preview = URL.createObjectURL(file)
    setWFotos(prev => [...prev, { id, blob: file, preview, nome: file.name, legenda: '' }])
  }

  function removeFoto(id: string) {
    setWFotos(prev => { prev.find(f => f.id === id)?.preview && URL.revokeObjectURL(prev.find(f => f.id === id)!.preview); return prev.filter(f => f.id !== id) })
  }

  async function salvarApontamento() {
    if (!obraSelecionada) return
    setSalvando(true)
    try {
      const syncId = crypto.randomUUID()
      // Salva apontamento no IndexedDB
      await salvarApontamentoOffline({
        sync_id: syncId, obra_id: obraSelecionada.id, data: wData, hora: wHora,
        turno: wTurno, clima: wClima, latitude: wLat, longitude: wLng,
        atividades: wAtividades, equipamentos: wEquipamentos,
        ocorrencias: wOcorrencias.map(o => ({ tipo: o })),
        observacoes: wObs,
        mao_obra: wFuncoes.filter(f => f.qtd > 0).map(f => ({ funcao_id: f.id, funcao_nome: f.nome, quantidade: f.qtd })),
        pqe: wPQE.filter(p => p.status).map(p => ({ kanban_item_id: p.id, descricao: p.descricao, status: p.status, observacao: p.obs })),
        created_at: new Date().toISOString(), status: 'PENDENTE',
      })
      // Salva fotos
      for (const foto of wFotos) {
        await salvarFotoOffline({ id: foto.id, sync_id: syncId, blob: foto.blob, nome: foto.nome, legenda: foto.legenda, status: 'PENDENTE' })
      }
      toast.success('Apontamento salvo! Será sincronizado automaticamente.')
      // Tenta sincronizar imediatamente
      if (navigator.onLine) syncAll()
      setTela('obras')
    } catch (err: any) { toast.error(err.message || 'Erro ao salvar') }
    setSalvando(false)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col" style={{ maxWidth: '100vw', overflow: 'hidden' }}>
      {/* Header fixo */}
      <header className="bg-slate-900 text-white px-4 py-3 flex items-center gap-3 shrink-0 sticky top-0 z-30">
        {tela !== 'obras' && (
          <button onClick={() => setTela('obras')} className="p-1"><ChevronLeft size={20}/></button>
        )}
        <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center shrink-0">
          <span className="text-slate-900 font-bold text-xs">RD</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate">{tela === 'obras' ? 'Central de Obras' : obraSelecionada?.nome_obra}</p>
          <p className="text-[10px] text-slate-400 truncate">{perfilAtual?.nome || 'Apontador'}</p>
        </div>
        {/* Sync indicator */}
        <div className="flex items-center gap-2 shrink-0">
          {syncStatus.pendentes > 0 && (
            <span className="text-[10px] bg-primary-500 text-slate-900 px-2 py-0.5 rounded-full font-bold">{syncStatus.pendentes}</span>
          )}
          {syncStatus.sincronizando ? (
            <Loader2 size={16} className="text-primary-400 animate-spin"/>
          ) : syncStatus.online ? (
            <Wifi size={16} className="text-emerald-400"/>
          ) : (
            <WifiOff size={16} className="text-red-400"/>
          )}
          <button onClick={() => { if (navigator.onLine) { loadCache(); syncAll() } }} className="p-1 hover:bg-slate-700 rounded">
            <RefreshCw size={14} className="text-slate-400"/>
          </button>
        </div>
      </header>

      {/* ═══ TELA: SELECIONAR OBRA ═══ */}
      {tela === 'obras' && (
        <div className="flex-1 p-4 overflow-y-auto">
          {!syncStatus.online && (
            <div className="bg-primary-50 border border-primary-200 rounded-xl p-3 mb-4 flex items-center gap-2 text-xs text-primary-800">
              <WifiOff size={14}/> Modo offline — apontamentos serão sincronizados quando conectar
            </div>
          )}
          {!cacheLoaded ? (
            <div className="text-center py-16"><Loader2 size={24} className="animate-spin mx-auto text-slate-400"/></div>
          ) : obras.length === 0 ? (
            <div className="text-center py-16">
              <Building2 size={36} className="mx-auto text-slate-300 mb-3"/>
              <p className="text-slate-500 text-sm">Nenhuma obra vinculada</p>
              <p className="text-xs text-slate-400 mt-1">Peça ao admin para vincular obras ao seu perfil</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-bold text-slate-800 mb-2">Minhas Obras ({obras.length})</p>
              {obras.map(obra => (
                <div key={obra.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center shrink-0">
                        <Building2 size={18} className="text-primary-600"/>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">{obra.nome_obra}</p>
                        <p className="text-[10px] text-slate-400">{obra.local_obra} · {obra.contrato_nome}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => selecionarObra(obra)}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-primary-500 hover:bg-primary-600 text-white text-xs font-bold rounded-lg">
                        <ClipboardList size={14}/> Novo Apontamento
                      </button>
                      <button onClick={() => verHistorico(obra)}
                        className="flex items-center gap-1.5 px-3 py-2.5 border border-slate-200 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-50">
                        <History size={14}/> Histórico
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ TELA: WIZARD ═══ */}
      {tela === 'wizard' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Steps indicator */}
          <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-2">
            {['Geral', 'Mão de obra', 'PQE', 'Fotos & Obs'].map((label, i) => (
              <button key={i} onClick={() => setStep(i)} className={`flex-1 text-center py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                step === i ? 'bg-primary-500 text-white' : i < step ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
              }`}>{label}</button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {/* STEP 0: Geral */}
            {step === 0 && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs font-semibold text-slate-600 block mb-1">Data</label>
                    <input type="date" value={wData} onChange={e => setWData(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm"/></div>
                  <div><label className="text-xs font-semibold text-slate-600 block mb-1">Hora</label>
                    <input type="time" value={wHora} onChange={e => setWHora(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm"/></div>
                </div>
                <div><label className="text-xs font-semibold text-slate-600 block mb-2">Turno</label>
                  <div className="grid grid-cols-3 gap-2">
                    {TURNO_OPTS.map(t => (
                      <button key={t.val} onClick={() => setWTurno(t.val)}
                        className={`py-2.5 rounded-lg text-xs font-bold border transition-all ${wTurno === t.val ? 'bg-primary-500 text-white border-primary-500' : 'bg-white text-slate-600 border-slate-200'}`}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div><label className="text-xs font-semibold text-slate-600 block mb-2">Clima</label>
                  <div className="grid grid-cols-4 gap-2">
                    {CLIMA_OPTS.map(c => {
                      const Icon = c.icon
                      return (
                        <button key={c.val} onClick={() => setWClima(c.val)}
                          className={`py-3 rounded-lg text-xs font-bold border flex flex-col items-center gap-1 transition-all ${wClima === c.val ? 'bg-primary-500 text-white border-primary-500' : 'bg-white text-slate-600 border-slate-200'}`}>
                          <Icon size={18}/> {c.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div><label className="text-xs font-semibold text-slate-600 block mb-1">Atividades executadas</label>
                  <textarea value={wAtividades} onChange={e => setWAtividades(e.target.value)} rows={3}
                    placeholder="Descreva as atividades realizadas na obra hoje..."
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"/>
                </div>
                <div><label className="text-xs font-semibold text-slate-600 block mb-1">Equipamentos em uso</label>
                  <input value={wEquipamentos} onChange={e => setWEquipamentos(e.target.value)}
                    placeholder="Ex: Betoneira, retroescavadeira..."
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm"/>
                </div>
                {wLat && <p className="text-[10px] text-slate-400 flex items-center gap-1"><MapPin size={10}/> GPS: {wLat.toFixed(4)}, {wLng?.toFixed(4)}</p>}
              </div>
            )}

            {/* STEP 1: Mão de obra */}
            {step === 1 && (
              <div className="space-y-2">
                <p className="text-xs text-slate-500 mb-3">Informe a quantidade de trabalhadores por função presentes na obra</p>
                {wFuncoes.map((f, i) => (
                  <div key={f.id} className="flex items-center gap-3 bg-white border border-slate-200 rounded-lg px-4 py-3">
                    <span className="flex-1 text-sm text-slate-700 font-medium">{f.nome}</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => { const n = [...wFuncoes]; n[i].qtd = Math.max(0, n[i].qtd - 1); setWFuncoes(n) }}
                        className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 text-lg font-bold">-</button>
                      <span className="w-8 text-center text-sm font-bold text-slate-800">{f.qtd}</span>
                      <button onClick={() => { const n = [...wFuncoes]; n[i].qtd += 1; setWFuncoes(n) }}
                        className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center text-white text-lg font-bold">+</button>
                    </div>
                  </div>
                ))}
                <div className="bg-primary-50 border border-primary-200 rounded-lg px-4 py-2.5 flex items-center justify-between text-sm">
                  <span className="text-primary-800 font-bold">Total</span>
                  <span className="text-primary-800 font-bold text-lg">{wFuncoes.reduce((s, f) => s + f.qtd, 0)}</span>
                </div>
              </div>
            )}

            {/* STEP 2: Conferência PQE */}
            {step === 2 && (
              <div className="space-y-3">
                {wPQE.length === 0 ? (
                  <div className="text-center py-8">
                    <CheckCircle2 size={32} className="mx-auto text-slate-300 mb-2"/>
                    <p className="text-sm text-slate-400">Nenhum serviço em execução na quinzena</p>
                    <p className="text-[10px] text-slate-300 mt-1">O Kanban não tem cards "Em Execução" para esta obra</p>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-slate-500 mb-2">Confira os serviços planejados para a quinzena:</p>
                    {wPQE.map((item, i) => (
                      <div key={item.id} className={`bg-white border rounded-xl p-4 ${
                        item.status === 'CONFIRMADO' ? 'border-emerald-300 bg-emerald-50/30' :
                        item.status === 'PROBLEMA' ? 'border-red-300 bg-red-50/30' : 'border-slate-200'
                      }`}>
                        <p className="text-sm text-slate-800 font-medium mb-3">{item.descricao}</p>
                        <div className="flex gap-2 mb-2">
                          <button onClick={() => { const n = [...wPQE]; n[i].status = n[i].status === 'CONFIRMADO' ? '' : 'CONFIRMADO'; setWPQE(n) }}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold border transition-all ${
                              item.status === 'CONFIRMADO' ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-white text-slate-600 border-slate-200'
                            }`}><CheckCircle2 size={14}/> Em execução</button>
                          <button onClick={() => { const n = [...wPQE]; n[i].status = n[i].status === 'PROBLEMA' ? '' : 'PROBLEMA'; setWPQE(n) }}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold border transition-all ${
                              item.status === 'PROBLEMA' ? 'bg-red-500 text-white border-red-500' : 'bg-white text-slate-600 border-slate-200'
                            }`}><AlertTriangle size={14}/> Problema</button>
                        </div>
                        {item.status === 'PROBLEMA' && (
                          <input value={item.obs} onChange={e => { const n = [...wPQE]; n[i].obs = e.target.value; setWPQE(n) }}
                            placeholder="Descreva o problema..." className="w-full border border-red-200 rounded-lg px-3 py-2 text-xs mt-1"/>
                        )}
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            {/* STEP 3: Fotos, Ocorrências, Observações */}
            {step === 3 && (
              <div className="space-y-4">
                {/* Fotos */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-2">Fotos</label>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    {wFotos.map(f => (
                      <div key={f.id} className="relative rounded-lg overflow-hidden border border-slate-200">
                        <img src={f.preview} alt="" className="w-full h-20 object-cover"/>
                        <button onClick={() => removeFoto(f.id)}
                          className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center">
                          <X size={10}/>
                        </button>
                        <input value={f.legenda} onChange={e => setWFotos(prev => prev.map(p => p.id === f.id ? { ...p, legenda: e.target.value } : p))}
                          placeholder="Legenda..." className="w-full text-[10px] px-2 py-1 border-t border-slate-200"/>
                      </div>
                    ))}
                    <label className="flex flex-col items-center justify-center h-20 border-2 border-dashed border-slate-200 rounded-lg cursor-pointer hover:border-primary-400 hover:bg-primary-50/50">
                      <Camera size={20} className="text-slate-300"/>
                      <span className="text-[10px] text-slate-400 mt-1">Tirar foto</span>
                      <input type="file" accept="image/*" capture="environment" onChange={e => { const f = e.target.files?.[0]; if (f) addFoto(f); e.target.value = '' }} className="hidden"/>
                    </label>
                  </div>
                </div>

                {/* Ocorrências */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-2">Ocorrências</label>
                  <div className="flex flex-wrap gap-2">
                    {OCORRENCIA_TIPOS.map(oc => {
                      const active = wOcorrencias.includes(oc)
                      return (
                        <button key={oc} onClick={() => setWOcorrencias(active ? wOcorrencias.filter(o => o !== oc) : [...wOcorrencias, oc])}
                          className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                            active ? 'bg-red-500 text-white border-red-500' : 'bg-white text-slate-600 border-slate-200'
                          }`}>{oc}</button>
                      )
                    })}
                  </div>
                </div>

                {/* Observações */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Observações gerais</label>
                  <textarea value={wObs} onChange={e => setWObs(e.target.value)} rows={3}
                    placeholder="Observações adicionais..." className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"/>
                </div>
              </div>
            )}
          </div>

          {/* Footer com navegação */}
          <div className="bg-white border-t border-slate-200 px-4 py-3 flex gap-3 shrink-0">
            {step > 0 ? (
              <button onClick={() => setStep(step - 1)} className="flex items-center gap-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-600">
                <ChevronLeft size={14}/> Anterior
              </button>
            ) : (
              <button onClick={() => setTela('obras')} className="px-4 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-600">Cancelar</button>
            )}
            <div className="flex-1"/>
            {step < 3 ? (
              <button onClick={() => setStep(step + 1)}
                className="flex items-center gap-1 px-6 py-2.5 bg-primary-500 hover:bg-primary-600 text-white font-bold rounded-lg text-sm">
                Próximo <ChevronRight size={14}/>
              </button>
            ) : (
              <button onClick={salvarApontamento} disabled={salvando}
                className="flex items-center gap-2 px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg text-sm disabled:opacity-50">
                {salvando ? <Loader2 size={14} className="animate-spin"/> : <Send size={14}/>} Salvar
              </button>
            )}
          </div>
        </div>
      )}

      {/* ═══ TELA: HISTÓRICO ═══ */}
      {tela === 'historico' && (
        <div className="flex-1 overflow-y-auto p-4">
          <p className="text-sm font-bold text-slate-800 mb-3">Histórico — {obraSelecionada?.nome_obra}</p>
          {historico.length === 0 ? (
            <div className="text-center py-12">
              <History size={32} className="mx-auto text-slate-300 mb-2"/>
              <p className="text-sm text-slate-400">Nenhum apontamento registrado</p>
            </div>
          ) : (
            <div className="space-y-3">
              {historico.map((apt: any) => (
                <div key={apt.sync_id} className={`bg-white border rounded-xl p-4 ${apt.status === 'SINCRONIZADO' ? 'border-emerald-200' : apt.status === 'ERRO' ? 'border-red-200' : 'border-primary-200'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-800">{apt.data}</span>
                      <span className="text-xs text-slate-400">{apt.hora}</span>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      apt.status === 'SINCRONIZADO' ? 'bg-emerald-100 text-emerald-700' :
                      apt.status === 'ERRO' ? 'bg-red-100 text-red-700' :
                      apt.status === 'SINCRONIZANDO' ? 'bg-blue-100 text-blue-700' :
                      'bg-primary-100 text-primary-700'
                    }`}>{apt.status === 'SINCRONIZADO' ? 'Sincronizado' : apt.status === 'ERRO' ? 'Erro' : apt.status === 'SINCRONIZANDO' ? 'Enviando...' : 'Pendente'}</span>
                  </div>
                  {apt.atividades && <p className="text-xs text-slate-600 mb-1">{apt.atividades}</p>}
                  <div className="flex gap-3 text-[10px] text-slate-400 flex-wrap">
                    <span>{apt.turno}</span>
                    <span>{apt.clima}</span>
                    {apt.mao_obra?.length > 0 && <span>MO: {apt.mao_obra.reduce((s: number, m: any) => s + m.quantidade, 0)}</span>}
                    {apt.pqe?.length > 0 && <span>PQE: {apt.pqe.filter((p: any) => p.status).length} conferido(s)</span>}
                    {apt.ocorrencias?.length > 0 && <span className="text-red-500">{apt.ocorrencias.length} ocorrência(s)</span>}
                  </div>
                  {apt.erro && <p className="text-[10px] text-red-500 mt-1">Erro: {apt.erro}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
