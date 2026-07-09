-- ZeitVault (C-08): Gemeindespezifische Feiertage als EXPLIZITE Schluessel am
-- Einsatzort ('fronleichnam' | 'mariae_himmelfahrt' | 'friedensfest').
-- ZeitVault fuehrt bewusst keine amtliche Gemeindeliste (AGS); welche
-- Ausnahme gilt, pflegt die Administration je Einsatzort (Landesrecht).
ALTER TABLE work_locations
  ADD COLUMN IF NOT EXISTS municipal_holiday_keys jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE work_locations DROP CONSTRAINT IF EXISTS work_locations_municipal_keys_array;
ALTER TABLE work_locations
  ADD CONSTRAINT work_locations_municipal_keys_array
  CHECK (jsonb_typeof(municipal_holiday_keys) = 'array');
