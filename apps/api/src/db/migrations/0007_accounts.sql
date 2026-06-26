-- ZeitVault Phase 2 / C2: Arbeitszeitkonten (Ueberstunden/Gleitzeit/Urlaub).
-- Buchungen sind lohnrelevant und damit append-only (GoBD, Kern-Invariante 1):
-- eine Korrektur erfolgt ueber eine neue (vorzeichenbehaftete) Gegenbuchung.
-- Mandantentrennung via RLS (ADR-0004). Jede Buchung erzeugt ein AuditEvent.

DO $$ BEGIN
  CREATE TYPE account_kind AS ENUM ('overtime', 'flextime', 'vacation');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS account_transactions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      varchar(64) NOT NULL,
  employee_id    uuid NOT NULL,
  account        account_kind NOT NULL,
  -- Vorzeichenbehaftet; Einheit je Kontoart: Minuten (overtime/flextime),
  -- Tage (vacation).
  amount         integer NOT NULL,
  effective_date date NOT NULL,
  reason         text,
  -- Optionaler Bezug zur Quelle (z. B. absence_request, Abrechnungslauf).
  source_type    varchar(64),
  source_id      varchar(128),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS account_transactions_tenant_idx ON account_transactions (tenant_id);
CREATE INDEX IF NOT EXISTS account_transactions_employee_idx
  ON account_transactions (employee_id, account, effective_date);

ALTER TABLE account_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_transactions FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS account_transactions_tenant_isolation ON account_transactions;
CREATE POLICY account_transactions_tenant_isolation ON account_transactions
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- Append-only (GoBD): UPDATE/DELETE verboten; Korrektur via Gegenbuchung.
DROP TRIGGER IF EXISTS account_transactions_no_mutation ON account_transactions;
CREATE TRIGGER account_transactions_no_mutation
  BEFORE UPDATE OR DELETE ON account_transactions
  FOR EACH ROW EXECUTE FUNCTION zeitvault_append_only();
