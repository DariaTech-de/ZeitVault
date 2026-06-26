# ADR-0003: Versions- und Update-Strategie

**Status:** Akzeptiert - 2026-06-26

## Kontext

ZeitVault ist ein ausgeliefertes Produkt mit zwei Betriebsmodellen (Self-Hosted On-Premises und Cloud/SaaS) und langer Lebensdauer. Der Technologie-Stack (Paragraf 5) umfasst zahlreiche schnelldrehende Abhaengigkeiten - Laufzeiten, Frameworks, Datenbank, Container-Basis-Images und Infrastruktur-Komponenten - deren Versionsstaende sich kontinuierlich aendern.

Das Spannungsfeld: Einerseits muss das Produkt "auf dem neuesten Stand" sein (Sicherheit, Wartbarkeit, Mitarbeitbarkeit, kuenftige CRA-Pflichten). Andererseits erzeugen Bleeding-Edge-Versionen - frisch erschienene Majors, Beta- und Current-Linien - erfahrungsgemaess *mehr* Update-Schmerz, nicht weniger: instabile APIs, fehlende Langzeit-Patches, kurze Support-Fenster und ueberraschende Breaking Changes. Fuer ein langlebiges Enterprise-Produkt, das beim Kunden on-premises betrieben wird, sind reproduzierbare Builds und planbare Update-Pfade zwingend.

Hinzu kommt ein eigenes Risiko: Re-Lizenzierungen (Redis, Terraform, Vault) sind faktisch erzwungene Update-Huerden, die einen Versionswechsel blockieren oder einen Komponentenwechsel erzwingen koennen (Lizenz-Stabilitaet, siehe [ADR-0007](0007-osi-permissive-bausteine.md)).

Die verbindliche Architektur legt diese Strategie in Paragraf 5 (Technologie-Stack) und Paragraf 5.1 (Versionsstrategie & Update-Sicherheit) fest; Paragraf 19 markiert die Versionsstaende als Stand Juni 2026, gepflegt ueber Renovate und EOL-Checks.

## Entscheidung

Wir betreiben ZeitVault auf der **neuesten stabilen Version mit Langzeit-Support, sauber gepinnt und kontrolliert aktualisiert** - bewusst **nicht** auf Bleeding-Edge. "Auf dem neuesten Stand" bedeutet damit nicht "immer die allerneueste Version", sondern die neueste stabile LTS-Linie mit planbarem Update-Pfad. Konkret gelten folgende verbindliche Regeln:

1. **LTS bevorzugen.** Laufzeiten und Plattformen werden nur in LTS-/stabilen Linien betrieben:
   - **Node.js** ausschliesslich in LTS-Linien - aktuell **Node 24 LTS** ("Krypton", Support bis April 2028); geplanter Wechsel auf **Node 26 LTS** nach dessen Promotion zur LTS im Oktober 2026. Keine ungeraden bzw. Current-Linien in Produktion.
   - **PostgreSQL** auf der neuesten **stabilen** Major (**18**), nie auf Beta (kein PostgreSQL 19 Beta).
   - Container-Basis-Images auf **Ubuntu-LTS**-Basis.

2. **Versionen festschreiben.** Builds sind reproduzierbar:
   - **`pnpm-lock.yaml`** wird committet (exakte transitive Abhaengigkeiten).
   - **Docker-Base-Images** werden per **Digest** (`@sha256:...`) gepinnt, nicht per beweglichem Tag.
   - **Helm-Chart-Versionen** werden fixiert.

3. **Updates automatisieren, aber kontrolliert.** **Renovate** (alternativ Dependabot) oeffnet Update-PRs; die CI-Suite (Unit/Integration/E2E) entscheidet als Gate, ob gemerged wird. **Patch- und Minor-Updates** laufen automatisiert (Merge bei gruener CI), **Major-Updates** sind geplante, getestete Vorgaenge.

4. **Nur unterstuetzte Versionen.** Ein **EOL-Check** ist Teil der CI; die Pipeline **bricht ab**, wenn eine Laufzeit oder Abhaengigkeit ihr End-of-Life erreicht hat. Keine produktiven EOL-Komponenten.

5. **Lizenz-Stabilitaet als Update-Risiko mitdenken.** Re-Lizenzierungen werden als Update-Huerde bewertet; wo moeglich werden OSI-/permissiv lizenzierte, foundation-gefuehrte Bausteine gewaehlt (Detail-Begruendung in [ADR-0007](0007-osi-permissive-bausteine.md)).

6. **Breaking Changes isolieren.** Major-Upgrades werden nie mit Feature-Arbeit vermischt - eigener PR, eigener Test- und Staging-Durchlauf. Wo Anbieter **Codemods** bereitstellen (Next.js, Expo, NestJS), werden diese genutzt.

## Begruendung

- **Planbarkeit und reproduzierbare Builds:** Gepinnte Lockfiles, Image-Digests und fixierte Chart-Versionen garantieren, dass derselbe Commit ueberall - On-Premises wie Cloud - identisch baut und laeuft. Das ist Voraussetzung fuer signierte, nachvollziehbare Releases.
- **Langzeit-Support statt Neuheit:** LTS-Linien liefern ueber Jahre Sicherheits-Patches und stabile APIs. Beta-/Current-Linien tun das nicht und zwingen zu haeufigen, riskanten Wechseln - gerade bei einem on-premises ausgelieferten Produkt mit langen Wartungszyklen inakzeptabel.
- **Sicherheit und Compliance:** Kontinuierliche, automatisierte Patch-/Minor-Updates schliessen Schwachstellen zeitnah; der EOL-Check verhindert, dass unsupportete (und damit ungepatchte) Komponenten in Produktion geraten.
- **Risikoisolation:** Getrennte PRs fuer Majors und Codemod-Nutzung halten das Risiko jedes einzelnen Upgrades klein und reviewbar.
- **Lizenz-Souveraenitaet:** Die bewusste Wahl permissiver, foundation-gefuehrter Bausteine schuetzt vor erzwungenen Wechseln durch Re-Lizenzierung und passt zur EU-/Souveränitaets- und CRA-Logik.
- **CRA-Vorbereitung:** Ab Dezember 2027 gelten EU-weit verpflichtende Anforderungen an Produkte mit digitalen Elementen (Schwachstellenmanagement, Update-Pflichten, SBOM, Meldewege). ZeitVault ist als ausgeliefertes Produkt betroffen; ein geordneter Update-Prozess, EOL-Disziplin, SBOM und signierte Releases sind zugleich die CRA-Vorbereitung.

## Konsequenzen

### Positiv

- Reproduzierbare, signierbare Builds ueber beide Betriebsmodelle hinweg.
- Planbare, kalkulierbare Update-Pfade; Sicherheits-Patches fliessen automatisiert und schnell ein.
- Kein versehentliches Abdriften auf unsupportete oder instabile Versionen (CI-Gate, EOL-Check).
- Substanzielle Vorarbeit fuer die CRA-Pflichten ab Dezember 2027 ist mit dem Prozess bereits geleistet.

### Negativ

- Bewusster Verzicht auf die jeweils allerneuesten Features (z. B. Node Current, PostgreSQL Beta), bis sie in eine stabile/LTS-Linie eingehen.
- Major-Upgrades erfordern geplanten Aufwand (eigene PRs, Staging-Durchlaeufe, ggf. Codemods) statt automatischem Merge.
- Renovate/Dependabot erzeugt einen kontinuierlichen Strom von Update-PRs, der Review- und CI-Kapazitaet bindet.

### Neutral

- Die konkreten Versionsstaende in Paragraf 5 sind der Stand Juni 2026; konkrete Patch-Staende werden beim Projektstart per Lockfile/Digest fixiert und danach ueber den beschriebenen Prozess gepflegt.
- Der Wechsel von Node 24 LTS auf 26 LTS ist als geplanter Major-Vorgang nach Oktober 2026 vorgemerkt, nicht als automatischer Schritt.
- Die Strategie setzt CI-Disziplin und eine funktionierende Test-Suite als Voraussetzung; ohne belastbares Gate verliert die Automatisierung ihren Schutzcharakter.

## Betrachtete Alternativen

- **Bleeding-Edge / "immer die allerneueste Version"** (frische Majors, Beta-/Current-Linien sofort uebernehmen) - verworfen: kurze Support-Fenster, instabile APIs, haeufige ueberraschende Breaking Changes; erzeugt mehr Update-Schmerz, nicht weniger, und ist mit reproduzierbaren On-Prem-Releases unvereinbar.
- **Versionen "einfrieren" und selten/manuell aktualisieren** - verworfen: fuehrt zu EOL-Komponenten, ungepatchten Schwachstellen und teuren, riskanten Big-Bang-Migrationen; widerspricht den Update-Pflichten der CRA.
- **Vollautomatisches Mergen aller Updates inkl. Majors** (Auto-Merge ohne Plan) - verworfen: Majors bringen Breaking Changes, die isoliert getestet werden muessen; ungebremstes Auto-Merge gefaehrdet die Stabilitaet.
- **Floating-Tags statt Digest-Pinning** (z. B. `node:24` statt Digest) - verworfen: Tags sind beweglich, Builds werden nicht-reproduzierbar; widerspricht reproduzierbaren, signierten Releases.

## Verweise

- `../ARCHITEKTUR.md` Paragraf 5 - Technologie-Stack (neueste stabile Versionen mit Langzeit-Support, Stand Juni 2026).
- `../ARCHITEKTUR.md` Paragraf 5.1 - Versionsstrategie & Update-Sicherheit (LTS, Pinning, Renovate/CI-Gate, EOL-Check, Breaking-Change-Isolation, CRA-Ausblick Dezember 2027).
- `../ARCHITEKTUR.md` Paragraf 19 - Annahmen & offene Entscheidungen: Versionsstaende Stand Juni 2026, Pflege ueber Renovate + EOL-Checks.
- [ADR-0002: TypeScript-Monorepo und Stack](0002-typescript-monorepo-und-stack.md) - festgelegter Stack und Versionen, auf die diese Strategie angewandt wird (pnpm 10, `pnpm-lock.yaml`).
- [ADR-0007: OSI-/permissive Bausteine](0007-osi-permissive-bausteine.md) - Lizenz-Stabilitaet als Update-Risiko (Valkey/OpenTofu/OpenBao statt Redis/Terraform/Vault).
- [README.md](README.md) - Index aller ADRs.
