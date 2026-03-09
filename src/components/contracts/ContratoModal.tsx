import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '../../lib/store'
import { Contrato } from '../../types'

interface Props {
  contrato: Contrato | null
  onClose: () => void
}

type FormData = Omit<Contrato, 'id' | 'created_at' | 'updated_at'>

export function ContratoModal({ contrato, onClose }: Props) {
  const { criarContrato, atualizarContrato, fetchContratos } = useStore()
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>()

  useEffect(() => {
    if (contrato) {
      reset({
        ...contrato,
        desconto_percentual: contrato.desconto_percentual,
        bdi_percentual: contrato.bdi_percentual,
      })
    } else {
      reset({
        tipo: 'ESTADO',
        status: 'ATIVO',
        orgao_nome: 'SECRETARIA DE ESTADO DA EDUCAÇÃO, DA CULTURA, DO ESPORTE E DO LAZER - SEEC',
        orgao_subdivisao: 'SUBCOORDENADORIA DE MANUTENÇÃO E CONSTRUÇÃO ESCOLAR',
        desconto_percentual: 0.0429,
        bdi_percentual: 0.30091,
        prazo_execucao_dias: 120,
      })
    }
  }, [contrato])

  async function onSubmit(data: FormData) {
    try {
      // Converte strings para números
      const payload = {
        ...data,
        desconto_percentual: Number(data.desconto_percentual),
        bdi_percentual: Number(data.bdi_percentual),
        prazo_execucao_dias: Number(data.prazo_execucao_dias),
      }

      if (contrato) {
        await atualizarContrato(contrato.id, payload)
        toast.success('Contrato atualizado!')
      } else {
        await criarContrato(payload)
        toast.success('Contrato criado!')
      }
      await fetchContratos()
      onClose()
    } catch {
      toast.error('Erro ao salvar contrato')
    }
  }

  const field = (
    name: keyof FormData,
    label: string,
    opts?: {
      type?: string
      required?: boolean
      placeholder?: string
      step?: string
    }
  ) => (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <input
        {...register(name, { required: opts?.required ? 'Campo obrigatório' : false })}
        type={opts?.type || 'text'}
        step={opts?.step}
        placeholder={opts?.placeholder}
        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm
          focus:outline-none focus:ring-2 focus:ring-amber-400"
      />
      {errors[name] && (
        <p className="text-xs text-red-500 mt-1">{errors[name]?.message as string}</p>
      )}
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">
              {contrato ? 'Editar Contrato' : 'Novo Contrato'}
            </h2>
            <p className="text-sm text-slate-400 mt-0.5">Preencha os dados do contrato</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 transition-all">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-5">
          {/* Tipo */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Tipo de Contrato</label>
            <select
              {...register('tipo', { required: true })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm
                focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="ESTADO">Estado</option>
              <option value="PREFEITURA">Prefeitura</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {field('nome_obra', 'Nome do Contrato', { required: true, placeholder: 'E.E. CEL. Manoel Medeiros II' })}
            {field('local_obra', 'Local/Município', { required: true, placeholder: 'Japi/RN' })}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {field('numero_contrato', 'Número do Contrato', { placeholder: 'Nº do contrato' })}
            {field('empresa_executora', 'Empresa Executora', { required: true, placeholder: 'RD Soluções' })}
          </div>

          {field('orgao_nome', 'Órgão Contratante', { required: true })}
          {field('orgao_subdivisao', 'Subdivisão do Órgão')}

          <div className="grid grid-cols-2 gap-4">
            {field('data_base_planilha', 'Data Base da Planilha', { placeholder: 'SINAPI 01/2025' })}
            {field('data_ordem_servico', 'Data da Ordem de Serviço', { type: 'date' })}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Desconto (%)</label>
              <input
                {...register('desconto_percentual', { required: true })}
                type="number" step="0.0001"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm
                  focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <p className="text-xs text-slate-400 mt-1">Ex: 0.0429 = 4,29%</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">BDI (%)</label>
              <input
                {...register('bdi_percentual', { required: true })}
                type="number" step="0.00001"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm
                  focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <p className="text-xs text-slate-400 mt-1">Ex: 0.30091</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Prazo de Execução (dias)</label>
              <input
                {...register('prazo_execucao_dias', { required: true })}
                type="number"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm
                  focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
              <select
                {...register('status')}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm
                  focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                <option value="ATIVO">Ativo</option>
                <option value="CONCLUIDO">Concluído</option>
                <option value="SUSPENSO">Suspenso</option>
              </select>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-all">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium
                rounded-lg text-sm transition-all disabled:opacity-50"
            >
              {isSubmitting ? 'Salvando...' : contrato ? 'Atualizar' : 'Criar Contrato'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}