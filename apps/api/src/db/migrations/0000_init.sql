-- ZeitVault Initial-Schema (Phase 0)
-- Hand-gepflegt, da RLS-Policies und Trigger nicht vom ORM generiert werden
-- (ADR-0005). Enthaelt Mandantentrennung via RLS (ADR-0004) und die
-- GoBD-Unveraenderbarkeit von time_entries (Kern-Invariante 1).

CREATE TABLE IF NOT EXISTS tenants (
  id          varchar(64) PRIMARY KEY,
  name        varchar(200) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  CREATE TYPE time_entry_source AS ENUM ('web', 'mobile', 'terminal');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE time_entry_status AS ENUM ('open', 'submitted', 'approved', 'corrected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS employees (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         varchar(64) NOT NULL,
  personnel_number  varchar(64) NOT NULL,
  display_name      varchar(200) NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS employees_tenant_idx ON employees (tenant_id);

CREATE TABLE IF NOT EXISTS time_entries (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          varchar(64) NOT NULL,
  employee_id        uuid NOT NULL,
  start_at           timestamptz NOT NULL,
  end_at             timestamptz,
  source             time_entry_source NOT NULL,
  status             time_entry_status NOT NULL DEFAULT 'open',
  revision           integer NOT NULL DEFAULT 1,
  previous_entry_id  uuid,
  correction_reason  text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS time_entries_tenant_idx ON time_entries (tenant_id);
CREATE INDEX IF NOT EXISTS time_entries_employee_idx ON time_entries (employee_id);

-- ---------------------------------------------------------------------------
-- Row-Level Security (Mandantentrennung, ADR-0004).
-- Der Tenant-Kontext wird je Transaktion via
--   select set_config('app.tenant_id', '<tenant>', true)
-- gesetzt; die Policies vergleichen tenant_id mit current_setting.
-- FORCE stellt sicher, dass auch der Tabelleneigentuemer den Policies unterliegt.
-- Der Anwendungs-DB-User darf KEIN BYPASSRLS besitzen.
-- ---------------------------------------------------------------------------
ALTER TABLE employees     ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees     FORCE  ROW LEVEL SECURITY;
ALTER TABLE time_entries  FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employees_tenant_isolation ON employees;
CREATE POLICY employees_tenant_isolation ON employees
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS time_entries_tenant_isolation ON time_entries;
CREATE POLICY time_entries_tenant_isolation ON time_entries
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- ---------------------------------------------------------------------------
-- GoBD-Unveraenderbarkeit: time_entries sind append-only. Eine Korrektur
-- erzeugt eine NEUE Revision; UPDATE/DELETE sind verboten (Kern-Invariante 1).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION zeitvault_forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'time_entries sind unveraenderlich (GoBD): % nicht erlaubt. Korrektur erfolgt ueber eine neue Revision.', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS time_entries_no_mutation ON time_entries;
CREATE TRIGGER time_entries_no_mutation
  BEFORE UPDATE OR DELETE ON time_entries
  FOR EACH ROW EXECUTE FUNCTION zeitvault_forbid_mutation();
