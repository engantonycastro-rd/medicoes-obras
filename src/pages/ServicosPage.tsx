import { useEffect, useState, useRef } from 'react'
import { Upload, Table, AlertCircle, CheckCircle2, FileSpreadsheet, Trash2, Info } from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { ServicoImportado } from '../types'
import { importarOrcamento, ModoImportacao } from '../utils/importOrcamento'
import { formatCurrency, formatNumber, calcPrecoComBDI, calcTotalServico, calcTotalServicoBDI } from '../utils/calculations'

export function ServicosPage() {
  const { contratoAtivo, obraAtiva, servicos, fetchServicos, salvarServicos, atualizarObra } = useStore()
  const [preview, setPreview] = useState<ServicoImportado[]>([])
  const [importing, setImporting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [modoImport, setModoImport] = useState<ModoImportacao>('SEM_BDI')
  const [showModoSelector, setShowModoSelector] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (obraAtiva) fetchServicos(obraAtiva.id)
  }, [obraAtiva])

  function iniciarImportacao() {
    setShowModoSelector(true)
  }

  function confirmarModo(modo: ModoImportacao) {
    setModoImport(modo)
    setShowModoSelector(false)
    fileRef.current?.click()
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true); setErro(null)
    try {
      const items = await importarOrcamento(file, modoImport)
      setPreview(items)
      toast.success(`${items.length} itens carregados (${modoImport === 'COM_BDI' ? 'COM BDI' : 'SEM BDI'}) — revise e confirme.`)
    } catch (err: any) {
      setErro(err.message || 'Erro ao importar planilha')
      toast.error('Falha na importação')
    } finally { setImporting(false) }
    e.target.value = ''
  }

  async function handleSalvar() {
    if (!obraAtiva || !contratoAtivo) return
    setSaving(true)
    try {
      await salvarServicos(obraAtiva.id, contratoAtivo.id, preview)
      // Se importou COM BDI, zera o BDI da obra (preço já inclui BDI)
      if (modoImport === 'COM_BDI') {
        await atualizarObra(obraAtiva.id, { bdi_percentual: 0 })
        toast.success('Orçamento salvo! BDI da obra zerado (já incluso no preço).')
      } else {
        toast.success('Orçamento salvo com sucesso!')
      }
      setPreview([])
    } catch (err: any) {
      const msg = err?.message || 'Erro desconhecido ao salvar'
      toast.error(msg, { duration: 5000 })
      console.error('Erro salvarServicos:', err)
    }
    finally { setSaving(false) }
  }

  async function handleDeletarServicos() {
    if (!obraAtiva) return
    const confirmou = window.confirm(
      'Tem certeza que deseja excluir TODOS os serviços desta obra?\n\n' +
      'Isso NÃO afeta medições já realizadas (elas ficam vinculadas ao serviço por ID).\n' +
      'Após excluir, importe a planilha novamente.'
    )
    if (!confirmou) return
    setDeleting(true)
    try {
      const { error } = await supabase.from('servicos').delete().eq('obra_id', obraAtiva.id)
      if (error) throw error
      await fetchServicos(obraAtiva.id)
      toast.success('Serviços excluídos! Importe a planilha novamente.')
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao excluir serviços')
    } finally { setDeleting(false) }
  }

  if (!obraAtiva || !contratoAtivo) {
    return (
      <div className="p-8">
        <div className="bg-primary-50 border border-primary-200 rounded-xl p-6 flex items-center gap-4">
          <AlertCircle size={24} className="text-primary-500 shrink-0" />
          <div>
            <p className="font-semibold text-primary-800">Nenhuma obra selecionada</p>
            <p className="text-sm text-primary-600 mt-1">Vá em <strong>Contratos</strong>, expanda um contrato e clique em uma obra.</p>
          </div>
        </div>
      </div>
    )
  }

  const lista = preview.length > 0 ? preview : servicos.map(s => s as unknown as ServicoImportado)
  const totalBDI = lista.filter(s => !s.is_grupo).reduce((sum, s) => {
    return sum + calcTotalServicoBDI(s.quantidade, s.preco_unitario, obraAtiva.bdi_percentual)
  }, 0)
  const totalOrc = Math.round(totalBDI * (1 - obraAtiva.desconto_percentual) * 100 + 1e-10) / 100

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs text-slate-400 mb-0.5">{contratoAtivo.nome_obra} › <span className="text-primary-600 font-medium">{obraAtiva.nome_obra}</span></p>
          <h1 className="text-2xl font-bold text-slate-800">Serviços do Orçamento</h1>
          <p className="text-slate-500 text-sm mt-1">Importe a planilha de orçamento para carregar os serviços</p>
        </div>
        <div className="flex items-center gap-3">
          {lista.length > 0 && (
            <div className="text-right">
              <p className="text-xs text-slate-400">Total do Orçamento</p>
              <p className="text-2xl font-bold text-primary-600">{formatCurrency(totalOrc)}</p>
            </div>
          )}
          {servicos.length > 0 && preview.length === 0 && (
            <button onClick={handleDeletarServicos} disabled={deleting}
              className="flex items-center gap-2 px-3 py-2 border border-red-200 text-red-600 hover:bg-red-50 font-medium rounded-lg text-sm disabled:opacity-50">
              <Trash2 size={14} /> {deleting ? 'Excluindo...' : 'Excluir serviços'}
            </button>
          )}
          <button onClick={iniciarImportacao} disabled={importing}
            className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg text-sm shadow-sm disabled:opacity-50">
            <Upload size={16} /> Importar Orçamento (.xlsx)
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
        </div>
      </div>

      {erro && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle size={18} className="text-red-500 shrink-0" />
          <p className="text-red-700 text-sm">{erro}</p>
        </div>
      )}

      {preview.length > 0 && (
        <div className="mb-6 bg-primary-50 border border-primary-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileSpreadsheet size={20} className="text-primary-600" />
            <div>
              <p className="font-semibold text-primary-800">{preview.length} itens importados — aguardando confirmação</p>
              <p className="text-xs text-primary-600 mt-0.5">Ao confirmar, os serviços anteriores serão substituídos</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setPreview([])} className="px-4 py-2 border border-primary-300 text-primary-700 rounded-lg text-sm hover:bg-primary-100">
              Cancelar
            </button>
            <button onClick={handleSalvar} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
              <CheckCircle2 size={16} /> {saving ? 'Salvando...' : 'Confirmar Importação'}
            </button>
          </div>
        </div>
      )}

      {lista.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-xl">
          <Table size={36} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">Nenhum serviço cadastrado</p>
          <p className="text-slate-400 text-sm mt-1">Importe a planilha de orçamento (.xlsx) para começar</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800 text-white">
                  {['Item','Fonte','Código','Descrição','Unid.','Quantidade','Preço Unit. (R$)','c/ BDI','Total c/ BDI','Total c/ Desc.'].map(h => (
                    <th key={h} className="px-3 py-3 text-xs font-semibold text-left whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lista.map((s, i) => {
                  const pb = calcPrecoComBDI(s.preco_unitario, obraAtiva.bdi_percentual)
                  const ptBDI = Math.round(s.quantidade * pb * 100) / 100
                  const pt = calcTotalServico(s.quantidade, s.preco_unitario, obraAtiva.bdi_percentual, obraAtiva.desconto_percentual)
                  return (
                    <tr key={i} className={s.is_grupo ? 'bg-slate-800 text-white font-semibold' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="px-3 py-2 font-mono text-xs">{s.item}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{s.is_grupo ? '' : s.fonte}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{s.is_grupo ? '' : s.codigo}</td>
                      <td className="px-3 py-2 max-w-xs truncate">{s.descricao}</td>
                      <td className="px-3 py-2 text-center text-xs">{s.is_grupo ? '' : s.unidade}</td>
                      <td className="px-3 py-2 text-right">{s.is_grupo ? '' : formatNumber(s.quantidade)}</td>
                      <td className="px-3 py-2 text-right">{s.is_grupo ? '' : formatCurrency(s.preco_unitario)}</td>
                      <td className="px-3 py-2 text-right">{s.is_grupo ? '' : formatCurrency(pb)}</td>
                      <td className="px-3 py-2 text-right">{s.is_grupo ? '' : formatCurrency(ptBDI)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{s.is_grupo ? '' : formatCurrency(pt)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Dica de como importar */}
      {lista.length === 0 && (
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-blue-800 mb-2 flex items-center gap-1.5">📋 Como importar:</p>
          <ul className="text-xs text-blue-700 space-y-1 ml-4 list-disc">
            <li>Clique em "Importar Orçamento" e escolha o tipo de planilha</li>
            <li><strong>SEM BDI:</strong> preço unitário bruto — sistema calcula BDI e desconto</li>
            <li><strong>COM BDI e Desconto:</strong> preço unitário já com BDI — sistema só aplica desconto no total</li>
            <li>O sistema detecta automaticamente as colunas da planilha</li>
          </ul>
        </div>
      )}

      {/* ═══ MODAL SELETOR DE MODO ═══ */}
      {showModoSelector && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-800 dark:text-white">Tipo de planilha</h2>
            <p className="text-xs text-slate-500">Selecione como os preços estão na sua planilha:</p>
            <div className="space-y-3">
              <button onClick={() => confirmarModo('SEM_BDI')}
                className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-primary-400 text-left transition-all">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                  <Upload size={18} className="text-blue-600"/>
                </div>
                <div>
                  <p className="font-bold text-slate-800 dark:text-white text-sm">Planilha SEM BDI</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Preço unitário bruto (sem BDI e sem desconto). O sistema aplica BDI e desconto automaticamente.</p>
                </div>
              </button>
              <button onClick={() => confirmarModo('COM_BDI')}
                className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-slate-200 dark:border-slate-700 hover:border-emerald-400 text-left transition-all">
                <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center shrink-0">
                  <CheckCircle2 size={18} className="text-emerald-600"/>
                </div>
                <div>
                  <p className="font-bold text-slate-800 dark:text-white text-sm">Planilha COM BDI e Desconto</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Preço unitário já inclui BDI. O sistema lê a coluna "COM BDI" e aplica apenas o desconto no total. Valor 100% fiel à planilha.</p>
                </div>
              </button>
            </div>
            <button onClick={() => setShowModoSelector(false)} className="w-full text-center text-xs text-slate-400 hover:text-slate-600 py-2">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}
