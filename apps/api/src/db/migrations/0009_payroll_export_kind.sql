-- ZeitVault Phase 3 / D3: generischer Lohnexport als zusätzliche ExportJob-Art.
-- Der konkrete DATEV-Datensatz bleibt blockiert (CLAUDE.md §9); dies ist nur die
-- Protokoll-Art für den GENERISCHEN, neutralen CSV-Export.
ALTER TYPE export_kind ADD VALUE IF NOT EXISTS 'payroll_generic';
