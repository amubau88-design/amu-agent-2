# AMU AI Engine 1.4.0 – Sitzung 4

Ausgangsstand: sauberer Commit `5df6a21`. Ausschließlich das bestehende AMU-Agent-2-Projekt wurde weiterentwickelt. Andere AMU-Anwendungen, Firewall-Regeln, Windows-Vertrauensspeicher und globale Sicherheitsrichtlinien wurden nicht verändert.

## Native Worker und Lastverteilung

Die bisherige native Engine ist jetzt ein einzelner Worker (`src/inference/slot.ts`). `src/inference/pool.ts` verwaltet unabhängige Prozesse hinter einer gemeinsamen, begrenzten Warteschlange. Der bisherige Import `amuInference` und die vorhandenen API-Endpunkte bleiben erhalten.

Implementiert:

- Worker dynamisch registrieren, konfigurieren, starten, stoppen und neu starten; dauerhafte Registry in `scratch/secrets/workers.json`.
- Individuelle Modellzuweisung, CPU-Threads, Kontextgröße und RAM-Grenze. Neue Registrierungen bleiben zunächst ungeladen. Änderungen an Einstellungen erfordern einen gestoppten Worker.
- Vor jedem Start: Modell-/Kontext-RAM-Schätzung, individuelles RAM-Limit, freier Systemspeicher mit Reserve, aggregierte RAM-Schätzung und gemeinsames CPU-Threadbudget.
- Dasselbe Modell wird nicht beiläufig mehrfach geladen. Ein zusätzlicher gleichartiger Worker benötigt eine ausdrückliche Freigabe. Die Freigabe wird für diesen Worker gespeichert.
- Auswahl eines bereiten, freien Workers mit passendem Modell. Unterschiedlich belegte Worker werden berücksichtigt. Unpassende oder nicht verfügbare Modelle blockieren die Aufträge anderer Modelle nicht am Kopf der Queue.
- Faire Client-Verteilung mit begrenzter Prioritätsbevorzugung aus Sitzung 3, Client-Parallelitätsgrenzen, Token-/Kontextlimits, Deadlines und kontrollierter Abbruch. Die Client-Autorisierung und Budgetreservierung erfolgen einmal im gemeinsamen Pool.
- Native Prozessausfälle werden erkannt. Höchstens drei automatische Wiederherstellungsversuche je fünf Minuten, mit Verzögerung und erneuter Ressourcenprüfung. Ein anderer gesunder Worker bleibt verfügbar. Fehlgeschlagene/teilweise gestreamte Generationen werden nicht automatisch wiederholt.
- Systemweiter RAM-Notstopp und zusätzliche Überwachung der tatsächlichen Worker-RSS. Eine Überschreitung des individuellen Limits entlädt den betroffenen Worker; Neustart erfordert eine bewusste Betriebsentscheidung.
- Worker-Status, PID, RAM, CPU-Schätzung, aktive Aufträge und Wiederherstellungsversuche im Dashboard. CPU-Werte stammen aus dem nativen Prozess und werden auf die logischen CPUs des Rechners bezogen; sie sind Messintervalle, keine exakte Verbrauchsabrechnung je Client.

Der echte Funktionstest nutzte zwei lokale Qwen-Worker mit je einem Thread und zwei gleichzeitig laufenden Generationen. Im Produktivbetrieb bleibt auf der heutigen Hardware **ein Worker** aktiv. Zusätzliche Modellkopien wurden dort nicht gestartet.

### Einstellungen und Bedienung

Im Dashboard unter „Lokale Inferenz-Worker“ einen Namen, installiertes Modell, Threads, Kontext und RAM-Grenze eintragen. „Registrieren“ lädt das Modell noch nicht. Anschließend ausdrücklich starten. Soll ein weiterer Worker dasselbe Modell verwenden, muss die entsprechende Freigabe gewählt werden.

Der Standard-Hauptworker nutzt bereits das standardmäßige gesamte Threadbudget. Für mehrere Worker zuerst einen ruhenden Worker stoppen, dessen Threads reduzieren und das globale Budget passend verteilen. Große Modelle bleiben durch die RAM-Vorprüfung begrenzt. Es gibt keine automatische Erhöhung auf Kosten der Systemreserve.

Das Ressourcenprofil hat jetzt Formularfelder statt einer erforderlichen JSON-Bearbeitung. Standardmäßig gelten weiterhin 4 bzw. automatisch weniger Threads, 4096 Kontext, 65 % RAM-Obergrenze, mindestens 2048 MiB Systemreserve und Notentladung bei weniger als 512 MiB freiem RAM. Zusätzlich sind registrierbare Clients (standardmäßig 1000), Worker (16) und gleichzeitig bearbeitete HTTP-Anfragen (64) konfigurierbar. Harte Validierungsobergrenzen schützen vor versehentlich unbegrenzten Werten.

Gateway-Aufnahme, gemeinsamer Worker-Pool und HTTP-Verarbeitung haben unterschiedliche Grenzen. Gateway- und Pool-Warteschlangen sind jeweils begrenzt. Offene HTTP-Anfragen werden bereits vor dem Einlesen normaler JSON-Bodies begrenzt; zusätzlich ist die Zahl offener Verbindungen beschränkt. Wartungs-/Backup-Endpunkte sind gesondert administrativ abgesichert. Ressourcenfehler geben `Retry-After` aus.

Eine Absenkung des globalen CPU-Budgets bzw. Kontexts wird beim Speichern gegen die registrierten Worker geprüft. Gespeicherte globale Einstellungen werden nach einem kontrollierten API-Neustart aktiv. Worker-Einstellungen selbst können im laufenden Gateway geändert werden, nachdem der betroffene Worker gestoppt wurde.

## Verschlüsselte Sicherung und Restore

Neue exportierbare Pakete verwenden ausschließlich das Format `.amubak` mit AES-256-GCM. Auch Dateipfade und interne Prüfsummen liegen innerhalb des verschlüsselten Inhalts. Ein zufälliger Salt und `scrypt` (N=32768, r=8, p=1) leiten einen eigenen Schlüssel ab; der Format-Header wird mit authentifiziert.

Das Dashboard unterstützt:

1. Vollständige Anwendungssicherung einschließlich vorhandener Daten und Client-/Rechtekonfiguration; Modellgewichte können eingeschlossen werden und sind standardmäßig eingeschlossen.
2. Separaten verschlüsselten Konfigurationsexport.
3. Herunterladen als Stream über ein einmaliges, kurzlebiges HttpOnly-/SameSite-Ticket. Es wird kein API-Schlüssel in die Download-URL geschrieben und kein vollständiges großes Paket als Browser-Blob gepuffert.
4. Streaming-Import eines verschlüsselten Pakets auf einem anderen AMU-Server. Importierte Pakete gelten zunächst als ungeprüft; Import ist keine Aktivierung.
5. Passwort-/Integritätsprüfung und vollständige Wiederherstellung ausschließlich in ein neues Verzeichnis unter `scratch/restores/<UUID>`.

Ein eigenes langes Sicherungspasswort kann angegeben werden (mindestens zwölf Zeichen). Ohne eigenes Passwort wird der lokale zufällige Wiederherstellungsschlüssel aus `scratch/secrets/backup-recovery-key.txt` verwendet. **Dieser Schlüssel ist absichtlich nicht im Sicherungspaket enthalten.** Für einen Umzug muss er getrennt sicher übertragen werden, oder die Sicherung muss mit einem separat bekannten Passwort erstellt werden. Passwort und Paket nicht gemeinsam offen ablegen.

Bestehende explizite Schlüssel-ACLs bleiben erhalten. Neu erzeugte lokale Dateien erben unter Windows weiterhin die vorhandenen Projekt-/Verzeichnisrechte; das nicht freigegebene ACL-Schutzskript aus Sitzung 3 wurde nicht über eine andere Ausführungsart nachgeholt. Die Paketverschlüsselung ersetzt nicht den Schutz des lokalen Wiederherstellungsschlüssels und der entschlüsselten Prüfkopien auf dem Rechner.

### Konsistenz und Bestandsschutz

- Während der Aufnahme einer Sicherung sperrt eine Wartungsschicht neue reguläre Anfragen. Bereits aktive HTTP-Anfragen werden kurz zum Abschluss abgewartet. Aktive native oder Core-Aufträge verhindern die Sicherung. Der Sicherungsstatus bleibt administrativ abrufbar.
- Alle einbezogenen Dateien erhalten SHA-256-Prüfsummen. Eine Änderung zwischen Bestandsaufnahme und Kopie führt zum Abbruch. Ausgabedateien werden erst nach vollständigem Abschluss veröffentlicht; unvollständige `.partial`-Dateien werden nicht als fertige Sicherung angeboten.
- Freier Plattenspeicher wird vor Sicherung, Import und Restore geprüft; mindestens 1 GiB Reserve bleibt vorgesehen. Streams vermeiden das Laden kompletter Modelle in den JavaScript-Heap.
- Relevant sind die vorhandenen dateibasierten Anwendungsdaten einschließlich Scratch-Projekten, Aufgaben, Checkpoints, Konfiguration, Schlüsseln und optional Modellen. Redundante Altbackups, Tests, Restore-Kopien, Migrationskopien und lokale Laufzeit-/Hilfsdateien werden ausgelassen. Git-Metadaten, `node_modules` und der Build-Ordner sind nicht Teil des Anwendungsarchivs. Vollständige Pakete enthalten `.gitignore` und `.gitattributes`.
- Das Verfahren setzt für einen konsistenten Anwendungsstand voraus, dass kein fremder Prozess dieselben Datenbanken verändert. Es ersetzt keine Datenbank-spezifische Transaktions-/WAL-Koordination mit externen Schreibern. In dieser Sitzung wurden bestehende Anwendungsdateien gesichert und binäre Dateien auf unveränderte Wiederherstellung geprüft; kein produktives SQL-System wurde zurückgesetzt.
- Falsches Passwort, verändertes GCM-Tag, fehlerhafte Prüfsumme, doppelte oder ausbrechende Dateipfade verhindern eine veröffentlichte Wiederherstellung. Bereits vorhandene Zielverzeichnisse werden nie überschrieben.
- In restaurierten Core-Task-Metadaten wird die alte rechnergebundene `ownerPid` entfernt. Fehlender Git-Ausschluss für private Scratch-Daten wird in der Prüfkopie ergänzt. Quelldaten bleiben unverändert.
- Vorgänge werden protokolliert. Nach einem API-Prozessabbruch gelten vorher laufende Backup-Vorgänge als unterbrochen; sie werden nicht automatisch wiederholt. Unfertige Pakete/Prüfkopien sind im Status erkennbar und werden nicht aktiviert.

Die automatische Übernahme einer Prüfkopie in die laufende Installation ist **nicht** implementiert. Das ist eine verifizierte Wiederherstellung der Dateien mit sicherem Staging, kein unbeaufsichtigtes Überschreiben des Produktivbestands.

### Tatsächliche Sicherung dieser Sitzung

Vor der Worker-Umstellung wurden zunächst nur Quellcode und Dokumentation lokal gesichert. Danach wurde über die neue Wartungsfunktion eine vollständige verschlüsselte Sicherung einschließlich Modellgewichten erstellt:

- ID: `c83b8a52-c6a9-4b6b-b7b7-1e2205d89327`
- 168 Dateien, verschlüsseltes Paket 988.392.222 Bytes.
- Alle Dateien wurden anschließend entschlüsselt, authentifiziert und in `scratch/restores/b3757943-9a7b-432b-8914-c2f824ca2055` wiederhergestellt.
- 988.368.852 Bytes geprüfter Dateiinhalt; aktuelle Installation wurde nicht ersetzt.

Der erste Aufnahmeversuch ohne Wartung wurde wegen einer erkannten Dateiveränderung verworfen. Das zugehörige unvollständige verschlüsselte Paket ist kein fertiger Export. Historische lokale Sicherungskopien aus früheren Sitzungen wurden nicht gelöscht; sie sind nicht als neue verschlüsselte Transferpakete zu behandeln.

### CLI

```powershell
node --experimental-strip-types scripts/encrypted-backup.mjs list
node --experimental-strip-types scripts/encrypted-backup.mjs create
node --experimental-strip-types scripts/encrypted-backup.mjs verify <Sicherungs-ID>
node --experimental-strip-types scripts/encrypted-backup.mjs restore <Sicherungs-ID>
```

CLI-`create` verlangt einen gestoppten AMU-Server und Supervisor. Im laufenden Betrieb das Dashboard mit Wartungssperre verwenden. Optional: `create --configuration` oder `create --without-models`. Ein eigenes Passwort wird ausschließlich über `AMU_BACKUP_PASSPHRASE` an den CLI-Prozess übergeben, nicht als Kommandozeilenargument. Die alte Datei `portable-snapshot.mjs` verweist jetzt auf denselben verschlüsselten Ablauf und erzeugt keine neuen Klartextpakete.

## Netzwerk und TLS

Das vorhandene Loopback-/TLS-/Subnetz-/Remote-Admin-Sicherheitsmodell bleibt erhalten. Neu ist ein dauerhaftes Netzwerkprofil in `scratch/secrets/network-profile.json` mit Dashboard-Formular für Bind-Adresse, erlaubte Subnetze, Zertifikat, Schlüsseldatei und getrennte Remote-Admin-Freigabe. Änderungen werden gespeichert und erst beim API-Neustart aktiv. Die bisherigen Umgebungsvariablen bleiben als Betriebsoption erhalten.

PEM-Zertifikat und passender privater Schlüssel können importiert werden. Das Paar wird kryptografisch auf Zusammengehörigkeit und Gültigkeitszeitraum geprüft, unter neuen Dateinamen abgelegt und nicht automatisch aktiviert. Zertifikatslaufzeiten/Fingerabdrücke werden angezeigt. Es werden keine bestehenden Zertifikate überschrieben und keine Windows-Vertrauensstellungen installiert. Automatische Zertifikatserneuerung ist noch offen.

Neue Client-Namen müssen eindeutig sein (normalisiert, ohne Berücksichtigung der Groß-/Kleinschreibung). Bestehende IDs und Schlüssel bleiben erhalten; vorhandene historische Namensdubletten werden nicht ungeprüft umbenannt. Schlüsselrotation bricht nun auch bestehende Anfragen dieses Clients ab. Ein vorhandener Schlüssel funktioniert nach der Rotation nicht mehr.

Zwei-Rechner-Vorgehen: [network-two-computers.md](network-two-computers.md). Ein echter Zwei-Computer-Test wurde **nicht** durchgeführt. Es wurden keine Firewall-Regeln oder globalen Windows-Sicherheitsrichtlinien geändert.

## Prüfungen

- `npm run build` und gezielte Typprüfung erfolgreich.
- `session4-workers.test.ts`: echte native Prozesspaare, gleichzeitige Generationen (gemessener Höchstwert 2), ausdrückliche Freigabe einer Modellkopie, CPU-/RAM-Startverweigerung, Ausfall und automatische Wiederherstellung des zweiten Workers bei erhaltenem Hauptworker, Stop und persistente Registry.
- `session4-backup.test.ts`: Vertraulichkeit des Pakets einschließlich Dateipfaden, bitgenauer binärer Datei-Roundtrip, falsches Passwort, Manipulation, Pfadausbruch, Überschreibschutz, Wartung, Admin-Trennung, einmaliger Download, erneuter Import/Prüfung, eindeutige Namen, HTTP-Grenze, Dashboard-Sammelabfrage und TLS-Profil ohne aktive Netzwerkänderung.
- Bestehende gezielte Tests für zentrale API, Multi-Client-Rechte, Core-Prüfpunkte, echte native JSON-/SSE-Anfragen, Kontextlimits, RAM-Schutz, Pause/Start, Abbruch, CA-Vertrauen und Netzwerksperren erfolgreich.
- Vollständige verschlüsselte Aufnahme und tatsächliche Wiederherstellung des Bestands inklusive GGUF-Datei in eine separate Prüfkopie.
- Produktiver Versionswechsel/Worker-Neustart und tatsächlicher finaler API-Status sind im gesonderten Prüfnachweis festgehalten.

Es wurden keine kostenpflichtigen oder externen Inferenzdienste eingesetzt. Ollama wird von der primären Engine nicht benötigt; eine eventuell vorhandene Installation wurde nicht entfernt.

## Geänderte Verantwortlichkeiten

| Bereich | Dateien |
|---|---|
| Worker-Prozess und Schnittstelle | `src/inference/slot.ts`, `contracts.ts`, `engine.ts` |
| Gemeinsamer Pool und Ressourcen | `src/inference/pool.ts`, `resources.ts`, `src/central/platform.ts` |
| Verschlüsselte Sicherung/Restore | `src/backup/archive.ts`, `manager.ts`, `scripts/encrypted-backup.mjs`, `portable-snapshot.mjs` |
| API, Wartung, Netzwerk | `src/amu-api/server.ts`, `src/central/service.ts`, `maintenance.ts`, `network.ts`, `network-profile.ts` |
| Core-Status und Dashboard | `src/core/controller.ts`, `src/web-ui/public/admin.html` |
| Prüfungen und Betrieb | neue Sitzung-4-Tests, angepasste eindeutige Core-Testnamen, Package-Version/Skripte, README und Prüfnachweise |

Der abschließende Stand wurde zusätzlich als vollständiges verschlüsseltes Paket `3341dac6-a43e-41d7-891b-7f65f58c59aa` mit 183 Dateien und 988.815.865 Bytes gesichert. Der produktive Server meldete danach Version 1.4.0, `ready` und HTTP 200 auf `/ready`; weiterhin ein Worker und Loopback-Bindung. Details: [Prüfnachweis](verification/2026-10-23-session4.json).

## Grenzen und nächste Sitzung

1. Geprüfte Übernahme einer restaurierten Installation auf dem Zielserver einschließlich Rollback und korrekter Windows-/Dienstkonfiguration; aktuell nur sichere Prüfkopien.
2. Tatsächlicher Zwei-Computer-Test mit zugelassenem Firewall-/CA-Vorgehen und einzeln registrierten Anwendungen.
3. Prüfung auf der realen R630-Hardware, dort CPU-/RAM-/Kontextprofile festlegen und Durchsatz messen. Diese Sitzung ist kein Performance-Benchmark.
4. Remote-Inferenz-Worker mit gegenseitiger Authentifizierung, Transportprotokoll und verteilten Reservierungen entwickeln. Die erweiterbare Worker-Schnittstelle ist vorhanden; Netzwerk-Worker und Cluster-HA sind nicht fertig.
5. Automatische Zertifikatserneuerung und nach Freigabe weitere Windows-Dateirechtehärtung.
6. Persistente, idempotente Chat-Jobs ergänzen. Core-Aufträge bleiben bereits prüfpunktbasiert wiederaufnehmbar; begonnene Chat-Generationen werden bei Ausfall nicht automatisch wiederholt.
