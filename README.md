# LKW_Beladung

Gemeinsamer Beladungsplan für 33 Plätze und eine Transfernummer. Ein Docker-Container liefert Webseite und API aus; SQLite speichert den aktuellen Plan in `/data/ladeplan.db`. Kein separater Datenbankserver.

## Start / Update

```bash
git pull
docker compose up --build -d
```

Erreichbar unter `http://localhost:8080` oder über den vorhandenen NGINX Proxy Manager unter `/logistik/`. Das externe Docker-Netzwerk `proxy` muss vorhanden sein (bei der bestehenden Installation bereits eingerichtet). Für eine unabhängige Erstinstallation einmal `docker network create proxy` ausführen. Der Proxy leitet weiterhin an `lkw-beladung:80` weiter und entfernt das Präfix `/logistik/`. API-Adressen sind relativ und funktionieren damit ebenfalls unter diesem Pfad. Den abschließenden Schrägstrich verwenden.

## Gemeinsame Speicherung

- Alle Rechner sehen denselben aktuellen Ladeplan. Aktualisierung alle zwei Sekunden.
- Jeder Platz wird einzeln gespeichert. Unterschiedliche Plätze können parallel bearbeitet werden.
- Gleichzeitige Änderungen am selben Platz werden anhand einer Version erkannt. Bei Konflikten bleibt die Eingabe offen; Dialog schließen, aktuellen Stand prüfen und erneut öffnen.
- Neu startet nach Bestätigung einen leeren Plan für alle Rechner. Transfernummer bearbeiten erhält die Plätze. Alte Eingabedialoge können keinen neu gestarteten Plan überschreiben.
- Bei fehlender Verbindung zeigt der Kopfbereich „KEINE VERBINDUNG“. Eingaben gelten erst nach Serverbestätigung als gespeichert; es gibt keine Offline-Warteschlange.
- Sendungsnummer genau 20 Zeichen; Gewicht optional, nicht negativ, maximal eine Nachkommastelle.
- Seitenansicht/Draufsicht bleibt eine lokale Einstellung. Der Druckbutton lädt den aktuellen zentralen Stand und öffnet den bisherigen A4-Druckdialog.

## Umstellung von der bisherigen Version

Der zentrale Plan startet einmalig leer. Vorhandene lokale Browserpläne werden nicht automatisch übernommen, da verschiedene Rechner unterschiedliche Stände haben können. Einen laufenden alten Plan vor dem Update ausdrucken oder als PDF sichern und bei Bedarf danach neu erfassen. Die bisherigen Browserdaten werden nicht gelöscht.

## Daten erhalten und sichern

Das benannte Volume `ladeplan-data` bleibt bei `docker compose up --build -d` und `docker compose down` erhalten. **`docker compose down -v` löscht das Datenvolume.** Den bisherigen Compose-Projekt-/Ordnernamen beibehalten, damit dasselbe Volume verwendet wird.

Konsistente Sicherung während des Betriebs:

```bash
docker compose exec lkw-beladung python -c "import sqlite3; s=sqlite3.connect('/data/ladeplan.db'); d=sqlite3.connect('/data/backup.db'); s.backup(d); d.close(); s.close()"
docker cp lkw-beladung:/data/backup.db ./ladeplan-backup.db
```

Die App ist für das interne Netzwerk hinter dem bestehenden Proxy vorgesehen. Es gibt keine eigene Benutzeranmeldung. Die bisherige `nginx.conf` wird im App-Container nicht mehr verwendet; der zentrale NGINX Proxy Manager bleibt zuständig für HTTPS.

## Tests

```bash
python -m unittest discover -s tests -v
node --check app.js
```

Die Tests prüfen parallele Bearbeitung, Konflikte, Reset, Erhalt der Daten, Eingabeprüfung und dass Datenbank/Backend nicht als Dateien ausgeliefert werden.
