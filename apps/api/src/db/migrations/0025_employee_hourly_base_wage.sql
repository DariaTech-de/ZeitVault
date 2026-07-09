-- ZeitVault (C-06): Grundlohn (Stundenlohn) als GANZZAHLIGE Cent - Geld ist
-- nie Float (kein numeric-Bruch, kein double). Optional: ohne gesetzten
-- Grundlohn werden Zuschlagsminuten ausgewiesen, aber keine Betraege
-- berechnet. Basis fuer die getrennten Grenzen steuerfrei (50 EUR/h) und
-- SV-frei (25 EUR/h).
ALTER TABLE employees ADD COLUMN IF NOT EXISTS hourly_base_wage_cents integer;
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_hourly_base_wage_nonneg;
ALTER TABLE employees
  ADD CONSTRAINT employees_hourly_base_wage_nonneg
  CHECK (hourly_base_wage_cents IS NULL OR hourly_base_wage_cents >= 0);
