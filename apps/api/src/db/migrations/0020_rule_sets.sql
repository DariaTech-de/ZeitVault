-- ZeitVault: Regelschicht (Schnitt 2; B-08/B-09/B-10).
--
-- collective_agreements: Tarifvertrag (TV) bzw. Betriebsvereinbarung (BV) als
-- referenzierbares Objekt. Abweichende Regelsaetze sind OHNE eine solche
-- Referenz nicht aktivierbar (B-08, § 7 ArbZG); eine BV kann ihren
-- ermaechtigenden TV referenzieren (based_on_id).
--
-- rule_sets: persistente, mandantenfaehige, VERSIONIERTE Regelsaetze
-- (valid_from/valid_to je Satz, B-10). `layer` bestimmt die Ebene im
-- Regel-Layering (B-09: Gesetz -> TV -> BV -> individuell; das Gesetz lebt
-- als versioniertes Code-Regelpaket, ADR-0009). `params` enthaelt NUR die
-- abweichenden Parameter (jsonb, serverseitig zod-validiert). Aktive
-- Regelsaetze werden nicht editiert - Aenderung = neuer Satz + Deaktivierung
-- des alten (nachvollziehbar, auditierbar, Reprocessing-Ausloeser).
--
-- reprocessing_runs: Protokoll rueckwirkender Neubewertungen (B-10).
-- Die DIFFERENZ-Erzeugung folgt mit F-04 (Schnitt 5).
--
-- RLS aktiv auf allen neuen Tabellen (ADR-0004, Kern-Invariante 3).

CREATE TABLE IF NOT EXISTS collective_agreements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    varchar(64) NOT NULL,
  kind         varchar(32) NOT NULL CHECK (kind IN ('collective_agreement', 'works_agreement')),
  name         varchar(200) NOT NULL,
  -- Fundstelle/Aktenzeichen (z. B. "MTV Metall NRW, Abschluss 2026-06-15").
  reference    varchar(500),
  -- BV "aufgrund eines Tarifvertrags" (§ 7 ArbZG): ermaechtigender TV.
  based_on_id  uuid REFERENCES collective_agreements(id),
  valid_from   date NOT NULL,
  valid_to     date,
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS collective_agreements_tenant_idx ON collective_agreements (tenant_id);
ALTER TABLE collective_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE collective_agreements FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS collective_agreements_tenant_isolation ON collective_agreements;
CREATE POLICY collective_agreements_tenant_isolation ON collective_agreements
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

CREATE TABLE IF NOT EXISTS rule_sets (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                varchar(64) NOT NULL,
  name                     varchar(200) NOT NULL,
  layer                    varchar(32) NOT NULL
    CHECK (layer IN ('collective_agreement', 'works_agreement', 'individual')),
  collective_agreement_id  uuid REFERENCES collective_agreements(id),
  -- Individuelle Vereinbarung gilt je Mitarbeitendem.
  employee_id              uuid,
  valid_from               date NOT NULL,
  valid_to                 date,
  params                   jsonb NOT NULL,
  active                   boolean NOT NULL DEFAULT true,
  created_at               timestamptz NOT NULL DEFAULT now(),
  -- B-08: TV-/BV-Regelsaetze sind ohne Referenz nicht aktivierbar.
  CONSTRAINT rule_sets_agreement_required
    CHECK (layer = 'individual' OR collective_agreement_id IS NOT NULL),
  -- Individuelle Vereinbarungen brauchen den Mitarbeiterbezug.
  CONSTRAINT rule_sets_individual_employee
    CHECK (layer <> 'individual' OR employee_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS rule_sets_tenant_idx ON rule_sets (tenant_id, valid_from);
ALTER TABLE rule_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE rule_sets FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rule_sets_tenant_isolation ON rule_sets;
CREATE POLICY rule_sets_tenant_isolation ON rule_sets
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

CREATE TABLE IF NOT EXISTS reprocessing_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     varchar(64) NOT NULL,
  trigger_kind  varchar(32) NOT NULL CHECK (trigger_kind IN ('rule_set_change', 'manual')),
  rule_set_id   uuid,
  from_date     date NOT NULL,
  to_date       date NOT NULL,
  status        varchar(16) NOT NULL CHECK (status IN ('completed', 'failed')),
  -- Zusammenfassung des Laufs (Mitarbeitende, Tage, Befundzahlen).
  summary       jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz
);
CREATE INDEX IF NOT EXISTS reprocessing_runs_tenant_idx ON reprocessing_runs (tenant_id, created_at);
ALTER TABLE reprocessing_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE reprocessing_runs FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reprocessing_runs_tenant_isolation ON reprocessing_runs;
CREATE POLICY reprocessing_runs_tenant_isolation ON reprocessing_runs
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
