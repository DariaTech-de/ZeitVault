-- ZeitVault Phase 1 / B4: Arbeitszeitmodelle (Sollzeiten je Wochentag, versioniert).
-- Konfigurationsdaten (kein append-only); Mandantentrennung via RLS (ADR-0004).

CREATE TABLE IF NOT EXISTS work_time_models (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       varchar(64) NOT NULL,
  name            varchar(200) NOT NULL,
  valid_from      date NOT NULL,
  valid_to        date,
  target_minutes  integer[] NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS work_time_models_tenant_idx ON work_time_models (tenant_id);

ALTER TABLE work_time_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_time_models FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS work_time_models_tenant_isolation ON work_time_models;
CREATE POLICY work_time_models_tenant_isolation ON work_time_models
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
