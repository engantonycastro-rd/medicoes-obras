/**
 * ModeloEditor v2 — redesign completo do editor de modelos de planilha.
 *
 * Features:
 * - Preview fiel ao export real (PDF/Excel) para ESTADO e PREFEITURA
 * - Abas separadas: Preview MED, Preview MEM, Cores, Fontes, Bordas
 * - Clique em qualquer zona da preview para editar no painel lateral
 * - Paleta de cores rápidas + color picker + hex input
 * - Controle de bordas por região
 * - Tipografia com família e tamanho por slider
 * - Sidebar com lista de modelos, clonar, deletar, reset
 */
import { useState, useMemo, useCallback } from 'react'
import {
  TableProperties, Trash2, Copy, RotateCcw, Save, Palette, Type, Rows3,
  Eye, ChevronDown, ChevronRight, Check, MousePointer, Info, Lock,
  FileText, Layers, Plus,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useModeloStore, ModeloPlanilha, BorderStyle } from '../lib/modeloStore'

// ─── TIPOS E CONSTANTES ──────────────────────────────────────────────────────

interface ZonaDef {
  id: string; label: string; desc: string
  corKey: keyof ModeloPlanilha['cores']
  bordaKey?: keyof ModeloPlanilha['bordas']
  grupo: string
}

const ZONAS: ZonaDef[] = [
  { id:'hdr_topo',      label:'Faixa topo / Nº Medição', desc:'Cor de destaque no topo e bloco nº da medição',            corKey:'hdr_topo',      grupo:'Cabeçalho' },
  { id:'hdr_principal', label:'Órgão contratante',        desc:'Fundo do nome do órgão (secretaria, prefeitura)',          corKey:'hdr_principal', bordaKey:'externo', grupo:'Cabeçalho' },
  { id:'hdr_sub',       label:'Subdivisão do órgão',      desc:'Coordenadoria / secretaria / departamento',                corKey:'hdr_sub',      grupo:'Cabeçalho' },
  { id:'hdr_cabec',     label:'Infos da obra',            desc:'Obra, local, contrato, BDI, desconto...',                  corKey:'hdr_cabec',    grupo:'Cabeçalho' },
  { id:'empresa_bg',    label:'Bloco logo / empresa',     desc:'Fundo da célula com logo ou nome da empresa executora',    corKey:'empresa_bg',   grupo:'Cabeçalho' },
  { id:'th_base',       label:'Planilha Base (TH)',       desc:'Cabeçalho: ITEM, CÓDIGO, DESCRIÇÃO, UNID, QTD, PU...',     corKey:'th_base',    bordaKey:'cabec', grupo:'Tabela' },
  { id:'th_medicao',    label:'Planilha Medição (TH)',    desc:'Cabeçalho: PREV, ANT, PERÍODO, ACUM, SALDO...',            corKey:'th_medicao', bordaKey:'cabec', grupo:'Tabela' },
  { id:'linha_grupo',   label:'Linha de grupo / etapa',   desc:'Ex: "1 — SERVIÇOS PRELIMINARES"',                          corKey:'linha_grupo', bordaKey:'dados', grupo:'Dados' },
  { id:'linha_par',     label:'Linha de dado par',        desc:'Serviços em linhas pares (fundo alternado)',                corKey:'linha_par',   bordaKey:'dados', grupo:'Dados' },
  { id:'linha_impar',   label:'Linha de dado ímpar',      desc:'Serviços em linhas ímpares',                               corKey:'linha_impar', bordaKey:'dados', grupo:'Dados' },
  { id:'linha_periodo', label:'Medido no período',        desc:'Destaque verde quando quantidade medida > 0',               corKey:'linha_periodo', bordaKey:'dados', grupo:'Dados' },
  { id:'linha_100pct',  label:'100% executado',           desc:'Célula quando saldo = 0 (serviço totalmente medido)',       corKey:'linha_100pct', bordaKey:'dados', grupo:'Dados' },
  { id:'linha_total',   label:'Totais gerais',            desc:'Linha de rodapé com soma total do orçamento',               corKey:'linha_total', bordaKey:'totais', grupo:'Dados' },
  { id:'extenso_bg',    label:'Valor por extenso',        desc:'Faixa com texto: "A presente medição importa..."',          corKey:'extenso_bg',  grupo:'Rodapé' },
  { id:'demo_cabec',    label:'Demonstrativo financeiro',  desc:'Cabeçalho do bloco demonstrativo (% e valores)',           corKey:'demo_cabec',  grupo:'Rodapé' },
  { id:'mem_titulo',    label:'Título da memória',        desc:'Barra: "MEMÓRIA DE CÁLCULO | Obra | Medição"',             corKey:'mem_titulo',  grupo:'Memória' },
  { id:'mem_grupo',     label:'Grupo na memória',         desc:'Ex: "1.1 — Placa de obra — M²"',                           corKey:'mem_grupo',   grupo:'Memória' },
  { id:'mem_apagar',    label:'Status: A pagar',          desc:'Linhas com cálculos do período atual',                      corKey:'mem_apagar',  grupo:'Memória' },
  { id:'mem_pago',      label:'Status: Pago',             desc:'Linhas já medidas em períodos anteriores',                  corKey:'mem_pago',    grupo:'Memória' },
  { id:'mem_tot_acum',  label:'Total acumulado',          desc:'Soma acumulada (anterior + período)',                       corKey:'mem_tot_acum', grupo:'Memória' },
  { id:'mem_tot_ant',   label:'Total anterior',           desc:'Soma apenas do acumulado anterior',                         corKey:'mem_tot_ant', grupo:'Memória' },
  { id:'mem_tot_mes',   label:'Total do mês',             desc:'Soma apenas do período atual (a pagar)',                    corKey:'mem_tot_mes', grupo:'Memória' },
]

const GRUPOS = ['Cabeçalho','Tabela','Dados','Rodapé','Memória']

const BORDAS_OPT: { v: BorderStyle; l: string; css: string }[] = [
  { v:'none',   l:'Sem borda',   css:'none' },
  { v:'thin',   l:'Fina',        css:'1px solid #555' },
  { v:'medium', l:'Média',       css:'2px solid #333' },
  { v:'thick',  l:'Grossa',      css:'3px solid #111' },
]

const FONTES = ['Arial','Arial Narrow','Calibri','Times New Roman'] as const

const QC = [
  'FFFFFF','F5F5F5','E8E8E8','D9D9D9','BFBFBF','808080','333333','000000',
  'DEEAF1','BDD7EE','9BC2E6','2E75B6','1F3864','0D1B3E',
  'E2EFDA','C6EFCE','A9D08E','70AD47','4E6B30','375623',
  'FFF2CC','FFE699','FFEB9C','ED7D31','C55A11','843C0C',
  'FCE4D6','F8CBAD','F4B084','FF6B6B','CC0000','800000',
]

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const hx = (c: string) => `#${c.replace('#','')}`

function txtC(c: string): string {
  const s = c.replace('#','')
  const r = parseInt(s.slice(0,2),16)||0, g = parseInt(s.slice(2,4),16)||0, b = parseInt(s.slice(4,6),16)||0
  return (0.299*r + 0.587*g + 0.114*b) / 255 > 0.55 ? '#222' : '#fff'
}

// ─── CELL HELPERS ────────────────────────────────────────────────────────────

function Z({ id, children, style, cur, zona, editing, onClick }: {
  id: string; children?: React.ReactNode; style?: React.CSSProperties
  cur: ModeloPlanilha; zona: string|null; editing: boolean
  onClick: (id:string) => void
}) {
  const z = ZONAS.find(z=>z.id===id)
  if (!z) return null
  const bg = hx(cur.cores[z.corKey] ?? 'FFFFFF')
  const sel = zona===id && editing
  const bk = z.bordaKey
  const bs = bk
    ? cur.bordas[bk]==='thin'?'1px solid #000':cur.bordas[bk]==='medium'?'2px solid #000':cur.bordas[bk]==='thick'?'3px solid #000':undefined
    : undefined
  return (
    <div onClick={e=>{e.stopPropagation();onClick(id)}} style={{
      background:bg, color:txtC(cur.cores[z.corKey]??'FFFFFF'),
      border:sel?'2px solid #6366f1':bs, outline:sel?'2px solid #a5b4fc':undefined,
      cursor:'pointer', transition:'all .1s', position:'relative', ...style,
    }}>
      {children}
      {sel && <div style={{position:'absolute',top:1,right:1,background:'#6366f1',color:'#fff',borderRadius:3,padding:'0 3px',fontSize:6,fontWeight:'bold',lineHeight:'14px',zIndex:5}}>✓</div>}
    </div>
  )
}

// ─── COMPONENTE PRINCIPAL ────────────────────────────────────────────────────

export function ModeloEditor() {
  const { modelos, salvarModelo, deletarModelo, clonarModelo, resetModelo } = useModeloStore()
  const [selId,     setSelId]     = useState(modelos[0]?.id ?? '')
  const [draft,     setDraft]     = useState<ModeloPlanilha|null>(null)
  const [zona,      setZona]      = useState<string|null>(null)
  const [aba,       setAba]       = useState<'med'|'mem'|'cores'|'fonte'|'bordas'>('med')
  const [cloneNome, setCloneNome] = useState('')
  const [showClone, setShowClone] = useState(false)

  const cur = useMemo(() => draft ?? modelos.find(m=>m.id===selId) ?? modelos[0], [draft,modelos,selId])
  const editing = !!draft
  const C = cur?.cores
  const isPref = cur?.base === 'PREFEITURA'

  const selecionar = (id:string) => { if(draft&&!confirm('Descartar alterações?'))return; setSelId(id);setDraft(null);setZona(null) }
  const iniciarEdicao = () => { const m=modelos.find(x=>x.id===selId); if(m){setDraft(JSON.parse(JSON.stringify(m)));setAba('med')} }
  const setCor = useCallback((k:keyof ModeloPlanilha['cores'],v:string)=>setDraft(d=>d?{...d,cores:{...d.cores,[k]:v.replace('#','').toUpperCase()}}:d),[])
  const setFonte = useCallback((k:keyof ModeloPlanilha['fonte'],v:any)=>setDraft(d=>d?{...d,fonte:{...d.fonte,[k]:v}}:d),[])
  const setBorda = useCallback((k:keyof ModeloPlanilha['bordas'],v:BorderStyle)=>setDraft(d=>d?{...d,bordas:{...d.bordas,[k]:v}}:d),[])
  const salvar = () => { if(!draft)return; salvarModelo(draft);setDraft(null);toast.success(`"${draft.nome}" salvo!`) }
  const clicarZona = (id:string) => { if(!editing){iniciarEdicao();setTimeout(()=>setZona(id),50)}else setZona(p=>p===id?null:id) }

  const handleClone = () => { if(!cloneNome.trim()){toast.error('Informe um nome');return}; const c=clonarModelo(selId,cloneNome.trim());setSelId(c.id);setCloneNome('');setShowClone(false);toast.success(`"${c.nome}" criado!`) }
  const handleDelete = () => { if(cur.builtin){toast.error('Padrão não pode ser deletado');return}; if(!confirm(`Deletar "${cur.nome}"?`))return; deletarModelo(cur.id);setSelId(modelos.find(x=>x.id!==cur.id)?.id??'');toast.success('Deletado') }
  const handleReset = () => { if(!cur.builtin)return; if(!confirm('Restaurar valores padrão?'))return; resetModelo(cur.id);setDraft(null);setZona(null);toast.success('Restaurado!') }

  if (!cur) return null

  // Dados fictícios para a preview
  const sampleData = [
    { item:'1', desc:'SERVIÇOS PRELIMINARES', grupo:true },
    { item:'1.1', cod:'103689', desc:'Placa de obra em chapa galvanizada', fonte:'SINAPI', un:'M2', qtd:'6,00', pu:'R$ 459,98', tot:'R$ 574,98', zona:'linha_par' },
    { item:'1.2', cod:'98459', desc:'Tapume com telha metálica', fonte:'SINAPI', un:'M2', qtd:'415,14', pu:'R$ 97,92', tot:'R$ 50.813,48', zona:'linha_periodo', bold:true },
    { item:'1.3', cod:'101509', desc:'Entrada de energia elétrica, aérea, trifásica', fonte:'SINAPI', un:'UN', qtd:'1,00', pu:'R$ 1.965,77', tot:'R$ 2.457,22', zona:'linha_impar' },
    { item:'2', desc:'FUNDAÇÕES', grupo:true },
    { item:'2.1', cod:'93358', desc:'Escavação manual de vala', fonte:'SINAPI', un:'M3', qtd:'558,21', pu:'R$ 81,25', tot:'R$ 56.015,04', zona:'linha_100pct' },
  ]

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm" style={{minHeight:760}}>

      {/* ═══ HEADER ═══ */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-indigo-50/30">
        <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center shrink-0">
          <TableProperties size={18} className="text-indigo-600"/>
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-slate-800 text-sm">Editor de Modelos de Planilha</h2>
          <p className="text-[11px] text-slate-400 mt-0.5">Preview fiel ao PDF/Excel • Clique nas zonas coloridas para editar</p>
        </div>
        <div className="flex items-center gap-1.5">
          {draft ? (
            <>
              <button onClick={()=>{if(confirm('Descartar?')){setDraft(null);setZona(null)}}}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-500 hover:bg-slate-50">Descartar</button>
              <button onClick={salvar}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-xs font-bold shadow-sm">
                <Save size={12}/> Salvar modelo
              </button>
            </>
          ) : (
            <>
              {cur.builtin && <button onClick={handleReset} className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-500 hover:border-orange-300 hover:text-orange-600"><RotateCcw size={12}/> Reset</button>}
              {!cur.builtin && <button onClick={handleDelete} className="flex items-center gap-1 px-3 py-1.5 border border-red-200 rounded-lg text-xs text-red-500 hover:bg-red-50"><Trash2 size={12}/> Deletar</button>}
              <button onClick={iniciarEdicao} className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-xs font-bold shadow-sm">
                <Palette size={12}/> Editar modelo
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex" style={{minHeight:700}}>

        {/* ═══ SIDEBAR ═══ */}
        <div className="w-48 border-r border-slate-100 flex flex-col bg-slate-50/60 shrink-0">
          <div className="p-2.5 flex-1 overflow-y-auto">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1.5 mb-2">Modelos</p>
            <div className="space-y-1">
              {modelos.map(m => (
                <button key={m.id} onClick={()=>selecionar(m.id)}
                  className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left transition-all text-[11px] ${
                    selId===m.id ? 'bg-indigo-500 text-white shadow-sm' : 'hover:bg-white text-slate-600'
                  }`}>
                  <div className="shrink-0 rounded overflow-hidden flex flex-col gap-px border border-white/20">
                    <div className="w-6 h-2.5" style={{background:hx(m.cores.hdr_principal)}}/>
                    <div className="w-6 h-2.5" style={{background:hx(m.cores.th_medicao)}}/>
                    <div className="w-6 h-1.5" style={{background:hx(m.cores.linha_grupo)}}/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate leading-tight text-[11px]">{m.nome}</p>
                    <p className={`text-[8px] mt-0.5 ${selId===m.id?'text-indigo-200':'text-slate-400'}`}>
                      {m.builtin?'🔒 Padrão':m.base}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="p-2.5 border-t border-slate-100">
            {showClone ? (
              <div className="space-y-1.5">
                <input value={cloneNome} onChange={e=>setCloneNome(e.target.value)} placeholder="Nome do novo modelo" autoFocus
                  onKeyDown={e=>e.key==='Enter'&&handleClone()}
                  className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"/>
                <div className="flex gap-1">
                  <button onClick={handleClone} className="flex-1 py-1.5 bg-indigo-500 text-white rounded-lg text-[11px] font-semibold hover:bg-indigo-600"><Plus size={10}/></button>
                  <button onClick={()=>{setShowClone(false);setCloneNome('')}} className="px-3 py-1.5 border border-slate-200 bg-white rounded-lg text-[11px] text-slate-500">✕</button>
                </div>
              </div>
            ) : (
              <button onClick={()=>setShowClone(true)}
                className="w-full flex items-center gap-1.5 px-2 py-2 border border-dashed border-slate-300 rounded-lg text-[11px] text-slate-400 hover:border-indigo-300 hover:text-indigo-600 hover:bg-white transition-all">
                <Copy size={10}/> Clonar modelo
              </button>
            )}
          </div>
        </div>

        {/* ═══ EDITOR PRINCIPAL ═══ */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* Toolbar nome */}
          <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-100 bg-white shrink-0">
            {draft ? (
              <input value={draft.nome} onChange={e=>setDraft({...draft,nome:e.target.value})}
                className="font-bold text-sm text-slate-800 border border-indigo-300 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400 w-56"/>
            ) : (
              <p className="font-bold text-sm text-slate-800">{cur.nome}</p>
            )}
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${isPref?'bg-emerald-100 text-emerald-700':'bg-blue-100 text-blue-700'}`}>
              {isPref?'Layout Prefeitura':'Layout Estado'}
            </span>
            <span className="text-[10px] text-slate-400 ml-auto">{cur.descricao}</span>
          </div>

          {/* Abas */}
          <div className="flex border-b border-slate-100 bg-white shrink-0 px-3">
            {([
              {id:'med' as const,    icon:Eye,      label:'Preview Medição'},
              {id:'mem' as const,    icon:Layers,   label:'Preview Memória'},
              {id:'cores' as const,  icon:Palette,  label:'Todas as Cores'},
              {id:'fonte' as const,  icon:Type,     label:'Fontes'},
              {id:'bordas' as const, icon:Rows3,    label:'Bordas'},
            ]).map(({id,icon:Icon,label})=>(
              <button key={id} onClick={()=>setAba(id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium -mb-px border-b-2 transition-colors ${
                  aba===id?'border-indigo-500 text-indigo-600':'border-transparent text-slate-500 hover:text-slate-700'
                }`}><Icon size={12}/>{label}</button>
            ))}
          </div>

          <div className="flex flex-1 min-h-0 overflow-hidden">

            {/* ═══ PREVIEW MED ═══ */}
            {aba==='med' && (
              <>
              <div className="flex-1 overflow-auto p-4 bg-slate-100/60">
                {!editing && <div className="mb-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-2 text-[11px] text-amber-700"><Palette size={12}/>Clique em <strong>Editar modelo</strong> e depois nas zonas coloridas.</div>}

                <div className="rounded-lg overflow-hidden shadow border border-slate-300 bg-white" style={{fontFamily:cur.fonte.nome_base,fontSize:cur.fonte.tamanho_dados}}>

                  {/* ── Cabeçalho ── */}
                  {isPref ? (
                    /* PREFEITURA: Logo | Central | Empresa */
                    <div style={{display:'flex',borderBottom:'1px solid #000'}}>
                      <Z id="empresa_bg" cur={cur} zona={zona} editing={editing} onClick={clicarZona}
                         style={{width:56,minHeight:72,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,borderRight:'1px solid #000',fontSize:7}}>
                        [ LOGO ]
                      </Z>
                      <div style={{flex:1,fontSize:6.5}}>
                        <div style={{display:'flex',borderBottom:'1px solid #ccc'}}>
                          <div style={{flex:1,padding:'2px 4px',borderRight:'1px solid #ccc'}}><div style={{fontSize:5.5,color:'#888'}}>CONCEDENTE</div>
                            <Z id="hdr_principal" cur={cur} zona={zona} editing={editing} onClick={clicarZona}
                               style={{fontWeight:'bold',fontSize:7,padding:'1px 2px',background:'transparent',border:'none'}}>
                              PREFEITURA MUNICIPAL
                            </Z>
                          </div>
                          <div style={{padding:'2px 4px',borderRight:'1px solid #ccc',minWidth:50}}><div style={{fontSize:5.5,color:'#888'}}>Data BM</div><div style={{fontWeight:'bold'}}>10/03/2026</div></div>
                          <div style={{padding:'2px 4px',borderRight:'1px solid #ccc',minWidth:50}}><div style={{fontSize:5.5,color:'#888'}}>Período</div><div style={{fontWeight:'bold'}}>02/03 à 10/03</div></div>
                          <Z id="hdr_cabec" cur={cur} zona={zona} editing={editing} onClick={clicarZona}
                             style={{padding:'2px 4px',textAlign:'right',minWidth:70}}>
                            <div style={{fontSize:5.5}}>VALOR CONTRATO</div><div style={{fontWeight:'bold'}}>R$ 4.307.030,13</div>
                          </Z>
                        </div>
                        <div style={{display:'flex',borderBottom:'1px solid #ccc'}}>
                          <div style={{flex:1,padding:'2px 4px'}}><div style={{fontWeight:'bold'}}>CRECHE ANA CATARINA</div></div>
                          <Z id="hdr_cabec" cur={cur} zona={zona} editing={editing} onClick={clicarZona} style={{padding:'2px 4px',textAlign:'right',minWidth:70}}>
                            <div style={{fontSize:5.5}}>VALOR ACUMULADO</div><div style={{fontWeight:'bold'}}>R$ 28.724,32</div>
                          </Z>
                        </div>
                        <div style={{display:'flex',borderBottom:'1px solid #ccc'}}>
                          <div style={{flex:1,padding:'2px 4px'}}><strong>RD SOLUÇÕES</strong> — 43.357.757/0001-40</div>
                          <Z id="hdr_cabec" cur={cur} zona={zona} editing={editing} onClick={clicarZona} style={{padding:'2px 4px',textAlign:'right',minWidth:70}}>
                            <div style={{fontSize:5.5}}>SALDO CONTRATO</div><div style={{fontWeight:'bold'}}>R$ 4.278.305,81</div>
                          </Z>
                        </div>
                        <div style={{display:'flex'}}>
                          <div style={{flex:1,padding:'2px 4px'}}><strong>BM Nº 1</strong> — Emissão: 10/03/2026</div>
                          <Z id="hdr_topo" cur={cur} zona={zona} editing={editing} onClick={clicarZona} style={{padding:'2px 4px',textAlign:'right',minWidth:70,fontWeight:'bold'}}>
                            <div style={{fontSize:5.5}}>VALOR MEDIDO</div>R$ 28.724,32
                          </Z>
                        </div>
                      </div>
                      <Z id="empresa_bg" cur={cur} zona={zona} editing={editing} onClick={clicarZona}
                         style={{width:68,padding:'3px 4px',flexShrink:0,borderLeft:'1px solid #000',fontSize:5.5,lineHeight:'1.4'}}>
                        <strong style={{fontSize:6}}>RD CONSTRUTORA</strong><br/>Rua Bela Vista, 874<br/>CNPJ: 43.357.757<br/>rd_solucoes@outlook
                      </Z>
                    </div>
                  ) : (
                    /* ESTADO: Logo | Centro | Nº Medição */
                    <>
                    <Z id="hdr_topo" cur={cur} zona={zona} editing={editing} onClick={clicarZona} style={{height:8}}/>
                    <div style={{display:'flex'}}>
                      <Z id="empresa_bg" cur={cur} zona={zona} editing={editing} onClick={clicarZona}
                         style={{width:56,padding:'6px 3px',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:7}}>
                        [ LOGO ]
                      </Z>
                      <div style={{flex:1}}>
                        <Z id="hdr_principal" cur={cur} zona={zona} editing={editing} onClick={clicarZona}
                           style={{padding:'4px 8px',textAlign:'center',fontWeight:'bold',fontSize:cur.fonte.tamanho_cabec,fontFamily:cur.fonte.nome_cabec}}>
                          SECRETARIA DE ESTADO DE INFRAESTRUTURA
                        </Z>
                        <Z id="hdr_sub" cur={cur} zona={zona} editing={editing} onClick={clicarZona}
                           style={{padding:'3px 8px',textAlign:'center',fontSize:7}}>
                          COORDENADORIA DE OBRAS E INFRAESTRUTURA
                        </Z>
                        <Z id="hdr_cabec" cur={cur} zona={zona} editing={editing} onClick={clicarZona}
                           style={{padding:'2px 8px',textAlign:'center',fontSize:6.5}}>
                          OBRA: Creche Ana Catarina | LOCAL: Canguaretama/RN | BDI: 25,00%
                        </Z>
                      </div>
                      <Z id="hdr_topo" cur={cur} zona={zona} editing={editing} onClick={clicarZona}
                         style={{width:56,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:'bold',fontSize:9,flexShrink:0,textAlign:'center'}}>
                        1ª MED.
                      </Z>
                    </div>
                    </>
                  )}

                  {/* ── Cabeçalho da tabela ── */}
                  <div style={{display:'flex'}}>
                    {(isPref
                      ? [{l:'ITEM',z:'th_base',w:20},{l:'CÓD',z:'th_base',w:35},{l:'DESCRIÇÃO',z:'th_base',f:true},{l:'FONTE',z:'th_base',w:24},{l:'UN',z:'th_base',w:18},{l:'QTD',z:'th_base',w:28},
                         {l:'P.UNIT',z:'th_base',w:36},{l:'P.TOTAL',z:'th_base',w:38},
                         {l:'AC.ANT',z:'th_medicao',w:30},{l:'MED.PER',z:'th_medicao',w:32},{l:'%',z:'th_medicao',w:18},{l:'MED.R$',z:'th_medicao',w:36},{l:'SALDO R$',z:'th_medicao',w:34},{l:'%',z:'th_medicao',w:18}]
                      : [{l:'ITEM',z:'th_base',w:20},{l:'FONTE',z:'th_base',w:28},{l:'CÓD',z:'th_base',w:30},{l:'DESCRIÇÃO',z:'th_base',f:true},{l:'UN',z:'th_base',w:18},{l:'QTD',z:'th_base',w:28},
                         {l:'PU R$',z:'th_base',w:30},{l:'c/Desc',z:'th_base',w:30},{l:'c/BDI',z:'th_base',w:30},{l:'TOTAL',z:'th_base',w:36},{l:'PESO',z:'th_base',w:20},
                         {l:'PREV',z:'th_medicao',w:28},{l:'ANT',z:'th_medicao',w:28},{l:'PER.',z:'th_medicao',w:30},{l:'ACUM',z:'th_medicao',w:28},{l:'SALDO',z:'th_medicao',w:28},
                         {l:'U.BDI',z:'th_medicao',w:28},{l:'AC.R$',z:'th_medicao',w:32},{l:'PER.R$',z:'th_medicao',w:32},{l:'SALD.R$',z:'th_medicao',w:32},{l:'%',z:'th_medicao',w:18}]
                    ).map((col,i) => (
                      <Z key={i} id={col.z} cur={cur} zona={zona} editing={editing} onClick={clicarZona}
                         style={{width:col.f?undefined:col.w,flex:col.f?1:undefined,padding:'3px 2px',textAlign:'center',fontWeight:'bold',
                           fontSize:cur.fonte.tamanho_th-1,fontFamily:cur.fonte.nome_cabec,borderRight:'1px solid rgba(255,255,255,0.15)',whiteSpace:'nowrap',overflow:'hidden'}}>
                        {col.l}
                      </Z>
                    ))}
                  </div>

                  {/* ── Linhas de dados ── */}
                  {sampleData.map((row,ri) => row.grupo ? (
                    <Z key={ri} id="linha_grupo" cur={cur} zona={zona} editing={editing} onClick={clicarZona}
                       style={{padding:'3px 8px',fontWeight:'bold',fontSize:7.5,borderBottom:'1px solid rgba(0,0,0,0.1)'}}>
                      {row.item} — {row.desc}
                    </Z>
                  ) : (
                    <Z key={ri} id={row.zona!} cur={cur} zona={zona} editing={editing} onClick={clicarZona}
                       style={{display:'flex',borderBottom:'1px solid rgba(0,0,0,0.06)',fontWeight:row.bold?'bold':'normal',fontSize:6.5}}>
                      <div style={{width:20,padding:'2px',textAlign:'center',borderRight:'1px solid rgba(0,0,0,0.04)'}}>{row.item}</div>
                      {isPref && <div style={{width:35,padding:'2px',textAlign:'center',borderRight:'1px solid rgba(0,0,0,0.04)'}}>{row.cod}</div>}
                      {!isPref && <div style={{width:28,padding:'2px',textAlign:'center',borderRight:'1px solid rgba(0,0,0,0.04)'}}>{row.fonte}</div>}
                      {!isPref && <div style={{width:30,padding:'2px',textAlign:'center',borderRight:'1px solid rgba(0,0,0,0.04)'}}>{row.cod}</div>}
                      <div style={{flex:1,padding:'2px 4px',borderRight:'1px solid rgba(0,0,0,0.04)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{row.desc}</div>
                      {isPref && <div style={{width:24,padding:'2px',textAlign:'center',borderRight:'1px solid rgba(0,0,0,0.04)'}}>{row.fonte}</div>}
                      <div style={{width:18,padding:'2px',textAlign:'center',borderRight:'1px solid rgba(0,0,0,0.04)'}}>{row.un}</div>
                      <div style={{width:28,padding:'2px',textAlign:'right',borderRight:'1px solid rgba(0,0,0,0.04)'}}>{row.qtd}</div>
                      <div style={{width:isPref?36:30,padding:'2px',textAlign:'right',borderRight:'1px solid rgba(0,0,0,0.04)'}}>{row.pu}</div>
                      <div style={{width:isPref?38:36,padding:'2px',textAlign:'right',borderRight:'1px solid rgba(0,0,0,0.04)',fontWeight:'bold'}}>{row.tot}</div>
                      {!isPref && <><div style={{width:20,padding:'2px',textAlign:'center',borderRight:'1px solid rgba(0,0,0,0.04)'}}>—</div>
                        <div style={{width:28,padding:'2px',textAlign:'right',borderRight:'1px solid rgba(0,0,0,0.04)'}}>0,00</div>
                        <div style={{width:28,padding:'2px',textAlign:'right',borderRight:'1px solid rgba(0,0,0,0.04)'}}>0,00</div>
                        <div style={{width:30,padding:'2px',textAlign:'right',borderRight:'1px solid rgba(0,0,0,0.04)',fontWeight:'bold'}}>{row.zona==='linha_periodo'?'40,00':'0,00'}</div>
                        <div style={{width:28,padding:'2px',textAlign:'right',borderRight:'1px solid rgba(0,0,0,0.04)'}}>0,00</div>
                        <div style={{width:28,padding:'2px',textAlign:'right',borderRight:'1px solid rgba(0,0,0,0.04)'}}>0,00</div>
                        <div style={{width:28,padding:'2px',textAlign:'right',borderRight:'1px solid rgba(0,0,0,0.04)'}}>—</div>
                        <div style={{width:32,padding:'2px',textAlign:'right',borderRight:'1px solid rgba(0,0,0,0.04)'}}>R$ 0,00</div>
                        <div style={{width:32,padding:'2px',textAlign:'right',borderRight:'1px solid rgba(0,0,0,0.04)'}}>R$ 0,00</div>
                        <div style={{width:32,padding:'2px',textAlign:'right',borderRight:'1px solid rgba(0,0,0,0.04)'}}>R$ 0,00</div>
                        <div style={{width:18,padding:'2px',textAlign:'right'}}>0%</div>
                      </>}
                      {isPref && <><div style={{width:30,padding:'2px',textAlign:'right',borderRight:'1px solid rgba(0,0,0,0.04)'}}>0,00</div>
                        <div style={{width:32,padding:'2px',textAlign:'right',fontWeight:'bold',borderRight:'1px solid rgba(0,0,0,0.04)'}}>{row.zona==='linha_periodo'?'40,00':'0,00'}</div>
                        <div style={{width:18,padding:'2px',textAlign:'right',borderRight:'1px solid rgba(0,0,0,0.04)'}}>0%</div>
                        <div style={{width:36,padding:'2px',textAlign:'right',borderRight:'1px solid rgba(0,0,0,0.04)'}}>R$ 0,00</div>
                        <div style={{width:34,padding:'2px',textAlign:'right',borderRight:'1px solid rgba(0,0,0,0.04)'}}>R$ 0,00</div>
                        <div style={{width:18,padding:'2px',textAlign:'right'}}>{row.zona==='linha_100pct'?'100%':'0%'}</div>
                      </>}
                    </Z>
                  ))}

                  {/* Totais */}
                  <Z id="linha_total" cur={cur} zona={zona} editing={editing} onClick={clicarZona}
                     style={{padding:'4px 10px',fontWeight:'bold',fontSize:8,display:'flex',justifyContent:'space-between'}}>
                    <span>TOTAIS GERAIS DO ORÇAMENTO</span><span>R$ 4.307.030,13</span>
                  </Z>

                  {/* Extenso */}
                  <Z id="extenso_bg" cur={cur} zona={zona} editing={editing} onClick={clicarZona}
                     style={{padding:'3px 10px',fontStyle:'italic',fontSize:7,borderTop:`1px solid ${hx(C.extenso_borda||'ED7D31')}`}}>
                    A presente medição importa o valor de: VINTE E OITO MIL, SETECENTOS E VINTE E QUATRO REAIS E TRINTA E DOIS CENTAVOS — R$ 28.724,32
                  </Z>

                  {/* Demo */}
                  <Z id="demo_cabec" cur={cur} zona={zona} editing={editing} onClick={clicarZona}
                     style={{padding:'3px 10px',fontWeight:'bold',fontSize:7.5}}>
                    DEMONSTRATIVO FINANCEIRO
                  </Z>
                  {[['VALOR TOTAL DO ORÇAMENTO','R$ 4.307.030,13',true],['1ª MEDIÇÃO','R$ 28.724,32',false],['% ACUMULADO','0,67%',true],['SALDO','R$ 4.278.305,81',false]].map(([l,v,par],i)=>(
                    <div key={i} style={{display:'flex',fontSize:7,background:par?'#f5f5f5':'#fff',borderBottom:'1px solid #eee'}}>
                      <div style={{flex:1,padding:'2px 10px',fontWeight:i===0||i===3?'bold':'normal'}}>{l as string}</div>
                      <div style={{width:90,padding:'2px 10px',textAlign:'right',fontWeight:'bold'}}>{v as string}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Painel lateral */}
              <ZonePanel zona={ZONAS.find(z=>z.id===zona)??null} cur={cur} editing={editing} setCor={setCor} setBorda={setBorda} onClear={()=>setZona(null)}/>
              </>
            )}

            {/* ═══ PREVIEW MEM ═══ */}
            {aba==='mem' && (
              <>
              <div className="flex-1 overflow-auto p-4 bg-slate-100/60">
                {!editing && <div className="mb-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-2 text-[11px] text-amber-700"><Palette size={12}/>Clique em <strong>Editar modelo</strong> e depois nas zonas.</div>}
                <div className="rounded-lg overflow-hidden shadow border border-slate-300 bg-white" style={{fontFamily:cur.fonte.nome_base,fontSize:7.5}}>
                  <Z id="mem_titulo" cur={cur} zona={zona} editing={editing} onClick={clicarZona}
                     style={{padding:'5px 12px',fontWeight:'bold',fontSize:9}}>
                    MEMÓRIA DE CÁLCULO | Creche Ana Catarina | 1ª MEDIÇÃO | 02/03/2026 à 10/03/2026
                  </Z>

                  <div style={{display:'flex',fontWeight:'bold',fontSize:6.5,background:hx(C.mem_titulo),color:'#fff'}}>
                    {['ITEM','DESCRIÇÃO','Larg.','Comp.','Alt.','Perim.','Área','Vol.','Kg','Outros','Desc.','Qtde','TOTAL','STATUS'].map((h,i)=>(
                      <div key={i} style={{width:i===0?28:i===1?undefined:i===13?42:34,flex:i===1?1:undefined,padding:'3px 2px',textAlign:'center',borderRight:'1px solid rgba(255,255,255,0.12)'}}>{h}</div>
                    ))}
                  </div>

                  <Z id="mem_grupo" cur={cur} zona={zona} editing={editing} onClick={clicarZona}
                     style={{padding:'4px 12px',fontWeight:'bold',fontSize:7.5}}>
                    1.1 — Placa de obra em chapa galvanizada — M²
                  </Z>

                  <Z id="mem_apagar" cur={cur} zona={zona} editing={editing} onClick={clicarZona}
                     style={{display:'flex',alignItems:'center',fontSize:6.5,borderBottom:'1px solid rgba(0,0,0,0.06)'}}>
                    <div style={{width:28,textAlign:'center',padding:'2px'}}>1.1.1</div>
                    <div style={{flex:1,padding:'2px 4px'}}>Placa de obra — 1,20 × 1,80</div>
                    {['-','-','-','-','-','-','-','-','-','-'].map((_,i)=><div key={i} style={{width:34,textAlign:'right',padding:'2px'}}>{i===9?'2,16':'-'}</div>)}
                    <div style={{width:42,textAlign:'right',padding:'2px',fontWeight:'bold'}}>2,16</div>
                    <div style={{width:42,textAlign:'center',padding:'2px',fontSize:5.5}}>A PAGAR</div>
                  </Z>

                  <Z id="mem_pago" cur={cur} zona={zona} editing={editing} onClick={clicarZona}
                     style={{display:'flex',alignItems:'center',fontSize:6.5,borderBottom:'1px solid rgba(0,0,0,0.06)'}}>
                    <div style={{width:28,textAlign:'center',padding:'2px'}}>1.2.1</div>
                    <div style={{flex:1,padding:'2px 4px'}}>Tapume metálico — 15,00 × 2,20</div>
                    {['-','-','-','-','-','-','-','-','-','-'].map((_,i)=><div key={i} style={{width:34,textAlign:'right',padding:'2px'}}>{i===9?'33,00':'-'}</div>)}
                    <div style={{width:42,textAlign:'right',padding:'2px',fontWeight:'bold'}}>33,00</div>
                    <div style={{width:42,textAlign:'center',padding:'2px',fontSize:5.5}}>PAGO</div>
                  </Z>

                  <div style={{display:'flex',fontSize:7,fontWeight:'bold'}}>
                    {[{l:'TOTAL ACUMULADO',z:'mem_tot_acum'},{l:'TOTAL ANTERIOR',z:'mem_tot_ant'},{l:'TOTAL DO MÊS',z:'mem_tot_mes'}].map(t=>(
                      <Z key={t.z} id={t.z} cur={cur} zona={zona} editing={editing} onClick={clicarZona}
                         style={{flex:1,padding:'5px 6px',textAlign:'center',borderRight:'1px solid rgba(0,0,0,0.08)'}}>
                        {t.l}<br/><span style={{fontSize:6.5,opacity:.8}}>35,16</span>
                      </Z>
                    ))}
                  </div>
                </div>
              </div>
              <ZonePanel zona={ZONAS.find(z=>z.id===zona)??null} cur={cur} editing={editing} setCor={setCor} setBorda={setBorda} onClear={()=>setZona(null)}/>
              </>
            )}

            {/* ═══ ABA CORES ═══ */}
            {aba==='cores' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {!editing && <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-[11px] text-amber-700 flex items-center gap-2"><Lock size={11}/> Clique em <strong>Editar modelo</strong> para modificar.</div>}
                {GRUPOS.map(g => {
                  const items = ZONAS.filter(z=>z.grupo===g)
                  return (
                    <div key={g} className="border border-slate-200 rounded-lg overflow-hidden">
                      <div className="px-3 py-2 bg-slate-50 text-[11px] font-bold text-slate-700 flex items-center gap-2">
                        <div className="w-3 h-3 rounded" style={{background:hx(items[0]?.corKey?cur.cores[items[0].corKey]:'999')}}/>
                        {g} <span className="text-slate-400 font-normal">({items.length})</span>
                      </div>
                      <div className="px-3 py-1.5 divide-y divide-slate-50">
                        {items.map(z => (
                          <div key={z.id} className="flex items-center gap-2 py-1.5">
                            <div className="w-5 h-5 rounded border border-white shadow-sm shrink-0" style={{background:hx(cur.cores[z.corKey])}}/>
                            <span className="flex-1 text-[11px] text-slate-600">{z.label}</span>
                            {editing ? (
                              <div className="flex items-center gap-1 shrink-0">
                                <input type="color" value={hx(cur.cores[z.corKey])} onChange={e=>setCor(z.corKey,e.target.value.replace('#','').toUpperCase())}
                                  className="w-7 h-6 rounded cursor-pointer border border-slate-200 p-0.5"/>
                                <input type="text" value={cur.cores[z.corKey].toUpperCase()} maxLength={6}
                                  onChange={e=>{const v=e.target.value.replace('#','').toUpperCase();if(/^[0-9A-F]{0,6}$/.test(v))setCor(z.corKey,v)}}
                                  className="w-14 border border-slate-200 rounded px-1 py-0.5 text-[9px] font-mono text-center uppercase focus:outline-none focus:ring-1 focus:ring-indigo-400"/>
                              </div>
                            ) : <span className="text-[9px] text-slate-400 font-mono">#{cur.cores[z.corKey].toUpperCase()}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* ═══ ABA FONTES ═══ */}
            {aba==='fonte' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {!editing && <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-[11px] text-amber-700 flex items-center gap-2"><Lock size={11}/> Clique em <strong>Editar modelo</strong>.</div>}
                {(['nome_base','nome_cabec'] as const).map(key => (
                  <div key={key} className="flex items-center gap-3 border border-slate-200 rounded-lg px-4 py-3 bg-white">
                    <Type size={15} className="text-slate-400 shrink-0"/>
                    <div className="flex-1">
                      <p className="text-[11px] font-semibold text-slate-700">{key==='nome_base'?'Fonte — dados':'Fonte — cabeçalhos'}</p>
                      <p className="text-sm mt-0.5 text-slate-600" style={{fontFamily:cur.fonte[key]}}>{cur.fonte[key]} — AaBb 123</p>
                    </div>
                    {editing ? <select value={draft!.fonte[key]} onChange={e=>setFonte(key,e.target.value)}
                      className="border border-slate-200 rounded-lg px-2 py-1 text-[11px] bg-white focus:ring-1 focus:ring-indigo-400">
                      {FONTES.map(f=><option key={f} value={f}>{f}</option>)}</select>
                    : <span className="text-[11px] text-slate-400">{cur.fonte[key]}</span>}
                  </div>
                ))}
                {([
                  {key:'tamanho_dados' as const,  label:'Tamanho dados (pt)',    min:6,max:14},
                  {key:'tamanho_th' as const,     label:'Tamanho cabeçalho (pt)',min:6,max:14},
                  {key:'tamanho_cabec' as const,  label:'Tamanho título (pt)',   min:8,max:18},
                ]).map(({key,label,min,max})=>(
                  <div key={key} className="flex items-center gap-3 border border-slate-200 rounded-lg px-4 py-3 bg-white">
                    <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center font-bold text-[11px] text-slate-600 shrink-0">{cur.fonte[key]}</div>
                    <p className="flex-1 text-[11px] font-medium text-slate-700">{label}</p>
                    {editing ? <div className="flex items-center gap-2 shrink-0">
                      <input type="range" min={min} max={max} value={draft!.fonte[key]} onChange={e=>setFonte(key,Number(e.target.value))} className="w-24 accent-indigo-500"/>
                      <span className="text-[11px] font-bold text-indigo-600 w-6 text-right">{draft!.fonte[key]}</span>
                    </div> : <span className="text-sm font-bold text-slate-600">{cur.fonte[key]}pt</span>}
                  </div>
                ))}
              </div>
            )}

            {/* ═══ ABA BORDAS ═══ */}
            {aba==='bordas' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {!editing && <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-[11px] text-amber-700 flex items-center gap-2"><Lock size={11}/> Clique em <strong>Editar modelo</strong>.</div>}
                {([
                  {key:'dados' as const,   label:'Células de dados',         desc:'Corpo da tabela de serviços'},
                  {key:'cabec' as const,   label:'Cabeçalho da tabela (TH)', desc:'ITEM, CÓDIGO, DESCRIÇÃO...'},
                  {key:'totais' as const,  label:'Linha de totais',           desc:'TOTAIS GERAIS DO ORÇAMENTO'},
                  {key:'externo' as const, label:'Borda externa / destaque',  desc:'Contorno dos blocos principais'},
                ]).map(({key,label,desc})=>(
                  <div key={key} className="border border-slate-200 rounded-lg px-4 py-3 bg-white">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-7 flex items-center justify-center bg-slate-50 rounded shrink-0">
                        <div className="w-6 h-5 bg-white rounded-sm text-[6px] font-bold text-slate-400 flex items-center justify-center"
                             style={{border:BORDAS_OPT.find(b=>b.v===cur.bordas[key])?.css??'none'}}>abc</div>
                      </div>
                      <div className="flex-1"><p className="text-[11px] font-semibold text-slate-700">{label}</p><p className="text-[9px] text-slate-400">{desc}</p></div>
                      <span className="text-[11px] text-slate-500">{BORDAS_OPT.find(b=>b.v===cur.bordas[key])?.l}</span>
                    </div>
                    {editing && <div className="flex gap-1.5">
                      {BORDAS_OPT.map(b=>(
                        <button key={b.v} onClick={()=>setBorda(key,b.v)}
                          className={`flex-1 py-2 rounded-lg text-[10px] font-medium border transition-all flex flex-col items-center gap-1 ${
                            cur.bordas[key]===b.v?'bg-indigo-500 text-white border-indigo-500':'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                          }`}>
                          <div className="w-5 h-3 rounded-sm" style={{border:b.css==='none'?'1px dashed #aaa':cur.bordas[key]===b.v?b.css.replace(/#[0-9a-f]+/gi,'rgba(255,255,255,0.85)'):b.css}}/>{b.l}
                        </button>
                      ))}
                    </div>}
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

// ─── ZONE PANEL (painel lateral direito) ─────────────────────────────────────

function ZonePanel({ zona, cur, editing, setCor, setBorda, onClear }: {
  zona: ZonaDef|null; cur: ModeloPlanilha; editing: boolean
  setCor: (k:keyof ModeloPlanilha['cores'],v:string)=>void
  setBorda: (k:keyof ModeloPlanilha['bordas'],v:BorderStyle)=>void
  onClear: ()=>void
}) {
  if (!editing) return (
    <div className="w-56 border-l border-slate-100 bg-slate-50/40 flex flex-col items-center justify-center gap-2 p-5 shrink-0">
      <MousePointer size={18} className="text-slate-300"/>
      <p className="text-[10px] text-slate-400 text-center leading-relaxed">Clique em <strong className="text-slate-600">Editar modelo</strong> para ativar a edição interativa</p>
    </div>
  )
  if (!zona) return (
    <div className="w-56 border-l border-slate-100 bg-indigo-50/20 flex flex-col items-center justify-center gap-2 p-5 shrink-0">
      <Palette size={18} className="text-indigo-300"/>
      <p className="text-[10px] text-indigo-500 text-center leading-relaxed">Clique em qualquer <strong>zona colorida</strong> na preview para editar</p>
    </div>
  )

  const cor = cur.cores[zona.corKey]
  const bk = zona.bordaKey

  return (
    <div className="w-56 border-l border-slate-100 bg-white flex flex-col shrink-0 overflow-y-auto">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-slate-100">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[10px] font-bold text-slate-700">Zona selecionada</p>
          <button onClick={onClear} className="text-slate-400 hover:text-slate-600 text-[10px]">✕</button>
        </div>
        <div className="rounded-lg overflow-hidden border border-slate-200 mb-1.5">
          <div className="py-1.5 px-2 text-center text-[8px] font-bold" style={{background:hx(cor),color:txtC(cor)}}>{zona.label}</div>
        </div>
        <p className="text-[9px] text-slate-400 leading-snug">{zona.desc}</p>
        <p className="text-[8px] text-slate-300 mt-1 font-mono">grupo: {zona.grupo} • chave: {zona.corKey}</p>
      </div>

      {/* Cor picker */}
      <div className="px-3 py-2.5 border-b border-slate-100">
        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-2">Cor de fundo</p>
        <div className="flex items-center gap-2 mb-2">
          <input type="color" value={hx(cor)} onChange={e=>setCor(zona.corKey,e.target.value.replace('#','').toUpperCase())}
            className="w-10 h-8 rounded-lg cursor-pointer border border-slate-200 p-0.5"/>
          <input type="text" value={cor.toUpperCase()} maxLength={6}
            onChange={e=>{const v=e.target.value.replace('#','').toUpperCase();if(/^[0-9A-F]{0,6}$/.test(v))setCor(zona.corKey,v)}}
            className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-[10px] font-mono uppercase text-center focus:ring-1 focus:ring-indigo-400"/>
        </div>
        <div className="flex flex-wrap gap-1">
          {QC.map(c=>(
            <button key={c} onClick={()=>setCor(zona.corKey,c)} title={`#${c}`}
              className={`w-4 h-4 rounded border transition-all hover:scale-110 ${cor.toUpperCase()===c?'border-indigo-500 scale-110 ring-1 ring-indigo-300':'border-white shadow-sm'}`}
              style={{background:hx(c)}}/>
          ))}
        </div>
      </div>

      {/* Preview contraste */}
      <div className="px-3 py-2 border-b border-slate-100">
        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Preview do texto</p>
        <div className="rounded-lg px-2.5 py-1.5 text-[10px] font-medium border border-slate-100" style={{background:hx(cor),color:txtC(cor)}}>
          Texto de exemplo — AaBbCc 123
        </div>
      </div>

      {/* Bordas */}
      {bk && (
        <div className="px-3 py-2.5 border-b border-slate-100">
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-2">Borda</p>
          <div className="space-y-1">
            {BORDAS_OPT.map(b=>(
              <button key={b.v} onClick={()=>setBorda(bk,b.v)}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[10px] transition-all ${
                  cur.bordas[bk]===b.v?'bg-indigo-500 text-white border-indigo-500':'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                }`}>
                <div className="w-6 h-4 rounded-sm shrink-0" style={{border:b.css==='none'?'1px dashed #aaa':cur.bordas[bk]===b.v?b.css.replace(/#[0-9a-f]+/gi,'rgba(255,255,255,0.85)'):b.css}}/>
                {b.l} {cur.bordas[bk]===b.v && <Check size={10} className="ml-auto"/>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}