import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { X, HardHat, User } from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '../../lib/store'
import { usePerfilStore } from '../../lib/perfilStore'
import { supabase } from '../../lib/supabase'
import { Obra } from '../../types'

interface Props { contratoId: string; obra?: Obra | null; onClose: () => void; onSaved: (o: Obra) => void }

interface FormData {
  nome_obra: string; local_obra: string; numero_contrato: string; orgao_subdivisao: string
  desconto_percentual: number; bdi_percentual: number; data_base_planilha: string
  prazo_execucao_dias: number; status: Obra['status']; centro_custo: string
}

interface PerfilResumo { id: string; nome: string; role: string }

export function ObraModal({ contratoId, obra, onClose, onSaved }: Props) {
  const { criarObra, atualizarObra } = useStore()
  const { perfilAtual } = usePerfilStore()
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    defaultValues: {
      nome_obra: '', local_obra: '', numero_contrato: '', orgao_subdivisao: '',
      desconto_percentual: 0, bdi_percentual: 25, data_base_planilha: '',
      prazo_execucao_dias: 120, status: 'ATIVA', centro_custo: '',
    }
  })

  const [engenheiros, setEngenheiros] = useState<PerfilResumo[]>([])
  const [engenheiroSel, setEngenheiroSel] = useState<string>('')
  const isGestorOrAdmin = perfilAtual?.role === 'ADMIN' || perfilAtual?.role === 'GESTOR' || perfilAtual?.role === 'SUPERADMIN'

  useEffect(() => {
    if (obra) {
      reset({
        nome_obra: obra.nome_obra, local_obra: obra.local_obra,
        numero_contrato: obra.numero_contrato || '',
        orgao_subdivisao: obra.orgao_subdivisao || '',
        desconto_percentual: obra.desconto_percentual * 100,
        bdi_percentual: obra.bdi_percentual * 100,
        data_base_planilha: obra.data_base_planilha || '',
        prazo_execucao_dias: obra.prazo_execucao_dias || 120,
        status: obra.status,
        centro_custo: obra.centro_custo || '',
      })
      setEngenheiroSel(obra.engenheiro_responsavel_id || '')
    }
    // Busca engenheiros da empresa
    supabase.from('perfis').select('id, nome, role').eq('ativo', true)
      .in('role', ['ENGENHEIRO', 'ADMIN'])
      .then(({ data }) => { if (data) setEngenheiros(data as PerfilResumo[]) })
  }, [obra])

  async function onSubmit(data: FormData) {
    try {
      const campos = {
        nome_obra: data.nome_obra,
        local_obra: data.local_obra,
        numero_contrato: data.numero_contrato || null,
        orgao_subdivisao: data.orgao_subdivisao || null,
        desconto_percentual: Number(data.desconto_percentual) / 100,
        bdi_percentual: Number(data.bdi_percentual) / 100,
        data_base_planilha: data.data_base_planilha || null,
        prazo_execucao_dias: Number(data.prazo_execucao_dias),
        status: data.status,
        centro_custo: data.centro_custo?.trim() || null,
        engenheiro_responsavel_id: engenheiroSel || null,
      }
      let salva: Obra
      if (obra) {
        await atualizarObra(obra.id, campos)
        salva = { ...obra, ...campos }
      } else {
        salva = await criarObra({ ...campos, contrato_id: contratoId, user_id: '', data_ordem_servico: null })
      }
      toast.success(obra ? 'Obra atualizada!' : 'Obra criada!')
      onSaved(salva)
      onClose()
    } catch { toast.error('Erro ao salvar obra') }
  }

  const field = "border border-slate-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 w-full"

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary-100 rounded-lg flex items-center justify-center">
              <HardHat size={18} className="text-primary-600" />
            </div>
            <h2 className="font-bold text-slate-800">{obra ? 'Editar Obra' : 'Nova Obra'}</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Nome da Obra *</label>
              <input {...register('nome_obra', { required: true })} placeholder="Ex: ESCOLA MUN. PADRE CÍCERO" className={field} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Local / Município *</label>
              <input {...register('local_obra', { required: true })} placeholder="Ex: Caicó/RN" className={field} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Nº do Contrato/OS</label>
              <input {...register('numero_contrato')} placeholder="Ex: 04/2025" className={field} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Desconto (%)</label>
              <input type="number" step="0.01" {...register('desconto_percentual')} className={field} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">BDI (%)</label>
              <input type="number" step="0.01" {...register('bdi_percentual')} className={field} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Data Base Planilha</label>
              <input {...register('data_base_planilha')} placeholder="Ex: SINAPI 01/2025" className={field} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Prazo (dias)</label>
              <input type="number" {...register('prazo_execucao_dias')} className={field} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Status</label>
              <select {...register('status')} className={field}>
                <option value="ATIVA">ATIVA</option>
                <option value="SUSPENSA">SUSPENSA</option>
                <option value="CONCLUIDA">CONCLUÍDA</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Centro de Custo (TOTVS RM)</label>
              <input {...register('centro_custo')} placeholder="Ex: 4.15.004" className={field} />
              <p className="text-[10px] text-slate-400 mt-0.5">Código do centro de custo no TOTVS RM — usado para importação automática de custos</p>
            </div>
            {isGestorOrAdmin && (
              <div className="col-span-2">
                <label className="text-xs font-semibold text-slate-600 mb-1 block flex items-center gap-1.5">
                  <User size={12} className="text-primary-500"/> Engenheiro Responsável
                </label>
                <select value={engenheiroSel} onChange={e => setEngenheiroSel(e.target.value)} className={field}>
                  <option value="">— Nenhum (definir depois) —</option>
                  {engenheiros.map(e => (
                    <option key={e.id} value={e.id}>{e.nome} ({e.role})</option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-0.5">Define quem é responsável por esta obra. O engenheiro terá acesso direto à obra.</p>
              </div>
            )}
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
              Cancelar
            </button>
            <button type="submit" disabled={isSubmitting}
              className="flex-1 px-4 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
              {isSubmitting ? 'Salvando...' : obra ? 'Salvar Alterações' : 'Criar Obra'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
