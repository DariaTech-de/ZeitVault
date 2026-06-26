-- ZeitVault Phase 1: Stempelungen (Kommen/Gehen/Pausen) als append-only Ereignisse.
-- Mandantentrennung via RLS (ADR-0004), Unveraenderbarkeit per Trigger (GoBD,
-- Kern-Invariante 1). Arbeits-/Pausenzeiten werden aus den Ereignissen berechnet.

DO $$ BEGIN
  CREATE TYPE stamp_kind AS ENUM ('clock_in', 'break_start', 'break_end', 'clock_out');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS stamp_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    varchar(64) NOT NULL,
  employee_id  uuid NOT NULL,
  kind         stamp_kind NOT NULL,
  occurred_at  timestamptz NOT NULL,
  source       time_entry_source NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stamp_events_tenant_idx ON stamp_events (tenant_id);
CREATE INDEX IF NOT EXISTS stamp_events_employee_idx ON stamp_events (employee_id, occurred_at);

ALTER TABLE stamp_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE stamp_events FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stamp_events_tenant_isolation ON stamp_events;
CREATE POLICY stamp_events_tenant_isolation ON stamp_events
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- Generischer Append-only-Schutz (nutzt den Tabellennamen in der Meldung).
CREATE OR REPLACE FUNCTION zeitvault_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% ist append-only: % nicht erlaubt. Korrektur erfolgt ueber ein neues Ereignis.', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS stamp_events_no_mutation ON stamp_events;
CREATE TRIGGER stamp_events_no_mutation
  BEFORE UPDATE OR DELETE ON stamp_events
  FOR EACH ROW EXECUTE FUNCTION zeitvault_append_only();
