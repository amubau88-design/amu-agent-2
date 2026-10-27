# Sitzung 22 – Gesamtbewertung und kürzester Fertigstellungsweg

Stand: 27.10.2026. Ausgangsbasis 1.19.0 / 93b6305; neuer Quellstand 1.20.0. Keine Prozent-Fertigstellungsangabe. Die Implementierung ist weit fortgeschritten, eine abgenommene autonome Coding-Plattform besteht noch nicht.

## Entscheidung und wichtigster Engpass

Der Eigentümer hat in dieser Sitzung ausdrücklich entschieden: **ausschließlich den vorhandenen Windows-PC verwenden**. Daher ist der bevorzugte und einzige weiterzuverfolgende Weg **dediziertes WSL2-Linux mit dem bereits vorhandenen Rootless-Docker-Adapter**. Keine weiteren Runner-Backends entwickeln, keine anderen Computer kontaktieren.

Der erste Engpass ist geeigneter freigegebener interner Speicher. Letztes tatsächliches Inventar aus Sitzung 21: C: 5.991.182.336 Byte, etwa 5,58 GiB frei; HDD wegen möglicher AMU-SYSTEM-Daten gesperrt. Keine unnötige Wiederholung des Hardware-/WSL-Inventars. Kein freigegebener Linux-Installationsort und keine neue Systemänderungsfreigabe liegen vor. Vor einer späteren schreibenden Aktion müssen Speicher und Identitäten erneut frisch geprüft werden. Zusätzlicher Code kann diese Eigentümerentscheidung nicht ersetzen.

**Zweiter wesentlicher Engpass: Modellqualität.** Die folgende Einzelprobe zeigt einen konkreten Fehler; eine belastbare autonom arbeitende Programmierfähigkeit des installierten Modells ist nicht nachgewiesen.

## A / B / C strikt getrennt

A = im Code implementiert; B = tatsächlich geprüft, mit genanntem Prüfbereich; C = für einen konkret benannten Einsatz ausdrücklich freigegeben. Ein Test oder gesetztes `approve` in einem Testfixture ist keine produktive Eigentümerfreigabe. Der bestehende beauftragte lokale API-Betrieb bleibt bestehen; eine allgemeine produktive Freigabe der gesamten Plattform wird daraus nicht abgeleitet.

| Funktion | A: Implementierung / Grenze | B: Tatsächlicher Nachweis | C: Betriebsfreigabe |
|---|---|---|---|
| Lokale Inferenz / OpenAI-Endpunkte / SSE | Eingebettetes llama.cpp, lokales Qwen, kein obligatorischer Cloud-Dienst | Live-Modellantworten, Modellliste und SSE bis DONE; CPU-Betrieb | Bestehender lokaler Betrieb; keine allgemeine LAN-Freigabe |
| API-Schlüssel / Clients / Rollen / Budgets | Verwaltung, scopes, getrennte Zugänge, Queue und Limits vorhanden | Live-401/403 sowie lokale Rollen-/Backup-/Runner-Regressionsprüfungen | Bestehende eingerichtete Konten erhalten; neue Rechte nur explizit |
| Adminoberfläche | Anmeldung, Modelle, Clients, Status, Logs und Runnerverwaltung vorhanden | HTTP 200, inline-JS-Syntax und authentifizierte Readiness geprüft | Vorhandene lokale Administration; keine neue vollständige Browserabnahme behauptet |
| Projektregistrierung / Arbeitskopie / Dateirechte | Explizite Bereiche, kontrollierte Kopien, Hashes und Clientzuordnung | Eigene lokale Testfixtures mit echten Datei-/Git-Operationen | Nur jeweils ausdrücklich registrierte freigegebene Bereiche; andere AMU-Projekte unverändert |
| Mehrstufiger Agent / Patches / Diffs | Toolaktionen, Checkpoints, Änderungspakete und Genehmigungen vorhanden | Ablauf mit vorgegebenen Modellantworten/Testadapter geprüft | Kein Nachweis zuverlässiger autonomer Arbeit mit echtem kleinen Modell |
| Syntaxprüfung | Parse-only-Prüfung ohne Ausführung plus Containerprofile | Parsergrenzen tatsächlich geprüft; Linux-Syntaxlauf noch offen | Kein Ersatz für Ausführung eines Projekts |
| Build / Unit / Integration | Docker-Adapter, mTLS, begrenzte Profile, Netzwerk aus, Read-only-Input, tmpfs | Protokoll, Ablehnungen und Steuerung mit Testadapter; **keine echten Linux-Container** | Nicht freigegeben, Projektcode bleibt gesperrt |
| Fehleranalyse / Reparaturzyklus | Fehlerevidenz an Modell, neuer Korrekturvorschlag, neue Freigabe | Mehrstufiger Ablauf mit Modell-/Runner-Testadapter | Reale autonome Korrektur und erfolgreicher Linux-Rerun offen |
| Git / Übernahme / Restore von Änderungen | Separate Freigaben, Diffs, Commit- und Wiederherstellungswege | Tatsächliche Git-/Dateioperationen ausschließlich in eigenen Prüfkopien | Keine pauschale automatische Übernahme; pro Änderung freigeben |
| Wiederaufnahme / Abbruch / Crashzustand | Journale, Abbruch, kein automatisches Replay, unklare Ergebnisse und Sperren | mTLS-Testadapter, lokale Journale; echter API-Watchdog-Wiederanlauf in Sitzung 21 beobachtet | Keine Garantie gegen alle Stromausfall-/Linux-Daemonfälle; reale Runner-Crashprüfung fehlt |
| Verschlüsselte Sicherung / Staging-Restore | AES-GCM, Integritäts-/DB-Prüfung, getrennte Restorekopie | Tatsächliche Ver-/Entschlüsselung, falsches Passwort/Tamper/Traversal verweigert; neue Konfigurations-Roundtrips | Kein automatischer Live-Restore; Wiederanlauf auf Ersatzinstallation nicht vollständig abgenommen |
| Netzwerk / Remote-Worker / Mehrserver | Zertifikate und Workerlogik vorhanden | Lokale mTLS-Prüfungen; kein aktueller Zwei-Computer-Nachweis | Für MVP verschoben; kein anderer Computer wird geändert |

Quellnachweise: `src/index.ts`, `src/amu-api/server.ts`, `src/central/service.ts`, `src/core/{controller,coding-agent,workspaces,change-sets,development-git,runner-executions,remote-runner}.ts`, `src/runner/{service,docker-runtime,acceptance,protocol,lease}.ts`, `src/backup/{manager,archive,verify-state}.ts`. Diese Bewertung ist eine gezielte Code-/Integrationsprüfung, kein vollständiger unabhängiger Sicherheitsaudit aller historischen Dateien.

## Konkrete Fehler und technische Schulden

**In dieser Sitzung behoben:**

1. Der Backup-Manager ließ `config/` sowohl bei Voll- als auch Konfigurationssicherungen aus. Seit Sitzung 20 ist dort die erforderliche HDD-Eigentümersperre hinterlegt. Eine erfolgreiche Archiv-Authentifizierung bewies deshalb bisher nicht, dass alle für den Wiederanlauf erforderlichen Einstellungen enthalten waren. Beide Sicherungsarten erfassen jetzt `config/`; tatsächlicher verschlüsselter Staging-Restore bewahrt Policy und Originaldateien. Alte Archive werden dadurch nicht rückwirkend vollständig.
2. Runner und Zentrale hatten unterschiedliche Abnahmeprüfungen. Der lokale Runner akzeptierte bloße Erfolgsnamen ohne die strengeren Containerbeobachtungen der Zentrale. Beide verwenden nun denselben vorhandenen Validator. Fehlende Beobachtungen, falsche Netzwerkangaben, doppelte Checks, unbegrenzter RAM und abgelaufene Berichte werden auf beiden Seiten verworfen.
3. Die Liste der für den Adapter-Fingerprint relevanten Module war doppelt gepflegt; Sitzung 21 hatte dadurch bereits einen Integrationsfehler gezeigt. Jetzt gibt es eine einzige Liste im vorhandenen Protokollmodul. Sie bindet auch die Abnahmeprüfungen selbst. Codeänderungen machen alte Freigaben ungültig. Keine neue Isolationsarchitektur eingeführt.

**Noch relevant:**

- Echte Linux-Umgebung, Ressourcenlimit-/Mount-/Netzwerk-/Bereinigungsbeweise fehlen; Testadapter sind kein Sicherheitsnachweis.
- Node/npm-Profil, maximal zwölf explizite Snapshotdateien und 512 KiB Gesamtquelle; Agentanfangskontext höchstens acht Dateien und 7.000 Zeichen. Nur fest freigegebene Befehle, maximal 120 Sekunden, 256-MiB-Arbeitstmpfs. Das ist ein begrenzter Einstieg, kein universeller Builder großer Anwendungen.
- Keine allgemeine Offline-Abhängigkeitsversorgung und kein beliebiger Artefaktexport; erster Abnahmeworkflow muss ein kleines dependency-freies Node-Projekt sein. Größere Projekte benötigen später separat geprüfte Images/Abhängigkeiten und Kapazitätsanpassungen.
- Harte Abstürze lassen bewusst unsichere Sperren/Ergebnisse stehen; manuelle Prüfung ist teilweise notwendig. Annahme einer beliebigen alten PID allein reicht nicht als Recoverybeweis.
- Die Abnahme ist derzeit 24 Stunden gültig. Der spätere reale Betrieb muss zeigen, ob diese Prüfungshäufigkeit tragbar ist; Sicherheitsgrenzen werden jetzt nicht gelockert.
- Viele historische Sitzungs-/Demotests und sehr kompakte große Module erhöhen Wartungskosten. Keine breite Umstrukturierung vor der ersten echten Abnahme. Keine pauschale Ausführung historischer „autonomer“ Demonstrationen oder unbekannter Projekt-Skripte auf Windows.
- Windows 10 Pro 22H2, zuletzt Build 19045.6466; regulärer Support seit 14.10.2025 beendet, ESU nicht bestätigt. Defender ersetzt OS-Patches nicht. Produktiver Netzwerkbetrieb braucht eine unterstützte aktuelle Sicherheitsbasis. Keine Windows-Änderung ausgeführt. [Vorhandene Hardware-/Sicherheitsprüfung](session20-hardware.md).
- Wiederherstellungsschlüssel muss unabhängig vom alleinigen Rechnerverlust sicher erreichbar sein. Sein Inhalt wird nicht exportiert oder protokolliert. Eine USB-Dateiprüfsumme ist keine komplette Disaster-Recovery-Abnahme.

## Drei Wege – nur einen weiterverfolgen

Aufwände sind technische Schätzungen nach Bereitstellung/Freigaben, keine zugesagten Termine; Downloads, fehlender Platz, Windows-Servicing und Fehler können sie deutlich verlängern.

| Weg | Voraussetzungen / Eigentümerentscheidung | Risiken / API-Einfluss | Geschätzter Aufwand / Eignung |
|---|---|---|---|
| **A: WSL2 auf diesem PC – ausgewählt** | Geeigneter interner Speicher; VMP, modernes systemd-fähiges WSL, Ubuntu 24.04 LTS, Node 24, Rootless Docker; ausdrückliche Installation-/Download-/Rebootfreigabe | Gemeinsame CPU/RAM, Windows-Servicing/Neustart unterbricht API, WSL-Windowszugriff muss ausgeschaltet bleiben | Etwa 4–8 Stunden / 1–2 Sitzungen nach Freigaben; reale Node-Builds/Tests erst nach unabhängiger Containerabnahme |
| B: separater vorhandener Linux-PC | Dediziertes freigegebenes Gerät und private Verbindung | Könnte Windows/HDD und API entlasten; eigener Betrieb/Netzwerk nötig | Bei vorbereitetem Linux etwa 2–4 Stunden, sonst 4–8+; **vom Eigentümer ausgeschlossen, keine Weiterarbeit** |
| C: vollständige Linux-VM | Ebenfalls interner Speicher, Hypervisorinstallation, Gast-Linux und Rootless Docker | Zusätzliche Verwaltung, ähnliche CPU/RAM-/Rebootkosten; löst die Speicherblockade nicht | Etwa 1–2 Arbeitstage mit realer Abnahme; hier kein Beschleunigungsvorteil, deshalb verworfen |

WSL1, eine Node-vm, normale Unterprozesse, nur ein anderes Arbeitsverzeichnis oder USB-Swap sind keine gleichwertige Lösung. WSL2 verwendet einen echten Linux-Kernel in einer verwalteten VM; systemd und Linux-native Dateien werden benötigt. [Microsoft: WSL-Versionen](https://learn.microsoft.com/en-us/windows/wsl/compare-versions). Rootless Docker darf CPU/RAM/PID-Flags nicht still ignorieren: systemd/cgroup v2 und passende Delegation bleiben zwingend. [Docker Rootless-Ressourcenlimits](https://docs.docker.com/engine/security/rootless/tips/).

Eine schlankere sichere Architektur besteht hier darin, **die vorhandene Architektur klein zu betreiben**: eine dedizierte Distribution, ein Benutzer, ein Rootless-Daemon, ein unveränderliches Node-Image, ein Auftrag gleichzeitig, mTLS und keine Hostfreigaben. Kein Kubernetes, kein weiterer Containerbackend, kein eigener Hypervisor und keine eigene Modelllaufzeit erfinden. Linux/Node/Docker/systemd und die eingebettete offene Modellbibliothek weiterverwenden.

## Kleinster sinnvoller Erstumfang und Modellgrenze

Der erste abnehmbare Codingumfang ist ein kleines Node-Projekt ohne externe Abhängigkeiten: explizit registrierte Arbeitskopie; ein kurzer Plan; kontrollierte Änderung von zwei bis fünf Dateien; echte Syntax-/Unit-/Integrationstests im Runner; ein absichtlicher Fehler und gezielte Korrektur; Hash-/Diff-/Logbericht; getrennte Eigentümerfreigabe; Commit und Staging-Wiederherstellung. Lokale API, Schlüssel und Admin bleiben Bestandteil. Große Modelle, GPU, Python, beliebige Frameworks, Multi-Server, AMU-Agent-3-LAN-Anbindung und produktive fremde Projekte folgen später.

Installiert ist `qwen2.5:1.5b` mit etwa 986 MB GGUF-Datei; ein Coder-Modell ist anhand dieser Registrierung nicht belegt. Tatsächlich funktionierende Antworten/SSE beweisen keine fachliche Richtigkeit. In dieser Sitzung wurde **genau eine** kleine reale Textanalyse angefragt: `sum=(a,b)=>a-b`, erwartet `sum(2,3)===5`, Ausgabe als JSON mit korrigierter Zeile. Das Modell erklärte Addition, gab jedoch erneut `return a - b;` aus und hielt das angeforderte JSON-Format nicht ein. Antwort gespeichert unter `scratch/session22-model-assessment.json`; nichts ausgeführt oder angewendet. Eine Grammatik kann das Format erzwingen, nicht die falsche Semantik beheben. Die Agenten-Regressionsprüfungen mit vorgegebenen Modellantworten beweisen diesen Punkt ausdrücklich nicht.

Damit wird **keine Programmieraufgabenklasse als zuverlässig autonom beherrscht ausgewiesen**. Kleine Erklärungen und Änderungskandidaten sind mit fachlicher Kontrolle nutzbar; auch triviale Korrekturen brauchen Tests. Mehrdatei-Architektur, komplexe Debugging-/Sicherheitsaufgaben und lange autonome Ketten sind mit diesem Stand nicht belastbar freigabefähig. Ein leistungsfähigeres geeignetes Coder-Modell ist für anspruchsvollere Aufgaben voraussichtlich erforderlich, muss aber auf unseren Aufgaben geprüft werden; größer ist keine Erfolgsgarantie. Keine Gewichte heruntergeladen und kein Neukauf erforderlich, um zunächst die echte Runner-Basis abzunehmen. Ein späteres Modell kann auf vorhandener CPU/RAM geprüft werden; Geschwindigkeit und freier Modellplatz bleiben gesondert zu messen. [Offizielle Qwen-Coder-Familie – nicht mit dem hier installierten Modell gleichsetzen](https://qwenlm.github.io/blog/qwen2.5-coder-family/).

## Priorisierter Fertigstellungsfahrplan

| Reihenfolge / Abhängigkeit | Arbeitspaket und Abnahmekriterium | Aufwand / Entscheidung |
|---|---|---|
| 1 – blockierend | Eigentümer prüft AMU-SYSTEM-Kopien und Wiederherstellbarkeit, dann gesondert HDD-Nutzung entscheiden **oder** konkret benannte entbehrliche C:-Dateien zur sicheren Platzgewinnung freigeben. Danach frisches Inventar und mindestens 20 GiB geeigneten internen Zielplatz nachweisen | Ohne Eigentümerentscheidung nicht fortsetzbar; keine automatische Bereinigung, keine angenommene Löschfreigabe |
| 2 – nach 1 | Genauen internen Linux-/Swap-/Installationspfad festlegen, Windows-Hostplatz erneut prüfen; VMP/moderne WSL-/Ubuntu-/Node-/Rootless-Einrichtung genehmigen, geplanten Reboot durchführen; lokale API danach wieder bereit | Etwa 1–2 Sitzungen, eigene System-/Rebootfreigabe; keine Garantie des C:-Paketbedarfs anhand 5,58 GiB |
| 3 – nach 2 | Vorhandene aktuellen Quellen einmal übertragen, non-root/systemd/cgroup/mount- und mTLS-Grenzen nachweisen; tatsächliche Abnahme mit Timeout, Abbruch, RAM/PID/CPU/Netzwerk/Dateisystem/Bereinigung und Restart; unabhängige Prüfung und zentrale Aktivierung | Etwa eine Sitzung, bei Installationsproblemen mehr; keine alleinige Selbstauskunft als Freigabe |
| 4 – nach 3 | Echtes kleines Mehrdateiprojekt mit realem Modell, fehlerhaftem Test, nachvollziehbarer Korrektur und bestandenem Rerun; Kandidat darf nicht automatisch übernommen werden. Abnahme scheitert ehrlich bei Modellfehlern | Etwa eine Sitzung, Modellqualität kann zusätzlich blockieren; kein neuer Modell-/Hardwarekauf vorausgesetzt |
| 5 – nach 4 | Getrennte Übernahmefreigabe, Commit, Abbruch/Wiederaufnahme, verschlüsselte vollständige Sicherung und Staging-Restore; Wiederanlaufplan und Eigentümerabnahme für den eng definierten Erstumfang | Etwa eine Sitzung, teilweise mit 4 kombinierbar; kein blindes Überschreiben der Live-Daten |

Realistische Schätzung: **3–5 weitere fokussierte Sitzungen nach den Eigentümerfreigaben**, sofern Bereitstellung und kleiner Modellworkflow gelingen. Fehlende Entscheidungen, Windows-Probleme oder ein ungeeignetes Modell sind nicht in dieser Spanne garantiert lösbar. Keine feste Fertigstellungszusage vor deren Klärung. Hardwarekauf ist nicht der nächste zwingende Schritt; geeigneter freigegebener Speicher und genehmigte OS-Einrichtung sind es. Für breiteren produktiven Einsatz kommt die geklärte Windows-Sicherheitsbasis hinzu.

Jetzt beenden: wiederholte Hardwareinventare, weitere synthetische Demo-Workflows, alternative Runner-Backends, vorbereitende UI-Erweiterungen und zusätzliche Sicherungsformate. Nach dieser Sitzung **nicht erneut nur Vorbereitung erzeugen**: Sitzung 23 soll die Speicherentscheidung und – bei Freigabe – den realen Systemaufbau behandeln. Ohne diese Entscheidung den konkreten Blocker melden, keine Umgehungsentwicklung.

## Tatsächlich umgesetzte Prüfungen und Sicherung

- Vor Änderungen API-Vollsicherung erstellt und authentifiziert verifiziert: `626bd7d3-8cc7-42c7-96e8-2fedeeacba37`, SHA-256 `5b675ccd4621321caa6e1d28efae2c76fc5153932ae6ef87fa03eb2eb81a3aa8`.
- `session22-backup.test.mjs`: tatsächlicher AES-GCM-Roundtrip für Voll- und Konfigurationsscope, Policy bytegleich restauriert, Originale unverändert, Wiederherstellung nicht aktiviert, Recovery-Key nicht archiviert.
- `session22-acceptance.test.mjs`: übereinstimmende Ablehnung unvollständiger/falscher/doppelter/abgelaufener Beobachtungen; zentrale Modulliste enthält die Abnahmepolicy. Die erstmalige Probe vor vollständiger Änderung zeigte erwartbar die alte Lücke; nach Abschluss bestanden.
- `session14-runner.test.mjs` und `session16-runner.test.mjs`: tatsächliches lokales mTLS und Freigabe-/Abbruch-/Reparatur-/Git-/Wiederherstellungssteuerung mit explizitem Modell-/Runner-Testadapter bestanden. Alte Sitzung-14-Fixture enthält nun vollständige synthetische Evidenz statt vom alten schwächeren Gate akzeptierter leerer Beobachtungen. **Keine realen Container/Projekt-Unit-Tests auf Windows.**
- `session4-backup.test.ts`: echte Verschlüsselung/Staging-Wiederherstellung, Passwort-/Tamper-/Traversal-Ablehnung, Originalschutz, Rollen, Maintenancesperre, Import/Re-Verifikation und Einmaldownload bestanden.
- TypeScript `tsc --noEmit` bestanden, kein Build erzeugt. Bestehende Infrastrukturtests gezielt ausgewählt; keine pauschale Ausführung aller historischen Demonstrationen oder fremder Projekttests.
- Live-Health/Readiness, geschützte Modellliste (200/401), Qwen-SSE bis DONE, Client-Admintrennung (403), Adminseite HTTP 200 und inline-JS-Syntax bestanden. Neue kleine Modellanalyse fachlich/formal fehlgeschlagen, siehe oben; nicht als bestandene Codingprüfung dargestellt.

Die bestehende API meldet bei den Live-Prüfungen **1.19.0**; die Änderungen liegen als Quellstand 1.20.0 vor. Kein manueller Restart, keine Featureänderung und keine neue Runnerfreigabe. Der Backup-Fix ist deshalb im beibehaltenen API-Prozess noch nicht aktiv. Damit die neue Konfiguration trotzdem sofort gesichert ist, wurde ein **zusätzliches verschlüsseltes Konfigurationsarchiv** `9957ac0e-e212-479a-8e62-953080f3b44d` erstellt, tatsächlich in ein neues Prüfverzeichnis entschlüsselt und bytegleich geprüft. SHA-256: `4814af1e9f947fb044d830d132fdaf7c98d81a8e2d5f2e329059f0c7f3d79f0e`.

Dieses Ergänzungsarchiv ist auch in einem **neuen** USB-Verzeichnis gespeichert und vollständig zurückgelesen; bestehende USB-Sicherung bleibt erhalten. Keine Formatierung. Es enthält keinen Wiederherstellungsschlüssel. Bis zum genehmigten Wechsel auf den korrigierten Backup-Code sind Vollarchiv **und** Konfigurationsergänzung zusammen zu erhalten; beim Restore zuerst getrennte Prüfkopien erstellen und Eigentümersperre vor jeder späteren Installation prüfen. Kein altes Archiv als nachträglich repariert ausgeben.

Der endgültige Git-Commit, saubere Arbeitsbaum, aktuelle Runtime, Abschlusssicherung und USB-Belege stehen in `scratch/session22-closeout.json`. Kein anderer Rechner oder AMU WEB/AMU SYSTEM verändert. Der Auftrag zur Bewertung und zu sicheren Codekorrekturen ist bearbeitet; die operative Fertigstellung bleibt ausdrücklich von den benannten Eigentümerentscheidungen und realen Abnahmen abhängig.
