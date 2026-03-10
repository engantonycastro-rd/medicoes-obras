/**
 * ModeloEditor — editor visual "tipo Excel" de modelos de planilha.
 * Exclusivo para ADMINs na aba Configurações.
 */
import { useState, useMemo, useCallback } from 'react'
import {
  TableProperties, Trash2, Copy, RotateCcw, Save,
  Palette, Type, Rows3, Eye, ChevronDown, ChevronRight,
  Check, MousePointer, Info, Lock,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useModeloStore, ModeloPlanilha, BorderStyle } from '../lib/modeloStore'

// ─── Zonas clicáveis ──────────────────────────────────────────────────────────

interface ZonaDef {
  id: string; label: string; desc: string
  corKey: keyof ModeloPlanilha['cores']
  bordaKey?: keyof ModeloPlanilha['bordas']
}

const ZONAS: ZonaDef[] = [
  { id:'hdr_topo',      label:'Faixa topo / N° Medição',   desc:'Faixa colorida no topo e bloco com o número da medição',  corKey:'hdr_topo' },
  { id:'hdr_principal', label:'Título principal (órgão)',   desc:'Bloco com nome do órgão contratante',                    corKey:'hdr_principal', bordaKey:'externo' },
  { id:'hdr_sub',       label:'Subdivisão do órgão',        desc:'Bloco de coordenadoria/secretaria',                      corKey:'hdr_sub' },
  { id:'hdr_cabec',     label:'Infos da obra',              desc:'Obra, local, contrato, empresa, BDI...',                 corKey:'hdr_cabec' },
  { id:'empresa_bg',    label:'Bloco logo / empresa',       desc:'Fundo da célula com logo ou nome da empresa',            corKey:'empresa_bg' },
  { id:'th_base',       label:'TH — Planilha Base',         desc:'Cabeçalho das colunas fixas (item, código, descrição...)',corKey:'th_base',    bordaKey:'cabec' },
  { id:'th_medicao',    label:'TH — Planilha de Medição',   desc:'Cabeçalho das colunas de quantidades e valores',         corKey:'th_medicao', bordaKey:'cabec' },
  { id:'linha_grupo',   label:'Linha de grupo / etapa',     desc:'Linhas que representam grupos/etapas do orçamento',      corKey:'linha_grupo', bordaKey:'dados' },
  { id:'linha_par',     label:'Linha de dado par',          desc:'Fundo das linhas pares de serviços',                     corKey:'linha_par',   bordaKey:'dados' },
  { id:'linha_impar',   label:'Linha de dado ímpar',        desc:'Fundo das linhas ímpares de serviços',                  corKey:'linha_impar', bordaKey:'dados' },
  { id:'linha_periodo', label:'Serviço medido no período',  desc:'Destaque para células com quantidade medida > 0',        corKey:'linha_periodo', bordaKey:'dados' },
  { id:'linha_100pct',  label:'Serviço 100% executado',     desc:'Célula quando saldo chegou a zero',                      corKey:'linha_100pct', bordaKey:'dados' },
  { id:'linha_total',   label:'Linha TOTAIS GERAIS',        desc:'Linha de totais no rodapé da tabela de serviços',        corKey:'linha_total', bordaKey:'totais' },
  { id:'mem_titulo',    label:'Memória — título',           desc:'Barra de título da aba Memória de Cálculo',              corKey:'mem_titulo' },
  { id:'mem_grupo',     label:'Memória — grupo',            desc:'Linha de grupo na memória de cálculo',                   corKey:'mem_grupo' },
  { id:'mem_apagar',    label:'Memória — A pagar',          desc:'Linhas com status "A pagar"',                            corKey:'mem_apagar' },
  { id:'mem_pago',      label:'Memória — Pago',             desc:'Linhas com status "Pago"',                               corKey:'mem_pago' },
  { id:'mem_tot_acum',  label:'Memória — total acumulado',  desc:'Rodapé: total acumulado',                                corKey:'mem_tot_acum' },
  { id:'mem_tot_ant',   label:'Memória — total anterior',   desc:'Rodapé: total acumulado anterior',                       corKey:'mem_tot_ant' },
  { id:'mem_tot_mes',   label:'Memória — total do mês',     desc:'Rodapé: total do mês (a pagar)',                         corKey:'mem_tot_mes' },
  { id:'extenso_bg',    label:'Valor por extenso (fundo)',  desc:'Célula com o valor escrito por extenso',                 corKey:'extenso_bg' },
  { id:'demo_cabec',    label:'Demonstrativo financeiro',   desc:'Cabeçalho do bloco demonstrativo financeiro',            corKey:'demo_cabec' },
]

const GRUPOS_COR = [
  { titulo:'Cabeçalho',            ids:['hdr_topo','hdr_principal','hdr_sub','hdr_cabec','empresa_bg'] },
  { titulo:'Cabeçalho da Tabela',  ids:['th_base','th_medicao'] },
  { titulo:'Linhas de Dados',      ids:['linha_grupo','linha_par','linha_impar','linha_periodo','linha_100pct','linha_total'] },
  { titulo:'Memória de Cálculo',   ids:['mem_titulo','mem_grupo','mem_apagar','mem_pago','mem_tot_acum','mem_tot_ant','mem_tot_mes'] },
  { titulo:'Extenso / Demo',       ids:['extenso_bg','demo_cabec'] },
]

const BORDAS_OPT = [
  { v:'none'    as BorderStyle, l:'Sem',    css:'none' },
  { v:'thin'    as BorderStyle, l:'Fina',   css:'1.5px solid #666' },
  { v:'medium'  as BorderStyle, l:'Média',  css:'2.5px solid #333' },
  { v:'thick'   as BorderStyle, l:'Grossa', css:'3.5px solid #111' },
]

const FONTES = ['Arial','Arial Narrow','Calibri','Times New Roman'] as const

const QUICK_COLORS = [
  'FFFFFF','F0F0F0','D9D9D9','BFBFBF','BDD7EE','DEEAF1','FFF2CC','FFE699',
  'E2EFDA','C6EFCE','1F3864','2E75B6','375623','70AD47','ED7D31','000000',
]

// ─── helpers ─────────────────────────────────────────────────────────────────

const hx = (c: string) => `#${c.replace('#','')}`

function txtContrast(c: string): string {
  const s = c.replace('#','')
  const r = parseInt(s.slice(0,2),16), g = parseInt(s.slice(2,4),16), b = parseInt(s.slice(4,6),16)
  return (0.299*r + 0.587*g + 0.114*b) / 255 > 0.55 ? '#333' : '#fff'
}

// ─── SelBadge ────────────────────────────────────────────────────────────────

function SelBadge() {
  return (
    <div style={{position:'absolute',top:2,right:2,zIndex:10,background:'#6366f1',color:'#fff',borderRadius:3,padding:'1px 4px',fontSize:7,fontWeight:'bold',display:'flex',alignItems:'center',gap:2,pointerEvents:'none',boxShadow:'0 1px 4px rgba(0,0,0,0.25)'}}>
      <Check size={7}/> selecionado
    </div>
  )
}

// ─── ColorRow ────────────────────────────────────────────────────────────────

function ColorRow({ label, value, onChange, disabled }:
  { label:string; value:string; onChange:(v:string)=>void; disabled?:boolean }) {
  return (
    <div className="flex items-center gap-2.5 py-2 border-b border-slate-50 last:border-0">
      <div className="w-6 h-6 rounded-lg border border-white shadow-sm shrink-0" style={{background:hx(value)}}/>
      <span className="flex-1 text-xs text-slate-600 leading-tight">{label}</span>
      {disabled ? (
        <span className="text-[10px] text-slate-400 font-mono">#{value.toUpperCase()}</span>
      ) : (
        <div className="flex items-center gap-1.5 shrink-0">
          <input type="color" value={hx(value)}
            onChange={e => onChange(e.target.value.replace('#','').toUpperCase())}
            className="w-8 h-7 rounded cursor-pointer border border-slate-200 p-0.5 hover:border-indigo-400 transition-colors"
          />
          <input type="text" value={value.toUpperCase()}
            onChange={e => { const v=e.target.value.replace('#','').toUpperCase(); if(/^[0-9A-F]{0,6}$/.test(v)) onChange(v) }}
            maxLength={6}
            className="w-16 border border-slate-200 rounded px-1.5 py-1 text-[10px] font-mono text-center focus:outline-none focus:ring-1 focus:ring-indigo-400 uppercase"
          />
        </div>
      )}
    </div>
  )
}

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────

export function ModeloEditor() {
  const { modelos, salvarModelo, deletarModelo, clonarModelo, resetModelo } = useModeloStore()

  const [selId,       setSelId]       = useState(modelos[0]?.id ?? '')
  const [draft,       setDraft]       = useState<ModeloPlanilha | null>(null)
  const [zonaAtiva,   setZonaAtiva]   = useState<string | null>(null)
  const [aba,         setAba]         = useState<'visual'|'cores'|'fonte'|'bordas'>('visual')
  const [grupoAberto, setGrupoAberto] = useState(0)
  const [cloneNome,   setCloneNome]   = useState('')
  const [showClone,   setShowClone]   = useState(false)
  const [showHelp,    setShowHelp]    = useState(false)

  const cur = useMemo(
    () => draft ?? modelos.find(m => m.id===selId) ?? modelos[0],
    [draft, modelos, selId]
  )
  const zonaInfo = useMemo(() => ZONAS.find(z => z.id===zonaAtiva), [zonaAtiva])
  const editing = !!draft

  function selecionar(id: string) {
    if (draft && !confirm('Descartar alterações não salvas?')) return
    setSelId(id); setDraft(null); setZonaAtiva(null)
  }

  function iniciarEdicao() {
    const m = modelos.find(x => x.id===selId)
    if (m) { setDraft(JSON.parse(JSON.stringify(m))); setAba('visual') }
  }

  const setCor = useCallback((k: keyof ModeloPlanilha['cores'], v: string) =>
    setDraft(d => d ? { ...d, cores:{ ...d.cores, [k]:v.replace('#','').toUpperCase() } } : d), [])

  const setFonte = useCallback((k: keyof ModeloPlanilha['fonte'], v: any) =>
    setDraft(d => d ? { ...d, fonte:{ ...d.fonte, [k]:v } } : d), [])

  const setBorda = useCallback((k: keyof ModeloPlanilha['bordas'], v: BorderStyle) =>
    setDraft(d => d ? { ...d, bordas:{ ...d.bordas, [k]:v } } : d), [])

  function salvar() {
    if (!draft) return
    salvarModelo(draft); setDraft(null)
    toast.success(`Modelo "${draft.nome}" salvo!`)
  }

  function handleClone() {
    if (!cloneNome.trim()) { toast.error('Informe um nome'); return }
    const c = clonarModelo(selId, cloneNome.trim())
    setSelId(c.id); setCloneNome(''); setShowClone(false)
    toast.success(`Modelo "${c.nome}" criado!`)
  }

  function handleDelete(m: ModeloPlanilha) {
    if (m.builtin) { toast.error('Modelos padrão não podem ser deletados'); return }
    if (!confirm(`Deletar "${m.nome}"?`)) return
    deletarModelo(m.id); setSelId(modelos.find(x=>x.id!==m.id)?.id??'')
    toast.success('Modelo deletado')
  }

  function handleReset(m: ModeloPlanilha) {
    if (!m.builtin) { toast.error('Reset só disponível para modelos padrão'); return }
    if (!confirm(`Restaurar "${m.nome}" para os valores padrão?`)) return
    resetModelo(m.id); setDraft(null); setZonaAtiva(null)
    toast.success('Restaurado!')
  }

  function clicarZona(zoneId: string) {
    if (!editing) { iniciarEdicao(); setTimeout(() => setZonaAtiva(zoneId), 50) }
    else setZonaAtiva(prev => prev===zoneId ? null : zoneId)
  }

  function zs(zoneId: string, extra?: React.CSSProperties): React.CSSProperties {
    if (!cur) return {}
    const z  = ZONAS.find(z => z.id===zoneId)
    const bg = hx(cur.cores[z?.corKey ?? 'hdr_topo'] ?? 'FFFFFF')
    const sel = zonaAtiva===zoneId && editing
    const bk  = z?.bordaKey
    const bStyle = bk
      ? cur.bordas[bk]==='thin'   ? '1px solid #888'
      : cur.bordas[bk]==='medium' ? '2px solid #555'
      : cur.bordas[bk]==='thick'  ? '3px solid #222'
      : undefined : undefined
    return {
      background: bg,
      border: sel ? '2.5px solid #6366f1' : bStyle,
      outline: sel ? '2.5px solid #a5b4fc' : undefined,
      outlineOffset: sel ? '-1px' : undefined,
      cursor: 'pointer',
      transition: 'all 0.1s',
      color: txtContrast(cur.cores[z?.corKey ?? 'hdr_topo'] ?? 'FFFFFF'),
      position: 'relative',
      ...extra,
    }
  }

  if (!cur) return null
  const C = cur.cores

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden" style={{minHeight:740}}>

      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 bg-slate-50/40">
        <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center shrink-0">
          <TableProperties size={18} className="text-indigo-600"/>
        </div>
        <div className="flex-1">
          <h2 className="font-bold text-slate-800 text-sm">Editor de Modelos de Planilha</h2>
          <p className="text-xs text-slate-500 mt-0.5">Clique em qualquer zona da prévia para editar cores, bordas e fontes em tempo real</p>
        </div>
        <button onClick={() => setShowHelp(!showHelp)}
          className={`p-2 rounded-lg transition-colors ${showHelp?'bg-indigo-100 text-indigo-600':'text-slate-400 hover:bg-indigo-50 hover:text-indigo-500'}`}>
          <Info size={15}/>
        </button>
      </div>

      {showHelp && (
        <div className="bg-indigo-50 border-b border-indigo-100 px-5 py-3 text-xs text-indigo-700 flex items-start gap-2">
          <MousePointer size={13} className="shrink-0 mt-0.5"/>
          <span>
            <strong>Como usar:</strong> Clique em <em>Editar modelo</em>, depois clique em qualquer célula colorida da prévia.
            O painel lateral mostra a cor de fundo com picker, paleta rápida e espessura de borda daquela região.
            As alterações refletem em tempo real. Clique em <strong>Salvar modelo</strong> para persistir.
          </span>
        </div>
      )}

      <div className="flex" style={{minHeight:680}}>

        {/* Sidebar */}
        <div className="w-52 border-r border-slate-100 flex flex-col bg-slate-50/50 shrink-0">
          <div className="p-3 flex-1 overflow-y-auto">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 mb-2">Modelos</p>
            <div className="space-y-1">
              {modelos.map(m => (
                <button key={m.id} onClick={() => selecionar(m.id)}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl text-left transition-all text-xs ${
                    selId===m.id ? 'bg-indigo-500 text-white shadow-sm' : 'hover:bg-white text-slate-600'
                  }`}>
                  <div className="shrink-0 rounded-md overflow-hidden border border-white/30 flex flex-col gap-px">
                    <div className="w-7 h-3" style={{background:hx(m.cores.hdr_principal)}}/>
                    <div className="w-7 h-3" style={{background:hx(m.cores.th_medicao)}}/>
                    <div className="w-7 h-2" style={{background:hx(m.cores.linha_grupo)}}/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate leading-tight">{m.nome}</p>
                    <p className={`text-[9px] mt-0.5 ${selId===m.id?'text-indigo-200':'text-slate-400'}`}>
                      {m.builtin ? '🔒 Padrão' : `base: ${m.base}`}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="p-3 border-t border-slate-100">
            {showClone ? (
              <div className="space-y-1.5">
                <p className="text-[10px] text-slate-400">Copiar <em>{cur.nome}</em>:</p>
                <input value={cloneNome} onChange={e => setCloneNome(e.target.value)}
                  placeholder="Nome do novo modelo" autoFocus
                  onKeyDown={e => e.key==='Enter' && handleClone()}
                  className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
                <div className="flex gap-1">
                  <button onClick={handleClone} className="flex-1 py-1.5 bg-indigo-500 text-white rounded-lg text-xs font-semibold hover:bg-indigo-600">Criar</button>
                  <button onClick={() => {setShowClone(false);setCloneNome('')}} className="px-3 py-1.5 border border-slate-200 bg-white rounded-lg text-xs text-slate-500">✕</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowClone(true)}
                className="w-full flex items-center gap-1.5 px-2 py-2 border border-dashed border-slate-300 rounded-xl text-xs text-slate-400 hover:border-indigo-300 hover:text-indigo-600 hover:bg-white transition-all">
                <Copy size={11}/> Clonar modelo selecionado
              </button>
            )}
          </div>
        </div>

        {/* Editor principal */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* Toolbar */}
          <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 bg-white shrink-0">
            <div className="flex-1 min-w-0">
              {draft ? (
                <input value={draft.nome} onChange={e => setDraft({...draft,nome:e.target.value})}
                  className="font-bold text-sm text-slate-800 border border-indigo-300 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400 w-60"/>
              ) : (
                <p className="font-bold text-sm text-slate-800 truncate">{cur.nome}</p>
              )}
              <p className="text-[11px] text-slate-400 mt-0.5 truncate">{cur.descricao}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {draft ? (
                <>
                  <button onClick={() => {if(confirm('Descartar?')){setDraft(null);setZonaAtiva(null)}}}
                    className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-500 hover:bg-slate-50">Descartar</button>
                  <button onClick={salvar}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-xs font-bold">
                    <Save size={12}/> Salvar modelo
                  </button>
                </>
              ) : (
                <>
                  {cur.builtin && (
                    <button onClick={() => handleReset(cur)}
                      className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-500 hover:border-orange-300 hover:text-orange-600 transition-all">
                      <RotateCcw size={12}/> Reset
                    </button>
                  )}
                  {!cur.builtin && (
                    <button onClick={() => handleDelete(cur)}
                      className="flex items-center gap-1 px-3 py-1.5 border border-red-200 rounded-lg text-xs text-red-500 hover:bg-red-50">
                      <Trash2 size={12}/> Deletar
                    </button>
                  )}
                  <button onClick={iniciarEdicao}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-xs font-bold">
                    <Palette size={12}/> Editar modelo
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Abas */}
          <div className="flex border-b border-slate-100 bg-white shrink-0 px-4">
            {([
              {id:'visual' as const, icon:Eye,     label:'Visual (clicável)'},
              {id:'cores'  as const, icon:Palette, label:'Todas as cores'},
              {id:'fonte'  as const, icon:Type,    label:'Fontes'},
              {id:'bordas' as const, icon:Rows3,   label:'Bordas'},
            ]).map(({id,icon:Icon,label}) => (
              <button key={id} onClick={() => setAba(id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium -mb-px border-b-2 transition-colors ${
                  aba===id ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}>
                <Icon size={13}/>{label}
              </button>
            ))}
          </div>

          <div className="flex flex-1 min-h-0 overflow-hidden">

            {/* ── ABA VISUAL ─────────────────────────────────────────────── */}
            {aba==='visual' && (
              <>
                <div className="flex-1 overflow-y-auto p-4 bg-slate-100/60">

                  {!editing && (
                    <div className="mb-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-center gap-2 text-xs text-amber-700">
                      <Palette size={13} className="shrink-0"/>
                      Clique em <strong>Editar modelo</strong> para ativar a edição e depois clique nas células abaixo.
                    </div>
                  )}
                  {editing && !zonaAtiva && (
                    <div className="mb-3 bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-2.5 flex items-center gap-2 text-xs text-indigo-700">
                      <MousePointer size={13} className="shrink-0"/>
                      Clique em qualquer <strong>zona colorida</strong> para editar suas propriedades no painel →
                    </div>
                  )}

                  {/* Prévia planilha */}
                  <div className="rounded-xl overflow-hidden shadow-md border border-slate-300" style={{fontFamily:cur.fonte.nome_base, fontSize:8.5}}>

                  {cur.base === 'PREFEITURA' ? (
                    /* ── LAYOUT PREFEITURA (PREV 02) ─────────────────── */
                    <>
                      {/* Cabeçalho PREV 02: 3 blocos lado a lado */}
                      <div style={{display:'flex',borderBottom:'1px solid #aaa'}}>
                        {/* LOGO */}
                        <div onClick={() => clicarZona('empresa_bg')} title="Bloco logo"
                             style={zs('empresa_bg',{width:70,minHeight:80,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,borderRight:'1px solid #aaa'})}>
                          <span style={{fontSize:8,opacity:0.6}}>[ LOGO ]</span>
                          {zonaAtiva==='empresa_bg' && editing && <SelBadge/>}
                        </div>

                        {/* CENTRO: concedente, objetivo, boletim */}
                        <div style={{flex:1,fontSize:7}}>
                          <div style={{display:'flex',borderBottom:'1px solid #ddd'}}>
                            <div style={{flex:1,padding:'3px 5px',borderRight:'1px solid #ddd'}}>
                              <div style={{fontSize:6,color:'#888'}}>CONCEDENTE</div>
                              <div onClick={() => clicarZona('hdr_principal')} title="Título principal"
                                   style={{...zs('hdr_principal',{fontWeight:'bold',fontSize:7.5,padding:'1px 2px',background:'transparent',border:'none',cursor:'pointer'}),color:txtContrast(C.hdr_principal)==='#fff'?hx(C.hdr_principal):'#333'}}>
                                PREFEITURA MUNICIPAL
                                {zonaAtiva==='hdr_principal' && editing && <SelBadge/>}
                              </div>
                            </div>
                            <div style={{padding:'3px 5px',borderRight:'1px solid #ddd'}}>
                              <div style={{fontSize:6,color:'#888'}}>Data emissão BM</div>
                              <div style={{fontWeight:'bold'}}>10/03/2026</div>
                            </div>
                            <div style={{padding:'3px 5px',borderRight:'1px solid #ddd'}}>
                              <div style={{fontSize:6,color:'#888'}}>Período ref.</div>
                              <div style={{fontWeight:'bold'}}>10/03/2026</div>
                            </div>
                            <div onClick={() => clicarZona('hdr_cabec')} title="Valor do contrato"
                                 style={zs('hdr_cabec',{padding:'3px 5px',textAlign:'right',minWidth:85})}>
                              <div style={{fontSize:6}}>VALOR DO CONTRATO</div>
                              <div style={{fontWeight:'bold'}}>R$ 4.307.031,98</div>
                              {zonaAtiva==='hdr_cabec' && editing && <SelBadge/>}
                            </div>
                          </div>
                          <div style={{display:'flex',borderBottom:'1px solid #ddd'}}>
                            <div style={{flex:1,padding:'3px 5px',borderRight:'1px solid #ddd'}}>
                              <div style={{fontSize:6,color:'#888'}}>OBJETIVO DA ORDEM DE SERVIÇO</div>
                              <div style={{fontWeight:'bold'}}>Construção Creche Ana Catarina</div>
                            </div>
                            <div onClick={() => clicarZona('hdr_cabec')} title="Valor acumulado"
                                 style={zs('hdr_cabec',{padding:'3px 5px',textAlign:'right',minWidth:85})}>
                              <div style={{fontSize:6}}>VALOR ACUMULADO</div>
                              <div style={{fontWeight:'bold'}}>R$ 482.385,10</div>
                              {zonaAtiva==='hdr_cabec' && editing && <SelBadge/>}
                            </div>
                          </div>
                          <div style={{display:'flex',borderBottom:'1px solid #ddd'}}>
                            <div style={{flex:1,padding:'3px 5px',borderRight:'1px solid #ddd'}}>
                              <div style={{fontSize:6,color:'#888'}}>EMPRESA CONTRATADA</div>
                              <div style={{fontWeight:'bold'}}>RD CONSTRUTORA LTDA</div>
                            </div>
                            <div onClick={() => clicarZona('hdr_cabec')} title="Saldo em contrato"
                                 style={zs('hdr_cabec',{padding:'3px 5px',textAlign:'right',minWidth:85})}>
                              <div style={{fontSize:6}}>SALDO EM CONTRATO</div>
                              <div style={{fontWeight:'bold'}}>R$ 3.824.646,88</div>
                              {zonaAtiva==='hdr_cabec' && editing && <SelBadge/>}
                            </div>
                          </div>
                          <div style={{display:'flex'}}>
                            <div style={{flex:1,padding:'3px 5px',borderRight:'1px solid #ddd'}}>
                              <span style={{fontWeight:'bold'}}>BOLETIM DE MEDIÇÃO - N° 1</span>
                              <span style={{marginLeft:8,fontSize:6,color:'#888'}}>EMISSÃO: 10/03/2026</span>
                            </div>
                            <div onClick={() => clicarZona('hdr_topo')} title="Valor medido no período"
                                 style={zs('hdr_topo',{padding:'3px 5px',textAlign:'right',minWidth:85,fontWeight:'bold'})}>
                              <div style={{fontSize:6}}>VALOR MEDIDO:</div>
                              <div>R$ 482.385,10</div>
                              {zonaAtiva==='hdr_topo' && editing && <SelBadge/>}
                            </div>
                          </div>
                        </div>

                        {/* EMPRESA (direita) */}
                        <div onClick={() => clicarZona('hdr_cabec')} title="Bloco empresa"
                             style={zs('hdr_cabec',{width:90,padding:'4px 6px',flexShrink:0,borderLeft:'1px solid #aaa',fontSize:6,lineHeight:'1.4'})}>
                          <strong style={{fontSize:7}}>RD CONSTRUTORA</strong><br/>
                          Rua Bela Vista, 874<br/>
                          CNPJ: 43.357.757/0001-40<br/>
                          rd_solucoes@outlook.com
                          {zonaAtiva==='hdr_cabec' && editing && <SelBadge/>}
                        </div>
                      </div>

                      {/* TH — PREV 02: PLANILHA BASE | PLANILHA DE MEDIÇÃO */}
                      <div style={{display:'flex'}}>
                        {[
                          {l:'ITEM',    z:'th_base',    w:25},
                          {l:'CÓDIGO',  z:'th_base',    w:40},
                          {l:'DESCRIÇÃO',z:'th_base',   f:true},
                          {l:'FONTE',   z:'th_base',    w:28},
                          {l:'UNID',    z:'th_base',    w:22},
                          {l:'QTD',     z:'th_base',    w:30},
                          {l:'COM BDI', z:'th_base',    w:32},
                          {l:'TOTAL',   z:'th_base',    w:35},
                          {l:'DESC.',   z:'th_base',    w:32},
                          {l:'ACUM.ANT',z:'th_medicao', w:35},
                          {l:'PERÍODO', z:'th_medicao', w:35},
                          {l:'(%)',     z:'th_medicao', w:22},
                          {l:'ACUM.R$', z:'th_medicao', w:35},
                          {l:'SALDO R$',z:'th_medicao', w:35},
                          {l:'(%)',     z:'th_medicao', w:22},
                        ].map((col,i) => (
                          <div key={i} onClick={() => clicarZona(col.z)}
                               style={{
                                 ...zs(col.z,{padding:'4px 2px',textAlign:'center',fontWeight:'bold',fontSize:6.5}),
                                 width:col.f?undefined:col.w, flex:col.f?1:undefined,
                                 borderRight:'1px solid rgba(255,255,255,0.2)',
                               }}>
                            {col.l}
                            {zonaAtiva===col.z && editing && <SelBadge/>}
                          </div>
                        ))}
                      </div>

                      {/* Linhas dados */}
                      {([
                        {l:'1  SERVIÇOS PRELIMINARES',        zona:'linha_grupo',   grupo:true},
                        {l:'1.1  Placa de obra',              zona:'linha_par',     grupo:false},
                        {l:'1.2  Tapume metálico provisório', zona:'linha_periodo', grupo:false, bold:true},
                        {l:'1.3  Limpeza do terreno',         zona:'linha_100pct',  grupo:false},
                        {l:'2  FUNDAÇÕES',                    zona:'linha_grupo',   grupo:true},
                        {l:'2.1  Escavação mecânica',         zona:'linha_impar',   grupo:false},
                      ] as {l:string;zona:string;grupo:boolean;bold?:boolean}[]).map((row,ri) => (
                        <div key={ri} onClick={() => clicarZona(row.zona)}
                             style={{
                               ...zs(row.zona,{borderBottom:'1px solid rgba(0,0,0,0.07)',fontWeight:row.grupo||row.bold?'bold':'normal'}),
                               display:'flex',
                             }}>
                          {row.grupo ? (
                            <div style={{padding:'4px 8px',width:'100%',fontSize:7.5}}>{row.l}</div>
                          ) : (
                            <>
                              <div style={{width:25,padding:'3px 2px',textAlign:'center',borderRight:'1px solid rgba(0,0,0,0.05)',fontSize:7}}>{ri}</div>
                              <div style={{width:40,padding:'3px 2px',textAlign:'center',borderRight:'1px solid rgba(0,0,0,0.05)',fontSize:7}}>97628</div>
                              <div style={{flex:1,padding:'3px 4px',borderRight:'1px solid rgba(0,0,0,0.05)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:7}}>{row.l}</div>
                              <div style={{width:28,padding:'3px 2px',textAlign:'center',borderRight:'1px solid rgba(0,0,0,0.05)',fontSize:7}}>SINAPI</div>
                              <div style={{width:22,padding:'3px 2px',textAlign:'center',borderRight:'1px solid rgba(0,0,0,0.05)',fontSize:7}}>M²</div>
                              <div style={{width:30,padding:'3px 2px',textAlign:'right',borderRight:'1px solid rgba(0,0,0,0.05)',fontSize:7}}>120,00</div>
                              <div style={{width:32,padding:'3px 2px',textAlign:'right',borderRight:'1px solid rgba(0,0,0,0.05)',fontSize:7}}>45,20</div>
                              <div style={{width:35,padding:'3px 2px',textAlign:'right',borderRight:'1px solid rgba(0,0,0,0.05)',fontSize:7}}>5.424,00</div>
                              <div style={{width:32,padding:'3px 2px',textAlign:'right',borderRight:'1px solid rgba(0,0,0,0.05)',fontSize:7}}>5.424,00</div>
                              <div style={{width:35,padding:'3px 2px',textAlign:'right',borderRight:'1px solid rgba(0,0,0,0.05)',fontSize:7}}>{row.zona==='linha_periodo'?'80,00':'0,00'}</div>
                              <div style={{width:35,padding:'3px 2px',textAlign:'right',fontWeight:'bold',borderRight:'1px solid rgba(0,0,0,0.05)',fontSize:7}}>{row.zona==='linha_periodo'?'40,00':'0,00'}</div>
                              <div style={{width:22,padding:'3px 2px',textAlign:'right',borderRight:'1px solid rgba(0,0,0,0.05)',fontSize:7}}>33%</div>
                              <div style={{width:35,padding:'3px 2px',textAlign:'right',borderRight:'1px solid rgba(0,0,0,0.05)',fontSize:7}}>1.808,00</div>
                              <div style={{width:35,padding:'3px 2px',textAlign:'right',borderRight:'1px solid rgba(0,0,0,0.05)',fontSize:7}}>3.616,00</div>
                              <div style={{width:22,padding:'3px 2px',textAlign:'right',fontSize:7}}>{row.zona==='linha_100pct'?'100%':'67%'}</div>
                            </>
                          )}
                          {zonaAtiva===row.zona && editing && <SelBadge/>}
                        </div>
                      ))}

                      {/* Totais */}
                      <div onClick={() => clicarZona('linha_total')}
                           style={zs('linha_total',{padding:'5px 12px',fontWeight:'bold',fontSize:8,display:'flex',justifyContent:'space-between'})}>
                        <span>TOTAIS GERAIS</span><span>R$ 4.307.031,98</span>
                        {zonaAtiva==='linha_total' && editing && <SelBadge/>}
                      </div>

                      {/* Extenso */}
                      <div onClick={() => clicarZona('extenso_bg')}
                           style={zs('extenso_bg',{padding:'5px 12px',fontStyle:'italic',fontSize:8})}>
                        A presente medição importa o valor de: QUATROCENTOS E OITENTA E DOIS MIL REAIS
                        {zonaAtiva==='extenso_bg' && editing && <SelBadge/>}
                      </div>

                      {/* Demo */}
                      <div onClick={() => clicarZona('demo_cabec')}
                           style={zs('demo_cabec',{padding:'4px 12px',fontWeight:'bold',fontSize:8})}>
                        DEMONSTRATIVO FINANCEIRO
                        {zonaAtiva==='demo_cabec' && editing && <SelBadge/>}
                      </div>
                      <div style={{display:'flex',fontSize:8,background:'#fff'}}>
                        <div style={{flex:1,padding:'3px 12px',borderRight:'1px solid #f1f5f9',borderBottom:'1px solid #f1f5f9',color:'#555'}}>VALOR TOTAL DO ORÇAMENTO</div>
                        <div style={{width:110,padding:'3px 12px',textAlign:'right',fontWeight:'bold',color:'#333',borderBottom:'1px solid #f1f5f9'}}>R$ 4.307.031,98</div>
                      </div>
                      <div style={{display:'flex',fontSize:8,background:hx(C.hdr_cabec),opacity:0.7}}>
                        <div style={{flex:1,padding:'3px 12px',borderRight:'1px solid #eee',color:'#555'}}>VALOR 1ª MEDIÇÃO</div>
                        <div style={{width:110,padding:'3px 12px',textAlign:'right',fontWeight:'bold',color:'#333'}}>R$ 482.385,10</div>
                      </div>
                    </>
                  ) : (
                    /* ── LAYOUT ESTADO (azul/laranja) ────────────────── */
                    <>
                    {/* Topo */}
                    <div onClick={() => clicarZona('hdr_topo')} title="Faixa topo / N° Medição"
                         style={zs('hdr_topo',{height:10})}/>

                    {/* Cabeçalho */}
                    <div style={{display:'flex'}}>
                      <div onClick={() => clicarZona('empresa_bg')} title="Bloco logo"
                           style={zs('empresa_bg',{width:80,padding:'8px 4px',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0})}>
                        <span style={{fontSize:9,opacity:0.7}}>[ LOGO ]</span>
                        {zonaAtiva==='empresa_bg' && editing && <SelBadge/>}
                      </div>
                      <div style={{flex:1}}>
                        <div onClick={() => clicarZona('hdr_principal')} title="Título principal"
                             style={zs('hdr_principal',{padding:'6px 10px',textAlign:'center',fontWeight:'bold',fontSize:10,fontFamily:cur.fonte.nome_cabec})}>
                          SECRETARIA DE ESTADO DE INFRAESTRUTURA
                          {zonaAtiva==='hdr_principal' && editing && <SelBadge/>}
                        </div>
                        <div onClick={() => clicarZona('hdr_sub')} title="Subdivisão"
                             style={zs('hdr_sub',{padding:'4px 10px',textAlign:'center'})}>
                          COORDENADORIA DE OBRAS E INFRAESTRUTURA
                          {zonaAtiva==='hdr_sub' && editing && <SelBadge/>}
                        </div>
                        <div onClick={() => clicarZona('hdr_cabec')} title="Infos da obra"
                             style={zs('hdr_cabec',{padding:'3px 10px',textAlign:'center'})}>
                          OBRA: Creche Ana Catarina  |  LOCAL: Canguaretama/RN  |  BDI: 25,00%
                          {zonaAtiva==='hdr_cabec' && editing && <SelBadge/>}
                        </div>
                      </div>
                      <div onClick={() => clicarZona('hdr_topo')} title="N° Medição"
                           style={zs('hdr_topo',{width:72,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:'bold',fontSize:10,flexShrink:0,textAlign:'center'})}>
                        1ª MED.
                        {zonaAtiva==='hdr_topo' && editing && <SelBadge/>}
                      </div>
                    </div>

                    {/* TH */}
                    <div style={{display:'flex'}}>
                      {[
                        {l:'ITEM',    z:'th_base',    w:30},
                        {l:'CÓDIGO',  z:'th_base',    w:55},
                        {l:'DESCRIÇÃO',z:'th_base',   f:true},
                        {l:'UNID',    z:'th_base',    w:32},
                        {l:'PREV.',   z:'th_medicao', w:42},
                        {l:'ANT.',    z:'th_medicao', w:42},
                        {l:'PERÍODO', z:'th_medicao', w:50},
                        {l:'ACUM.',   z:'th_medicao', w:42},
                        {l:'SALDO',   z:'th_medicao', w:42},
                      ].map((col,i) => (
                        <div key={i} onClick={() => clicarZona(col.z)}
                             style={{
                               ...zs(col.z,{padding:'5px 3px',textAlign:'center',fontWeight:'bold',fontSize:7.5}),
                               width:col.f?undefined:col.w, flex:col.f?1:undefined,
                               borderRight:'1px solid rgba(255,255,255,0.2)',
                             }}>
                          {col.l}
                          {zonaAtiva===col.z && editing && <SelBadge/>}
                        </div>
                      ))}
                    </div>

                    {/* Linhas dados */}
                    {([
                      {l:'1  SERVIÇOS PRELIMINARES',        zona:'linha_grupo',   grupo:true},
                      {l:'1.1  Placa de obra',              zona:'linha_par',     grupo:false},
                      {l:'1.2  Tapume metálico provisório', zona:'linha_periodo', grupo:false, bold:true},
                      {l:'1.3  Limpeza do terreno c/ rasp.',zona:'linha_100pct',  grupo:false},
                      {l:'2  FUNDAÇÕES',                    zona:'linha_grupo',   grupo:true},
                      {l:'2.1  Escavação mecânica',         zona:'linha_impar',   grupo:false},
                    ] as {l:string;zona:string;grupo:boolean;bold?:boolean}[]).map((row,ri) => (
                      <div key={ri} onClick={() => clicarZona(row.zona)}
                           style={{
                             ...zs(row.zona,{borderBottom:'1px solid rgba(0,0,0,0.07)',fontWeight:row.grupo||row.bold?'bold':'normal'}),
                             display:'flex',
                           }}>
                        {row.grupo ? (
                          <div style={{padding:'5px 10px',width:'100%',fontSize:8}}>{row.l}</div>
                        ) : (
                          <>
                            <div style={{width:30,padding:'4px 3px',textAlign:'center',borderRight:'1px solid rgba(0,0,0,0.05)'}}>{ri}</div>
                            <div style={{width:55,padding:'4px 3px',textAlign:'center',borderRight:'1px solid rgba(0,0,0,0.05)'}}>97628</div>
                            <div style={{flex:1,padding:'4px 6px',borderRight:'1px solid rgba(0,0,0,0.05)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{row.l}</div>
                            <div style={{width:32,padding:'4px 3px',textAlign:'center',borderRight:'1px solid rgba(0,0,0,0.05)'}}>M²</div>
                            <div style={{width:42,padding:'4px 3px',textAlign:'right',borderRight:'1px solid rgba(0,0,0,0.05)'}}>120,00</div>
                            <div style={{width:42,padding:'4px 3px',textAlign:'right',borderRight:'1px solid rgba(0,0,0,0.05)'}}>{row.zona==='linha_periodo'?'80,00':'0,00'}</div>
                            <div style={{width:50,padding:'4px 3px',textAlign:'right',fontWeight:'bold',borderRight:'1px solid rgba(0,0,0,0.05)'}}>{row.zona==='linha_periodo'?'40,00':'0,00'}</div>
                            <div style={{width:42,padding:'4px 3px',textAlign:'right',borderRight:'1px solid rgba(0,0,0,0.05)'}}>{row.zona==='linha_100pct'?'120,00':'80,00'}</div>
                            <div style={{width:42,padding:'4px 3px',textAlign:'right'}}>{row.zona==='linha_100pct'?'0,00':'40,00'}</div>
                          </>
                        )}
                        {zonaAtiva===row.zona && editing && <SelBadge/>}
                      </div>
                    ))}

                    {/* Totais */}
                    <div onClick={() => clicarZona('linha_total')}
                         style={zs('linha_total',{padding:'5px 12px',fontWeight:'bold',fontSize:9,display:'flex',justifyContent:'space-between'})}>
                      <span>TOTAIS GERAIS DO ORÇAMENTO</span><span>R$ 4.307.031,98</span>
                      {zonaAtiva==='linha_total' && editing && <SelBadge/>}
                    </div>

                    {/* Extenso */}
                    <div onClick={() => clicarZona('extenso_bg')}
                         style={zs('extenso_bg',{padding:'5px 12px',fontStyle:'italic',fontSize:8})}>
                      A presente medição importa o valor de: QUATROCENTOS E OITENTA E DOIS MIL REAIS
                      {zonaAtiva==='extenso_bg' && editing && <SelBadge/>}
                    </div>

                    {/* Demo */}
                    <div onClick={() => clicarZona('demo_cabec')}
                         style={zs('demo_cabec',{padding:'4px 12px',fontWeight:'bold',fontSize:8})}>
                      DEMONSTRATIVO FINANCEIRO
                      {zonaAtiva==='demo_cabec' && editing && <SelBadge/>}
                    </div>
                    <div style={{display:'flex',fontSize:8,background:'#fff'}}>
                      <div style={{flex:1,padding:'3px 12px',borderRight:'1px solid #f1f5f9',borderBottom:'1px solid #f1f5f9',color:'#555'}}>VALOR TOTAL DO ORÇAMENTO</div>
                      <div style={{width:110,padding:'3px 12px',textAlign:'right',fontWeight:'bold',color:'#333',borderBottom:'1px solid #f1f5f9'}}>R$ 4.307.031,98</div>
                    </div>
                    <div style={{display:'flex',fontSize:8,background:hx(C.hdr_cabec),opacity:0.7}}>
                      <div style={{flex:1,padding:'3px 12px',borderRight:'1px solid #eee',color:'#555'}}>VALOR 1ª MEDIÇÃO</div>
                      <div style={{width:110,padding:'3px 12px',textAlign:'right',fontWeight:'bold',color:'#333'}}>R$ 482.385,10</div>
                    </div>
                    </>
                  )}
                  </div>

                  {/* Prévia memória */}
                  <div className="mt-5 rounded-xl overflow-hidden shadow-md border border-slate-300" style={{fontFamily:cur.fonte.nome_base, fontSize:8.5}}>

                    <div onClick={() => clicarZona('mem_titulo')}
                         style={zs('mem_titulo',{padding:'6px 14px',fontWeight:'bold',fontSize:10})}>
                      MEMÓRIA DE CÁLCULO — 1ª Medição — Creche Ana Catarina
                      {zonaAtiva==='mem_titulo' && editing && <SelBadge/>}
                    </div>

                    <div style={{display:'flex',fontWeight:'bold',fontSize:7.5,background:hx(C.mem_titulo),opacity:.85}}>
                      {['ITEM','DESCRIÇÃO','Larg.','Comp.','Alt.','Área','TOTAL','STATUS'].map((h2,i) => (
                        <div key={i} style={{width:i===1?'auto':undefined,flex:i===1?1:undefined,minWidth:i!==1?30:undefined,
                          padding:'5px 3px',textAlign:'center',color:'#fff',borderRight:'1px solid rgba(255,255,255,0.15)'}}>
                          {h2}
                        </div>
                      ))}
                    </div>

                    <div onClick={() => clicarZona('mem_grupo')}
                         style={zs('mem_grupo',{padding:'5px 14px',fontWeight:'bold'})}>
                      1 — SERVIÇOS PRELIMINARES
                      {zonaAtiva==='mem_grupo' && editing && <SelBadge/>}
                    </div>

                    <div onClick={() => clicarZona('mem_apagar')}
                         style={zs('mem_apagar',{padding:'4px 14px 4px 24px',display:'flex',alignItems:'center',gap:12})}>
                      <span style={{fontFamily:'monospace',fontSize:7,opacity:.6}}>1.1.1</span>
                      <span style={{flex:1}}>Placa de obra — 1,20 × 1,80 =</span>
                      <span style={{fontWeight:'bold'}}>2,16 M²</span>
                      <span style={{fontSize:7,opacity:.7}}>A PAGAR</span>
                      {zonaAtiva==='mem_apagar' && editing && <SelBadge/>}
                    </div>

                    <div onClick={() => clicarZona('mem_pago')}
                         style={zs('mem_pago',{padding:'4px 14px 4px 24px',display:'flex',alignItems:'center',gap:12})}>
                      <span style={{fontFamily:'monospace',fontSize:7,opacity:.6}}>1.2.1</span>
                      <span style={{flex:1}}>Tapume metálico — 15,00 × 2,20 =</span>
                      <span style={{fontWeight:'bold'}}>33,00 M²</span>
                      <span style={{fontSize:7,opacity:.7}}>PAGO</span>
                      {zonaAtiva==='mem_pago' && editing && <SelBadge/>}
                    </div>

                    <div style={{display:'flex',fontSize:7.5,fontWeight:'bold'}}>
                      {[
                        {l:'TOTAL ACUMULADO', z:'mem_tot_acum'},
                        {l:'TOTAL ANTERIOR',  z:'mem_tot_ant'},
                        {l:'TOTAL DO MÊS',    z:'mem_tot_mes'},
                      ].map(t => (
                        <div key={t.z} onClick={() => clicarZona(t.z)}
                             style={{...zs(t.z,{padding:'6px 4px',textAlign:'center',flex:1}),borderRight:'1px solid rgba(255,255,255,0.2)'}}>
                          {t.l}<br/>
                          <span style={{fontSize:7,opacity:.7,fontWeight:'normal'}}>R$ 2.160,00</span>
                          {zonaAtiva===t.z && editing && <SelBadge/>}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Legenda */}
                  <div className="mt-4 bg-white border border-slate-200 rounded-xl p-3">
                    <p className="text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">Legenda de zonas</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                      {ZONAS.slice(0,12).map(z => (
                        <button key={z.id} onClick={() => editing && clicarZona(z.id)}
                          className={`flex items-center gap-2 text-[9px] py-0.5 rounded transition-colors ${
                            editing?'hover:bg-indigo-50 cursor-pointer':'cursor-default'
                          } ${zonaAtiva===z.id?'text-indigo-600 font-bold':'text-slate-500'}`}>
                          <div className="w-3 h-3 rounded-sm shrink-0 border border-white shadow-sm"
                               style={{background:hx(C[z.corKey])}}/>
                          {z.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Painel lateral */}
                <ZonePanel
                  zona={zonaInfo??null} cur={cur} editing={editing}
                  onSetCor={setCor} onSetBorda={setBorda}
                  onClear={() => setZonaAtiva(null)}
                />
              </>
            )}

            {/* ── ABA CORES ─────────────────────────────────────────────── */}
            {aba==='cores' && (
              <div className="flex-1 overflow-y-auto p-5 space-y-2">
                {!editing && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700 flex items-center gap-2">
                    <Lock size={12}/> Clique em <strong>Editar modelo</strong> para modificar.
                  </div>
                )}
                {GRUPOS_COR.map((g,gi) => (
                  <div key={gi} className="border border-slate-200 rounded-xl overflow-hidden">
                    <button onClick={() => setGrupoAberto(grupoAberto===gi?-1:gi)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors">
                      <span className="text-xs font-bold text-slate-700">{g.titulo}</span>
                      {grupoAberto===gi?<ChevronDown size={13} className="text-slate-400"/>:<ChevronRight size={13} className="text-slate-400"/>}
                    </button>
                    {grupoAberto===gi && (
                      <div className="px-4 py-2 divide-y divide-slate-50">
                        {g.ids.map(id => {
                          const z = ZONAS.find(z=>z.id===id)!
                          return <ColorRow key={id} label={z.label} value={cur.cores[z.corKey]} disabled={!editing} onChange={v=>setCor(z.corKey,v)}/>
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ── ABA FONTES ─────────────────────────────────────────────── */}
            {aba==='fonte' && (
              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {!editing && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700 flex items-center gap-2">
                    <Lock size={12}/> Clique em <strong>Editar modelo</strong> para modificar.
                  </div>
                )}
                {(['nome_base','nome_cabec'] as const).map(key => (
                  <div key={key} className="flex items-center gap-4 border border-slate-200 rounded-xl px-4 py-3 bg-white">
                    <Type size={16} className="text-slate-400 shrink-0"/>
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-slate-700">{key==='nome_base'?'Fonte — células de dados':'Fonte — cabeçalhos e títulos'}</p>
                      <p className="text-sm mt-1 font-medium text-slate-600" style={{fontFamily:cur.fonte[key]}}>{cur.fonte[key]} — AaBbCc 123</p>
                    </div>
                    {editing ? (
                      <select value={draft!.fonte[key]} onChange={e=>setFonte(key,e.target.value)}
                        className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white">
                        {FONTES.map(f=><option key={f} value={f} style={{fontFamily:f}}>{f}</option>)}
                      </select>
                    ):(
                      <span className="text-xs text-slate-400">{cur.fonte[key]}</span>
                    )}
                  </div>
                ))}
                {([
                  {key:'tamanho_dados' as const, label:'Tamanho — dados (pt)',         min:6,max:14},
                  {key:'tamanho_th'   as const, label:'Tamanho — cabeçalho tabela (pt)',min:6,max:14},
                  {key:'tamanho_cabec'as const, label:'Tamanho — título / órgão (pt)', min:8,max:18},
                ]).map(({key,label,min,max}) => (
                  <div key={key} className="flex items-center gap-4 border border-slate-200 rounded-xl px-4 py-3 bg-white">
                    <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center font-bold text-xs text-slate-600 shrink-0">{cur.fonte[key]}pt</div>
                    <div className="flex-1"><p className="text-xs font-medium text-slate-700">{label}</p></div>
                    {editing ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <input type="range" min={min} max={max} value={draft!.fonte[key]}
                          onChange={e=>setFonte(key,Number(e.target.value))} className="w-28 accent-indigo-500"/>
                        <span className="text-xs font-bold text-indigo-600 w-8 text-right">{draft!.fonte[key]}pt</span>
                      </div>
                    ):(
                      <span className="text-sm font-bold text-slate-600">{cur.fonte[key]}pt</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ── ABA BORDAS ─────────────────────────────────────────────── */}
            {aba==='bordas' && (
              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {!editing && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700 flex items-center gap-2">
                    <Lock size={12}/> Clique em <strong>Editar modelo</strong> para modificar.
                  </div>
                )}
                {([
                  {key:'dados'   as const, label:'Células de dados',        desc:'Linhas do corpo da tabela'},
                  {key:'cabec'   as const, label:'Cabeçalho da tabela (TH)',desc:'Linha de títulos das colunas'},
                  {key:'totais'  as const, label:'Linha de totais',          desc:'Linha TOTAIS GERAIS DO ORÇAMENTO'},
                  {key:'externo' as const, label:'Borda externa / destaque', desc:'Contorno dos blocos principais'},
                ]).map(({key,label,desc}) => (
                  <div key={key} className="border border-slate-200 rounded-xl px-4 py-4 bg-white">
                    <div className="flex items-center gap-4 mb-3">
                      <div className="w-12 h-9 flex items-center justify-center bg-slate-50 rounded-lg shrink-0">
                        <div className="w-7 h-6 bg-white rounded-sm flex items-center justify-center text-[7px] font-bold text-slate-400"
                             style={{border:BORDAS_OPT.find(b=>b.v===cur.bordas[key])?.css??'none'}}>abc</div>
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-slate-700">{label}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{desc}</p>
                      </div>
                      <span className="text-xs text-slate-500 capitalize">{BORDAS_OPT.find(b=>b.v===cur.bordas[key])?.l}</span>
                    </div>
                    {editing && (
                      <div className="flex gap-2">
                        {BORDAS_OPT.map(b => (
                          <button key={b.v} onClick={() => setBorda(key,b.v)}
                            className={`flex-1 py-2.5 rounded-lg text-xs font-medium border transition-all flex flex-col items-center gap-1.5 ${
                              cur.bordas[key]===b.v ? 'bg-indigo-500 text-white border-indigo-500 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                            }`}>
                            <div className="w-6 h-4 rounded-sm"
                                 style={{border:b.css==='none'?'1px dashed #aaa':cur.bordas[key]===b.v?b.css.replace(/#[0-9a-f]+/gi,'rgba(255,255,255,0.9)'):b.css}}/>
                            {b.l}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}

// ─── ZonePanel ────────────────────────────────────────────────────────────────

interface ZonePanelProps {
  zona: ZonaDef | null; cur: ModeloPlanilha; editing: boolean
  onSetCor: (k:keyof ModeloPlanilha['cores'], v:string) => void
  onSetBorda: (k:keyof ModeloPlanilha['bordas'], v:BorderStyle) => void
  onClear: () => void
}

function ZonePanel({zona,cur,editing,onSetCor,onSetBorda,onClear}: ZonePanelProps) {
  if (!editing) return (
    <div className="w-64 border-l border-slate-100 bg-slate-50/40 flex flex-col items-center justify-center gap-3 p-6 shrink-0">
      <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center"><MousePointer size={20} className="text-slate-400"/></div>
      <p className="text-xs text-slate-400 text-center leading-relaxed">
        Clique em <strong className="text-slate-600">Editar modelo</strong> e depois nas zonas da planilha
      </p>
    </div>
  )

  if (!zona) return (
    <div className="w-64 border-l border-slate-100 bg-indigo-50/30 flex flex-col items-center justify-center gap-3 p-6 shrink-0">
      <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center"><Palette size={20} className="text-indigo-400"/></div>
      <p className="text-xs text-indigo-600 text-center leading-relaxed">
        Clique em qualquer <strong>zona colorida</strong> da planilha para editar suas propriedades
      </p>
      <div className="w-full space-y-1.5 mt-1">
        {['Cabeçalho','Linhas de dados','Totais','Memória'].map(t=>(
          <div key={t} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-indigo-100 text-[10px] text-slate-500">
            <div className="w-2 h-2 rounded-full bg-indigo-400"/>{t}
          </div>
        ))}
      </div>
    </div>
  )

  const corFundo = cur.cores[zona.corKey]
  const txtColor = txtContrast(corFundo)
  const borderKey = zona.bordaKey

  return (
    <div className="w-64 border-l border-slate-100 bg-white flex flex-col shrink-0 overflow-y-auto">

      <div className="px-4 py-3 border-b border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-slate-700">Zona selecionada</p>
          <button onClick={onClear} className="text-slate-400 hover:text-slate-600 text-[11px]">✕ fechar</button>
        </div>
        <div className="rounded-lg overflow-hidden border border-slate-200 mb-2">
          <div className="py-2 px-3 text-center text-[9px] font-bold" style={{background:hx(corFundo),color:txtColor}}>
            {zona.label}
          </div>
        </div>
        <p className="text-[10px] text-slate-400 leading-snug">{zona.desc}</p>
      </div>

      <div className="px-4 py-3 border-b border-slate-100">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2.5">Cor de fundo</p>
        <div className="flex items-center gap-2.5 mb-3">
          <input type="color" value={hx(corFundo)}
            onChange={e => onSetCor(zona.corKey, e.target.value.replace('#','').toUpperCase())}
            className="w-12 h-10 rounded-lg cursor-pointer border-2 border-slate-200 p-0.5 hover:border-indigo-400 transition-colors"
          />
          <input type="text" value={corFundo.toUpperCase()}
            onChange={e => { const v=e.target.value.replace('#','').toUpperCase(); if(/^[0-9A-F]{0,6}$/.test(v)) onSetCor(zona.corKey,v) }}
            maxLength={6}
            className="flex-1 border border-slate-200 rounded-lg px-2.5 py-2 text-xs font-mono uppercase focus:outline-none focus:ring-1 focus:ring-indigo-400"
            placeholder="RRGGBB"
          />
        </div>
        <p className="text-[9px] text-slate-400 mb-1.5 font-medium">Cores rápidas</p>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_COLORS.map(c => (
            <button key={c} onClick={() => onSetCor(zona.corKey,c)}
              title={`#${c}`}
              className={`w-5 h-5 rounded border-2 transition-all hover:scale-110 active:scale-95 ${
                corFundo.toUpperCase()===c?'border-indigo-500 scale-110 shadow-md':'border-white shadow-sm'
              }`}
              style={{background:hx(c)}}
            />
          ))}
        </div>
      </div>

      <div className="px-4 py-3 border-b border-slate-100">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Cor do texto</p>
        <p className="text-[9px] text-slate-400 mb-2 leading-snug">Calculada automaticamente para máximo contraste:</p>
        <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium border border-slate-100"
             style={{background:hx(corFundo),color:txtColor}}>
          <span>Texto de exemplo — AaBbCc</span>
          <span className="ml-auto text-[9px] font-mono opacity-70">{txtColor==='#fff'?'branco':'escuro'}</span>
        </div>
      </div>

      {borderKey && (
        <div className="px-4 py-3 border-b border-slate-100">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2.5">Espessura de borda</p>
          <div className="space-y-1.5">
            {BORDAS_OPT.map(b => (
              <button key={b.v} onClick={() => onSetBorda(borderKey,b.v)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border transition-all text-xs ${
                  cur.bordas[borderKey]===b.v ? 'bg-indigo-500 text-white border-indigo-500 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                }`}>
                <div className="w-8 h-5 rounded shrink-0 flex items-center justify-center"
                     style={{background:cur.bordas[borderKey]===b.v?'rgba(255,255,255,0.15)':'#f8fafc'}}>
                  <div className="w-6 h-3 rounded-sm bg-white/20"
                       style={{border:b.css==='none'?'1px dashed #aaa':cur.bordas[borderKey]===b.v?b.css.replace(/#[0-9a-f]+/gi,'rgba(255,255,255,0.85)'):b.css}}/>
                </div>
                <span className="font-medium">{b.l}</span>
                {cur.bordas[borderKey]===b.v && <Check size={12} className="ml-auto"/>}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="px-4 py-3 mt-auto">
        <div className="bg-slate-50 rounded-xl p-3 text-[9px] text-slate-400 space-y-1">
          <p><strong className="text-slate-500">Chave:</strong> <span className="font-mono">{zona.corKey}</span></p>
          {borderKey && <p><strong className="text-slate-500">Borda:</strong> <span className="font-mono">{borderKey}</span></p>}
          <p className="mt-1 text-[8.5px] text-slate-300">Aplicado em Excel (.xlsx) e PDF</p>
        </div>
      </div>
    </div>
  )
}
