 > Historischer Stand vor eingebetteter AMU-Inferenz. Aktueller Betrieb und Einschränkungen: [amu-engine.md](amu-engine.md).

# Zentraler AMU KI/API-Server — Stand 23.10.2026

## Betrieb und nachgewiesener Status

Start im bestehenden Projekt: `npm start` (Node 24 vorhanden). Standardadresse: `http://127.0.0.1:3030`, Verwaltung: `/admin`, bestehende Oberfläche: `/`.
`PORT` und `AMU_BIND_HOST` überschreiben Port und Bind-Adresse. Kein automatischer Start anderer Projekte oder des bisherigen Reverse-Proxys beim Start des zentralen Servers. Die bisherigen Verwaltungsfunktionen bleiben als geschützte native Routen erhalten.

Port 3000 ist durch einen bereits vor dieser Änderung laufenden älteren Server belegt. Dieser Prozess wurde nicht beendet oder aktualisiert. Für die neue API ausschließlich Port 3030 verwenden. Der alte Prozess muss vor einer späteren Netzwerkfreigabe gesondert identifiziert und kontrolliert abgelöst werden.

Vorhandenes Ollama auf `127.0.0.1:11434`, installierte Modelle `qwen2.5:1.5b` und `qwen2.5:3b`. Standardmodell der zentralen API: `qwen2.5:1.5b`. Keine Modell-Downloads oder kostenpflichtigen Dienste. `/health`, authentifiziertes `/v1/models` und echte gestreamte Inferenz wurden lokal erfolgreich mit HTTP 200 geprüft.

## Schlüssel, Rechte und Verwaltung

Den initialen Administrator-Schlüssel lokal aus `scratch/secrets/central-admin-key.txt` lesen und in die Oberfläche eingeben. Nicht veröffentlichen. Datei ist per Windows-ACL auf aktuellen Benutzer und SYSTEM eingeschränkt. Der Schlüssel wird nicht in HTML, Browser-Speicher oder Protokollen abgelegt. Die Verwaltungsoberfläche hält eingegebene Schlüssel nur im Seitenspeicher.

`central-access.json` speichert SHA-256-Prüfwerte zufälliger 256-Bit-Schlüssel und Client-Konfiguration. Der initiale Admin-Schlüssel liegt für die Erstinbetriebnahme separat vor. Schlüsselvergleich erfolgt zeitkonstant. Neue Clients erhalten einen einmalig angezeigten Schlüssel, Zugang zur Inferenz und Modellliste, jedoch keine Verwaltungs- oder Entwicklerrechte. Pro Client sind Modelle einschränkbar; eine leere Liste bedeutet Zugriff auf alle Modelle. Client-Sperrung greift bei neuen Anfragen sofort. Bereits laufende Anfragen werden durch eine Sperrung nicht rückwirkend abgebrochen.

Verwaltung: lokale OpenAI-kompatible Backend-URL und Standardmodell konfigurieren, Modelle abfragen, Clients erstellen/sperren, Status, Arbeitsspeicher, kumulierte Prozess-CPU und Ereignisse einsehen. Erlaubt sind ausschließlich lokale HTTP-Endpunkte mit `/v1`; Cloud-Verbindungen werden abgewiesen. Kein Modell-Download, Löschen oder Training über die Oberfläche.

Alle bisherigen `/api/v1/*`-Routen erfordern jetzt einen Administrator-Schlüssel, auch vorher ungeschützte Entwickler- und Projektoperationen. Die bisherige Oberfläche wurde für die Schlüsselanmeldung angepasst. Der alte feste Standardschlüssel wird vom neuen Server nicht akzeptiert. Keine globale CORS-Freigabe.

## REST-Vertrag

- `GET /health`: öffentlich; Prozessstatus und Erreichbarkeit des Inferenz-Backends. HTTP 200 bedeutet erreichbarer API-Prozess; `inferenceReady` gesondert prüfen.
- `GET /v1/models`: Bearer-Schlüssel erforderlich; echte Backend-Modellliste, gefiltert nach Client-Rechten.
- `POST /v1/chat/completions`: Bearer-Schlüssel erforderlich. Unterstützt `model`, `messages` mit Textnachrichten (`system`, `user`, `assistant`), `temperature`, `max_tokens`, `stream`. Vollständige Nachrichtenhistorie wird an das lokale Modell weitergegeben, ohne den Entwickler-Orchestrator auszuführen.
- `stream: true`: echtes, unverpuffertes OpenAI-SSE vom Backend, inklusive Abschluss `[DONE]`.
- Verwaltungsrouten: `GET /api/central/status`, `POST /api/central/connection`, `/api/central/clients`, `/api/central/revoke`.

Dies ist eine Chat-Completions-Teilmenge, keine vollständige OpenAI-API. Tools/Function Calling, multimodale Inhalte, Embeddings, Responses und weitere OpenAI-Parameter sind noch nicht implementiert.

Fehlercodes: 400 ungültige Eingabe, 401 Schlüssel fehlt/ungültig, 403 fehlende Berechtigung, 404 Modell/Route unbekannt, 413 Body zu groß, 429 Limit erreicht, 502 Backend lehnt Anfrage ab, 503 Backend nicht erreichbar, 504 Backend-Zeitlimit. Nach Beginn eines Streams können HTTP-Statuscodes nicht mehr geändert werden; Unterbrechungen werden beendet und protokolliert.

## Last, Ausfälle und Protokolle

Maximal zwei parallele zentrale Inferenzen, maximal 16 wartende Anfragen, insgesamt 120 Sekunden Zeitbudget inklusive Wartezeit. Maximal 1 MiB JSON-Body, 15 Sekunden Request-Empfangszeit und 10 Sekunden Header-Zeitlimit. Clients standardmäßig 60 authentifizierte Anfragen/Minute, Administrator 120. Client-Abbruch beendet die Backend-Anfrage. Streaming berücksichtigt Backpressure.

Jede Anfrage verbindet sich neu mit dem lokalen Backend; nach dessen Neustart funktionieren neue Anfragen ohne Neustart des API-Servers. Modell-/Statusabrufe wiederholen einen Verbindungsfehler einmal. Generierungen werden nicht automatisch wiederholt, um doppelte Ausführung zu vermeiden. Es gibt keinen dauerhaften Modellprozess-Wächter und keine automatische Ollama-Neustartsteuerung.

Ereignisse enthalten keine Prompts oder API-Schlüssel. Letzte 200 Ereignisse im Status; dauerhaft `scratch/secrets/central-events.ndjson`, mit einer rotierenden Vorgängerdatei ab ca. 256 KiB. Prozessausgaben des aktuell gestarteten Servers liegen unter `scratch/central-server.stdout.log` und `scratch/central-server.stderr.log`.

## Vorbereitung AMU-Agent-3

In `/admin` einen eigenen Client `AMU-Agent-3` anlegen, gewünschte Modelle einschränken und den einmaligen Schlüssel sicher übertragen. Spätere SDK-Konfiguration: `base_url=http://<Agent-2-Adresse>:3030/v1`, `api_key=<eigener Client-Schlüssel>`, `model=qwen2.5:1.5b`. Das Agent-3-Projekt wurde nicht angefasst.

Derzeit ausschließlich Loopback. Vor echter Netzwerkanbindung: TLS über eigenen Reverse-Proxy, gezielte Firewall-Freigabe/privates VPN, eindeutige Client-Schlüssel und kontrollierte Ablösung des alten Servers auf Port 3000. Windows-Dienst/Autostart und Zertifikate sind noch offen. Keine Firewall-, Hosts- oder anderen Projekteinstellungen wurden geändert.

## Sicherung, Prüfung und Grenzen

Vorheriger vollständiger Stand: `scratch/backups/central-server-20261023-173136/`, einschließlich vorhandener scratch-Daten und vorheriger Sicherungsstände außerhalb des rekursiv ausgesparten backups-Ordners. SHA-256-Inventar: `manifest.csv`. Kein Git-Repository vorhanden; deshalb kein Commit.

Die vier genannten unvollständigen Antigravity-Änderungen sind nicht einzeln gekennzeichnet. Der gesamte vorgefundene Stand wurde gesichert; ihre fachliche Vollständigkeit wurde nicht behauptet. Live-Datenbanken wurden als Dateien mitgesichert; eine transaktionale Datenbank-Snapshot-Funktion oder Wiederherstellungsprobe wurde nicht durchgeführt.

Gezielter Test: `npm run test:central`. Verwendet ein eigenes temporäres Zustandsverzeichnis innerhalb von scratch und einen lokalen Test-Backendserver; verändert keine produktiven Schlüssel oder Verbindungen. Geprüft: Authentifizierung, getrennte Client-Rechte, Modellrechte, Sperrung, Eingabeprüfung, Cloud-Abweisung, Nachrichtenhistorie, JSON-Inferenz, SSE und Parallelitätslimit. Zusätzlich echte Ollama-Inferenz geprüft. Kein umfassender Regressionstest der bisherigen Entwickler-/Deploymentfunktionen und kein TypeScript-Compilerlauf (lokale Entwicklungsabhängigkeiten fehlen). Keine automatisierten Tests gestartet, die andere Projekte oder Deployments verändern.

Offen: Ende-zu-Ende-Browserprüfung, Dienstbetrieb, TLS/LAN, feinere Benutzerrollen/Quoten, Schlüsselerneuerung, weitere OpenAI-Funktionen und tiefe Regression der bisherigen Projektverwaltung. Die zentrale Warteschlange gilt für `/v1/chat/completions`; ältere Agent-/Entwicklerabläufe haben ihren bisherigen Scheduler.
