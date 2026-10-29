# Sitzung 29 – Stabilisierung und reale Quote-API-Abnahme

**Der komplexere Coding-Auftrag ist nicht bestanden.** Die Steuerung erkennt und begrenzt die Fehler, das vorhandene kleine Modell erzeugt jedoch weiterhin falsche Validierungslogik. Keine Änderung wurde in Test-Originaldateien oder produktive Projekte übernommen. Kein Testprojekt-Commit und kein echter anschließender Restore in dieser Sitzung; beides blieb wegen des fehlgeschlagenen Integrationstests gesperrt.

Quellversion **1.27.0**, Ausgangscommit **0d476a3** bei sauberem Arbeitsbaum bestätigt. Bestehendes AMU-Agent-2 fortgeführt, keine neue Anwendung außerhalb der harmlosen isolierten Testdaten angelegt. Quelländerungen werden separat vom fehlgeschlagenen Modellauftrag in Git gesichert.

## Implementierte Steuerungsverbesserungen

- Exakte vollständige JSON-/Schema-Prüfung vor jeder Modellentscheidung, zusätzlich zur nativen Grammatik. Unvollständige, falsche oder am Tokenlimit abgeschnittene Ausgaben werden nicht ausgeführt. Validierungsfehler erhalten eine begrenzte Fehlerklassifikation und Rückmeldung für den nächsten Versuch.
- Eindeutige vorhandene `find`-/`replace`-Anker werden im Arbeitsspeicher zu der bestehenden vollständigen Änderungstransaktion erweitert. Fehlende, mehrdeutige oder fremde Anker verwerfen das gesamte Ergebnis. Keine unscharfen Ersetzungen und keine Teilanwendung.
- Geführte Änderungen werden einzeln pro Datei generiert und validiert. Private Entwürfe einschließlich ursprünglichem Quellhash bleiben über kontrollierte Unterbrechungen erhalten. Erst alle Entwürfe gemeinsam ergeben ein Freigabepaket. Kein Zurücksetzen bereits validierter Arbeit bei gewöhnlicher Fortsetzung.
- Geschützte Taskdateien und ausschließlich erweiterbare Unit-Testdateien. Die HTTP-Integrationstests, Server, Dokumentation und Paketdefinition dieses Tests waren geschützt. Bestehende Unit-Assertions dürfen nicht ersetzt oder gelöscht werden. Eine ergänzte Testdatei bleibt dennoch im Diff zu prüfen; die Regel ist kein allgemeiner Beweis gegen jede denkbare Manipulation durch angehängten Code.
- Begrenzte Dateiziele im API-/Admin-Auftrag reduzieren Vermischung verschiedener Dateien. Optionaler AMU-Faktenbericht aus tatsächlich zugeordneten Prüfdaten spart eine zusätzliche Modellrunde; er ersetzt keine Pflichtprüfung.
- Native IPC-Fortschrittsphasen `prefill`, `validating`, `finalizing`, getrennt von Textausgabe und Jobzuständen. Ohne erste Ausgabe gilt weiterhin die normale Anfragefrist. Nach bereits begonnener Ausgabe greifen 20 Sekunden Stillstandsgrenze, bei nativer Finalisierung 10 Sekunden; vorhandene Abbruch-/Prozesswiederherstellung bleibt zuständig. Diese beiden Stillstandsgrenzen wurden mit kontrollierter Uhr getestet, nicht als tatsächlich in dieser Sitzung beobachteter nativer Finalisierungsfehler ausgegeben. Ihre Eignung für große, sehr langsame Zukunftsmodelle ist gesondert zu qualifizieren.
- Genau ein optionaler automatischer Reparaturvorschlag nach einem tatsächlich ausgeführten fehlgeschlagenen Projektprüflauf. Nur die Administration kann ihn mit dem exakten Testplan anfordern. Unbekannte, nicht verfügbare, abgebrochene oder zeitlich überschrittene Ergebnisse geben keine automatische Reparatur frei. Kein automatischer neuer Testplan, keine Dateianwendung und keine Git-Freigabe.
- Kandidatenbewusste Wiederaufnahme: Anker einer Reparatur beziehen sich auf den zu korrigierenden Kandidaten, die spätere Übernahme weiterhin auf den unveränderten Originalhash. Eine ausdrücklich administrative Wiederaufnahme bindet Kandidaten-ID, Digest, Task, erlaubte Reparaturdateien und unveränderte Basis. Bestehende gute Kandidatenteile bleiben erhalten; alle Pflichtprüfungen werden für das neue Gesamtpaket erneut verlangt. Nutzung und Limits werden nicht zurückgesetzt.

## Nachgewiesene Ursachen und Grenzen

Der erste breite Auftrag vermischte Anker aus `handlers.mjs` mit `pricing.mjs` und erfand Testzeilen. Fünf Modellaufrufreservierungen, drei abgelehnte Parameterfehler, 174,504 Sekunden angerechnete Laufzeit; anschließend korrekt ohne Dateianwendung gestoppt. Die Fehlergrenze erlaubte höchstens zwei Fehlerwiederholungen; der nächste Fehler beendet den Lauf.

Der zweite Durchlauf verwendete dieselbe unveränderte Ausgangskopie, aber getrennte Dateiziele. Preisberechnung und ergänzende Assertion gelangen. Die Objektprüfung war fachlich falsch: `Object.prototype.toString.call(body)` wurde mit dem falschen String verglichen. Der unveränderte HTTP-Vertrag wies dies nach.

Die erste automatische Reparatur zeigte zusätzlich einen Softwarefehler im Reparaturkontext: Anker für den vorherigen Kandidaten wurden gegen die Originaldatei geprüft. Das ist mit kandidatenbewusster Wiederaufnahme korrigiert und mit einem positiven Controller-Test abgesichert (Original `answer=1`, erster Kandidat `answer=2`, Reparaturanker `answer=2`, neuer Kandidat `answer=3`, Original weiterhin unverändert).

Ein Modellaufruf wurde vom selbst gesetzten Tageskontingent des temporären Testclients abgelehnt. Das Kontingent wurde administrativ und ausschließlich für diesen Testclient von 20.000 auf 30.000 Tokens begrenzt angepasst und am Ende auf 20.000 zurückgesetzt; anschließend beide neuen Testclients widerrufen. Verbrauch und Taskzähler wurden nicht zurückgesetzt. Es gab keine kostenpflichtigen Tokens oder Änderung von Limits anderer Anwendungen.

Eine letzte administrative Fortsetzung behielt die bestandene Preisberechnung und Unit-Ergänzung und forderte nur eine Korrektur von `handlers.mjs` an. Auch mit konkreten JavaScript-Prädikaten im Dateiziel behielt das Modell die falsche Objektprüfung und ergänzte unzureichende Bedingungen. **Die fachliche Modellgrenze ist damit nicht behoben.** Kein weiterer Versuch nach Erreichen des Aufrufbudgets.

Native Stillstände/unvollständige Ausgaben aus früheren Sitzungen sind nicht abschließend kausal erklärt. Die neue Phasentrennung verbessert Diagnose und begrenzt Hänger; sie ist kein Nachweis, dass der native Backendfehler verschwunden wäre.

## Reales Projekt und Testergebnisse

Neue harmlose Quote-API mit sieben Dateien: `pricing.mjs`, `handlers.mjs`, `server.mjs`, `unit.mjs`, `integration.mjs`, `package.json`, `README.md`. POST `/quote`, JSON-Größenbegrenzung, positive ganzzahlige Menge, endlicher nichtnegativer Einzelpreis, Geschäftslogik, 400-/404-Fehlerfälle und dokumentierte Schnittstelle. HTTP-Tests liefen ausschließlich auf Container-Loopback, kein Host-Projektcode.

Workspace **f525925e-8385-469f-be45-5f513020754b**, Kopie `scratch/core/workspaces/managed-50efbb8d-c4f9-400a-90be-a38e02b4ba6d`. Geführter Auftrag **f0b389a5-a434-47b4-a8ac-2a777175c5d0**.

Zwei tatsächliche Kandidaten-Prüfrunden im Rootless-Container: jeweils Build **passed**, Syntax **passed**, Unit **passed**, HTTP-Integration **failed**. Letzte Laufzeiten: Build 2,464 s, Syntax 1,467 s, Unit 1,603 s, Integration 1,738 s. Die vom Modell ergänzte Bruchpreis-Assertion wurde tatsächlich ausgeführt; die ursprünglichen Assertions und geschützten HTTP-Testdefinitionen wurden nicht abgeschwächt.

Geführter Auftrag: **230,704 Sekunden aktive angerechnete Laufzeit**, **acht reservierte Modellaufrufe**; davon ein Aufruf vor nativer Ausführung wegen Tageskontingent abgelehnt. Sieben native strukturierte Antworten abgeschlossen, ein automatischer semantischer Reparaturvorschlag und eine ausdrücklich administrative, gezielt eingegrenzte Kandidatenfortsetzung. Weitere Wiederholungen nach Parameterfehlern wurden über dasselbe Fehlerbudget gezählt. Ursprüngliche Grenzen: 480 Sekunden gesamt, 120 Sekunden je Durchlauf, acht Modellaufrufe, 30 Gesamtschritte und zwei Fehlerwiederholungen; keine dieser Taskgrenzen erhöht. Wallclock vom Taskstart bis zur letzten Prüfung etwa 11 Minuten einschließlich Entwicklungs-/Administrationspausen, kein durchgehend rechenaktiver Lauf.

Preis-/Validierungs-/Unit-Entwürfe wurden real von lokalem Qwen erzeugt. Keine Codex-Handkorrektur an den fachlichen Projektdateien und keine nachträgliche Testanpassung. Die fehlerhaften Kandidaten blieben private Vorschläge.

Übernahme- und Commit-Vorbereitung lieferten real HTTP 409. Der letzte Kandidat wurde verworfen. Alle sieben Arbeitskopie- und Referenzdateien bytegenau/SHA-256 unverändert gegen die ursprüngliche Fixture geprüft. **Kein Test-Git-Commit; tatsächlicher Paket-Restore nicht ausgeführt**, weil keine Dateianwendung freigegeben werden konnte. Git-/Restore-Regressionen mit Test-Executor bestehen weiterhin, ersetzen aber keine reale erfolgreiche Quote-API-Abnahme.

## Runner- und Zugriffsprüfung

Neue echte Achtgruppen-Linux-Abnahme in dieser Sitzung bestanden. Bericht `scratch/session29-actual-acceptance.json`, SHA-256 `2ead08865cf2371118d56e66fafaceb981229af195350f7298fb1a0f986616b3`. Tatsächliche Containerbeobachtungen, CPU-Drosselung, 512-MiB-/1-CPU-/32-Prozess-Grenzen, Netzwerk aus, Input/Root nur lesbar, Non-root, Seccomp/Capabilities, Core-Limit null; reale Timeout-/Abbruch-/Ausgabe-/Speicher-/Prozessgrenzen sowie Build/Unit/Integration und absichtlicher Testfehler mit korrigierter Gegenprobe. Dieses kleine Runner-Abnahmeprojekt ist getrennt vom fehlgeschlagenen komplexeren Quote-Projekt.

mTLS-Transport und Offline-/Live-Abnahmehash verifiziert; fehlendes Clientzertifikat und falscher Serverpin real abgelehnt. Zertifikate/Schlüssel unverändert und nicht veröffentlicht. Getrennte neue Clientidentitäten, ein paralleler Auftrag pro Client und endliches Tageskontingent. Fremder Testclient erhielt beim Zugriff auf den Auftrag HTTP 404. Referenz-Workspace read-only; keine anderen AMU-Projekte registriert oder automatisch angebunden.

Zum Abschluss Dienst **inactive**, eigene Container **0**, Core-Pattern `core`, Docker-/Socket-/containerd-Systemdienste weiterhin **masked**. Genau die eigene begrenzte S29-Testsitzung beendet. Zentrale Ausführungsfreigabe und beide Testclients widerrufen. Keine dauerhafte Aktivierung, neue Windows-Einstellung, Firewalländerung, Installation oder Betriebssystemneustart. Die harte Dienst-Crash-Recovery wurde in dieser Sitzung nicht erneut ausgelöst; der reale Nachweis aus Sitzung 28 bleibt erhalten. Unbekannte Ausführungsergebnisse gelten weiter nicht als Erfolg und werden nicht automatisch wiederholt.

## Automatisierte Prüfungen und Bestandsschutz

Bestanden: neue Sitzung-29-Schema-/Anker-/Policy-/Watchdogtests; Controller-Fixtures für genau eine automatische JSON-Wiederholung, erhaltene Dateientwürfe ohne Neugenerierung, administrativ gebundene Kandidatenreparatur gegen Kandidateninhalt statt Original, Digest-/Zugriffsverweigerung und unveränderte Originale. Zusätzlich Sitzung-16-Workflow-, Sitzung-28-Management- und Sitzung-15-Dashboardregression, TypeScript --noEmit und Admin-JavaScript-Parsing. Diese Management-/Executor-Fixtures führen keinen unbekannten Projektcode auf dem Host aus und sind nicht als reale Linux-Modelltests gezählt.

API **1.27.0 ready**, Authentifizierung 401/200 und tatsächliches lokales Qwen-SSE bis [DONE] nach Abschluss bestanden. AMU WEB: fünf Quellhashes, exakt zwei Hauptkarten, drei Websites/Seiten/Versionen, zwei Mailkonten/sechs Nachrichten unverändert; SQLite quick_check=ok, HTTP bereit, MySQL-Port erreichbar. Kein interaktiver Mailversand-/Login- oder neuer vollständiger Datenbank-Restore-Test. AMU SYSTEM, HDD, andere Projekte, Modelle und vorhandene Backups nicht verändert.

Ressourcenmomentaufnahme: C: **17,11 GiB frei**, RAM **14,27 GiB frei** von 23,91 GiB; CPU-Gesamtauslastung **18,7 %** über zwei Sekunden. Linux unverändert 2 CPUs/4 GiB/1 GiB Swap. Verschlüsselter Source-/Konfigurationssnapshot vor Änderungen `75cb14e5-fed1-4ed6-9cb7-b644432bb0c9`, authentifiziert extrahiert. Neue Linux-Recoverydaten zusätzlich privat gesichert; finale verschlüsselte Sicherung separat im Abschluss dokumentiert, kein vollständiger VHD-/DB-Restore behauptet.

## Modelle und Prioritäten 30

Vorhanden ist weiterhin **Qwen2.5-1.5B**, kein tatsächlich abgenommenes kleines Coder-Modell. Keine Modellinstallation, kein Ollama und kein kostenpflichtiger Dienst. Vorhandene Profile/RAM-/KV-Guards und getrennte Rollen aus Sitzung 28 bleiben erhalten; große Qwen-Modelle sind weder installiert noch nativ qualifiziert. Hardware-/KV-Analyse: [Sitzung 28](session28-model-hardware.md). Die sieben strukturierten Antworten des geführten Auftrags brauchten etwa 15–53 Sekunden pro Antwort; die Messwerte belegen keine ausreichende fachliche Coding-Qualität.

Priorität 30: Ein geeignetes kleines tatsächliches Coder-Modell nach Quellen-, Speicher- und RAM-Prüfung separat freigeben und gegen denselben unveränderten HTTP-Vertrag qualifizieren. Keine weiteren offenen Promptschleifen mit dem aktuellen Modell als Ersatz für diese Qualifikation. Kandidaten-/Dateiziel-Workflow mit zusätzlicher nativer Modellqualität prüfen; erst nach erfolgreicher vollständiger Aufgabe konkreten Eigentümer-Diff, Test-Git-Commit und realen Restore abnehmen. Native Finalisierungs-/Ausgabestillstände weiter anhand der neuen Phasen untersuchen. Dauerhafter WSL-/Runner-Betrieb bleibt separat freigabe- und abnahmepflichtig.
