# Sitzung 7 – Abschluss der notwendigen Kernplattform

Version **1.6.1**, Ausgangscommit `7803d2c` (1.6.0). Der Abschlusscommit wird über `git log -1` ermittelt und im Sitzungsabschluss genannt. Nur AMU-Agent-2 wurde bearbeitet. Bestehende Funktionen, Datenbanken, Gewichte, Zugänge und frühere Sicherungen bleiben erhalten.

## Ergebnis und Betriebsbereitschaft

**Ja: AMU-Agent-2 ist für eine erste kontrollierte praktische Anbindung bereit.** Die API und die native KI funktionieren lokal mit bestehenden Client-Zugängen. **Eine produktive Verbindung zu einem anderen Computer ist noch nicht nachgewiesen.** Dafür fehlen ein ausdrücklich freigegebener zweiter Rechner, dessen tatsächliche Client-IP/Domain-Konfiguration und die genehmigte Netzfreigabe. Loopback kann nur auf Agent-2 selbst verwendet werden.

Die Entwicklung der Kernplattform pausiert nach diesem Abschluss. Kein Cluster, keine zusätzlichen KI-Funktionen und keine Änderungen an AMU WEB, AMU SYSTEM, Agent-3 oder anderen Projekten wurden begonnen. Der nächste praktische Schritt ist die gezielte Erstanbindung einer AMU-Anwendung, sobald deren Entwicklung beziehungsweise Rechnerzugriff ausdrücklich beauftragt wird.

## Ergänzungen dieser Sitzung

- Der bestehende Verbindungstest akzeptiert jetzt eine private HTTPS-IP **oder Domain**. DNS wird vor dem Lesen des Schlüssels einmalig aufgelöst. Alle Ergebnisse müssen privat beziehungsweise Loopback sein; gemischte öffentliche/private Antworten werden abgewiesen. Der Socket verwendet das geprüfte Ergebnis, während TLS weiterhin den ursprünglichen Domainnamen/SAN und die CA kontrolliert. Kein Abschalten von Zertifikatsprüfung und keine Generierungs-Retries.
- Client- und allgemeine Verbindungsprofile verwenden den tatsächlichen Listening-Port der Anfrage. Die bisherige feste Angabe `3030` war bei abweichender Portkonfiguration falsch.
- Die vorhandene Verwaltungsoberfläche zeigt eine verständliche Betriebsübersicht und eine kurze Einrichtungsanleitung. Bestehende Bereiche für beliebig benannte Anwendungen, Rechte, Limits, Schlüsselrotation/-sperre, Worker, CPU/RAM, Aufträge, Protokolle und Backups bleiben erhalten. Es gibt keine Begrenzung auf vier Programme; der konfigurierte Schutzwert beträgt derzeit 1000 registrierte Zugänge einschließlich Administrator.
- Verifizierte verschlüsselte Backups können mit einem geprüften Exporthelfer in einen neuen Ordner auf einem getrennten Medium kopiert werden. Bestehende Archive werden nicht überschrieben; Schlüssel werden getrennt gehalten.
- Ein manueller Offline-**Programmcode**-Rollback besitzt Vorschau, Hash-Bestätigung, Vertragsprüfung, erhaltene Originale, Schrittjournal, Startsperre und einen getrennt erhaltenen Rücknahmehelfer. Aktuelle Laufzeitdaten bleiben erhalten. Eine automatische produktive Datenbankwiederherstellung wird nicht aktiviert.

Bedienung: [Manuelle Wiederherstellung und getrennte Sicherung](operations/manual-recovery.md), [Zwei-Rechner-Einrichtung](network-two-computers.md). Bestehende Architektur und zuvor bestätigte Funktionen: [Sitzung 6](session6-platform.md).

## Tatsächlich geprüfte Funktionen

Sanitierte Nachweise: [Abschlussprüfung](verification/2026-10-24-session7.json).

| Prüfung | Nachweis dieser Sitzung |
|---|---|
| Typprüfung / Build | TypeScript erfolgreich; `npm run build` erfolgreich |
| Native lokale KI | Bestehender Agent-3-Schlüssel, echte JSON-Modellantwort, HTTP 200 |
| SSE | Echte native Chunks, Nutzungsdaten und `[DONE]`, HTTP 200 |
| Authentifizierung | Ohne Schlüssel 401; Inferenzschlüssel auf Dashboard 403 |
| Anwendungstrennung | Fünf unabhängige Fixture-Anwendungen, fremde Verwaltungs-/Verbindungsdaten 403, eigener Status ohne fremde Client-ID |
| Überlastschutz | Deterministisch eine aktive, eine wartende, dritte Anfrage 429; nach Freigabe wird wartende Arbeit verarbeitet; kein Lasttest |
| Neustart | Kontrollierter Neustart der bestehenden API über ihren Supervisor; neue API-PID, Version 1.6.1, Worker wieder bereit; Zugangsdatei byteidentisch |
| Dashboard | Browser-Anmeldung und sichtbarer Bereitschaftsstatus; Script/Elementreferenzen und API-Payload geprüft |
| Domain / TLS | Echte TLS-Verbindung auf Loopback mit gepinnter Fixture-DNS-Auflösung und passendem SAN; falscher Name abgewiesen; öffentliche/gemischte DNS-Antworten abgewiesen |
| Backup / Restore | Vorab verschlüsselte Bestandssicherung verifiziert; zusätzlich Fixture-Vollsicherung authentifiziert, SQLite `quick_check` erfolgreich, isolierte Wiederherstellung ohne Änderung aktueller Daten |
| Export / Rollback | Exporthash und Nichtüberschreiben; kontrollierte Code-Übernahme, Rücknahme, beschädigte/stale Pläne, Abbruch-Recovery und Startsperre in isolierten Fixtures |

Der bereits in Sitzung 6 bestätigte native Prozessabsturz-/Wiederanlauf, Remote-Reconnect, dauerhafte Deduplizierung, faire Prioritätsverteilung und Ressourcenbegrenzung wurden erhalten. Sie wurden nicht erneut in vollständigen Testschleifen ausgeführt. Diese Sitzung prüfte den produktiven **geplanten** Neustart; sie löste keinen absichtlichen Absturz des produktiven KI-Prozesses aus. Die Belastungs-/Warteschlangenprüfung verwendet einen kontrolliert blockierten Fixture-Generator; die echte Modellinferenz wurde getrennt lokal geprüft.

## Tatsächlicher Betriebszustand

- API: `http://127.0.0.1:3030`, `/health` und `/ready` erreichbar, Version 1.6.1, Backend `amu-embedded-llama.cpp`.
- Ein produktiver lokaler Haupt-Worker, Modell `qwen2.5:1.5b`, vier CPU-Threads, Kontext 4096. Keine produktiven Remote-Worker registriert. Es ist kein Ollama-/Cloud-Inferenzdienst erforderlich. Fremde laufende Dienste wurden nicht entfernt.
- Zwei vorhandene Zugänge: Administrator und AMU-Agent-3. Agent-3-Zugang weiterhin gültig. Weitere Namen wurden nur im isolierten Test angelegt; keine unbenutzten produktiven Schlüssel erzeugt.
- Gateway-Konfiguration zwei Slots; effektive Parallelität mit einem bereiten Worker eins; Warteschlange 16, HTTP-Grenze 64, Zeitlimit 120 Sekunden. CPU-/RAM-Reserve und native Prozessisolation bleiben aktiv.
- Verschlüsselte Sicherungsplanung und Aufbewahrung vorhanden, produktiv weiterhin ausgeschaltet. Keine älteren Archive gelöscht. Der vor Änderungen verifizierte Wiederherstellungspunkt ist `0caa4727-920f-4b4f-9228-19d1ab0775b8` (219 Dateien, ohne Modellgewichte). Das vollständig verifizierte Modellarchiv aus Sitzung 6 `83d5fc61-9352-4770-b740-c9d4e9254167` bleibt erhalten. Abschlussarchiv: `6582d70f-bacd-446d-b6da-8ed06bee6f77`, 230 Dateien, 2834220 Bytes, SHA-256 `c0ed1c3e84f44244d19c7b598cb03e0deece2e273591fd8b2b4c911c186db256`. Authentifizierte isolierte Wiederherstellung mit erfolgreicher SQLite-Prüfung unter `scratch/restores/79887913-9a16-401a-88ef-9c715bffa931`; keine Aktivierung. Der CLI-Export dieses tatsächlichen Archivs nach `scratch/backups/exports` bestand ebenfalls den Hashvergleich, weiterhin nur auf derselben lokalen Platte.
- Kein LAN-Bind, keine TLS-Aktivierung für den Gateway, keine Firewall-/Zertifikatsspeicheränderung. Die private Domain-Vorbereitung ist kein Nachweis eines echten Firmen-DNS oder einer zweiten Maschine.

## Grenzen und nächste praktische Schritte

1. Agent-3 auf einem ausdrücklich freigegebenen zweiten Rechner mit eigener Schlüsseldatei, geprüfter öffentlicher CA und tatsächlicher privater HTTPS-IP/Domain konfigurieren. Zertifikat-SAN, Quellnetz und ausdrücklich genehmigten Portzugriff prüfen. Danach einmalig Modelle, JSON, SSE und Client-/Admin-Trennung von diesem Rechner abnehmen. Agent-3 wurde hier nicht verändert.
2. Ein getrenntes Sicherungsmedium bereitstellen, eine verifizierte Sicherung exportieren und dort rücklesen/importieren. Genügend Speicher und den getrennten Wiederherstellungsschlüssel vorhalten. Auf C: waren vor Sitzung 7 nur ungefähr 6 GiB frei; vorhandene Modelle wurden deshalb nicht nochmals unnötig vervielfältigt.
3. Sicherungsplan und Aufbewahrung bewusst entsprechend verfügbarer Kapazität aktivieren. Ohne aktivierten Plan entsteht keine automatische regelmäßige Sicherung.

Nicht geprüft/freigegeben: produktive Zwei-Computer-Anbindung, physischer externer Datenträger, echter Stromausfall, produktiver Datenbank-Rollback, Linux-Dienstinstallation oder hohe Nutzerzahlen. Das kleine lokale 1.5B-Modell bestätigt den technischen Betrieb, keine allgemeine Qualität für komplexe autonome Programmieraufgaben. Größere Modelle, weitere Server und umfassende Leistungsoptimierung bleiben bis zu tatsächlichem Bedarf zurückgestellt.
