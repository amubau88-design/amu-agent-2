# AMU-Agent-2 – Sitzung 8: Betriebsabnahme

Stand: **1.6.2**, geprüft am 24./25. Oktober 2026 (Europe/Berlin). Ausschließlich das bestehende AMU-Agent-2 wurde geändert. Ausgangscommit `52c4ebb`; geprüfter Implementierungscommit **`d487f67`**. Der Bericht und die Prüfnachweise werden im anschließenden Dokumentationscommit gesichert.

**Ergebnis:** Die lokale zentrale AI-/API-Plattform und die Admin-Anmeldung sind praktisch nutzbar. Zwei getrennte Anwendungsschlüssel haben echte lokale KI-Antworten und Streaming geliefert; Sperre, Rotation und ein anschließender Neustart wurden geprüft. Eine produktive Verbindung zwischen zwei Computern ist weiterhin **nicht nachgewiesen**.

Nachweise: [Sanitierte Prüfdatei](verification/2026-10-25-session8.json), [Anmelden und Anwendungen verbinden](admin-login-and-clients.md).

## 1. Tatsächlicher Serverstatus

Die bestehende API antwortet unter `http://127.0.0.1:3030`. `/health` und `/ready` funktionieren; die abschließende Bereitschaft ist HTTP 200. Authentifizierter Admin-Status und Dashboard liefern HTTP 200. Backend: `amu-embedded-llama.cpp`; keine erforderliche Verbindung zu Ollama oder einer Cloud-Inferenz-API. Aktive/wartende Inferenzaufträge waren bei der Abnahme null.

Der bestehende Supervisor ist aktiv und liefert aktuelle Heartbeats. Die Windows-Aufgabe „AMU-Agent-2 Central AI“ wurde ausschließlich lesend als **Running / Enabled / AtLogOn** bestätigt. Sie ist ein Start bei Benutzeranmeldung, kein neu eingerichteter Windows-Systemdienst. Der Dashboard-Statusaufruf liefert ebenfalls einen aktuellen Taskstatus.

## 2. Ursache von „Nicht verbunden“

Die alte Seite setzte diesen Text bereits beim Laden, bevor sie überhaupt eine öffentliche Bereitschaftsabfrage oder Anmeldung ausgeführt hatte. Der Administrator-Schlüssel blieb absichtlich nur im Arbeitsspeicher des Tabs. Nach Neuladen war eine erneute Anmeldung nötig, ohne dass ein Serverausfall oder Schlüsselverlust vorlag. Der alte Status-Poller setzte zudem bei jedem Fehler `connected=false` und hörte anschließend dauerhaft mit authentifizierten Statusabfragen auf.

Eine Browser-Neuladung genau während eines kontrollierten Serverneustarts landete zusätzlich auf einer Browser-Verbindungsfehlerseite. Nach dem Wiederanlauf wurde eine frische funktionierende Dashboard-Ansicht geöffnet und angemeldet. Dieser vorübergehende Browserzustand war kein dauerhafter API-Ausfall.

## 3. Reparierte Verbindungsprobleme

Die Seite prüft jetzt vor der Anmeldung öffentlich `/ready`. „API erreichbar · Anmeldung erforderlich“, „API erreichbar · Dienst nicht bereit“ und „API vorübergehend nicht erreichbar“ sind getrennte Zustände. HTTP 401, 403, 429 und 503 erhalten unterschiedliche deutsche Hinweise. Ungültige Schlüssel führen nicht zur Behauptung eines Serverausfalls. Temporäre Netz-/Wartungsfehler stoppen die Statusaktualisierung nicht dauerhaft; Pausen und eine Überlappungssperre begrenzen die Statusabfragen. Es gibt keine automatischen Generierungswiederholungen.

Bei Abmeldung oder geändertem Schlüssel werden vertrauliche Anzeigen und der einmalige neue Schlüssel entfernt. Verwaltungsbereiche bleiben vor Anmeldung verborgen. „Abmelden / Schlüssel vergessen“ und eine sichtbare Aktualisierungszeit wurden ergänzt. Der neue Anwendungsdialog setzt jetzt auch das zuvor bearbeitete Kontextlimit zurück.

## 4. Admin-Anmeldung

Der vorhandene Administrator-Schlüssel ist gültig und wurde **nicht zurückgesetzt oder rotiert**. Öffnen, ungültigen Schlüssel ablehnen, richtigen Schlüssel anmelden und echte Betriebsdaten laden wurden im Browser geprüft. Die Aktualisierungszeit änderte sich automatisch. Im abgenommenen Tab wurden keine JavaScript-Konsolenfehler gemeldet. Ein geheimer Schlüssel wird weiterhin weder in einer URL noch in Local Storage gespeichert; nach einer vollständigen Seitenneuladung erneut anmelden.

## 5. API-Schlüsselverwaltung

Neue Zugänge und rotierte/wiederhergestellte Schlüssel erhalten eine nicht geheime UUID-Schlüsselkennung und einen Erstellungszeitpunkt. Vorhandene Schlüssel bleiben unverändert und bekommen in der Anzeige eine abgeleitete `legacy-…`-Kennung. Die Übersicht zeigt Maskierung statt Geheimnis; Hashes werden nicht über die Verwaltungs-API ausgegeben. Der vollständige neue Schlüssel wird ausschließlich einmal in der Erstellungs-/Rotationsantwort und der dafür vorgesehenen Anzeige bereitgestellt.

Kopieren, Ausblenden, Ersatzschlüssel, Sperre, Reaktivierung, Archivierung mit Bestätigung und Wiederherstellung mit neuem Schlüssel wurden geprüft. Schlüsselkennungen wechseln bei Rotation. Der alte Schlüssel wird sofort ungültig. Protokolle und Statusdaten enthielten keine geprüften Klartextschlüssel. Eine automatische zeitliche Ablaufregel ist nicht eingerichtet; Gültigkeit wird durch Sperre, Rotation und Widerruf gesteuert. Administrator und Anwendungsschlüssel bleiben getrennt.

## 6. Anwendungserstellung

„Neue Anwendung vorbereiten“ und „Client erstellen“ wurden mit den echten Dashboard-Handlern gegen eine isolierte API geprüft; zusätzlich wurde im tatsächlichen Browser ein Prüfclient angelegt, die vollständige einmalige Anzeige bestätigt und danach ausgeblendet, ohne den Schlüssel in Tool-Ausgaben zu veröffentlichen. Dieser Prüfclient sowie die beiden praktischen API-Prüfclients wurden anschließend archiviert. Keine bestehenden Zugänge wurden gelöscht.

Freie Namen und konfigurierbare administrative Client-Grenzen bleiben erhalten. Es gibt keine Vier-Programme-Begrenzung und keine Bindung an einen Programmtyp. „Konfiguration ohne Geheimnis exportieren“ erzeugt eine JSON-Datei mit Modell, tatsächlichem Port, Rolle, Freigaben, Limits und **Schlüsselplatzhalter**.

## 7. Client-Berechtigungen

401 ohne/für falschen Schlüssel, 403 bei Admin-Zugriff mit einem Inferenzschlüssel sowie getrennte Client-Statusdaten sind bestätigt. Modell-, Funktions-, Rollen-, Anfrage-, Parallelitäts-, Token-, Kontext-, Tagesbudget- und Prioritätsregeln bleiben aktiv. Rotation und Widerruf von Testclient A ließen Testclient B weiterarbeiten. Nach Neustart blieb A gesperrt und B gültig. Die ursprünglichen Administrator- und Agent-3-Konfigurationseinträge wurden unverändert erhalten.

## 8. Modelle und Worker

Produktiv ist ein lokaler Haupt-Worker mit `qwen2.5:1.5b`, vier CPU-Threads und Kontext 4096 bereit. Das installierte GGUF blieb unverändert; kein neues Modell und kein weiterer Modellserver wurden installiert.

Isolierte native Prüfungen bestätigten Modellstart, SSE-Nutzungsdaten, Stoppen/Entladen, erneuten Start, Abbruch aktiver und wartender Anfragen sowie anschließende Nutzbarkeit desselben nativen Prozesses. Die Worker-Prüfung registrierte isolierte Testworker, lud zwei echte native Prozesse, prüfte CPU-/RAM-Zulassungsgrenzen und einen gezielten Absturz des eigenen sekundären Testprozesses: dessen Anfrage scheiterte ohne Replay, der primäre Auftrag blieb erfolgreich und der sekundäre Worker erholte sich. Produktive Worker wurden dafür nicht absichtlich zum Absturz gebracht.

## 9. Ressourcenverwaltung

Alle elf sichtbaren Ressourcenfelder wurden nach Login befüllt. Die echten UI-Speicherhandler wurden gegen isolierte Konfiguration geprüft; gespeicherte Werte wurden in einem frischen Prozess identisch eingelesen. CPU, RAM, Kontext, Reserven und Notentladung wurden nicht zu unbegrenzter Parallelität umgedeutet. Das produktive Profil blieb byteidentisch.

Aktuelle Grenzen: vier CPU-Threads, 65 % RAM-Anteil, 2048 MiB Systemreserve, Notentladung unter 512 MiB freiem RAM, maximaler Kontext 4096, Gateway-Konfiguration zwei Slots, effektive Parallelität mit einem bereiten Worker **eins**, Warteschlange 16, HTTP-Grenze 64, Zeitlimit 120 Sekunden, bis zu 16 Workerdefinitionen und 1000 Clientdefinitionen. Auf anderer Hardware werden CPU-/RAM-Werte neu ermittelt; Ressourcenprofile sind portabel. Faire Warteschlangen und kontrollierte Überlastabwehr wurden mit begrenzten Fixtures erneut geprüft.

## 10. Backup und Restore

Vor Änderungen wurde das verschlüsselte Bestandsarchiv `d4ac4954-e9d9-46d5-865c-11f9df572ec0` erstellt und einschließlich SQLite-Integrität verifiziert. Die abschließende Sicherung und isolierte Wiederherstellung sind unter `finalBackup` in der Prüfdatei dokumentiert. Modellgewichte wurden nicht unnötig erneut vervielfältigt; das vorhandene verifizierte Modellarchiv aus Sitzung 6 bleibt erhalten.

Regressionen bestätigten AES-GCM, falsches Passwort/manipuliertes Archiv ablehnen, bestehende Restoreziele nicht überschreiben, Konfigurations-/Vollsicherung, Datenbankprüfung, Download-Ticket, verschlüsselten Import und erneute Verifikation. Modellgewichte bleiben optional einschließbar. Der Wiederherstellungsschlüssel wird getrennt gehalten.

Eine isoliert wiederhergestellte API wurde tatsächlich für die **Zugangsprüfung** gestartet: Original-Anwendungs- und Administratorschlüssel authentifizierten erfolgreich, falscher Schlüssel ergab 401. Zugangsdatei und Admin-Schlüsseldatei blieben exakt erhalten; es wurden keine Ersatz-Zugangsdaten erzeugt. In dieser restaurierten Prüfkopie wurde kein weiterer nativer Modellstart durchgeführt; echte Inferenz wurde getrennt an der laufenden API geprüft. Keine produktiven Daten wurden durch ein Archiv ersetzt. Sicherungsplanung bleibt produktiv ausgeschaltet.

## 11. Netzwerk und TLS

Bindung bleibt `127.0.0.1`, Gateway-TLS und Remote-Administration bleiben im bisherigen lokalen Profil deaktiviert; keine öffentliche Freigabe. TLS-/Netzwerk-Regressionen bestätigten sichere Konfigurationsablehnung und passend geprüftes Zertifikat/Privatschlüssel-Paar, ohne Profilaktivierung. Remote-Fixtures bestätigten Abbrucherkennung, authentifizierte Wiederverbindung, persistente Deduplizierung und expliziten Timeout 504 ohne automatische Wiederholung.

Vorbereitung für zweite Maschine: tatsächliche private IP oder Domain, passender TLS-SAN, unabhängig geprüfte öffentliche CA, eigenes Client-Geheimnis, enges erlaubtes Quellnetz und separat genehmigter Portzugriff. Keine Firewall-, Truststore- oder globalen PowerShell-Richtlinienänderungen. Anleitung: [Zwei Rechner verbinden](network-two-computers.md). Ein freigegebener zweiter Rechner wurde nicht bereitgestellt.

## 12. Ergebnisse echter KI-Anfragen

Zwei getrennte praktische Testzugänge sendeten gleichzeitig Anfragen an denselben vorhandenen lokalen Worker. Eine vollständige JSON-Antwort enthielt nicht leeren Modelltext und zehn tatsächliche Ausgabetokens. Nach Widerruf von A und API-Neustart lieferte B nochmals eine echte kurze Modellantwort. Beide alten Bestandszugänge blieben erhalten. Diese Tests liefen auf Agent-2, **nicht** auf zwei Computern.

## 13. JSON, Chat-SSE und Core-Ereignisse

Chat-JSON und SSE waren HTTP 200. Der native Stream enthielt Antwortteile, tatsächliche Nutzungsdaten und `[DONE]`, ohne Fehlerframe. Eine überhöhte Ausgabetokenanforderung wurde mit 400 abgewiesen.

Für Core-Aufgaben fehlte bisher ein wirklicher Ereignisstream. `GET /api/core/tasks/<ID>/events` ist jetzt vorhanden und im Dashboard angebunden: eigentümergeschützte, promptfreie Status-Snapshots, begrenzte Streams, Heartbeats, terminale Ereignisse, Beobachtungsdeadline und sofortige Begrenzung langsamer Empfänger. Widerruf/Rotation beendet laufende Streams mit 401; entzogene Rollen/Freigaben mit 403. Fremde Aufgaben liefern 404. Beobachtung führt keine Aufgabe aus, setzt keine Aufgabe fort und spielt keine Aktionen erneut ab.

Core-Auftragserstellung, Status, Abbruch, Checkpoint-Wiederaufnahme, Rechte, Vorschlagsprüfung und Crash-Reconciliation wurden mit kontrollierter Inferenzattrappe isoliert geprüft. Der Dashboard-Ereignisleser empfing zusätzlich echte HTTP-SSE-Statusereignisse aus einer isolierten API. Eine allgemeine Qualitätsabnahme autonomer Reparaturen mit dem kleinen nativen Modell wurde nicht behauptet.

## 14. Noch vorhandene Fehler und Grenzen

In der geprüften lokalen API-/Admin-Nutzung ist kein kritischer blockierender Fehler offen. Erwartete negative Tests (401/403/429/503/504) sind erfolgreiche Abweisungsprüfungen und keine unbehobenen Dienstfehler. Historische Nutzungs-/Fehlerzähler wurden erhalten.

Der direkte Befehl `npm run windows:status` wird unter der vorhandenen restriktiven PowerShell-Skriptausführung dieser Shell blockiert. Die Dashboard-Statusfunktion im bereits bestehenden Dienstkontext funktioniert; die Aufgabe wurde zusätzlich mit genehmigter nativer Leseabfrage bestätigt. Es wurde kein Bypass erzwungen und keine Richtlinie geändert. Dieser CLI-Umgebungsfall bleibt außerhalb der normalen Dashboard-Bedienung zu beachten.

## 15. Nicht durchführbare Hardwaretests

Offen: echter zweiter Computer, physisches externes Sicherungsmedium, echter Stromausfall, physischer RAM-Mangel, GPU-/Linux-Betrieb und hohe Nutzerzahlen. RAM-Schutz wurde durch kontrollierte Signale und konservative Zulassung geprüft, nicht durch absichtliches Füllen des produktiven Rechners. Die Native-Worker-Absturzprüfung betraf ausschließlich eigene Testprozesse. Kein zusätzlicher Windows-Task wurde installiert. Es gibt keine entsprechende pauschale Produktions-/LAN-Freigabe.

## 16. Git-Sicherung und Endkontrolle

Geprüfter Codecommit: **`d487f67`**. Dieser Abnahmebericht, README und sanitierte Nachweise werden im folgenden lokalen Dokumentationscommit gesichert. Dessen ID und der nach der Sicherung kontrollierte Arbeitsbaumstatus werden im Sitzungsabschluss sowie im lokalen Abschlussbeleg `scratch/session8-git-completion.json` angegeben. Damit muss kein Commit seine eigene, erst danach bekannte ID enthalten. Private Konfigurationen, Schlüssel, Datenbanken, Modellgewichte, Testverzeichnisse und Screenshots bleiben unter ignoriertem `scratch` und außerhalb Git.

Bestanden: `npm run build`, finale Dashboard-Syntax, `test:session8`, Core-Workflow-, native Runtime-, Worker-, Plattform-/Fairness-, Backup-/TLS- und Remote-Ausfallregressionen sowie der praktische Zwei-Client-Test. Der bisherige Sitzung-7-Test wurde von einer fest codierten Versionsnummer auf die tatsächliche Paketversion umgestellt. Der allgemeine alte `npm test`-Sammellauf mit möglichen fremden Projekt-/Deployment-Demos wurde nicht ausgeführt.

## 17. Praktische Einsatzbereitschaft und nächste Schritte

**Ja, AMU-Agent-2 ist lokal für die erste kontrollierte Anwendungsanbindung einsatzfähig.** Die vorhandene Admin-Anmeldung, Anwendungsregistrierung, individuelle Schlüssel, lokale native KI sowie JSON und Streaming sind praktisch nachgewiesen. Die neue Browseransicht zeigt den angemeldeten Administrator und echte Betriebsdaten.

Für eine eventuelle abschließende Sitzung 9 verbleiben gezielt: genehmigten zweiten Rechner bereitstellen und TLS-/Quellnetz-/Portkonfiguration samt JSON/SSE und Rechteprüfung von dort abnehmen; getrenntes Sicherungsmedium rücklesen/importieren; bei Bedarf den erwähnten CLI-PowerShell-Umgebungsfall klären. Weitere Modelle, Cluster oder allgemeine Leistungsoptimierungen sind dafür nicht Voraussetzung und wurden nicht begonnen. Andere AMU-Projekte blieben unverändert.

Abschließender Sicherungsnachweis: `861457bb-55e4-4c02-805d-bba9305c8dfd`, 241 Dateien, 4335225 Bytes, AES-256-GCM, SHA-256 `525e12edac50157b4a54a05fe7a0584934e98198d8800e1433d8580bceb2053f`. Authentifizierte isolierte Wiederherstellung und SQLite-Prüfung bestanden; produktive und restaurierte Zugangsdatei sind identisch. Modellgewichte bleiben im oben genannten bestehenden Modellarchiv erhalten.
