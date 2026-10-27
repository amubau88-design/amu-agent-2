# Sitzung 20 – Bestandsschutz, Speicher und USB-Sicherung

Stand 27.10.2026, Projektversion 1.18.0; Ausgangsbasis 1.17.0 / 73c1fb0. Ausschließlich AMU-Agent-2 bearbeitet.

## Verbindliche Eigentümerentscheidung

Die interne HDD kann noch das frühere AMU SYSTEM enthalten. Der Eigentümer untersagt Partitionierung, Formatierung und Überschreiben und prüft zuerst selbst auf einem anderen Computer eine vollständige funktionsfähige Kopie. Keine erneute Löschfreigabe angefordert, keine anderen Projekte oder Computer untersucht.

`config/runner-storage-policy.json` speichert die bereits geprüfte HDD-Identität als Schutzsperre. Die AMU-Speicher- und Runner-Vorbereitung schließt diesen Datenträger aus. Fehlende detaillierte Zuordnung bei aktiver Sperre verhindert eine Ersatzwahl über allgemeine Volume-Angaben. Eine geänderte Sperre macht einen vorherigen Plan ungültig. Dies ist ein Schutz der AMU-Planung, kein globaler Windows-Schreibschutz und keine Garantie gegen andere Programme. Keine Datenträgereigenschaft geändert.

Die frühere Vorgabe 100 GiB ist kein festes Maximum mehr. Ohne Sperre könnte ein später gesondert freigegebener, geeigneter Datenträger auch größer geplant werden. Für die tatsächlich gesperrte HDD wird **kein Installations-/Partitionierungsvorschlag** erzeugt. Alle Pläne bleiben ohne Schreib- oder Installationsbefugnis.

## Tatsächliche Speicherlage

| Datenträger | Befund | Verwendung |
|---|---|---|
| 0 Intel SSDSC2CT120A3, SATA | 120.034.123.776 Byte, GPT, vier vorhandene Partitionen einschließlich Windows C: | C: nur rund 5,6 GiB frei; unter 20 GiB, nicht geeignet für neue Runner-Installation |
| 1 ST1000DM003-1ER162, SATA | 1.000.204.886.016 Byte, MBR; keine von Windows erkannten Partitionen | Mögliche Altdaten; ausdrücklich gesperrt. Nicht zugeordnet ist kein Beweis für leere HDD |
| 2 USB Disk 2.0, USB | 31.142.707.200 Byte (31,14 GB / etwa 29 GiB), eine Partition, E: AMU-BACKUP, exFAT | Vor Kopie 31.136.088.064 Byte frei; nur zusätzliche verschlüsselte Sicherung |

Die USB-Marke Philips ist durch generische Windows-Metadaten nicht unabhängig bestätigt. Keine Vollkapazitäts-Schreibprüfung, kein Geschwindigkeitsbenchmark. Vorhanden waren lediglich Dropbox-Gerätekennung und Windows-Volume-Metadaten; diese bleiben erhalten. Bereits vorhandenes gesundes exFAT benötigt **keine Formatierung**. Keine Daten gelöscht oder verschoben. Originale, Modelle, Datenbanken und Wiederherstellungsschlüssel bleiben lokal.

Es gibt aktuell keinen freigegebenen internen Zielort mit mindestens 20 GiB geeignetem freien Dateisystemplatz. Der USB-Stick wird nicht als WSL-, Container-, Datenbank- oder Swap-Laufwerk verwendet. Eine kostenlose Linux-/Containerlösung bleibt softwareseitig möglich; eine gegenwärtig nutzbare sichere Installation ist damit noch nicht verfügbar.

## Implementiert

- Dauerhafte HDD-Eigentümersperre und deren Durchsetzung in beiden Vorbereitungspfaden.
- Flexible spätere Kapazitätsplanung ohne starre 100-GiB-Grenze; keinerlei automatische Datenträgeraktionen.
- Identitätsgebundener USB-Export (`scripts/export-usb-backup.ps1`): USB-Bus, Nicht-Systemdatenträger, Identitätsfingerprint, eindeutige Partition/Laufwerkskennung, Label und Dateisystem werden direkt vor dem Export geprüft.
- Verschlüsselter Export liest die geschriebene Archivdatei nach Flush vollständig zurück und vergleicht SHA-256, bevor die endgültige Datei veröffentlicht wird. Bestehende Dateien werden nicht ersetzt; Quellarchiv und Schlüssel bleiben lokal. Lesefehler oder Abweichung hinterlassen höchstens einen nicht veröffentlichten Teil-Export.
- Wiederholbares rein lesendes Hardwareinventar; Fakten, ungeprüfte physische Voraussetzungen und bedingte Optionen getrennt dokumentiert: [Hardwarebericht](session20-hardware.md).

## Tatsächliche Prüfungen und Grenzen

Vor Änderungen wurde eine vollständige AES-256-GCM-Sicherung ohne erneute Gewichtekopie erstellt und authentifiziert verifiziert: e09b6280-3dd6-4782-a648-b277d7656b35; SHA-256 e441c535bddc1bd7de8039ac8951b1473918fe057f176f03be9eb8d5211e7b12.

Gezielte Tests betreffen ausschließlich vertrauenswürdige AMU-Schutz-/Exporthilfen und synthetische Metadaten, keine fremden Projekte: USB-Export ohne Überschreiben und ohne Schlüssel, beschädigte Quelle bleibt unveröffentlicht, Zielrücklesen; HDD-Sperre, Planung über 100 GiB, Ungültigkeit alter Pläne und verweigerte Ausweichwahl. Bestehende Sitzung-17-/18-Vorbereitungstests bestanden nach der Änderung. Diese Prüfungen sind kein Linux-Isolationsnachweis.

Live geprüft: lokale Health/Readiness, Authentifizierung, Modellliste und Qwen2.5-1.5B-Streaming bis `[DONE]`. Der bestehende Prozess meldet weiterhin **1.16.0**, obwohl der Quellstand 1.18.0 ist; kein manueller Neustart, keine neue Runtime-Aktivierung. Die neuen Änderungen betreffen externe Vorbereitungs-/Sicherungshilfen. Verwaltung und Berechtigungsprüfung werden gesondert protokolliert. Lokale Belege: `scratch/session20-*-result.json`.

Finale Sicherung, tatsächlicher USB-Exportpfad, Ziel-SHA-256, Rückleseergebnis und Git-Commit werden nach Ausführung im lokalen `scratch/session20-closeout.json` festgehalten. Ein USB-Export ist erst durch `session20-usb-export.json` nachgewiesen. Der Wiederherstellungsschlüssel ist absichtlich nicht auf dem USB-Stick; für Verlust des ganzen Rechners muss dieser separat sicher verwahrt werden. Kein produktiver Restore ausgeführt.

**Kein echter isolierter Runner läuft:** VirtualMachinePlatform aus, kein laufender Hypervisor, keine Linux-Distribution, Docker/Podman nicht vorhanden. Keine Installation/Aktivierung, kein Formatieren, kein Reboot. Folglich kein vollständiger autonomer Entwickeln–Build–Test–Reparatur-Durchlauf abgenommen. Hostausführung unbekannten Projektcodes bleibt gesperrt. TLS-/Runner-Abnahme aus früheren Sitzungen wird nicht durch Planung oder Testfixtures ersetzt.

## Sitzung 21

1. Eigentümer prüft und sichert AMU SYSTEM auf dem anderen Computer eigenständig. Die HDD bleibt bis zu einer späteren ausdrücklichen Entscheidung unangetastet.
2. Geeigneten internen Speicher freigeben oder eine andere bereits vorhandene Linux-Umgebung bereitstellen. Kein Hardwarekauf erforderlich oder beauftragt.
3. Erst dann konkrete Installationspfade, Platzbedarf, Wiederherstellung und nötige Windows-Änderungen/Neustarts vorlegen und gesondert genehmigen lassen.
4. Realen Linux-Runner mit Hostschutz, Containergrenzen und mTLS starten; Abbruch, Ressourcen-/Netzwerk-/Dateigrenzen und Bereinigung tatsächlich abnehmen.
5. Danach ungefährliches Testprojekt vollständig planen, ändern, isoliert bauen/testen/korrigieren und erst nach Adminfreigabe übernehmen.
6. Windows-Patch-/Supportentscheidung sowie physische Netzteil-/Platzprüfung bei späterer Hardwareplanung klären; keine automatische Installation oder Kaufempfehlung als kompatibel behandeln.
