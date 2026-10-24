# AMU AI Engine 1.6.0 – Entwicklungssitzung 6

Datum: 24.10.2026. Ausgangspunkt: sauberer Commit `21c5272`, Version 1.5.0. Vor Änderungen wurde die vollständige verschlüsselte Sicherung `b2cc5d75-7876-4868-b6b7-b909024a2277` einschließlich Modellgewichten erstellt (203 Dateien, 988.786.109 Bytes). Ausschließlich AMU-Agent-2 wurde bearbeitet. Datenbanken, bestehende Sicherungen, Konfigurationen und GGUF-Gewichte wurden erhalten.

## Implementiert und lokal geprüft

### Persistente Auftragsidentitäten

Gateway und Remote-Worker verwenden jetzt das gemeinsame Modul `src/central/journal.ts` mit der in Node eingebetteten SQLite-Bibliothek. Es wird kein zusätzlicher Datenbankserver benötigt. Die tatsächlich eingesetzte Windows-/Node-Version ist 24.21.0; eine Linux-Ausführung wurde in dieser Sitzung nicht durchgeführt.

- Indizierte Identitätssuche und transaktionale Annahme, bevor eine Generation beginnen darf. `synchronous=FULL`, Rollback-Journal im DELETE-Modus und ein exklusiver Prozessbesitz verhindern konkurrierende Journal-Verwalter. Verbindungen werden beim kontrollierten Herunterfahren geschlossen.
- Alte JSON-Journale werden einmalig und transaktional importiert. Die ursprünglichen Dateien bleiben unverändert erhalten. Eine gescheiterte Migration wird zurückgerollt. Unbekannte fremde Datenbanken werden vor Änderungen nur lesend geprüft und abgewiesen.
- Nach abruptem Prozessende werden angenommene, nicht abgeschlossene IDs als unterbrochen markiert. Dieselbe Identität bleibt gesperrt; es gibt kein automatisches Ausführungs-Replay.
- Dateipfad und Rechneridentität unterscheiden einen kopierten Prozessbesitz in einer Prüfkopie vom tatsächlich laufenden Original. Ein zweiter Verwalter derselben aktiven Datei wird abgewiesen.
- Daten enthalten Identität, Anfrage-Hash, Zustand und Zeitpunkte, keine Prompts oder Antworttexte. Einzelne Datensätze werden nicht über die Client-API ausgegeben; Betreiber sehen aggregierte Zustände.
- Sicherheitsgrenze: eine Million Identitäten je Journal. IDs werden nicht automatisch verworfen. Das ist keine unbegrenzte Dauerlastzusage und keine Exactly-once-Garantie bei manuell gelöschtem oder verlorenem Datenträger.

Gateway-Datei: `scratch/secrets/request-identities.sqlite`. Worker-Datei: der konfigurierte `journalFile`-Pfad mit angehängtem `.sqlite`. Zugehörige `.owner`-Dateien sind Laufzeitbesitzmarken, keine Zugangsschlüssel.

### Remote-Worker und Lastverteilung

Die vorhandenen CA-/Namensprüfung, Zertifikatspins, individuellen Node-IDs, Worker-Schlüssel, Modellfingerabdrücke, privaten Zieladressen, Quell-CIDRs und Heartbeats bleiben erhalten. Ungeprüfte Netzwerkports wurden nicht geöffnet.

- Gestoppte Remote-Verbindungen können im bestehenden Dashboard neue Zugangsdaten, CA, Zertifikatspin oder eine neue private IP erhalten. Vor Übernahme werden TLS, unveränderte Identität, Modellfingerabdruck und Kontext geprüft. Eine abgewiesene Änderung erhält den bisherigen Zugang. Alte lokale Geheimnisdateien werden nach erfolgreichem Austausch entfernt; Entfernen eines Workers bereinigt dessen lokale Zugangsdaten.
- Eine solche Änderung provisioniert **keinen neuen Schlüssel auf dem anderen Rechner**. Dieser muss dort zunächst kontrolliert eingerichtet werden. Der Gateway prüft anschließend den bereits gültigen neuen Zugang. Unterbrechungsfreie verteilte Schlüsselrotation ist weiterhin offen.
- Node-Status enthält tatsächliche logische CPUs, freien/gesamten RAM, Speichergrenze und Ausführungszeitlimit. Fehlende aktuelle Messwerte werden als veraltet markiert. Entfernte CPU-Prozente werden anhand der CPU-Anzahl des entfernten Rechners normalisiert.
- Pro Node ist `requestTimeoutMs` zwischen 1.000 und 600.000 ms konfigurierbar, Vorgabe 120.000 ms. Ein Ablauf wird als 504 über den Remote-Stream weitergegeben; Abbruch und sonstige Fehler bleiben getrennt. Es erfolgt keine automatische Wiederholung.
- Die HTTP-Zulassung folgt der Zahl bereiter Worker, höchstens bis zum konfigurierten Gateway-Limit. Ein Startplatz bleibt für das initiale Laden erhalten. Neue Kapazität wird ohne Konfigurationsneustart berücksichtigt. Prioritätsbegrenzung, Client-Round-Robin, Quoten, begrenzte Warteschlangen und langsame Streaming-Verbraucher bleiben geschützt.
- Antworten enthalten `X-AMU-Queue-Wait-Ms` und `X-AMU-Gateway-Capacity`. Ein Client sieht über seinen eigenen Status nur seine eigenen laufenden HTTP-Aufträge.

CPU-/RAM-Grenzen gelten weiterhin auf dem jeweils ausführenden Rechner. Mehrere unabhängig gestartete Worker-Daemons auf demselben Host teilen noch keinen übergreifenden Host-Ressourcenkoordinator. Ihre Budgets müssen gemeinsam geplant werden. Der Gateway ist weiterhin ein einzelner zentraler Dienst, keine Hochverfügbarkeitsinstallation.

### Anwendungen ohne Programmierarbeit verwalten

Das bestehende Dashboard verwendet verständliche Funktionsauswahlen für Modellliste, KI-Antworten/Streaming und Entwicklungsaufträge. Rollen, Modellrechte, RPM-, Tages-, Kontext-, Ausgabe- und Parallelitätsgrenzen bleiben getrennt.

- Temporär sperren und direkt reaktivieren; vorhandener Schlüssel bleibt dabei derselbe.
- Schlüssel erneuern; alter Schlüssel wird ungültig, laufende Arbeit wird beendet.
- Archivieren und mit neuem Schlüssel wiederherstellen; Nutzungsnachweise bleiben erhalten.
- **Dauerhaft widerrufen** erfordert den exakten Anwendungsnamen. Anschließend sind Reaktivierung, Archivwiederherstellung und Schlüsselrotation dieser Identität gesperrt. Für eine neue Identität einen neuen eindeutigen Namen verwenden. Widerrufene Identitäten/Auditdaten werden nicht physisch gelöscht.
- Verbindungskonfiguration mit Schlüsselplatzhalter, tatsächlichem LAN-Vorbereitungsstatus und deaktivierten automatischen Generierungs-Retries abrufen.

Es gibt keine Vier-Anwendungen-Beschränkung. Die bestehenden konfigurierbaren Registrierungsgrenzen sind Schutzlimits; die tatsächliche gemeinsame Leistung hängt von Modell und Hardware ab. Kein Client erhält ohne entsprechende Betreiberrolle die Daten oder Verwaltung anderer Clients.

### Sicherungen, Aufbewahrung und Datenbankprüfung

Automatische Sicherungsplanung bleibt vorhanden und standardmäßig ausgeschaltet. Sie erstellt nur bei Leerlauf verschlüsselte Archive und prüft sie anschließend. Eine neue portable Aufbewahrungskonfiguration liegt in `scratch/secrets/backup-retention.json` und wird mitgesichert.

Die Aufbewahrung ist zunächst ebenfalls ausgeschaltet. Sie lässt sich mit Anzahl und Mindestalter konfigurieren und wahlweise nach einer erfolgreichen geplanten Verifikation anwenden. Eine manuelle Anwendung benötigt den unveränderten Bestätigungshash einer aktuellen Vorschau.

Geschützt bleiben:

- manuell erstellte und alte Archive ohne Herkunftskennzeichnung;
- angeheftete Wiederherstellungspunkte;
- ungeprüfte Archive;
- die letzten zwei geprüften vollständigen Sicherungen mit Modellgewichten;
- die konfigurierte Anzahl neuer planmäßiger Sicherungen;
- Archive unterhalb des konfigurierten Mindestalters.

Vor einer Entfernung wird der aktuelle Archiv-SHA-256 mit dem bei der Integritätsprüfung gespeicherten Fingerabdruck verglichen. Beschädigte/geänderte Archive bleiben erhalten. Nur explizit geeignete planmäßige Archive können entfernt werden. Währenddessen verhindert dieselbe Betriebssperre konkurrierende Backup-/Restore-Operationen. Ergebnisse werden dauerhaft protokolliert; unterbrochene Aufbewahrungsvorgänge werden angezeigt, nicht ungeprüft fortgesetzt. `.deleted.json`-Belege bleiben erhalten. Nach einem Absturz zwischen Metadatenumbenennung und Dateientfernung kann ein Archiv als erhaltener Rest vorliegen; dessen Beleg prüfen und erst nach Verifikation manuell reparieren. Kein solcher Fall löst eine Datenbankwiederherstellung aus.

Neue Archive enthalten einen verschlüsselten SHA-geschützten Dateibestand und ein Manifest mit **Schema 2**, Mindestanwendung 1.6.0, Node-Anforderung und Journal-Schema. Der verschlüsselte Container bleibt mit `AMU-ENCRYPTED-2` gekennzeichnet. Manifest-Schema 1 bleibt für die Migration nach 1.6 lesbar; unbekannte/future Versionen werden als nicht kompatibel ausgewiesen. Ein Export ohne Gewichte erhält jetzt die Modellregistry.

Nach erfolgreicher Archiv-Authentifizierung werden erkannte SQLite-Dateien zusätzlich nur lesend mit `quick_check` geprüft. Diese Prüfung läuft in einem eigenen Thread mit begrenztem JS-Heap, begrenztem Datenbankcache und 60-Sekunden-Frist. Eine beschädigte Datenbank führt zum Fehler, ohne die aktuelle Installation zu verändern oder das Archiv als erfolgreich geprüft freizugeben. Das ersetzt keine fachliche Datenmigration und keine Integritätsprüfung beliebiger anderer Datenbankformate.

Restore erzeugt weiterhin ausschließlich eine isolierte Prüfkopie unter `scratch/restores/<UUID>`. **Automatische produktive Aktivierung und produktiver atomarer Rollback sind nicht freigegeben und nicht implementiert.** Vor einer konsistenten Gesamtaufnahme müssen auch unabhängige Datenbankschreiber außerhalb der Gateway-Wartungssperre angehalten werden. Der lokale Wiederherstellungsschlüssel muss getrennt vom Archiv gesichert werden; er wird nicht mitgesichert.

## Kontrollierter Journal-Export für Migration oder Rückfall

Ein Rückwechsel auf 1.5 mit der unverändert alten JSON-Datei würde neue Auftragsidentitäten verlieren. Deshalb nicht einfach nur alten Quellcode starten.

`scripts/export-identity-journal.mjs` verweigert den Export beim laufenden Besitzer, prüft die SQLite-Integrität und schreibt im gestoppten Zustand eine **neue** kompatible JSON-Datei unter `scratch/migrations/<UUID>`. Die Quelle und bisherige JSON-Dateien werden nicht überschrieben; angenommene Zustände werden im Export als unterbrochen ausgegeben. Der Export aktiviert nichts.

```powershell
# Zuerst betroffenen Gateway/Worker und dessen Supervisor kontrolliert stoppen.
node scripts/export-identity-journal.mjs gateway scratch/secrets/request-identities.sqlite
node scripts/export-identity-journal.mjs worker scratch/secrets/remote-node/jobs.json.sqlite
```

Die zweite Zeile ist nur für den tatsächlich konfigurierten Worker-Journalpfad gedacht. Export, aktuelle vollständige Sicherung, Zielversion, alle Client-Widerrufe und Datenbankschemata gesondert prüfen. Erst danach darf eine ausdrücklich kontrollierte Offline-Übernahme erfolgen. Das Werkzeug ist eine geprüfte Migrationshilfe, kein automatischer produktiver Rollback. Niemals neue Daten mit einer alten Sicherung stillschweigend überschreiben.

## Windows- und Linux-Betriebsprofile

Windows: `scripts/windows-autostart.ps1` und `start-background.ps1` unterstützen jetzt `-Role Gateway` (Vorgabe) und `-Role RemoteWorker`. Gateway-Taskname und Standardargumente bleiben kompatibel. Die Worker-Rolle verwendet einen getrennten Tasknamen und Zustandsordner. Vor einem Stoppen werden Projekt-, Prozess- und Rollenbesitz geprüft. Es wurde kein neuer Task installiert und kein bestehender Task neu registriert. Der bisherige Gateway-Supervisor betreibt die aktualisierte API weiter.

```powershell
# Nur auf dem vorgesehenen Worker-Rechner, nach TLS-/Modell-/Node-Konfiguration:
powershell -NoProfile -File scripts/windows-autostart.ps1 -Action Install -Role RemoteWorker
powershell -NoProfile -File scripts/windows-autostart.ps1 -Action Status -Role RemoteWorker
```

Die tatsächliche Windows-Ausführungsrichtlinie respektieren; keine Bypass-Anweisung verwenden. AtLogOn startet bei Anmeldung des betreffenden Benutzers und ersetzt keinen vor der Anmeldung laufenden Serverdienst.

Linux: `docs/operations/amu-gateway.service` und `amu-remote-worker.service` sind getrennte systemd-Vorlagen mit eingeschränktem Benutzer, privater Dateimaske, begrenzten Neustarts und schreibbarem Projekt-`scratch`. Benutzer, Node-Pfad, Projektpfad, Dateirechte, TLS und Modell-Laufzeit müssen auf dem Ziel eingerichtet werden. Falls ausdrücklich zugelassene Core-Projekte außerhalb von `scratch` Schreibzugriff benötigen, die Rechte gezielt ergänzen. **Die Vorlagen wurden nicht auf Linux installiert oder ausgeführt.**

## Wiederverwendbare Client-Diagnose

Die [Zwei-Rechner-Anleitung](network-two-computers.md) gilt für Agent-3 und weitere AMU-Anwendungen. Ein eigener Schlüssel je Anwendung, ein geprüfter CA-Pfad und eine private HTTPS-Adresse werden auf dem Client konfiguriert. Der Testhelfer führt keine automatischen Generierungs-Retries aus und lehnt öffentliche Ziele ab.

```powershell
$env:AMU_API_BASE_URL='https://<tatsächliche-private-Server-IP>:3030/v1'
$env:AMU_CA_FILE='C:\geschuetzt\amu-ca.pem'
$env:AMU_CLIENT_KEY_FILE='C:\geschuetzt\eigene-anwendung.key'
node scripts/test-client-connection.mjs
node scripts/test-client-connection.mjs --chat
```

Der erste Aufruf prüft Erreichbarkeit und freigegebene Modelle, der zweite einmalig einen kurzen SSE-Auftrag. Fehler enthalten Phase, HTTP-/Verbindungsfehler und verständliche Hinweise zu Dienst, TLS, Schlüsseln, Freigaben und Quoten; Schlüssel werden nicht ausgegeben. Eine Ausführung auf Agent-2 bleibt ein lokaler Test.

## Prüfungen und tatsächlicher Betriebsstatus

Nachweise: `docs/verification/2026-10-24-session6.json`.

- Build/Typprüfung sowie Dashboard-Syntax und referenzierte Bedienelemente.
- SQLite-Migration, fremde Datenbank unverändert abgewiesen, exklusiver Besitz, Wiederöffnung, echter abrupter Testprozess-Abbruch ohne Replay und unverändernder Offline-Export.
- Temporäre Reaktivierung, dauerhafter Widerruf mit Namensbestätigung, Schlüssel-/Rollenisolation und dynamische Zulassungsgrenze.
- Aufbewahrungsregeln und veraltete Vorschau; Löschung ausschließlich geeigneter Testarchive. Beschädigtes Archiv bleibt erhalten.
- Verschlüsselte Verifikation/Restore einschließlich SQLite-Prüfung; absichtlich beschädigte Datenbank in gültigem Archiv wird abgewiesen. Aktuelle Testdatenbank bleibt unverändert.
- Echter nativer GGUF-Auftrag über gepinntes TLS und SSE, Zugangsdatenwechsel mit negativem Gegenfall und Entfernung des alten lokalen Geheimnisses.
- Kontrollierte Ausfall-/Abbruch-/Wiederverbindungstests und expliziter 504 bei einer einsekündigen Node-Testfrist.
- Nativer Remote-Worker unter Supervisor mit Neustart des eigenen Testprozesses; keine Übernahme des Gateway-Supervisors.
- Regressionen für vorhandene faire Multi-Client-Warteschlangen sowie Backup/Restore, Verschlüsselung und TLS.
- Lokale Abnahme der laufenden API: JSON 200, SSE abgeschlossen, identische Anfrageidentität 409, administrative Anfrage mit Client-Schlüssel 403. Vorhandenes JSON-Journal blieb unverändert.

Ein erster neuer Journaltest scheiterte an einer falschen SQL-Parameterzahl (sechs Platzhalter für fünf Spalten). Der Fehler wurde vor der produktiven Migration korrigiert; der endgültige Journaltest bestand. Zwischenzeitliche Typprüfungsfehler wurden behoben. Erwartete negative Sicherheitsfälle sind erfolgreiche Abweisungsprüfungen, keine weiterhin offenen Testfehler.

| Einordnung | Tatsächlicher Stand |
|---|---|
| Implementiert | Oben beschriebene Funktionen im bestehenden Projekt |
| Lokal getestet | Windows, native GGUF-Inferenz, lokale HTTP-API und TLS-Worker auf Loopback |
| Auf zwei Computern getestet | **Nein** – kein erreichbarer zweiter Server mit Adresse, TLS und Freigabe bereitgestellt |
| Im vorhandenen lokalen Betrieb aktiviert | API 1.6.0, ein lokaler Haupt-Worker, native Qwen2.5-1.5B-Inferenz |
| Remote-Worker im bestehenden Betrieb | Keine registriert; Testinstanzen wurden beendet |
| Sicherungsplanung und automatische Aufbewahrung | Implementiert und isoliert geprüft, im bestehenden Betrieb ausgeschaltet |
| Allgemeine Produktionsfreigabe | Keine Freigabe für LAN-Multiserver, Linux oder automatische produktive Datenbankaktivierung |

Die API bleibt auf `127.0.0.1:3030`. Readiness ist HTTP 200. Es wurde keine produktive Netzwerkfreigabe eingerichtet. Die bestehende native Inferenz benötigt weder Ollama noch einen kostenpflichtigen Cloud-Dienst. Andere AMU-Projekte wurden nicht verändert; bestehende fremde Dienste wurden nicht entfernt. Windows-ACL-Härtung wurde nicht über eine zuvor abgewiesene Ausführungsrichtlinien-Umgehung erzwungen.

## Offene Probleme und Prioritäten für Sitzung 7

1. Einen echten zweiten Rechner mit individuell provisionierter TLS-/Worker-Identität einrichten und Netz-, Modell-, Ausfall-, Client- und Berechtigungstests von dort durchführen. Agent-3 selbst bleibt bis zu einer gesonderten Autorisierung unverändert.
2. Produktive Offline-Aktivierung mit verifiziertem Wiederherstellungspunkt, Erhalt neuer Journalidentitäten, Datenbankschema-Migration und unterbrechungssicherem Rückfall entwickeln. Vor Freigabe ausschließlich isoliert prüfen. Kein blindes Zurückkopieren alter Datenbanken.
3. Windows-Worker-Autostart tatsächlich abnehmen und Linux-Profile auf einem Zielsystem prüfen. Derzeit sind Windows-Helfer syntaktisch geprüft und der direkte Node-Supervisor lokal getestet; eine neue geplante Worker-Aufgabe wurde nicht installiert.
4. Verteilte Schlüsselrotation, Ressourcenkoordination mehrerer Daemons desselben Hosts und persistente Ergebnisabholung ergänzen. Chat-Warteschlangen/Antworttexte bleiben im RAM; nach einem Ausfall wird keine verlorene Antwort automatisch rekonstruiert.
5. Aufbewahrungsregeln bewusst aktivieren, externen getrennten Sicherungsspeicher einrichten und echte Stromausfall-/Wiederanlaufprüfungen durchführen. Journalgröße und freie Kapazität überwachen; vorhandene alte manuelle Archive werden absichtlich nicht automatisch entfernt.
6. Last und Modellqualität auf der tatsächlich vorgesehenen Hardware messen. Die bisherigen Tests belegen keine Leistung eines zukünftigen PowerEdge-Servers und keine Qualität großer Entwicklungsmodelle.

Der lokale Git-Commit und der abschließende Arbeitsbaumstatus werden im Abschluss dieser Sitzung angegeben. Private Schlüssel, Gewichte, Datenbanken und Testverzeichnisse gehören weiterhin nicht in Git.
