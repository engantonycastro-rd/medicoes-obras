import { useEffect, useState } from 'react'
import {
  Users, Shield, HardHat, CheckCircle2, XCircle,
  AlertCircle, RefreshCw, UserCheck, UserX, Crown, ChevronDown
} from 'lucide-react'
import toast from 'react-hot-toast'
import { usePerfilStore } from '../lib/perfilStore'
import { Perfil } from '../types'
import { formatDate } from '../utils/calculations'

export function UsuariosPage() {
  const {
    perfilAtual, perfis, loading,
    fetchTodosPerfis, ativarUsuario, desativarUsuario, alterarRole, atualizarNome,
  } = usePerfilStore()

  const [editandoNome, setEditandoNome] = useState<{ id: string; nome: string } | null>(null)

  useEffect(() => {
    if (perfilAtual?.role === 'ADMIN') {
      fetchTodosPerfis()
    }
  }, [perfilAtual])

  // Bloqueia acesso se não for admin
  if (!perfilAtual || perfilAtual.role !== 'ADMIN') {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-center gap-4">
          <AlertCircle size={24} className="text-red-500 shrink-0" />
          <div>
            <p className="font-semibold text-red-800">Acesso restrito</p>
            <p className="text-sm text-red-600 mt-1">
              Esta área é exclusiva para administradores.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const pendentes   = perfis.filter(p => !p.ativo && p.id !== perfilAtual.id)
  const ativos      = perfis.filter(p => p.ativo && p.id !== perfilAtual.id)
  const totalAtivos = perfis.filter(p => p.ativo).length

  async function handleAtivar(p: Perfil) {
    try {
      await ativarUsuario(p.id)
      toast.success(`${p.email} ativado com sucesso!`)
    } catch {
      toast.error('Erro ao ativar usuário')
    }
  }

  async function handleDesativar(p: Perfil) {
    if (!confirm(`Desativar ${p.email}? O usuário perderá acesso ao sistema.`)) return
    try {
      await desativarUsuario(p.id)
      toast.success(`${p.email} desativado.`)
    } catch {
      toast.error('Erro ao desativar usuário')
    }
  }

  async function handleAlterarRole(p: Perfil, novoRole: 'ADMIN' | 'ENGENHEIRO') {
    try {
      await alterarRole(p.id, novoRole)
      toast.success(`Perfil de ${p.email} alterado para ${novoRole}`)
    } catch {
      toast.error('Erro ao alterar perfil')
    }
  }

  async function handleSalvarNome() {
    if (!editandoNome) return
    try {
      await atualizarNome(editandoNome.id, editandoNome.nome)
      toast.success('Nome atualizado!')
      setEditandoNome(null)
    } catch {
      toast.error('Erro ao atualizar nome')
    }
  }

  const roleBadge = (role: string) => role === 'ADMIN'
    ? 'bg-amber-100 text-amber-700 border-amber-200'
    : 'bg-blue-100 text-blue-700 border-blue-200'

  const roleIcon = (role: string) => role === 'ADMIN'
    ? <Crown size={11} />
    : <HardHat size={11} />

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Gerenciar Usuários</h1>
          <p className="text-slate-500 text-sm mt-1">
            Controle quem tem acesso ao sistema e qual o nível de permissão
          </p>
        </div>
        <button
          onClick={fetchTodosPerfis}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg
            text-sm text-slate-600 hover:bg-slate-50 transition-all"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Total de usuários', val: perfis.length, icon: Users, color: 'bg-slate-100 text-slate-600' },
          { label: 'Usuários ativos', val: totalAtivos, icon: UserCheck, color: 'bg-emerald-100 text-emerald-600' },
          { label: 'Aguardando aprovação', val: pendentes.length, icon: UserX, color: pendentes.length > 0 ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500' },
        ].map(({ label, val, icon: Icon, color }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-xl p-5 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
              <Icon size={20} />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{val}</p>
              <p className="text-sm text-slate-500">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Como adicionar usuários */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
        <p className="text-sm font-semibold text-blue-800 mb-1 flex items-center gap-2">
          <AlertCircle size={15} />
          Como adicionar um novo colaborador
        </p>
        <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
          <li>Peça para o colaborador se cadastrar normalmente na tela de login do sistema</li>
          <li>O cadastro dele aparecerá aqui em <strong>"Aguardando aprovação"</strong></li>
          <li>Clique em <strong>"Ativar"</strong> para liberar o acesso e defina o perfil (Engenheiro ou Admin)</li>
        </ol>
      </div>

      {/* ── Pendentes ──────────────────────────────────────────────────── */}
      {pendentes.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
            Aguardando Aprovação ({pendentes.length})
          </h2>
          <div className="space-y-2">
            {pendentes.map(p => (
              <div key={p.id} className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-4">
                <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center shrink-0">
                  <Users size={18} className="text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  {editandoNome?.id === p.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        value={editandoNome.nome}
                        onChange={e => setEditandoNome({ ...editandoNome, nome: e.target.value })}
                        placeholder="Nome do colaborador"
                        className="border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                      <button onClick={handleSalvarNome} className="text-xs text-emerald-600 font-medium hover:underline">
                        Salvar
                      </button>
                      <button onClick={() => setEditandoNome(null)} className="text-xs text-slate-400 hover:underline">
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-slate-700 text-sm">
                        {p.nome || <span className="text-slate-400 italic">Sem nome</span>}
                      </p>
                      <button
                        onClick={() => setEditandoNome({ id: p.id, nome: p.nome || '' })}
                        className="text-xs text-blue-500 hover:underline"
                      >
                        Definir nome
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-slate-500">{p.email}</p>
                  <p className="text-xs text-slate-400">
                    Cadastrado em {formatDate(p.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {/* Selecionar role antes de ativar */}
                  <select
                    defaultValue="ENGENHEIRO"
                    onChange={e => alterarRole(p.id, e.target.value as 'ADMIN' | 'ENGENHEIRO')}
                    className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    <option value="ENGENHEIRO">Engenheiro</option>
                    <option value="ADMIN">Administrador</option>
                  </select>
                  <button
                    onClick={() => handleAtivar(p)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700
                      text-white text-xs font-medium rounded-lg transition-all"
                  >
                    <CheckCircle2 size={13} />
                    Ativar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Usuários Ativos ─────────────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2">
          <span className="w-2 h-2 bg-emerald-400 rounded-full" />
          Usuários com Acesso ({ativos.length + 1})
        </h2>
        <div className="space-y-2">

          {/* Próprio admin (você) */}
          <div className="bg-white border border-amber-200 rounded-xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center shrink-0">
              <Crown size={18} className="text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-slate-800 text-sm">{perfilAtual.nome || 'Você'}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium flex items-center gap-1 ${roleBadge('ADMIN')}`}>
                  <Crown size={11} />
                  ADMIN
                </span>
              </div>
              <p className="text-xs text-slate-500">{perfilAtual.email}</p>
            </div>
            <span className="text-xs text-slate-400 italic">Você</span>
          </div>

          {ativos.map(p => (
            <div key={p.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4 hover:border-slate-300 transition-all">
              <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center shrink-0">
                {p.role === 'ADMIN' ? <Crown size={18} className="text-amber-500" /> : <HardHat size={18} className="text-blue-500" />}
              </div>

              <div className="flex-1 min-w-0">
                {editandoNome?.id === p.id ? (
                  <div className="flex items-center gap-2 mb-1">
                    <input
                      value={editandoNome.nome}
                      onChange={e => setEditandoNome({ ...editandoNome, nome: e.target.value })}
                      className="border border-slate-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                    <button onClick={handleSalvarNome} className="text-xs text-emerald-600 font-medium hover:underline">Salvar</button>
                    <button onClick={() => setEditandoNome(null)} className="text-xs text-slate-400 hover:underline">Cancelar</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-medium text-slate-800 text-sm">
                      {p.nome || <span className="text-slate-400 italic text-xs">Sem nome</span>}
                    </p>
                    <button
                      onClick={() => setEditandoNome({ id: p.id, nome: p.nome || '' })}
                      className="text-xs text-blue-500 hover:underline"
                    >
                      Editar
                    </button>
                  </div>
                )}
                <p className="text-xs text-slate-500">{p.email}</p>
                <p className="text-xs text-slate-400">Ativo desde {formatDate(p.created_at)}</p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* Alterar role */}
                <div className="relative">
                  <select
                    value={p.role}
                    onChange={e => handleAlterarRole(p, e.target.value as 'ADMIN' | 'ENGENHEIRO')}
                    className={`text-xs px-2 py-1.5 rounded-lg border font-medium appearance-none pr-6 cursor-pointer
                      focus:outline-none focus:ring-2 focus:ring-amber-400 ${roleBadge(p.role)}`}
                  >
                    <option value="ENGENHEIRO">🏗 Engenheiro</option>
                    <option value="ADMIN">👑 Admin</option>
                  </select>
                  <ChevronDown size={11} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-60" />
                </div>

                {/* Desativar */}
                <button
                  onClick={() => handleDesativar(p)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200
                    text-red-600 text-xs hover:bg-red-50 transition-all"
                >
                  <UserX size={13} />
                  Desativar
                </button>
              </div>
            </div>
          ))}

          {ativos.length === 0 && (
            <div className="text-center py-8 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-xl">
              Nenhum outro usuário ativo ainda.
              <br />
              <span className="text-xs">Peça para seus colaboradores se cadastrarem no sistema.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
