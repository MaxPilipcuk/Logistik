# LKW_Beladung

Docker-hosted Beladungsplaner mit interaktiver LKW-Ansicht und 33 Ladeplätzen.

## Start

```bash
docker compose up --build -d
```

Danach ist die Anwendung unter `http://localhost:8080` erreichbar.

## Funktionen

- 33 klickbare Ladeplätze in einer LKW-Ansicht
- Barcode-Scanner als Tastatureingabe sowie manuelle Sendungsnummer
- Gewichtseingabe in Kilogramm mit einer Nachkommastelle
- `Tab` speichert den aktuellen Platz und öffnet den nächsten Ladeplatz
- Einzelne Einträge über das `×` am Ladeplatz löschen
- Neue Transfernummer starten; Browser speichert den aktuellen Plan lokal
- Druckansicht als ein A4-Blatt im Querformat; der Browser-Druckdialog kann den Standarddrucker verwenden

## Hinweise

Die Daten werden derzeit im Browser (`localStorage`) des jeweiligen Endgeräts gespeichert. Für gemeinsam genutzte Ladepläne über mehrere Geräte braucht es zusätzlich eine Datenbank und einen Backend-Dienst. Browser erlauben einer Webseite nicht, ohne Druckdialog direkt an einen Betriebssystem-Standarddrucker zu senden. Der Druckbutton öffnet daher den Druckdialog mit einer für ein einzelnes A4-Querformatblatt optimierten LKW-Übersicht.
