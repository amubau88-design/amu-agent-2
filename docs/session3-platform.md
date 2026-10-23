# AMU Multi-Client-Plattform – Sitzung 3

Stand: 23.10.2026, Version 1.3.0. Ausschließlich AMU-Agent-2 wurde geändert. Grundlage war der saubere Commit `0c17b87`.

## Tatsächlich implementiert

- Beliebige Anwendungen über das vorhandene Dashboard registrieren, umbenennen, deaktivieren und wieder aktivieren. Stabile UUID, einmalig ausgegebener Schlüssel mit Kopier-/Vergessen-Schaltfläche, Schlüsselrotation und Widerruf. Keine Quellcodeänderung je neuer Anwendung erforderlich.
- Rollen bleiben erhalten. Zusätzliche explizite Freigaben `models:read`, `chat:write`, `core:tasks` begrenzen die jeweiligen APIs. Entwicklungsaufträge erfordern zusätzlich die Entwicklerrolle; das Anwenden von Vorschlägen bleibt Administratoren vorbehalten. Alte Clients ohne Scope-Feld behalten ihre bisherigen rollenabhängigen Rechte.
- Modellfreigaben, RPM, maximal gleichzeitig angenommene Client-Anfragen (einschließlich wartender Anfragen), Ausgabetokens, individuelles Kontextlimit, UTC-Tagesbudget und administratorseitig zugewiesene Priorität. Maximal 16 angenommene Anfragen je Client, zusätzlich globale Grenzen.
- Dauerhafte Nutzungszähler: HTTP-Anfragen, Fehler, Laufzeiten, tatsächliche Eingabe-/Ausgabetokens, berechnete Budgettokens und letzter Fehler mit Request-ID. Neustartfest in `scratch/secrets/client-usage.json`. Die laufenden HTTP-Verbindungszähler sind bewusst flüchtig.
- Quoten werden **vor** nativer Inferenz dauerhaft reserviert. Die Reservierung verwendet eine konservative Obergrenze aus UTF-8-Eingabebytes, Nachrichtenaufschlag und Ausgabelimit. Erfolgreiche native Antworten rechnen auf tatsächliche Tokens ab. Bei abgebrochenen/fehlgeschlagenen oder durch Prozessabbruch nicht abschließend abrechenbaren Generationen bleibt die konservative Reservierung belastet. Sie ermöglicht deshalb keine millimetergenaue Abrechnung fehlgeschlagener Anfragen; sie verhindert ein Umgehen des Budgets durch Abbruch/Neustart. Ein Budget von 0 bedeutet unbegrenzt. Zu kleine Budgets können Anfragen schon vor Ausführung ablehnen.
- Derselbe native Autorisierungshook schützt auch Core-Generationen: Modellfreigaben, Scopes, Kontext-, Token-, Parallelitäts- und Tageslimits. Neue Generationen deaktivierter Clients werden verweigert. Rechteänderungen und Widerruf brechen betroffene wartende/laufende HTTP- und native Aufträge ab.
- Private Request-Audits mit Client-ID, Request-ID, Route ohne Query, Methode, Status und Dauer; keine Schlüssel, Prompts oder Antworten. Rotation bei etwa 1 MiB, eine Vorgängerdatei. Bestehende System-/Ereignisprotokolle bleiben erhalten.
- `/health` bleibt der Liveness-/Status-Endpunkt mit HTTP 200. Neue öffentliche `/ready`, `/readyz`, `/v1/ready` geben 200 bei bereiter Inferenz, sonst 503 zurück. Netzwerk-Quellfilter bleiben auch für diese Endpunkte aktiv. Fehler behalten den bisherigen numerischen `code` und ergänzen einen stabilen semantischen `reason`.
- Gateway und native Queue verteilen nach Client. Jeder zweite Dispatch erfolgt als normales Round Robin; dazwischen dürfen höher priorisierte Clients bevorzugt werden. Eine ständig nachliefernde priorisierte Anwendung verdrängt die übrigen deshalb nicht dauerhaft. Ein bereits laufender Auftrag wird nicht zur Priorisierung unterbrochen.
- Bounded Queues, Deadlines, Client-Isolation, bestehender Abbruch, RAM-Vorprüfung und Notentladung bleiben aktiv. Gateway- und native Queue sind getrennte, jeweils begrenzte Stufen; `queueCapacity` gilt für jede Stufe, nicht als gemeinsame Gesamtzahl.

## Dashboard bedienen

1. Auf `/admin` mit dem vorhandenen Administrator-Schlüssel anmelden.
2. Unter „Anwendungen und Client-Zugänge“ einen beliebigen Namen, Rolle, API-Freigaben, Modellfreigaben und Limits angeben.
3. „Client erstellen“ erzeugt die UUID und zeigt den Schlüssel einmalig an. Kopieren und beim jeweiligen Client sicher hinterlegen. „Schlüssel ausblenden und vergessen“ entfernt die zusätzliche Anzeige aus dem Seitenspeicher. Ein Administrator-Schlüssel bleibt für die aktive Anmeldung im Passwortfeld erforderlich.
4. „Rechte ändern“ öffnet vorhandene Clients einschließlich gesperrter Clients. Name und Aktivierung können dort gespeichert werden. „Neue Anwendung vorbereiten“ setzt das Formular für eine weitere Anwendung zurück.
5. Nutzung, Fehler, letzte Aktivität und Anfragenzustände stehen unter den jeweiligen Clients bzw. in der Queue-Ansicht. Die Oberfläche verwendet für dynamische Inhalte `textContent`.

Es wurden keine unbenutzten produktiven Schlüssel für AMU WEB, AMU SYSTEM oder den Preis Assistenten erzeugt und keine dieser Anwendungen verändert. Sie können ebenso wie zukünftige Anwendungen über dieselbe Oberfläche registriert werden. Der vorhandene Agent-3-Zugang blieb gültig.

## Ressourcenprofil und Architektur

Administrator-Endpunkt `GET/POST /api/central/platform`, im Dashboard „Server- und Ressourcenprofil“. `GET` unterscheidet aktive und gespeicherte Konfiguration; Änderungen benötigen einen kontrollierten API-Neustart. Datei: `scratch/secrets/platform.json`.

| Einstellung | Standard / Grenze |
|---|---|
| `gatewayConcurrency` | 2; 1–16 |
| `queueCapacity` | 16 je Stufe; 1–128 |
| `requestTimeoutMs` | 120000; 1000–600000 |
| `threads` | automatisch höchstens 4; 1 bis verfügbare logische CPUs |
| `contextSize` | 4096; 512–32768, zusätzlich Modellkapazität/RAM-Vorprüfung |
| `memoryFraction` | 0,65; 0,1–0,85 des Gesamtspeichers |
| `reserveMiB` | mindestens 2048 MiB standardmäßig; zusätzlich bleibt mindestens 10 % Systemreserve |
| `criticalFreeMiB` | 512; muss unter der konfigurierten Reserve liegen |

Das ist eine funktionierende **Einzelserver-Basis mit einem nativen Modell-Worker und einer gleichzeitig laufenden Generation**. Mehrere Clients werden kontrolliert bedient; `gatewayConcurrency` erzeugt keine zusätzlichen nativen Sequenzen. Der Modell-RAM wird gemeinsam genutzt und wird nicht als vermeintlicher privater RAM-Verbrauch je Client ausgewiesen. Pro Client sind Tokens, HTTP-Zeit, Aktivität und Fehler verfügbar; exakte CPU-/RAM-Verrechnung je Client ist nicht implementiert.

Verantwortlichkeiten: `amu-api/server.ts` authentifiziert/routet HTTP, `central/service.ts` verwaltet Clients und Gateway-Aufnahme, `inference/engine.ts` verwaltet Jobs/Abbruch/Worker-Lebenszyklus, `inference/worker.ts` führt ausschließlich lokale GGUF-Inferenz über private Prozess-IPC aus. `core/controller.ts` verwaltet persistente Entwicklungsaufträge und Prüfpunkte; es gibt weiterhin keine automatische Wiederholung freigegebener Quellcodeänderungen.

Ein späterer Worker-Pool kann mehrere Instanzen der vorhandenen `AMUInferenceEngine` hinter einer gemeinsamen Dispatch-Schicht betreiben; davor sind ein aggregiertes RAM-/CPU-Budget, die Worker-Auswahl und einheitliche Reservierungen zu ergänzen. Mehrere aktive Inferenz-Worker, Remote-Worker, GPU-Betrieb, verteilte Quoten und Cluster-HA werden **nicht** als fertig implementiert ausgewiesen. Zusätzliche Server benötigen später authentifizierte verschlüsselte Worker-Kommunikation; derzeit wird kein zusätzlicher Netzwerkport dafür geöffnet.

## Bestandsschutz und Migration

Vor Änderungen: `scratch/backups/session3-before-20261023-220056` mit Quellcode, privaten Konfigurationen und anschließend ergänzter Kopie der bestehenden Checkpoints, Core-Daten, persistenten Aufgaben, Projekte, Staging und Versionierung. Die vorhandene unveränderte GGUF-Datei ist per SHA-256 referenziert; vollständige frühere Sicherungen werden erhalten. Es wurden keine Datenbanken zurückgesetzt und keine anderen Projektverzeichnisse beschrieben.

`node scripts/portable-snapshot.mjs create` erstellt eine neue portable Kopie **nur bei gestopptem API-Server und Supervisor**. Sie enthält Quellcode, Lockfile, alle relevanten bestehenden Scratch-Daten einschließlich Modelle, private Konfiguration, TLS-Dateien und Aufgaben sowie ein SHA-256-Manifest. Redundante Backups, Testverzeichnisse und Laufzeit-/Hilfsdateien werden ausgelassen. In kopierten Task-Metadaten wird nur die rechnergebundene `ownerPid` entfernt. Quellaufgaben bleiben unverändert.

`node scripts/portable-snapshot.mjs verify <Pfad innerhalb scratch>` prüft Hashes, zusätzliche nicht gelistete Dateien, Pfadgrenzen und Symlinks. Kein automatisches Überschreiben eines bestehenden Projekts und kein automatischer Restore. Das Archiv enthält private Schlüssel und muss entsprechend geschützt übertragen/aufbewahrt werden.

Migration: Server kontrolliert stoppen, neue Kopie erstellen und prüfen, auf dem Ziel in ein gesondert geprüftes Zielverzeichnis übernehmen, Node 24 und die gesperrten Abhängigkeiten installieren, CPU-/RAM-Profil an die Zielhardware anpassen, Modelle prüfen und starten. Ein auf dem Quellrechner zulässiger Threadwert kann auf einem kleineren Zielrechner ungültig sein und muss vor dem Start angepasst werden. Netzwerkumgebung, Windows-Anmeldetask und TLS-Zertifikate für den neuen Host separat einrichten; keine fremden absoluten PID-/Autostart-Pfade übernehmen. Unterbrochene Core-Jobs werden explizit vom Prüfpunkt fortgesetzt; Chat-Anfragen werden nicht automatisch wiederholt.

Das Offline-Exportwerkzeug wurde hinsichtlich Manifest-/Manipulationsprüfung und Verweigerung bei laufendem Server geprüft. **Ein vollständiger Offline-Export/Restore oder Rechnerumzug wurde in dieser Sitzung nicht durchgeführt.**

## Sicherheit und tatsächlicher Betrieb

Version 1.3.0 wurde im laufenden Supervisor kontrolliert geladen. `/health` meldete `ready`, `/ready` HTTP 200, lokale eingebettete Inferenz mit `qwen2.5:1.5b`. Produktiver SSE-Aufruf mit dem bestehenden Inferenz-Client funktionierte; dessen Zugriff auf Plattformverwaltung wurde mit 403 verweigert. Supervisor blieb derselbe, API-Prozess wurde ersetzt. Zugriff weiterhin ausschließlich `127.0.0.1:3030`; LAN wurde nicht freigeschaltet. TLS-/Subnetz-/Remote-Admin-Schutz aus Sitzung 2 bleibt bestehen. Ein Zweitrechner-Test steht weiter aus.

Die Engine benötigt weder Ollama noch kostenpflichtige/externe Inferenz. Die vorhandene Ollama-Installation und andere lokale Dienste wurden nicht beendet oder entfernt.

Zusätzliches Windows-ACL-Schutzskript: `scripts/protect-private-state.ps1`. **Nicht angewendet**: Die normale Skriptausführung wurde durch die Windows-Ausführungsrichtlinie blockiert; die anschließende Ausführungsfreigabe wurde abgelehnt. Bestehende explizite Schlüssel-ACLs bleiben erhalten, aber neue Nutzungs-/Auditdateien und Sicherungskopien erben weiterhin die bestehenden Verzeichnisrechte. Eine weitergehende Windows-Dateirechtehärtung ist offen. Keine geheimen Schlüssel, Nutzungsdateien oder Modellgewichte wurden in Git aufgenommen.

## Gezielte Prüfung

- `npm run build` erfolgreich.
- `src/tests/session3-platform.test.ts`: HTTP-Clientverwaltung, Scope-/Rollenisolation, Aktivierung, Rotation, Tagesbudget, Core-Policy, reale Gateway-Überlast, priorisiertes Round Robin, laufender Widerruf, Audit ohne Schlüssel, persistente Zähler in neuem Prozess, gespeichertes/aktives Profil, Dashboard-JavaScript-Syntax.
- `src/tests/session3-native.test.ts`: zwei reale lokale Client-Generationen mit JSON/SSE und Usage, natives Kontextlimit, Quotenablehnung vor Inferenz, Stream-Abbruch mit Freigabe der Reservierung und Wiederverwendung des Workers.
- Bestehende gezielte Tests `central-server.test.ts` und `session2-core.test.ts` erfolgreich; keine pauschale Ausführung der alten Entwicklungs-/Deploy-Demos.
- Snapshot-Verifikation: korrektes Manifest akzeptiert, manipulierte/zusätzliche Dateien abgelehnt, Online-Export verweigert.
- Laufender Server: kontrollierter Versionswechsel, Readiness, vorhandener Client, Admin-Trennung und echtes SSE geprüft. Dashboard im vorhandenen Browser neu geladen; neue Bereiche sichtbar. Kein authentifizierter Ende-zu-Ende-Browsertest und kein Clipboard-Test behauptet.

## Nächste Sitzung

1. Geprüfter vollständiger Offline-Export und Wiederherstellung in isolierter Testumgebung; Windows-Dateirechte nach freigegebener Betriebsentscheidung härten.
2. TLS-/Firewall-/CA-Einrichtung und tatsächlichen Zugriff von einem zweiten Rechner testen; Anwendungen einzeln über das Dashboard registrieren und anbinden.
3. Echten lokalen Worker-Pool mit gemeinsamem Dispatch und aggregiertem CPU-/RAM-Budget entwickeln und auf Zielhardware vermessen.
4. Persistente Chat-Jobs mit expliziter Wiederaufnahme/Idempotenz ergänzen; anschließend gesichertes Protokoll für zusätzliche Inferenzserver entwickeln.
