# Sitzung 40 – Qualifikation und persistente Worker-Recovery

Ausgangsstand: 1.36.0, lokaler master 38e3734. Veröffentlichter main und v1.36.0: b5339b4. Vor Änderungen verschlüsselte Quell-/Konfigurationssicherung 3b45a137-c981-4b64-ace7-3959c4c214b9, authentifiziert extrahiert. Andere Projekte und Datenträger nicht bearbeitet.

## Implementierung

- Neue Coding-Checkpoints in SQLite mit WAL, synchronous=FULL, SHA-256-Bindung, unveränderlicher Eigentümerkennung und Revision. JSON bleibt als Wiederherstellungsspiegel erhalten; vorhandene JSON-Aufträge werden weiterhin gelesen, keine ungeprüfte Massenmigration. SQLite-Checkpoints funktionieren auch ohne JSON-Spiegel. Task-Anzeige und Wiederherstellung lesen den dauerhaften Zustand.
- Opt-in workerCrashRecovery erfordert Administration. Genau eine automatische Wiederaufnahme bei der konkreten internen Meldung „Embedded inference worker stopped“. SQL-Identität, Quelldigests und Phase werden geprüft. Bereits validierte Entwürfe, Schritte und Budgets bleiben erhalten. Nur die unvollständige Inferenzanfrage darf erneut gestellt werden und verbraucht ein weiteres Modellbudget. Kein automatisches Wiederholen von Dateiübernahmen, Commits, Containerjobs oder beliebigen Fehlern.
- /ai/active und /metrics liefern authentifizierte Administrationsdaten. /health bleibt öffentlich. Keine öffentlichen Aufgabeninhalte oder Schlüssel in Metriken.
- Literalwerte aus eingefrorenen, importgebundenen Vertragstests werden statisch als Modellkontext bereitgestellt, ohne Codeausführung oder algorithmische Ersatzimplementierung. Baseline-Befunde können mit tatsächlicher Modellplanung kombiniert werden.
- Modellkontext enthält verkürzte fehlgeschlagene Befunde statt langer erfolgreicher Logs und irrelevanter Digests. Die tatsächlichen Quellen-/Paketbindungen bleiben außerhalb des Modells unverändert vollständig geprüft.

## Bisherige echte Läufe – keine Erfolgsumdeutung

Neue separate kombinierte Testkopie mit convert.mjs, stock.mjs und shipping.mjs. Defekter Ausgangszustand real im bestehenden Rootless-Linux-Runner durch Build, Syntax, Unit und HTTP-Integration geprüft. Handler, bestehende Tests und Paketdefinition sind unveränderlich. Keine generierten Programme auf Windows ausgeführt.

1. Auftrag 1ddaba69-4111-4cf4-9de6-849b350c71ac: durch zu häufige zusätzliche Managementabfragen wurde das bestehende Client-Ratenlimit erreicht. Orchestrierung abgebrochen, Auftrag gezielt abgebrochen, kein Paket übernommen, kein Worker getötet. Zwei Modellaufrufe, eine ungültige/no-op Editentscheidung. Dies ist eine fehlgeschlagene Qualifikation mit zusätzlichem administrativen Prüfablauffehler.
2. Auftrag 6b13efce-891d-4c1a-9b76-25dc8d4cf2da: Modell erstellte eigenen Minimalplan und korrekten Temperaturentwurf. Inferenz-Worker PID 21060 während stock.mjs gezielt beendet. AMU lud den Checkpoint aus SQLite, bewahrte convert.mjs und Budgets, startete die Inferenz neu und setzte beim unvollständigen Ziel an. 114 Sekunden für einen Modellaufruf erzwangen begrenzte Fensterwechsel; das automatische Kind erreichte sein 120-Sekunden-Limit. Gesamt: vier Modellaufrufe, ein Kind, keine abgeschlossene Gesamtabnahme, keine Übernahme. SSE während des Auftrags HTTP 200 mit [DONE], Warteschlangenlaufzeit ca. 119,3 Sekunden; keine Behauptung niedriger Chatlatenz.
3. Weiterer begrenzter Lauf erst nach konkreter Kontextverkleinerung wegen der gemessenen Prefill-Zeit. Alle vorherigen Versuche und Zähler bleiben erhalten. Keine manuellen Reparaturen der Testprogramme.

Acht echte Linux-Isolationsgruppen bestanden. Nach einer Unterbrechung über die 24-Stunden-Gültigkeit hinaus wurde der Prüfbericht frisch wiederholt statt sein Datum umzuschreiben. Alte Berichte blieben erhalten. Aktueller Offline-SHA-256: 94dd7b3a083ff4f7e8f236ff051e1dff5594fe3b05b28db45fb057ad47c1f3fa. Kein Paket-/Image-/Modell-Download und keine Änderung der Limits, Firewall, Partitionen oder Windows-Konfiguration.

## Tests und Grenzen

Echte Verwaltungsregressionen und ausdrücklich modellgemockte Controller-Fixtures werden getrennt von Linux-Projektausführung gezählt. Vier ältere Fixtures mussten an die jetzt maßgebliche SQLite-Persistenz beziehungsweise die bereits zuvor verschärfte exakte Ankerschema-Schnittstelle angepasst werden; ihre Abnahmebehauptungen bleiben erhalten. Dies betrifft keine eingefrorenen Projekt-Vertragstests.

Neuer echter Prozessabbruchtest bestätigt WAL-Wiederöffnung, synchron bestätigte Schritte und erhaltene Entwürfe. Ein separater Controller-Test bestätigt SQL-Wiederaufnahme bei gemocktem Modellfehler, Einmalbudget, unveränderte Quellen, fehlenden JSON-Spiegel und Mandantentrennung. Diese Fixtures ersetzen den oben beschriebenen echten Worker-Absturz nicht.

Eine unterbrochene Berechnung kann nicht an derselben CPU-Instruktion weiterlaufen. Die belastbare Zusage betrifft den letzten atomar bestätigten fachlichen Checkpoint; nur unbestätigte Inferenz wird wiederholt. Ein vollständiger Gateway-/Windows-Absturz während einer Containerübernahme ist damit nicht abgenommen.

Produktionsfreigabe, Versionsanhebung und main-Update bleiben an tatsächlich bestandene Gesamtabnahme gebunden. Solange diese fehlt, kein Produktionsrelease und keine „100 %“-Behauptung.

## Abschließender erfolgreicher Lauf und Freigabeumfang (02.11.2026)

Der dritte Auftrag dff08a01-b2e4-462a-9fff-3d415133644e bestand vollständig. Eigenes lokales Modell Qwen2.5-Coder-1.5B Q4_0: Minimalplan, drei korrekte Modulentwürfe und Paketbildung. Fünf Modellanfragen einschließlich einer durch gezielten Worker-Absturz unterbrochenen Anfrage, keine fehlerhaften Modellausgaben, kein Kindauftrag, zwei automatische begrenzte Fensterfortsetzungen. Der SQL-Checkpoint bewahrte convert.mjs und die bisherigen Zähler nach Beendigung von Worker PID 20640. Kein manueller Austausch der Modellimplementierungen.

Tatsächlich bestandene isolierte Profile: s29-build, s29-syntax, s29-unit, s29-integration. Run df2787f7-1a8c-4fb5-810a-8ce51d96f0c2, Paketdigest 7557232891a26dde9955e2cbc5686bcc9e80c8891b4a728dd16de95f86144e25. Unveränderte Vertragstests und zusätzliche eingefrorene Regressionen. Das vollständige ursprüngliche Testgerüst ist als src/tests/fixtures/session40-combined.json im Repository enthalten.

Die konkrete Testübernahme war durch die ausdrückliche S40-Eigentümerfreigabe für den neuen ungefährlichen Testworkflow autorisiert. Digest-Vorschau vorher lokal gespeichert, falscher Digest real mit 403 abgewiesen. Paket nur in dieser Arbeitskopie angewendet, sichere Nachprüfung und Faktenbericht abgeschlossen. Test-Git-Commit b3bca14693007451e3360407a8f7256d6a4bbe22 erstellt. Anschließender gezielter Paket-Restore stellte alle acht Dateien hashgleich wieder her; Referenz blieb unverändert und Test-Commit bleibt in der Historie. Der Auftrag ist vor Restore als completed dokumentiert; die anschließende Restore-Aktion setzt seinen aktuellen Zustand absichtlich auf paused, ohne einen weiteren Lauf zu starten.

Drei Versuche zusammen: elf Modellanfragen (2 + 4 + 5), ein automatisches Kind im gescheiterten zweiten Lauf. Kein Erfolg aus dem ersten oder zweiten Lauf abgeleitet. Codex entwickelte Plattformcode, Testgerüst und Management-Orchestrierung; AMU/Modell erledigte innerhalb des dritten Laufs Planung, Quelllesen, Reparaturentwürfe, Checkpoint-Recovery und Übergabe an die isolierte Prüfkoordination. Die finalen Implementierungen wurden nicht durch Codex ersetzt.

35 eindeutige gezielte Verwaltungs-/Regressionsprogramme abschließend bestanden, darunter die zwölf bestehenden Suites der bisherigen Auswahl. Diese zwölf sind in den 35 enthalten, keine zusätzliche doppelte Zählung. Neue S40-Prüfungen nach Versionswechsel nochmals mit npm run test:session40 bestanden. TypeScript --noEmit ohne Fehler. Acht reale Isolationsgruppen separat bestanden.

Nach dem Crash erstellter verschlüsselter Konfigurationsexport f75b1c28-90dc-450e-b663-bc1ecd6f504a und erneute authentifizierte Integritätsprüfung einschließlich aller sechs enthaltenen SQLite-Dateien bestanden. Windows-Langpfadfix bleibt aktiv. Kein Live-Restore. Auf Version 1.37.0 regulären Windows-Eigentümercodesicherungsweg und echte Browseranmeldung, Reload-Wiederherstellung sowie Streaming erfolgreich geprüft; Einmalcode privat verbraucht und temporäre Datei entfernt.

API 1.37.0 bereit, Qwen2.5-1.5B für Chat zurückgesetzt, Kontext 4096. Zwei finale warme SSE-Anfragen 1220 und 1048 ms. Während des erfolgreichen Jobs SSE HTTP 200 und [DONE] nach 81.997 ms (Ein-Worker-Warteschlange). Kaltladezeit 7043 ms; Drei-Sekunden-Kaltstartziel weiterhin nicht erreicht. /ai/active und /metrics während des Jobs busy/active=1, SQLite-WAL ok; anonym jeweils 401. Ende: keine aktiven oder wartenden Aufträge, Runner-Dienst inactive/disabled, null Container, rootful Docker/socket/containerd masked, core_pattern=core. C: etwa 19,03 GiB frei, RAM am finalen API-Prüfpunkt etwa 12,26 GiB frei.

Version 1.37.0 ist für den hier qualifizierten lokalen, begrenzten Coding-Workflow freigegeben. Diese Abnahme deckt keine beliebigen Großprojekte, mehrere gleichzeitig aktive Coding-Jobs, Windows-/Gateway-Abstürze während Containerjobs, LAN-/R630-Betrieb oder unter drei Sekunden liegende Kaltstarts ab. Eigentümerfreigaben, Rollen, Limits und Runner-Freigabe vor jeder neuen Sitzung bleiben erforderlich. Kein dauerhaft offener Ausführungszugang.
