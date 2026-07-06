-- ZeitVault: Lizenzierung pro Mitarbeitenden (Sitzplaetze). Je Mandant eine
-- aktive Lizenz als offline verifizierbares, Ed25519-signiertes Token. Der
-- Server prueft die Signatur mit dem konfigurierten oeffentlichen Schluessel
-- (ADR-0013). Kein Phone-Home; funktioniert im Self-Hosted-Betrieb. RLS aktiv
-- (ADR-0004). Genau eine Lizenz je Mandant (Upsert bei erneutem Upload).

CREATE TABLE IF NOT EXISTS licenses (
  tenant_id     varchar(64) PRIMARY KEY,
  license_id    uuid NOT NULL,
  customer      varchar(200) NOT NULL,
  tier          varchar(64) NOT NULL,
  seats         integer NOT NULL CHECK (seats > 0),
  issued_at     timestamptz NOT NULL,
  valid_until   timestamptz NOT NULL,
  features      jsonb NOT NULL DEFAULT '[]'::jsonb,
  token         text NOT NULL,
  activated_by  varchar(128),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE licenses FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS licenses_tenant_isolation ON licenses;
CREATE POLICY licenses_tenant_isolation ON licenses
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
