-- ZeitVault Phase 4 / E3: Mitarbeiter-Lebenszyklus für die Retention-/Lösch-Engine.
-- Kern-Invariante 4: aufbewahrungspflichtige Daten werden nicht hart gelöscht,
-- sondern gesperrt/pseudonymisiert und erst nach Fristablauf gelöscht. Die
-- employees-Tabelle ist eine veränderliche Stammdatentabelle (NICHT append-only);
-- Statuswechsel sind erlaubt. RLS bleibt aktiv (ADR-0004).

DO $$ BEGIN
  CREATE TYPE employee_status AS ENUM ('active', 'blocked', 'anonymized');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE employees ADD COLUMN IF NOT EXISTS status employee_status NOT NULL DEFAULT 'active';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS blocked_at timestamptz;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS anonymized_at timestamptz;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS deletion_due_date date;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS retention_class varchar(32);

CREATE INDEX IF NOT EXISTS employees_deletion_due_idx ON employees (deletion_due_date);
