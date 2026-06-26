-- ZeitVault Audit-Ledger Initial-Schema (Phase 0)
-- Append-only, hash-verkettet (ADR-0006). Getrennte Vertrauensgrenze: der
-- DB-User dieses Dienstes sollte ausschliesslich INSERT/SELECT auf audit_events
-- besitzen (kein UPDATE/DELETE, kein BYPASSRLS).

CREATE TABLE IF NOT EXISTS audit_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     varchar(64) NOT NULL,
  sequence      integer NOT NULL,
  action        varchar(64) NOT NULL,
  actor_id      varchar(128) NOT NULL,
  subject_type  varchar(64) NOT NULL,
  subject_id    varchar(128) NOT NULL,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_at   text NOT NULL,
  prev_hash     varchar(64),
  hash          varchar(64) NOT NULL
);

-- (tenant_id, sequence) eindeutig: schuetzt die fortlaufende Kette vor Luecken/Duplikaten.
CREATE UNIQUE INDEX IF NOT EXISTS audit_events_tenant_seq_uq ON audit_events (tenant_id, sequence);

-- Mandantentrennung (ADR-0004): Tenant-Kontext je Transaktion via
-- set_config('app.tenant_id', ...). FORCE bezieht den Eigentuemer ein.
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_events_tenant_isolation ON audit_events;
CREATE POLICY audit_events_tenant_isolation ON audit_events
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- Append-only: UPDATE/DELETE sind verboten (manipulationsevidente Kette).
CREATE OR REPLACE FUNCTION zeitvault_ledger_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events sind append-only: % nicht erlaubt.', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_events_append_only ON audit_events;
CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION zeitvault_ledger_append_only();
