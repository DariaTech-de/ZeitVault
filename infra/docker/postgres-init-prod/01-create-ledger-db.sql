-- Legt beim ersten Initialisieren die getrennte Audit-Ledger-Datenbank an
-- (Vertrauensgrenze, ADR-0006). In Produktion: eigener DB-User mit
-- ausschliesslich INSERT/SELECT auf audit_events, ohne BYPASSRLS.
CREATE DATABASE zeitvault_ledger OWNER zeitvault;
