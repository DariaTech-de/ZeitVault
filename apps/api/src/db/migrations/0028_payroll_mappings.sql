-- ZeitVault (C-11): Mandantenspezifisches Lohnartenmapping, PERSISTIERT und
-- ueber die Oberflaeche pflegbar (Aenderung ohne Deployment wirksam). Bewusst
-- KEINE DATEV-Feldlayouts (CLAUDE.md Abschnitt 9) - nur die konfigurierbare
-- Zuordnung interne Kategorie -> Abrechnungsschluessel (+ optionaler
-- Verguetungsfaktor je Bewertungsart, C-09). RLS aktiv (Kern-Invariante 3).
CREATE TABLE IF NOT EXISTS payroll_mappings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         varchar(64) NOT NULL,
  category          varchar(32) NOT NULL,
  lohnart           varchar(32) NOT NULL,
  kostenstelle      varchar(32),
  ausfallschluessel varchar(32),
  -- Verguetungsfaktor in Prozent (z. B. Bereitschaftsdienst 60); NULL = 100.
  factor_percent    integer,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payroll_mappings_category_check CHECK (category IN
    ('work_time', 'on_call_duty', 'standby', 'travel', 'vacation', 'sick', 'special')),
  CONSTRAINT payroll_mappings_factor_nonneg CHECK (factor_percent IS NULL OR factor_percent >= 0),
  CONSTRAINT payroll_mappings_tenant_category_uq UNIQUE (tenant_id, category)
);
CREATE INDEX IF NOT EXISTS payroll_mappings_tenant_idx ON payroll_mappings (tenant_id);
ALTER TABLE payroll_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_mappings FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payroll_mappings_tenant_isolation ON payroll_mappings;
CREATE POLICY payroll_mappings_tenant_isolation ON payroll_mappings
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
