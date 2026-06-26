# API-Dokumentation (OpenAPI 3.1)

Dieses Verzeichnis ist der Ablageort fuer die aus der **NestJS-API** (`apps/api`) generierte **OpenAPI-3.1**-Spezifikation von ZeitVault.

Verbindliche Grundlage ist die Architektur in [`../ARCHITEKTUR.md`](../ARCHITEKTUR.md); die relevanten Festlegungen zum API-Stil stehen in Paragraf 5 (Technologie-Stack) und Paragraf 6 (Leitprinzip "Offene Schnittstellen"). Eine Uebersicht aller Dokumentationsbereiche bietet der [docs-Index](../README.md).

## Zweck

ZeitVault folgt dem Leitprinzip **offener Schnittstellen**: Alles, was die UI kann, kann auch ueber die API erfolgen. Dabei werden zwei API-Stile getrennt:

- **Extern: REST + OpenAPI 3.1.** Die nach aussen sichtbare, vertraglich stabile Schnittstelle (z. B. fuer Integrationen, Self-Hosted-Automatisierung, Drittsysteme). Sie wird durch die hier abgelegte OpenAPI-3.1-Spezifikation dokumentiert. Die Spezifikation wird aus den NestJS-Controllern und DTOs **generiert** und ist damit die maschinenlesbare, versionierbare Beschreibung dieser REST-API.
- **Intern: tRPC.** Die Kommunikation zwischen Web-Frontend (`apps/web`) und API laeuft typsicher ueber tRPC und gehoert **nicht** in die externe OpenAPI-Spezifikation. Sie ist kein oeffentlicher Vertrag, sondern ein internes, typgekoppeltes Detail des Monorepos (geteilte Typen ueber `packages/types`).

Die generierte Spezifikation dient als Single Source of Truth fuer externe Consumer (z. B. zur Erzeugung von Client-SDKs, fuer API-Dokumentations-UIs und fuer Vertrags-Tests).

## Status

**Noch nicht generiert** (Stand 2026-06-26).

Die Generierung der OpenAPI-3.1-Spezifikation aus der NestJS-API wird im Zuge des Fundament-Aufbaus eingerichtet (Phase 0+, siehe Architektur Paragraf 18). Bis dahin ist dieses Verzeichnis ein Platzhalter; es existiert noch keine generierte Spezifikationsdatei.

Geplant fuer die Einrichtung:

- Generierung der Spezifikation als Teil des API-Builds (`apps/api`), abgelegt in diesem Verzeichnis.
- Einbindung in die CI/CD-Pipeline (Paragraf 16), damit die Spezifikation bei jeder relevanten Aenderung aktuell gehalten und versioniert wird.
- Bereitstellung als veroeffentlichter Vertrag fuer externe Consumer.

Sobald die Generierung eingerichtet ist, wird diese Datei um den konkreten Generierungs-Befehl, den Dateinamen der erzeugten Spezifikation und die Bezugsquelle ergaenzt.
