-- ZeitVault (B-04): Nachtarbeitnehmer-Kennzeichen (§ 2 Abs. 5 ArbZG) als
-- Stammdatum. Bestimmt die KUERZERE Ausgleichsperiode nach § 6 Abs. 2;
-- Pflege durch die Personalverwaltung (keine automatische Klassifikation).
ALTER TABLE employees ADD COLUMN IF NOT EXISTS night_worker boolean NOT NULL DEFAULT false;
