-- ZeitVault: Einsatzorte (ADR-0016) und Schicht-/Nacherfassungs-Felder an
-- Stempeln (ADR-0017/0018; Anforderungen K-01/K-06/K-02/A-03).
--
-- work_locations: Ort der Arbeitsstaette mit Bundesland, optionalem
-- Gemeindeschluessel (AGS, fuer gemeindescharfe Feiertage - Aufloesung folgt
-- spaeter, das Schema laesst sie zu) und IANA-Zeitzone. Die Bewertung erfolgt
-- IMMER gegen die Zeitzone des aufgeloesten Einsatzortes (K-06).
-- employee_work_locations: Standard-Einsatzort je Mitarbeitendem mit
-- Gueltigkeitshistorie; ein Stempel kann den Einsatzort einzeln uebersteuern.
-- RLS aktiv auf allen neuen Tabellen (ADR-0004, Kern-Invariante 3).

CREATE TABLE IF NOT EXISTS work_locations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          varchar(64) NOT NULL,
  name               varchar(200) NOT NULL,
  country_code       varchar(2) NOT NULL DEFAULT 'DE',
  state_code         varchar(8),
  municipality_code  varchar(16),
  time_zone          varchar(64) NOT NULL,
  is_default         boolean NOT NULL DEFAULT false,
  active             boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS work_locations_tenant_idx ON work_locations (tenant_id);
ALTER TABLE work_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_locations FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS work_locations_tenant_isolation ON work_locations;
CREATE POLICY work_locations_tenant_isolation ON work_locations
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

CREATE TABLE IF NOT EXISTS employee_work_locations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         varchar(64) NOT NULL,
  employee_id       uuid NOT NULL,
  work_location_id  uuid NOT NULL,
  valid_from        date NOT NULL,
  valid_to          date,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS employee_work_locations_tenant_idx
  ON employee_work_locations (tenant_id);
CREATE INDEX IF NOT EXISTS employee_work_locations_employee_idx
  ON employee_work_locations (tenant_id, employee_id, valid_from);
ALTER TABLE employee_work_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_work_locations FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS employee_work_locations_tenant_isolation ON employee_work_locations;
CREATE POLICY employee_work_locations_tenant_isolation ON employee_work_locations
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- Stempel: optionale Einsatzort-Uebersteuerung (ADR-0016) und
-- Nacherfassungs-Kennzeichnung (A-03: Nacherfassung > 24 h nur mit
-- Pflicht-Begruendung; der Eintrag wird dauerhaft als late_entry markiert).
-- Reines ADD COLUMN - der Append-only-Trigger (UPDATE/DELETE) bleibt unberuehrt.
ALTER TABLE stamp_events ADD COLUMN IF NOT EXISTS work_location_id uuid;
ALTER TABLE stamp_events ADD COLUMN IF NOT EXISTS late_entry boolean NOT NULL DEFAULT false;
ALTER TABLE stamp_events ADD COLUMN IF NOT EXISTS late_reason text;
