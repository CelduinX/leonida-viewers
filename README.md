# LEONIDA — GTA VI Twitch Live Analytics

Ein vollständiges, responsives Dashboard mit offizieller Twitch-Helix-Anbindung, animierten Zahlen, Länder- und Sprach-Rankings, Streamersuche, echter Historie und geschützter Länderverwaltung. Die Standardansicht zeigt ausschließlich echte Twitch-Messungen. Ohne Zugangsdaten erscheint ein Einrichtungsstatus.

## Starten

Voraussetzung: **Node.js 24 oder neuer**. Es gibt keine externen Laufzeitabhängigkeiten; TypeScript wird nur zum Bauen benötigt.

```sh
cp .env.example .env
npm install
npm run dev
```

Dashboard: <http://127.0.0.1:3000>. Die lokale SQLite-Datenbank wird unter `data/leonida.sqlite` angelegt. Quelldateien werden im Entwicklungsmodus beobachtet; nach Änderungen bitte den Browser neu laden.

In dieser Arbeitsumgebung ist zusätzlich `./leonida` verfügbar. Der Starter findet auch die mit der ChatGPT-App gelieferte Node-Laufzeit und nutzt den bereits lokal vorhandenen TypeScript-Compiler.

Die ausdrücklich markierte **Designvorschau** kann über den Link im Footer oder `/?preview=1` geöffnet werden. Sie enthält feste, fiktive Kanäle und Beispielzahlen. Sie ruft Twitch nicht ab, verändert ihre Beispieldaten nicht, schreibt keine Snapshots und verlinkt keine erfundenen Twitch-Kanäle. Sie ist opt-in; produktive API-Antworten enthalten keine Beispieldaten.

## Twitch konfigurieren

1. Eine Anwendung in der [Twitch Developer Console](https://dev.twitch.tv/console/apps) registrieren.
2. `TWITCH_CLIENT_ID` und `TWITCH_CLIENT_SECRET` in `.env` bzw. als geheime Server-Umgebungsvariablen hinterlegen. Nie in Browser-Code, Git oder öffentliche Hosting-Metadaten aufnehmen.
3. Server neu starten. OAuth Client Credentials, automatische Token-Erneuerung, stündliche Tokenvalidierung und Erfassung starten automatisch.
4. Die Kategorie wird mit Get Games anhand des exakten Namens `Grand Theft Auto VI` gesucht. Wenn sie nicht gefunden wird, kann `TWITCH_GAME_ID` als expliziter Fallback hinterlegt werden. Die ID wird mit Get Games validiert. Wähle ausschließlich die richtige GTA-VI-Kategorie; es gibt keinen automatischen Wechsel auf GTA V.

| Variable | Standard | Bedeutung |
| --- | --- | --- |
| `TWITCH_CLIENT_ID` | leer | Serverseitige Twitch-App-ID |
| `TWITCH_CLIENT_SECRET` | leer | Serverseitiges Twitch-App-Secret |
| `TWITCH_GAME_ID` | leer | Optionaler, validierter Kategorie-ID-Fallback |
| `POLL_INTERVAL_SECONDS` | `60` | Erfassungsintervall, 30–3.600 Sekunden |
| `COLLECTION_BUDGET_SECONDS` | `40` | Zeitbudget pro Erfassung, 5–50 Sekunden |
| `MAX_STREAM_PAGES` | `400` | Pagination-Sicherheitsgrenze, 1–1.000 Seiten à 100 Streams |
| `HISTORY_RETENTION_DAYS` | `30` | Aufbewahrung vollständiger Snapshots, 1–365 Tage |
| `ADMIN_TOKEN` | leer | Mindestens 32 Zeichen; schützt die Länderverwaltung |
| `CRON_TOKEN` | leer | Separater Token mit mindestens 32 Zeichen für externe Abruf-Jobs |
| `DATABASE_PATH` | `./data/leonida.sqlite` | Persistenter SQLite-Pfad, nur Node |
| `HOST` | `127.0.0.1` | Netzwerkadresse, für Container `0.0.0.0` |
| `PORT` | `3000` | HTTP-Port, nur Node |

Es sind keine Zugangsdaten im Repository enthalten.

## Datenmodell und Genauigkeit

- Die globalen Zuschauerzahlen sind die Summe von `viewer_count` der erfassten Live-Streams. Sie sind **keine deduplizierte Anzahl einzelner Menschen**. Eine Person kann mehrere Kanäle ansehen.
- Alle Streams werden mit Cursor-Pagination abgerufen und anhand ihrer Stream-ID dedupliziert. Die Rankings sortieren nach den letzten echten Messwerten. Bei identischen Zahlen sorgt die ID für eine stabile Reihenfolge.
- Die Streams-Liste verändert sich während einer Abfrage. Selbst nach durchlaufener Pagination kann Twitch Streams überspringen. Die Summe ist eine Erfassung über ein Zeitfenster, kein atomarer weltweiter Messpunkt. Abrufbeginn und Zeitpunkt der letzten erfolgreichen Streams-Seite bleiben gespeichert.
- Fehler auf der ersten Seite bewahren den vorherigen Snapshot. Fehler auf späteren Seiten, wiederholte Cursor, Seiten- und Zeitlimits erzeugen eine klar markierte **Teilerfassung**. Diese wird nie als exakte globale Gesamtzahl bezeichnet.
- Nach Fehlern oder zu alten Messwerten erscheint **Daten veraltet**. Das Frontend generiert keine neuen Werte und setzt den Messzeitstempel nicht künstlich zurück.
- Deltas werden nur zwischen vollständigen Snapshots derselben Kategorie berechnet. Neu erfasste Streams haben zunächst kein Delta. Teilmessungen werden im historischen Chart orange gekennzeichnet.
- Herkunftsland bedeutet das manuell zugeordnete Land eines **Streamers**, nicht den Aufenthaltsort seiner Zuschauer. Twitch bietet dafür kein zuverlässiges Herkunftslandfeld. Sprachcodes werden ausschließlich in der separaten Sprachansicht verwendet.
- `Unbekannt` ist immer Teil der globalen Summe. Die Zuordnungsquote wird sowohl über Zuschauer als auch über die Anzahl zugeordneter Kanäle transparent dargestellt.
- Länderänderungen gelten rückwirkend für die beiden aktuellen Ranking-Snapshots. Historische globale Zuschauerzahlen werden dadurch nicht verändert. Es werden keine historischen Länderzuordnungen behauptet.

Offizielle Grundlagen: [Get Streams / Get Games / Get Users](https://dev.twitch.tv/docs/api/reference/), [Client Credentials](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#client-credentials-grant-flow), [Rate Limits und Pagination](https://dev.twitch.tv/docs/api/guide/).

## Animationen und Performance

Ein gemeinsamer `requestAnimationFrame`-Scheduler interpoliert sichtbare Werte vom vorherigen echten Messwert zum neuesten Messwert, ungefähr über das Abrufintervall. Neue Ziele übernehmen den aktuell angezeigten Zwischenwert ohne Sprung. Gleiche Ziele starten keine neue Animation. DOM-Textänderungen sind auf ungefähr 30 fps begrenzt; verdeckte Elemente werden über `IntersectionObserver` ausgelassen. Hintergrund-Tabs pausieren. Die Systemeinstellung für reduzierte Bewegung schaltet Zählanimationen aus.

Die Positionsanimationen verwenden FLIP und die Web Animations API. Die Listen bleiben nach den **Messwerten** sortiert, unabhängig vom Animationsfortschritt. Streamer werden in Seiten von 50 Einträgen nachgeladen; die Suche und Filter berücksichtigen sämtliche erfassten Kanäle. Die Historie liefert höchstens etwa 240 tatsächlich gespeicherte Punkte pro Zeitraum. Der Chart erzeugt keine zusätzlichen Messungen und startet seine Y-Achse bei Bedarf oberhalb von Null.

## Länderzuordnung pflegen

Token mit beispielsweise `openssl rand -hex 32` erzeugen und serverseitig als `ADMIN_TOKEN` setzen. Im Dashboard **Verwaltung** öffnen, Token eingeben und numerische Twitch-User-ID, ISO-3166-1-alpha-2-Code (z. B. `DE`) und optional eine Quellen-Notiz speichern. Der Browser hält den Token ausschließlich im Arbeitsspeicher und verwirft ihn beim Sperren oder Schließen des Dialogs.

Die Twitch-User-ID steht auch in `/api/dashboard` unter `snapshot.streams[].userId`. Die API verwendet IDs, damit Namensänderungen keine Zuordnungen zerstören. Die Verwaltung unterstützt JSON-Import/-Export und einzelne Löschungen. Importe sind atomar und auf 500 Einträge bzw. 200 KB beschränkt. Vor Änderungen kann der aktuelle Stand exportiert werden.

```json
{
  "mappings": [
    { "userId": "123456789", "countryCode": "DE", "note": "Vom Streamer bestätigt" }
  ]
}
```

Dieser Eintrag ist ausschließlich ein Formatbeispiel, keine vorinstallierte Länderzuordnung. Es werden keine ungeprüften Länderzuordnungen ausgeliefert.

Geschützte Endpunkte:

- `GET /api/admin/mappings`: aktuelle Zuordnungen.
- `PUT /api/admin/mappings`: validierter Import bzw. Upsert.
- `DELETE /api/admin/mappings`: JSON-Body `{ "userId": "…" }`.
- Authentifizierung jeweils `Authorization: Bearer <ADMIN_TOKEN>`.

Nach 20 fehlgeschlagenen Anmeldungen wird die IP für bis zu 15 Minuten blockiert. Der Node-Adapter verwendet die Socket-IP und ignoriert vom Client gesetzte Proxy-IP-Header. Hinter einem Reverse Proxy teilen Besucher deshalb standardmäßig dessen IP; für eine öffentliche Installation sollte zusätzlich am vertrauenswürdigen Proxy begrenzt werden. Hosted Cloudflare verwendet `CF-Connecting-IP`. Die Admin-API akzeptiert keine CORS-Freigaben und weist Cross-Site-Schreibzugriffe zurück.

## Betrieb

```sh
npm run typecheck
npm run build
npm test
npm start
```

Der Node-Server verwendet WAL, Foreign Keys und eine gemeinsame Datenbank-Sperre mit Ablaufzeit. Alle Besucher teilen sich den Cache. Browser fragen den gemeinsamen Stand alle zehn Sekunden ab; Twitch wird dadurch höchstens im konfigurierten Serverintervall abgefragt. Der lokale Server erfasst unabhängig von geöffneten Browserfenstern. Im Entwicklungsmodus werden `.env`-Werte automatisch geladen.

401-Antworten erneuern den App-Token einmal. 429 berücksichtigt `Ratelimit-Reset` und `Retry-After`. Netzwerk-/5xx-Fehler werden mit begrenztem exponentiellem Backoff wiederholt. Abfragen haben sowohl ein einzelnes Timeout als auch ein Gesamtbudget; lange Wartezeiten verschieben den nächsten Abruf. Profilbilder werden separat für einen Tag gecacht. Ihr Ausfall verwirft keine Zuschauer-Messungen.

Snapshots, Streamdaten und Länderzuordnungen liegen persistent in SQLite/D1. Große Streamlisten werden in begrenzte Datenbank-Chunks aufgeteilt. Der Collector entfernt Snapshots nach der konfigurierten Aufbewahrungsdauer; die Löschung kaskadiert auf ihre Stream-Chunks. SQLite-Dateien und WAL müssen auf einem persistenten, lokal angebundenen Volume liegen. Für mehrere unabhängige Container keine lokale SQLite-Datei kopieren; verwende die D1-Variante oder einen gemeinsamen externen Collector.

### Docker

```sh
docker build -t leonida-live .
docker run --name leonida -p 3000:3000 --env-file .env \
  -v leonida-data:/app/data leonida-live
```

TLS und Domain werden über einen Reverse Proxy bereitgestellt. `GET /api/health` prüft die Datenbank-Erreichbarkeit und meldet zusätzlich, ob Twitch konfiguriert ist. In Produktion niemals `.env` oder Datenbankdateien öffentlich ausliefern. Der Server stellt ausschließlich explizit eingebettete öffentliche Assets bereit und setzt CSP, `nosniff` und weitere Schutzheader.

### Cloudflare Worker / Sites

`npm run build` erzeugt einen eigenständigen Worker unter `dist/server/index.js`. Der Worker enthält die gleichen HTTP-Routen und eingebetteten Browser-Assets. Er erwartet das D1-Binding **`DB`** und die oben genannten Secret-Bindings. `.openai/hosting.json` enthält die private Site-Identität und die Datenbankbindung. Schemaänderungen werden als versionierte Migrationen unter `drizzle/` bereitgestellt; das SQLite-Gegenstück liegt unter `migrations/`.

Wichtig: In einer Serverless-Laufzeit gibt es keinen dauerhaft laufenden `setInterval`. Seitenaufrufe lösen fällige Erfassungen über `waitUntil` aus. Für Messungen **ohne Besucher** muss beim Hosting ein minütlicher Cron-Trigger für den exportierten `scheduled`-Handler eingerichtet werden. Alternativ ein externer minütlicher Job:

```sh
curl -X POST https://DEINE-DOMAIN/api/collect \
  -H "Authorization: Bearer $CRON_TOKEN"
```

Geheime Werte im Secret-Store des Hostings konfigurieren. Eine Veröffentlichung ohne Twitch-Credentials bleibt bewusst im Einrichtungszustand. Ein Produktions-Cron wird nicht allein durch das Vorhandensein des `scheduled`-Handlers aktiviert. Die manuelle Aktualisierung umgeht weder die gemeinsame Sperre noch das Twitch-Abrufintervall.

## Dateien

- `src/server.ts`: Fetch-basierte HTTP-API, Twitch-Client, Collector, Cache-Sperre, Aggregation, Administration.
- `src/client.ts`: Dashboard, geteilte Animationssteuerung, Suche, Filter, Rankings, Chart und Admin-Dialog.
- `src/types.ts`: gemeinsame strenge Datentypen.
- `src/demo.ts`: feste, ausschließlich explizit aktivierbare Design-Beispiele.
- `public/index.html`, `public/style.css`: zugängliche semantische Oberfläche und responsives Design; vollständig lokal, keine externen Schrift- oder Script-CDNs.
- `scripts/database.mjs`, `scripts/serve.mjs`: Node-SQLite-Adapter und HTTP-Server.
- `tests/collector.test.mjs`: Integrationstests mit echter In-Memory-SQLite-Datenbank und gemockten offiziellen Twitch-Endpunkten.

Der Stack verwendet TypeScript, native Web-APIs und SQLite/D1 statt Next.js/Tailwind/Motion/Recharts. So sind Server und Browser ohne externe Laufzeitpakete einsetzbar. Das Layout, die Animationen und die interaktive Datenvisualisierung sind vollständig implementiert.
