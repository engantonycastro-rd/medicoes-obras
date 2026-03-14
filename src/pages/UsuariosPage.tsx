import { useEffect, useState } from 'react'
import {
  Users, HardHat, CheckCircle2,
  AlertCircle, RefreshCw, UserCheck, UserX, Crown, ChevronDown,
  UserPlus, UserMinus, Briefcase, ArrowRight,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { usePerfilStore } from '../lib/perfilStore'
import { Perfil, RolePerfil } from '../types'
import { formatDate } from '../utils/calculations'
import { ZonasAcessoManager } from '../components/ZonasAcessoManager'
import { ApontadorManager } from '../components/ApontadorManager'

export function UsuariosPage() {
  const {
    perfilAtual, perfis, loading,
    fetchTodosPerfis, ativarUsuario, desativarUsuario, alterarRole, atualizarNome, atribuirGestor,
  } = usePerfilStore()

  const [editandoNome, setEditandoNome] = useState<{ id: string; nome: string } | null>(null)
  const [atribuindoA, setAtribuindoA] = useState<string | null>(null)

  useEffect(() => {
    if (perfilAtual?.role === 'ADMIN') fetchTodosPerfis()
  }, [perfilAtual])

  if (!perfilAtual || perfilAtual.role !== 'ADMIN') {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-center gap-4">
          <AlertCircle size={24} className="text-red-500 shrink-0" />
          <div>
            <p className="font-semibold text-red-800">Acesso restrito</p>
            <p className="text-sm text-red-600 mt-1">Esta área é exclusiva para administradores.</p>
          </div>
        </div>
      </div>
    )
  }

  const pendentes = perfis.filter(p => !p.ativo && p.id !== perfilAtual.id)
  const ativos = perfis.filter(p => p.ativo && p.id !== perfilAtual.id)
  const totalAtivos = perfis.filter(p => p.ativo).length
  const gestores = ativos.filter(p => p.role === 'GESTOR')
  const engenheirosLivres = ativos.filter(p => p.role === 'ENGENHEIRO' && !p.gestor_id)

  async function handleAtivar(p: Perfil) {
    try { await ativarUsuario(p.id); toast.success(`${p.email} ativado!`) }
    catch { toast.error('Erro ao ativar') }
  }

  async function handleDesativar(p: Perfil) {
    if (!confirm(`Desativar ${p.email}?`)) return
    try { await desativarUsuario(p.id); toast.success(`${p.email} desativado.`) }
    catch { toast.error('Erro ao desativar') }
  }

  async function handleAlterarRole(p: Perfil, novoRole: RolePerfil) {
    try { await alterarRole(p.id, novoRole); toast.success(`${p.nome || p.email} agora é ${novoRole}`) }
    catch { toast.error('Erro ao alterar perfil') }
  }

  async function handleSalvarNome() {
    if (!editandoNome) return
    try { await atualizarNome(editandoNome.id, editandoNome.nome); toast.success('Nome atualizado!'); setEditandoNome(null) }
    catch { toast.error('Erro ao atualizar nome') }
  }

  async function handleAtribuir(engenheiroId: string, gestorId: string) {
    try { await atribuirGestor(engenheiroId, gestorId); toast.success('Engenheiro atribuído à equipe!'); setAtribuindoA(null) }
    catch { toast.error('Erro ao atribuir') }
  }

  async function handleRemoverDaEquipe(engenheiroId: string) {
    try { await atribuirGestor(engenheiroId, null); toast.success('Removido da equipe') }
    catch { toast.error('Erro ao remover') }
  }

  const roleBadge = (role: string) =>
    role === 'ADMIN' ? 'bg-amber-100 text-amber-700 border-amber-200'
    : role === 'GESTOR' ? 'bg-purple-100 text-purple-700 border-purple-200'
    : role === 'APONTADOR' ? 'bg-cyan-100 text-cyan-700 border-cyan-200'
    : role === 'ORCAMENTISTA' ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
    : 'bg-blue-100 text-blue-700 border-blue-200'

  function NomeEditor({ p }: { p: Perfil }) {
    if (editandoNome?.id === p.id) return (
      <div className="flex items-center gap-2">
        <input value={editandoNome.nome} onChange={e => setEditandoNome({ ...editandoNome, nome: e.target.value })}
          onKeyDown={e => e.key === 'Enter' && handleSalvarNome()} placeholder="Nome do colaborador" autoFocus
          className="border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
        <button onClick={handleSalvarNome} className="text-xs text-emerald-600 font-medium hover:underline">Salvar</button>
        <button onClick={() => setEditandoNome(null)} className="text-xs text-slate-400 hover:underline">Cancelar</button>
      </div>
    )
    return (
      <div className="flex items-center gap-2">
        <p className="font-medium text-slate-800 text-sm">{p.nome || <span className="text-slate-400 italic text-xs">Sem nome</span>}</p>
        <button onClick={() => setEditandoNome({ id: p.id, nome: p.nome || '' })} className="text-xs text-blue-500 hover:underline">Editar</button>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Gerenciar Usuários & Equipes</h1>
          <p className="text-slate-500 text-sm mt-1">Controle de acesso, gestores de contrato e hierarquia de equipes</p>
        </div>
        <button onClick={fetchTodosPerfis} disabled={loading}
          className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/> Atualizar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total', val: perfis.length, icon: Users, color: 'bg-slate-100 text-slate-600' },
          { label: 'Ativos', val: totalAtivos, icon: UserCheck, color: 'bg-emerald-100 text-emerald-600' },
          { label: 'Gestores', val: gestores.length, icon: Briefcase, color: 'bg-purple-100 text-purple-600' },
          { label: 'Pendentes', val: pendentes.length, icon: UserX, color: pendentes.length > 0 ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500' },
        ].map(({ label, val, icon: Icon, color }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}><Icon size={18}/></div>
            <div><p className="text-xl font-bold text-slate-800">{val}</p><p className="text-xs text-slate-500">{label}</p></div>
          </div>
        ))}
      </div>

      {/* Hierarquia */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
        <p className="text-sm font-semibold text-blue-800 mb-1.5 flex items-center gap-2"><AlertCircle size={15}/> Hierarquia de Permissões</p>
        <div className="flex gap-6 mt-2 text-xs text-blue-700">
          <div className="flex items-center gap-2"><span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-bold text-[10px]">ADMIN</span> Vê tudo. Gerencia usuários e equipes.</div>
          <div className="flex items-center gap-2"><span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full font-bold text-[10px]">GESTOR</span> Lidera equipe. Vê contratos seus + da equipe.</div>
          <div className="flex items-center gap-2"><span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-bold text-[10px]">ENGENHEIRO</span> Vê seus contratos + do gestor e colegas.</div>
        </div>
      </div>

      {/* ── Pendentes ── */}
      {pendentes.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse"/> Aguardando Aprovação ({pendentes.length})
          </h2>
          <div className="space-y-2">
            {pendentes.map(p => (
              <div key={p.id} className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-4">
                <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center shrink-0"><Users size={18} className="text-amber-600"/></div>
                <div className="flex-1 min-w-0">
                  <NomeEditor p={p}/>
                  <p className="text-xs text-slate-500">{p.email}</p>
                  <p className="text-xs text-slate-400">Cadastrado em {formatDate(p.created_at)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select defaultValue="ENGENHEIRO" onChange={e => alterarRole(p.id, e.target.value as RolePerfil)}
                    className="text-xs border border-slate-200 rounded-lg px-2 py-1.5">
                    <option value="ENGENHEIRO">Engenheiro</option>
                    <option value="GESTOR">Gestor de Contrato</option>
                    <option value="APONTADOR">Apontador</option>
                    <option value="ORCAMENTISTA">Orçamentista</option>
                    <option value="ADMIN">Administrador</option>
                  </select>
                  <button onClick={() => handleAtivar(p)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg">
                    <CheckCircle2 size={13}/> Ativar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ EQUIPES ═══ */}
      <div className="mb-8">
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2">
          <span className="w-2 h-2 bg-purple-400 rounded-full"/> Equipes de Gestores ({gestores.length})
        </h2>

        {gestores.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm border-2 border-dashed border-purple-200 rounded-xl bg-purple-50/30">
            Nenhum Gestor de Contrato definido ainda.
            <br/><span className="text-xs">Altere o perfil de um engenheiro para "Gestor" para criar uma equipe.</span>
          </div>
        ) : (
          <div className="space-y-4">
            {gestores.map(gestor => {
              const membros = ativos.filter(p => p.gestor_id === gestor.id)
              return (
                <div key={gestor.id} className="bg-white border-2 border-purple-200 rounded-2xl overflow-hidden">
                  {/* Gestor header */}
                  <div className="bg-gradient-to-r from-purple-50 to-white p-4 flex items-center gap-4 border-b border-purple-100">
                    <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center shrink-0">
                      <Briefcase size={22} className="text-purple-600"/>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-slate-800">{gestor.nome || gestor.email}</p>
                        <span className="text-[10px] px-2 py-0.5 rounded-full border font-bold flex items-center gap-1 bg-purple-100 text-purple-700 border-purple-200">
                          <Briefcase size={9}/> GESTOR
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">{gestor.email}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-2xl font-bold text-purple-600">{membros.length}</p>
                      <p className="text-[10px] text-slate-400">{membros.length === 1 ? 'membro' : 'membros'}</p>
                    </div>
                    <button onClick={() => setAtribuindoA(atribuindoA === gestor.id ? null : gestor.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 ${
                        atribuindoA === gestor.id ? 'bg-purple-600 text-white' : 'border border-purple-200 text-purple-600 hover:bg-purple-50'
                      }`}>
                      <UserPlus size={13}/> Adicionar
                    </button>
                  </div>

                  {/* Painel atribuição */}
                  {atribuindoA === gestor.id && (
                    <div className="bg-purple-50/50 border-b border-purple-100 p-3">
                      <p className="text-xs text-purple-700 font-medium mb-2">Engenheiros disponíveis (sem equipe):</p>
                      {engenheirosLivres.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">Todos os engenheiros já estão em equipes.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {engenheirosLivres.map(eng => (
                            <button key={eng.id} onClick={() => handleAtribuir(eng.id, gestor.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-purple-200 rounded-lg text-xs
                                text-slate-700 hover:border-purple-400 hover:bg-purple-50 transition-all">
                              <UserPlus size={11} className="text-purple-500"/> {eng.nome || eng.email}
                              <ArrowRight size={10} className="text-purple-400"/>
                            </button>
                          ))}
                        </div>
                      )}
                      <button onClick={() => setAtribuindoA(null)} className="mt-2 text-[10px] text-slate-400 hover:text-slate-600">Fechar</button>
                    </div>
                  )}

                  {/* Membros */}
                  {membros.length > 0 ? (
                    <div className="divide-y divide-slate-100">
                      {membros.map(m => (
                        <div key={m.id} className="px-4 py-3 flex items-center gap-3 hover:bg-slate-50/50 transition-colors">
                          <div className="w-3 border-l-2 border-b-2 border-purple-200 h-6 ml-4 shrink-0"/>
                          <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                            <HardHat size={15} className="text-blue-500"/>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-700">{m.nome || <span className="italic text-slate-400">Sem nome</span>}</p>
                            <p className="text-xs text-slate-400">{m.email}</p>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded-full border font-medium flex items-center gap-1 bg-blue-100 text-blue-700 border-blue-200">
                            <HardHat size={9}/> ENGENHEIRO
                          </span>
                          <button onClick={() => handleRemoverDaEquipe(m.id)} title="Remover da equipe"
                            className="flex items-center gap-1 px-2 py-1 rounded-lg border border-red-200 text-red-500 text-xs hover:bg-red-50 transition-all">
                            <UserMinus size={12}/> Remover
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-4 py-6 text-center text-xs text-slate-400">
                      Nenhum engenheiro atribuído. Clique em <strong className="text-purple-500">Adicionar</strong> para vincular.
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ═══ ENGENHEIROS SEM EQUIPE ═══ */}
      {engenheirosLivres.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="w-2 h-2 bg-blue-400 rounded-full"/> Engenheiros sem Equipe ({engenheirosLivres.length})
          </h2>
          <div className="bg-blue-50/30 border border-blue-200 border-dashed rounded-xl p-3">
            <p className="text-xs text-blue-600 mb-3">Estes engenheiros só veem seus próprios contratos. Atribua-os a um Gestor para compartilhar visibilidade.</p>
            <div className="space-y-2">
              {engenheirosLivres.map(p => (
                <div key={p.id} className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center shrink-0"><HardHat size={15} className="text-blue-500"/></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700">{p.nome || p.email}</p>
                    <p className="text-xs text-slate-400">{p.email}</p>
                  </div>
                  {gestores.length > 0 && (
                    <select defaultValue="" onChange={e => { if (e.target.value) handleAtribuir(p.id, e.target.value) }}
                      className="text-xs border border-purple-200 rounded-lg px-2 py-1.5 text-purple-700 bg-purple-50">
                      <option value="" disabled>Atribuir a...</option>
                      {gestores.map(g => <option key={g.id} value={g.id}>{g.nome || g.email}</option>)}
                    </select>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ TODOS ═══ */}
      <div>
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2">
          <span className="w-2 h-2 bg-emerald-400 rounded-full"/> Todos os Usuários ({ativos.length + 1})
        </h2>
        <div className="space-y-2">
          {/* Você */}
          <div className="bg-white border border-amber-200 rounded-xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center shrink-0"><Crown size={18} className="text-amber-600"/></div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-slate-800 text-sm">{perfilAtual.nome || 'Você'}</p>
                <span className="text-xs px-2 py-0.5 rounded-full border font-medium flex items-center gap-1 bg-amber-100 text-amber-700 border-amber-200"><Crown size={11}/> ADMIN</span>
              </div>
              <p className="text-xs text-slate-500">{perfilAtual.email}</p>
            </div>
            <span className="text-xs text-slate-400 italic">Você</span>
          </div>

          {ativos.map(p => {
            const equipeGestor = p.gestor_id ? perfis.find(g => g.id === p.gestor_id) : null
            return (
              <div key={p.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4 hover:border-slate-300 transition-all">
                <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center shrink-0">
                  {p.role === 'ADMIN' ? <Crown size={18} className="text-amber-500"/>
                  : p.role === 'GESTOR' ? <Briefcase size={18} className="text-purple-500"/>
                  : <HardHat size={18} className="text-blue-500"/>}
                </div>
                <div className="flex-1 min-w-0">
                  <NomeEditor p={p}/>
                  <p className="text-xs text-slate-500">{p.email}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-slate-400">Ativo desde {formatDate(p.created_at)}</p>
                    {equipeGestor && (
                      <span className="text-[10px] bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full border border-purple-200">
                        Equipe: {equipeGestor.nome || equipeGestor.email}
                      </span>
                    )}
                    {p.role === 'GESTOR' && (
                      <span className="text-[10px] bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full border border-purple-200">
                        {ativos.filter(x => x.gestor_id === p.id).length} membro(s)
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="relative">
                    <select value={p.role} onChange={e => handleAlterarRole(p, e.target.value as RolePerfil)}
                      className={`text-xs px-2 py-1.5 rounded-lg border font-medium appearance-none pr-6 cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-400 ${roleBadge(p.role)}`}>
                      <option value="ENGENHEIRO">🏗 Engenheiro</option>
                      <option value="GESTOR">💼 Gestor</option>
                      <option value="APONTADOR">📋 Apontador</option>
                      <option value="ORCAMENTISTA">📊 Orçamentista</option>
                      <option value="ADMIN">👑 Admin</option>
                    </select>
                    <ChevronDown size={11} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-60"/>
                  </div>
                  <button onClick={() => handleDesativar(p)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs hover:bg-red-50 transition-all">
                    <UserX size={13}/> Desativar
                  </button>
                </div>
              </div>
            )
          })}

          {ativos.length === 0 && (
            <div className="text-center py-8 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-xl">Nenhum outro usuário ativo ainda.</div>
          )}
        </div>
      </div>

      {/* ═══ ZONAS DE ACESSO ═══ */}
      <div className="mt-8">
        <ZonasAcessoManager perfis={perfis}/>

        {/* Apontadores */}
        <div className="mt-8">
          <h2 className="text-lg font-bold text-slate-800 mb-4">Apontadores de Obra</h2>
          <ApontadorManager/>
        </div>
      </div>
    </div>
  )
}
