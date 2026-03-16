-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Upgrade Custos ERP — Centro de Custo, A Pagar/A Receber, Dedup
-- Rodar no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Adiciona centro de custo na tabela de obras
ALTER TABLE obras ADD COLUMN IF NOT EXISTS centro_custo TEXT;
CREATE INDEX IF NOT EXISTS idx_obras_centro_custo ON obras(centro_custo);

-- 2. Adiciona tipo lançamento (A_PAGAR / A_RECEBER) e ref_lancamento para dedup
ALTER TABLE custos_erp ADD COLUMN IF NOT EXISTS tipo_lancamento TEXT CHECK (tipo_lancamento IN ('A_PAGAR','A_RECEBER')) DEFAULT 'A_PAGAR';
ALTER TABLE custos_erp ADD COLUMN IF NOT EXISTS ref_lancamento TEXT;

-- Index para deduplicação rápida
CREATE INDEX IF NOT EXISTS idx_custos_erp_ref ON custos_erp(ref_lancamento);

-- Atualiza constraint de status para incluir PARCIAL e EM_ABERTO
ALTER TABLE custos_erp DROP CONSTRAINT IF EXISTS custos_erp_status_pagamento_check;
ALTER TABLE custos_erp ADD CONSTRAINT custos_erp_status_pagamento_check
  CHECK (status_pagamento IN ('PENDENTE','PAGO','VENCIDO','CANCELADO','PARCIAL','VENCENDO'));

-- Verifica
SELECT 'Migration OK!' AS status,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='obras' AND column_name='centro_custo') AS obras_cc,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='custos_erp' AND column_name='tipo_lancamento') AS custos_tipo,
  EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='custos_erp' AND column_name='ref_lancamento') AS custos_ref;
