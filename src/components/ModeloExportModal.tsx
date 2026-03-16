/**
 * ModeloExportModal — seleção de modelo antes de exportar .xlsx ou .pdf.
 * O tipo do contrato não determina mais o modelo automaticamente.
 */
import { useState } from 'react'
import { X, FileSpreadsheet, FileDown, Check } from 'lucide-react'
import { useModeloStore, ModeloPlanilha } from '../lib/modeloStore'

interface Props {
  tipo: 'xlsx' | 'pdf'
  onConfirmar: (modelo: ModeloPlanilha) => void
  onFechar: () => void
}

export function ModeloExportModal({ tipo, onConfirmar, onFechar }: Props) {
  const { modelos } = useModeloStore()
  const [selId, setSelId] = useState(modelos[0]?.id ?? '')

  const modelo = modelos.find(m => m.id === selId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-[460px] max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
              tipo === 'xlsx' ? 'bg-emerald-100' : 'bg-red-100'
            }`}>
              {tipo === 'xlsx'
                ? <FileSpreadsheet size={18} className="text-emerald-600"/>
                : <FileDown        size={18} className="text-red-600"/>
              }
            </div>
            <div>
              <h2 className="font-bold text-slate-800 text-sm">
                Exportar {tipo === 'xlsx' ? 'planilha Excel (.xlsx)' : 'PDF'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Escolha o modelo de planilha para a exportação</p>
            </div>
          </div>
          <button onClick={onFechar}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all">
            <X size={16}/>
          </button>
        </div>

        {/* Lista de modelos */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {modelos.length === 0 && (
            <p className="text-center text-slate-400 text-sm py-8">Nenhum modelo cadastrado</p>
          )}
          {modelos.map(m => (
            <button key={m.id} onClick={() => setSelId(m.id)}
              className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all ${
                selId === m.id
                  ? 'border-indigo-400 bg-indigo-50'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}>

              {/* Mini paleta */}
              <div className="shrink-0 flex flex-col rounded overflow-hidden gap-px shadow-sm">
                <div className="w-10 h-3.5" style={{ background: `#${m.cores.hdr_principal}` }}/>
                <div className="w-10 h-3.5" style={{ background: `#${m.cores.th_medicao}` }}/>
                <div className="w-10 h-2.5" style={{ background: `#${m.cores.linha_grupo}` }}/>
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 text-sm">{m.nome}</p>
                <p className="text-xs text-slate-500 mt-0.5">{m.descricao}</p>
                <div className="flex gap-1.5 mt-1.5 flex-wrap">
                  {m.builtin && (
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full text-[10px] font-medium">
                      Padrão do sistema
                    </span>
                  )}
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                        style={{ background: `#${m.cores.th_medicao}22`, color: `#${m.cores.hdr_principal}` }}>
                    {m.base === 'ESTADO' ? 'Layout Estado' : m.base === 'PREFEITURA' ? 'Layout Prefeitura' : 'Customizado'}
                  </span>
                </div>
              </div>

              {/* Check */}
              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all ${
                selId === m.id ? 'bg-indigo-500' : 'border-2 border-slate-200'
              }`}>
                {selId === m.id && <Check size={13} className="text-white"/>}
              </div>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50">
          <button onClick={onFechar}
            className="px-4 py-2 border border-slate-200 rounded-xl text-sm text-slate-500 hover:bg-white transition-all">
            Cancelar
          </button>
          <button onClick={() => modelo && onConfirmar(modelo)} disabled={!modelo}
            className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50 ${
              tipo === 'xlsx'
                ? 'bg-emerald-500 hover:bg-emerald-600'
                : 'bg-red-500 hover:bg-red-600'
            }`}>
            {tipo === 'xlsx'
              ? <><FileSpreadsheet size={15}/> Exportar Excel</>
              : <><FileDown size={15}/> Exportar PDF</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
