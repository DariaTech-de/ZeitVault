-- ZeitVault (B-13): Verstosswarnungen PRAEVENTIV beim Erfassen - die Warnung
-- erreicht den Mitarbeitenden (Stempel-Antwort/Heute-Ansicht) UND die
-- Fuehrungskraft (diese Inbox). RLS aktiv (Kern-Invariante 3).
CREATE TABLE IF NOT EXISTS notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    varchar(64) NOT NULL,
  -- Zielgruppe: Rolle (heute 'manager'); eine personenscharfe
  -- FK-Zuordnung existiert noch nicht als Stammdatum.
  audience     varchar(32) NOT NULL DEFAULT 'manager',
  employee_id  uuid NOT NULL,
  code         varchar(64) NOT NULL,
  severity     varchar(16) NOT NULL,
  message      text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  read_at      timestamptz
);
CREATE INDEX IF NOT EXISTS notifications_tenant_idx ON notifications (tenant_id, created_at);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_tenant_isolation ON notifications;
CREATE POLICY notifications_tenant_isolation ON notifications
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
