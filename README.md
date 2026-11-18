# LEONIDA · GTA VI Live Analytics

Twitch-Live-Dashboard mit flüssigen Zahlenanimationen, Länder- und Streamer-Rankings, Suche, Sprachansicht, gespeicherter Historie und dauerhaften Zuschauerrekorden. Der eigenständige Worker erfasst Twitch auch bei **null Website-Besuchern**.

## Docker Compose: Installation

Voraussetzung: Docker mit Compose v2.20+.

```sh
git clone https://github.com/CelduinX/leonida-viewers.git
cd leonida-viewers
cp .env.example .env
```

In `.env` die Twitch Client ID und das Client Secret sowie ein zufälliges `POSTGRES_PASSWORD` und `ADMIN_TOKEN` setzen. Für Twitch die App als **Confidential** mit Redirect-URL `http://localhost:3000` registrieren. Der verwendete Client-Credentials-Flow selbst benötigt keine Weiterleitung.

Wer Node.js 24 installiert hat, kann fehlende lokale Datenbank-/Admin-Geheimnisse mit `node scripts/setup-env.mjs` erzeugen. Vorhandene Twitch-Einträge bleiben erhalten. Ohne Node genügt es, diese Werte im Editor einzutragen.

```sh
docker compose pull
docker compose up -d
```

Dashboard: <http://localhost:3000>. Standardmäßig bindet Web ausschließlich an `127.0.0.1`. Für einen entfernten Browser oder einen Proxy außerhalb des Hosts `WEB_BIND_ADDRESS` gezielt konfigurieren. Der PostgreSQL-Port wird **nicht** am Host veröffentlicht. Für HTTPS einen Reverse Proxy vor Web betreiben.

**Updates benötigen dieselben zwei Befehle:**

```sh
docker compose pull
docker compose up -d
```

Web und Worker verwenden `ghcr.io/celduinx/leonida-viewers:latest`. `IMAGE_TAG=sha-<vollständiger-commit-sha>` fixiert eine Version. Das Image unterstützt `linux/amd64` und `linux/arm64`.

## Rekorde

- Globale Zuschauer- und Kanalrekorde, Länderrekorde und kanalbezogene GTA-VI-Peaks werden dauerhaft in der Datenbank gespeichert.
- Es zählen ausschließlich **vollständige, echte Twitch-Erfassungen**. Teilerfassungen, Fehler, Designvorschau und animierte Zwischenwerte aktualisieren keine Rekorde.
- Gleichstände bewahren ihren ersten Zeitpunkt. Zuschauer- und Kanalmaxima besitzen eigene Zeitstempel.
- Alle Zeitstempel sind UTC-Epoch-Millisekunden; das Dashboard zeigt die lokale Zeitzone an.
- Jeder Rekord gilt **seit Beginn der Aufzeichnung**. Alte Messwerte werden nicht rückwirkend erfunden. Bestehende Snapshots erzeugen beim Upgrade nicht automatisch historische Rekorde.
- Länderrekorde verwenden die manuelle User-ID-Zuordnung zum Messzeitpunkt. Eine spätere Änderung schreibt vergangene Rekorde nicht um. Unbekannte Kanäle bleiben in der globalen Summe.

## Betrieb prüfen

```sh
docker compose ps
docker compose logs --tail=30 worker
curl -fsS http://localhost:3000/api/health
curl -fsS http://localhost:3000/api/health/monitoring
```

`/api/health` prüft die Datenbank und liefert zusätzlich den Monitor-Status. `/api/health/monitoring` prüft den Worker-Heartbeat und hängt bei einem ausgefallenen/blockierten Worker HTTP 503 an. `live` zeigt separat, ob eine aktuelle vollständige Twitch-Messung vorliegt. Ein laufender Worker bleibt bei Twitch-Ausfällen gesund, meldet aber `live:false`, Fehlerstatus und den letzten erfolgreichen Messzeitpunkt. Ein fehlender Twitch-Schlüssel wird ausdrücklich als nicht eingerichtet angezeigt.

## Backup

```sh
./scripts/backup.sh
# Bewusste Wiederherstellung ersetzt den Datenbestand:
./scripts/restore.sh backups/leonida-DATUM.dump --replace
```

Das benannte Volume `postgres-data` bleibt über Updates und Container-Neuerstellungen bestehen. `docker compose down -v` löscht es; Backups sollten zusätzlich außerhalb dieses Servers liegen. Details zu Wiederherstellung, Migration und Aufbewahrung: [Betrieb](docs/operations.md).

## Entwicklung und Tests

```sh
npm ci
npm run check
npm run dev
```

Node.js 24 ist erforderlich. Der lokale Node-Modus verwendet die bestehende SQLite-Datenbank und startet das gleiche Monitoring eingebettet. Mit `MONITOR_MODE=external` kann `npm run worker` separat laufen. PostgreSQL wird über denselben Collector angesprochen; der bestehende TypeScript-/Web-API-Stack bleibt erhalten.

```sh
# Lokaler Container-Build statt GHCR:
docker compose -f compose.yaml -f compose.dev.yaml up -d --build
```

Automatisierte Tests prüfen Peaks, Gleichstände, Zeitstempel, Zuordnung, Neustart-Persistenz, Retention, Transaktions-Rollback, konkurrierende Collector, verlorene Sperren, Token-Erneuerung und Fehlerfälle. GitHub Actions führt zusätzlich Tests gegen echtes PostgreSQL aus, bevor das Multiarch-Image publiziert wird.

Die opt-in Designvorschau `/?preview=1` enthält gekennzeichnete feste Beispieldaten und **keine erfundenen historischen Rekorde**. Die produktive Ansicht verwendet nur echte Twitch-Daten.

## Administration und Konfiguration

Über **Verwaltung** den serverseitigen `ADMIN_TOKEN` verwenden. Länder werden nach numerischer Twitch-User-ID und ISO-Ländercode gepflegt; JSON-Import/-Export ist enthalten. Sprache wird niemals automatisch als Land interpretiert.

Alle Variablen stehen in [.env.example](.env.example). Architektur, Monitoring, Speicherwachstum, SQLite-Migration, Backup und GHCR-Sichtbarkeit sind in [docs/operations.md](docs/operations.md) dokumentiert. `.env` und Datenbanken werden weder committed noch in Images kopiert.
