# Entwicklungssitzung 2 — AMU AI Engine 1.2.0

Stand: 23.10.2026, Europe/Berlin. Aktueller Betriebsstand; ergänzt und ersetzt überholte Einzelangaben aus `amu-engine.md`.

## Abgeschlossene Entwicklung

Die eingebettete Inferenz bleibt der Standard. Kein Ollama- oder Cloud-Server ist für die neue Engine erforderlich. Vorhandene Adapter, Daten und Gewichte wurden erhalten. Der vorgefundene Stand war Git-Commit `d8f09e3` mit sauberem Arbeitsbaum. Vollständige Sicherung einschließlich lokaler Modelle und Konfigurationen: `scratch/backups/session2-before-20261023-204329/`, mit SHA-256-Manifest.

### Inferenz, Modellwechsel und Speicher

- GGUF-Metadaten liefern eine konservative Schätzung für Gewichte, KV-Kontext und Laufzeitreserve. Es werden höchstens 65 % des physischen RAM und nur der verfügbare Speicher nach Systemreserve eingeplant. Vor dem Entladen eines aktiven Modells wird der geplante Modellwechsel geprüft; zu knapper RAM führt zu HTTP 507, ohne das vorhandene Modell zu verlieren.
- Für die vorhandene Qwen2.5-1.5B-Datei beträgt die Schätzung rund 1,84 GB. Es handelt sich um einen Schätzwert, nicht um eine garantierte Speicherobergrenze. Modelle ohne passend auswertbare Decoder-/Attention-Metadaten werden vorsorglich nicht geladen.
- Unter 512 MiB freiem Systemspeicher kann die laufende Kontrolle die eigene Inferenz entladen und in `paused-memory-pressure` versetzen. Das betrifft ausschließlich den AMU-Prozess. Die Kontrolle ist ein zusätzlicher Schutz; sie kann nicht jede sprunghafte Speicherbelegung anderer Programme vorhersagen.
- Start, Leerlauf-Stopp mit RAM-Freigabe und Neustart sind berechtigungsgeschützt. Modellwechsel sind während aktiver/ wartender Generierungen gesperrt. Ein fehlgeschlagener Wechsel versucht, das bisherige Modell wiederherzustellen.
- Kooperativer Abbruch über die native Bibliothek erhält das geladene Modell. Reagiert die Laufzeit nicht innerhalb von drei Sekunden, bleibt die Prozessbeendigung als Rückfallebene bestehen. Im tatsächlichen Test blieb die native Prozess-ID nach einem Abbruch erhalten.
- Die vorhandene begrenzte FIFO-Warteschlange und Fristen bleiben erhalten. Einzelne laufende oder wartende Anfragen können gezielt abgebrochen werden. HTTP-Zulassung und native Warteschlange werden getrennt angezeigt.
- SSE unterstützt Keepalive-Kommentare während bereits geöffneter Streams und `stream_options.include_usage`. Öffentliche Health-Daten enthalten keine Client-Anfrage-IDs oder nativen Prozessdetails mehr.
- Mehrere registrierte, kompatible GGUF-Dateien sind auswählbar. Der Offline-Importer verhindert Doppelimporte, Überschreibungen und konkurrierende Registry-Schreibvorgänge. Aktiv und tatsächlich getestet ist weiterhin Qwen2.5:1.5b; kein zusätzliches Modell wurde heruntergeladen oder entfernt.

Die Hardwareeinstellung bleibt CPU, vier Threads, ein nativer Inferenzslot und 4096 Kontexttokens. Die neue Verwaltung reduziert unnötige Modell-Neuladungen beim Abbruch. Es wurde kein allgemeiner Geschwindigkeitsgewinn oder GPU-Betrieb nachgewiesen.

### Entwicklungsaufträge und Checkpoints

- `POST /api/core/tasks` unterstützt `background:true` mit HTTP 202. Ein solcher Status bedeutet angenommen/laufend, nicht abgeschlossen.
- Maximal vier Quelldateien und 7000 Quellzeichen; pro Auftrag zunächst bis zu zwölf Modellschritte, standardmäßig sechs. Wiederaufnahme erweitert das Schrittbudget kontrolliert, insgesamt höchstens zwanzig Schritte. Zeitlimit pro Ausführung bleibt 120 Sekunden.
- Persistente Checkpoints erfassen Fortschritt, Quellhashes, abgeschlossene Werkzeugaktionen, Vorschläge und Unterbrechungsgründe.
- Neue Endpunkte: `POST /api/core/tasks/<id>/resume` und `/cancel`.
- Wiederaufnahme erfolgt ausdrücklich. Bei geänderten Quelldateien HTTP 409; eine erneute Analyse abweichender Quellen verlangt `acceptSourceChanges:true` durch einen Administrator.
- Lebende Auftragsbesitzer werden beim Start nicht als unterbrochen markiert. Nach tatsächlichem Verlust des ausführenden Prozesses wird nicht automatisch weitergearbeitet oder geschrieben.
- Genehmigte Reparaturen können mit `continueAfterApply:true` in einen pausierten Folgeauftrag übergehen. Eine weitere Ausführung benötigt eine ausdrückliche Wiederaufnahme.
- Ein vollständiger Schreibnachweis kann nach einem Ausfall zwischen Dateiaustausch und Statusspeicherung abgeglichen werden: genehmigtes Manifest, Originalsicherung und exakter Zielhash müssen zusammenpassen. Bei der Wiederherstellung wird kein Quellcode erneut geschrieben.
- Alle Änderungen unter `src/`, unter `scripts/` sowie an `package.json` und `tsconfig.json` gelten als kritisch. Die Anwendung verlangt Administratorrechte sowie `approveCritical:true` und den exakten `expectedContentHash`. Die Oberfläche bietet dafür eine getrennte Freigabe des angezeigten Inhalts.
- Syntaxprüfung bleibt eine Prüfung ohne Codeausführung. Automatische fachliche Laufzeittests beliebiger Modellvorschläge sind nicht freigegeben.

### Rollen und Client-Verwaltung

| Rolle | Rechte |
| --- | --- |
| Inference | eigene Status-/Limitdaten, freigegebene Modelle, Chat/SSE |
| Operator | zusätzlich Systemstatus, Protokolle, Inferenz starten/stoppen/neustarten, Anfragen abbrechen |
| Developer | eigene Entwicklungsaufträge und Vorschläge, keine Anwendung von Reparaturen |
| Administrator | Client-Verwaltung, Modell-/Verbindungsauswahl, Prüfung und Anwendung fremder Entwickler-Vorschläge, kritische Freigaben, API-Neustart |

Die Rollen sind auf dem Server geprüft; die Oberfläche allein ist keine Sicherheitsgrenze. Entwickleraufträge müssen ebenfalls innerhalb der Modellfreigaben ihres Clients bleiben. Nichtadministrative Clients können sich keine Administratorrolle zuweisen. Vorhandene Clients ohne Rollenfeld bleiben Inferenz-Clients; vorhandene Administratoren bleiben Administratoren.

`GET /api/client/status` zeigt eigene Rolle, Limits, aktuellen Server und zuletzt beobachteten Zugriff. Die Clientliste zeigt tatsächliche letzte Anfragen und aktive Vorgänge. „Zuletzt gesehen“ ist kein Nachweis einer dauerhaften TCP-Verbindung.

Der vorhandene `ChatAMUProviderAdapter` verwendet für Health/Status nun die normalen Client-Endpunkte. Inferenz-Clients brauchen dafür keine Administratorrechte mehr. Die historischen Entwickler-/Taskmethoden des Adapters bleiben privilegiert; normale AMU-Agent-3-Clients verwenden `/v1/chat/completions` beziehungsweise `generateOpenAIChat`.

### Windows-Betrieb

Tatsächlich eingerichtet und gestartet: Windows-Aufgabe **AMU-Agent-2 Central AI**, Benutzer **AMU**, interaktive Anmeldung, begrenzte Rechte, `MultipleInstances=IgnoreNew`.

```powershell
./scripts/windows-autostart.ps1 -Action Status
./scripts/windows-autostart.ps1 -Action Start
./scripts/windows-autostart.ps1 -Action Stop
```

Der Start erfolgt verborgen über `start-background.ps1`. Der Wächter nutzt zusätzlich eine atomare Eigentümersperre, prüft belegte Ports und ersetzt keine bestehenden Dienste. Ein nicht mehr lebender eigener Sperrbesitzer kann kontrolliert bereinigt werden. Unbekannte oder lebende Besitzer werden nicht beendet.

Der Windows-Stopp prüft vor einem nötigen Prozessabbruch den vollständigen AMU-Skriptpfad und die Prozess-Erstellungszeit. Ein tatsächlicher Stopp mit anschließendem Start über die Aufgabe wurde durchgeführt: API offline nach Stopp, danach wieder Modellbereitschaft. Der frühere Dienst auf Port 3000 wurde nicht angefasst.

Ein geplanter API-Neustart ist über `POST /api/central/server/restart` möglich und verbraucht kein Absturzbudget. Ungeplante Ausfälle behalten begrenzte Wiederanläufe mit wachsendem Abstand. `supervisor-status.json` und private Herzschläge liefern tatsächliche Prozessdaten.

Das Dashboard kann den Windows-Aufgabenstatus ausdrücklich aktuell abfragen. Die automatisch angezeigte gespeicherte Windows-Abfrage ist mit Zeitstempel und Alter als Snapshot gekennzeichnet.

**Grenze:** Dies ist ein Autostart bei Benutzeranmeldung, kein Windows-Systemdienst vor der Anmeldung. Ein kompletter Rechnerneustart oder echter Ab-/Anmeldetest wurde nicht durchgeführt.

### AMU-Agent-3 und TLS

Ein eigener Client **AMU-Agent-3** wurde angelegt: Rolle Inference, Qwen2.5:1.5b, 60 Anfragen/Minute, 512 Ausgabetokens und eine gleichzeitige Anfrage. Der Schlüssel wurde nicht ausgegeben und liegt geschützt in `scratch/secrets/amu-agent-3-client-key.txt`. Das Verbindungsprofil ohne Schlüssel steht in `scratch/agent-3-connection.json`.

Mit PowerShell 7/.NET wurden eine projektspezifische lokale CA und ein Serverzertifikat für den Rechnernamen, Loopback und die vorhandene private IPv4-Adresse vorbereitet. Keine Installation in einen Zertifikatsspeicher, keine Firewall-Änderung und kein LAN-Listener wurden vorgenommen.

- Öffentliche CA zur späteren sicheren Übergabe: `scratch/tls-public/amu-ca.pem`.
- Private Schlüssel und Serverzertifikat: `scratch/secrets/tls/`; Schlüssel per Windows-ACL geschützt.
- Erneute Erzeugung: `scripts/setup-lan-tls.ps1`; überschreibt bestehende Zertifikate nicht.
- Lokaler HTTPS-Test: mit der CA erfolgreich; ohne Vertrauensfreigabe abgewiesen. Zertifikatsprüfung wurde nicht abgeschaltet.

Für den späteren anderen Computer müssen TLS-Bindung, explizite private IP-/Subnetzfreigabe, gezielte Firewallregel und das Vertrauen in die öffentliche CA eingerichtet werden. Nur die öffentliche CA und der dedizierte Client-Schlüssel gehören zum Client; niemals den privaten CA- oder Server-Schlüssel übertragen. Der alte Dienst auf Port 3000 muss vor einer breiteren Freigabe kontrolliert abgelöst werden.

**Kein erfolgreicher Zwei-Computer-Test wird behauptet. Agent-3 wurde nicht verändert.** Ein lokaler Aufruf unter dem echten Agent-3-Client-Schlüssel bestätigte Health/Status, echtes SSE mit Usage und `[DONE]`; Verwaltungszugriff wurde mit HTTP 403 verweigert.

## Dashboard

Ergänzt wurden Rollen, zuletzt beobachtete Clients, HTTP- und native Anfragen, Warteschlange, SSE-Markierung, Einzelabbruch, Modell-RAM-Schätzungen, Inferenz-Lebenszyklus, geplanter API-Neustart, Hintergrundaufträge, Checkpoints, Wiederaufnahme/Abbruch, kritische Freigabe, Fehlerprotokoll, Windows-Status und Agent-3-Profil. Angezeigte Statusdaten kommen von den geschützten APIs. Die Seite wurde im Browser neu geladen und visuell/über ihre zugänglichen Elemente geprüft. Ein vollständiger authentifizierter Browserklicktest aller Funktionen wurde nicht durchgeführt.

## Prüfungen dieser Sitzung

- `npm run build`: vollständiger TypeScript-Build.
- `session2-core.test.ts`: deterministische Rollen-/Checkpoint-/Freigabetests; kein vorgetäuschter Modell-Leistungstest. Hintergrundannahme, Eigentümertrennung, Modellrechte, Quellhashkonflikt, Wiederaufnahme, Abbruch und Abgleich genehmigter Schreibvorgänge geprüft.
- `session2-runtime.test.ts`: echte lokale Inferenz, Modell-RAM-Prüfung, Low-RAM-Verweigerung bei erhaltenem Modell, Stop/Start, SSE-Usage, Warteschlangenabbruch, kooperativer Abbruch mit erhaltener Prozess-ID und simulierte kritische RAM-Entladung.
- Aktualisierter Wächtertest: Absturzwiederanlauf, Doppelstartverweigerung und geplanter Neustart ohne zusätzliches Absturzbudget.
- `session2-tls.test.ts`: tatsächliches lokales HTTPS mit gültiger CA-/IP-Prüfung sowie Ablehnung ohne CA-Vertrauen.
- LAN-Konfigurationstest: Startverweigerung ohne TLS/Allowlist, Subnetztrennung und gesperrte Fernadministration.
- Windows-Aufgabe tatsächlich gestartet, kontrolliert gestoppt und wieder gestartet. Anschließend tatsächlicher geplanter API-Neustart unter demselben Wächter.
- Live-Agent-3-Clientprüfung: HTTP 200, Modell bereit, SSE einschließlich Usage und `[DONE]`, Verwaltung HTTP 403.
- Vorhandene zentrale Authentifizierungs-/Limit-Tests wegen der Rollenänderung gezielt geprüft. Alte umfangreiche Deployment-/Entwicklungsdemos wurden nicht erneut ausgeführt.

## Grenzen und nächste Prioritäten

1. Tatsächlicher Agent-3-Test auf dem zweiten Computer mit TLS-Vertrauen und passender Firewallregel.
2. Größeres geeignetes Coding-Modell nach RAM-/Lizenzprüfung; die 1,5B-Engine bleibt fachlich begrenzt.
3. Semantische Tests und isolierte, ausdrücklich genehmigte Testausführung für erzeugte Reparaturen.
4. Vollständiger Browser-End-to-End-Test der Verwaltungsabläufe.
5. Optionaler echter Windows-Dienst und Test nach Rechnerneustart; geregelte Zertifikatserneuerung.

Die kontrollierten Werkzeugschleifen und Checkpoints machen noch keinen unbegrenzt autonomen Programmierer. Bestehende umfangreiche Entwickler-/Projektmodule bleiben erhalten und sind nicht vollständig neu auditiert. GPU-Beschleunigung und ein höherer Durchsatz wurden nicht behauptet.

Beim abschließenden Live-Neustart trat eine Windows-Dateisperre auf der Wächter-Statusdatei auf. Die Statusdatei und das Journal sind nun ausdrücklich nichtfatal; Statusschreibvorgänge werden kurz begrenzt wiederholt. Anschließend wurde der tatsächliche geplante Neustart erneut erfolgreich unter derselben Windows-Aufgabe geprüft. Der Fehler und seine Behebung sind im Prüfbericht vermerkt.
