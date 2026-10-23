# AMU AI Engine 1.5.0 – Sitzung 5, 24.10.2026

Ausgangspunkt: sauberer Commit `4342793`, Version 1.4.0. Vor Änderungen wurde eine vollständige AES-256-GCM-Sicherung einschließlich Modellgewichten erstellt: `b965d360-fe2e-4368-8b85-371ae2519a99` (185 Dateien, 988.199.769 Bytes). Nur AMU-Agent-2 wurde bearbeitet. Private Zustände, Schlüssel, Gewichte und Testverzeichnisse bleiben außerhalb von Git.

## Tatsächlich implementiert

### Remote-Inferenz und Serverrollen

Der bisherige Worker-Vertrag wird jetzt durch lokale native Prozesse und `RemoteInferenceWorker` implementiert. Dasselbe Gateway übernimmt Autorisierung, Client-Budgets, faire priorisierte Warteschlangen, Abbruch und Streaming. Der zusätzliche Server betreibt dieselbe AMU-Software mit einer expliziten Worker-Rolle; es wird kein Ollama-, Cloud- oder fremder Inferenzdienst benötigt.

- HTTPS mit regulärer CA-/Namensprüfung, TLS mindestens 1.2 und zusätzlichem SHA-256-Pin des Serverzertifikats. Zertifikatsprüfung lässt sich über diese Schnittstelle nicht abschalten. HTTPS-Sitzungswiederverwendung ist deaktiviert, damit jeder Verbindungsaufbau die registrierte Identität erneut prüft.
- Nur private IP-Adressen oder Loopback als Remote-Ziel. Keine öffentlichen Ziele, DNS-Umleitungen oder Link-Local-Metadatenadressen. LAN-Worker benötigen zusätzlich eine explizite Quell-CIDR-Freigabe.
- Zufällige individuelle Node-ID und eigener Worker-Schlüssel, getrennt von Client-/Administrator-Schlüsseln. Auf dem Worker liegt der Schlüssel-Hash; im Gateway liegt der für ausgehende Authentifizierung erforderliche Schlüssel in einer privaten, ignorierten Datei. Er wird nicht im Dashboard oder in Statusantworten ausgegeben.
- Registrierung prüft Zertifikat, Node-ID, Protokollversion, Modell-ID und Modell-SHA-256. Vorhandene lokale Gewichte dienen als erwarteter Fingerabdruck; bei einem nur entfernten Modell wird der bei der Registrierung geprüfte Fingerabdruck festgehalten. Ein späterer Wechsel erfordert erneute Registrierung. Node-Threads werden aus dem tatsächlichen Status übernommen.
- Neu registrierte Verbindungen bleiben gesperrt, bis sie ausdrücklich gestartet werden. Stoppen/Entfernen im Gateway beendet die Verbindung, lässt die Modellverwaltung des anderen Servers aber unter dessen Kontrolle.
- Heartbeat normalerweise alle fünf Sekunden, Bereitschaft nach 15 Sekunden ohne Erfolg gesperrt, begrenzte Wiederverbindung mit Verzögerung bis 30 Sekunden. Ein wieder erreichbarer authentifizierter Worker wird erneut verfügbar; fehlgeschlagene Generationen werden dabei nicht nachgeholt.
- Native Unterprozesse auf dem Worker können mit höchstens drei Versuchen je fünf Minuten wiederhergestellt werden. Der vorhandene AMU-Supervisor unterstützt zusätzlich die Rolle `remote-worker`, mit eigenem Zustandsverzeichnis, Heartbeat, begrenztem Prozessneustart und Schutz vor doppeltem Start. Autostart auf einem zweiten Rechner wird nicht automatisch eingerichtet.
- CPU-/RAM-Zulassung erfolgt auf dem jeweiligen ausführenden Server. Gateway-CPU-Budgets zählen entfernte Threads nicht mit. Modell-RAM, Kontext, tatsächliche RSS und Bereitschaft begrenzen die Auswahl. Das Gateway erfasst pro Worker erfolgreiche/fehlgeschlagene Aufträge und geglättete TTFT-/Tokenzeiten. Nach dem ersten Einsatz bevorzugt die Auswahl bei mehreren freien, passenden Workern die geschätzte kürzere Antwortzeit; beschäftigte Worker erhalten keine zweite Generation. Client-Fairness bleibt erhalten.

### Keine erneute Ausführung bei unklarem Ergebnis

`POST /worker/v1/generate` erhält eine UUID, die mit der Auftrags-ID im Gateway-Pool übereinstimmt. Vor der Ausführung wird ein dauerhaft synchronisiertes Journal aus ID, Anfrage-Hash und Zustand geschrieben. Eine erneut übermittelte ID wird mit 409 abgewiesen, auch nach einem Neustart. Journalzustände ohne gesicherten Abschluss werden nach einem Absturz als unterbrochen markiert. Prompts und Antworten werden nicht im Journal gespeichert.

Zusätzlich unterstützt `/v1/chat/completions` optional `Idempotency-Key` (1–128 einfache Zeichen). Gleicher Schlüssel und gleicher Client werden nicht nochmals ausgeführt; geänderte Anfragedaten mit demselben Schlüssel ergeben ebenfalls 409. Verschiedene Clients haben getrennte Namensräume. Es gibt keine gespeicherte Antwortwiederholung. Bei Verbindungsabbruch kann daher eine bereits berechnete Antwort verloren sein. Vor einem bewusst neuen Auftrag den Fehlerzustand prüfen; SDK-Generierungswiederholungen auf null setzen.

Chat-Warteschlangen und Antworttexte bleiben im Arbeitsspeicher. Ein Gateway-Ausfall stellt verlorene Chat-Antworten nicht automatisch wieder her; bestehende AMU-Core-Checkpoints werden weiterhin getrennt behandelt.

Beide Journale haben eine Sicherheitsgrenze von 100.000 Einträgen und löschen IDs nicht stillschweigend. Bei Erreichen wird neue Arbeit kontrolliert abgewiesen. Für hohe Dauerlast ist eine indizierte, transaktionale Journalablage mit geregelter Aufbewahrung noch erforderlich. Das ist keine verteilte Exactly-once-Garantie gegen verlorene Datenträger oder manuell gelöschte Journale.

### Sicherungsplanung und Wiederherstellung

Im vorhandenen Sicherungsbereich ist eine aktivierbare Planung verfügbar. Standardmäßig bleibt sie ausgeschaltet. Intervall: 60–43.200 Minuten; Modellgewichte können eingeschlossen werden. Der laufende Gateway-Prozess prüft Termine alle 30 Sekunden. Ein verpasster Termin führt zu einer Sicherung, nicht zu einer Serie alter Aufträge. Laufende Inferenz, Entwicklungsaufträge oder Sicherungen verschieben den Versuch um 15 Minuten.

Die übertragbare Planungskonfiguration liegt unter `scratch/secrets/backup-schedule.json` und wird mitgesichert; laufende Termin-/Prüfzustände bleiben separat unter dem ausgeschlossenen Sicherungsverzeichnis. Nach einem Umzug ohne Terminverlauf beginnt ein aktivierter Plan mit einem neuen vollständigen Intervall.

Geplante Archive sind verschlüsselt und werden anschließend durch authentifizierte Entschlüsselung geprüft. Eine fehlgeschlagene oder unterbrochene Sicherung wird protokolliert. Ein Stromausfall führt niemals zur automatischen Rückschreibung einer alten Datenbank. Der Plan wird nach Prozessneustart aus dem gespeicherten Zustand fortgesetzt. Absichten und Journale verwenden atomaren Austausch und Dateisynchronisierung; dies ersetzt keine redundanten Datenträger oder externe Sicherung.

Neue Archive enthalten ein **mitverschlüsseltes** Manifest mit Anwendungsversion, Archivschema, Mindest-Node-Version und Umfang. Prüfung/Restore melden kompatible, unbekannte alte oder inkompatible Formate. Auch inkompatible Archive lassen sich zur Untersuchung isoliert entpacken; daraus folgt keine Freigabe zur Aktivierung. Bestehende Archive ohne Manifest bleiben prüf- und lesbar, benötigen aber manuelle Versionsprüfung.

Restore erzeugt weiterhin ausschließlich eine neue Prüfkopie unter `scratch/restores/<UUID>`. Produktive Datenbanken werden nicht überschrieben. Ein atomarer produktiver Rollback, eine transaktionale Datenbankmigration und automatisches Server-Failover sind **nicht implementiert**. Sichere Übernahme/Rollback bleiben ein ausdrücklich kontrollierter Offline-Betriebsschritt; siehe unten.

Der lokale Wiederherstellungsschlüssel ist absichtlich nicht im Archiv enthalten. Getrennt sichern! Es gibt keine automatische Archivlöschung. Bei zu wenig freiem Speicher schlägt die Sicherung kontrolliert fehl; Aufbewahrung und freien Platz überwachen. Nur laufende AMU-Vorgänge werden durch die Wartungssperre angehalten. Unabhängige Datenbankschreiber müssen für eine konsistente Übernahme zusätzlich gestoppt werden.

### Anwendungen und Dashboard

- Beliebige eindeutig benannte Anwendungen mit getrennten Schlüsseln, Rollen, API-/Modellrechten, Quoten, Kontext-, Prioritäts- und Parallelitätsgrenzen bleiben erhalten. Kein festes Vier-Anwendungen-Schema. Die konfigurierbare Registrierungskapazität ist ein Schutzlimit, keine Lastzusage.
- Pro Anwendung abrufbare OpenAI-Verbindungskonfiguration mit Schlüsselplatzhalter, Zeitlimit, TLS-Hinweisen und ehrlicher LAN-Bereitschaft. Keine geheimen Schlüssel in Konfigurationsexporten.
- Archivieren löscht den bisherigen Zugang, invalidiert dessen Schlüssel, beendet seine Aufträge und erhält Nutzungsnachweise. Wiederherstellen erzeugt einen neuen einmalig angezeigten Schlüssel. Dies ist bewusst eine weiche Löschung; keine physische Löschung von Auditdaten.
- Status zeigt aktive Anfragen und Zeitpunkt des letzten Kontakts. Eine zustandslose HTTP-Anwendung wird nicht allein wegen eines früheren Kontakts als dauerhaft verbunden bezeichnet.
- Dasselbe Dashboard ergänzt Remote-Registrierung, Worker-Entfernung, Heartbeat/Latenz, entfernte CPU-/RAM-Daten, Auftragsmetriken, Sicherungsplanung und Versionshinweise. Keine zweite Verwaltungsoberfläche.

## Einen weiteren Worker einrichten

Auf einem weiteren Rechner eine Kopie des bestehenden AMU-Agent-2-Repositories und passende gesperrte Abhängigkeiten bereitstellen. Für einen zusätzlichen Worker **keine Gateway-Client-Datenbank, Administrator-Schlüssel oder CA-Privatschlüssel kopieren**. Modellgewicht und Registry mit SHA-Prüfung übernehmen; Lizenzdateien erhalten. Die aktuell vorhandenen Qwen-Gewichte bleiben unverändert.

1. Node.js 24 bereitstellen; im Projekt `npm ci --ignore-scripts` ausführen. Native Bibliothek und Modell auf dem Ziel prüfen. Linux ist als Pfad-/Prozessmodell vorbereitet, in dieser Sitzung aber nicht auf einem Linux-Server getestet.
2. Für diesen Rechner ein eigenes gültiges TLS-Serverzertifikat und einen privaten Schlüssel bereitstellen. Die private IP muss im SAN stehen. Auf Windows steht der vorhandene dateibasierte Helfer `scripts/setup-lan-tls.ps1` für PowerShell 7 zur Verfügung; er verweigert das Überschreiben vorhandener TLS-Verzeichnisse. Alternativ PEM-Dateien aus einer kontrollierten PKI verwenden. Keine Zertifikatsprüfung abschalten und keine globale Ausführungsrichtlinie umgehen.
3. `npm run worker:init` erzeugt `scratch/secrets/remote-node/node.json` und `worker-key.txt`, ohne einen Listener zu starten. Bestehende Konfiguration/Schlüssel werden nicht überschrieben.
4. In `node.json` die tatsächliche private Bind-IP, Port (Vorgabe 3443), `allowedCidrs` (nur Gateway-IP/32), PEM-Pfade, Modell-ID, Threads, Kontext und RAM-Grenze eintragen. Relative Pfade werden im Projekt aufgelöst. Keine alten Windows-Absolutpfade ungeprüft nach Linux übernehmen.
5. Direkt starten: `npm run worker:start`. Für überwachten Betrieb in PowerShell:

   ```powershell
   $env:AMU_SUPERVISOR_ROLE='remote-worker'
   node scripts/supervise.mjs
   ```

   Unter einer POSIX-Shell: `AMU_SUPERVISOR_ROLE=remote-worker node scripts/supervise.mjs`. Diese Einstellung nur für den Worker-Prozess setzen, nicht für den bestehenden Gateway-Dienst. Ein normaler Supervisor-Start bleibt ein Gateway-Start. Watchdog-Zustand liegt standardmäßig separat unter `scratch/remote-worker-supervisor`.
6. Node-ID und öffentlichen Zertifikatsfingerabdruck aus der Startausgabe, öffentliche CA und Worker-Schlüssel über einen geschützten Weg übernehmen. Im Gateway-Dashboard unter „Weiteren Server sicher verbinden“ eintragen. Registrierung führt die Sicherheitsprüfung durch, Start gibt die Verbindung frei. Der Schlüssel gehört ausschließlich in einen geschützten lokalen Speicher.
7. Firewall nur für den Worker-Port und die tatsächliche Gateway-Quell-IP freigeben, nachdem dies auf dem Zielrechner autorisiert wurde. Diese Sitzung hat keine Firewall-Regel eingerichtet und keinen LAN-Worker gestartet.

Zur Erneuerung eines Worker-Schlüssels: Gateway-Verbindung stoppen, neuen zufälligen Schlüssel und dessen SHA-256-Hash in der lokalen Node-Konfiguration sicher provisionieren, Worker kontrolliert neu starten, alten Gateway-Eintrag entfernen und mit neuer Zugangsinformation erneut registrieren. Node-ID und Auftragsjournal erhalten. Zertifikatswechsel ebenfalls bewusst neu registrieren. Eine unterbrechungsfreie Mehrschlüsselrotation ist noch offen.

## Kontrollierte Übernahme und Rollback

1. Quell- und Zielversion, Manifest, Modell-Hashes und alle Pfade prüfen; produktive Schreibvorgänge beenden. Ein aktuelles vollständiges verschlüsseltes Archiv erstellen und erfolgreich verifizieren.
2. Supervisor und Gateway der umzuziehenden Installation kontrolliert stoppen. Bei einer Migration bleibt das bisherige Verzeichnis vollständig als Rückfallstand erhalten; nicht in denselben Datenbestand hinein entpacken.
3. Die isolierte Prüfkopie in einem gesonderten Betriebsverzeichnis vorbereiten, maschinenspezifische Netzwerk-/Ressourcenwerte und Geheimnisrechte prüfen, benötigte Laufzeit/Abhängigkeiten bereitstellen. Alte Windows-Aufgaben nicht unverändert übertragen. Kein Fremdprojekt ändern.
4. Erst nach expliziter Sichtprüfung den Dienstpfad umstellen. Gesundheit, Modelle, Client-Isolation und einen kurzen Auftrag prüfen. Quellinstallation bis zur Abnahme gestoppt und erhalten lassen.
5. Bei Fehlern neuen Dienst stoppen und den alten Dienstpfad wieder verwenden. Neu entstandene Daten getrennt erhalten und fachlich abgleichen; keine alte Datenbank automatisch darüberkopieren. Diese Schritte sind eine Betriebsanleitung, kein bereits automatisierter oder in dieser Sitzung produktiv ausgeführter Rollback.

## Prüfung und tatsächliche Grenzen

Gezielte Nachweise liegen in `docs/verification/2026-10-24-session5.json`. Neue Prüfungen:

- Native GGUF-Generation über gemeinsamen Pool und echten gepinnten HTTPS-/SSE-Transport auf Loopback; Output und Usage stimmen überein.
- Falsche CA, falscher Zertifikatspin, falsche Node-ID und falscher Schlüssel sowie HTTP-/öffentliche/Metadatenziele abgewiesen. Gleiche Auftrags-ID nicht erneut ausgeführt, unterbrochene alte Annahme nicht nachgeholt.
- Isolierte Fehler-Injektion: Streaming-Abbruch, Jobabschluss als fehlgeschlagen, Bereitschaftsverlust bei Ausfall, authentifizierte Wiederverbindung nach Node-Neustart, kein Replay. Diese Ausfallprüfung verwendet einen kontrollierten Test-Executor; der echte native Transport wurde separat geprüft.
- Tatsächlicher nativer Remote-Worker unter neuem Supervisor-Modus: beendeter eigener Worker-Prozess wird mit gleicher Identität erneut gestartet; Gateway-Supervisor bleibt getrennt.
- Client-Konfiguration, Archivierung/Schlüsselinvalidierung/Wiederherstellung, Rechteisolation, HTTP-Idempotenz, Leerlaufplanung, verschlüsselte Integritätsprüfung, Manifest und unveränderte Testdatenbank.
- Regressionen für bestehende Backup-/Restore-/TLS-Funktionen und Multi-Client-Rechte/faires Backpressure-Verhalten.

Ein erster lokaler Worker-Regressionstest scheiterte an seiner bisherigen festen Dispatch-Annahme nach Einführung der adaptiven Auswahl. Der Test prüft jetzt zwei tatsächlich laufende Aufträge: nur der Auftrag des beendeten Workers scheitert, der andere wird abgeschlossen. Diese korrigierte Prüfung bestand einschließlich Wiederanlauf und unverändertem Haupt-Worker-PID.

Es wurde **kein Zwei-Computer-Test** durchgeführt: kein zweiter erreichbarer Rechner mit Adresse, TLS-Konfiguration und Freigabe wurde bereitgestellt. Produktiv bleibt der Gateway auf Loopback mit dem bisherigen lokalen Worker. Kein Ollama-Dienst und kein fremdes AMU-Projekt wurde entfernt, geändert oder für diese Tests benötigt. Kein kostenpflichtiger KI-Dienst wurde aufgerufen.

Windows-Dateirechte für neu erzeugte Dateien hängen weiterhin von den vorhandenen Verzeichnis-ACLs ab; POSIX-Modus 0600 ist keine Windows-ACL-Härtung. Die zuvor nicht freigegebene Umgehung der PowerShell-Ausführungsrichtlinie wurde nicht wiederholt. Keine Firewall-, Truststore- oder globalen Sicherheitsänderungen.

### Nächste zusammenhängende Arbeiten

1. Zweiten echten Server provisionieren, individuelle TLS-/Worker-Zugangsdaten einrichten und Agent-3 bzw. einen Testclient von dort prüfen; Agent-3 nur in einer gesondert autorisierten Sitzung ändern.
2. Transaktionales indiziertes Auftragsjournal, geregelte Aufbewahrung und optional persistente Ergebnisabholung entwickeln; Grenzen der Wiederholungssemantik ausdrücklich erhalten.
3. Überprüfte Offline-Aktivierung mit Datenbankschema-Migration, automatisierter Rückfallplanung und einem echten Wiederanlauf-/Stromausfalltest ergänzen. Keine automatische Alt-Datenbank-Übernahme.
4. Remote-Autostart unter Windows/Linux, unterbrechungsfreie Schlüssel-/Zertifikatsrotation, Backup-Rotation und getrennten externen Sicherungsspeicher einrichten.
5. Lastprofile auf tatsächlicher Zielhardware messen. Der aktuelle 1,5B-CPU-Test sagt nichts über große Modelle oder die Leistung eines künftigen PowerEdge-Servers aus.

## Produktiver Abnahmestand

Nach kontrolliertem API-Neustart: Version **1.5.0**, `/health` und `/ready` erreichbar und bereit, ein lokaler Haupt-Worker mit `qwen2.5:1.5b`, keine produktiv registrierten Remote-Worker. Ein echter SSE-Auftrag über den vorhandenen separaten Agent-3-Client-Zugang wurde auf Agent-2 abgeschlossen; derselbe Zugang erhält für die Sicherungsadministration 403. Das ist ausdrücklich nur ein lokaler Client-Test. Bindung bleibt `127.0.0.1:3030`, ohne LAN-Listener oder neue Firewall-Regel. Der neue Sicherungsplan ist vorhanden und standardmäßig deaktiviert; Aktivierung erfolgt bewusst im Dashboard. Build und die oben genannten gezielten Prüfungen bestanden nach der beschriebenen Testkorrektur.
