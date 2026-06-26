-- ZeitVault Phase 2 / C1: Abwesenheitsantraege mit Genehmigungs-Workflow.
-- Workflow-Entitaet mit Statuswechseln (nicht append-only); jeder Schritt
-- (Antrag/Genehmigung/Ablehnung/Stornierung) erzeugt ein AuditEvent im Ledger.
-- Mandantentrennung via RLS (ADR-0004).

DO $$ BEGIN
  CREATE TYPE absence_type AS ENUM ('vacation', 'sick', 'special');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE absence_status AS ENUM ('requested', 'approved', 'rejected', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS absence_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    varchar(64) NOT NULL,
  employee_id  uuid NOT NULL,
  type         absence_type NOT NULL,
  from_date    date NOT NULL,
  to_date      date NOT NULL,
  status       absence_status NOT NULL DEFAULT 'requested',
  reason       text,
  approver_id  varchar(128),
  decided_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT absence_requests_period_ck CHECK (from_date <= to_date)
);
CREATE INDEX IF NOT EXISTS absence_requests_tenant_idx ON absence_requests (tenant_id);
CREATE INDEX IF NOT EXISTS absence_requests_employee_idx ON absence_requests (employee_id);

ALTER TABLE absence_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE absence_requests FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS absence_requests_tenant_isolation ON absence_requests;
CREATE POLICY absence_requests_tenant_isolation ON absence_requests
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
