# Sitzung 24 – Neustartvorbereitung und tatsächlicher Runner-Zustand

Stand: 27.10.2026. Ausgangscommit c315ec6, Quellstand 1.21.0; laufende API 1.19.0. In dieser Sitzung keine Windows-Funktion aktiviert, kein Neustart, keine Distribution, Runtime oder Modellgewichte installiert. Neues Vorbereitungspaket: Quellversion 1.22.0. Endgültiger Commit und Ressourcen stehen im Abschlussnachweis scratch/session24-closeout.json.

## Erneut tatsächlich ermittelt

- Windows 10 Pro Build 19045, Xeon E3-1230 V2, 4 Kerne/8 Threads, Firmwarevirtualisierung und SLAT gemeldet. VMP und WSL InstallState 1. HypervisorPresent false. Letzter Boot 28.09.2026, somit kein Boot seit VMP-Aktivierung.
- WSL-Binärdatei vorhanden; altes Inbox-WSL erkennt --version nicht. --status meldet fehlende betriebsbereite VMP; keine Distribution registriert. Docker/Podman nicht installiert. Aktiviertes Windows-Feature ist kein lauffähiger WSL2-/Linux-Nachweis.
- C: etwa 21,4 GiB frei, rund 7,15 GiB freier RAM bei Bestandsaufnahme; dynamische Endwerte separat protokolliert. HDD weiterhin vollständig ausgeschlossen; USB kein Produktionsziel.
- AI Port 3030: Prozess 33856, Supervisor 19212, vorhandene Anmeldeaufgabe AMU-Agent-2 Central AI. WEB Port 4310: Prozess 20644, vorhandener local-start-Elternprozess 6796. Keine neue Autostartaufgabe angelegt. Prozessnummern gelten nur für die Bestandsaufnahme.
- XAMPP mysqld Prozess 12104 läuft standalone; kein zugehöriger Win32_Service ermittelt. Weder stoppen noch automatischen Wiederanlauf behaupten. Lesende Tabellenartenprüfung ergab unter anderem Aria und InnoDB, deshalb kein nur transaktionaler Dump gewählt.
- BCD-Abfrage ohne echten Administratortoken verweigert; Hypervisor-Startwert nicht bestätigt und nicht verändert. Falls nach Boot weiterhin kein Hypervisor: gesonderte administrative Leseprüfung, keine automatische Bootkonfigurationsänderung.
- AI Git anfangs sauber. WEB-Verzeichnis besitzt kein Git-Repository; vorhandene Git-Bundles/ZIP-Checkpoints im übergeordneten checkpoints-Verzeichnis bleiben unverändert. Kein Repository dort initialisiert.

## Sicherungen und tatsächliche Prüfgrenzen

1. AI-Vollsicherung ohne Gewichte-Neukopie über bestehende API: 9f524dfa-e5dc-4191-b712-8112e17b5b3e, SHA-256 3ec3c8b1a4346a495892ffe1135b3813bfc80ae9c61c055a96bfc2a87f515b00; authentifiziert verifiziert, Datenbankintegrität ok. Die alte Runtime 1.19 lässt Root-config aus; Ergänzung unten enthält sie.
2. Separater vollständiger XAMPP-SQL-Dump mit Routinen/Events/Triggern und kurzzeitiger globaler Lesesperre: 1.469.303 Byte. Erfolgreicher mysqldump-Exitcode, keine Datenänderung. Aria und InnoDB berücksichtigt. Keine Zugangsdaten ausgegeben.
3. Verschlüsselte Wiederanlaufergänzung 9ce7d47e-22ca-4d5b-905e-bf4a75b7d7e5, SHA-256 9cb37e2c82f969765c2495774d444faea7a8236bcd1da952f6b29d736525dd03. Enthält WEB-Dateien, konsistente SQLite-VACUUM-Kopie, SQL-Dump und AMU-config. Alte WEB-Backups/Logs/Checkpoints nicht dupliziert und unverändert erhalten. Authentifiziert in neue geschützte Stagingkopie entpackt, kritische Dateien bytegleich gehasht, wiederhergestellte WEB-SQLite integrity_check ok. Kein produktiver Restore; kein SQL-Import-/Starttest durchgeführt. Schlüssel bleibt separat lokal erhalten.
4. Vorhandene Modelle bleiben auf dem bisherigen Datenträger; diese neuen Archive enthalten keine Gewichte. Keine vollständige Bare-Metal-/Datenträgerausfall-Wiederherstellung oder SQL-Wiederherstellbarkeit als real getestet behauptet. Vor Boot keine weiteren Schreibarbeiten beginnen; nach längerer Wartezeit Sicherungen aktualisieren.

## Implementierte wiederverwendbare Prüfung

scripts/check-restart-readiness.mjs session24 wertet aktuelle Dateien unter scratch aus und fragt ausschließlich die lokale /health ab. scripts/lib/restart-readiness.mjs verweigert vollständige Evidenz bei mehr als zehn Minuten alten Inventaren/Sicherungen/WEB-Prüfung, aktiven Anfragen, unpassenden Backup-IDs, fehlender Authentifizierung, beschädigter WEB-Sicherung, falscher Kartenanzahl oder fehlender vorhandener Anmeldeaufgabe. Der Bericht erteilt niemals Neustart-/Installationsfreigabe und startet/stoppt keinen Dienst. Unmittelbar vor einem Neustart erneut prüfen; keine atomare Schreibsperre für externe Clients behaupten. compareRestart unterscheidet geänderten Bootzeitpunkt von bloß aktivierten Features und gibt niemals eine Runner-Abnahme vor.

Die gezielten Fixtureprüfungen session24-restart.test.mjs und TypeScript-Prüfung bestanden. Das sind AMU-Verwaltungsprüfungen, keine isolierten Linux-Projekttests. Live-API mit Schlüssel 200, ohne Schlüssel 401, vorhandene Modellantwort und SSE bis DONE erfolgreich. WEB-Quellhashes unverändert, exakt zwei Hauptkarten, drei Websites/drei Seiten/drei Versionen, zwei Mailboxen/sechs Nachrichten unverändert; SQLite quick_check ok, Home/Admin erreichbar. Kein interaktiver Login-/Mailversandtest behauptet.

## Konkreter Wiederanlaufplan zur separaten Neustartfreigabe

1. Eigentümer speichert alle offenen Arbeiten, insbesondere Codex/Editoren/Browserformulare. Keine neuen AI-/WEB-/XAMPP-Schreibaufträge; unmittelbar vorher Readiness, laufende Aufträge und Sicherungen erneut prüfen. Keine fremden Prozesse zwangsweise beenden.
2. Geordnete Beendigung des vorhandenen WEB-Startfensters über dessen vorgesehenen Strg+C-Weg und XAMPP über dessen normale Stop-Bedienung; erfolgreiche Datenbankbeendigung kontrollieren. Keine Stop-Process-/taskkill-/shutdown-/f-Lösung. Wenn ein Dienst nicht geordnet endet: abbrechen und Ursache klären. Dieser Schritt wurde noch nicht ausgeführt.
3. Nur nach ausdrücklicher Eigentümerfreigabe normaler Windows-Neustart über Startmenü, ohne erzwungenes Schließen. AI, WEB und Codex sind vorübergehend nicht erreichbar; keine Fernfortsetzung während dieses Boots versprechen. Keine Wiederholung oder zusätzlicher Reboot ohne neue Bewertung.
4. Nach Anmeldung als AMU zunächst vorhandene AI-Anmeldeaufgabe abwarten. Sie startet scripts/start-background.ps1 und den vorhandenen Supervisor, der src/index.ts lädt: damit wird der aktuelle Quellstand 1.22.0 aktiv, nicht die bisherige Runtime 1.19.0. Bei Konflikt keinen zweiten Supervisor starten. /health und /ready, Schlüssel, Modellliste, vorhandenes 1,5B-Modell und SSE prüfen.
5. WEB bei freiem Port mit seinem unveränderten AMU_WEB_STARTEN.cmd im bisherigen WEB-Verzeichnis manuell starten. Bestehender Starter sichert die Datenbank und verweigert belegten Port. Kein npm install/build und kein zusätzlicher Dienst. XAMPP nur über seine bisherige Bedienung wieder starten, wenn benötigt; keine andere Datenbankinitialisierung.
6. WEB-Hash-/SQLite-/Karten-/Bestandsprüfung wiederholen. Bei Fehlern Originale erhalten; Logs prüfen, nicht blind Sicherungen zurückkopieren. AI-Restore nur offline mit vorhandener manueller Wiederherstellungsarchitektur und eigener Übernahmefreigabe.
7. runner-environment.ps1 -ProbeWsl erneut lesend ausführen; Bootzeit muss neuer sein und HypervisorPresent muss tatsächlich bestätigt werden. Weiterhin keine Runner-Abnahme allein aus diesem Zustand.

## Linux-Schritt erst nach Boot und separater Installationsfreigabe

Der passende Weg bleibt modernes Microsoft-WSL2 auf C:, dedizierte Ubuntu-24.04-LTS-Distribution unter C:\AMU-Runner\WSL\AMU-Runner, Installationsmaterial C:\AMU-Runner\Install. Pfade sind Vorschläge, noch nicht separat freigegeben oder angelegt. Microsoft unterstützt Windows ab Build 19041; vorhandene lokale Hilfe bestimmt, welche Installationsoptionen tatsächlich verfügbar sind. Zunächst reinen WSL-Update-/Installationsweg ohne automatische Standarddistribution auswählen und konkret freigeben lassen; niemals ungeprüft wsl --install mit impliziter Ubuntu-Installation ausführen. Anschließend dedizierte Distribution an bestätigtem Ort, verifizierte Herstellerartefakte, kein ISO-Doppelweg. Keine Global-.wslconfig überschreiben.

Linux und Rootless Docker separat freigeben: bestehende WSL-Hostschutzarchitektur (keine Windows-Mounts/Interop), 4 GiB/2 CPUs/1 GiB Swap als Planwert; dann cgroup v2, systemd und wirksame CPU-/Memory-/PID-Delegation tatsächlich prüfen. Rootless allein garantiert diese Grenzen nicht. Joblimits 512 MiB/1 CPU/32 Prozesse, read-only Root-Dateisystem, kein Netzwerk, keine Hostverzeichnisse/Docker-Socket im Job, begrenzte temporäre Dateisysteme, Laufzeit/Abbruch/Bereinigung. Bestehende Runner-Registrierung, mTLS, Transfer und unabhängige Abnahme weiterverwenden. Erst danach kleines Mehrdateienprojekt mit echtem Fehler, Syntax/Build/Unit-Test, Korrektur und erneut bestandenem Test; Originalübernahme nur mit ausdrücklicher Freigabe.

Offizielle Grundlagen: [Microsoft WSL-Befehle](https://learn.microsoft.com/en-us/windows/wsl/basic-commands), [Docker Rootless-Ressourcenlimits](https://docs.docker.com/engine/security/rootless/tips/). Keine Installationsdateien daraus heruntergeladen.

## Modelle und verbleibende Blockaden

Vorhandener Qwen2.5-1.5B bleibt aktiv. Keine neue Modellinstallation freigegeben. Vorbereiteter 7B-GGUF benötigt 4.683.073.536 Byte (4,36 GiB), somit mindestens 24,36 GiB vor Download bei unveränderter 20-GiB-Runnerreserve; aktuell fehlen etwa 3 GiB freier Speicher dafür, ohne zusätzliche Download-/Installationsreserve. Geschätzter 2048-Kontext-Modellbedarf 5,84 GiB zusätzlich zur Windowsreserve; kein gemessener 7B-Peak, keine Zusage paralleler WSL-/7B-Nutzung. Nach WSL-Einrichtung neu messen. Keine Zukunftsmodelle heruntergeladen, keine HDD-Nutzung oder Löschung vorgeschlagen.

Harte Abhängigkeit bleibt der separat zu genehmigende Neustart. Danach folgen separate WSL-/Linux-/Rootless-Freigaben und reale Isolationstests. Diese Sitzung enthält keine echte Linux-/Docker-/Coding-Abnahme und kann sie vor Boot nicht ersetzen.
