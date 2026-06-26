-- ZeitVault Phase 1 / B1: Korrektur von Stempelungen als append-only Ereignis.
-- Eine Korrektur ist ein NEUER stamp_events-Datensatz, der via corrects_event_id
-- auf das ueberschriebene Ereignis verweist und eine Pflicht-Begruendung traegt
-- (Kern-Invariante 1, GoBD). UPDATE/DELETE bleiben per Trigger verboten.

ALTER TABLE stamp_events ADD COLUMN IF NOT EXISTS corrects_event_id uuid;
ALTER TABLE stamp_events ADD COLUMN IF NOT EXISTS correction_reason text;

-- Begruendung ist Pflicht, sobald ein Vorgaenger korrigiert wird.
ALTER TABLE stamp_events DROP CONSTRAINT IF EXISTS stamp_events_correction_reason_ck;
ALTER TABLE stamp_events ADD CONSTRAINT stamp_events_correction_reason_ck
  CHECK (corrects_event_id IS NULL OR correction_reason IS NOT NULL);

CREATE INDEX IF NOT EXISTS stamp_events_corrects_idx ON stamp_events (corrects_event_id);
