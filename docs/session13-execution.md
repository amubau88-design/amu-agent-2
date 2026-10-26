# Sitzung 13 · Sichere Prüfungen und externe Runner-Anbindung · 1.11.0

Ausgang: Version 1.10.0, Commit `319bce5`, sauberes Git. Ausschließlich AMU-Agent-2 bearbeitet. Keine Installationen, großen Modell-Downloads, kostenpflichtigen KI-Dienste oder Änderungen an anderen AMU-Projekten. Vor Änderungen wurde eine vollständige verschlüsselte Sicherung ohne erneute Kopie der unveränderten Modellgewichte erstellt und geprüft: `9ca3ffd2-3850-4e3a-af91-068c93177110`, SHA-256 `cb59388f3685a50c81d20817cb75fca706a0d747761f16ceb365f85e361a8c8d`. Die bestehenden Datenbanken, Schlüssel und historischen Arbeiten bleiben erhalten.

## Tatsächliche Sicherheitsgrenze

Docker, Podman und Windows Sandbox sind auf diesem Rechner nicht verfügbar. Die schreibfreie WSL-Prüfung meldet fehlende Voraussetzungen (Virtual Machine Platform beziehungsweise BIOS-Virtualisierung). Es wurden weder Windows-Funktionen aktiviert noch Dienste oder Container nachinstalliert.

**Keine OS-isolierte Ausführung von Projektcode ist abgenommen. Build-, Unit- und Integrationstests bleiben gesperrt (`isolation_missing`).** Eine getrennte Git-Arbeitskopie schützt das Original im Anwendungsablauf, ist aber keine Betriebssystem-Sandbox. Node `--check` prüft Syntax und führt die geprüfte Datei nicht aus. Auch der neue TLS-Transport und die Selbstauskunft eines externen Runners ersetzen keinen Isolationsnachweis. Es gibt keinen Administrator-Schalter zur Umgehung dieser Sperre.

## Verbundener Entwicklungsablauf

1. Bestehende Projekt-, Client- und Werkzeugberechtigungen begrenzen Auftrag und Dateibereich. Neue Agentenaufträge merken sich aktives Modell und Modellprofil. Ein Modellwechsel blockiert weitere Modellanfragen; nur eine ausdrückliche Administratorfreigabe bei Wiederaufnahme übernimmt das neue Modell. Keine automatische Modellinstallation oder Budgetrücksetzung.
2. Das Modell erstellt den Plan und den Änderungsvorschlag. Der geführte Modus kennzeichnet die tatsächlichen AMU-Lesezugriffe weiterhin als Controller-Schritte. Der freie strukturierte Adapter bekommt nur aktuell erlaubte Werkzeuge angeboten; Eingaben werden weiterhin unabhängig von der Modellgrammatik geprüft.
3. Neue Agentenpakete werden **vor** der Dateifreigabe automatisch gegen ihren exakten Paket-Hash geprüft. JavaScript, MJS und CJS verwenden einen echten begrenzten Node-Unterprozess mit `--check`; andere unterstützte Dateitypen den bestehenden statischen Parser. Das Original und die Arbeitskopie werden dabei nicht verändert. Ein fehlender, unterbrochener oder fehlgeschlagener Check sperrt die Paketübernahme. Löschungen werden als solche ausgewiesen, nicht als bestandener Laufzeittest.
4. Der Administrator sieht Diff, Paket-Hash und tatsächliche Prüfausgaben. Erst die bestehende genaue Freigabe übernimmt Dateien. Danach erfolgen die vorhandenen sicheren Nachprüfungen. Fehler stoppen den Auftrag; ein ausdrücklich angeforderter Korrekturversuch verbraucht das dauerhafte Fehlerbudget. Keine unbeschränkte Reparaturschleife.
5. Die neuen strukturierten Inspektionswerkzeuge `show_diff`, `request_approval` und `prepare_commit` arbeiten ausschließlich auf dem aktuellen Paket des Auftrags. Sie schreiben weder Dateien noch Git. Schreibende Verwaltungsaktionen bleiben getrennte, explizite API-Aktionen.
6. Nach erfolgreichen aktuellen Nachprüfungen erstellt `prepare_commit` einen Plan aus Paket-Hash, Git-HEAD, Status-Hash und exakten Dateihashes. Nicht geprüfte spätere Änderungen werden abgelehnt. Nur der Administrator darf den **angezeigten** Plan-Hash bestätigen. Der Server berechnet den Plan erneut und erstellt dann einen lokalen Commit in der verwalteten Arbeitskopie. Fremde vorgemerkte Dateien und doppelte Freigaben werden abgelehnt. Kein Push, Merge oder Deployment. Commit-Hash und Zeitpunkt bleiben in der Auftragsgeschichte erhalten.
7. Die vorhandene gezielte Wiederherstellung bleibt nutzbar und erhält die Git-Historie. Nach Neustart werden gespeicherte Paket-/Prüfzustände abgeglichen; unvollständige Ausführung wird nicht automatisch wiederholt.

Die Prüfergebnisse sind hashgebundene lokale Artefakte. V8-Heap-, Ausgabe-, Zeit- und Parallelitätslimits der Syntaxprüfung sind keine Garantie einer vollständigen OS-RAM-/CPU-Isolation. Die Tests behaupten dies ausdrücklich nicht.

## Nutzbare externe Anbindung ohne Codeausführung

`remote-runner.ts`, `runner-preflight.ts` und `runner-routes.ts` implementieren eine echte, begrenzte HTTPS-Verbindung mit gegenseitigem TLS, Server-Zertifikat-Pinning, eigener Server-ID und frischen Anfrage-Challenges. Der zentrale AMU-API-Schlüssel wird nicht an den Runner weitergereicht. Private Schlüssel werden nur durch relative PEM-Dateiverweise im privaten Zustandsverzeichnis eingebunden; keine Schlüsselwerte in Git oder API-Antworten. Zertifikate müssen passend provisioniert sein; Provisionierung/Rotation einer realen Gegenstelle ist noch nicht erfolgt.

- Ausschließlich explizite private IP-Adressen; keine DNS-Namen, öffentlichen oder Metadata-Adressen, Weiterleitungen, URL-Zugangsdaten oder freien HTTP-Routen. TLS mindestens 1.2, CA- und Hostprüfung sowie SHA-256-Pin.
- Feste POST-Routen `/runner/v1/capabilities` und `/runner/v1/validate`, Protokollversion 1, höchstens fünf Sekunden pro Anfrage, 64 KiB Antwort und 512 KiB Anfrage. Keine automatische Wiederholung möglicherweise bereits bearbeiteter Anfragen.
- Fähigkeiten werden als **gemeldet** gespeichert. Auch wenn alle gemeldeten Isolationsmerkmale wahr sind, bleiben `isolationVerified:false` und `executionEnabled:false` bestehen. Fehlgeschlagene Probes ersetzen einen früheren Erfolgsstatus.
- Projektspezifische feste Argumentprofile benötigen Administratorfreigabe des Vorschau-Hashes, gebunden an den Workspace. Nur bekannte Programmnamen und zulässige literale Argumente, vollständige Limits; keine freie Shell. Die Freigabe bedeutet ausschließlich Vorbereitung.
- Private Snapshots stammen nur aus AMU-verwalteten Git-Arbeitskopien mit passenden Lese-/Prüfrechten. Explizit 1–12 UTF-8-Dateien, maximal 128 KiB je Datei / 512 KiB gesamt, Pfad- und Linkprüfung, Quellhashes im Manifest.
- Metadatenvalidierung sendet nach gesonderter Administratorfreigabe nur relative Dateinamen, Größen, Hashes und das freigegebene Profil. **Keine Quellinhalte, Hostpfade, Umgebungsvariablen oder API-Schlüssel.** Antwort muss Server, Challenge, Lauf, Snapshot und Profil exakt bestätigen und `executed:false` melden.
- Dauerhafte Laufberichte: pending, validated_metadata_only, rejected, failed, cancelled beziehungsweise interrupted nach Neustart. Höchstens zwei parallele Validierungen; gezielter Abbruch über API. Keine automatische Wiederaufnahme.
- Snapshot-Bereinigung prüft Manifest, Hashes und den gesamten eigenen Verzeichnisinhalt. Fremde/geänderte/verlinkte Daten und aktive Validierungen verhindern sie. Nur aufgezeichnete unveränderte Kopien und leere Verzeichnisse werden entfernt; Originale, Manifest und Verlauf bleiben bestehen.

Eine Gegenstelle kann diesen Vertrag jetzt implementieren und die Metadatenverbindung nutzen. **Es existiert noch kein produktiver entfernter Ausführungsadapter und keine Quellübertragung/Codeausführung.** Der TLS-Testserver in den Tests ist eine Protokoll-Fixture, kein sicherer Runner und kein Zweirechner-Nachweis.

## API und bestehende Oberfläche

Die geschützte deutsche Administratoroberfläche wurde im bestehenden Entwicklungsbereich ergänzt: externe TLS-Verbindung, Probe, Profile, Snapshots, Metadatenfreigabe, Verlauf mit Auswahl und Abbruch laufender Validierungen, sichere Bereinigung, Paket-Vorprüfung und separater Auftrags-Commit. Der Commit-Button bestätigt den tatsächlich angezeigten Plan, nicht einen unbemerkt neu geladenen. Wechsel von Projekt/Profil/Snapshot verwirft zugehörige Freigaben.

Neue zentrale Routen (vorhandene Authentisierung, `core:tasks`, Rollen- und Workspace-Kontrollen):

| Route | Zweck |
| --- | --- |
| `GET/POST /api/core/runner/remote` | Administrator: Verbindungsmetadaten lesen/ausdrücklich konfigurieren |
| `POST /api/core/runner/remote/probe` | Administrator: mTLS-Protokoll prüfen |
| `POST /api/core/runner/profiles/preview` | Administrator: Profil-Vorschau mit Workspace-Hash |
| `GET/POST /api/core/runner/workspaces/:id/profiles` | Projektprofile lesen / administrativ vorbereiten |
| `GET/POST /api/core/runner/workspaces/:id/snapshots` | Berechtigte eigene Snapshots lesen/erstellen |
| `POST /api/core/runner/snapshots/:id/validate` | Administrator: Metadaten explizit senden |
| `GET /api/core/runner/snapshots/:id/history` | Berechtigter Verlauf |
| `POST /api/core/runner/snapshots/:id/cleanup` | Geprüfte eigene Kopien ausdrücklich bereinigen |
| `POST /api/core/runner/validations/:id/cancel` | Eigene aktive Validierung abbrechen |
| `GET/POST /api/core/change-sets/:id/checks` | Sichere Paket-Vorprüfung lesen/starten |
| `POST /api/core/tasks/:id/inspect` | Strikte strukturierte Paket-/Commit-Inspektion |
| `POST /api/core/tasks/:id/commit` | Administrator: exakten Auftrags-Commit freigeben |

`/health`, `/ready`, `/v1/models`, `/v1/chat/completions` und Streaming, bestehende Schlüssel-/Eigentümerverwaltung, Backups, Modellprofile und Workspace-Funktionen bleiben erhalten. Lokale native Inferenz benötigt weiterhin keinen Ollama-Server. Neue Sicherungen verlangen mindestens Anwendungsversion 1.11.0, damit die neuen verpflichtenden Prüfzustände nicht unbemerkt von einer älteren Anwendung aktiviert werden.

## Gezielte Verifikation

- `npm run typecheck` und Produktionsbuild.
- `npm run test:session13`: echter gegenseitiger TLS-Handshake mit eigenen kurzlebigen Dateizertifikaten (kein Windows-Zertifikatspeicher), Nonce/Pin/Rollen/Pfade/Antwortgrößen, falsche Ausführungsbehauptung, Snapshot-Manipulation, Abbruch und fremddatensichere Bereinigung; reale Node-Syntax-Unterprozesse und Git-Arbeitskopien; vollständige UI-Handler gegen eine getrennte reale API.
- Workflow-Test: ein vom bestehenden Parser akzeptierter, aber von Node abgelehnter Vorschlag stoppt vor jeder Anwendung. Fremdänderungen nach erfolgreichen Prüfungen sperren Commit-Vorbereitung. Exakte administrative Freigaben, doppelte Commit-Verhinderung, gezielte Rücknahme und persistierte Geschichte werden geprüft.
- Regression des Agenten aus Sitzung 12 und der Arbeitskopien-/Freigabe-/Git-/Runner-Funktionen aus Sitzung 11. Modellantworten in diesen Softwaretests sind ausdrücklich vorgegeben; daraus wird keine Modellqualität abgeleitet. Ein Profilwechsel wurde zusätzlich vor jedem weiteren Modellaufruf wirksam blockiert.

### Reale lokale Modellabnahme

Mit dem tatsächlich geladenen eingebetteten Qwen2.5-1.5B wurde Auftrag `b6a6ac0a-bdbc-4f60-ba2c-8aa4c10a2eb5` im geführten `amu-flat-v1`-Modus abgeschlossen: zwei MJS-Dateien nur in der AMU-Git-Arbeitskopie von `value = 1` auf `value = 2` geändert; Originale unverändert. Zwei reale Node-Vorprüfungen vor der Administratorfreigabe, zwei reale Node-Nachprüfungen, drei Modellanfragen, sieben budgetierte Schritte, null Fehlerversuche, 85,846 Sekunden aktive Laufzeit. Danach tatsächlicher freigegebener lokaler Auftrags-Commit `db88d920816b1feedbf1c54e8568df13b5f9d1f7`. Dieser Hash gehört zum Beispiel-Repository, nicht zum Plattform-Commit.

Ein angeforderter Build wurde anschließend tatsächlich mit `unavailable / isolation_missing` abgelehnt. Die eigene Original-Fixture wurde ohne Datenlöschung geschlossen und die erfolgreich geprüfte Kopie schreibgeschützt. Der vollständige lokale Nachweis liegt unter `scratch/session13-native-result.json`, einschließlich Checkpoints, Prüfergebnissen und Commit. Keine nativen Tool-Calls, kein Unit-Test, kein ausgeführter Projektcode und keine zuverlässige freie Werkzeugwahl werden daraus abgeleitet.

Die Browserprüfung mit bestehendem Administratorzugang bestätigte Version 1.11.0, die neue Runner-Verwaltung und `configured:false`, `isolationVerified:false`, `executionEnabled:false`. Es wurde keine produktive externe Gegenstelle eingerichtet. Screenshot: `scratch/session13-dashboard.png`.

### Tatsächlicher API-Betrieb und Sicherungsnachweise

Nach kontrolliertem Neustart wurde Version 1.11.0 auf `http://127.0.0.1:3030` als `ready` geprüft: eingebetteter llama.cpp-CPU-Worker, Qwen2.5-1.5B bereit, kein Wartungsmodus, keine wartenden/laufenden Anfragen. `/health` und `/ready` liefern den Betriebsstatus. `/v1/models` lehnt fehlende Authentisierung mit HTTP 401 ab und liefert mit dem **bestehenden** AMU-Agent-3-Client-Schlüssel das lokale Modell. Ein echter `/v1/chat/completions`-Streaming-Aufruf mit diesem Schlüssel lieferte HTTP 200, `chat.completion.chunk` und abschließend `[DONE]`. Kein Schlüssel wurde dazu erneuert oder ausgegeben. Nachweis: `scratch/session13-api-result.json`. Das ist ein lokaler API-Nachweis; Agent-3 auf einem zweiten Computer und LAN/TLS wurden nicht getestet.

Der abschließende Quellscan prüft die geänderten Dateien gegen die vorhandenen Administrator-, Client- und Recovery-Schlüssel, ohne sie auszugeben. Build, Typecheck, gezielte Tests und `git diff --check` wurden bestanden. Lokale Betriebsnachweise unter `scratch/session13-final-status.json` sowie Ausgangs-/Abschlussarchiv-Metadaten unter `scratch/session13-backup-before.json`, `scratch/session13-backup-after.json` und den zugehörigen `session13-verify-*.json` werden bewusst nicht als Geheimnis-/Betriebsdaten in Git aufgenommen. Der Abschlussbericht nennt den tatsächlichen Plattform-Commit und den geprüften Archivstatus. Neue Sicherungen kopieren unveränderte Modellgewichte nicht erneut; vorhandene Gewichte bleiben erhalten.

## Prioritäten für Sitzung 14

1. Eine ausdrücklich bereitgestellte dedizierte Linux-VM beziehungsweise einen separaten Runner-Rechner abnehmen; darin einen festen Ausführungsadapter implementieren. Rootless-Container sind eine mögliche zusätzliche Grenze, keine schon vorhandene Installation. Vorher echte Rechte-, Datei-, Credential-, Netzwerk-, Prozessbaum- und Ressourcenprüfungen durchführen. Keine Freigabe allein aufgrund der Capability-Antwort.
2. Für Container gegebenenfalls cgroup v2, systemd und Controller-Delegation tatsächlich nachweisen; Ressourcenflags können ohne Voraussetzungen wirkungslos sein. Netzwerk ausdrücklich isolieren, keine Hostsecrets/Docker-Sockets mounten, unveränderliche lokale Images und feste Argumentprofile, keine automatischen Pulls. Quelle: [Docker Rootless-Ressourcenlimits](https://docs.docker.com/engine/security/rootless/troubleshoot/), [Netzwerkmodus none](https://docs.docker.com/engine/network/drivers/none/), [Docker-Sicherheitsgrenzen](https://docs.docker.com/engine/security/).
3. Erst nach dieser Abnahme eng begrenzte Build-/Unit-/Integrationstestausführung, Artefaktübertragung, echte Fehlerkorrektur und Wiederherstellung Ende zu Ende aktivieren. Produktionsfreigabe bleibt separat.
4. Freie Werkzeugwahl mit geeigneterem Modell abnehmen. Qwen2.5-1.5B bleibt ein kleines Entwicklungsmodell; native Tool-Calls und größere Qwen-Coder-Profile einschließlich 30B-A3B sind noch nicht praktisch abgenommen. Keine automatischen Gewichtsdownloads.
5. Reale LAN/mTLS-Verbindung zwischen zwei Computern, Zertifikatsrotation und komplette Qualitätsabnahme durchführen. Metadatenverbindung im lokalen Test ersetzt diese Abnahme nicht. Der dauerhafte Git-Pfad zeigt weiterhin auf die vorhandene Codex-Laufzeit und sollte später auf eine regulär bereitgestellte Git-Installation umgestellt werden.

Damit besteht ein praktisch verbundener, freigabepflichtiger Entwicklungsablauf mit sicheren Syntaxprüfungen. Eine vollständig autonome Entwicklungsplattform mit ausführbaren Projekt-Tests wird ausdrücklich nicht behauptet.
