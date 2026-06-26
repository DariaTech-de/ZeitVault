# ADR-NNNN: <Kurzer, aussagekraeftiger Titel>

**Status:** <Vorgeschlagen | Akzeptiert | Abgeloest | Verworfen> - <JJJJ-MM-TT>

## Kontext

<Welche Kraefte, Anforderungen und Randbedingungen fuehren zu dieser Entscheidung? Welches Problem soll geloest werden? Hier nur Fakten und Spannungsfelder beschreiben, noch keine Entscheidung. Relevante Bezuege zu `../ARCHITEKTUR.md` (z. B. "Paragraf 7") und zu bestehenden ADRs benennen.>

## Entscheidung

<Die getroffene Entscheidung in einem klaren Aktivsatz: "Wir verwenden ...", "Wir fuehren ein ...". Praezise und ohne Konjunktiv.>

## Begruendung

<Warum diese Entscheidung? Welche Kriterien (z. B. Sicherheit, Wartbarkeit, Lizenz, Compliance, Self-Hosted-Tauglichkeit) waren ausschlaggebend?>

## Konsequenzen

### Positiv

- <Vorteile, die sich aus der Entscheidung ergeben.>

### Negativ

- <Nachteile, Kosten, neue Verpflichtungen.>

### Neutral

- <Folgen, die weder klar Vor- noch Nachteil sind, aber dokumentiert werden sollten.>

## Betrachtete Alternativen

- **<Alternative A>** - <Kurzbeschreibung und Grund fuer/gegen die Wahl.>
- **<Alternative B>** - <Kurzbeschreibung und Grund fuer/gegen die Wahl.>

## Verweise

- `../ARCHITEKTUR.md` Paragraf <N> - <Bezug>
- [ADR-NNNN: <Titel>](NNNN-dateiname.md) - <verwandte Entscheidung>

---

## Anleitung: Eine neue ADR anlegen

Diese Datei ist die wiederverwendbare Vorlage. So entsteht eine neue ADR:

1. **Naechste fortlaufende Nummer ermitteln.** ADRs werden durchgaengig vierstellig nummeriert (`0001`, `0002`, ...). Die naechste Nummer ist die hoechste vorhandene Nummer plus eins. Die aktuell vergebenen Nummern stehen im Index [`README.md`](README.md).
2. **Datei aus dieser Vorlage kopieren.** Dateiname-Schema: `NNNN-kurz-beschreibender-titel.md` (Kleinbuchstaben, Bindestriche statt Leerzeichen, keine Umlaute - z. B. `0011-kms-auswahl.md`).
3. **Inhalte ausfuellen.** Alle Platzhalter (`<...>`, `NNNN`) ersetzen. Format und Reihenfolge der Abschnitte (`Kontext`, `Entscheidung`, `Begruendung`, `Konsequenzen`, `Betrachtete Alternativen`, `Verweise`) unveraendert beibehalten.
4. **Status setzen.** Erlaubte Status-Werte:
   - **Vorgeschlagen** - in Diskussion, noch nicht verbindlich.
   - **Akzeptiert** - beschlossen und verbindlich.
   - **Abgeloest** - durch eine neuere ADR ersetzt; im Statuszusatz die ersetzende ADR verlinken (z. B. `Abgeloest durch ADR-0042`).
   - **Verworfen** - geprueft und bewusst nicht weiterverfolgt.
   Die Statuszeile enthaelt zusaetzlich das Datum im Format `JJJJ-MM-TT`.
5. **Index aktualisieren.** Neue ADR in der Tabelle in [`README.md`](README.md) mit Nummer, Titel und Status eintragen.
6. **Unveraenderlichkeit beachten.** Eine akzeptierte ADR wird inhaltlich nicht umgeschrieben. Aenderungen an einer getroffenen Entscheidung erfolgen ueber eine **neue** ADR, welche die alte auf Status **Abgeloest** setzt (Nygard-Stil: ADRs sind ein nachvollziehbares Protokoll, kein Wiki).
