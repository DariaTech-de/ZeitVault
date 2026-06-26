-- ZeitVault Phase 3 / D2: GoBD-Prüfexport. Jeder Export wird als unveränderlicher
-- ExportJob mit Prüfsumme protokolliert (reproduzierbar, revisionssicher). Der
-- Lauf selbst erzeugt zusätzlich ein AuditEvent 'export.run' im Ledger.
-- Mandantentrennung via RLS (ADR-0004); append-only (Kern-Invariante 1).

DO $$ BEGIN
  CREATE TYPE export_kind AS ENUM ('gobd_time');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS export_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     varchar(64) NOT NULL,
  kind          export_kind NOT NULL,
  period_from   date NOT NULL,
  period_to     date NOT NULL,
  format        varchar(16) NOT NULL,
  row_count     integer NOT NULL,
  -- SHA-256 (hex) über den exportierten Inhalt; macht den Export prüfbar.
  checksum      varchar(64) NOT NULL,
  requested_by  varchar(128) NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT export_jobs_period_ck CHECK (period_from <= period_to)
);
CREATE INDEX IF NOT EXISTS export_jobs_tenant_idx ON export_jobs (tenant_id, created_at);

ALTER TABLE export_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE export_jobs FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS export_jobs_tenant_isolation ON export_jobs;
CREATE POLICY export_jobs_tenant_isolation ON export_jobs
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- Append-only (GoBD): der Protokolleintrag eines Exports ist unveränderlich.
DROP TRIGGER IF EXISTS export_jobs_no_mutation ON export_jobs;
CREATE TRIGGER export_jobs_no_mutation
  BEFORE UPDATE OR DELETE ON export_jobs
  FOR EACH ROW EXECUTE FUNCTION zeitvault_append_only();
