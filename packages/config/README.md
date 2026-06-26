# packages/config

**Zweck:** Geteilte Entwicklungs-Konfiguration und Konventionen von ZeitVault – zentrale ESLint- und TypeScript-Konfiguration sowie verbindliche Code-/Repo-Konventionen, die von allen Apps und Paketen im Monorepo wiederverwendet werden. Eine Quelle für einheitliche Lint-Regeln, Compiler-Optionen und Stilvorgaben.

**Geplanter Tech-Stack:** TypeScript 5.x auf Node.js 24 LTS, eingebunden über Turborepo 2.x + pnpm 10. Bereitstellung gemeinsamer `tsconfig`-Basen und ESLint-Presets; Konventionen u. a. Conventional Commits. Konsum durch `apps/*` und `packages/*`.

**Architektur-Hinweis:** TypeScript-zentriertes Monorepo (Turborepo + pnpm) ist eine gesetzte Entscheidung; geteilte Konfiguration hält Builds reproduzierbar und Qualität einheitlich.

**Status:** Phase-0-Gerüst vorhanden: TS-Config-Presets (`tsconfig.library.json`, `tsconfig.nestjs.json`), ESLint-Flat-Config-Basis (`eslint.base.mjs`) und Prettier-Basis (`prettier.base.mjs`). Eingebunden über die Root-Dateien `eslint.config.mjs` / `prettier.config.mjs` und die `tsconfig`-Extends der Pakete.

**Architektur:** siehe [Paragraf 17 – Repository-Struktur](../../docs/ARCHITEKTUR.md#17-repository-struktur-für-claude-code) und [ADR-0002 (TypeScript-Monorepo und Stack)](../../docs/adr/0002-typescript-monorepo-und-stack.md).
