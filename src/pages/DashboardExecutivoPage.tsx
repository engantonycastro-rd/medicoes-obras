import { useEffect, useState } from 'react'
import { BarChart3, Building2, HardHat, DollarSign, AlertTriangle, CheckCircle2, Clock, TrendingUp, MapPin, Activity } from 'lucide-react'
import { supabase } from '../lib/supabase'

export function DashboardExecutivoPage() {
  const [stats, setStats] = useState({ contratos: 0, obras: 0, obrasAtivas: 0, obrasParadas: 0, valorTotal: 0, valorMedido: 0, aditivos: 0, valorAditivos: 0, apontamentos30d: 0, diarios30d: 0 })
  const [obrasResumo, setObrasResumo] = useState<any[]>([])
  const [contratosVencendo, setContratosVencendo] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [cRes, oRes, sRes, aRes, adRes, dRes, aptRes] = await Promise.all([
      supabase.from('contratos').select('id, nome_obra, valor_contrato, data_validade, status'),
      supabase.from('obras').select('id, nome_obra, status, local_obra, contrato_id, percentual_fisico'),
      supabase.from('servicos').select('obra_id, quantidade, preco_unitario').neq('tipo', 'grupo'),
      supabase.from('aditivos').select('id, contrato_id, valor_acrescimo, valor_supressao'),
      supabase.from('aditivos').select('id'),
      supabase.from('diario_obra').select('id').gte('data', new Date(Date.now() - 30*86400000).toISOString().split('T')[0]),
      supabase.from('apontamentos').select('id').gte('data', new Date(Date.now() - 30*86400000).toISOString().split('T')[0]),
    ])

    const contratos = cRes.data || []
    const obras = oRes.data || []
    const servicos = sRes.data || []
    const aditivos = aRes.data || []

    const valorTotal = contratos.reduce((s: number, c: any) => s + Number(c.valor_contrato || 0), 0)
    const valorMedido = servicos.reduce((s: number, sv: any) => s + (Number(sv.quantidade) * Number(sv.preco_unitario)), 0)
    const valorAditivos = aditivos.reduce((s: number, a: any) => s + Number(a.valor_acrescimo) - Number(a.valor_supressao), 0)

    setStats({
      contratos: contratos.length,
      obras: obras.length,
      obrasAtivas: obras.filter((o: any) => o.status === 'ATIVA').length,
      obrasParadas: obras.filter((o: any) => o.status === 'SUSPENSA' || o.status === 'PARALISADA').length,
      valorTotal, valorMedido, aditivos: aditivos.length, valorAditivos,
      apontamentos30d: aptRes.data?.length || 0,
      diarios30d: dRes.data?.length || 0,
    })

    // Obras resumo
    const obraValores: Record<string, number> = {}
    servicos.forEach((sv: any) => { obraValores[sv.obra_id] = (obraValores[sv.obra_id] || 0) + Number(sv.quantidade) * Number(sv.preco_unitario) })
    setObrasResumo(obras.filter((o: any) => o.status === 'ATIVA').map((o: any) => ({ ...o, valorMedido: obraValores[o.id] || 0 })).sort((a: any, b: any) => b.valorMedido - a.valorMedido).slice(0, 10))

    // Contratos vencendo em 60 dias
    const limite = new Date(Date.now() + 60*86400000).toISOString().split('T')[0]
    setContratosVencendo(contratos.filter((c: any) => c.data_validade && c.data_validade <= limite && c.status === 'ATIVO').sort((a: any, b: any) => (a.data_validade || '').localeCompare(b.data_validade || '')))

    setLoading(false)
  }

  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const fmtM = (v: number) => v >= 1000000 ? `R$ ${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `R$ ${(v / 1000).toFixed(0)}K` : fmt(v)

  if (loading) return <div className="flex items-center justify-center h-full text-slate-400"><Activity size={24} className="animate-spin mr-2"/> Carregando painel...</div>

  return (
    <div className="p-6 overflow-y-auto" style={{ height: '100%' }}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><BarChart3 size={24} className="text-amber-500"/> Painel Executivo</h1>
        <p className="text-sm text-slate-500">Visão geral de contratos, obras e indicadores — RD Construtora</p>
      </div>

      {/* KPIs principais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-5 text-white">
          <Building2 size={20} className="opacity-60 mb-2"/><p className="text-3xl font-bold">{stats.contratos}</p><p className="text-xs opacity-80">Contratos</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-5 text-white">
          <HardHat size={20} className="opacity-60 mb-2"/><p className="text-3xl font-bold">{stats.obrasAtivas}</p><p className="text-xs opacity-80">Obras ativas <span className="text-white/60">de {stats.obras}</span></p>
        </div>
        <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl p-5 text-white">
          <DollarSign size={20} className="opacity-60 mb-2"/><p className="text-2xl font-bold">{fmtM(stats.valorTotal)}</p><p className="text-xs opacity-80">Valor total contratos</p>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-5 text-white">
          <TrendingUp size={20} className="opacity-60 mb-2"/><p className="text-2xl font-bold">{fmtM(stats.valorMedido)}</p><p className="text-xs opacity-80">Valor medido total</p>
        </div>
      </div>

      {/* Segunda linha de KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <p className="text-[10px] text-slate-400 uppercase font-semibold">Obras paradas</p>
          <p className={`text-2xl font-bold ${stats.obrasParadas > 0 ? 'text-red-600' : 'text-slate-800 dark:text-white'}`}>{stats.obrasParadas}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <p className="text-[10px] text-slate-400 uppercase font-semibold">Aditivos totais</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-white">{stats.aditivos}</p>
          <p className="text-[10px] text-slate-400">{fmtM(stats.valorAditivos)}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <p className="text-[10px] text-slate-400 uppercase font-semibold">Apontamentos (30d)</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-white">{stats.apontamentos30d}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
          <p className="text-[10px] text-slate-400 uppercase font-semibold">Diários (30d)</p>
          <p className="text-2xl font-bold text-slate-800 dark:text-white">{stats.diarios30d}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top obras por valor medido */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
          <p className="text-sm font-bold text-slate-800 dark:text-white mb-4">Top 10 obras — valor medido</p>
          <div className="space-y-3">
            {obrasResumo.map((o: any, i: number) => {
              const max = obrasResumo[0]?.valorMedido || 1
              return (
                <div key={o.id}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-slate-600 dark:text-slate-300 truncate flex-1 mr-2"><span className="text-slate-400 mr-1">{i+1}.</span> {o.nome_obra}</span>
                    <span className="font-bold text-slate-800 dark:text-white shrink-0">{fmt(o.valorMedido)}</span>
                  </div>
                  <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full" style={{ width: `${(o.valorMedido / max) * 100}%` }}/>
                  </div>
                </div>
              )
            })}
            {obrasResumo.length === 0 && <p className="text-xs text-slate-400 text-center py-4">Nenhuma obra com medição</p>}
          </div>
        </div>

        {/* Contratos vencendo */}
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-5">
          <p className="text-sm font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <AlertTriangle size={14} className="text-amber-500"/> Contratos vencendo (60 dias)
          </p>
          <div className="space-y-2">
            {contratosVencendo.map((c: any) => {
              const dias = Math.ceil((new Date(c.data_validade).getTime() - Date.now()) / 86400000)
              const vencido = dias < 0
              return (
                <div key={c.id} className={`flex items-center justify-between p-3 rounded-lg border ${vencido ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                  <div><p className="text-xs font-bold text-slate-800">{c.nome_obra}</p><p className="text-[10px] text-slate-500">{new Date(c.data_validade + 'T12:00:00').toLocaleDateString('pt-BR')}</p></div>
                  <span className={`text-xs font-bold ${vencido ? 'text-red-700' : 'text-amber-700'}`}>{vencido ? `Vencido há ${Math.abs(dias)}d` : `${dias} dias`}</span>
                </div>
              )
            })}
            {contratosVencendo.length === 0 && <p className="text-xs text-slate-400 text-center py-4 flex items-center justify-center gap-2"><CheckCircle2 size={14} className="text-emerald-500"/> Nenhum contrato vencendo nos próximos 60 dias</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
