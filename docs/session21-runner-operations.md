# Sitzung 21 – Linux-Runner: technische Fortschritte und Freigabeweg

Stand 27.10.2026. Quellversion 1.19.0, Ausgangsbasis d624237 / 1.18.0. Ausschließlich AMU-Agent-2 geändert; keine Installation, keine Windows-Aktivierung, kein Neustart, keine HDD-/USB-Schreibänderung in dieser Sitzung.

## Erneut tatsächlich ermittelte Blockaden

Gezielt lesend geprüft: `scratch/session21-environment.json` und `session21-storage.json`. Vorhandene Hardwareanalyse aus Sitzung 20 weiterverwendet, keine neue Kaufberatung.

| Voraussetzung | Tatsächlicher Zustand | Konsequenz |
|---|---|---|
| BIOS-Virtualisierung / SLAT | Beide gemeldet aktiviert/verfügbar | Kein BIOS-Eingriff vorgesehen |
| Windows WSL-Feature | Aktiviert, wsl.exe vorhanden | Vorhandensein ist kein funktionierendes Linux |
| VirtualMachinePlatform | Deaktiviert; Hypervisor nicht aktiv | Administratorfreigabe zur Aktivierung und danach Windows-Neustart nötig |
| WSL-Laufzeit | `--version` wird abgewiesen, `--status` meldet fehlende VMP | Modernes systemd-fähiges WSL fehlt |
| Linux | Keine Distribution registriert | Dedizierte Linux-Installation fehlt |
| Docker / Podman | Nicht im Windows-Pfad vorhanden; keine Linux-Umgebung | Keine Container-Ausführung verfügbar |
| C: | 5.991.182.336 Byte = etwa 5,58 GiB frei zum Inventarzeitpunkt | Kein geeigneter freigegebener Runner-Zielort mit 20 GiB Reserve |
| Interne HDD | Identität unverändert, keine erkannten Partitionen | Eigentümersperre wegen möglicher AMU-SYSTEM-Daten gilt uneingeschränkt |
| USB E: | Bestehende Sicherung; 31.126.749.184 Byte frei | Nur Sicherungs-/Transportmedium, kein Runner-/Swap-/RAM-Ersatz |

Keine Linux-Gegenstelle bekannt; keine fremden Computer kontaktiert oder Netzwerksuche durchgeführt. AMU SYSTEM auf zwei Computern ist laut Eigentümer vorhanden, Vollständigkeit und Wiederherstellbarkeit aber nicht nachgewiesen.

## Konkreter Softwarefortschritt

`src/runner/lease.ts` beansprucht den privaten Runnerzustand exklusiv, bevor der Dienst oder die echte Abnahme eigene Container wiederherstellen/entfernen darf. Zuvor konnten zwei getrennte Runnerprozesse denselben Eigentümerbereich gleichzeitig wiederherstellen und dadurch aktive Aufträge gegenseitig beenden. Dienst gegen Dienst sowie Dienst gegen Abnahme werden jetzt durch exklusive Dateierstellung ausgeschlossen.

Die Sperre enthält PID, Zweck, Ort und zufälliges Eigentümertoken. Bei regulärem Dienstende oder abgeschlossener Abnahme wird ausschließlich die eigene unveränderte Sperre freigegeben. Ein fremder oder nach Absturz unklarer Zustand wird nicht automatisch übernommen oder gelöscht. PID allein beweist keine fortbestehende Identität. Nach hartem Absturz bleibt der Dienst absichtlich blockiert, bis ein Administrator Prozess, Container und Zustand unabhängig geprüft und die Sperre archiviert hat. Keine automatische Wiederholung eines Auftrags.

Der Dienst sperrt bei Stop sofort neue Anfragen und prüft vor der endgültigen Auftragszulassung erneut den Stopzustand. Bereits zugelassene Aufträge werden abgebrochen; der Stop wartet auf den Dienstabschluss einschließlich Adapterbereinigung. Wiederholtes Stop liefert dieselbe Abschlussoperation. Beim fehlgeschlagenen Start wird die eigene Sperre freigegeben. Ein harter Betriebssystemabbruch ist damit nicht als erfolgreiche Containerbereinigung nachgewiesen.

Die Fingerprints auf Runner- und Zentralserverseite umfassen jetzt auch das neue Sperrmodul. Alte Abnahmen werden dadurch ungültig; keine stille Aktivierung. Das Vorbereitungspaket enthält alle benötigten Module. Vorhandene Schutzfunktionen werden weiterverwendet: mTLS mit Zertifikatspin, gebundene Auftrags-/Profil-/Snapshot-Identitäten, Byte-/SHA-Prüfung, Quellen erst nach Freigabe, getrennte schreibgeschützte Eingaben, tmpfs-Arbeitskopie, Netzwerk aus, CPU/RAM/PID/Zeit-/Ausgabelimits, Bereinigungsprüfung und Quarantäne bei Unsicherheit. Originaldateien werden dadurch nicht automatisch übernommen.

## Benötigte Zielumgebung – noch nicht installiert

Vorgesehen: Ubuntu 24.04 LTS x86-64 als dedizierte WSL2-Distribution, Node 24 und **Rootless Docker Engine**. Kein Docker Desktop und kein Podman-Parallelaufbau erforderlich. Der aktuelle Adapter ist ausdrücklich Docker-spezifisch. Dedizierter nicht privilegierter Benutzer ohne sudo-/docker-Gruppen, systemd PID 1, cgroup v2 mit CPU-/RAM-/PID-Delegation, Rootless-Unix-Socket. Docker benötigt unter anderem uidmap sowie zugeordnete untergeordnete Benutzer-/Gruppen-IDs. WSL muss mindestens 0.67.6 für systemd beherrschen; später aktuelle unterstützte Version statt dieses alten Mindeststands wählen. Quellen: [Microsoft systemd unter WSL](https://learn.microsoft.com/en-us/windows/wsl/systemd/), [Docker Rootless-Voraussetzungen](https://docs.docker.com/engine/security/rootless/), [Rootless-Ressourcengrenzen](https://github.com/docker/docs/blob/main/content/manuals/engine/security/rootless/tips.md).

Windows-Laufwerksautomount, fstab-Mounts und Windows-Interop bleiben innerhalb dieser dedizierten Distribution abgeschaltet. Vor Containerstart erzwingt der Adapter diese Grenzen. Zertifikate separat erzeugen und gegenprüfen; keine Testzertifikate produktiv übernehmen. Lokales Containerimage mit unveränderlichem Image-ID-Pin, kein automatischer Pull. Aufträge übertragen nur explizite Dateien, keine Windows-Laufwerke oder gesamten Projekte. Rootless mit systemd/cgroup v2 muss real Ressourcenlimits durchsetzen; bloße Installation genügt nicht.

Auf einem später ausdrücklich freigegebenen internen NTFS-Ziel könnte die Linux-VHDX unter `<Laufwerk>:\AMU-Runner\WSL\AMU-Runner`, Installationsmaterial unter `...\Install` und WSL-Swap unter `...\WSL\swap.vhdx` liegen. Docker-Daten, Linux-Pakete und Runnerzustand liegen im nativen Linux-Dateisystem innerhalb der VHDX, niemals in einem direkt eingebundenen Windows-Workspace. Kein konkreter Laufwerksbuchstabe ist aktuell ausgewählt oder freigegeben.

Budget: grob 20–30 GiB für Linux, Node, Rootless Docker, Image und erste Aufträge; mindestens 20 GiB geeigneten freien Zielplatz vor Installation prüfen und zur Laufzeit 2 GiB Reserve erhalten. Das ist ein Planungsbudget, keine gemessene Paketgröße. Zusätzlich bleiben Windows-/WSL-Hostkomponenten, Servicing und eventuell temporäre Dateien auf C:. Deren exakter Bedarf ist ohne ausgewählte Pakete und Downloadprüfung nicht gemessen; 5,58 GiB sind keine Installationsgarantie. Ein externer VHDX-Zielpfad beseitigt den C:-Bedarf nicht. Kein Installer gestartet und keine Daten zur Platzgewinnung gelöscht oder verschoben.

## Kurzer Eigentümer-Freigabeweg

1. Auf den vorhandenen anderen Computern eigenständig prüfen, ob AMU SYSTEM samt Datenbanken, Konfiguration, Projekten und benötigten Zugängen vollständig vorhanden ist und sich aus der Sicherung tatsächlich wiederherstellen/starten lässt. Diese Sitzung greift dort nicht ein.
2. Falls weiterhin Unklarheit besteht: HDD unverändert lassen. Erst nach erfolgreicher Prüfung und gesicherter Wiederherstellbarkeit später ausdrücklich für **genau die identifizierte ST1000DM003-1ER162** entscheiden. Keine jetzige Partitionierungsfreigabe unterstellen.
3. Danach frisches Identitäts-/Layoutinventar und konkreten Platz-/Partitionsplan vorlegen. Die 100-GiB-Vorgabe ist kein Maximum; Größe und Windows-Zielpfad separat bestätigen. Erst dann die AMU-Planungssperre ändern und ausschließlich die konkret erlaubten Datenträgeraktionen ausführen.
4. Getrennte Administratorfreigabe für VMP-Aktivierung, modernes WSL, Linux-Rootfs/Node/Rootless-Docker-/Image-Installation und nötige Downloads einholen. Keine kostenpflichtige Cloud. Windows-Neustart mit angekündigter API-Unterbrechung separat abstimmen. WSL-/Benutzerdienständerungen können weitere gezielte Linux-/WSL-Neustarts brauchen; kein pauschales `wsl --shutdown` bei anderen aktiven Distributionen.
5. Anschließend echte Host-/Containerabnahme und unabhängige Prüfung durchführen; zentrale Aktivierung separat als Administrator freigeben. Erst danach Testprojekt bauen/testen/korrigieren. Übernahme von Änderungen bleibt eine weitere explizite Freigabe.

VMP-Aktivierung erfolgt später als Windows-Administrator ohne sofortigen Neustart; Microsoft beschreibt die erforderliche Plattform und den anschließenden Neustart: [WSL2-Voraussetzungen](https://github.com/MicrosoftDocs/WSL/blob/main/WSL/install-manual.md). Kein solcher Systembefehl wurde hier ausgeführt. Keine neue Freigabe wird in dieser Sitzung vorausgesetzt.

## Tatsächliche Prüfungen

- Vor Änderungen verschlüsselte Vollsicherung ohne erneute Gewichtekopie erstellt und authentifiziert verifiziert: `20336475-e181-4e69-b7f4-1594b1ca60ad`, SHA-256 `0befdd97f547a23eb8b8ddaa96cd8004599f474331279e26ee946fbb738e6352`.
- TypeScript `--noEmit` und Syntaxprüfungen der beiden echten Einstiegsskripte bestanden, kein Projektbuild.
- Neue vertrauenswürdige Sperrtests: doppelte Dienst-/Abnahmeinstanz verweigert, reguläre Freigabe, keine Übernahme einer unklaren Crashsperre, fremde Sperre erhalten, Sperrnahme vor Wiederherstellung. Keine Linux-Simulation als Erfolg ausgegeben.
- Sitzung 16 bestand nach Korrektur des zunächst fehlenden zentralen Fingerprint-Updates: tatsächliches mTLS, Quellen-/Freigabebindung, Fehler-/Reparaturworkflow mit Testadapter, Abbruch, keine automatische Wiederholung, unklare Ergebnisse, Git und Restore in eigenen Testfixtures. Kein fremder Projektcode oder echter Container auf Windows ausgeführt.
- Sitzung 14: tatsächliches mTLS, Profil-/Pfadprüfung, Kapazität, doppelte Identitäten, Abbruch und verweigerte Windows-Ausführung bestanden; ebenfalls ausdrücklich Testadapter.
- Sitzung 17 (Vorbereitungspaket) und 19 (Hostgrenzen, 2-GiB-Reserve, Windows-Verweigerung) bestanden. Neue Paketintegration wird mit dem vertrauenswürdigen Manifest geprüft.
- Live-API: Health/Readiness bereit, Qwen2.5-1.5B-Streaming bis `[DONE]`, Modellliste mit Schlüssel 200/ohne Schlüssel 401, Clientzugriff auf Administration verweigert, Adminseite HTTP 200 und Skriptsyntax gültig. Bestehende Benutzer/Schlüssel, Modellprofil und frühere Auftragshistorie erhalten. Kein neuer interaktiver Browsertest behauptet.

**Echter Linux-Runner: nicht verfügbar. Vollständiger realer Coding-/Build-/Unit-/Integration-Durchlauf: nicht durchgeführt.** Das vorhandene Linux-Abnahmeskript bereitet echte Containerbeobachtungen, Ressourcenlimits, Prozessbaumabbruch, Ausgabegrenzen, Build/Unit/Integration und gezielt defekten/korrigierten Test vor. Es verweigert Windows und root. Vor Ausführung muss der Dienst gestoppt sein; eine neue Abnahme ersetzt keine Eigentümerfreigabe für die Übernahme eines Testprojekts.

## Warum Quell- und Runtime-Version abweichen

`src/central/service.ts` liest `package.json` einmal beim Prozessimport. Der bestehende Prozess wurde mit 1.16.0 geladen; nachträgliche Dateiänderungen laden dessen Module nicht neu. `scripts/supervise.mjs` startet den TypeScript-Einstieg direkt, nicht ein altes dist-Build. Der Versionsunterschied ist deshalb ohne Neustart erwartbar. Der Supervisor meldet einen laufenden API-Prozess; in dieser Sitzung kein manueller Restart und keine neue Runtime-Aktivierung. Auch die neuen Runneränderungen sind kein bereits aktualisierter Live-Zentralprozess.

Ein späterer API-Wechsel benötigt: geprüfte Sicherung einschließlich erreichbarem lokalen Wiederherstellungsschlüssel; sauberen gesicherten Git-Stand; erfolgreiches Typecheck/gezielte Tests; freien Zustand ohne aktive/queued Inferenz, Entwicklungsaufträge oder Sicherungsjob; ausdrückliche Restart-/Unterbrechungsfreigabe. Dann ausschließlich vorhandenen administrativen Supervisor-Neustart verwenden. Danach `/ready`, tatsächliche neue Version, Modellantwort, Streaming und Anmeldung prüfen. Bei Fehlern keine Neustartschleifen: vorhandenen manuellen Wiederherstellungsweg mit Sicherung und altem Git-Stand prüfen, keine Live-Datenbank blind zurückkopieren und den weiterexistierenden Supervisor nicht doppelt starten. [Wiederherstellung](operations/manual-recovery.md).

## Sicherheit und Sitzung 22

Windows 10 Pro 22H2 meldete in Sitzung 20 Build 19045.6466; kein Update in Sitzung 21. Regulärer Support endete am 14.10.2025, ESU-Berechtigung nicht bestätigt. Defender ersetzt fehlende OS-Patches nicht. Keine produktive LAN-Freigabe auf Basis dieses ungeklärten Support-/Patchstands; kein automatisches Update oder Hardwarekauf. [Vorhandener Sicherheitsbefund](session20-hardware.md).

Sitzung 22: Eigentümerprüfung von AMU SYSTEM abschließen; internen Speicher konkret freigeben; danach genehmigte Windows-/Linux-Bereitstellung und geplantes Neustartfenster; aktuelle Quellen samt Sperrmodul übertragen, mTLS-/Hostgrenzen und echte Abnahme prüfen; erst dann den echten Mehrdatei-Coding-/Test-/Reparaturworkflow mit separater Übernahmefreigabe durchführen. Ohne diese Voraussetzungen bleibt die sichere Ausführung gesperrt. Finaler Commit, Live-Version, Backup und Paketdigest stehen im lokalen `scratch/session21-closeout.json`.
