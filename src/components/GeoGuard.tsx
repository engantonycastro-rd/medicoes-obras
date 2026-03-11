import { useEffect, useState } from 'react'
import { MapPin, Shield, RefreshCw, LogOut, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { usePerfilStore } from '../lib/perfilStore'

interface Zona {
  id: string; nome: string; tipo: 'ESCRITORIO' | 'CIDADE'
  latitude: number | null; longitude: number | null; raio_metros: number
  estado: string | null; cidade: string | null
}

// Haversine distance in meters
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(a))
}

// Geocoding reverso via API gratuita
async function getCidadeEstado(lat: number, lng: number): Promise<{ cidade: string; estado: string } | null> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=pt-BR`, {
      headers: { 'User-Agent': 'MediObras/1.0' }
    })
    const data = await res.json()
    const addr = data.address || {}
    return {
      cidade: addr.city || addr.town || addr.municipality || addr.village || '',
      estado: addr.state_code || addr.state || '',
    }
  } catch { return null }
}

export function GeoGuard({ children }: { children: React.ReactNode }) {
  const { perfilAtual } = usePerfilStore()
  const [status, setStatus] = useState<'checking' | 'allowed' | 'blocked' | 'no-gps' | 'error'>('checking')
  const [motivo, setMotivo] = useState('')
  const [zonas, setZonas] = useState<Zona[]>([])

  useEffect(() => {
    if (!perfilAtual) return
    // Admins sempre passam
    if (perfilAtual.role === 'ADMIN') { setStatus('allowed'); return }
    verificarAcesso()
  }, [perfilAtual])

  async function verificarAcesso() {
    try {
      // 1. Busca zonas atribuídas ao usuário
      const { data: vinculos } = await supabase
        .from('usuario_zonas')
        .select('zona_id, zonas_acesso(*)')
        .eq('user_id', perfilAtual!.id)

      // Se erro na query (tabela não existe ainda), permite acesso
      if (!vinculos) { setStatus('allowed'); return }

      const zonasAtivas = (vinculos || [])
        .map((v: any) => v.zonas_acesso)
        .filter((z: any) => z && z.ativo) as Zona[]

      // Sem zonas atribuídas = acesso livre
      if (zonasAtivas.length === 0) { setStatus('allowed'); return }

      setZonas(zonasAtivas)

      // 2. Pede geolocalização do browser
      if (!navigator.geolocation) {
        setStatus('no-gps')
        setMotivo('Seu navegador não suporta geolocalização.')
        return
      }

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude
          const lng = pos.coords.longitude

          // 3. Verifica cada zona
          for (const zona of zonasAtivas) {
            if (zona.tipo === 'ESCRITORIO' && zona.latitude && zona.longitude) {
              const dist = haversine(lat, lng, zona.latitude, zona.longitude)
              if (dist <= zona.raio_metros) { setStatus('allowed'); return }
            }

            if (zona.tipo === 'CIDADE' && zona.estado) {
              const geo = await getCidadeEstado(lat, lng)
              if (geo) {
                const estadoMatch = geo.estado.toLowerCase().includes(zona.estado.toLowerCase()) ||
                  zona.estado.toLowerCase().includes(geo.estado.toLowerCase())
                const cidadeMatch = !zona.cidade ||
                  geo.cidade.toLowerCase().includes(zona.cidade.toLowerCase()) ||
                  zona.cidade.toLowerCase().includes(geo.cidade.toLowerCase())
                if (estadoMatch && cidadeMatch) { setStatus('allowed'); return }
              }
            }
          }

          // Nenhuma zona bateu
          setStatus('blocked')
          setMotivo(`Sua localização (${lat.toFixed(4)}, ${lng.toFixed(4)}) está fora das zonas de acesso permitidas.`)
        },
        (err) => {
          if (err.code === 1) {
            setStatus('no-gps')
            setMotivo('Permissão de localização negada. Habilite o GPS e permita o acesso à localização no navegador.')
          } else {
            setStatus('no-gps')
            setMotivo('Não foi possível obter sua localização. Verifique o GPS.')
          }
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
      )
    } catch (err) {
      console.error('Erro GeoGuard:', err)
      // Em caso de erro, permite acesso (fail-open para não bloquear produção)
      setStatus('allowed')
    }
  }

  if (status === 'checking') return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-4">
      <MapPin size={32} className="text-amber-400 animate-pulse"/>
      <p className="text-slate-400 text-sm">Verificando localização...</p>
    </div>
  )

  if (status === 'blocked') return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-800 border border-red-500/30 rounded-2xl p-8 max-w-md w-full text-center">
        <div className="w-14 h-14 bg-red-500/20 rounded-xl flex items-center justify-center mx-auto mb-4">
          <Shield size={28} className="text-red-400"/>
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Acesso Bloqueado</h2>
        <p className="text-slate-400 text-sm mb-4">
          Você está fora da zona de acesso permitida.
        </p>
        <p className="text-xs text-slate-500 mb-2">{motivo}</p>
        {zonas.length > 0 && (
          <div className="bg-slate-700/50 rounded-lg p-3 mb-5 text-left">
            <p className="text-xs text-slate-400 font-semibold mb-1.5">Zonas permitidas:</p>
            {zonas.map(z => (
              <p key={z.id} className="text-xs text-slate-300 flex items-center gap-1.5 py-0.5">
                <MapPin size={10} className="text-amber-400"/>
                {z.nome}
                <span className="text-slate-500">
                  {z.tipo === 'ESCRITORIO' ? `(${z.raio_metros}m de raio)` : `(${z.cidade || ''} - ${z.estado || ''})`}
                </span>
              </p>
            ))}
          </div>
        )}
        <div className="flex gap-3">
          <button onClick={verificarAcesso}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium">
            <RefreshCw size={14}/> Tentar novamente
          </button>
          <button onClick={() => supabase.auth.signOut()}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm">
            <LogOut size={14}/> Sair
          </button>
        </div>
      </div>
    </div>
  )

  if (status === 'no-gps') return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-800 border border-amber-500/30 rounded-2xl p-8 max-w-md w-full text-center">
        <div className="w-14 h-14 bg-amber-500/20 rounded-xl flex items-center justify-center mx-auto mb-4">
          <AlertTriangle size={28} className="text-amber-400"/>
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Localização Necessária</h2>
        <p className="text-slate-400 text-sm mb-4">{motivo}</p>
        <p className="text-xs text-slate-500 mb-5">
          Seu administrador configurou restrição de acesso por localização. 
          Permita o GPS no navegador para continuar.
        </p>
        <div className="flex gap-3">
          <button onClick={verificarAcesso}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium">
            <RefreshCw size={14}/> Tentar novamente
          </button>
          <button onClick={() => supabase.auth.signOut()}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm">
            <LogOut size={14}/> Sair
          </button>
        </div>
      </div>
    </div>
  )

  return <>{children}</>
}