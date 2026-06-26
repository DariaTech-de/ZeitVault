-- ZeitVault Phase 5 / F2: Projektzeit. Projekte (Stammdaten, veränderbar) und
-- Projektzeit-Buchungen (lohn-/abrechnungsrelevant, append-only). Eine Korrektur
-- erfolgt über eine vorzeichenbehaftete Gegenbuchung (kein UPDATE/DELETE), analog
-- zu den Arbeitszeitkonten (Kern-Invariante 1). RLS aktiv (ADR-0004).

CREATE TABLE IF NOT EXISTS projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   varchar(64) NOT NULL,
  code        varchar(32) NOT NULL,
  name        varchar(200) NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS projects_tenant_idx ON projects (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS projects_tenant_code_uq ON projects (tenant_id, code);

CREATE TABLE IF NOT EXISTS project_time_entries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     varchar(64) NOT NULL,
  employee_id   uuid NOT NULL,
  project_id    uuid NOT NULL,
  work_date     date NOT NULL,
  -- Vorzeichenbehaftet (Minuten); Korrektur = negative Gegenbuchung.
  minutes       integer NOT NULL,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_time_tenant_idx ON project_time_entries (tenant_id);
CREATE INDEX IF NOT EXISTS project_time_project_idx ON project_time_entries (project_id, work_date);
CREATE INDEX IF NOT EXISTS project_time_employee_idx ON project_time_entries (employee_id, work_date);

ALTER TABLE projects             ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects             FORCE  ROW LEVEL SECURITY;
ALTER TABLE project_time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_time_entries FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS projects_tenant_isolation ON projects;
CREATE POLICY projects_tenant_isolation ON projects
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS project_time_tenant_isolation ON project_time_entries;
CREATE POLICY project_time_tenant_isolation ON project_time_entries
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- Buchungen sind append-only (GoBD); Korrektur via Gegenbuchung.
DROP TRIGGER IF EXISTS project_time_no_mutation ON project_time_entries;
CREATE TRIGGER project_time_no_mutation
  BEFORE UPDATE OR DELETE ON project_time_entries
  FOR EACH ROW EXECUTE FUNCTION zeitvault_append_only();
