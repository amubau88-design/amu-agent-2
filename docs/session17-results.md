# Sitzung 17 · Ergebnisse und ausstehende Systemfreigabe

Projektstand **1.15.0**, Ausgangscommit `3538492` (1.14.0). Nur AMU-Agent-2 verändert. Die Ausgangssicherung `f8532e53-fd5a-4a9a-adc3-b9e47176f51d` wurde vor Quelländerungen verschlüsselt erstellt und verifiziert; SHA-256 `e86dd1d4663ecbc13f2c146981a3e17f5634d84d07cf1edff6aba7650a3e52f7`. Keine vorhandenen Clients, Schlüssel, Datenbanken, Modelle oder fremden Projekte gelöscht oder geändert.

## Ergebnis

**Echter isolierter Linux-Runner: NEIN. Vollständiger Coding-Ablauf mit echten isolierten Build-/Unit-/Integrationstests: weiterhin nicht nachgewiesen.**

Es wurden keine Windows-Funktionen aktiviert, keine Installation und kein Neustart ausgeführt und keine Firewall-/Netzwerkrechte geändert. Die ausdrückliche Eigentümerfreigabe dafür fehlt. Zusätzlich ist nicht ausreichend freier Platz für die vorbereitete Einrichtung vorhanden. Es wurden keine Installationsdateien, Images oder Modellgewichte heruntergeladen.

Der bestehende API-Prozess blieb ohne Neustart in Betrieb. **Laufende API-Version weiterhin 1.14.0**, `/health` und `/ready` melden `ready`, eingebettetes Qwen2.5-1.5B ist bereit. **1.15.0 bezeichnet den neuen Projekt-/Vorbereitungsstand**; die Versionsanzeige des laufenden Prozesses ändert sich erst nach einem später ausdrücklich freigegebenen Neustart. Keine Änderung am produktiven Inferenz-/API-Kern war für diese Vorbereitungswerkzeuge erforderlich.

## Hardware und Einrichtungsvoraussetzungen

* Windows 10 Pro, Build 19045, 64 Bit: passende Build-Voraussetzung für den modernen WSL-Installationsweg, keine Garantie für eine betriebsfähige Laufzeit.
* Xeon E3-1230 V2, 4 Kerne / 8 logische CPUs, ca. 23,9 GiB RAM; zum Messzeitpunkt ca. 8,1 GiB frei, CPU-Last 5 %. BIOS-Virtualisierung, VT-x und SLAT aktiv. Hypervisor nicht aktiv.
* Windows-WSL-Komponente aktiviert, VirtualMachinePlatform deaktiviert. `wsl --status` fehlgeschlagen; `wsl --version` nicht unterstützt. Keine installierte Linux-Distribution. Docker und Podman nicht gefunden.
* C: tatsächlich der Intel-120-GB-SSD zugeordnet; ca. **5,7 GiB frei**. Eine zusätzliche 1-TB-HDD ist sichtbar, aber kein weiterer nutzbarer fester Laufwerksbuchstabe wurde festgestellt. Keine Partitionierung, Formatierung oder fremde Datenbereinigung ausgeführt.
* Keine Linux-Gegenstelle konfiguriert. Kein Netzwerk- oder Zweirechnertest möglich; keine LAN-Suche ausgeführt.

Empfohlener bedingter Einstieg: eine dedizierte WSL2-Distribution mit Rootless Docker, ohne Docker Desktop; zunächst 4 GiB VM-RAM, 2 virtuelle CPUs, 1 GiB Swap und ein kleiner Auftrag gleichzeitig. Vorab mindestens 20 GiB freie Startreserve auf einem freigegebenen Zielvolume schaffen; Windows benötigt auch auf C: zusätzliche Installationsreserve. Die Laufzeit muss cgroup v2/systemd mit tatsächlich durchgesetzten Ressourcenlimits nachweisen. Ein separater Rechner bleibt Alternative, falls diese Voraussetzungen hier nicht herstellbar sind.

## Fertiggestellte Vorbereitung

1. **Erweiterte lesende Windows-Diagnose**: Betriebssystem, CPU/RAM, freier Platz, SSD/HDD-Zuordnung und begrenzte lokale WSL-Abfragen. Fehlende Rechte/Erkenntnisse werden nicht als positive Voraussetzungen ausgegeben.
2. **Ressourcen- und Einrichtungsplaner**: prüft frische Bestandsaufnahme, Windows-Build, Virtualisierung, freie Ressourcen, mindestens systemd-fähige WSL-Version und Speicherreserve. Eine Bestandsaufnahme autorisiert niemals Installation, Netzwerkänderung oder Ausführung. Aktuell bleibt `readyForInstallation:false`.
3. **Lokales Runner-Quellenpaket** aus fester Allowlist mit SHA-256-Dateimanifest, gesondert gebundenen Metadaten und Prüfer gegen veränderte Dateien, Metadaten und zusätzliche Bundle-Dateien. Kein Überschreiben vorhandener Vorbereitung, kein Ziel außerhalb Projekt-`scratch`, keine Ausführung oder Übertragung, keine Geheimnisse, Modelle oder nativen KI-Abhängigkeiten im Paket.
4. **Lesende Linux-Vorprüfung**: Nicht-Root, Node 24, systemd/cgroup v2, WSL-Hostabgrenzung, keine privilegierten Gruppen, privater Zustand, eigener Socket, Docker-Dateihash, Rootless-/seccomp-/Ressourcenmerkmale und lokales gepinntes Image. Startet keine Container, aktiviert keinen Runner. Der Linux-Pfad ist vorbereitet und hier mangels Linux nicht praktisch geprüft.
5. **Prüfbare Vorlagen**: WSL-Ressourcen, eigene Distributionskonfiguration ohne Windows-Automount/Interop sowie ein Linux-Benutzerdienst. Keine Vorlage wurde im Betriebssystem installiert.
6. **Konkreter gestufter Einrichtungs-/Freigabeplan** mit Windows-Befehl ohne automatischen Neustart, Speicherprüfung, dediziertem Distributionsimport, Linux-Paketen/Benutzer, Rootless-/Imageanforderungen, mTLS-Bindung, tatsächlicher Abnahme und anschließendem Coding-Nachweis: [session17-runner-setup.md](session17-runner-setup.md).

Die deutsche Verwaltungsoberfläche, vorhandene API-Verwaltung, Rechte, Diff-/Freigabe-/Pause-/Abbruchfunktionen, Modellprofile, Git und Wiederherstellung wurden beibehalten. Das vorhandene Qwen3-Coder-30B-A3B-Profil bleibt austauschbar vorbereitet und mangels Gewichten nicht verfügbar. Keine große Modellqualität, GPU-Eignung oder 30B-Lauffähigkeit wird behauptet.

## Tatsächlich durchgeführte Prüfungen

* Frische Windows-/Hardware-/WSL-/Speicherabfragen, einschließlich separat genehmigter rein lesender Abfragen außerhalb der Sandbox. Keine Interpretation eines installierten Befehls als erfolgreiche Containerprüfung.
* `node src/tests/session17-setup.test.mjs`: bestanden. Prüft Planersperren bei wenig Platz/unbekannter Hardware/veraltetem WSL, Version 0.67.5 gegenüber 0.67.6, alte Bestandsaufnahme, Ressourcenobergrenzen, fehlende Autorisierung, feste Quellallowlist, Überschreib-/Pfadgrenzen und Manipulationserkennung. Dies sind Tests eigener Vorbereitungssoftware, keine Ausführung generierter Projekte und kein Isolationsnachweis.
* `node --check` für die drei neuen ausführbaren JavaScript-Hilfen: bestanden. Kein AMU-Build und keine Projekt-Build-/Unit-/Integrationstests ausgeführt.
* Tatsächliches lokales Vorbereitungspaket mit 15 Dateien erzeugt und dessen Integrität geprüft. Ort: `scratch/session17-runner-handoff`. Manifest-SHA-256: `9becb0b07bf29a214b45d95c1f1e8f9eb53a3b71acd8dff022139738520cf0ed`. Die Unterlagen enthalten weiterhin explizite, vor Bereitstellung zu ersetzende Identitäts-/Pfad-/Imageplatzhalter; sie sind kein bereits installierter Runner.
* Produktive API: `/health`, `/ready`, Modellliste mit Client-Schlüssel 200, ohne Schlüssel 401; echte Qwen-Antwort mit SSE-Chunks und `[DONE]`: bestanden.
* Vorhandener Anwendungsschlüssel erhält für Clientverwaltung und Runner-Bereitschaftsverwaltung 403. Administrator kann Runner-/Modellstatus lesen. Projektcode bleibt gesperrt. Automatische Modelldownloads bleiben aus; 30B-Profil vorhanden, nicht installiert.
* Vorhandener Sitzung-16-Auftrag weiterhin `paused` nach gezielter Rücknahme, zugehöriger Git-Commit unverändert erhalten. Dieser lokale Coding-Nachweis wurde nicht als in Sitzung 17 erneut ausgeführter vollständiger Workflow ausgegeben.
* Geheimnisprüfung der geänderten Dateien und Git-Diff-Formatprüfung bestanden. Abschlusssicherung und sauberen endgültigen Commitstatus dokumentiert `scratch/session17-closeout.json` nach Abschluss.

Lokale Belege: `scratch/session17-environment.json`, `session17-backup-before.json`, `session17-verify-before.json`, `session17-api-result.json`, `session17-management-result.json`, `session17-final-status.json`, `session17-runner-handoff/plan.json` sowie Abschluss-/Sicherungsverifikation. Diese Zustände und Zugangsdaten gelangen nicht in Git.

## Noch blockiert und Zustimmung für Sitzung 18

Reale Container-, mTLS-Gegenstellen-, Host-/Datei-/Netzwerkisolations-, Ressourcen-, Timeout-, Abbruch-, Neustart-/Bereinigungs- und vollständige Coding-Abnahme stehen aus. Fehlende Linux-Umgebung wird durch keinen simulierten Bericht ersetzt. Generierter Projektcode wird nicht auf Windows ausgeführt.

Vor Fortsetzung benötigt der Eigentümer einen freigegebenen Installationsort mit ausreichend Platz. Danach ist ausdrücklich freizugeben: VirtualMachinePlatform-Aktivierung, modernes WSL und dedizierte Linux-Installation sowie separat das Wartungsfenster für den erforderlichen Windows-Neustart und die API-Unterbrechung. Linux-Pakete/Benutzer/Rootless-Docker-Einrichtung und später die konkrete Netzwerk-/Zertifikats-/Ausführungsfreigabe bleiben eigene kontrollierte Schritte. Ein „Ja“ zur Einrichtung allein löst keinen sofortigen Neustart aus.

Sitzung 18: Speicherziel bestätigen → freigegebene Windows-Voraussetzungen herstellen → gesonderter Neustart → moderne WSL-/Linux-Voraussetzungen real prüfen → Linux-Runner ohne Windows-Freigabemounts einrichten → echte begrenzte Containerabnahme unabhängig prüfen → mTLS/Offline-Berichtshash freigeben → den vollständigen Testprojektablauf einschließlich Fehlerkorrektur, neuer Freigabe, Commit und Wiederherstellung tatsächlich nachweisen.
