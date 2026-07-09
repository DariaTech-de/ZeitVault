-- ZeitVault (C-09): Bewertungsart der Schicht, gesetzt am clock_in.
-- 'full_work' Vollarbeit | 'on_call_duty' Bereitschaftsdienst (ARBEITSZEIT) |
-- 'standby' Rufbereitschaft (RUHEZEIT: keine Arbeitszeit, unterbricht die
-- Ruhe nicht) | 'travel' Reisezeit (wie Vollarbeit; eigene Lohnart/Faktor
-- ueber das Lohnartenmapping).
ALTER TABLE stamp_events
  ADD COLUMN IF NOT EXISTS work_kind varchar(16) NOT NULL DEFAULT 'full_work';
ALTER TABLE stamp_events DROP CONSTRAINT IF EXISTS stamp_events_work_kind_check;
ALTER TABLE stamp_events
  ADD CONSTRAINT stamp_events_work_kind_check
  CHECK (work_kind IN ('full_work', 'on_call_duty', 'standby', 'travel'));
