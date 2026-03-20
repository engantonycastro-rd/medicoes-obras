import { useEffect, useState, useRef } from 'react'
import {
  MapPin, Building2, Filter, Loader2, User, Calendar, Eye, ExternalLink,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { usePerfilStore } from '../lib/perfilStore'
import { supabase } from '../lib/supabase'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

interface ObraMapa {
  id: string; nome_obra: string; local_obra: string; status: string
  latitude: number; longitude: number
  engenheiro_responsavel_id: string | null; contrato_id: string
  contrato_nome?: string; engenheiro_nome?: string
  data_ordem_servico?: string | null
}

const STATUS_CONFIG: Record<string, { label: string; color: string; hex: string }> = {
  ATIVA:      { label: 'Ativa',      color: 'bg-emerald-500', hex: '#22C55E' },
  CONCLUIDA:  { label: 'Concluída',  color: 'bg-blue-500',    hex: '#3B82F6' },
  SUSPENSA:   { label: 'Paralisada', color: 'bg-red-500',     hex: '#EF4444' },
  PARA_INICIAR: { label: 'Para Iniciar', color: 'bg-slate-400', hex: '#9CA3AF' },
}

function formatCurrency(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

function createIcon(hex: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="40" viewBox="0 0 28 40">
    <path d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.3 21.7 0 14 0z" fill="${hex}" stroke="#fff" stroke-width="2"/>
    <circle cx="14" cy="14" r="6" fill="#fff"/>
  </svg>`
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [28, 40],
    iconAnchor: [14, 40],
    popupAnchor: [0, -40],
  })
}

export function MapaObrasPage() {
  const { perfilAtual } = usePerfilStore()
  const isAdmin = perfilAtual?.role === 'ADMIN' || perfilAtual?.role === 'SUPERADMIN'
  const isGestor = perfilAtual?.role === 'GESTOR'

  const [obras, setObras] = useState<ObraMapa[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<string>('TODAS')
  const [financeiro, setFinanceiro] = useState<Record<string, { custo: number; faturamento: number }>>({})

  const mapRef = useRef<L.Map | null>(null)
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const markersRef = useRef<L.LayerGroup | null>(null)

  useEffect(() => { fetchObras() }, [])

  useEffect(() => {
    if (!loading && obras.length > 0 && mapContainerRef.current && !mapRef.current) {
      initMap()
    }
  }, [loading, obras])

  useEffect(() => {
    if (mapRef.current) updateMarkers()
  }, [filtro, obras, financeiro])

  async function fetchObras() {
    setLoading(true)
    try {
      const [obrasRes, perfisRes, contratosRes, gestoresRes] = await Promise.all([
        supabase.from('obras').select('id, nome_obra, local_obra, status, latitude, longitude, engenheiro_responsavel_id, contrato_id, data_ordem_servico')
          .not('latitude', 'is', null).not('longitude', 'is', null),
        supabase.from('perfis').select('id, nome, role').eq('ativo', true),
        supabase.from('contratos').select('id, nome_obra'),
        supabase.from('contrato_gestores').select('contrato_id, gestor_id'),
      ])

      let allObras = (obrasRes.data || []) as ObraMapa[]
      const perfis = (perfisRes.data || []) as { id: string; nome: string; role: string }[]
      const contratos = contratosRes.data || []
      const gestores = gestoresRes.data || []

      const cMap = new Map(contratos.map((c: any) => [c.id, c.nome_obra]))
      const pMap = new Map(perfis.map(p => [p.id, p.nome]))

      allObras.forEach(o => {
        o.contrato_nome = cMap.get(o.contrato_id) || ''
        o.engenheiro_nome = o.engenheiro_responsavel_id ? (pMap.get(o.engenheiro_responsavel_id) || '') : ''
      })

      // Filtro de visibilidade por role
      if (perfilAtual?.role === 'ENGENHEIRO') {
        allObras = allObras.filter(o => o.engenheiro_responsavel_id === perfilAtual.id)
      } else if (perfilAtual?.role === 'GESTOR') {
        const meusContratos = gestores.filter((g: any) => g.gestor_id === perfilAtual.id).map((g: any) => g.contrato_id)
        allObras = allObras.filter(o => meusContratos.includes(o.contrato_id))
      }

      setObras(allObras)

      // Fetch financeiro
      const obraIds = allObras.map(o => o.id)
      if (obraIds.length > 0) {
        const { data: custosData } = await supabase.from('custos_erp')
          .select('obra_id, tipo_lancamento, valor_liquido')
          .in('obra_id', obraIds)
        if (custosData) {
          const finMap: Record<string, { custo: number; faturamento: number }> = {}
          for (const r of custosData as any[]) {
            if (!finMap[r.obra_id]) finMap[r.obra_id] = { custo: 0, faturamento: 0 }
            if (r.tipo_lancamento === 'A_RECEBER') finMap[r.obra_id].faturamento += Number(r.valor_liquido) || 0
            else finMap[r.obra_id].custo += Number(r.valor_liquido) || 0
          }
          setFinanceiro(finMap)
        }
      }
    } catch (err: any) { toast.error(err.message || 'Erro ao carregar obras') }
    setLoading(false)
  }

  function initMap() {
    if (!mapContainerRef.current || mapRef.current) return

    // Centro no RN por padrão
    const center: [number, number] = obras.length > 0
      ? [obras[0].latitude, obras[0].longitude]
      : [-5.79, -35.21]

    const map = L.map(mapContainerRef.current, { zoomControl: true }).setView(center, 8)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(map)

    markersRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    updateMarkers()

    // Fit bounds
    if (obras.length > 1) {
      const bounds = L.latLngBounds(obras.map(o => [o.latitude, o.longitude]))
      map.fitBounds(bounds, { padding: [40, 40] })
    }
  }

  function updateMarkers() {
    if (!markersRef.current || !mapRef.current) return
    markersRef.current.clearLayers()

    const filtradas = filtro === 'TODAS' ? obras : obras.filter(o => o.status === filtro)

    for (const obra of filtradas) {
      const cfg = STATUS_CONFIG[obra.status] || STATUS_CONFIG.ATIVA
      const icon = createIcon(cfg.hex)
      const fin = financeiro[obra.id] || { custo: 0, faturamento: 0 }

      const popupHtml = `
        <div style="min-width:220px;font-family:system-ui,sans-serif;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
            <strong style="font-size:13px;flex:1;">${obra.nome_obra}</strong>
            <span style="font-size:9px;padding:2px 8px;background:${cfg.hex}22;color:${cfg.hex};border-radius:4px;font-weight:600;">${cfg.label}</span>
          </div>
          <div style="font-size:11px;color:#666;line-height:1.8;">
            📍 ${obra.local_obra}<br>
            🏢 ${obra.contrato_nome || '—'}<br>
            ${obra.engenheiro_nome ? `👷 ${obra.engenheiro_nome}<br>` : ''}
            ${obra.data_ordem_servico ? `📅 Início: ${new Date(obra.data_ordem_servico + 'T12:00:00').toLocaleDateString('pt-BR')}<br>` : ''}
          </div>
          ${(fin.faturamento > 0 || fin.custo > 0) ? `
          <div style="border-top:1px solid #eee;margin-top:8px;padding-top:8px;display:flex;gap:12px;font-size:10px;">
            <div><span style="color:#999;">Faturado</span><br><strong style="color:#059669;font-size:12px;">${formatCurrency(fin.faturamento)}</strong></div>
            <div><span style="color:#999;">Custo</span><br><strong style="color:#DC2626;font-size:12px;">${formatCurrency(fin.custo)}</strong></div>
          </div>` : ''}
          <div style="margin-top:8px;display:flex;gap:6px;">
            <a href="https://www.google.com/maps?q=${obra.latitude},${obra.longitude}" target="_blank"
              style="flex:1;padding:5px;background:#D1FAE5;color:#065F46;border-radius:6px;text-align:center;font-size:9px;font-weight:600;text-decoration:none;">Google Maps</a>
          </div>
        </div>
      `

      const marker = L.marker([obra.latitude, obra.longitude], { icon })
        .bindPopup(popupHtml, { maxWidth: 280 })
        .bindTooltip(obra.nome_obra, { direction: 'top', offset: [0, -40] })

      markersRef.current!.addLayer(marker)
    }
  }

  function focusObra(obra: ObraMapa) {
    if (!mapRef.current) return
    mapRef.current.setView([obra.latitude, obra.longitude], 14)
    // Open popup of this marker
    markersRef.current?.eachLayer((layer: any) => {
      if (layer.getLatLng && layer.getLatLng().lat === obra.latitude && layer.getLatLng().lng === obra.longitude) {
        layer.openPopup()
      }
    })
  }

  const filtradas = filtro === 'TODAS' ? obras : obras.filter(o => o.status === filtro)
  const countByStatus: Record<string, number> = {}
  for (const o of obras) countByStatus[o.status] = (countByStatus[o.status] || 0) + 1

  return (
    <div className="p-6 max-w-full" style={{ height: '100%' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <MapPin size={24} className="text-emerald-500"/> Mapa de Obras
          </h1>
          <p className="text-sm text-slate-500">{obras.length} obra(s) com localização definida</p>
        </div>
      </div>

      {/* Filtros de status */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button onClick={() => setFiltro('TODAS')}
          className={`text-xs px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all ${
            filtro === 'TODAS' ? 'bg-slate-800 text-white' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
          }`}>
          <Building2 size={12}/> Todas ({obras.length})
        </button>
        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
          <button key={key} onClick={() => setFiltro(key)}
            className={`text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-all ${
              filtro === key ? 'bg-slate-800 text-white' : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
            }`}>
            <span className={`w-2 h-2 rounded-full ${cfg.color}`}/> {cfg.label} ({countByStatus[key] || 0})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24"><Loader2 size={28} className="animate-spin text-emerald-500"/></div>
      ) : obras.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
          <MapPin size={36} className="mx-auto text-slate-300 mb-3"/>
          <p className="text-slate-500">Nenhuma obra com localização cadastrada</p>
          <p className="text-xs text-slate-400 mt-1">Edite a obra e preencha latitude/longitude</p>
        </div>
      ) : (
        <div className="flex gap-0 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden" style={{ height: 'calc(100vh - 220px)' }}>
          {/* Mapa */}
          <div className="flex-[2] relative">
            <div ref={mapContainerRef} className="w-full h-full"/>
          </div>

          {/* Sidebar lista */}
          <div className="flex-[0.8] border-l border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-y-auto">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800 z-10">
              <p className="text-xs font-semibold text-slate-500">{filtro === 'TODAS' ? 'Todas as obras' : STATUS_CONFIG[filtro]?.label || filtro} ({filtradas.length})</p>
            </div>
            {filtradas.map(obra => {
              const cfg = STATUS_CONFIG[obra.status] || STATUS_CONFIG.ATIVA
              return (
                <div key={obra.id} onClick={() => focusObra(obra)}
                  className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer transition-colors">
                  <div className="flex items-start gap-2.5">
                    <span className={`w-2.5 h-2.5 rounded-full ${cfg.color} mt-1 shrink-0`}/>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-xs text-slate-800 dark:text-white truncate">{obra.nome_obra}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {obra.local_obra} · {cfg.label}
                      </p>
                      {obra.engenheiro_nome && (
                        <p className="text-[10px] text-slate-400 flex items-center gap-0.5 mt-0.5">
                          <User size={8}/> {obra.engenheiro_nome}
                        </p>
                      )}
                    </div>
                    <button className="p-1 text-slate-300 hover:text-primary-500 shrink-0"><Eye size={13}/></button>
                  </div>
                </div>
              )
            })}
            {filtradas.length === 0 && (
              <div className="text-center py-8 text-xs text-slate-400">Nenhuma obra neste filtro</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
