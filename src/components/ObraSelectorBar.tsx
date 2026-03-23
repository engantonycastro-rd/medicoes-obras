import { useEffect, useState } from 'react'
import { Building2, ChevronDown } from 'lucide-react'
import { useStore } from '../lib/store'
import { usePerfilStore } from '../lib/perfilStore'
import { supabase } from '../lib/supabase'
import { Obra, Contrato } from '../types'

interface ObraOption {
  id: string; nome_obra: string; local_obra: string
  contrato_id: string; contrato_nome: string
  engenheiro_responsavel_id: string | null
}

export function ObraSelectorBar() {
  const { obraAtiva, contratoAtivo, setObraAtiva, setContratoAtivo } = useStore()
  const { perfilAtual } = usePerfilStore()
  const [opcoes, setOpcoes] = useState<ObraOption[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchTodasObras() }, [])

  async function fetchTodasObras() {
    setLoading(true)
    const [obrasRes, contratosRes, gestoresRes] = await Promise.all([
      supabase.from('obras').select('id, nome_obra, local_obra, contrato_id, status, engenheiro_responsavel_id'),
      supabase.from('contratos').select('id, nome_obra'),
      supabase.from('contrato_gestores').select('contrato_id, gestor_id'),
    ])

    let allObras = (obrasRes.data || []) as any[]
    const contratos = contratosRes.data || []
    const gestores = gestoresRes.data || []
    const cMap = new Map(contratos.map((c: any) => [c.id, c.nome_obra]))

    // Filtro por role
    if (perfilAtual?.role === 'ENGENHEIRO') {
      allObras = allObras.filter((o: any) => o.engenheiro_responsavel_id === perfilAtual.id)
    } else if (perfilAtual?.role === 'GESTOR') {
      const meusContratos = gestores.filter((g: any) => g.gestor_id === perfilAtual.id).map((g: any) => g.contrato_id)
      allObras = allObras.filter((o: any) => meusContratos.includes(o.contrato_id))
    }

    const opcoes: ObraOption[] = allObras.map((o: any) => ({
      id: o.id, nome_obra: o.nome_obra, local_obra: o.local_obra,
      contrato_id: o.contrato_id, contrato_nome: cMap.get(o.contrato_id) || '',
      engenheiro_responsavel_id: o.engenheiro_responsavel_id,
    }))
    setOpcoes(opcoes)
    setLoading(false)
  }

  async function selecionarObra(obraId: string) {
    const op = opcoes.find(o => o.id === obraId)
    if (!op) return

    // Buscar contrato completo e obra completa do store/supabase
    const { data: cData } = await supabase.from('contratos').select('*').eq('id', op.contrato_id).single()
    const { data: oData } = await supabase.from('obras').select('*').eq('id', op.id).single()
    if (cData) setContratoAtivo(cData as Contrato)
    if (oData) setObraAtiva(oData as Obra)
  }

  if (loading) return null

  return (
    <div className="flex items-center gap-3 mb-5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
      <Building2 size={16} className="text-slate-400 shrink-0"/>
      <select
        value={obraAtiva?.id || ''}
        onChange={e => { if (e.target.value) selecionarObra(e.target.value) }}
        className="flex-1 border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm"
      >
        <option value="">— Selecione uma obra —</option>
        {opcoes.map(o => (
          <option key={o.id} value={o.id}>
            {o.nome_obra} — {o.contrato_nome} {o.local_obra ? `(${o.local_obra})` : ''}
          </option>
        ))}
      </select>
      {obraAtiva && (
        <span className="text-[10px] text-primary-600 font-medium shrink-0 hidden sm:block">
          {contratoAtivo?.nome_obra}
        </span>
      )}
    </div>
  )
}
