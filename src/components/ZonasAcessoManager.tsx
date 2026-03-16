import { useEffect, useState } from 'react'
import {
  MapPin, Plus, Trash2, Shield, Building2, Map,
  CheckCircle2, Users, ChevronDown, ChevronUp, Search,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Perfil } from '../types'
import { supabase } from '../lib/supabase'

interface Zona {
  id: string; nome: string; tipo: 'ESCRITORIO' | 'CIDADE'
  latitude: number | null; longitude: number | null; raio_metros: number
  estado: string | null; cidade: string | null; ativo: boolean
}

interface UserZona { user_id: string; zona_id: string }

const ESTADOS = [
  { uf: 'AC', nome: 'Acre' }, { uf: 'AL', nome: 'Alagoas' }, { uf: 'AP', nome: 'Amapá' },
  { uf: 'AM', nome: 'Amazonas' }, { uf: 'BA', nome: 'Bahia' }, { uf: 'CE', nome: 'Ceará' },
  { uf: 'DF', nome: 'Distrito Federal' }, { uf: 'ES', nome: 'Espírito Santo' },
  { uf: 'GO', nome: 'Goiás' }, { uf: 'MA', nome: 'Maranhão' }, { uf: 'MT', nome: 'Mato Grosso' },
  { uf: 'MS', nome: 'Mato Grosso do Sul' }, { uf: 'MG', nome: 'Minas Gerais' },
  { uf: 'PA', nome: 'Pará' }, { uf: 'PB', nome: 'Paraíba' }, { uf: 'PR', nome: 'Paraná' },
  { uf: 'PE', nome: 'Pernambuco' }, { uf: 'PI', nome: 'Piauí' },
  { uf: 'RJ', nome: 'Rio de Janeiro' }, { uf: 'RN', nome: 'Rio Grande do Norte' },
  { uf: 'RS', nome: 'Rio Grande do Sul' }, { uf: 'RO', nome: 'Rondônia' },
  { uf: 'RR', nome: 'Roraima' }, { uf: 'SC', nome: 'Santa Catarina' },
  { uf: 'SP', nome: 'São Paulo' }, { uf: 'SE', nome: 'Sergipe' }, { uf: 'TO', nome: 'Tocantins' },
]

interface Props { perfis: Perfil[] }

export function ZonasAcessoManager({ perfis }: Props) {
  const [zonas, setZonas] = useState<Zona[]>([])
  const [vinculos, setVinculos] = useState<UserZona[]>([])
  const [loading, setLoading] = useState(true)
  const [novaZona, setNovaZona] = useState(false)
  const [editUser, setEditUser] = useState<string | null>(null)
  const [buscaUser, setBuscaUser] = useState('')

  // Form nova zona
  const [formTipo, setFormTipo] = useState<'ESCRITORIO' | 'CIDADE'>('ESCRITORIO')
  const [formNome, setFormNome] = useState('')
  const [formLat, setFormLat] = useState('')
  const [formLng, setFormLng] = useState('')
  const [formRaio, setFormRaio] = useState('500')
  const [formEstado, setFormEstado] = useState('')
  const [formCidade, setFormCidade] = useState('')
  const [obtendoGPS, setObtendoGPS] = useState(false)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const [{ data: z }, { data: v }] = await Promise.all([
      supabase.from('zonas_acesso').select('*').order('created_at'),
      supabase.from('usuario_zonas').select('*'),
    ])
    if (z) setZonas(z as Zona[])
    if (v) setVinculos(v as UserZona[])
    setLoading(false)
  }

  function obterMinhaLocalizacao() {
    if (!navigator.geolocation) { toast.error('GPS não disponível'); return }
    setObtendoGPS(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setFormLat(pos.coords.latitude.toFixed(7))
        setFormLng(pos.coords.longitude.toFixed(7))
        setObtendoGPS(false)
        toast.success('Localização obtida!')
      },
      () => { setObtendoGPS(false); toast.error('Não foi possível obter a localização') },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  async function criarZona() {
    if (!formNome.trim()) { toast.error('Nome obrigatório'); return }
    const payload: any = { nome: formNome, tipo: formTipo, ativo: true }
    if (formTipo === 'ESCRITORIO') {
      if (!formLat || !formLng) { toast.error('Latitude e Longitude obrigatórios'); return }
      payload.latitude = Number(formLat)
      payload.longitude = Number(formLng)
      payload.raio_metros = Number(formRaio) || 500
    } else {
      if (!formEstado) { toast.error('Estado obrigatório'); return }
      payload.estado = formEstado
      payload.cidade = formCidade || null
    }

    const { data, error } = await supabase.from('zonas_acesso').insert(payload).select().single()
    if (error) { toast.error(error.message); return }
    setZonas(prev => [...prev, data as Zona])
    toast.success('Zona criada!')
    resetForm()
  }

  async function deletarZona(id: string) {
    if (!confirm('Excluir esta zona? Todos os vínculos com usuários serão removidos.')) return
    await supabase.from('usuario_zonas').delete().eq('zona_id', id)
    await supabase.from('zonas_acesso').delete().eq('id', id)
    setZonas(prev => prev.filter(z => z.id !== id))
    setVinculos(prev => prev.filter(v => v.zona_id !== id))
    toast.success('Zona excluída')
  }

  async function toggleVinculo(userId: string, zonaId: string) {
    const existe = vinculos.find(v => v.user_id === userId && v.zona_id === zonaId)
    if (existe) {
      await supabase.from('usuario_zonas').delete().eq('user_id', userId).eq('zona_id', zonaId)
      setVinculos(prev => prev.filter(v => !(v.user_id === userId && v.zona_id === zonaId)))
    } else {
      await supabase.from('usuario_zonas').insert({ user_id: userId, zona_id: zonaId })
      setVinculos(prev => [...prev, { user_id: userId, zona_id: zonaId }])
    }
  }

  function resetForm() {
    setNovaZona(false); setFormNome(''); setFormLat(''); setFormLng('');
    setFormRaio('500'); setFormEstado(''); setFormCidade(''); setFormTipo('ESCRITORIO')
  }

  const zonasAtivas = zonas.filter(z => z.ativo)
  const usersFiltrados = perfis.filter(p => p.ativo && (
    !buscaUser || (p.nome || p.email).toLowerCase().includes(buscaUser.toLowerCase())
  ))

  const inputCls = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"

  return (
    <div className="space-y-6">
      {/* ═══ HEADER ═══ */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-rose-600 rounded-xl flex items-center justify-center">
            <Shield size={20} className="text-white"/>
          </div>
          <div>
            <h2 className="font-bold text-slate-800 text-lg">Zonas de Acesso</h2>
            <p className="text-xs text-slate-500">Restrinja o acesso dos usuários por localização geográfica</p>
          </div>
        </div>
        <button onClick={() => setNovaZona(!novaZona)}
          className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-lg text-sm">
          <Plus size={15}/> Nova Zona
        </button>
      </div>

      {/* ═══ FORM NOVA ZONA ═══ */}
      {novaZona && (
        <div className="bg-primary-50 border-2 border-primary-300 rounded-2xl p-5">
          <p className="font-bold text-primary-800 text-sm mb-4">Criar Nova Zona de Acesso</p>

          <div className="flex gap-3 mb-4">
            {(['ESCRITORIO', 'CIDADE'] as const).map(t => (
              <button key={t} onClick={() => setFormTipo(t)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border-2 transition-all ${
                  formTipo === t ? 'border-primary-500 bg-primary-500 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-primary-300'
                }`}>
                {t === 'ESCRITORIO' ? <Building2 size={15}/> : <Map size={15}/>}
                {t === 'ESCRITORIO' ? 'Escritório (raio)' : 'Cidade / Estado'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-600 block mb-1">Nome da zona *</label>
              <input value={formNome} onChange={e => setFormNome(e.target.value)}
                placeholder={formTipo === 'ESCRITORIO' ? 'Ex: Escritório RD - São Gonçalo' : 'Ex: Natal-RN'} className={inputCls}/>
            </div>

            {formTipo === 'ESCRITORIO' ? (
              <>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Latitude *</label>
                  <input type="number" step="any" value={formLat} onChange={e => setFormLat(e.target.value)}
                    placeholder="-5.7945" className={inputCls}/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Longitude *</label>
                  <input type="number" step="any" value={formLng} onChange={e => setFormLng(e.target.value)}
                    placeholder="-35.2110" className={inputCls}/>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Raio (metros)</label>
                  <input type="number" value={formRaio} onChange={e => setFormRaio(e.target.value)}
                    placeholder="500" className={inputCls}/>
                  <p className="text-[10px] text-slate-400 mt-0.5">Distância máxima do ponto central</p>
                </div>
                <div className="flex items-end">
                  <button onClick={obterMinhaLocalizacao} disabled={obtendoGPS}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm w-full justify-center">
                    <MapPin size={14} className={obtendoGPS ? 'animate-pulse' : ''}/>
                    {obtendoGPS ? 'Obtendo...' : 'Usar minha localização'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Estado *</label>
                  <select value={formEstado} onChange={e => setFormEstado(e.target.value)} className={inputCls}>
                    <option value="">Selecione o estado</option>
                    {ESTADOS.map(e => <option key={e.uf} value={e.uf}>{e.uf} — {e.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">Cidade (opcional)</label>
                  <input value={formCidade} onChange={e => setFormCidade(e.target.value)}
                    placeholder="Deixe vazio para todo o estado" className={inputCls}/>
                  <p className="text-[10px] text-slate-400 mt-0.5">Em branco = acesso em qualquer cidade do estado</p>
                </div>
              </>
            )}
          </div>

          <div className="flex gap-3">
            <button onClick={resetForm} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 bg-white">Cancelar</button>
            <button onClick={criarZona}
              className="flex items-center gap-2 px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white font-bold rounded-lg text-sm">
              <CheckCircle2 size={14}/> Criar Zona
            </button>
          </div>
        </div>
      )}

      {/* ═══ ZONAS EXISTENTES ═══ */}
      {zonasAtivas.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-xl p-8 text-center">
          <Shield size={28} className="mx-auto text-slate-200 mb-2"/>
          <p className="text-sm text-slate-400">Nenhuma zona de acesso configurada.</p>
          <p className="text-xs text-slate-300 mt-1">Todos os usuários podem acessar de qualquer localização.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {zonasAtivas.map(z => {
            const usersNaZona = vinculos.filter(v => v.zona_id === z.id).length
            return (
              <div key={z.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow">
                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                        z.tipo === 'ESCRITORIO' ? 'bg-blue-100' : 'bg-emerald-100'
                      }`}>
                        {z.tipo === 'ESCRITORIO' ? <Building2 size={16} className="text-blue-600"/> : <Map size={16} className="text-emerald-600"/>}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800 text-sm">{z.nome}</p>
                        <p className="text-[10px] text-slate-400">
                          {z.tipo === 'ESCRITORIO'
                            ? `${z.latitude?.toFixed(4)}, ${z.longitude?.toFixed(4)} • ${z.raio_metros}m`
                            : `${z.cidade || 'Todo o estado'} — ${z.estado}`
                          }
                        </p>
                      </div>
                    </div>
                    <button onClick={() => deletarZona(z.id)}
                      className="p-1.5 rounded text-slate-300 hover:text-red-500 hover:bg-red-50">
                      <Trash2 size={13}/>
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 mt-3">
                    <Users size={11} className="text-slate-400"/>
                    <span className="text-xs text-slate-500">{usersNaZona} usuário{usersNaZona !== 1 ? 's' : ''} vinculado{usersNaZona !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ═══ ATRIBUIÇÃO DE ZONAS POR USUÁRIO ═══ */}
      {zonasAtivas.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-3">
            <Users size={15} className="text-slate-500"/>
            <p className="font-bold text-sm text-slate-700 flex-1">Atribuir Zonas aos Usuários</p>
            <div className="relative w-52">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
              <input value={buscaUser} onChange={e => setBuscaUser(e.target.value)}
                placeholder="Filtrar usuários..." className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs"/>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            <div className="grid px-5 py-2 bg-slate-50" style={{ gridTemplateColumns: `250px repeat(${zonasAtivas.length}, 1fr)` }}>
              <span className="text-[10px] font-semibold text-slate-500 uppercase">Usuário</span>
              {zonasAtivas.map(z => (
                <span key={z.id} className="text-[10px] font-semibold text-slate-500 uppercase text-center truncate px-1">{z.nome}</span>
              ))}
            </div>

            {usersFiltrados.map(user => {
              const userZonaIds = vinculos.filter(v => v.user_id === user.id).map(v => v.zona_id)
              const isAdmin = user.role === 'ADMIN'
              return (
                <div key={user.id} className="grid items-center px-5 py-2.5 hover:bg-slate-50/50"
                  style={{ gridTemplateColumns: `250px repeat(${zonasAtivas.length}, 1fr)` }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 bg-slate-100 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-slate-600">
                      {(user.nome || user.email).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-700 truncate">{user.nome || 'Sem nome'}</p>
                      <p className="text-[10px] text-slate-400 truncate">{user.email}</p>
                    </div>
                    {isAdmin && <span className="text-[9px] px-1.5 py-0.5 bg-primary-100 text-primary-700 rounded-full font-bold shrink-0">ADMIN</span>}
                  </div>
                  {zonasAtivas.map(z => (
                    <div key={z.id} className="flex justify-center">
                      {isAdmin ? (
                        <span className="text-[9px] text-slate-300">bypass</span>
                      ) : (
                        <button onClick={() => toggleVinculo(user.id, z.id)}
                          className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all ${
                            userZonaIds.includes(z.id)
                              ? 'border-emerald-500 bg-emerald-50 text-emerald-600'
                              : 'border-slate-200 bg-white text-transparent hover:border-slate-400'
                          }`}>
                          <CheckCircle2 size={14}/>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )
            })}

            {usersFiltrados.length === 0 && (
              <div className="py-8 text-center text-slate-400 text-sm">Nenhum usuário encontrado</div>
            )}
          </div>

          <div className="px-5 py-3 bg-slate-50 border-t border-slate-100">
            <p className="text-[10px] text-slate-400">
              <strong>Sem zona atribuída</strong> = acesso livre de qualquer localização.
              <strong className="ml-2">Com zona(s)</strong> = precisa estar dentro de pelo menos uma zona para acessar.
              <strong className="ml-2">Admin</strong> = sempre tem acesso (bypass).
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
