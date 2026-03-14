import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HardHat, Mail, Lock, Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../lib/supabase'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [modo, setModo] = useState<'login' | 'register'>('login')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    try {
      if (modo === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
        if (error) throw error
        toast.success('Bem-vindo!')
        navigate('/')
      } else {
        const { error } = await supabase.auth.signUp({ email, password: senha })
        if (error) throw error
        toast.success('Conta criada! Verifique seu e-mail para confirmar.')
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro de autenticação')
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4"
      style={{
        backgroundImage: `radial-gradient(ellipse at 20% 50%, rgba(245, 158, 11, 0.08) 0%, transparent 60%),
                          radial-gradient(ellipse at 80% 20%, rgba(59, 130, 246, 0.05) 0%, transparent 50%)`
      }}
    >
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary-500/30">
            <HardHat size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Central de Obras</h1>
          <p className="text-slate-400 mt-2 text-sm">RD Construtora — Sistema de Gestão de Obras Públicas</p>
        </div>

        {/* Card */}
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-2xl">
          <h2 className="text-lg font-semibold text-white mb-6">
            {modo === 'login' ? 'Entrar na sua conta' : 'Criar nova conta'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">E-mail</label>
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="seu@email.com"
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-700 border border-slate-600
                    rounded-lg text-sm text-white placeholder-slate-500
                    focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Senha</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type={mostrarSenha ? 'text' : 'password'}
                  value={senha}
                  onChange={e => setSenha(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="w-full pl-9 pr-10 py-2.5 bg-slate-700 border border-slate-600
                    rounded-lg text-sm text-white placeholder-slate-500
                    focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {mostrarSenha ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-primary-500 hover:bg-primary-600 text-white font-semibold
                rounded-lg transition-all shadow-lg shadow-primary-500/20 disabled:opacity-50 mt-2"
            >
              {loading
                ? 'Aguarde...'
                : modo === 'login' ? 'Entrar' : 'Criar Conta'
              }
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => setModo(m => m === 'login' ? 'register' : 'login')}
              className="text-sm text-slate-400 hover:text-primary-400 transition-colors"
            >
              {modo === 'login'
                ? 'Não tem conta? Criar conta'
                : 'Já tem conta? Entrar'
              }
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-slate-600 mt-4">
          Desenvolvido por <span className="text-slate-500">Engenheiro Adaylson Castro</span>
        </p>
      </div>
    </div>
  )
}
