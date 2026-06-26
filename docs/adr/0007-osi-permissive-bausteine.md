# ADR-0007: OSI-/permissive Bausteine (Valkey/OpenTofu/OpenBao)

**Status:** Akzeptiert - 2026-06-26

## Kontext

ZeitVault ist ein langlebiges, ausgeliefertes Enterprise-Produkt mit zwei Betriebsmodellen (Self-Hosted On-Premises und Cloud/SaaS) aus einer Codebasis. Mehrere etablierte Infrastruktur-Bausteine, die ZeitVault braucht - ein In-Memory-Cache/Queue-Backend, ein Infrastructure-as-Code-Werkzeug und eine Secret-Verwaltung - sind in juengerer Zeit von ihren Herstellern **re-lizenziert** worden:

- **Redis** steht seit Version 8 nur noch unter **AGPLv3** (Copyleft, das ueber das Netzwerk wirkt) bzw. unter restriktiven, nicht-OSI-konformen Quellverfuegbarkeits-Lizenzen.
- **Terraform** (HashiCorp) wurde auf die **Business Source License (BSL)** umgestellt - nicht OSI-konform; HashiCorp gehoert inzwischen zu IBM.
- **HashiCorp Vault** wurde ebenfalls auf die **BSL** umgestellt.

Solche Re-Lizenzierungen sind fuer ein ausgeliefertes Produkt mehr als ein juristisches Detail: Sie wirken als **faktische Update-Huerden**. Ein Versionswechsel kann blockiert sein, weil die neue Lizenz mit dem Produkt-Lizenzmodell oder dem Vertrieb unvereinbar ist; im Ergebnis wird entweder ein Komponentenwechsel erzwungen oder man verbleibt auf einer veralteten, ggf. nicht mehr gepatchten Version. Beides widerspricht der Versions- und Update-Strategie aus [ADR-0003](0003-versions-und-update-strategie.md), die Lizenz-Stabilitaet ausdruecklich als Update-Risiko fuehrt (Paragraf 5.1, Punkt 5).

Hinzu kommt die EU-/Souveraenitaets- und CRA-Logik: ZeitVault zielt auf den deutschen Markt, betont Datenhoheit und ist als Produkt mit digitalen Elementen ab Dezember 2027 vom **Cyber Resilience Act (CRA)** betroffen (Update-Pflichten, SBOM, Schwachstellenmanagement). Eine Lieferkette aus Bausteinen unter offener, von einer neutralen Stiftung gefuehrter Governance reduziert das Risiko, durch einseitige Lizenzentscheidungen eines einzelnen Herstellers in eine Sackgasse zu geraten.

Die verbindliche Architektur legt diese Wahl in Paragraf 5 (Technologie-Stack), Paragraf 5.1 Punkt 5 (Lizenz-Stabilitaet als Update-Risiko), Paragraf 11 (Sicherheitsarchitektur, Secrets) und Paragraf 16 (Infrastruktur & DevOps) fest; Paragraf 19 markiert die OSI-/permissiven Bausteine als bewusste Entscheidung.

> Dieser Abschnitt fasst Lizenz- und Governance-Lagen zur technischen Planung zusammen und ersetzt keine Rechtsberatung. Die jeweils gueltige Lizenz einer konkreten Version ist vor Uebernahme verbindlich zu pruefen.

## Entscheidung

Wir setzen fuer die betroffenen Infrastruktur-Bausteine bewusst auf **OSI-/permissiv lizenzierte, foundation-gefuehrte** Komponenten statt auf die re-lizenzierten Originale:

1. **Cache & Queues:** **Valkey 9.x** (BSD-Lizenz, Linux Foundation) **statt Redis** (seit v8 AGPLv3). Valkey ist **RESP-kompatibel** und wird zusammen mit **BullMQ** als Cache- und Queue-Backend eingesetzt.
2. **Infrastructure as Code:** **OpenTofu 1.12** (MPL-2.0, Linux Foundation) **statt Terraform** (BSL). OpenTofu ist als **Drop-in** weitgehend kompatibel und bringt integrierte State-Verschluesselung mit.
3. **Secret-Verwaltung:** **OpenBao** (MPL-2.0, Linux-Foundation-Fork) **statt HashiCorp Vault** (BSL); alternativ **SOPS** fuer dateibasierte Secrets. OpenBao ist **API-kompatibel** zur Vault-API.

Fuer den **Objektspeicher** im Self-Hosted-Betrieb gilt dieselbe Logik als Hinweis: **SeaweedFS** (Apache-2.0) ist gegenueber **MinIO** (AGPLv3) zu bevorzugen; wird MinIO erwogen, ist die **Lizenz vor Einsatz zu pruefen**. Im Cloud-Betrieb kommt der S3-kompatible Object Storage des EU-Providers zum Einsatz (siehe Paragraf 5 und Paragraf 16).

## Begruendung

- **Lizenz-Stabilitaet als Update-Sicherheit:** Re-Lizenzierungen sind faktische Update-Huerden. OSI-/permissive Lizenzen (BSD, Apache-2.0, MPL-2.0) erlauben den Einsatz in einem ausgelieferten Produkt ohne Copyleft-Risiko ueber das Netzwerk und ohne BSL-typische Nutzungsbeschraenkungen - der Update-Pfad bleibt offen (vgl. [ADR-0003](0003-versions-und-update-strategie.md), Paragraf 5.1 Punkt 5).
- **Foundation-Governance schuetzt vor erzwungenen Wechseln:** Valkey, OpenTofu und OpenBao werden unter neutraler Stiftungs-Governance (Linux Foundation) entwickelt. Damit kann nicht ein einzelner Hersteller die Lizenz einseitig verschaerfen und so einen erzwungenen Komponentenwechsel ausloesen.
- **EU-/Souveraenitaet und CRA:** Offene, permissiv lizenzierte Bausteine unter neutraler Governance passen zur Souveraenitaets-Ausrichtung von ZeitVault und stuetzen die CRA-Vorbereitung (planbare Updates, nachvollziehbare Lieferkette, SBOM) ab Dezember 2027.
- **Kompatibilitaet erleichtert den Wechsel und haelt ihn offen:** Valkey ist RESP-kompatibel, OpenTofu ein Terraform-Drop-in, OpenBao API-kompatibel zur Vault-API. Der Umstieg von den Originalen ist dadurch gering-invasiv, und die Architektur bleibt an Standards (RESP, Terraform-HCL/State, Vault-API) statt an einer einzelnen Implementierung gekoppelt (vgl. Paragraf 5.1 Punkt 7).
- **Self-Hosted-Tauglichkeit:** Alle gewaehlten Bausteine sind frei selbst hostbar und passen in das identische Container-Image-Modell beider Betriebsmodelle (Paragraf 2, Paragraf 16).

## Konsequenzen

### Positiv

- Offener, durch Lizenzwechsel nicht blockierter Update-Pfad fuer Cache/Queue, IaC und Secrets.
- Kein Copyleft-Risiko ueber das Netzwerk (AGPLv3) und keine BSL-Nutzungsbeschraenkungen in einem ausgelieferten Produkt.
- Geringeres Klumpenrisiko durch neutrale Foundation-Governance statt Abhaengigkeit von Einzelhersteller-Entscheidungen.
- Kompatibilitaet zu den jeweiligen Standards (RESP, Terraform, Vault-API) haelt den Wechsel zurueck zu den Originalen oder weiter zu anderen Implementierungen offen.
- Beitrag zur EU-/Souveraenitaets-Ausrichtung und zur CRA-Vorbereitung (Paragraf 5.1).

### Negativ

- Die Communities von Valkey, OpenTofu und OpenBao sind teils **kleiner** als die der etablierten Originale - mit Auswirkung auf die Breite von Tutorials, Drittanbieter-Tooling und Stack-Overflow-Wissen. (Sie wachsen jedoch erkennbar.)
- Verzoegerter Feature-Gleichlauf moeglich: einzelne neue Funktionen der Originale erscheinen ggf. spaeter oder nicht im Fork.
- Geringfuegiger Verifizierungsaufwand: Kompatibilitaet (RESP/Drop-in/Vault-API) ist projektspezifisch zu testen, nicht blind anzunehmen.

### Neutral

- Die Wahl ist auf Standards, nicht auf konkrete Implementierungen gekoppelt; ein spaeterer Wechsel (in jede Richtung) ist bewusst leicht gehalten.
- Beim Objektspeicher bleibt die Self-Hosted-Wahl zwischen SeaweedFS (Apache-2.0, bevorzugt) und MinIO (AGPLv3, Lizenz zu pruefen) offen; der Cloud-Betrieb nutzt unabhaengig davon den S3-kompatiblen Speicher des EU-Providers.
- Die jeweils konkrete Version und deren Lizenz sind beim Projektstart per Lockfile/Pinning zu fixieren und ueber Renovate + EOL-Check (ADR-0003) zu pflegen.

## Betrachtete Alternativen

- **Bei den re-lizenzierten Originalen bleiben (Redis ab v8 / Terraform BSL / HashiCorp Vault BSL)** - verworfen: AGPLv3 wirkt als Copyleft ueber das Netzwerk und ist fuer ein ausgeliefertes Produkt riskant; die BSL ist nicht OSI-konform und schraenkt die Nutzung ein. Beide Lizenztypen sind faktische Update-Huerden und koennen erzwungene Wechsel ausloesen - das genaue Gegenteil des Ziels.
- **MinIO (AGPLv3) als Objektspeicher fuer Self-Hosted** - nicht ausgeschlossen, aber nachrangig: SeaweedFS (Apache-2.0) ist aus Lizenzgruenden zu bevorzugen; bei Einsatz von MinIO ist die Lizenz vor Verwendung zu pruefen.

## Verweise

- `../ARCHITEKTUR.md` Paragraf 5 - Technologie-Stack: Valkey 9.x (BSD) statt Redis, OpenTofu 1.12 (MPL-2.0) statt Terraform, OpenBao (MPL-2.0) statt Vault, SeaweedFS (Apache-2.0) / MinIO (AGPLv3 - Lizenz pruefen).
- `../ARCHITEKTUR.md` Paragraf 5.1 (Punkt 5) - Lizenz-Stabilitaet als Update-Risiko: OSI-/permissiv, foundation-gefuehrt; Schutz vor erzwungenen Wechseln; EU-/Souveraenitaets- und CRA-Logik.
- `../ARCHITEKTUR.md` Paragraf 11 - Sicherheitsarchitektur: Secrets via OpenBao (MPL-2.0) / SOPS.
- `../ARCHITEKTUR.md` Paragraf 16 - Infrastruktur & DevOps: Compose-Stack (Valkey, SeaweedFS/MinIO, OpenBao), OpenTofu-provisionierte Cloud.
- [ADR-0002: TypeScript-Monorepo und Stack](0002-typescript-monorepo-und-stack.md) - festgelegter Stack, in den diese Bausteine eingebettet sind.
- [ADR-0003: Versions- und Update-Strategie](0003-versions-und-update-strategie.md) - Lizenz-Stabilitaet als Update-Risiko (Paragraf 5.1 Punkt 5), Pflege ueber Renovate + EOL-Check.
- [README.md](README.md) - Index aller ADRs.
