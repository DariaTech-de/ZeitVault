-- ZeitVault Phase 1 / B3: idempotente Offline-Synchronisation von Stempelungen.
-- client_event_id ist der vom Client erzeugte Idempotenzschlüssel; (tenant_id,
-- client_event_id) ist eindeutig. Erneutes Senden (Reconnect/Retry) erzeugt
-- damit keine Dubletten. Server-erzeugte Ereignisse lassen die Spalte NULL
-- (partieller Unique-Index).

ALTER TABLE stamp_events ADD COLUMN IF NOT EXISTS client_event_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS stamp_events_client_uq
  ON stamp_events (tenant_id, client_event_id)
  WHERE client_event_id IS NOT NULL;
