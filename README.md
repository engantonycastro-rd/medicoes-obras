# MediObras — Sistema de Medições de Obras Públicas

Sistema web para geração de medições de obras públicas, seguindo o modelo da SEEC/RN (Secretaria de Estado da Educação).

## ✨ Funcionalidades

- 📋 **Cadastro de Contratos** — Estado e Prefeitura, com todos os parâmetros financeiros (desconto, BDI, prazo)
- 📥 **Import de Orçamento** — Upload de planilha `.xlsx` com detecção automática de colunas
- 📊 **Memória de Cálculo** — Editor inline com campos dimensionais (Larg × Comp × Altura × Área × Vol × Kg × Outros × Qtde) e cálculo automático do Total
- 🔄 **Controle de Status** — "A pagar" / "Pago" / "Não executado" por linha — alimenta automaticamente as colunas ANTERIOR ACUMULADO e MEDIDA NO PERÍODO
- 📤 **Export .xlsx fiel ao modelo SEEC** — Gera as abas MED e MEM com toda a formatação original, incluindo DEMONSTRATIVO e valor por extenso
- 🔐 **Multi-usuário** — Autenticação e RLS via Supabase (cada usuário vê apenas seus próprios dados)
- 🚀 **Deploy Vercel** — Build otimizado, configurado para SPA routing

---

## 🚀 Instalação Local

### 1. Clone o repositório

```bash
git clone https://github.com/seu-usuario/medicoes-obras.git
cd medicoes-obras
npm install
```

### 2. Configure o Supabase

1. Acesse [supabase.com](https://supabase.com) e crie um projeto
2. No painel do projeto, vá em **SQL Editor** e execute o conteúdo de `supabase/schema.sql`
3. Vá em **Settings → API** e copie a URL e a Anon Key

### 3. Configure as variáveis de ambiente

```bash
cp .env.example .env
```

Edite `.env`:
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsI...
```

### 4. Rode em desenvolvimento

```bash
npm run dev
```

---

## 🚀 Deploy na Vercel

### Opção A — Via GitHub (recomendado)

1. Suba o projeto para um repositório GitHub
2. Acesse [vercel.com](https://vercel.com) → **New Project**
3. Importe o repositório
4. Configure as **Environment Variables**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Clique em **Deploy**

### Opção B — Via CLI

```bash
npm install -g vercel
vercel --prod
```

---

## 📖 Como Usar

### Fluxo básico (modelo SEEC):

1. **Contratos** → Crie um contrato com os dados da obra (órgão, empresa, desconto 4,29%, BDI, prazo)
2. **Serviços** → Importe a planilha de orçamento base (`.xlsx`) — o sistema extrai automaticamente ITEM, FONTE, CÓDIGO, DESCRIÇÃO, UNID, QTD, PREÇO UNIT.
3. **Medições** → Crie a 1ª Medição (o sistema cria automaticamente "1ª", "2ª", etc.)
4. **Memória de Cálculo** → Para cada serviço, adicione linhas com as dimensões medidas em campo:
   - Preencha os campos dimensionais (Larg., Comp., Altura, Área, etc.)
   - O **TOTAL** é calculado automaticamente como produto dos campos preenchidos
   - Defina o status: **"A pagar"** = medido neste período | **"Pago"** = medição anterior | **"Não executado"** = não executado
5. **Exportar .xlsx** → Gera a planilha fiel ao modelo SEEC com todas as abas (MED, MEM) e cálculos corretos

### Colunas calculadas automaticamente:

| Coluna | Fórmula |
|--------|---------|
| Preço c/ Desconto | Preço Unit × (1 − desconto%) |
| Preço c/ BDI | Preço c/ Desconto × (1 + BDI%) |
| Preço Total | Quantidade × Preço c/ BDI |
| Anterior Acumulada | Σ linhas com status "Pago" |
| Medida no Período | Σ linhas com status "A pagar" |
| Acumulado | Anterior + Período |
| Saldo | Previsto − Acumulado |

---

## 📁 Estrutura do Projeto

```
src/
├── components/
│   ├── layout/         AppLayout (sidebar + nav)
│   └── contracts/      ContratoModal (criar/editar)
├── pages/
│   ├── LoginPage       Autenticação
│   ├── ContratosPage   Lista de contratos
│   ├── ServicosPage    Import de orçamento
│   ├── MedicoesPage    Lista de medições
│   └── MemoriaPage     Editor da memória de cálculo ← CORE
├── lib/
│   ├── supabase.ts     Cliente Supabase + types
│   └── store.ts        Zustand (estado global)
├── utils/
│   ├── calculations.ts  Cálculos de BDI, totais, extenso
│   ├── excelExport.ts   Gerador do .xlsx (modelo SEEC)
│   └── importOrcamento.ts  Parser de orçamento
├── types/
│   └── index.ts         TypeScript types
supabase/
└── schema.sql           DDL completo + RLS + Views
```

---

## 🏗️ Estrutura do Banco (Supabase)

```
contratos         → dados do contrato
servicos          → itens do orçamento (importados)
medicoes          → cada boletim de medição
linhas_memoria    → linhas da memória de cálculo (input principal)

VIEW vw_resumo_servicos → calcula qtd_anterior, qtd_periodo, qtd_acumulada por serviço/medição
```

---

## 🔧 Tecnologias

- **React 18 + TypeScript** — Frontend
- **Tailwind CSS** — Estilização
- **Zustand** — Estado global
- **Supabase** — Backend (PostgreSQL + Auth + RLS)
- **ExcelJS** — Geração do .xlsx
- **React Router v6** — Navegação
- **Vite** — Build tool
- **Vercel** — Deploy

---

## 📝 Licença

Projeto proprietário — RD Soluções
