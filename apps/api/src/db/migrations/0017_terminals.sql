-- ZeitVault: Zeiterfassungs-Terminals am Eingang. Mitarbeitende stempeln per
-- NFC-Chip oder Fingerabdruck. Fingerabdrücke werden NUR lokal am Terminal
-- abgeglichen; der Server speichert KEINE biometrischen Daten (DSGVO Art. 9,
-- ADR-0015). Terminals authentifizieren sich mit einem Geräte-Token; gespeichert
-- wird nur dessen Hash. RLS aktiv (ADR-0004).

CREATE TABLE IF NOT EXISTS terminals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     varchar(64) NOT NULL,
  name          varchar(120) NOT NULL,
  token_hash    varchar(128) NOT NULL,
  active        boolean NOT NULL DEFAULT true,
  last_seen_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS terminals_tenant_idx ON terminals (tenant_id);
CREATE INDEX IF NOT EXISTS terminals_token_idx ON terminals (tenant_id, token_hash);
ALTER TABLE terminals ENABLE ROW LEVEL SECURITY;
ALTER TABLE terminals FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS terminals_tenant_isolation ON terminals;
CREATE POLICY terminals_tenant_isolation ON terminals
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- NFC-Chip -> Mitarbeitender. Die UID ist je Mandant eindeutig.
CREATE TABLE IF NOT EXISTS nfc_credentials (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     varchar(64) NOT NULL,
  uid           varchar(128) NOT NULL,
  employee_id   uuid NOT NULL,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS nfc_credentials_tenant_uid_uq ON nfc_credentials (tenant_id, uid);
CREATE INDEX IF NOT EXISTS nfc_credentials_tenant_idx ON nfc_credentials (tenant_id);
ALTER TABLE nfc_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE nfc_credentials FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS nfc_credentials_tenant_isolation ON nfc_credentials;
CREATE POLICY nfc_credentials_tenant_isolation ON nfc_credentials
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
