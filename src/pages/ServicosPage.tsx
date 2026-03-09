import { useEffect, useState, useRef } from 'react'
import { Upload, Table, AlertCircle, CheckCircle2, FileSpreadsheet, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '../../lib/store'
import { ServicoImportado } from '../../types'
import { importarOrcamento } from '../../utils/importOrcamento'
import { formatCurrency, formatNumber, calcPrecoComDesconto, calcPrecoComBDI, calcPrecoTotal } from '../../utils/calculations'

export function ServicosPage() {
  const { contratoAtivo, servicos, fetchServicos, salvarServicos } = useStore()
  const [preview, setPreview] = useState<ServicoImportado[]>([])
  const [importing, setImporting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (contratoAtivo) fetchServicos(contratoAtivo.id)
  }, [contratoAtivo])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setErro(null)
    setImporting(true)
    try {
      const importados = await importarOrcamento(file)
      setPreview(importados)
      toast.success(`${importados.length} itens detectados`)
    } catch (err: any) {
      setErro(err.message || 'Erro ao importar arquivo')
      toast.error('Erro ao importar planilha')
    }
    setImporting(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function handleSalvar() {
    if (!contratoAtivo || preview.length === 0) return
    setSaving(true)
    try {
      await salvarServicos(contratoAtivo.id, preview)
      setPreview([])
      toast.success(`${preview.length} serviços importados com sucesso!`)
    } catch {
      toast.error('Erro ao salvar serviços')
    }
    setSaving(false)
  }

  const servicosExibir = preview.length > 0 ? preview : servicos

  if (!contratoAtivo) {
    return (
      <div className="p-8">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 flex items-center gap-4">
          <AlertCircle size={24} className="text-amber-500 shrink-0" />
          <p className="text-amber-800">Selecione um contrato para gerenciar os serviços.</p>
        </div>
      </div>
    )
  }

  const totalOrcamento = servicos
    .filter(s => !s.is_grupo)
    .reduce((sum, s) => {
      const pd = calcPrecoComDesconto(s.preco_unitario, contratoAtivo.desconto_percentual)
      const pb = calcPrecoComBDI(pd, contratoAtivo.bdi_percentual)
      return sum + calcPrecoTotal(s.quantidade, pb)
    }, 0)

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="text-xs font-medium text-amber-600 uppercase tracking-wider mb-1">
            {contratoAtivo.nome_obra}
          </p>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Serviços do Orçamento</h1>
          <p className="text-slate-500 text-sm mt-1">
            Importe a planilha de orçamento para carregar os serviços
          </p>
        </div>
        <div className="flex items-center gap-3">
          {totalOrcamento > 0 && (
            <div className="text-right">
              <p className="text-xs text-slate-400">Total do Orçamento</p>
              <p className="text-lg font-bold text-slate-800">{formatCurrency(totalOrcamento)}</p>
            </div>
          )}
          <label className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600
            text-white font-medium rounded-lg shadow-sm transition-all text-sm cursor-pointer">
            <Upload size={16} />
            {importing ? 'Importando...' : 'Importar Orçamento (.xlsx)'}
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFile}
              disabled={importing}
            />
          </label>
        </div>
      </div>

      {/* Instruções */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-sm text-blue-700">
        <p className="font-semibold mb-1">📋 Como importar:</p>
        <ul className="list-disc list-inside space-y-0.5 text-blue-600 text-xs">
          <li>O arquivo deve ser a planilha de orçamento (.xlsx)</li>
          <li>O sistema detecta automaticamente as colunas: ITEM, FONTE, CÓDIGO, DESCRIÇÃO, UNID, QUANTIDADE, PREÇO UNITÁRIO</li>
          <li>Colunas calculadas (desconto, BDI, total) são geradas automaticamente a partir dos dados do contrato</li>
          <li>Ao confirmar, os serviços anteriores serão substituídos</li>
        </ul>
      </div>

      {/* Erro de import */}
      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-start gap-3">
          <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-700 text-sm">Erro ao importar</p>
            <p className="text-red-600 text-xs mt-1">{erro}</p>
          </div>
        </div>
      )}

      {/* Preview banner */}
      {preview.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={20} className="text-amber-600" />
            <div>
              <p className="font-semibold text-amber-800 text-sm">
                Preview: {preview.length} itens detectados
              </p>
              <p className="text-amber-600 text-xs">Verifique os dados abaixo e confirme a importação</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPreview([])}
              className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSalvar}
              disabled={saving}
              className="px-4 py-1.5 text-xs bg-amber-500 text-white font-medium rounded-lg
                hover:bg-amber-600 transition-all disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Confirmar Importação'}
            </button>
          </div>
        </div>
      )}

      {/* Tabela */}
      {servicosExibir.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-slate-200 rounded-xl">
          <FileSpreadsheet size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">Nenhum serviço importado</p>
          <p className="text-slate-400 text-sm mt-1">Clique em "Importar Orçamento" para carregar os serviços</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-800 text-white">
                  <th className="px-3 py-2.5 text-left font-medium w-16">Item</th>
                  <th className="px-3 py-2.5 text-left font-medium w-28">Fonte</th>
                  <th className="px-3 py-2.5 text-left font-medium w-28">Código</th>
                  <th className="px-3 py-2.5 text-left font-medium">Descrição</th>
                  <th className="px-3 py-2.5 text-center font-medium w-14">Unid.</th>
                  <th className="px-3 py-2.5 text-right font-medium w-20">Quantidade</th>
                  <th className="px-3 py-2.5 text-right font-medium w-24">Preço Unit. (R$)</th>
                  <th className="px-3 py-2.5 text-right font-medium w-24">c/ Desconto</th>
                  <th className="px-3 py-2.5 text-right font-medium w-24">c/ BDI</th>
                  <th className="px-3 py-2.5 text-right font-medium w-28">Total (R$)</th>
                </tr>
              </thead>
              <tbody>
                {servicosExibir.map((s, i) => {
                  const isGrupo = 'is_grupo' in s ? s.is_grupo : (s as any).is_grupo
                  const precoDesc = calcPrecoComDesconto(s.preco_unitario, contratoAtivo.desconto_percentual)
                  const precoBDI  = calcPrecoComBDI(precoDesc, contratoAtivo.bdi_percentual)
                  const total     = calcPrecoTotal(s.quantidade, precoBDI)

                  return (
                    <tr
                      key={i}
                      className={`border-b border-slate-50 ${
                        isGrupo
                          ? 'bg-blue-50 font-semibold text-blue-800'
                          : i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                      } hover:bg-amber-50/30 transition-colors`}
                    >
                      <td className="px-3 py-2 font-mono">{s.item}</td>
                      <td className="px-3 py-2 text-slate-500">{s.fonte}</td>
                      <td className="px-3 py-2 font-mono text-slate-500">{s.codigo || '—'}</td>
                      <td className="px-3 py-2 text-slate-700 max-w-sm">
                        <span className="line-clamp-2">{s.descricao}</span>
                      </td>
                      <td className="px-3 py-2 text-center text-slate-500">{s.unidade}</td>
                      {isGrupo ? (
                        <>
                          <td colSpan={5} className="px-3 py-2 text-right font-bold text-blue-700">
                            {total > 0 ? formatCurrency(total) : ''}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2 text-right text-slate-700">
                            {formatNumber(s.quantidade)}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-700">
                            {formatCurrency(s.preco_unitario)}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-500">
                            {formatCurrency(precoDesc)}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-500">
                            {formatCurrency(precoBDI)}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-slate-800">
                            {formatCurrency(total)}
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
              </tbody>
              {/* Rodapé com total */}
              {!preview.length && totalOrcamento > 0 && (
                <tfoot>
                  <tr className="bg-slate-800 text-white font-semibold">
                    <td colSpan={9} className="px-3 py-3 text-right text-sm">
                      VALOR TOTAL DO ORÇAMENTO
                    </td>
                    <td className="px-3 py-3 text-right text-sm">
                      {formatCurrency(totalOrcamento)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
