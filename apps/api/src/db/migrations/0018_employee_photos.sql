-- ZeitVault: Mitarbeiterfotos für die Terminal-Begrüßung. Ein Anzeigebild je
-- Mitarbeitendem, mandantengetrennt (RLS, ADR-0004). Das Foto ist ein einfaches
-- Porträt und KEINE Biometrie (der Fingerabdruck bleibt gerätelokal, ADR-0015).
-- Löschung erfolgt mit dem Mitarbeitenden bzw. über die Retention-Engine
-- (Kern-Invariante 4).

CREATE TABLE IF NOT EXISTS employee_photos (
  employee_id  uuid PRIMARY KEY,
  tenant_id    varchar(64) NOT NULL,
  content_type varchar(100) NOT NULL,
  data         bytea NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS employee_photos_tenant_idx ON employee_photos (tenant_id);

ALTER TABLE employee_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_photos FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS employee_photos_tenant_isolation ON employee_photos;
CREATE POLICY employee_photos_tenant_isolation ON employee_photos
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
