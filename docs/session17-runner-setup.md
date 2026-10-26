# Sitzung 17 · Prüffähige WSL2-/Runner-Einrichtung

Diese Anleitung ist ein Freigabegegenstand, kein ausgeführtes Installationsprotokoll. Alle folgenden System-, Installations-, Zertifikats-, Netzwerk- und Dienständerungen benötigen die ausdrückliche Eigentümerfreigabe. Die laufende API bleibt bis zu einem gesondert vereinbarten Neustart in Betrieb. Keine Befehle aus Modellantworten werden auf Windows ausgeführt.

## Entscheidung und gegenwärtige Sperren

Für den vorhandenen Rechner ist eine dedizierte WSL2-Distribution mit Rootless Docker die bevorzugte, lizenzkostenfreie **Kandidatenlösung**; Docker Desktop wird nicht benötigt. Die Eignung ist erst nach realer Prüfung von systemd, cgroup v2 und delegierten CPU/RAM/PID-Grenzen bestätigt. Fehlen diese, bleibt Ausführung gesperrt; kein rootful Docker als stiller Ersatz.

Am 26.10.2026 festgestellt:

* Windows 10 Pro, Build 19045, 64 Bit: erfüllt die Build-Voraussetzung für die moderne WSL-Installation. Das ist keine Aussage über Windows-Support, Updates oder eine bereits funktionierende WSL-Laufzeit.
* Xeon E3-1230 V2, 4 Kerne / 8 logische CPUs, ca. 23,9 GiB RAM. Zum Messzeitpunkt ca. 8,1 GiB frei, CPU-Last 5 %. VT-x, SLAT und BIOS-Virtualisierung aktiv; kein laufender Hypervisor.
* WSL-Windows-Komponente aktiviert; VirtualMachinePlatform deaktiviert. `wsl --status` meldet diesen Fehler. `wsl --version` wird nicht erkannt: die für systemd benötigte moderne WSL-Version ist nicht nachgewiesen. Keine Distribution installiert.
* C: ist der Intel-120-GB-SSD zugeordnet und hat nur ca. 5,7 GiB frei. Das reicht nicht für die hier vorgesehene konservative Startreserve von 20 GiB für Rootfs, Werkzeuge, Images, temporäre Arbeiten und 1 GiB Swap. Das ist eine AMU-Planungsgrenze, keine behauptete allgemeine WSL-Mindestgröße.
* Eine 1-TB-SATA-HDD ist sichtbar. Es wurde kein zusätzliches zugängliches festes Laufwerk mit ausreichend Platz gefunden. Partitionierung, Formatierung und Datenbereinigung wurden nicht vorgenommen und sind nicht mit diesem Plan autorisiert.

**Vor jeder Installation:** Eigentümer stellt mindestens 20 GiB freien Platz auf einem ausdrücklich benannten Zielvolume bereit oder benennt einen anderen vorhandenen geeigneten Datenträger. Zusätzlicher freier Platz auf C: bleibt auch bei einem anderen Rootfs-Ziel für Windows-/WSL-Komponenten erforderlich. Es werden keine fremden Daten gelöscht. Ein Start mit knappem SSD-Platz ist nicht vorgesehen.

Geplanter Anfang: WSL-VM höchstens 4 GiB RAM, 2 virtuelle CPUs, 1 GiB Swap; ein Runnerauftrag mit 512 MiB RAM / einer CPU / 32 Prozessen / 10 Sekunden / 8 KiB Ausgabe gleichzeitig. Die laufende Inferenz bleibt auf Windows. Mehr RAM oder ein größeres Modell verlangt eine erneute Ressourcenprüfung. Diese Limits reservieren keine physische CPU exklusiv; tatsächliche Antwortzeit und Speicherdruck müssen nach Einrichtung gemessen werden.

## Bereits vorbereitete, ausschließlich lokale Werkzeuge

```powershell
pwsh -NoProfile -File scripts/runner-environment.ps1 -ProbeWsl
node scripts/prepare-runner-setup.mjs scratch/session17-environment.json scratch/session17-runner-handoff
```

Die Diagnose ist lesend, zeitlich begrenzt und meldet unbekannte Daten bei fehlenden Rechten. Der Generator akzeptiert nur ein neues Ziel unter Projekt-`scratch`, überschreibt keine vorhandene Vorbereitung und startet keine externen Programme. Ein festes Quellenverzeichnis wird mit Hashmanifest kopiert; Modelle, Datenbanken, API-Schlüssel, TLS-Schlüssel und `node_modules` werden nicht aufgenommen. Es findet keine Übertragung statt. `plan.json` listet Sperren und noch benötigte Zustimmungen. `wslconfig.proposed` ist lediglich eine Vorlage; sie wird nicht unter dem Benutzerprofil installiert.

Den ausgegebenen SHA-256 des Manifests separat vertrauenswürdig aufbewahren und nach einer später ausdrücklich erlaubten Kopie prüfen:

```powershell
node scripts/verify-runner-bundle.mjs scratch/session17-runner-handoff <VERTRAUENSWUERDIGER_MANIFEST_SHA256>
```

Der Prüfer erkennt geänderte Nutzdateien, Metadaten, unerwartete Dateien und Links. Er führt keine enthaltenen Programme aus. Hashprüfung ersetzt keine unabhängige Prüfung der Software oder der Isolation. Das Manifest selbst ist nicht digital signiert; sein Soll-Hash muss aus der vertrauenswürdigen ursprünglichen Vorbereitung stammen.

## Freigabeschritt 1: Windows-Voraussetzung und Wartungsfenster

Erst nach ausdrücklicher Zustimmung, bestätigtem Speicherziel und frischer Sicherungsverifikation in einer administrativen PowerShell:

```powershell
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
```

Nur diese bisher fehlende Komponente aktivieren; keine pauschale Hyper-V-/Sandbox-Aktivierung und keine Boot-/Firewalländerungen. Anschließend Ergebnis und erforderlichen Neustart prüfen. **Kein automatischer Neustart.** Vor dem separat freigegebenen Neustart laufende AMU-Aufträge/Backups geordnet beenden und den Eigentümer über die API-Unterbrechung informieren. Nach dem Neustart `/ready` und eingebettete Inferenz prüfen.

## Freigabeschritt 2: modernes WSL und dedizierte Distribution

Nach Zustimmung zur WSL-Aktualisierung die aktuelle Microsoft-WSL-Version über den offiziellen Installationsweg bereitstellen. Die vorhandene ältere Inbox-Variante genügt nicht als systemd-Nachweis. Nach Aktualisierung müssen `wsl --version`, `wsl --status` und `wsl --list --verbose` tatsächlich erfolgreich geprüft werden. Keine vorhandene Distribution löschen oder Standarddistribution ungefragt ändern.

Eine offizielle Ubuntu-24.04-LTS-Rootfs-Datei erst nach Downloadfreigabe beschaffen und anhand der vom Herausgeber veröffentlichten Prüfsumme verifizieren. Kein Rootfs oder Image ist bereits heruntergeladen. Das endgültige Installationsziel und die Datei müssen vor dem Import feststehen:

```powershell
wsl --import AMU-Runner "<FREIGEGEBENES_NEUES_LINUX_ZIEL>" "<VERIFIZIERTE_ROOTFS_TAR_DATEI>" --version 2
```

Die Platzhalter sind bewusst keine ausführbaren Vorgaben. Kein bestehendes Ziel überschreiben. Rootfs/Zustand auf dem Linux-Dateisystem halten, nicht im AMU-Originalprojekt oder unter einem Windows-Projektmount ausführen. Nur das geprüfte Runner-Paket und später einzeln freigegebene Snapshots übernehmen.

Nach bestätigter Paketintegrität den Inhalt von `bundle/` zusammen mit der erzeugten minimalen `package.json` in das neue Linux-Verzeichnis `/home/amu-runner/amu-runner` übernehmen. Dort gelten die folgenden relativen Skriptpfade. Das Windows-AMU-Projekt, dessen `package.json` mit KI-Abhängigkeiten und dessen Datenverzeichnisse werden nicht kopiert.

`wslconfig.proposed` nach Zustimmung mit einer vorhandenen `%UserProfile%\.wslconfig` **zusammenführen**, niemals überschreiben. Diese Datei wirkt auf alle WSL2-Distributionen. Der Generator verändert sie nicht. Notwendige neue WSL-Starts in das Wartungsfenster legen; `wsl --shutdown` würde alle Distributionen beenden und wird hier nicht ausgeführt.

## Freigabeschritt 3: Linux-Basis und Host-Abgrenzung

Der Linux-Administrator richtet den dedizierten Benutzer `amu-runner` ohne sudo-/wheel-/rootful-docker-Gruppenzugang ein. `scripts/isolated-runner/wsl.conf.example` wird ausschließlich in der eigenen Distribution geprüft und zusammengeführt: systemd aktiv, Windows-Laufwerksautomount und fstab-Mounts aus, Windows-Interop und Windows-PATH aus. Ein kontrollierter Neustart dieser Distribution ist nötig; danach keine Windows-Laufwerke und keinen WSLInterop-Handler vorfinden. Dies begrenzt den Zugang der Runner-Distribution; eigentliche Projektausführung bleibt zusätzlich im Container.

Benötigte Linux-Komponenten nach separater Paketfreigabe aus signierten offiziellen Quellen: Node.js 24+, Docker Engine mit Rootless-Werkzeugen, `uidmap`, `dbus-user-session` und benötigte Rootless-Netzwerk-/Dateisystemhilfen. Für den Runnerbenutzer müssen jeweils mindestens 65.536 Sub-UIDs/Sub-GIDs verfügbar sein. Kein `curl | sh`, keine ungeprüften Installationsskripte, keine Registry-Zugangsdaten im Runnerzustand. Die minimalen Runner-Quellen benötigen kein `npm install`; die native KI-Bibliothek wird auf Linux nicht benötigt.

Rootless Docker als Benutzer einrichten, cgroup v2 mit systemd und insbesondere CPU-, Speicher- und PID-Delegation praktisch prüfen. Falls dazu eine systemweite Linux-systemd-Konfiguration nötig ist, diese separat prüfen und freigeben. Der vorhandene AMU-Adapter verweigert Betrieb ohne diese Voraussetzungen. `scripts/isolated-runner/amu-runner.service.example` ist ein später zu prüfender **Benutzerdienst**, keine installierte systemweite Unit. Node-Pfad, Arbeitsverzeichnis und Zustandsdatei an die tatsächlich eingerichteten Pfade anpassen. Automatischer Start/Lingering wird nicht stillschweigend aktiviert.

Private Zustandsverzeichnisse Modus 0700 und Konfiguration/Schlüssel 0600 anlegen; leeres privates `docker-config` anlegen. Ein zuvor unabhängig geprüftes, lokal vorhandenes unveränderliches Node-24-Basisimage verwenden. Imageaufbau nur in dieser Linux-Umgebung, ohne automatischen Pull:

```sh
docker --host unix:///run/user/<UID>/docker.sock build --pull=false --network=none --build-arg BASE_IMAGE=sha256:<LOKALE_GEPRUEFTE_BASIS_IMAGE_ID> --tag amu-isolated-runner:reviewed scripts/isolated-runner
```

Ergebnis anschließend per `docker image inspect` ermitteln und ausschließlich seine unveränderliche `sha256:`-ID in der Runner-Konfiguration pinnen. Für das dependencyfreie Abnahmeprojekt genügen Node/npm; externe Projektabhängigkeiten benötigen später ein eigenes geprüftes Offline-Image. Keine automatische Installation von Projektabhängigkeiten.

## Freigabeschritt 4: echte mTLS-Identität und Abnahme

Private Linux-IP und geplante Zertifikatsnamen erst nach Bereitstellung bestimmen. Der Server bindet nur diese private IP; kein `0.0.0.0`, kein Portproxy und keine Firewallfreigabe ohne separate Zustimmung. Ein stabiler Zugriff von Windows muss praktisch geprüft werden. Geänderte WSL-IP bedeutet gegebenenfalls neue SANs/Verbindungsprüfung, keine abgeschaltete Zertifikatsprüfung.

CA, Serverzertifikat mit passender IP-SAN und Server-EKU sowie getrenntes Clientzertifikat mit Client-EKU erzeugen und unabhängig prüfen. CA-Schlüssel privat offline behalten. Nur Clientzertifikat/Clientschlüssel und CA-Zertifikat in den privaten AMU-Zustand, Serverzertifikat/Serverschlüssel und CA-Zertifikat auf den Runner. Keine CA-Schlüssel auf die Gegenstelle kopieren. Keine Testzertifikate verwenden. Beispielkonfiguration enthält absichtlich Platzhalter, keine gültigen Identitäten. `serverId`, Clientpin, tatsächliche private IP, Docker-Dateihash, eigener Socket, geprüfte Image-ID und konkrete Profile explizit setzen.

Vor Ausführung:

```sh
node scripts/runner-linux-preflight.mjs /home/amu-runner/private/config.json
AMU_ISOLATED_RUNNER_CONFIG=/home/amu-runner/private/config.json node scripts/accept-isolated-runner.mjs
```

Die lesende Vorprüfung startet keine Container. Unter Windows verweigert sie bereits vor Konfigurationszugriff jede Freigabe. Ein positiver Vorprüfbericht ist **keine** Isolationsabnahme. Die zweite, echte Abnahme startet erst im vorbereiteten Linux eigene begrenzte Testcontainer und muss alle vorhandenen acht Prüfgruppen bestehen. Netzwerk-/Dateigrenzen, Ressourcen, Zeit, Abbruch, Bereinigung, Wiederanlauf, echter Build/Unit/Integration und fehlerhafte/korrigierte Wiederholung müssen tatsächlich belegt sein. Vorhandene Abnahmeberichte werden nicht überschrieben.

Erst danach unabhängig den Bericht und dessen Offline-SHA-256 prüfen, den exakten Hash lokal hinterlegen und den Dienst starten:

```sh
AMU_ISOLATED_RUNNER_CONFIG=/home/amu-runner/private/config.json node scripts/isolated-runner.mjs
```

Die bestehende deutsche AMU-Verwaltung übernimmt Verbindung, Zertifikatsprüfung, Profilfreigabe, unabhängige Abnahme, genau gebundene Quellübertragung und Ergebnisanzeige. Keine produktiven API-Schlüssel müssen geändert werden. Bei fehlender/abgelaufener Abnahme bleiben die vorhandenen Sperren aktiv.

## Anschließender echter Coding-Nachweis

Ein eigenes, dependencyfreies Testprojekt verwenden: klarer Auftrag und Dateien, Modellplan, Diff in Arbeitskopie, Freigabe der exakten Prüfquellen, isolierte Syntax-/Build-/Unit-/Integration-Ausführung, absichtlich fehlerhafter Addierer, strukturierter Fehlerkontext, Korrekturpaket, neue isolierte Prüfung, separate Übernahmefreigabe, Git-Commit und gezielte Wiederherstellung. Originale und fremde Projekte bleiben geschützt. Bestehende Pflichtprüfungen müssen vor Übernahme bestanden sein; eine Prüffreigabe ist keine Übernahmefreigabe. Dies ist die noch ausstehende reale Abnahme, nicht ein hier erzieltes Ergebnis.

## Offizielle Referenzen

* [Microsoft: WSL installieren](https://learn.microsoft.com/en-us/windows/wsl/install)
* [Microsoft: VirtualMachinePlatform und Neustart](https://learn.microsoft.com/en-us/windows/wsl/install-manual)
* [Microsoft: WSL-/Distributionskonfiguration](https://learn.microsoft.com/en-us/windows/wsl/wsl-config)
* [Microsoft: systemd unter WSL](https://learn.microsoft.com/en-us/windows/wsl/systemd)
* [Docker: Rootless-Voraussetzungen](https://docs.docker.com/engine/security/rootless/)
* [Docker: cgroup-v2-/systemd-Ressourcenlimits](https://docs.docker.com/engine/security/rootless/tips/)
