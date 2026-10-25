# Sitzung 12 · Mehrstufiger Coding-Agent · 1.10.0

Ausgangsstand: `58e7c50`, Version 1.9.0, Git sauber. Ausschließlich AMU-Agent-2 wurde bearbeitet. Keine anderen AMU-Projekte geöffnet oder verändert, keine Installationen, Downloads, externen KI-Dienste oder Änderungen an Gewichten/Schlüsseln. Die bestehende Aufgabensteuerung wurde erweitert; keine zweite Plattform wurde angelegt.

## Tatsächlich implementierter Agent

Der vorhandene `/api/core/tasks`-Ablauf unterstützt zusätzlich `mode:"agent"` mit obligatorischem Workspace und bis zu acht ausdrücklich benannten Dateien. Neue Dateien können als noch fehlende Zielpfade benannt werden. Bestehende dateibezogene Core-Aufträge bleiben kompatibel.

Phasen: Modellplan → kontrollierte Dateiarbeit → gemeinsames Änderungspaket → Administratorfreigabe → ausdrückliche Fortsetzung zur sicheren Nachprüfung → Modellbericht mit getrennt ausgewiesenem tatsächlichem Prüfergebnis.

- **Geführter Änderungsablauf (`guided:true`)**: Das Modell erstellt Plan und Paket. AMU führt die obligatorischen, tatsächlich ausgeführten Lesezugriffe durch und protokolliert ausdrücklich, dass diese Schritte vom Controller stammen. Die Paket-Grammatik begrenzt Dateinamen bereits auf die deklarierten Ziele. Die anschließende Prüfung erfolgt ebenfalls durch AMU. Dieser Ablauf wurde mit dem kleinen Modell tatsächlich abgenommen.
- **Freie strukturierte Werkzeugwahl (`guided:false`)**: Das Modell darf innerhalb derselben Grenzen Lesen, Auflisten, Suchen, Git-Status, Syntaxprüfung, Paketvorbereitung und Abschluss anfordern. Die Software wurde gezielt mit vorgegebenen Modellentscheidungen geprüft. Eine zuverlässige freie Werkzeugwahl mit Qwen2.5-1.5B konnte nicht nachgewiesen werden; fehlerhafte Ausgaben wurden begrenzt gestoppt. Für reine Analyseaufträge den geführten Änderungsmodus ausschalten; dieser erwartet ein Änderungspaket.
- Einheitliches Register mit Namen, Parametern und Workspace-Berechtigungen. Unbekannte Werkzeuge, zusätzliche/falsche Parameter und überschrittene Dateibereiche werden abgelehnt. Schreibende Modellwerkzeuge erzeugen ausschließlich Vorschläge, niemals eine Freigabe.
- Zwei streng geprüfte JSON-Formate: verschachteltes `amu-json-v1` und flaches `amu-flat-v1`. Unbenutzte Felder des flachen Formats müssen ausdrücklich leer sein. Die aktuelle Voreinstellung ist `amu-flat-v1`.
- Native OpenAI-artige Funktionsaufrufe können intern normalisiert werden, sind jedoch ohne tatsächliche Runtime-Unterstützung gesperrt. Der aktive Worker meldet **keine nativen Tool-Calls**. Die echte Abnahme verwendet JSON-Grammatik, nicht native Tool-Calls.
- Dauerhafte Pläne, Werkzeugergebnisse, begrenzte letzte Modellausgabe, Paketreferenzen, Prüfberichte, Quellenhashes, Checkpoints und Ressourcenverbrauch. Werkzeugergebnisse werden dem Modell als nicht vertrauenswürdige Beobachtungen zurückgegeben.
- Begrenzung je Durchlauf über `maxSteps` (1–12), `timeoutSeconds` (5–120) und `maxOutputTokens` (64–2048, zusätzlich Client-Limit). Dauerhafte `agentLimits`: höchstens 2–24 Modellanfragen, 0–3 Fehlerversuche, 1–3 gleiche Werkzeugaufrufe je Dateistand, 4–30 Gesamtschritte, 10–600 Sekunden gesamte aktive Laufzeit. Standard: 12 / 2 / 2 / 20 / 300 Sekunden. Gesamtlaufzeit unterbricht auch eine noch laufende Modellanfrage über AbortSignal. Verbrauch wird vor Modellanfragen reserviert; ein abgebrochener Lauf setzt die Gesamtbudgets nicht zurück.
- Pausieren, Abbrechen und ausdrückliches Fortsetzen nutzen die bestehende Steuerung. Ein Korrekturversuch (`repair:true`) verbraucht das gemeinsame Fehlerbudget; es gibt keine automatische Endlosschleife. Zwischenzeitliche Quellenänderungen benötigen bestehende Administratorfreigabe zur erneuten Analyse.

## Freigabe, Konflikte und Wiederanlauf

Die Mehrdatei-Pakete aus 1.9.0 werden unverändert als Schreibmechanismus verwendet, ergänzt um interne, hashgebundene Aufgabenverweise. Clients können solche Verweise nicht selbst erzeugen. Vor Freigabe werden auch die übrigen deklarierten Auftragsdateien gegen ihren Checkpoint geprüft. Nur das aktuelle Paket eines auf Freigabe wartenden Auftrags kann angewendet werden. Während einer laufenden Prüfung ist eine parallele Paketänderung gesperrt.

Freigabe, Ablehnung und gezielte Rücknahme aktualisieren den verknüpften Auftrag. Nach Anwendung wartet er auf Fortsetzung zur Prüfung; die Schaltfläche „Paket freigeben und sichere Nachprüfung starten“ verbindet diese beiden ausdrücklich gewählten Schritte. Der gespeicherte Paketstatus verhindert doppelte Anwendung. Nach einem Prozessabbruch zwischen Dateiübernahme und Aufgabenaktualisierung werden Status und Hashes abgeglichen; der Schreibvorgang wird nicht wiederholt. Es bleibt bei atomarer Ersetzung **je Datei**, nicht einer atomaren Mehrdatei-Dateisystemtransaktion.

Alte Pakete ohne Aufgabenverweis und alte Einzeldateivorschläge bleiben nutzbar. Gezielte Rücknahme schützt weiterhin fremde Änderungen; keine pauschalen Git-Resets, Pushes, Merges oder Deployments.

## Runner und Sicherheitsgrenze

Docker/Podman und Windows-Sandbox wurden erneut nicht gefunden. **Es ist weiterhin kein geprüfter OS-isolierter Entwicklungsrunner installiert.** Projektcode wird nicht mit den Rechten des API-Servers ausgeführt.

- `javascript-syntax`: tatsächlicher begrenzter Node-Unterprozess mit `--check`, ohne Ausführung des Quellcodes; bestehende Zeit-, Ausgabe-, V8-Heap- und Parallelitätsgrenzen bleiben erhalten.
- Andere unterstützte Quelltypen werden mit dem vorhandenen statischen Parser geprüft; dies sind Syntaxprüfungen, keine Laufzeit-/Unit-Tests.
- Build-, Unit- und Integrationstests bleiben gesperrt. Ein solcher Auftrag erzeugt einen dauerhaften Bericht `unavailable` / `isolation_missing`.
- Der Runner-Vertrag wurde um ausführbare Prüfung fester Argumentprofile, vollständiger Ressourcenlimits und einer Isolationsattestierung ergänzt. Fehlender Adapter, Netzwerkfreigabe, fehlende Rechte-/Credential-/Ressourcen- oder Prozessgruppenabsicherung verhindern die Zulassung. Der vorhandene Runner ruft diese Sperre tatsächlich auf.
- Diese Vertrags-/Policy-Prüfung ist **kein Nachweis einer echten Sandbox**. Ein OS-/VM-/Container-Adapter und seine praktische Isolationsabnahme fehlen. Es gibt keinen Schalter, mit dem ein Administrator unsichere Projektbefehle trotzdem aktivieren kann.

## Git im tatsächlichen Windows-Dienst

Die echte Betriebsprüfung fand eine Lücke zwischen Tests und Dienstbetrieb: Git war im Suchpfad des dauerhaft gestarteten Windows-Dienstes nicht verfügbar. Neu sind eine Administrator-Konfiguration einer vorhandenen absoluten Git-Datei mit SHA-256 sowie `GET/POST /api/core/git-runtime`. Schreib-/Statusaufrufe nutzen die geprüfte Datei; ein veränderter Hash sperrt sie. Die bestehende Oberfläche enthält die Konfiguration. Entwickler und Modellwerkzeuge können sie nicht ändern.

Auf diesem Rechner wurde das bereits vorhandene Git unter `C:/Users/AMU/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/cmd/git.exe` freigegeben, SHA-256 `c53279919fdea03474bb23b465b3a82287157491f1bd69a5eb82dd9831582333`. Keine Installation oder Kopie von Programmen. Für einen dauerhaft von diesem Cache unabhängigen Betrieb muss später eine reguläre lokale Git-Bereitstellung separat freigegeben werden. Die KI-Inferenz hängt davon nicht ab.

## Reale Abnahme mit dem lokalen Modell

Auftrag `f9a3c159-4736-48fc-8741-e70a78ed1119`, Qwen2.5:1.5b, CPU, `guided:true`, `amu-flat-v1`, Ausgabegrenze 1024 Tokens:

1. Kleines Beispielprojekt und davon getrennte echte Git-Arbeitskopie angelegt.
2. Modellplan erstellt; beide tatsächlichen Lesezugriffe protokolliert.
3. Das Modell erzeugte ein gemeinsames Paket für `a.mjs` und `b.mjs`, jeweils Konstante 1 → 2.
4. Zustand `review`, Unified Diffs vorhanden, beide Dateien vor Freigabe nachweislich unverändert.
5. Der autorisierte Testablauf gab das genaue Paket über den Administrator-Endpunkt frei. Dies war eine echte Freigabeaktion im isolierten Beispielprojekt, kein automatisches Schreibwerkzeug des Modells.
6. Auftrag ausdrücklich fortgesetzt; zwei echte `javascript-syntax`-Unterprozesse bestanden, `executesSource:false`.
7. Tatsächlicher Modellbericht erstellt, Zustand `completed`: **3 Modellanfragen, 7 budgetierte Schritte, 0 Fehler, 95.824 Sekunden aktive Gesamtlaufzeit**.
8. Geprüfte Dateien ausdrücklich lokal in der Git-Arbeitskopie committed: `4b93fb327cada2e2b6cd37ac1bbdc9c63c8eb4bd`. Das ist der Beispielprojekt-Commit, nicht der Plattform-Commit. Die Originaldateien sind unverändert.

Das erste freie Format scheiterte an überfüllten Parametern, das zunächst flache freie Format an ungültigen Aufrufen und Zeitlimit; ein früher geführter Lauf erfand einen Dateinamen. Alle wurden ohne Schreibzugriff gestoppt. Daraus entstanden der geführte Ablauf und die auf deklarierte Pfade begrenzte Grammatik. Diese Fehlversuche bleiben nachvollziehbar erhalten. Der erfolgreiche Lauf belegt den konkreten begrenzten Ablauf, keine allgemeine Coding-Qualität des 1.5B-Modells. Plan und freie Modellbewertung können trotz deutscher Bedienung noch englisch ausfallen.

Ein echter Build-Auftrag wurde anschließend mit `unavailable` / `isolation_missing` abgewiesen. Acht eigene vorbereitende Test-Workspaces wurden ohne Löschung geschlossen. Die erfolgreiche Arbeitskopie bleibt zur Einsicht offen und schreibgeschützt. Ergebnisse: `scratch/session12-native-result.json`; Aufgaben-/Paket-/Prüfzustände bleiben lokal erhalten.

## Weitere gezielte Tests und Oberfläche

- `npm run build`: erfolgreich.
- `npm run test:session12`: reale separate HTTP-API, eigene Zustände, vorgegebene Modellentscheidungen für Softwaretests. Geprüft: Plan, zwei Dateien, Admin-Sperre, Quell-/Paket-/Eigentümerbindung, Ablehnung ungültiger Aufrufe, Wiederholungs-/Modellanfragen-/Fehler-/Zeitbudgets, Pause, Abbruch, Berechtigungsentzug, geführte echte Lesezugriffe, Hinzufügen/Löschen, tatsächliche Syntax-Unterprozesse und Rücknahme.
- Ein gespeicherter Abbruch zwischen Schreiben und Aufgabenaktualisierung wurde injiziert und tatsächlich ohne Replay wiederhergestellt. Der kurze Deadline-Test verkürzt ausschließlich die Fixture-Frist; kein Stromausfalltest und keine Sandbox-Abnahme.
- Dashboard-JavaScript-Handler gegen echte separate API im DOM-Testmodell: Auftrag mit Workspace-relativen Pfaden, Plan, Diff, Freigabe mit Nachprüfung, Bericht, Rücknahme und Werkzeugregister. Bestehende Workspace-/Git-/Paketfunktionen mitgeprüft. Zusätzlich echte bestehende Browseroberfläche visuell kontrolliert.
- Gezielte Regression: `session10-agent.test.mjs` und `session11-development.test.mjs` erfolgreich. Keine breite Gesamt-QC wiederholt.

Die Oberfläche ergänzt Moduswahl, geführten Ablauf, Budgets, Plan, Einzelschritte, Diffs, Freigabe/Ablehnung/Rücknahme und begrenzten Korrekturversuch. Im Agentenmodus sind Dateipfade relativ zum gewählten Workspace möglich. Bestehende Eigentümeranmeldung und Schlüsselverwaltung wurden erhalten. Periodische Statusabfragen wurden von drei auf fünf Sekunden reduziert, damit mehrere Verwaltungsansichten die Client-Rate seltener ausschöpfen.

## Betrieb, Sicherung und Sitzung 13

Server `127.0.0.1:3030`, Version 1.10.0, `/ready` bereit, eingebettetes `llama.cpp`, ein CPU-Worker mit Qwen2.5:1.5b. Keine Ollama-Abhängigkeit. Große Qwen-Coder-Profile bleiben vorbereitet; keine 30B-/32B-Gewichte installiert oder abgenommen. LAN/TLS-Zweirechnerbetrieb bleibt ungetestet.

Vorherige geprüfte verschlüsselte Sicherung ohne erneute Modellkopie: `ded03563-b2d5-4772-8c93-3c3936f482ca`, SHA-256 `c29f5559dbaa22465068102293509153597604ed30a6588b9992f6215ac30eb3`. Abschlussbackup und Prüfung werden unter `scratch/session12-backup-after.json` / `scratch/session12-verify-after.json` dokumentiert. Private Zustände und Schlüssel bleiben außerhalb von Git. Neue Archive verlangen mindestens Version 1.10.0, damit ältere Programmstände die neuen Agentenzustände nicht irrtümlich als kompatibel übernehmen. Alte Archive bleiben vorwärts lesbar.

Sitzung 13: tatsächlichen isolierten Runner bereitstellen und adversarial prüfen; erst danach Projektcode-Tests freigeben. Freie Werkzeugwahl und Korrekturplanung mit geeigneten Modellen verbessern und gesondert abnehmen. Kontext-/Dateiauswahl, verständliche Modellberichte, dauerhafte Git-Bereitstellung und Aufgaben-/Runner-Fehlerklassifikation ausbauen. Native Tool-Calls erst nach realem Modell-/Runtime-Nachweis aktivieren. Danach abschließende Gesamt-QC mit Prozessabbrüchen, Last, Restore der Agentenzustände und Zwei-Rechner-LAN/TLS. Noch keine vollständige Produktionsreife behaupten.
