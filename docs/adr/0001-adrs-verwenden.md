# ADR-0001: Wir nutzen Architecture Decision Records (ADRs)

**Status:** Akzeptiert - 2026-06-26

## Kontext

ZeitVault ist eine Enterprise-Zeiterfassung fuer den deutschen Markt (Hersteller DariaTech) mit einer Codebasis fuer zwei Betriebsmodelle (Self-Hosted On-Premises und Cloud/SaaS). Die Architektur trifft eine Vielzahl nicht-trivialer Entscheidungen mit langer Lebensdauer und weitreichenden Konsequenzen - etwa die Wahl des Monorepo-Tools, des ORM, des Mandanten-Modells oder der OSI-/permissiv lizenzierten Bausteine.

Solche Entscheidungen muessen **nachvollziehbar dokumentiert** werden: Spaeter beteiligte Personen (und die Weiterentwicklung mit Claude Code) sollen verstehen, *warum* eine Entscheidung getroffen wurde, welche Alternativen geprueft wurden und welche Randbedingungen galten. Wird das nur in Pull-Request-Diskussionen, Chats oder Koepfen festgehalten, geht der Kontext verloren; Entscheidungen werden unbewusst wieder aufgerollt oder unterlaufen.

Die verbindliche Architektur (`../ARCHITEKTUR.md`) fordert dies ausdruecklich: Jede nicht-triviale Entscheidung gehoert als ADR nach `docs/adr/` (Paragraf 17). Mehrere offene Entscheidungen (Paragraf 19, z. B. KMS/HSM-Wahl, Lizenzmodell) sind explizit als spaeter per ADR zu dokumentieren markiert.

## Entscheidung

Wir fuehren **Architecture Decision Records (ADRs) im Nygard-Stil** im Verzeichnis `docs/adr/`. Jede nicht-triviale Architektur- oder Technologieentscheidung wird als eigene, fortlaufend nummerierte ADR-Datei festgehalten. ADRs sind unveraenderliche Protokolleintraege: Eine getroffene Entscheidung wird nicht umgeschrieben, sondern bei Bedarf durch eine neue ADR abgeloest.

Alle ADRs folgen dem einheitlichen Format und der Anleitung der Vorlage [`0000-adr-vorlage.md`](0000-adr-vorlage.md). Erlaubte Status-Werte sind **Vorgeschlagen**, **Akzeptiert**, **Abgeloest** und **Verworfen**. Der Index [`README.md`](README.md) listet alle ADRs.

## Begruendung

- **Nachvollziehbarkeit (Compliance by Design):** ZeitVault unterliegt GoBD und DSGVO; eine nachvollziehbare Verfahrens- und Entscheidungsdokumentation passt zur Grundhaltung des Produkts (Paragraf 3, Paragraf 9).
- **Geringe Huerde, hoher Nutzen:** ADRs sind einfache Markdown-Dateien direkt im Repository, versioniert mit dem Code, reviewbar im selben Pull-Request - kein zusaetzliches Werkzeug.
- **Eignung fuer die Entwicklung mit Claude Code:** Verbindliche, an einem Ort gebuendelte Entscheidungen reduzieren Mehrdeutigkeit und verhindern, dass bereits getroffene Festlegungen erneut diskutiert werden.
- **Nygard-Stil** ist das etablierte, leichtgewichtige De-facto-Format und benoetigt keine Eigenkonvention.

## Konsequenzen

### Positiv

- Architekturentscheidungen sind zentral, versioniert und nachvollziehbar dokumentiert.
- Neue Beteiligte koennen den Werdegang der Architektur ohne Ruecksprache rekonstruieren.
- Reviews werden klarer, weil Entscheidungen mit Begruendung und Alternativen vorliegen.

### Negativ

- Zusaetzlicher Schreibaufwand bei jeder nicht-trivialen Entscheidung.
- Der Index muss bei jeder neuen ADR mitgepflegt werden (Disziplin erforderlich).

### Neutral

- ADRs sind unveraenderlich: Aenderungen einer Entscheidung erzeugen eine neue ADR und setzen die alte auf **Abgeloest** - die Historie waechst monoton.
- Die Abgrenzung "trivial vs. nicht-trivial" bleibt eine Ermessensentscheidung des Teams.

## Betrachtete Alternativen

- **Keine formale Entscheidungsdokumentation** (nur Pull-Request- und Chat-Verlauf) - verworfen: Kontext geht verloren, Entscheidungen werden unbewusst wieder aufgerollt.
- **Entscheidungen im Architekturdokument** (`../ARCHITEKTUR.md`) pflegen - verworfen: Das Dokument beschreibt den Zielzustand ("das Was und Warum"), nicht den chronologischen Entscheidungsverlauf; vermischt man beides, wird es unuebersichtlich und schwer reviewbar.
- **Eigenes Wiki / externes Tool** - verworfen: zusaetzliches Werkzeug, nicht mit dem Code versioniert, nicht im selben Review-Fluss.

## Verweise

- `../ARCHITEKTUR.md` Paragraf 17 - Repository-Struktur; Empfehlung "Jede nicht-triviale Entscheidung als ADR in `docs/adr/`".
- `../ARCHITEKTUR.md` Paragraf 19 - offene Entscheidungen, die als ADR zu dokumentieren sind.
- `../ARCHITEKTUR.md` Paragraf 20 - Naechste Schritte: "erste ADRs schreiben".
- [ADR-0000: ADR-Vorlage](0000-adr-vorlage.md) - einheitliches Format und Anlege-Anleitung.
- [README.md](README.md) - Index aller ADRs.
