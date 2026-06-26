-- ZeitVault Phase 5 / F1: eAU-Abrufe (elektronische Arbeitsunfähigkeitsbescheinigung).
-- Gekapselte, asynchrone Schnittstelle; die tatsächliche Übertragung erfolgt über
-- ein zertifiziertes externes Gateway (organisatorisch zu beschaffen, BLOCKIERT).
-- Workflow-Entität mit Statuswechseln (NICHT append-only). Gesundheitsdaten sind
-- besonders schützenswert (Art. 9 DSGVO) - datensparsam: kein Diagnoseinhalt.
-- RLS aktiv (ADR-0004).

DO $$ BEGIN
  CREATE TYPE eau_status AS ENUM ('requested', 'submitted', 'confirmed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS eau_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     varchar(64) NOT NULL,
  employee_id   uuid NOT NULL,
  from_date     date NOT NULL,
  to_date       date NOT NULL,
  status        eau_status NOT NULL DEFAULT 'requested',
  -- Referenz des externen Gateways (kein Diagnoseinhalt, datensparsam).
  external_ref  varchar(128),
  last_error    text,
  requested_at  timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eau_requests_period_ck CHECK (from_date <= to_date)
);
CREATE INDEX IF NOT EXISTS eau_requests_tenant_idx ON eau_requests (tenant_id);
CREATE INDEX IF NOT EXISTS eau_requests_employee_idx ON eau_requests (employee_id);

ALTER TABLE eau_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE eau_requests FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS eau_requests_tenant_isolation ON eau_requests;
CREATE POLICY eau_requests_tenant_isolation ON eau_requests
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
