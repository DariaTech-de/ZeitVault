-- ZeitVault: Standort-Prüfung beim Stempeln (Geofencing). Kern-Invariante 5:
-- standardmäßig DEAKTIVIERT; nur nach Betriebsvereinbarung je Mandant aktivierbar
-- (BetrVG § 87). Datensparsamkeit: am Stempel werden nur Prüfergebnis, Standort
-- und gerundete Distanz gespeichert, NICHT die rohen Koordinaten (ADR-0014). RLS
-- aktiv (ADR-0004).

-- Prüfergebnis am (append-only) Stempel; wird beim Insert einmalig gesetzt.
DO $$ BEGIN
  CREATE TYPE location_check AS ENUM ('not_required', 'inside', 'outside', 'no_signal');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE stamp_events
  ADD COLUMN IF NOT EXISTS location_check location_check NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS location_site_id uuid,
  ADD COLUMN IF NOT EXISTS location_distance_m integer;

-- Mandanteneinstellung: Geofencing an/aus (Default AUS = Kern-Invariante 5).
CREATE TABLE IF NOT EXISTS geofence_settings (
  tenant_id    varchar(64) PRIMARY KEY,
  enabled      boolean NOT NULL DEFAULT false,
  updated_by   varchar(128),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE geofence_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE geofence_settings FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS geofence_settings_tenant_isolation ON geofence_settings;
CREATE POLICY geofence_settings_tenant_isolation ON geofence_settings
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- Standorte/Geofences (Mittelpunkt + Radius in Metern).
CREATE TABLE IF NOT EXISTS geofence_sites (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     varchar(64) NOT NULL,
  name          varchar(120) NOT NULL,
  latitude      double precision NOT NULL,
  longitude     double precision NOT NULL,
  radius_m      integer NOT NULL CHECK (radius_m >= 10),
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS geofence_sites_tenant_idx ON geofence_sites (tenant_id);
ALTER TABLE geofence_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE geofence_sites FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS geofence_sites_tenant_isolation ON geofence_sites;
CREATE POLICY geofence_sites_tenant_isolation ON geofence_sites
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- Admin-Kennzeichnung („blinken") eines Stempels zur Nachverfolgung. Der Stempel
-- bleibt unverändert (append-only); die Kennzeichnung ist eine getrennte,
-- veränderbare Workflow-Entität. Genau eine Kennzeichnung je Ereignis (Upsert).
CREATE TABLE IF NOT EXISTS stamp_flags (
  event_id      uuid PRIMARY KEY,
  tenant_id     varchar(64) NOT NULL,
  flagged       boolean NOT NULL DEFAULT true,
  reason        text,
  flagged_by    varchar(128),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stamp_flags_tenant_idx ON stamp_flags (tenant_id);
ALTER TABLE stamp_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE stamp_flags FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stamp_flags_tenant_isolation ON stamp_flags;
CREATE POLICY stamp_flags_tenant_isolation ON stamp_flags
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
