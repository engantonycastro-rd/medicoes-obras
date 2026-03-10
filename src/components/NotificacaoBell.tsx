import { useState, useEffect, useRef } from 'react'
import { Bell, Check, CheckCheck, Trash2, X, Info, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { useNotificacaoStore, Notificacao } from '../lib/notificacaoStore'
import { useNavigate } from 'react-router-dom'

const ICONS: Record<string, React.ReactNode> = {
  info:    <Info size={14} className="text-blue-500"/>,
  sucesso: <CheckCircle2 size={14} className="text-emerald-500"/>,
  alerta:  <AlertTriangle size={14} className="text-amber-500"/>,
  erro:    <XCircle size={14} className="text-red-500"/>,
}

const BG: Record<string, string> = {
  info:    'bg-blue-50 border-blue-200',
  sucesso: 'bg-emerald-50 border-emerald-200',
  alerta:  'bg-amber-50 border-amber-200',
  erro:    'bg-red-50 border-red-200',
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d`
}

export function NotificacaoBell() {
  const { notificacoes, naoLidas, fetchNotificacoes, marcarComoLida, marcarTodasComoLidas,
    deletarNotificacao, limparLidas, iniciarRealtime } = useNotificacaoStore()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    fetchNotificacoes()
    iniciarRealtime()
  }, [])

  // Close on click outside
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  function toggleOpen() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 6, left: rect.left })
    }
    setOpen(!open)
  }

  function handleClick(n: Notificacao) {
    if (!n.lida) marcarComoLida(n.id)
    if (n.link) { navigate(n.link); setOpen(false) }
  }

  return (
    <>
      <button ref={btnRef} onClick={toggleOpen}
        className="relative p-1.5 rounded-lg hover:bg-slate-700/50 transition-colors">
        <Bell size={18} className="text-slate-400"/>
        {naoLidas > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-red-500 text-white text-[9px]
            font-bold rounded-full flex items-center justify-center px-1 animate-pulse">
            {naoLidas > 9 ? '9+' : naoLidas}
          </span>
        )}
      </button>

      {open && (
        <div ref={panelRef} className="fixed w-80 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden"
          style={{ top: pos.top, left: Math.max(8, pos.left), maxHeight: '70vh', zIndex: 9999 }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
            <p className="font-bold text-sm text-slate-800">Notificações</p>
            <div className="flex items-center gap-1">
              {naoLidas > 0 && (
                <button onClick={marcarTodasComoLidas} title="Marcar todas como lidas"
                  className="p-1 rounded text-slate-400 hover:text-emerald-600 hover:bg-emerald-50">
                  <CheckCheck size={14}/>
                </button>
              )}
              {notificacoes.some(n => n.lida) && (
                <button onClick={limparLidas} title="Limpar lidas"
                  className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50">
                  <Trash2 size={14}/>
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-1 rounded text-slate-400 hover:text-slate-600">
                <X size={14}/>
              </button>
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto" style={{ maxHeight: 'calc(70vh - 52px)' }}>
            {notificacoes.length === 0 ? (
              <div className="py-10 text-center">
                <Bell size={24} className="mx-auto text-slate-200 mb-2"/>
                <p className="text-xs text-slate-400">Nenhuma notificação</p>
              </div>
            ) : (
              notificacoes.map(n => (
                <div key={n.id}
                  onClick={() => handleClick(n)}
                  className={`flex gap-2.5 px-4 py-3 border-b border-slate-50 transition-colors cursor-pointer
                    ${n.lida ? 'bg-white hover:bg-slate-50' : 'bg-blue-50/40 hover:bg-blue-50'}`}>
                  <div className="shrink-0 mt-0.5">{ICONS[n.tipo] || ICONS.info}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-xs leading-tight ${n.lida ? 'text-slate-600' : 'text-slate-800 font-semibold'}`}>
                        {n.titulo}
                      </p>
                      {!n.lida && <span className="w-1.5 h-1.5 bg-blue-500 rounded-full shrink-0"/>}
                    </div>
                    {n.mensagem && <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-2">{n.mensagem}</p>}
                    <p className="text-[9px] text-slate-300 mt-1">{timeAgo(n.created_at)}</p>
                  </div>
                  <button onClick={e => { e.stopPropagation(); deletarNotificacao(n.id) }}
                    className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 shrink-0 opacity-0 group-hover:opacity-100"
                    style={{ opacity: undefined }}>
                    <X size={12}/>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  )
}