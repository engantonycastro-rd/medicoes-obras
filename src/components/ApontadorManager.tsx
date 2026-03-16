import { useEffect, useState } from 'react'
import { Plus, Trash2, Save, Users, HardHat, GripVertical, Loader2, Search } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'

interface Funcao { id: string; nome: string; ativo: boolean; ordem: number }
interface Perfil { id: string; nome: string | null; email: string; role: string }
interface Obra { id: string; nome_obra: string }
interface Vinculo { user_id: string; obra_id: string }

export function ApontadorManager() {
  const [funcoes, setFuncoes] = useState<Funcao[]>([])
  const [novaFuncao, setNovaFuncao] = useState('')
  const [apontadores, setApontadores] = useState<Perfil[]>([])
  const [todasObras, setTodasObras] = useState<Obra[]>([])
  const [vinculos, setVinculos] = useState<Vinculo[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAp, setSelectedAp] = useState('')
  const [obraBusca, setObraBusca] = useState('')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [fRes, pRes, oRes, vRes] = await Promise.all([
      supabase.from('funcoes_mao_obra').select('*').order('ordem'),
      supabase.from('perfis').select('id, nome, email, role').eq('role', 'APONTADOR').eq('ativo', true),
      supabase.from('obras').select('id, nome_obra').eq('status', 'ATIVA').order('nome_obra'),
      supabase.from('apontador_obras').select('user_id, obra_id'),
    ])
    if (fRes.data) setFuncoes(fRes.data as Funcao[])
    if (pRes.data) setApontadores(pRes.data as Perfil[])
    if (oRes.data) setTodasObras(oRes.data as Obra[])
    if (vRes.data) setVinculos(vRes.data as Vinculo[])
    setLoading(false)
  }

  async function addFuncao() {
    if (!novaFuncao.trim()) return
    const ordem = funcoes.length > 0 ? Math.max(...funcoes.map(f => f.ordem)) + 1 : 0
    const { data, error } = await supabase.from('funcoes_mao_obra').insert({ nome: novaFuncao.trim(), ordem }).select().single()
    if (error) { toast.error(error.message.includes('duplicate') ? 'Função já existe' : error.message); return }
    if (data) setFuncoes(p => [...p, data as Funcao])
    setNovaFuncao('')
    toast.success('Função adicionada!')
  }

  async function toggleFuncao(f: Funcao) {
    await supabase.from('funcoes_mao_obra').update({ ativo: !f.ativo }).eq('id', f.id)
    setFuncoes(prev => prev.map(x => x.id === f.id ? { ...x, ativo: !x.ativo } : x))
  }

  async function deleteFuncao(f: Funcao) {
    if (!confirm(`Excluir a função "${f.nome}"?`)) return
    await supabase.from('funcoes_mao_obra').delete().eq('id', f.id)
    setFuncoes(prev => prev.filter(x => x.id !== f.id))
    toast.success('Excluída!')
  }

  async function toggleVinculo(userId: string, obraId: string) {
    const exists = vinculos.find(v => v.user_id === userId && v.obra_id === obraId)
    if (exists) {
      await supabase.from('apontador_obras').delete().eq('user_id', userId).eq('obra_id', obraId)
      setVinculos(prev => prev.filter(v => !(v.user_id === userId && v.obra_id === obraId)))
    } else {
      await supabase.from('apontador_obras').insert({ user_id: userId, obra_id: obraId })
      setVinculos(prev => [...prev, { user_id: userId, obra_id: obraId }])
    }
  }

  if (loading) return <div className="text-center py-8 text-slate-400"><Loader2 size={20} className="animate-spin mx-auto"/></div>

  return (
    <div className="space-y-6">
      {/* Funções de mão de obra */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-xs font-bold text-blue-800 mb-3 flex items-center gap-1.5"><HardHat size={14}/> Funções de mão de obra</p>
        <p className="text-[10px] text-blue-600 mb-3">Funções que aparecem no formulário do apontador para registro de mão de obra presente na obra.</p>

        <div className="space-y-1.5 mb-3">
          {funcoes.map(f => (
            <div key={f.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${f.ativo ? 'bg-white border border-slate-200' : 'bg-slate-100 border border-slate-100 opacity-60'}`}>
              <span className="flex-1 font-medium text-slate-700">{f.nome}</span>
              <button onClick={() => toggleFuncao(f)} className={`text-[10px] px-2 py-0.5 rounded-full ${f.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                {f.ativo ? 'Ativa' : 'Inativa'}
              </button>
              <button onClick={() => deleteFuncao(f)} className="p-1 text-slate-300 hover:text-red-500"><Trash2 size={12}/></button>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <input value={novaFuncao} onChange={e => setNovaFuncao(e.target.value)} placeholder="Nova função (ex: Soldador)"
            className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-xs"
            onKeyDown={e => { if (e.key === 'Enter') addFuncao() }}/>
          <button onClick={addFuncao} className="flex items-center gap-1 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded-lg">
            <Plus size={12}/> Adicionar
          </button>
        </div>
      </div>

      {/* Vincular apontadores a obras */}
      {apontadores.length > 0 ? (
        <div className="bg-primary-50 border border-primary-200 rounded-xl p-4">
          <p className="text-xs font-bold text-primary-800 mb-3 flex items-center gap-1.5"><Users size={14}/> Vincular apontadores a obras</p>
          <p className="text-[10px] text-primary-600 mb-3">Selecione um apontador e marque as obras que ele pode acessar no app de campo.</p>

          {/* Tabs de apontadores */}
          <div className="flex gap-2 mb-4 flex-wrap">
            {apontadores.map(ap => {
              const qtd = vinculos.filter(v => v.user_id === ap.id).length
              const active = selectedAp === ap.id
              return (
                <button key={ap.id} onClick={() => setSelectedAp(active ? '' : ap.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                    active ? 'bg-primary-500 text-white border-primary-500 shadow-sm' : 'bg-white text-slate-700 border-slate-200 hover:border-primary-300'
                  }`}>
                  <span>{ap.nome || ap.email}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${active ? 'bg-white/20 text-white' : 'bg-primary-100 text-primary-700'}`}>
                    {qtd} obra{qtd !== 1 ? 's' : ''}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Lista de obras do apontador selecionado */}
          {selectedAp && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="relative flex-1">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
                  <input value={obraBusca} onChange={e => setObraBusca(e.target.value)} placeholder="Buscar obra..."
                    className="w-full pl-7 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white"/>
                </div>
                <span className="text-[10px] text-slate-400">{vinculos.filter(v => v.user_id === selectedAp).length} de {todasObras.length} vinculadas</span>
              </div>

              <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto">
                {todasObras.filter(o => !obraBusca || o.nome_obra.toLowerCase().includes(obraBusca.toLowerCase())).map(o => {
                  const checked = vinculos.some(v => v.user_id === selectedAp && v.obra_id === o.id)
                  return (
                    <label key={o.id}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer text-xs transition-all border ${
                        checked ? 'bg-primary-100 border-primary-300 text-primary-800' : 'bg-white border-slate-200 text-slate-600 hover:border-primary-200 hover:bg-primary-50/50'
                      }`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleVinculo(selectedAp, o.id)}
                        className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 shrink-0"/>
                      <span className="font-medium truncate">{o.nome_obra}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {!selectedAp && (
            <div className="text-center py-6 text-xs text-primary-600/60">Selecione um apontador acima para gerenciar as obras</div>
          )}
        </div>
      ) : (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center text-xs text-slate-400">
          Nenhum usuário com cargo "Apontador" cadastrado. Altere o cargo de um usuário para APONTADOR na lista acima.
        </div>
      )}
    </div>
  )
}
