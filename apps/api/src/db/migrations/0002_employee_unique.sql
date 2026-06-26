-- ZeitVault Phase 0/A3: Personalnummer je Mandant eindeutig (Stammdaten-Hygiene,
-- ermoeglicht idempotentes Seeding via ON CONFLICT).
CREATE UNIQUE INDEX IF NOT EXISTS employees_tenant_personnel_uq
  ON employees (tenant_id, personnel_number);
