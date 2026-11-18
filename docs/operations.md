# Betrieb und Architektur

## Dienste und Persistenz

Der bestehende TypeScript-/Web-API-Stack bleibt erhalten; ein Next.js-Neuaufbau würde funktionierende Oberfläche und Animationen unnötig ersetzen. Der vorhandene Collector wird gemeinsam verwendet. SQLite/D1 bleiben unterstützt; der produktive Compose-Stack verwendet PostgreSQL 18.

| Dienst | Aufgabe |
| --- | --- |
| `database` | PostgreSQL, benanntes Volume unter `/var/lib/postgresql`, kein veröffentlichter Port |
| `migrate` | Einmaliger Migrationsjob aus demselben GHCR-Image; advisory lock, Transaktion und Prüfsummen |
| `worker` | Zentraler Collector, Heartbeat, Snapshots und atomare Peak-Updates |
| `web` | Oberfläche, gecachte Datenbank-Snapshots, Administration; erhält keine Twitch-Zugangsdaten |

Der Start wartet auf die gesunde Datenbank, dann auf die erfolgreiche Migration. Web wartet außerdem auf den gesunden Worker. Bei fehlgeschlagener Migration starten neue abhängige Dienste nicht. Neue Images führen neue Migrationen vor dem Start aus. Bei einem PostgreSQL-Ausfall erholt sich der Pool; nach wiederholten internen Workerfehlern beendet sich der Worker und wird automatisch neu gestartet. Normale Twitch-Fehler lösen begrenzte Wiederholungen und persistiertes Backoff aus.

Die PostgreSQL-Verbindung kann über Einzelwerte (`POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`) oder `DATABASE_URL` konfiguriert werden. Compose reicht nur die benötigten Werte an jeden Dienst weiter; `env_file: .env` wird bewusst nicht pauschal verwendet. `DB_POOL_SIZE` gilt pro Prozess.

`DATABASE_PATH` und `DATABASE_DRIVER=sqlite` betreffen den lokalen Node-Modus. Compose erzwingt PostgreSQL. `DATABASE_URL` überschreibt die Einzelwerte; Sonderzeichen müssen in einer URL encodiert werden. Für einen externen Datenbankserver TLS über die entsprechenden URL-/Server-Einstellungen konfigurieren; Zertifikatsprüfung nicht abschalten.

## Monitoring und Genauigkeit

Der Worker läuft in einem eigenen Prozess. Ein sequenzieller Loop prüft alle fünf Sekunden, ob der nächste im DB-Status gespeicherte Erfassungszeitpunkt erreicht ist. Das Standardintervall beträgt 60 Sekunden (`POLL_INTERVAL_SECONDS`, gültiger Bereich 30–3.600). Während einer Erfassung wird kein weiterer Job eingereiht. Ein separater, begrenzter Heartbeat läuft alle zehn Sekunden.

Eine atomare Datenbank-CAS-Sperre verhindert parallele Erfassungen auch bei versehentlich mehreren Workern. Sie besitzt eine Ablaufzeit; vor der Speicherung wird der Besitzer in der Snapshot-Transaktion erneut geprüft. Eine verlorene Sperre führt zur vollständigen Rücknahme des Ergebnisses. Nach einem Prozessabbruch kann ein neuer Worker die abgelaufene Sperre übernehmen. In keinem Fall hängt die Erfassung von Browser-Verbindungen ab. Die produktive Dashboard-Route startet niemals einen Collector.

Die Browser lesen den zentral gespeicherten Stand alle zehn Sekunden. Die Anzahl der Besucher erhöht die Zahl der Twitch-Abfragen nicht. Der gemeinsame Animationsscheduler und die FLIP-Ranking-Übergänge bleiben erhalten. Peaks werden ausschließlich auf dem Server aus Messwerten berechnet; das Frontend kann keine Peak-Updates einreichen.

Get Games ermittelt die exakte GTA-VI-Kategorie. `TWITCH_GAME_ID` ist ein expliziter validierter Fallback. Sämtliche Streams-Seiten werden bis zum Ende oder einem begrenzten Zeit-/Seitenbudget abgefragt und nach Stream-ID dedupliziert. Abweichungen während der Twitch-Pagination können weiterhin dazu führen, dass Streams übersprungen werden; auch eine vollständige Erfassung ist kein atomarer weltweiter Messpunkt. Zuschauerzahlen summieren Kanal-Zuschauer und deduplizieren keine Personen, die mehrere Kanäle ansehen.

`COLLECTION_BUDGET_SECONDS=40` begrenzt die API-Phase, `MAX_STREAM_PAGES=400` die Zahl der Seiten à 100 Streams. 401 erneuert den Token, 429 respektiert Twitch-Reset/Retry-After, 5xx und Netzwerkfehler erhalten begrenztes exponentielles Backoff. App-Tokens werden stündlich validiert; Profilbilder separat gecacht. Alle Requests besitzen Timeouts. Unvollständige oder ungültige Daten werden als Teilerfassung gespeichert und erzeugen **keine** Rekorde. Letzte vollständige Rekorde bleiben bei Fehlern erhalten.

`/api/health/monitoring` enthält Heartbeat, letzte Abfrage, letzten Snapshot, letzte vollständige Messung, Dauer und Erfolgs-/Teil-/Fehlerzähler. Ein Heartbeat älter als 90 Sekunden oder eine überlange unvollendete Iteration führt zu HTTP 503. Twitch-Ausfälle bedeuten einen degradierten Datenstand, nicht zwangsläufig einen defekten Prozess. Strukturierte JSON-Logs verwenden `collection_started`, `collection_success`, `collection_partial`, `collection_error` und `new_peaks`. Umfangreiche Peak-Ereignisse werden mit Gesamtanzahl und begrenztem Detailauszug protokolliert. Keine Secrets oder Token-Antworten werden geloggt.

## Rekordmodell

`viewer_peaks` verwendet einen zusammengesetzten Schlüssel `(scope, entity_id)` für Global, Land und Twitch-User-ID. Zuschauer- und Kanalmaxima besitzen unabhängige UTC-Zeitstempel. SQL-Upserts aktualisieren bei strikt größeren Werten und erhalten bei Gleichstand den ersten Zeitpunkt. Kanalnamen werden bei weiteren Messungen aktualisiert; der Rekord bleibt an der stabilen User-ID hängen. `recording_state` hält den ersten vollständigen Monitoring-Zeitpunkt fest.

Snapshot, Stream-Chunks, Status und Rekordupdates werden in einer Transaktion gespeichert. Ein Fehler rollt alles zurück. Rekordtabellen sind unabhängig von der Snapshot-Aufbewahrung und werden nicht durch Retention gelöscht. Neue Features schreiben existierende alte Snapshots nicht rückwirkend als angeblich seit Projektbeginn erfasste Peaks ein.

Die Live-Länderansicht verwendet aktuelle manuelle Zuordnungen. Länderrekorde verwenden die Zuordnung zum jeweiligen Messzeitpunkt. Dadurch kann ein bestehender Länderrekord höher sein als der neu zugeordnete aktuelle Wert. Nicht zugeordnete Kanäle stehen unter `ZZ` / „Unbekannt“, einschließlich ihres eigenen Aggregat-Peaks. Es werden keine Herkunftsländer aus Sprachcodes abgeleitet.

## Datenwachstum

`HISTORY_RETENTION_DAYS=30` begrenzt komplette Snapshots einschließlich einzelner Stream-Messungen (1–365 Tage). Große Streamlisten werden in kleine DB-Chunks zerlegt. Alte Snapshots werden beim nächsten erfolgreichen Speichervorgang mit ihren Chunks gelöscht; Rekorde und Aufzeichnungsbeginn bleiben dauerhaft bestehen. Bei dauerhaft fehlenden Erfolgen findet keine neue Retention-Löschung statt, es entstehen dann aber auch keine neuen vollständigen Snapshots.

Bei sehr vielen Kanälen können komplette minütliche Stream-Snapshots erheblichen Speicher benötigen. Retention anhand des eigenen Volumes einstellen, freien Platz überwachen und Backups rotieren. Ein Chart liefert höchstens ungefähr 240 echte Messpunkte pro Zeitraum und markiert Teilerfassungen. Es werden keine historischen Werte interpoliert und gespeichert. Für längere Detailhistorien Kapazität bewusst vergrößern; diese Version erfindet keine verdichteten Messungen.

## Bestehende SQLite-Daten nach PostgreSQL übernehmen

Der Importer erhält alte Snapshots, Mappings, Profil-Cache, Rekorde und den Aufzeichnungsbeginn. Er importiert nur in eine **leere** Zielinstallation und verwendet eine Transaktion. Die Quell-Datei bleibt unverändert. Bestehende Legacy-SQLite-Installationen vorher einmal mit dem aktuellen lokalen Node-Server öffnen, damit die Schema-Migration ausgeführt wird.

```sh
# Lokalen/alten Worker zuerst beenden; Web und Ziel-Worker noch nicht starten.
docker compose up -d database migrate
docker compose run --rm --no-deps \
  -v "$PWD/data:/import:ro" migrate \
  node scripts/import-sqlite.mjs /import/leonida.sqlite
docker compose up -d
```

Für unabhängige Installationen niemals laufende SQLite-Dateien zwischen Containern kopieren. Der Compose-Stack nutzt dafür PostgreSQL. Lokal werden versionierte SQLite-Migrationen unter einer Schreibsperre ausgeführt; bestehende Tabellen und Datensätze bleiben erhalten. Angewandte SQL-Migrationen nicht verändern, sondern neue Dateien hinzufügen.

## Backup und Restore

`./scripts/backup.sh` erzeugt ein konsistentes PostgreSQL-Custom-Format-Backup mit restriktiven Dateirechten unter `backups/`. Auch Rekorde, Zuordnungen und Migrationsstand sind enthalten. Den Ordner nach eigener Aufbewahrungsstrategie auf ein anderes System sichern. Backups enthalten Streamer-Daten und administrative Notizen und gehören nicht in Git.

`./scripts/restore.sh DATEI --replace` beendet Web/Worker, ersetzt die Datenbank in einer Transaktion und startet den Stack erneut; neuere Migrationen werden dabei nachgeholt. Ohne `--replace` führt es keine Wiederherstellung aus. Vor dem Restore zusätzlich den aktuellen Stand sichern. Keine Container-/Volume-Neuerstellung ist dafür nötig.

Für einen isolierten Restore-Test kann ein separates Test-DB-Schema oder eine eigene Compose-Installation verwendet werden. `pg_restore --list DATEI` prüft das Inhaltsverzeichnis. `docker compose down` erhält Volumes; `docker compose down -v` löscht sie. Ein Image-Rollback kann neuere DB-Migrationen nicht automatisch zurücknehmen: Schema-Kompatibilität oder ein passendes Backup beachten.

## GitHub und GHCR

Der Workflow `.github/workflows/container.yml` testet SQLite sowie PostgreSQL. Nach erfolgreichem Test werden für `main` automatisch `latest` und `sha-<vollständiger SHA>` veröffentlicht; Versions-Tags `v*` erzeugen zusätzlich SemVer-Tags. Pull Requests führen nur Tests aus. `workflow_dispatch` ist für manuelle Wiederholungen verfügbar.

Authentifizierung erfolgt über den integrierten `GITHUB_TOKEN`; nur der Publish-Job erhält `packages:write`, alle anderen Jobs `contents:read`. Aktionen sind auf Commit-SHAs fixiert. Der Image-Quellcode-Link und OCI-Labels verbinden Package und Repository. Web und Worker laufen als unprivilegierter `node`-Benutzer mit schreibgeschütztem Root-Dateisystem, entfallenen Linux-Capabilities und begrenzten rotierenden Docker-Logs.

Ein öffentliches Repository bedeutet bei GHCR nicht automatisch ein öffentliches Package. Nach dem ersten Push unter `https://github.com/users/CelduinX/packages/container/leonida-viewers/settings` die Package-Sichtbarkeit prüfen. Falls das Package noch privat ist, „Change visibility“ → „Public“ wählen. Danach müssen anonyme `docker compose pull` ohne Registry-Login funktionieren. Das Projekt wird erst dann als öffentlich abrufbar bezeichnet, wenn das geprüft wurde.

`.env` bleibt lokal; GitHub Actions benötigt weder Twitch-Zugangsdaten noch das Produktions-Datenbankpasswort. CI verwendet eine isolierte Testdatenbank mit ausschließlich dafür geltendem offenem Testpasswort. Automatisches Deployment auf einen eigenen Server ist nicht eingerichtet.

## Offizielle Schnittstellen

- [Twitch Helix](https://dev.twitch.tv/docs/api/reference/)
- [Client Credentials](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#client-credentials-grant-flow)
- [Docker Compose Startreihenfolge](https://docs.docker.com/compose/how-tos/startup-order/)
- [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
