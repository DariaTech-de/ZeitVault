-- ZeitVault: Verknüpfung Mitarbeiter <-> OIDC-Identität (für echten Login).
-- external_id trägt den OIDC-Subject (sub) aus dem verifizierten Token; darüber
-- löst /me den Mitarbeiter-Datensatz des angemeldeten Nutzers auf. RLS aktiv.

ALTER TABLE employees ADD COLUMN IF NOT EXISTS external_id varchar(128);

-- Eindeutig je Mandant (mehrere NULL erlaubt: nicht jeder Datensatz ist verknüpft).
CREATE UNIQUE INDEX IF NOT EXISTS employees_tenant_external_uq
  ON employees (tenant_id, external_id)
  WHERE external_id IS NOT NULL;
