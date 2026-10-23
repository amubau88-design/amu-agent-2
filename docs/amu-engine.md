> Aktuelle Ergänzungen und geänderte Betriebsdetails: [Entwicklungssitzung 2](session2-engine.md).

# Eigenständige AMU AI Engine — Betriebs- und Entwicklungsstand

Stand: 23.10.2026, Europe/Berlin. Diese Beschreibung ersetzt für den aktuellen Betrieb die frühere Ollama-basierte Beschreibung in `central-server.md`.

## Tatsächlich laufende Architektur

```text
AMU-Clients / Verwaltungsoberfläche
              |
       AMU HTTP(S)-Server
      Auth / Rechte / Limits
         |             |
  Chat Completions    AMU AI Core
         |          Modellentscheidungen / begrenzte Werkzeuge
         |             |          |
         |        Dateianalyse  Änderungsvorschlag -> geprüfte Anwendung
         +-------------+
                       |
             AMU Inference Manager
             Modellregistry / Queue / Fristen / Wiederherstellung
                       | private IPC, kein HTTP-Endpunkt
             AMU-interner nativer Prozess
             node-llama-cpp 3.22.2 / llama.cpp / lokale GGUF-Datei
```

Die native Laufzeit wird von AMU automatisch gestartet, beendet und bei Bedarf neu geladen. Sie ist kein separat zu installierender oder zu administrierender Inferenzdienst und öffnet keinen Inferenz-Port. Prozessisolation schützt den API-Prozess vor nativen Fehlern. Beim ersten Abbruchtest mit einem Node-Thread zeigte sich ein nativer Prozessabbruch; deshalb ist die produktive Implementierung auf einen AMU-internen Prozess mit privater IPC umgestellt.

Standardpfade benötigen keine Ollama-API: zentrale Completions, Runtime-Adapter, bisheriger Chat mit gespeicherten Unterhaltungen und neuer AMU Core. Die alten Adapter bleiben explizit auswählbar, ohne automatischen Rückfall oder versteckte Cloud-Nutzung. Ein optionaler lokaler HTTP-Adapter erhält vorhandene Integrationen; nur Loopback-HTTP-URLs mit `/v1` werden akzeptiert. Die Standardkonfiguration ist immer `embedded`, auch für die Migration einer bisherigen Konfiguration ohne Provider-Feld.

Ollama und der alte Prozess auf Port 3000 wurden nicht deinstalliert/beendet, da andere Programme sie verwenden könnten. Der neue AMU-Server braucht sie nicht. Ein Neustart anderer AMU-Projekte oder eine Änderung ihrer Dateien fand nicht statt.

## Modelle und Hardware

- Intel Xeon E3-1230 V2, acht logische CPUs, rund 23,9 GiB RAM.
- Vier native Rechenthreads, CPU-Ausführung, ein Inferenzslot, 4096 Kontexttokens, Batchgröße 256.
- Qwen2.5:1.5b: 986.048.512 Byte, lokale Projektkopie `scratch/models/qwen2.5-1.5b.gguf`.
- SHA-256: `183715c435899236895da3869489cc30ac241476b4971a20285b1a462818a5b4`.
- Die vorhandene Modelldatei wurde einmalig aus dem lokalen Gewichtsbestand übernommen, beim Import und bei jedem Laden vollständig geprüft. Zur Laufzeit wird ausschließlich die Projektkopie verwendet.
- Lizenztext unter `scratch/models/Qwen-LICENSE.txt`; Registry unter `scratch/models/registry.json`. Kein Modell-Download ausgeführt.
- Das bisher installierte 3B-Modell wurde nicht in die neue Registry importiert. Weitere GGUF-Modelle sind über das Importscript und anschließend die Modellverwaltung ergänzbar.

Beispiel für einen weiteren geprüften Offline-Import:

```powershell
node scripts/import-model.mjs --file C:/lokale-modelle/modell.gguf --id modell-name --sha256 <64-stellige-Pruefsumme> --license <Lizenzkennung>
```

Der Import überschreibt keine vorhandenen Gewichte. Neue Laufzeitdateien werden nicht aus dem Netz nachgeladen (`build: never`, `skipDownload: true`); fehlende native Bibliotheken führen zu einem sichtbaren Fehler. Abhängigkeiten/Binaries müssen beim Einrichten vorhanden sein. Das ist eine eingebettete Fremdbibliothek mit offenen Gewichten, keine Abhängigkeit von einem externen Inferenzdienst.

Nach einer echten Inferenz zeigte der native Prozess im Test etwa 1,2 GiB RSS. Der API-Prozess benötigt zusätzlich etwa 100 MiB. Mmap und Betriebssystem-Paging verändern den angezeigten RSS. Beim kurzen Live-Streamingtest lag die Zeit bis zum ersten Text bei rund 1,1 Sekunden und die Gesamtdauer bei rund 1,8 Sekunden; keine allgemeine Leistungsgarantie. Prozess- und native Speichernutzung sind getrennt sichtbar. GPU-Beschleunigung wurde auf dieser Hardware nicht aktiviert oder vermessen.

## API, Rechte und Limits

- `GET /health`: öffentlich, Prozess-/Engine-Status. HTTP 200 bedeutet erreichbarer API-Prozess; `inferenceReady` zeigt die Modellbereitschaft. Start/Ladefehler sind sichtbar.
- `GET /v1/models`: eigener Client-Schlüssel; zeigt importierte Modelle, nach Modellrechten gefiltert. Importiert bedeutet nicht zwingend derzeit geladen.
- `POST /v1/chat/completions`: Textnachrichten (`system`, `user`, `assistant`), vollständige Historie, letzte Nachricht `user`, Modell, Temperatur, `max_tokens` oder `max_completion_tokens`, optional echtes SSE mit `[DONE]`.
- Modellalias `amu-agent-2-default` bleibt nutzbar.
- Unbekannte oder nicht geladene Modelle werden abgewiesen. Kontextüberschreitungen führen zu HTTP 400 statt unbemerktem Abschneiden der API-Historie.
- Tool-Calling und strukturierte Antworten im OpenAI-Chat-Vertrag sind noch nicht freigegeben; der AMU Core verwendet eine eigene, validierte Werkzeug-Schnittstelle.

API-Schlüssel sind zufällige 256-Bit-Werte. Nur SHA-256-Prüfwerte stehen in der Client-Konfiguration. Der Administrator-Bootstrapschlüssel liegt lokal in einer gesondert geschützten Datei. Deren Windows-ACL erlaubt das Benutzerkonto AMU, das ausführende Sandboxkonto und SYSTEM. Neue Client-Schlüssel erscheinen einmalig. Admin- und Client-Schlüssel sind erneuerbar. Kein Schlüssel wird im Browser-Storage, HTML oder Protokoll gespeichert. Der Adminschlüssel wird bei Rotation auch in der lokalen Schlüsseldatei aktualisiert.

Normale Clients erhalten keine Entwickler-, Projekt-, Core- oder Verwaltungsrechte. Pro Client einstellbar: Modelle, 1–600 Anfragen/Minute, 1–2048 Ausgabetokens, 1–2 gleichzeitige Anfragen. Standard: 60/min, 512 Tokens, eine Anfrage. Administrator ohne explizite Begrenzung: 120/min, 2048 Tokens, zwei Anfragen. Sperren brechen auch aktive/angemeldete zentrale Chat-Anfragen ab; Rotation entwertet den alten Schlüssel für neue Anfragen.

Eine native Generierung läuft gleichzeitig, bis zu 16 warten im gemeinsamen Inferenzmanager (einschließlich Core/Legacy-Adapter). Die zentrale HTTP-Chat-Zulassung besitzt zusätzlich zwei aktive Plätze und bis zu 16 wartende Anfragen. Zeitbudget jeweils höchstens 120 Sekunden inklusive Wartezeit. Modellladen höchstens 90 Sekunden. Request-Body höchstens 1 MiB, Header-Zeitlimit 10 Sekunden, Empfangszeitlimit 15 Sekunden. Langsame Streams sind auf etwa 1 MiB gepufferten Output begrenzt.

Die Verwaltung bietet Modellaktivierung/Wiederherstellung, Client-Erstellung, Rechteänderung, Sperrung und Schlüsselrotation, Streamingtest, Core-Aufgaben und Vorschlagsprüfung sowie Status/RAM/CPU/Event-Loop/Netzwerkdaten. Statuspolling erfolgt nach Anmeldung alle zehn Sekunden. Der Schlüssel bleibt nur im Seitenspeicher.

## AMU AI Core und kontrollierte Entwicklung

`POST /api/core/tasks` mit Administrator-Schlüssel:

```json
{
  "goal": "Analysiere die Funktion auf Fehler und erstelle einen Reparaturvorschlag.",
  "files": ["src/mein-modul.ts"]
}
```

Der AMU-Controller liest und prüft die angegebenen Dateien, übergibt Beobachtungen an das lokale Modell und validiert dessen grammatikbeschränkte JSON-Werkzeugentscheidungen. Werkzeuge: `read_file`, `analyze_typescript`, `propose_file`, `finish`. Höchstens vier Schritte, vier Dateien und insgesamt 7000 Quellzeichen pro Aufgabe; Kontext- und Fristgrenzen gelten zusätzlich. Das kleine Modell kann fachlich ungenaue Befunde oder ungeeignete Änderungen liefern. Prüfung bleibt erforderlich.

Zugriff beschränkt sich auf `src`, `docs`, `scripts`, `package.json`, `tsconfig.json` und eigene Testarbeitsbereiche unter `scratch/core/workspaces`. Keine Secrets, Git-Metadaten, fremden Projekte oder Symlink-Ausbrüche. Das Modell kann weder Shellbefehle ausführen noch Änderungen selbst anwenden.

- `GET /api/core/tasks`: eigene Aufgaben.
- `GET /api/core/tasks/<id>`: Status, Entscheidungen und Befunde.
- `GET /api/core/proposals/<id>`: vollständiger Vorschlag.
- `POST /api/core/proposals/<id>/apply`: getrennte, ausdrücklich ausgelöste Anwendung.

Vor dem Schreiben: Vergleich mit dem beim Lesen erfassten SHA-256-Quellhash, erneute Pfad-/Syntaxprüfung, Sicherung der Originaldatei und Manifest, dann Austausch über eine temporäre Datei. Bei zwischenzeitlich veränderter Datei HTTP 409. Keine stille Überschreibung. Neue Dateien sind im Toolmodul technisch unterstützt; die aktuelle modellgesteuerte Aufgaben-API beginnt mit vorhandenen, ausdrücklich angegebenen Dateien. Vorschläge und Aufgaben sind benutzergebunden und lokal persistent. Beim Prozessneustart werden laufende Aufgaben als `interrupted` markiert und niemals automatisch erneut ausgeführt.

Syntaxprüfung parst Quellcode ohne seine Ausführung. Sie ersetzt keinen fachlichen Test. Der gefährliche bisherige Debug-Pfad mit fest eingebauter Beispielüberschreibung wurde entfernt. Die älteren umfangreichen Entwickler-/Projektfunktionen bleiben erhalten, sind aber nicht zu vollständig modellgesteuerten Allzweckabläufen umgebaut oder umfassend regressionstestet. Die neue abgesicherte Entwicklungsschnittstelle ist `/api/core/*`.

## Betrieb, Wiederherstellung und Protokolle

`npm start`: API direkt. `npm run start:supervised`: eigener AMU-Wächter. `npm run build` und `npm run start:built`: kompilierter Betrieb. Start stets aus diesem Projektverzeichnis. Native Worker-URLs unterstützen TypeScript- und Build-Ausführung.

Der Wächter startet ausschließlich den AMU-API-Prozess. Er überwacht private IPC-Herzschläge, beendet einen länger als 30 Sekunden stummen Prozess und startet nach Ausfall mit wachsendem Abstand neu. Maximal fünf Neustarts in fünf Minuten, danach sichtbarer Stopp. Bei angefordertem Stopp kein Neustart. Verliert ein beaufsichtigter Prozess den Elternprozess, beendet er sich samt nativer Laufzeit. Automatisches Fortsetzen von Entwicklungsänderungen ist ausgeschlossen.

Nach Inferenzabbruch wird nur der interne native Prozess beendet. Die nächste Anfrage lädt eine neue geprüfte Instanz. Bereits begonnene Generierungen und Schreibaufgaben werden nicht automatisch wiederholt. Der echte Wiederanlauf nach Abbruch und nach Beenden eines API-Kindprozesses ist getestet.

Protokolle ohne Prompts/Schlüssel:

- `scratch/secrets/central-events.ndjson`: Client-/Verbindungs-/Inferenzereignisse, ca. 256 KiB plus eine Vorgängerdatei.
- `scratch/core/system.ndjson`: Fehler und Lebenszyklus, ca. 1 MiB plus Vorgängerdatei.
- `scratch/supervisor.ndjson`: Prozessstarts und Neustarts, ca. 1 MiB plus Vorgängerdatei.
- `scratch/central-server.stdout.log` / `.stderr.log`: Ausgabe des aktuell gestarteten Wächters.

`GET /api/central/monitoring`: Hauptprozess, native Prozessdaten und Netzwerkprofil. Client-Ablehnungen und Serverfehler werden getrennt gezählt. CPU-Prozentwerte sind auf einen logischen Kern bezogen und können bei Mehrkernlast 100 überschreiten. Noch kein Windows-Dienst, kein Boot-Autostart und kein zentraler Alarmversand.

## LAN-Vorbereitung für AMU-Agent-3

Standard ausschließlich `127.0.0.1:3030`, keine Firewall-/Hosts-Änderungen. Für LAN-Bindung sind gleichzeitig nötig:

```powershell
$env:AMU_BIND_HOST = '0.0.0.0'
$env:AMU_TLS_CERT = 'C:/Pfad/zum/eigenen/server-cert.pem'
$env:AMU_TLS_KEY = 'C:/Pfad/zum/eigenen/server-key.pem'
$env:AMU_ALLOWED_CIDRS = '192.168.50.0/24'
npm run start:supervised
```

Ohne TLS-Dateien oder explizite IP-/Subnetzliste startet kein LAN-Listener. TLS mindestens 1.2. Administration von anderen Rechnern ist zusätzlich standardmäßig gesperrt; nur bei ausdrücklicher Konfiguration `AMU_ALLOW_REMOTE_ADMIN=true` möglich. Zertifikatsprüfung am Client bleibt erforderlich. Die TLS-Verbindung mit echten LAN-Zertifikaten und ein anderer Rechner sind noch nicht end-to-end getestet.

In der Verwaltung einen Client AMU-Agent-3 anlegen und dessen Modelle/Quoten setzen. Später `base_url=https://<Agent-2-Name>:3030/v1`, eigener `api_key`, `model=qwen2.5:1.5b`. Nur nach passendem Zertifikat, gezielter Firewall-Freigabe und kontrollierter Ablösung des noch auf `0.0.0.0:3000` laufenden alten Servers freigeben. Das Agent-3-Projekt wurde nicht angefasst.

## Nachweise, Bestand und Git

Vollständige Sicherung vor diesem Umbau: `scratch/backups/before-embedded-20261023-194613/` mit Quellstand, bisherigen Dokumenten und vorhandenen scratch-Daten, SHA-256-Manifest. Gegenprüfung der vorher vorhandenen Daten: 291 Dateien unverändert, keine fehlenden Dateien; verändert sind nur die eigenen PID-/Serverlog-/Inferenzprotokolldateien. Laufende stdout/stderr-Dateien können nicht konsistent gehasht werden. Keine transaktionale Datenbank-Wiederherstellungsprobe durchgeführt.

Das vorher nicht vorhandene lokale Git-Repository wurde im bestehenden Projekt initialisiert. Ausgangscommit: `8376ee7`. Private Daten, Schlüssel, Gewichte, node_modules und Backups sind ausgeschlossen. Kein GitHub-Push.

Geprüft:

1. Vollständiger TypeScript-Check und Build.
2. Authentifizierung, Modellrechte, Client-Isolation, Schlüsselrotation/-sperrung, Client-Parallelitätslimit, Textvalidierung und Cloud-Abweisung mit isoliertem lokalem Testbackend.
3. Echte eingebettete JSON- und SSE-Antworten, reale Tokenzähler und Kontextgrenzen.
4. Abbruch während laufender Inferenz und anschließende Wiederherstellung.
5. Echte modellgesteuerte Reparatur einer isolierten Testdatei, Review-Grenze, Quellhashkonflikt, Originalsicherung und ausgeführter Funktionstest des reparierten Codes.
6. Verweigerung von Pfadausbrüchen/Secret-Zugriffen; Syntaxprüfung ohne Codeausführung.
7. AMU-Wächter: Beenden des eigenen Test-API-Prozesses, automatischer Neustart und erneute Modellbereitschaft.
8. LAN-Sicherheitskonfiguration: Startverweigerung ohne TLS/Allowlist, Subnetztrennung und Sperre externer Administration.
9. Live-Betrieb unter dem Wächter, HTTP 200 und vollständiges SSE-Ende; Oberfläche im Browser gerendert und Syntax beider Oberflächen geprüft.

Testzustände bleiben getrennt unter `scratch/central-test-*`, `embedded-verification-*`, `supervisor-verification-*`. Authentifizierte Browser-Bedienung wurde über die API-Verträge und Skriptprüfung abgesichert; noch kein vollständiger automatisierter Browserklicktest sämtlicher Verwaltungsaktionen. Der globale Sammeltest alter Entwicklungs-/Deployment-Demos wurde bewusst nicht ausgeführt, da er Daten oder Projekte verändern kann.

Noch offen: größerer/refinierter Coding-Modellbestand, vollständige mehrstufige Programmier-/Testagenten, semantische Validierung von Vorschlägen, faire mandantenübergreifende Quoten, mehr OpenAI-Funktionen, echte GPU-Optimierung, LAN/TLS-End-to-End und Windows-Dienstintegration. Die vorhandene 1,5B-Engine ist funktional unabhängig, aber kein Ersatz für die fachliche Leistungsfähigkeit großer Coding-Modelle.

## Technische Quellen

- [node-llama-cpp: Integration in bestehende Projekte](https://node-llama-cpp.withcat.ai/guide/)
- [Chat-Sessions, Streaming und Abbruch](https://node-llama-cpp.withcat.ai/guide/chat-session)
- [API-Referenz](https://node-llama-cpp.withcat.ai/api/classes/LlamaChatSession)
