# Sitzung 25 – Hypervisor aktiv, Dienste wiederhergestellt, modernes WSL bereit

Sitzung: 27./28.10.2026 (Europe/Berlin). Ausgangsstand 1.22.0 / 4e339ba, Git zunächst sauber. Neuer Quellstand 1.23.0; endgültiger Commit, Ressourcen und Installationsstatus werden in scratch/session25-closeout.json festgehalten. Laufender Quellprozess wurde nicht manuell neu gestartet.

## Tatsächlicher Zustand nach Windows-Neustart

- Windows meldet letzten Boot am 27.10.2026 um 23:17:32 MEZ. HypervisorPresent ist jetzt true, VMP und WSL sind aktiviert. Rohwerte für Firmwarevirtualisierung/SLAT sind unter dem laufenden Hypervisor false; das ist kein neuer bewiesener Firmwaredefekt. Der Vorbereitungsplan akzeptiert nun den positiven Hypervisornachweis und warnt vor verdeckten CPU-Merkmalen, ohne daraus eine Linux-/Containerabnahme abzuleiten. Bei unbekanntem oder fehlendem Hypervisor bleiben fehlende Firmwaremerkmale weiterhin blockierend.
- AMU AI startete über die vorhandene Anmeldeaufgabe automatisch als Runtime 1.22.0 und lud das vorhandene lokale Qwen2.5-1.5B. Keine Modellinstallation und keine Cloud-Anbindung vorgenommen.
- WEB Port 4310 und XAMPP/MySQL waren nicht gestartet. WEB wurde über seinen unveränderten scripts/local-start.mjs --no-browser, MySQL über C:\xampp\mysql_start.bat wiederhergestellt. Beide laufen verborgen weiter. WEB-Starter hat wie vorgesehen eine neue Vor-Start-SQLite-Sicherung im bestehenden WEB-Backupverzeichnis erzeugt; keine vorhandene Sicherung überschrieben. Kein neuer Windows-Dienst oder Autostart eingerichtet. Keine WEB-Quelldateien geändert.
- MySQL meldet über mysqladmin ping: mysqld is alive. Bestehende Warnung zur abgekürzten key_buffer-Option wurde nicht durch eine Änderung an my.ini behoben. Kein SQL-Import und keine Tabellenänderung veranlasst.

## Tatsächlich freigegebener und ausgeführter WSL-Schritt

Der Eigentümer genehmigte ausschließlich wsl.exe --update --web-download. Ausführung über normalen Windows-UAC-Dialog, Exitcode 0. Danach tatsächlich gelesen:

- WSL 3.0.3.0
- Kernel 6.18.54.1-1
- wsl --status erfolgreich, Standardversion 2
- zunächst weiterhin keine installierte Distribution

Kein Windows-Neustart ausgelöst, keine weitere Windows-Funktion/Boot-/Firewall-Einstellung geändert. Die offizielle Laufzeit enthält auch ihre WSLg-/Systemkomponenten; das ist keine installierte Ubuntu-Runner-Distribution. C: fiel zwischen Bestandsaufnahme und Nachprüfung von etwa 24,9 auf 21,8 GiB frei. Das ursprüngliche 1-GiB-Budget war eine Schätzung, keine gemessene Paketgröße; nicht der gesamte Unterschied wird ohne Prozessbeleg WSL zugerechnet. Keine Dateien zur Kompensation entfernt.

Microsoft dokumentiert den WSL-Updateweg für bestehendes WSL: [WSL-Versionen](https://learn.microsoft.com/en-us/windows/wsl/wsl2-about), [Befehle](https://learn.microsoft.com/en-us/windows/wsl/basic-commands). Laufender Hypervisor und nicht mehr angezeigte rohe Hardwarevoraussetzungen: [Microsoft Hyper-V-Anforderungen](https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/host-hardware-requirements).

## Linux-Schritt als separater Freigabegegenstand

Konkreter Plan scratch/session25-linux-approval.md und vorbereitetes, per PowerShell-AST geprüftes Skript scratch/session25-install-linux.ps1. Nur nach gesonderter Antwort ausführbar. Vorgesehen ist offizielles Ubuntu 24.04.5 LTS WSL AMD64 unter C:\AMU-Runner\WSL\AMU-Runner, Image unter C:\AMU-Runner\Install. Erwarteter SHA-256 bb415d824822c4b878125729af451a5d18fb13d1cf5cbed9a7393ad64ac6039e aus offizieller HTTPS-Checksummliste. Ein Hash-Sollwert ist noch kein heruntergeladenes und geprüftes Image.

Neue globale .wslconfig nur falls keine vorhanden: 4 GiB RAM, 2 CPUs, 1 GiB Swap auf C:, GUI aus. Die Wirkung ist WSL-weit, aktuell gibt es keine anderen Distributionen. Dynamisches 16-GiB-VHDX ist eine Kapazitätsgrenze, keine sofortige Belegung; Windowsreserve dennoch laufend prüfen. Neuer gesperrter amu-runner-Benutzer ohne sudo/docker, systemd, keine Windows-Automounts/fstab oder Interop. Einmaliger vertrauenswürdiger Hersteller-/Root-Provisionierungsschritt vor der Härtung darf nicht als bereits isolierter Projektlauf gelten. Danach ausschließlich diese neue Distribution neustarten und Hostgrenzen prüfen. Kein apt/Docker/Node/mTLS/Containerimage in dieser Freigabe enthalten.

Image/Rootfs/Swap werden vorläufig mit 2–4 GiB geplant, C: könnte danach auf etwa 18–20 GiB frei fallen. Der Eigentümer wird darüber ausdrücklich vor Zustimmung informiert. 20 GiB war die freie Startreserve vor Linuxinstallation, keine Behauptung verbleibender 20 GiB nach allen Paketen. Unter 16 GiB keine weiteren Installationen beginnen. HDD und USB bleiben ausgeschlossen. Keine Dateien löschen oder vorhandene Distribution/Global-Konfiguration überschreiben. Bei Abweichung anhalten.

Offizielle Herstellerquellen: [Ubuntu-WSL-Installation](https://ubuntu.com/wsl/docs/stable/howto/install-ubuntu-wsl2/), [Ubuntu-SHA256SUMS](https://releases.ubuntu.com/24.04/SHA256SUMS). Das alte Cloud-Images-24.04-Rootfs von 2024 und ein zusätzliches ISO werden nicht parallel verwendet.

Der tatsächlich zum Abschluss erreichte Freigabe-/Ausführungsstatus steht in scratch/session25-closeout.json; nur ein zusätzliches session25-linux-result.json mit erfolgreichem Exitcode belegt eine ausgeführte Installation/Hostgrenzenprüfung. Auch dann noch keine Containerabnahme.

## Tests, Wiederherstellung und Grenzen

- Gezielte session25-hypervisor.test.mjs und bestehende session17-setup.test.mjs bestanden: verdeckte CPU-Merkmale bei aktivem Hypervisor, unbekannte/fehlende Hypervisoren weiterhin gesperrt, altes WSL weiterhin gesperrt, keine Installationsfreigabe aus Inventar.
- TypeScript noEmit bestanden. PowerShell-Installationsvorbereitung nur geparst, daraus kein Ausführungserfolg abgeleitet.
- Live 1.22.0: Authentifizierung 401 ohne Schlüssel / 200 mit Schlüssel, bestehende Qwen-Antwort und SSE bis DONE bestanden. Clientzugriff auf Administration 403. Sechs vorbereitete Profile tatsächlich geladen, automatische Downloads false; 7B nicht installiert, native Funktionsaufrufe nicht freigegeben, Projektausführung weiterhin false.
- Erster Modell-Prüflauf wurde durch ECONNRESET unterbrochen. Supervisorjournal belegt Heartbeat-Timeout um 23:25:50 MEZ und automatischen Prozessneustart um 23:25:58 MEZ. Keine Ursache allein aus diesem Ereignis behauptet, kein manueller Neustart und kein Watchdog-Limit gelockert. Wiederholte notwendige Prüfung nach tatsächlicher Wiederherstellung erfolgreich.
- WEB: unveränderte Quellhashes und genau zwei Hauptkarten (Meine Websites; E-Mail & Kommunikation), drei Websites/drei Seiten/drei Versionen, zwei Mailboxen/sechs Nachrichten erhalten; SQLite quick_check ok, Home/Admin 200. Kein externer Mailversand-/interaktiver Login-Test behauptet.
- Aktueller 17-Dateien-Runner-Handoff vorbereitet und Integrität geprüft: Manifest-SHA-256 74350e50317e1bc4b1bcf6709c58fdf9cc1b27117a0ccf10a74747985c76d10d. Kein Transfer, kein Dockerstart, kein echter Build-/Unit-/Integrationstest daraus abgeleitet.
- HDD-Identität aus geschützter Policy erneut lesend bestätigt, C: dem internen Intel-SSD-Datenträger 0 zugeordnet. Keine HDD-/USB-/AMU-SYSTEM-Dateien verändert. Verzeichnis-/Installationsfreigaben entstehen nicht aus der Bestandsaufnahme.
- Vorhandene geprüfte Sicherungen aus Sitzung 24 vollständig erhalten: AI 9f524dfa-e5dc-4191-b712-8112e17b5b3e; Wiederanlaufergänzung 9ce7d47e-22ca-4d5b-905e-bf4a75b7d7e5 (WEB/SQL/config); zusätzliche Vollsicherung 9fd6f938-6503-432a-9cfc-07f179c18a8c separat im kurzen Pfad authentifiziert und alle Datenbanken geprüft. Letztere normale API-Prüfung blieb wegen langen Prüfdatenbankpfads fehlgeschlagen; keine Umdeklaration. Kein echter SQL-Wiederherstellungstest. Neue source-only Sicherung separat im Abschlussnachweis; keine Gewichtskopie.

## Nächste reale Abnahme

Nach bestätigtem Linuxstart separat Node 24, Rootless-Docker-Pakete und verifiziertes minimales Image genehmigen. systemd/cgroup v2 und tatsächlich delegierte CPU-/RAM-/PID-Limits prüfen; rootful Dienst nicht stillschweigend als Ersatz einschalten. Bestehende AMU-Hostgrenzen, mTLS-/Zertifikatsverwaltung, Registrierung, Transfer und Freigabeworkflows weiterverwenden. Bestehende isolierte Abnahme deckt Limits, fehlendes Netzwerk, Dateischutz, Abbruch/Bereinigung und Mehrdateien-Build-/Unit-/Integration mit Fehler/Korrektur ab; erst nach echter Linuxausführung und unabhängiger Prüfung freigeben. Keine Windows-Hostausführung unbekannter Projekte.

7B unverändert nur vorbereitet: derzeit wäre sein RAM-Schätzwert abdeckbar, aber die zusätzliche 4,36-GiB-Datei unterschritte die noch vorgesehene Runner-Startreserve. Linux hat Vorrang, nach Bereitstellung neu bewerten und Modellinstallation eigens genehmigen lassen. Größere Modelle nicht heruntergeladen.

## Tatsächlich ausgeführter Linux-Schritt nach separater Freigabe

Der Eigentümer genehmigte Ubuntu und die begrenzte Linux-Einrichtung. Offizielles Image heruntergeladen: 388.975.696 Byte; SHA-256 stimmt mit dem oben genannten Herstellerwert überein. AMU-Runner wurde als WSL2-Distribution unter dem genehmigten C:-Pfad registriert, dynamisches VHDX mit 16-GiB-Grenze. Neue .wslconfig mit 4 GiB / 2 CPUs / 1 GiB Swap und ausgeschalteter GUI angelegt. Keine vorhandene Konfiguration überschrieben. Ubuntu meldet tatsächlich 24.04.5 LTS; kein zusätzliches ISO oder Desktop installiert.

Erster Provisionierungslauf: Windows-Pipeline fügte dem Abschluss der Shell-Here-Document eine CR-Zeile hinzu. Die neue wsl.conf enthielt deshalb eine zusätzliche CONF-Zeile. Tatsächlich gelesen, Original als Root-Kopie erhalten und ausschließlich diese neu erzeugte Konfiguration mit LF-genauer Byteübertragung korrigiert. Keine Neuinstallation, kein neues Benutzerkonto nach der ersten Anlage und keine Original-Projektdateien angefasst.

Die strenge vorhandene AMU-Prüfung fand danach zwei echte WSL-Hostbrücken trotz deaktivierter Automount-/Interop-Konfiguration: eine schreibgeschützte 9p-Treiberfreigabe unter /usr/lib/wsl/drivers und die registrierte PE-/init-Interop. Die Sicherheitsprüfung wurde nicht gelockert. Der neue Linux-Systemdienst amu-wsl-boundary.service entfernt ausschließlich diese bekannten Brücken vor multi-user.target und nach systemd-binfmt.service. Das Skript verweigert unbekannte Mountarten, Quellen oder Interpretersignaturen; kein erzwungenes/lazy Unmount, keine pauschale Unmountaktion. Dieser Dienst gehört nur zur neuen CPU-Runner-Distribution; Windows-Dienste/Windows-Treiber wurden nicht verändert. GPU-/Windows-Interop ist in dieser Distribution absichtlich nicht verfügbar.

Nach gezielten Neustarts ausschließlich dieser neuen Distribution tatsächlich bestanden:

- Benutzer UID/GID 1000 amu-runner, nur eigene Gruppe, keine sudo/wheel/docker-Gruppe.
- PID 1 systemd, cgroup2fs.
- Schutzdienst enabled und active; keine 9p-/drvfs-Mounts und keine WSLInterop-Registrierung mehr nach Distribution-Neustart.
- Existierender AMU assertHostBoundaryObservation-Validator gegen frisch aus Linux gelesene Werte erfolgreich, keine synthetischen Linuxdaten verwendet.
- Zwei tatsächliche virtuelle CPUs; /proc/meminfo MemTotal 4.013.076 KiB, SwapTotal 1.048.576 KiB. Linux-Kernel-/VM-Overhead erklärt den nutzbaren RAM unterhalb nomineller 4 GiB.
- Linux-nativer privater Zustandsordner /home/amu-runner/private/state, Eigentümer 1000, Modus 700.
- Shell-Syntax und systemd-Unit mit Linux-eigenen Verwaltungswerkzeugen geprüft. Keine Projekt-Unit-/Buildtests auf dem Linux-Host ausgeführt.

Belege: scratch/session25-linux-result-corrected.json, session25-linux-host-validation.json, session25-linux-boundary.log. Ursprünglicher fehlgeschlagener Bericht bleibt unverändert erhalten. Docker, Node 24 in Linux, Containerimage, mTLS-Runnerdienst und echte Container-/Coding-Abnahme fehlen weiterhin und wurden nicht stillschweigend nachinstalliert. Linux-Härtung ist keine Containerabnahme. Bestehende zentrale Projektausführung bleibt gesperrt.

Die neue Schutzdienstvorlage und ihr eng begrenztes Skript werden mit dem bestehenden festen Runner-Handoff ausgeliefert. Die Sitzung-17-/19-Schutzregressionen bestanden nach Erweiterung erneut. Aktueller Handoff-Digest und dateigenaue Konfigurationssicherung stehen im Abschlussnachweis. Windows wurde in dieser Sitzung nicht erneut gestartet.
