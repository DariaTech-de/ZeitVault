'use client';

import { useState } from 'react';
import { MessageStrip } from '@/components/fiori/message-strip';
import { StatusPill } from '@/components/fiori/status-pill';
import { Card, PageHead } from '@/components/fiori/ui';
import { useAuth } from '@/lib/auth';

interface Topic {
  id: string;
  title: string;
  roles: Array<'employee' | 'manager' | 'admin'>;
  intro: string;
  steps?: string[];
  note?: { tone: 'info' | 'warning' | 'positive'; text: string };
}

const ROLE_LABEL: Record<string, string> = { employee: 'Mitarbeitende', manager: 'Vorgesetzte', admin: 'Administration' };

const TOPICS: Topic[] = [
  {
    id: 'anmeldung',
    title: 'Anmeldung, Rollen und Rechte',
    roles: ['employee', 'manager', 'admin'],
    intro:
      'Die Anmeldung erfolgt über den zentralen Identitätsanbieter (OIDC). Nach dem Login werden Sie automatisch dem richtigen Mitarbeiterdatensatz und Mandanten zugeordnet. Für Administratoren ist Mehrfaktor-Authentifizierung (MFA) Pflicht.',
    steps: [
      'employee: eigene Zeit stempeln, eigene Anträge stellen, eigene Salden sehen.',
      'manager: zusätzlich Anträge freigeben/ablehnen, Kontenbuchungen, Bereichs-Auswertungen, Exporte.',
      'admin: zusätzlich Stammdaten und Arbeitszeitmodelle, Rechte, Aufbewahrung/Anonymisierung, Systemübersicht.',
    ],
    note: {
      tone: 'info',
      text: 'Die Navigation ist rollenabhängig: „Verwaltung" und „Auswertungen" sind nur für Vorgesetzte/Admins sichtbar.',
    },
  },
  {
    id: 'stempeln',
    title: 'Zeiterfassung – Stempeln',
    roles: ['employee', 'manager', 'admin'],
    intro:
      'Vier Aktionen bilden den Arbeitstag ab: Kommen, Pause Beginn, Pause Ende, Gehen. Ungültige Übergänge (z. B. „Gehen" ohne „Kommen") werden abgelehnt. Bei der Erfassung prüft die Compliance-Engine Höchstarbeitszeit, Ruhezeiten und Pausen und meldet Hinweise oder Verstöße.',
    note: {
      tone: 'warning',
      text: 'Ein erfasster Stempel wird nie überschrieben oder gelöscht. Korrekturen erzeugen stets eine neue Revision mit Begründung (GoBD, Kern-Invariante 1).',
    },
  },
  {
    id: 'zeitkorrektur',
    title: 'Zeitkorrektur – Anpassungsanträge',
    roles: ['employee', 'manager', 'admin'],
    intro:
      'Der Fall „Stempel vergessen" wird vollständig abgebildet. Mitarbeitende beantragen einen Nachtrag; erst die Freigabe durch Vorgesetzte erzeugt den Stempel.',
    steps: [
      'Mitarbeitende: Bereich „Zeitkorrektur" öffnen, Stempelart, Zeitpunkt und Begründung angeben, „Antrag senden". Status ist zunächst „Beantragt".',
      'Vorgesetzte: offenen Antrag prüfen und „Freigeben" (erzeugt den Stempel append-only nach Prüfung der Tagesfolge) oder „Ablehnen".',
      'Ergibt der Nachtrag keine gültige Tagesfolge, wird die Freigabe abgelehnt und der Antrag bleibt offen.',
    ],
    note: {
      tone: 'positive',
      text: 'Antrag und erzeugter Stempel sind revisionssicher protokolliert (Audit-Ereignisse). Der Vorgänger bleibt erhalten – nichts wird überschrieben.',
    },
  },
  {
    id: 'abwesenheit',
    title: 'Abwesenheiten',
    roles: ['employee', 'manager', 'admin'],
    intro:
      'Unterstützt werden Urlaub, Krankheit und Sonderurlaub. Mitarbeitende stellen einen Antrag (Typ, Von-/Bis-Datum, optional Begründung); Vorgesetzte genehmigen oder lehnen ab. Eigene offene Anträge können storniert werden.',
    note: {
      tone: 'info',
      text: 'Jede Entscheidung wird protokolliert. Genehmigte Urlaubsanträge wirken auf das Urlaubskonto.',
    },
  },
  {
    id: 'konten',
    title: 'Konten – Überstunden, Gleitzeit, Urlaub',
    roles: ['employee', 'manager', 'admin'],
    intro:
      'Es werden drei Kontoarten geführt: Überstunden, Gleitzeit und Urlaub. Sie sehen Salden und den Kontoauszug (chronologische Buchungen mit laufendem Saldo).',
    steps: [
      'Vorgesetzte/Admins können manuelle Korrekturbuchungen erfassen: Konto, Betrag, Stichtag und Grund angeben.',
      'Alle Buchungen werden protokolliert.',
    ],
  },
  {
    id: 'stammdaten',
    title: 'Stammdaten und Arbeitszeitmodelle',
    roles: ['manager', 'admin'],
    intro:
      'Im Bereich „Verwaltung" sehen Sie alle Mitarbeitenden mit Personalnummer und Anzeigename. Die Auswahl einer Person zeigt deren Tagesereignisse (Master-Detail). Administratoren pflegen versionierte Arbeitszeitmodelle (Sollzeit je Wochentag), Feiertage je Region und Zuschläge.',
    note: {
      tone: 'info',
      text: 'Arbeitszeitmodelle sind versioniert: Änderungen erzeugen eine neue Version, bestehende Auswertungen bleiben reproduzierbar.',
    },
  },
  {
    id: 'auswertungen',
    title: 'Auswertungen und Reports',
    roles: ['manager', 'admin'],
    intro:
      'Im Bereich „Auswertungen" stehen drei Berichte bereit: Arbeitszeitnachweis (Timesheet), Verstoßreport (Hinweise/Verstöße je Zeitraum, gruppiert je Mitarbeitenden und Tag) und Saldenliste (Überstunden-, Gleitzeit- und Urlaubssalden aller Mitarbeitenden).',
  },
  {
    id: 'exporte',
    title: 'Exporte – GoBD und Lohn/DATEV',
    roles: ['manager', 'admin'],
    intro:
      'Der GoBD-Export erzeugt einen revisionssicheren Datenexport für die steuerliche Aufbewahrung. Der Lohn-/DATEV-Export erzeugt die Grundlage für die Lohnabrechnung. Alle Export-Aufträge erscheinen in der Export-Historie.',
    note: {
      tone: 'warning',
      text: 'Konkrete DATEV-Feldlayouts werden nicht erfunden. Maßgeblich ist die offizielle DATEV-Schnittstellenbeschreibung; Mapping-Tabellen werden daraus abgeleitet.',
    },
  },
  {
    id: 'aufbewahrung',
    title: 'Compliance und Aufbewahrung',
    roles: ['admin'],
    intro:
      'Aufbewahrungspflichtige Daten werden nicht hart gelöscht (Kern-Invariante 4). Bei Austritt oder Löschanfrage werden Mitarbeitende gesperrt bzw. pseudonymisiert und erst nach Ablauf der gesetzlichen Aufbewahrungsfrist automatisiert gelöscht.',
    steps: [
      'Mitarbeitenden sperren: Zugriff/Verarbeitung einschränken, Daten bleiben für die Aufbewahrung erhalten.',
      'Anonymisieren/pseudonymisieren: personenbezogene Merkmale ersetzen; revisionssichere Fakten bleiben erhalten.',
      'Fällige Löschungen: Übersicht der Datensätze mit abgelaufener Aufbewahrungsfrist.',
    ],
    note: {
      tone: 'info',
      text: 'So wird das Spannungsfeld zwischen DSGVO-Löschung und steuerlicher Aufbewahrung (GoBD) aufgelöst.',
    },
  },
  {
    id: 'sicherheit',
    title: 'Sicherheit',
    roles: ['manager', 'admin'],
    intro:
      'Sicherheit hat oberste Priorität. Jede lohn-/sicherheitsrelevante Aktion schreibt ein unveränderliches, hash-verkettetes Audit-Ereignis in ein getrenntes, append-only Ledger. Eine Manipulation älterer Einträge bricht die Hash-Kette und ist sofort erkennbar.',
    steps: [
      'Mandantentrennung wird auf Datenbankebene erzwungen (RLS) – auch bei einem Anwendungsfehler bleiben Mandanten isoliert.',
      'Least Privilege: der Anwendungs-Datenbankbenutzer darf Audit-Ereignisse nur einfügen, nicht ändern/löschen. MFA-Pflicht für Admins.',
      'Datensparsamkeit: es wird nur erhoben/protokolliert, was nötig ist. Lesende Zugriffe auf personenbezogene Daten werden protokolliert.',
    ],
    note: {
      tone: 'warning',
      text: 'GPS/Geofencing ist standardmäßig deaktiviert (Kern-Invariante 5) und wird nur nach Betriebsvereinbarung aktiviert – keine heimliche Überwachung.',
    },
  },
];

const STRIP_TONE: Record<string, 'info' | 'warning' | 'positive'> = { info: 'info', warning: 'warning', positive: 'positive' };

export function HelpCenter() {
  const { identity } = useAuth();
  const roles = identity?.roles ?? [];
  const isManager = roles.includes('manager') || roles.includes('admin');
  const isAdmin = roles.includes('admin');
  const visible = TOPICS.filter((t) => {
    if (t.roles.includes('admin') && t.roles.length === 1) return isAdmin;
    if (!t.roles.includes('employee')) return isManager;
    return true;
  });
  const [active, setActive] = useState(visible[0]?.id ?? '');

  return (
    <>
      <PageHead
        eyebrow="Hilfe · Bedienungshandbuch"
        title="Hilfe und Anleitung"
        sub="Kurzanleitungen zu allen Funktionen – rollenabhängig. Das vollständige Handbuch liegt unter docs/BEDIENUNGSHANDBUCH.md."
        right={<StatusPill tone="neutral">{visible.length} Themen</StatusPill>}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[240px_1fr]">
        <nav className="h-fit lg:sticky lg:top-20" aria-label="Themen">
          <Card className="overflow-hidden p-1.5">
            {visible.map((t) => (
              <a
                key={t.id}
                href={`#${t.id}`}
                onClick={() => setActive(t.id)}
                className={
                  active === t.id
                    ? 'block rounded-[9px] bg-primary-weak px-3 py-2 text-[13.5px] font-semibold text-primary'
                    : 'block rounded-[9px] px-3 py-2 text-[13.5px] font-medium text-ink-muted transition hover:bg-surface-2 hover:text-ink'
                }
              >
                {t.title}
              </a>
            ))}
          </Card>
        </nav>

        <div className="space-y-5">
          {visible.map((t) => (
            <Card key={t.id} id={t.id} className="scroll-mt-20 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold">{t.title}</h2>
                {t.roles.map((r) => (
                  <StatusPill key={r} tone={r === 'admin' ? 'solid' : r === 'manager' ? 'info' : 'neutral'}>
                    {ROLE_LABEL[r]}
                  </StatusPill>
                ))}
              </div>
              <p className="mt-3 text-sm leading-relaxed text-ink-muted">{t.intro}</p>
              {t.steps && (
                <ol className="mt-3 space-y-2">
                  {t.steps.map((s, i) => (
                    <li key={s} className="flex gap-3 text-sm text-ink">
                      <span className="mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full bg-surface-3 text-[11px] font-bold text-ink-muted">
                        {i + 1}
                      </span>
                      <span className="leading-relaxed">{s}</span>
                    </li>
                  ))}
                </ol>
              )}
              {t.note && (
                <div className="mt-4">
                  <MessageStrip tone={STRIP_TONE[t.note.tone]}>{t.note.text}</MessageStrip>
                </div>
              )}
            </Card>
          ))}

          <MessageStrip tone="info">
            Rechtlicher Hinweis: Die Zusammenfassungen rechtlicher Anforderungen dienen der Orientierung und ersetzen keine
            Rechtsberatung. Maßgeblich sind die offiziellen Quellen (ArbZG, GoBD, DSGVO/BDSG, DATEV-Schnittstellenbeschreibung).
          </MessageStrip>
        </div>
      </div>
    </>
  );
}
