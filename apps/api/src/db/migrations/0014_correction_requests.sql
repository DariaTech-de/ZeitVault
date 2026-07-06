-- ZeitVault: Anpassungsanträge ("Stempel vergessen"). Mitarbeitende beantragen
-- das Nachtragen/Korrigieren einer Stempelung; erst die Freigabe durch
-- Vorgesetzte erzeugt den append-only Stempel (Kern-Invariante 1). Workflow-
-- Entität mit Statuswechseln (NICHT append-only). RLS aktiv (ADR-0004).

DO $$ BEGIN
  CREATE TYPE correction_kind AS ENUM ('add', 'correct');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE correction_status AS ENUM ('requested', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS stamp_correction_requests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             varchar(64) NOT NULL,
  employee_id           uuid NOT NULL,
  kind                  correction_kind NOT NULL,
  target_event_id       uuid,
  proposed_kind         stamp_kind NOT NULL,
  proposed_occurred_at  timestamptz NOT NULL,
  reason                text NOT NULL,
  status                correction_status NOT NULL DEFAULT 'requested',
  approver_id           varchar(128),
  applied_event_id      uuid,
  note                  text,
  decided_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS correction_requests_tenant_idx ON stamp_correction_requests (tenant_id);
CREATE INDEX IF NOT EXISTS correction_requests_employee_idx ON stamp_correction_requests (employee_id);

ALTER TABLE stamp_correction_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE stamp_correction_requests FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS correction_requests_tenant_isolation ON stamp_correction_requests;
CREATE POLICY correction_requests_tenant_isolation ON stamp_correction_requests
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
