-- ZeitVault (B-07): Geburtsdatum als OPTIONALES Stammdatum, Zweckbindung:
-- ausschliesslich die automatische Aktivierung/Umschaltung des
-- JArbSchG-Regelwerks fuer Beschaeftigte unter 18 (Datensparsamkeit,
-- ARCHITEKTUR Paragraf 12; PO-Freigabe vom 2026-07-08). Keine weitere
-- Auswertung, keine Anzeige ausserhalb der Stammdatenpflege.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS birth_date date;
