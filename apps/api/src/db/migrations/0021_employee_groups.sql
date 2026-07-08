-- ZeitVault: Mitarbeitergruppen (Schnitt 3; B-11) und Gruppen-Scope fuer
-- Regelsaetze. Eine Gruppe buendelt Mitarbeitende (mit Gueltigkeitshistorie);
-- Regelsaetze der Ebenen TV/BV koennen auf eine Gruppe eingeschraenkt werden
-- ("pro Mitarbeitergruppe umschaltbar", z. B. max_working_time_mode).
-- RLS aktiv auf allen neuen Tabellen (ADR-0004, Kern-Invariante 3).

CREATE TABLE IF NOT EXISTS employee_groups (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   varchar(64) NOT NULL,
  name        varchar(200) NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS employee_groups_tenant_idx ON employee_groups (tenant_id);
ALTER TABLE employee_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_groups FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS employee_groups_tenant_isolation ON employee_groups;
CREATE POLICY employee_groups_tenant_isolation ON employee_groups
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

CREATE TABLE IF NOT EXISTS employee_group_members (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    varchar(64) NOT NULL,
  group_id     uuid NOT NULL REFERENCES employee_groups(id),
  employee_id  uuid NOT NULL,
  valid_from   date NOT NULL,
  valid_to     date,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS employee_group_members_tenant_idx
  ON employee_group_members (tenant_id, employee_id, valid_from);
ALTER TABLE employee_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_group_members FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS employee_group_members_tenant_isolation ON employee_group_members;
CREATE POLICY employee_group_members_tenant_isolation ON employee_group_members
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- Regelsaetze: optionaler Gruppen-Scope (nur TV-/BV-Ebene; individuell bleibt
-- personenbezogen).
ALTER TABLE rule_sets ADD COLUMN IF NOT EXISTS employee_group_id uuid;
ALTER TABLE rule_sets DROP CONSTRAINT IF EXISTS rule_sets_individual_no_group;
ALTER TABLE rule_sets ADD CONSTRAINT rule_sets_individual_no_group
  CHECK (layer <> 'individual' OR employee_group_id IS NULL);
