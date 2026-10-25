# Sitzung 10 – Coding-Runtime und kontrollierte Entwicklungsbereiche

Stand: 25.10.2026, Version **1.8.0**. Grundlage: `632f833` / Version 1.7.0, sauberer Arbeitsbaum vor Beginn. Ausschließlich AMU-Agent-2 weiterentwickelt. Kein neues Projekt, kein Produktiv-Deployment, keine Änderung an Agent-3 oder anderen AMU-Anwendungen.

## Tatsächlich implementiert

Die vorhandene eingebettete llama.cpp-Engine bleibt die einzige lokale Engine. Ihre vorhandenen Schnittstellen, Worker-Verwaltung, Warteschlangen, Ressourcenpolitik und Wiederherstellung werden weiterverwendet.

### Coding-Modellprofile

`src/inference/profiles.ts` beschreibt Modellname, Profilversion, Repository, Format, Architektur, Tokenizer, Chat-Template, Kontextgrenzen und Fähigkeiten. Installierte Dateien liefern zusätzlich Pfad, Größe und SHA-256 als eindeutigen Gewichtsstand. Vorhandene Registrierungen ohne Profilfeld verwenden rückwärtskompatibel `local-gguf`.

| Profil | Softwarevorbereitung | Tatsächlicher Gewichtsstand |
|---|---|---|
| Lokales GGUF | vorhandene automatische Wrapper-Auflösung, eingebetteter Tokenizer | Qwen2.5-1.5B installiert und laufend |
| Qwen3-Coder-30B-A3B-Instruct | erwartete GGUF-Architektur `qwen3moe`, Dimensionen, Kontext und expliziter eingebetteter Jinja-Wrapper | nicht installiert, keine native 30B-Abnahme |
| Qwen2.5-Coder-32B-Instruct | erwartete GGUF-Architektur `qwen2`, Dimensionen, Kontext und vorhandene Wrapper-Auflösung | nicht installiert, keine native 32B-Abnahme |

Eine kleine Datei kann nicht allein durch Umbenennung als großes Coder-Profil registriert werden: Architektur, Schichten und Einbettungsdimensionen müssen passen. Die offiziellen Konfigurationen wurden gegen [Qwen3-Coder config.json](https://huggingface.co/Qwen/Qwen3-Coder-30B-A3B-Instruct/raw/main/config.json) und [Qwen2.5-Coder config.json](https://huggingface.co/Qwen/Qwen2.5-Coder-32B-Instruct/raw/main/config.json) geprüft. Die Herkunft konkreter Gewichte muss der Administrator zusätzlich prüfen; ein selbst angegebener SHA-256 allein beweist keine Herausgebersignatur.

Für Qwen3-Coder wurde ausschließlich die kleine offizielle [Tokenizer-Metadatendatei](https://huggingface.co/Qwen/Qwen3-Coder-30B-A3B-Instruct/blob/main/tokenizer_config.json) geladen. Das darin enthaltene Chat-Template rendert mit der installierten Bibliothek eine Systemnachricht und mehrere Gesprächsrunden korrekt. Die Profilbindung lautet SHA-256 `5a38bfa05833266240066aedc497decc9b00cc0d3e3b8cceea98cf530196ab06`. Abweichende GGUF-Templates werden abgewiesen, bis eine neue Revision gezielt geprüft wird. Die Testfixture enthält Quellenvermerk und Apache-2.0-Lizenz. Das ist eine Template-Prüfung ohne große Gewichte, keine Abnahme der 30B-Inferenz oder ihres nativen Toolparsers.

Vorhandene GGUF-Dateien können über die Administration registriert werden. Erforderlich sind Modell-ID, einfacher Dateiname im Modellverzeichnis, erwarteter SHA-256 und Profil. Prüfung von Dateigrenzen, Links, Hash, GGUF-Metadaten und unverändertem Dateistand erfolgt vor dem ergänzenden atomaren Registry-Eintrag. Existierende IDs/Dateien werden nicht überschrieben. Registrierung startet keinen Prozess und lädt nichts herunter. Geteilte Mehrdatei-GGUFs sind noch kein eigener Importworkflow.

### Ressourcen und Laufzeit

Die Verwaltung zeigt CPU, RAM und GPU-Inventar. NVIDIA-VRAM wird, sofern das vorhandene lokale `nvidia-smi` verfügbar ist, tatsächlich abgefragt. Windows-Treiberangaben ohne diesen Nachweis werden als unbestätigt gekennzeichnet. Aktuell erkannt: Xeon E3-1230 V2, acht logische CPUs, etwa 24 GiB RAM, GeForce 605 mit 1 GiB VRAM. Die Engine läuft weiterhin mit **CPU**, vier Threads und Kontext 4096. GPU-Offloading ist nicht aktiviert.

Die konservative RAM-Prüfung berücksichtigt Gewichte, Reserve und KV-Cache. Für Modelle mit expliziter Key-/Value-Head-Dimension wird diese berücksichtigt; insbesondere darf bei MoE nicht nur Einbettungsgröße geteilt durch Head-Anzahl verwendet werden. Große Profile zeigen bereits ohne installierte Gewichte eine vorsichtige Mindestschätzung und das aktuell verfügbare Budget. Die genaue Startprüfung verwendet die konkrete Datei und den konfigurierten Kontext. Gegenwärtig fehlt ausreichend freier RAM für die großen Profile. Die Profil-Kontextobergrenze erhöht nicht automatisch das globale Ressourcenlimit.

Modellstart/-stopp/-wechsel bleiben über die vorhandenen Administrationsfunktionen steuerbar. Ein neuer Profilknopf wählt ausschließlich registrierte lokale Modelle. Das bestehende CPU-/RAM-Budget und die ausdrückliche Freigabe für doppelte Modellprozesse bleiben erhalten. Startup-Fehler werden über IPC an den Supervisor-/Workerpfad gemeldet. Vorhandene begrenzte Wiederherstellung ersetzt keine fehlgeschlagene Anfrage durch einen automatischen Replay.

### Strukturierte Ausgabe und Werkzeugprotokoll

`/v1/chat/completions` unterstützt zusätzlich `response_format` mit `json_object` und einem benannten `json_schema`. Die eingebettete Grammatik erzwingt die Struktur; eine vollständige Antwort wird außerdem geparst und gegen den unterstützten Schemaumfang geprüft. Abgebrochene/unvollständige strukturierte Ergebnisse werden nicht als ausführbare Werkzeugentscheidung angenommen. Schema und zusätzliche Anleitung werden im Kontext und bei Tokenreservierungen berücksichtigt.

Beispiel des neuen Formats, zusätzlich zu Modell, Nachrichten und Ausgabelimit:

```json
{"response_format":{"type":"json_schema","json_schema":{"name":"analysis","strict":true,"schema":{"type":"object","properties":{"summary":{"type":"string"}},"required":["summary"],"additionalProperties":false}}}}
```

Unterstützt ist ein begrenzter Schemaumfang: primitive Typen, Objekte, Arrays, Eigenschaften, Pflichtfelder, Enum, boolesches `additionalProperties` sowie begrenzte Längen. Keine Referenzen, regulären Ausdrücke oder rekursiven Schemata. Maximal 16 KiB, Tiefe sechs und 128 Knoten. Das ist kein vollständiger JSON-Schema-Validator. Strukturierte Streaming-Ausgaben müssen vollständig gesammelt und auf Fehler/Abschluss geprüft werden; Teilstücke werden niemals ausgeführt.

Native OpenAI-`tools`/`tool_choice`/`functions` bleiben ausdrücklich nicht freigegeben. Stattdessen ist das **AMU-Werkzeugprotokoll v1** implementiert:

```json
{"version":1,"name":"read_file","arguments":{"path":"src/datei.mjs"}}
```

Der Aufruf erfolgt an `/api/core/workspaces/<id>/tools`. Erfolgreiche Antworten enthalten Version, Anfragenkennung, Ergebnis und Dauer; Fehler nutzen die bestehende HTTP-Fehlerantwort. Fähigkeiten und Berechtigungen bleiben AMU-eigene Software. Die [Runtime-Dokumentation zu Wrappern](https://node-llama-cpp.withcat.ai/guide/chat-wrapper) und [Grammatiken](https://node-llama-cpp.withcat.ai/guide/grammar) wurde ergänzend geprüft.

### Workspace-Manager und Werkzeuge

Administratoren registrieren bestehende Verzeichnisse innerhalb der bereits kontrollierten AMU-Agent-2-Bereiche. Es gibt keine Freigabe beliebiger fremder Projektverzeichnisse. Wurzel, Eigentümer, einzelne Client-IDs, Aktivierung und Werkzeugliste werden dauerhaft gespeichert. Wurzeln dürfen sich nicht überlappen. Administratoren können Zugriffe und einzelne Werkzeuge freigeben oder sperren.

| Werkzeug | Funktion und Grenze |
|---|---|
| `list_files` | höchstens 1000 Dateien, 300 Verzeichnisse, Tiefe acht |
| `read_file` | vorhandene kontrollierte Datei bis 128 KiB |
| `search_code` | wörtliche Suche, höchstens 200 Dateien / ungefähr 2 MiB / 100 Treffer |
| `prepare_patch` | vollständigen Ersatz oder neue Datei als Vorschlag speichern; exakter Ausgangshash erforderlich |
| `show_diff` | Änderung als vollständigen Unified Diff darstellen |
| `apply_patch` | nur Administrator; Freigabe des angezeigten Inhaltshashes, Ausgangshashprüfung und Sicherung vor dem Schreiben |
| `run_test` | ausschließlich festes `javascript-syntax`-Profil mit `node --check`, zehn Sekunden, begrenzte Ausgabe; führt Quellcode nicht aus |
| `git_status` | begrenzter, schreibfreier Status für den freigegebenen Bereich |

Standardmäßig sind Lese-/Such-/Diff-/Git-Funktionen freigegeben. Vorschläge, Schreiben und Syntaxprüfungen benötigen zusätzliche Werkzeugfreigaben. Es gibt keine frei eingebbaren Shell-, npm- oder Testbefehle. Vollständige ausführbare Projekttests erfordern noch einen geeigneten isolierten Ausführungsbereich und sind nicht durch einen bloßen Prozess-Zeitstempel sicher gemacht.

Traversal, absolute Dateipfade, versteckte/protegierte Bereiche und Links werden abgewehrt. Ein tatsächlicher Windows-Junction-Ausbruch wurde im Test abgewiesen. Registrierte Projektdateien können von Entwicklungsclients auch nicht über den alten dateibezogenen Aufgabenpfad ohne Workspace-Freigabe erreicht werden. Die bisherige Administrationssteuerung bleibt bestehen. Werkzeugausführungen erhalten begrenzte Metadatenprotokolle ohne Dateiinhalt, Suchinhalt oder Schlüssel.

### Coding-Aufgaben und Oberfläche

Bestehende AMU-Core-Aufgaben können optional an einen registrierten Workspace gebunden werden. Die begrenzte Schleife beherrscht Lesen, Analyse, Dateiliste, Suche, Syntaxprüfung, Git-Status, Änderungsvorschlag und Abschluss. Werkzeugzugriffe werden während der Ausführung erneut gegen die Freigaben geprüft. Schrittverlauf und Checkpoints bleiben gespeichert.

Neu sind echtes Pausieren über Abbruchsignal und ausdrückliches Ablehnen eines Vorschlags. Pause führt zu einem fortsetzbaren Checkpoint. Ablehnen ändert keine Quelldatei und setzt die Aufgabe auf pausiert. Fortsetzen bleibt ausdrücklich, mit Quellhashprüfung und ohne Wiederholung bereits angewendeter Änderungen. Gesamtausführung: ein Coding-Auftrag zugleich, 1–12 Schritte je ursprünglichem Durchlauf, insgesamt höchstens 20 über Fortsetzungen; 5–120 Sekunden, zusätzlich durch das globale Zeitlimit begrenzt; 64–2048 Ausgabetokens je Schritt, zusätzlich durch den Client begrenzt. Der Standard beträgt 512 Tokens.

Die neue Oberfläche zeigt Modellprofile, Hardware und fehlende Ressourcen, registriert lokale Gewichte, verwaltet Workspace-/Client-/Werkzeugfreigaben und bietet die Werkzeuge mit festen Feldern an. Vorschläge aus manuellen Werkzeugen und dem Agenten erscheinen in derselben Review-/Aufgabenverwaltung. Ausstehende Vorschläge zeigen einen Unified Diff. Modellkontrolle, API-Schlüsselverwaltung und Eigentümeranmeldung bleiben erhalten.

## Tatsächliche Prüfung

- TypeScript-Build erfolgreich.
- Sitzung-10-Tests: Profil-/Schema-/Hardwaregrenzen, Rechte, Workspace-Isolation einschließlich Junction, feste Syntaxprüfung ohne Quellcodeausführung, Diff/Freigabe/Sicherung, Werkzeugentzug, Aufgabenpause/-fortsetzung und tatsächliche Dashboard-Handler.
- Offizielles Qwen3-Coder-Template mit installierter Jinja-Bibliothek gerendert; keine Gewichte geladen.
- Sitzung-9-Zugangs- und Schlüsseltests bestehen weiterhin.
- Bestehende Core-Regressionsprüfung sowie native RAM-/Start-/Stopp-/Abbruchtests bestehen.
- Echte Mehrworker-Prüfung: zwei native Prozesse, Ablehnung unzulässiger Doppelstarts/Ressourcen, tatsächlicher Absturz eines beschäftigten Workers und Wiederherstellung ohne Replay; unabhängiger Worker bleibt erhalten.
- **Laufende API mit Qwen2.5-1.5B:** echte schemaerzwungene JSON-Antwort und ein kleiner nativer Reparaturablauf erfolgreich. Das Modell schlug die Korrektur einer Additionsfunktion vor; vor Freigabe unveränderte Quelle; danach kontrolliertes Anwenden, vorhandene Sicherung und bestandene Syntaxprüfung. Der ausschließlich dafür angelegte Prüf-Workspace wurde anschließend gesperrt.
- Echter Browser: Version 1.8.0, bestehende Administratorsitzung, Modellprofile und echte Hardwaredaten sichtbar. Keine produktiven Schlüssel neu vergeben.

Das ist eine gezielte Funktionsabnahme eines kleinen Ablaufs. **Die vollständige Plattform-QC, Sicherheits-Gesamtprüfung und Lastabnahme sind nicht abgeschlossen.** Insbesondere wurde kein großes Coder-Modell getestet und kein echter zweiter LAN-Rechner angebunden.

## Bestandsschutz und Fortsetzung

Vor Änderungen: verschlüsselte Sicherung `dd00ca9c-92ab-49fa-9f6b-50bf05932e9c`, 257 Dateien, ohne erneute Kopie unveränderter Modellgewichte. Bestehende Datenbanken, Schlüssel und Modelle bleiben erhalten. Abschlusssicherung und Nachweise werden in `docs/verification/2026-10-25-session10.json` festgehalten.

Für Sitzung 11:

1. Isolierten Test-Runner für tatsächliche Projekt-/Unit-Tests mit festen Profilen, Dateisystem-/Netzwerkbegrenzung und Prozessbaumabbruch ergänzen. Die aktuelle Syntaxprüfung ist kein Ersatz dafür.
2. Kontextplanung und mehrteilige Änderungen über das bisherige Limit von vier Dateien / 7000 Zeichen im Aufgabenstart hinaus entwickeln; Quellhash- und Freigabegrenzen erhalten. Aktuelle Vorschläge ersetzen jeweils eine vollständige Datei.
3. Nach Hardwareprüfung konkrete große GGUF-Artefakte mit Herkunft, Revision, Lizenz und vollständigen Hashes auswählen und lokal bereitstellen. Erst dann große native Inferenz, Speicher-/Qualitätsverhalten und gegebenenfalls GPU-Offloading abnehmen.
4. Falls benötigt, den nativen Qwen3-Coder-Toolparser und OpenAI-`tool_calls` getrennt implementieren und gegen echte Modellantworten prüfen. Bis dahin das bestehende AMU-Protokoll verwenden.
5. TLS-/CIDR-Konfiguration und tatsächlichen Zwei-Rechner-Test mit Agent-3 abschließen. Keine fremden Projekte dafür ungeprüft ändern.
6. Nach Fertigstellung der Kernfunktionen die vom Eigentümer verlangte umfassende QC durchführen; die kleinen erfolgreichen Beispiele belegen keine allgemeine autonome Entwicklungsqualität.

Der lokale Server soll mit einem bereiten CPU-Worker und dem vorhandenen kleinen Modell weiterlaufen.

Gezielte Tests erneut ausführen: `npm run test:session10`. Die optionale echte Kleinmodell-Abnahme ist mit `node scripts/verify-small-coding.mjs` nachvollziehbar. Sie setzt die lokal laufende API und das bereits ausgewählte Qwen2.5-1.5B-Modell voraus, verwendet ausschließlich einen neuen Prüfbereich in diesem Projekt und sperrt dessen Zugriff anschließend. Sie wird nicht automatisch bei jedem Testlauf ausgeführt.

Zusätzliche Ausführungsgrenzen: höchstens zwei Werkzeug-Unterprozesse gleichzeitig, höchstens einer pro Auftragseigentümer; parallele zusätzliche Aufrufe erhalten HTTP 429. Gewichtsregistrierungen werden einzeln validiert, um parallele große Hash-/Metadatenläufe zu verhindern. Quellfreigaben werden vor dem Lesen und erneut vor den Werkzeugschritten geprüft.

Abschlusssicherung: `5db1c8ac-f494-4cf8-9ee1-f8f0fe0f88dd`, 303 Dateien, verschlüsselt, ohne erneute Modellkopie. Authentifizierte Prüfung und SQLite-Integrität erfolgreich; SHA-256 `1994f3bda15db751ffe14b692f6aebcfa01d5e56dd9af28718c634caf0bd06dc`. Ein erster Versuch hatte korrekt die von dieser Sitzung angelegten Junction-Testlinks abgewiesen. Ausschließlich diese fünf Links wurden entfernt; ihre Zielverzeichnisse und die strenge Archivprüfung blieben erhalten. Der Test räumt seine Junction künftig selbst auf. Nachträglich ergänzte Sicherungsreferenzen und Abschlussmetadaten werden zusätzlich mit Git gesichert.
