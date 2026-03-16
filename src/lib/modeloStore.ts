/**
 * modeloStore — armazena e persiste os modelos de planilha de medição.
 *
 * Cada modelo define as paletas de cores, fontes, bordas e comportamentos
 * visuais que serão aplicados na exportação Excel e PDF.
 *
 * Os dois modelos padrão (ESTADO e PREFEITURA) vêm pré-carregados e podem
 * ser editados pelo Admin. Novos modelos podem ser criados a partir de um
 * dos padrões como base.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ─── TIPOS ────────────────────────────────────────────────────────────────────

export type BorderStyle = 'thin' | 'medium' | 'thick' | 'none'
export type FontName    = 'Arial' | 'Arial Narrow' | 'Calibri' | 'Times New Roman'

export interface PaletaCor {
  /** Hex sem # e sem FF prefix — ex: "1F3864" */
  valor: string
  /** Rótulo amigável para o editor */
  label: string
}

export interface EstiloColuna {
  largura: number  // mm/characters no Excel
  cor_fundo?: string
  cor_texto?: string
  negrito?: boolean
  tamanho_fonte?: number
}

export interface ModeloPlanilha {
  id: string
  nome: string
  descricao: string
  /** "ESTADO" | "PREFEITURA" | custom uuid */
  base: 'ESTADO' | 'PREFEITURA' | string
  /** Se true, não pode ser deletado */
  builtin: boolean
  /** ISO string da última edição */
  editado_em: string

  // ── Paleta principal ──────────────────────────────────────────────────────
  cores: {
    // Cabeçalho
    hdr_topo:        string  // faixa topo (laranja/verde escuro)
    hdr_principal:   string  // órgão/nome grande (azul escuro / verde escuro)
    hdr_sub:         string  // subdivisão (azul médio / verde)
    hdr_cabec:       string  // bloco informações (azul claro / verde claro)

    // Tabela — base
    th_base:         string  // colunas PLANILHA BASE (azul escuro / verde escuro)
    th_medicao:      string  // colunas PLANILHA MEDIÇÃO (azul médio / verde)

    // Tabela — dados
    linha_grupo:     string  // linhas de grupo/etapa
    linha_par:       string  // linhas pares (branco/quase branco)
    linha_impar:     string  // linhas ímpares (branco)
    linha_periodo:   string  // célula com medição no período
    linha_100pct:    string  // célula 100% executada
    linha_total:     string  // linha de totais gerais

    // Memória
    mem_titulo:      string  // fundo título da memória
    mem_grupo:       string  // linha de grupo na memória
    mem_apagar:      string  // status A pagar
    mem_pago:        string  // status Pago
    mem_tot_acum:    string  // total acumulado
    mem_tot_ant:     string  // total anterior
    mem_tot_mes:     string  // total do mês

    // Extenso/Demonstrativo
    extenso_bg:      string
    extenso_borda:   string
    demo_cabec:      string

    // Logo/Empresa (bloco direito)
    empresa_bg:      string
  }

  // ── Tipografia ────────────────────────────────────────────────────────────
  fonte: {
    nome_base:     FontName
    nome_cabec:    FontName
    tamanho_dados: number  // pt
    tamanho_th:    number  // pt
    tamanho_cabec: number  // pt
  }

  // ── Bordas ────────────────────────────────────────────────────────────────
  bordas: {
    dados:   BorderStyle
    cabec:   BorderStyle
    totais:  BorderStyle
    externo: BorderStyle
  }
}

// ─── MODELOS PADRÃO ───────────────────────────────────────────────────────────

export const MODELO_ESTADO_DEFAULT: ModeloPlanilha = {
  id: 'builtin-estado',
  nome: 'Estado (Padrão)',
  descricao: 'Modelo azul/laranja para contratos estaduais',
  base: 'ESTADO',
  builtin: true,
  editado_em: new Date().toISOString(),
  cores: {
    hdr_topo:       'ED7D31',
    hdr_principal:  '1F3864',
    hdr_sub:        '2E75B6',
    hdr_cabec:      'DEEAF1',
    th_base:        '1F3864',
    th_medicao:     '2E75B6',
    linha_grupo:    'D6D6D6',
    linha_par:      'FAFAFA',
    linha_impar:    'FFFFFF',
    linha_periodo:  'E0E0E0',
    linha_100pct:   '70AD47',
    linha_total:    '1F3864',
    mem_titulo:     '1F3864',
    mem_grupo:      'BDD7EE',
    mem_apagar:     'E2EFDA',
    mem_pago:       'DDEEFF',
    mem_tot_acum:   'D9D9D9',
    mem_tot_ant:    'DDEEFF',
    mem_tot_mes:    'FFF2CC',
    extenso_bg:     'FFF8E7',
    extenso_borda:  'ED7D31',
    demo_cabec:     '1F3864',
    empresa_bg:     'DEEAF1',
  },
  fonte: {
    nome_base:     'Arial Narrow',
    nome_cabec:    'Arial Narrow',
    tamanho_dados: 9,
    tamanho_th:    9,
    tamanho_cabec: 11,
  },
  bordas: {
    dados:   'thin',
    cabec:   'medium',
    totais:  'medium',
    externo: 'medium',
  },
}

export const MODELO_PREFEITURA_DEFAULT: ModeloPlanilha = {
  id: 'builtin-prefeitura',
  nome: 'Prefeitura (Padrão)',
  descricao: 'Modelo verde para contratos municipais — layout PREV 02',
  base: 'PREFEITURA',
  builtin: true,
  editado_em: new Date().toISOString(),
  cores: {
    hdr_topo:       '375623',
    hdr_principal:  '375623',
    hdr_sub:        '70AD47',
    hdr_cabec:      'D4D4D4',
    th_base:        '4E6B30',
    th_medicao:     '70AD47',
    linha_grupo:    'E2EFDA',
    linha_par:      'FAFAFA',
    linha_impar:    'FFFFFF',
    linha_periodo:  'C6EFCE',
    linha_100pct:   '70AD47',
    linha_total:    '375623',
    mem_titulo:     '375623',
    mem_grupo:      'E2EFDA',
    mem_apagar:     'C6EFCE',
    mem_pago:       'BDD7EE',
    mem_tot_acum:   'A9D08E',
    mem_tot_ant:    'C6EFCE',
    mem_tot_mes:    'FFEB9C',
    extenso_bg:     'F0FFF0',
    extenso_borda:  '70AD47',
    demo_cabec:     '375623',
    empresa_bg:     'F2F2F2',
  },
  fonte: {
    nome_base:     'Arial',
    nome_cabec:    'Arial',
    tamanho_dados: 8,
    tamanho_th:    8,
    tamanho_cabec: 9,
  },
  bordas: {
    dados:   'thin',
    cabec:   'thin',
    totais:  'medium',
    externo: 'thin',
  },
}

// ─── STORE ────────────────────────────────────────────────────────────────────

interface ModeloState {
  modelos: ModeloPlanilha[]
  excelHabilitado: boolean
  medir100Habilitado: boolean
  temaEscuro: boolean
  corTema: 'orange' | 'amber'
  // CRUD
  salvarModelo:  (m: ModeloPlanilha) => void
  deletarModelo: (id: string) => void
  clonarModelo:  (id: string, novoNome: string) => ModeloPlanilha
  resetModelo:   (id: string) => void
  setExcelHabilitado: (v: boolean) => void
  setMedir100Habilitado: (v: boolean) => void
  setTemaEscuro: (v: boolean) => void
  setCorTema: (v: 'orange' | 'amber') => void
  // Helpers
  getModelo:     (id: string) => ModeloPlanilha | undefined
}

export const useModeloStore = create<ModeloState>()(
  persist(
    (set, get) => ({
      modelos: [MODELO_ESTADO_DEFAULT, MODELO_PREFEITURA_DEFAULT],
      excelHabilitado: true,
      medir100Habilitado: false,
      temaEscuro: false,
      corTema: 'orange' as const,

      salvarModelo: (m) => set(state => ({
        modelos: state.modelos.some(x => x.id === m.id)
          ? state.modelos.map(x => x.id === m.id ? { ...m, editado_em: new Date().toISOString() } : x)
          : [...state.modelos, { ...m, editado_em: new Date().toISOString() }],
      })),

      deletarModelo: (id) => set(state => ({
        modelos: state.modelos.filter(m => m.id !== id || m.builtin),
      })),

      clonarModelo: (id, novoNome) => {
        const original = get().getModelo(id)
        if (!original) throw new Error('Modelo não encontrado')
        const clone: ModeloPlanilha = {
          ...JSON.parse(JSON.stringify(original)),
          id:       crypto.randomUUID(),
          nome:     novoNome,
          builtin:  false,
          editado_em: new Date().toISOString(),
        }
        set(state => ({ modelos: [...state.modelos, clone] }))
        return clone
      },

      resetModelo: (id) => {
        const defaultMap: Record<string, ModeloPlanilha> = {
          'builtin-estado':      MODELO_ESTADO_DEFAULT,
          'builtin-prefeitura':  MODELO_PREFEITURA_DEFAULT,
        }
        const def = defaultMap[id]
        if (!def) return
        set(state => ({
          modelos: state.modelos.map(m => m.id === id ? { ...def, editado_em: new Date().toISOString() } : m),
        }))
      },

      setExcelHabilitado: (v) => set({ excelHabilitado: v }),
      setMedir100Habilitado: (v) => set({ medir100Habilitado: v }),
      setTemaEscuro: (v) => {
        set({ temaEscuro: v })
        document.documentElement.classList.toggle('dark', v)
      },
      setCorTema: (v) => {
        set({ corTema: v })
        document.documentElement.classList.remove('theme-orange', 'theme-amber')
        document.documentElement.classList.add(`theme-${v}`)
      },

      getModelo: (id) => get().modelos.find(m => m.id === id),
    }),
    {
      name: 'rd-modelos-planilha',
      // garante que os builtins sempre estão presentes mesmo após atualização do código
      onRehydrateStorage: () => (state) => {
        if (!state) return
        const ids = state.modelos.map(m => m.id)
        if (!ids.includes('builtin-estado'))      state.modelos.unshift(MODELO_ESTADO_DEFAULT)
        if (!ids.includes('builtin-prefeitura'))   state.modelos.unshift({ ...MODELO_PREFEITURA_DEFAULT })
      },
    }
  )
)
