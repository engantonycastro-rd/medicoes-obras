import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { X, Users, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useStore } from '../../lib/store'
import { usePerfilStore } from '../../lib/perfilStore'
import { Contrato, Perfil } from '../../types'
import { supabase } from '../../lib/supabase'

interface Props { contrato: Contrato | null; onClose: () => void }

const ESTADOS = [
  {uf:'AC',nome:'Acre'},{uf:'AL',nome:'Alagoas'},{uf:'AP',nome:'Amapá'},{uf:'AM',nome:'Amazonas'},
  {uf:'BA',nome:'Bahia'},{uf:'CE',nome:'Ceará'},{uf:'DF',nome:'Distrito Federal'},
  {uf:'ES',nome:'Espírito Santo'},{uf:'GO',nome:'Goiás'},{uf:'MA',nome:'Maranhão'},
  {uf:'MT',nome:'Mato Grosso'},{uf:'MS',nome:'Mato Grosso do Sul'},{uf:'MG',nome:'Minas Gerais'},
  {uf:'PA',nome:'Pará'},{uf:'PB',nome:'Paraíba'},{uf:'PR',nome:'Paraná'},{uf:'PE',nome:'Pernambuco'},
  {uf:'PI',nome:'Piauí'},{uf:'RJ',nome:'Rio de Janeiro'},{uf:'RN',nome:'Rio Grande do Norte'},
  {uf:'RS',nome:'Rio Grande do Sul'},{uf:'RO',nome:'Rondônia'},{uf:'RR',nome:'Roraima'},
  {uf:'SC',nome:'Santa Catarina'},{uf:'SP',nome:'São Paulo'},{uf:'SE',nome:'Sergipe'},{uf:'TO',nome:'Tocantins'},
]

interface FormData {
  nome_obra: string; numero_contrato: string; tipo: 'ESTADO' | 'PREFEITURA'
  orgao_nome: string; orgao_subdivisao: string; empresa_executora: string
  data_base_planilha: string; data_ordem_servico: string
  prazo_execucao_dias: number; status: string
  estado: string; cidade: string
  valor_contrato: string; data_validade: string
}

export function ContratoModal({ contrato, onClose }: Props) {
  const { criarContrato, atualizarContrato, fetchContratos } = useStore()
  const { perfilAtual, perfis, fetchTodosPerfis } = usePerfilStore()
  const isAdmin = perfilAtual?.role === 'ADMIN'
  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<FormData>()

  const [gestoresSelecionados, setGestoresSelecionados] = useState<string[]>([])
  const [gestoresAtuais, setGestoresAtuais] = useState<string[]>([])

  const gestores = perfis.filter(p => p.role === 'GESTOR' && p.ativo)

  useEffect(() => {
    if (isAdmin) fetchTodosPerfis()
  }, [])

  useEffect(() => {
    if (contrato) {
      reset({
        nome_obra: contrato.nome_obra,
        numero_contrato: contrato.numero_contrato || '',
        tipo: contrato.tipo,
        orgao_nome: contrato.orgao_nome,
        orgao_subdivisao: contrato.orgao_subdivisao || '',
        empresa_executora: contrato.empresa_executora,
        data_base_planilha: contrato.data_base_planilha || '',
        data_ordem_servico: contrato.data_ordem_servico || '',
        prazo_execucao_dias: contrato.prazo_execucao_dias || 120,
        status: contrato.status,
        estado: contrato.estado || '',
        cidade: contrato.cidade || '',
        valor_contrato: contrato.valor_contrato ? String(contrato.valor_contrato) : '',
        data_validade: contrato.data_validade || '',
      })
      // Carrega gestores atribuídos
      supabase.from('contrato_gestores').select('gestor_id').eq('contrato_id', contrato.id)
        .then(({ data }) => {
          const ids = (data || []).map((r: any) => r.gestor_id)
          setGestoresSelecionados(ids)
          setGestoresAtuais(ids)
        })
    } else {
      reset({
        tipo: 'ESTADO', status: 'ATIVO',
        orgao_nome: 'SECRETARIA DE ESTADO DA EDUCAÇÃO, DA CULTURA, DO ESPORTE E DO LAZER - SEEC',
        orgao_subdivisao: 'SUBCOORDENADORIA DE MANUTENÇÃO E CONSTRUÇÃO ESCOLAR',
        prazo_execucao_dias: 120, estado: 'RN', cidade: '',
        empresa_executora: '', nome_obra: '', numero_contrato: '',
        data_base_planilha: '', data_ordem_servico: '',
        valor_contrato: '', data_validade: '',
      })
      setGestoresSelecionados([])
      setGestoresAtuais([])
    }
  }, [contrato])

  function toggleGestor(id: string) {
    setGestoresSelecionados(prev => prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id])
  }

  async function onSubmit(data: FormData) {
    try {
      const payload = {
        ...data,
        local_obra: data.cidade ? `${data.cidade}/${data.estado}` : data.estado || '',
        desconto_percentual: contrato?.desconto_percentual ?? 0,
        bdi_percentual: contrato?.bdi_percentual ?? 0,
        prazo_execucao_dias: Number(data.prazo_execucao_dias),
        numero_contrato: data.numero_contrato || null,
        orgao_subdivisao: data.orgao_subdivisao || null,
        data_base_planilha: data.data_base_planilha || null,
        data_ordem_servico: data.data_ordem_servico || null,
        estado: data.estado || null,
        cidade: data.cidade || null,
        valor_contrato: Number(String(data.valor_contrato).replace(/[^\d.,]/g, '').replace(',', '.')) || 0,
        data_validade: data.data_validade || null,
      }

      let contratoId: string
      if (contrato) {
        await atualizarContrato(contrato.id, payload)
        contratoId = contrato.id
      } else {
        const novo = await criarContrato(payload)
        contratoId = novo.id
      }

      // Atualiza gestores (separado — não bloqueia a criação)
      if (isAdmin && gestores.length > 0) {
        try {
          const add = gestoresSelecionados.filter(g => !gestoresAtuais.includes(g))
          const rem = gestoresAtuais.filter(g => !gestoresSelecionados.includes(g))

          for (const gid of rem) {
            await supabase.from('contrato_gestores').delete().eq('contrato_id', contratoId).eq('gestor_id', gid)
          }
          if (add.length > 0) {
            await supabase.from('contrato_gestores').insert(
              add.map(gid => ({ contrato_id: contratoId, gestor_id: gid }))
            )
            for (const gid of add) {
              try {
                await supabase.rpc('criar_notificacao', {
                  p_user_id: gid, p_tipo: 'info',
                  p_titulo: `Novo contrato atribuído: ${data.nome_obra}`,
                  p_mensagem: `Você foi designado como gestor do contrato "${data.nome_obra}" (${data.cidade || data.estado || ''}).`,
                  p_link: '/',
                })
              } catch (notifErr) {
                console.warn('Erro ao notificar gestor:', notifErr)
              }
            }
          }
        } catch (gestorErr) {
          console.warn('Erro ao atribuir gestores (contrato foi criado):', gestorErr)
        }
      }

      toast.success(contrato ? 'Contrato atualizado!' : 'Contrato criado!')
      await fetchContratos()
      onClose()
    } catch {
      toast.error('Erro ao salvar contrato')
    }
  }

  const cls = "w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{contrato ? 'Editar Contrato' : 'Novo Contrato'}</h2>
            <p className="text-sm text-slate-400 mt-0.5">Preencha os dados do contrato</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100"><X size={18}/></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-5">
          {/* Tipo */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Tipo de Contrato</label>
            <select {...register('tipo', { required: true })} className={cls}>
              <option value="ESTADO">Estado</option>
              <option value="PREFEITURA">Prefeitura</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Nome do Contrato *</label>
              <input {...register('nome_obra', { required: 'Obrigatório' })} placeholder="Ex: PREF/JACOBINA" className={cls}/>
              {errors.nome_obra && <p className="text-xs text-red-500 mt-1">{errors.nome_obra.message}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Nº do Contrato</label>
              <input {...register('numero_contrato')} placeholder="Ex: 04/2025" className={cls}/>
            </div>
          </div>

          {/* Estado + Cidade */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Estado *</label>
              <select {...register('estado', { required: 'Selecione o estado' })} className={cls}>
                <option value="">Selecione...</option>
                {ESTADOS.map(e => <option key={e.uf} value={e.uf}>{e.uf} — {e.nome}</option>)}
              </select>
              {errors.estado && <p className="text-xs text-red-500 mt-1">{errors.estado.message}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Cidade</label>
              <input {...register('cidade')} placeholder="Ex: Jacobina" className={cls}/>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Empresa Executora *</label>
              <input {...register('empresa_executora', { required: true })} placeholder="RD Soluções" className={cls}/>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Órgão Contratante *</label>
              <input {...register('orgao_nome', { required: true })} className={cls}/>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Subdivisão do Órgão</label>
            <input {...register('orgao_subdivisao')} className={cls}/>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Data Base Planilha</label>
              <input {...register('data_base_planilha')} placeholder="SINAPI 01/2025" className={cls}/>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Data O.S.</label>
              <input type="date" {...register('data_ordem_servico')} className={cls}/>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Prazo (dias)</label>
              <input type="number" {...register('prazo_execucao_dias')} className={cls}/>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Valor do Contrato (R$)</label>
              <input {...register('valor_contrato')} placeholder="Ex: 5000000.00" className={cls}/>
              <p className="text-[10px] text-slate-400 mt-0.5">Valor total do contrato firmado</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Data de Validade</label>
              <input type="date" {...register('data_validade')} className={cls}/>
              <p className="text-[10px] text-slate-400 mt-0.5">Prazo de vigência do contrato</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
            <select {...register('status')} className={cls}>
              <option value="ATIVO">Ativo</option>
              <option value="CONCLUIDO">Concluído</option>
              <option value="SUSPENSO">Suspenso</option>
            </select>
          </div>

          {/* Gestores — admin only */}
          {isAdmin && gestores.length > 0 && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
              <p className="text-xs font-bold text-purple-800 mb-2 flex items-center gap-1.5">
                <Users size={13}/> Gestores responsáveis
              </p>
              <p className="text-[10px] text-purple-600 mb-3">
                Selecione quais gestores terão acesso a este contrato e suas obras. Se nenhum for selecionado, o contrato segue a visibilidade padrão.
              </p>
              <div className="space-y-1.5">
                {gestores.map(g => (
                  <button key={g.id} type="button" onClick={() => toggleGestor(g.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm transition-all ${
                      gestoresSelecionados.includes(g.id)
                        ? 'bg-purple-200 border border-purple-300 text-purple-900 font-medium'
                        : 'bg-white border border-purple-100 text-slate-600 hover:border-purple-300'
                    }`}>
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                      gestoresSelecionados.includes(g.id)
                        ? 'border-purple-600 bg-purple-600' : 'border-slate-300'
                    }`}>
                      {gestoresSelecionados.includes(g.id) && <CheckCircle2 size={12} className="text-white"/>}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{g.nome || g.email}</p>
                      <p className="text-[10px] text-slate-400">{g.email}</p>
                    </div>
                  </button>
                ))}
              </div>
              {gestoresSelecionados.length > 0 && (
                <p className="text-[10px] text-purple-600 mt-2 font-medium">
                  {gestoresSelecionados.length} gestor(es) selecionado(s)
                  {gestoresSelecionados.length > 1 && ' — contrato compartilhado'}
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
            <button type="submit" disabled={isSubmitting}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg text-sm disabled:opacity-50">
              {isSubmitting ? 'Salvando...' : contrato ? 'Atualizar' : 'Criar Contrato'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}