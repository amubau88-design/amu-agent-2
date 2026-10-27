# Sitzung 23 – Runner und lokale Coding-Modelle

Stand 27.10.2026. Ausgangsbasis tatsächlich **1.20.0 / 448b03f**; die Schreibweise 448be3f im Auftrag war ein Tippfehler. Neuer Quellstand **1.21.0**. Bestehende API bei Live-Prüfung weiterhin 1.19.0, kein manueller Neustart. Keine Änderung an AMU WEB, AMU SYSTEM, HDD oder anderen Computern.

## Tatsächlicher Ausgangsbefund

Frische rein lesende Abfragen: `scratch/session23-environment.json`, `session23-storage.json`, `session23-pending-reboot.json`. Intel Xeon E3-1230 v2, vier Kerne / acht Threads, nutzbarer physischer RAM 25.670.639.616 Byte (nominal 24 GiB), CPU-Inferenz. BIOS-Virtualisierung/SLAT gemeldet verfügbar. Freier RAM beim Inventar 8.132.386.816 Byte, während der späteren Modellvorprüfung 7.656.411.136 Byte; Hintergrundprogramme beeinflussen diese Momentaufnahmen.

C: beim Inventar etwa 22 GiB frei. Windows-WSL-Feature aktiv; VirtualMachinePlatform deaktiviert; kein laufender Hypervisor, keine Linux-Distribution, kein Docker/Podman festgestellt. `wsl --version` wird vom vorhandenen alten WSL abgewiesen. File-Rename-Pending-Eintrag vorhanden, CBS-/Windows-Update-Rebootmarker bei Prüfung nicht gesetzt. Keine Zusicherung, dass Windows keinerlei weiteren Neustartbedarf hat.

Die HDD ist unverändert unter der bekannten Identität geschützt. C: kann inzwischen unabhängig als vorhandenes internes NTFS-Volume geplant werden; keine neue Partitionierung nötig. Ruhezustand bleibt nach der vorher separat genehmigten Bereinigung ausgeschaltet, Auslagerungsdatei nicht verändert.

## Implementiert

1. **Offizielles 7B-Coder-Profil** im vorhandenen Modellkatalog und Registrierungsfeld der AMU-Administration. Qwen2-Architektur, 28 Layer, Embedding 3584, vier KV-Heads, Head-Dimension 128; konservativer Startkontext 2048, AMU-Maximum 32768. Dimensionen verhindern das Umbenennen des kleinen Fallbacks in einen 7B-Coder. Die Registrierung verlangt zusätzlich exakt die gepinnte offizielle Dateigröße, den Dateinamen und SHA-256, prüft danach wie bisher Inhalt und GGUF-Metadaten. Registrierung lädt kein Modell.
2. **Ressourcenprüfung für die Beschaffung**: Modellplatz zusätzlich zur 20-GiB-Runner-Startreserve und konservative RAM-/KV-Schätzung. Unbekannte Angaben sperren; keine automatische Beschaffung, kein automatischer Modellstart. Die Anzeige übernimmt diese Prüfung. Der Mindestplatz setzt eine einzige Gewichteablage voraus; zusätzliche Download-/Importkopien benötigen zusätzlich Platz. Ein passender Plan ist keine Installationsfreigabe.
3. **Upgrade-Kandidaten vorgemerkt**: der vorhandene Qwen3-Coder-30B-A3B-Eintrag bleibt; Qwen3-Coder-Next und Devstral Small 2 24B wurden als reine Vormerkungen ergänzt. Die beiden neuen Vormerkungen verweigern Registrierung und Laufzeitbeladung auch bei ausreichend RAM, bis GGUF-Artefakt, Backend und Template separat geprüft sind. Keine Gewichte, kein neuer Modellserver.
4. **Tatsächlichen Planungsfehler korrigiert**: Die Eigentümersperre einer anderen HDD war bisher ein globaler Blocker, auch wenn C: bereits unabhängig geeignet war. Bei einem validierten internen Ziel bleibt die fremde HDD nun ausdrücklich ausgeschlossen und als Warnung sichtbar, blockiert aber nicht den unabhängigen Zielort. Ohne geeignetes Ziel oder ohne detaillierte Datenträgerzuordnung bleibt die Sperre blockierend. Keine Installations-/Schreibbefugnis entsteht aus dem Plan.
5. **Wiederverwendbare API-Messung** unter `scripts/benchmark-coding-api.mjs`: feste Aufgaben, JSON-Schemata, SSE-Latenz, gesampelter Worker-RSS und separate Nicht-Streaming-Tokenmessung. Verwendet nur die vorhandene Loopback-API und das bereits aktive, untätige Modell. Verweigert unbekannte/nicht aktive Modelle; schaltet kein Modell um, lädt nichts herunter, führt keine generierten Dateien oder Aktionen aus.

Die Änderungen sind Quellstand. Die bestehende Live-API wurde dafür nicht neu geladen; ihre alte Profilliste darf nicht als bereits auf sechs Profile aktualisiert dargestellt werden. Die neuen Einträge und UI-Prüfungen werden beim nächsten genehmigten API-/Windows-Wiederanlauf aktiv. Der Fallback bleibt installiert und ausgewählt.

## Qwen2.5-Coder-7B: Quelle, Integrität und reale Grenzen

Offizielle Quelle: [Qwen2.5-Coder-7B-Instruct-GGUF](https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF). Öffentliche Hub-Metadaten per HTTPS gelesen, keine Gewichte geladen:

| Feld | Verifizierte Quellenangabe |
|---|---|
| Lizenzmetadaten | Apache-2.0 |
| Revision | 13fb94bfda8c8cf22497dc57b78f391a9acb426a |
| Datei | qwen2.5-coder-7b-instruct-q4_k_m.gguf |
| Bytes | 4.683.073.536 (rund 4,36 GiB) |
| Erwarteter LFS-SHA-256 | 509287f78cb4d4cf6b3843734733b914b2c158e43e22a7f4bf5e963800894d3c |

[Offizielle Konfiguration](https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct/raw/main/config.json) liefert die Dimensionen. Das vorhandene node-llama-cpp 3.22.2 führt bereits Qwen2 aus; das ist ein technischer Kompatibilitätsindikator, **kein realer 7B-Lade-/GGUF-Abnahmenachweis**. Das gepinnte SHA-256 ist die erwartete Identität der späteren Datei, nicht die Prüfsumme eines bereits lokal vollständig geprüften 7B-Modells.

Tatsächliche Quellstand-Vorprüfung (`scratch/session23-source-model-status.json`): Nach einer Gewichteablage blieben rund 18 GiB, weniger als die erhaltene 20-GiB-Startreserve. Mindestens 26.157.910.016 Byte, rund 24,36 GiB, wären allein für diese Datei plus Reserve vorab nötig. Temporäre zusätzliche Kopien und Installations-/Backuppuffer sind noch nicht enthalten.

Konservative RAM-Schätzung bei 2048 Kontext: 6.273.999.668 Byte, rund 5,84 GiB (Gewichte × 1,2 + F16-KV + 512 MiB). Aktuelles Budget nach Systemreserve im gespeicherten Prüflauf: 5.175.289.446 Byte, rund 4,82 GiB. Ein späterer kontrollierter Austausch kann Speicher des kleinen Workers zurückgewinnen, aber gleichzeitiges blindes Laden ist nicht zulässig; eine laufende WSL-VM würde weitere Ressourcen beanspruchen. Große parallele RAM-Belegung wurde nicht ausprobiert.

**Ergebnis: 7B nicht heruntergeladen, nicht installiert, nicht registriert, nicht geladen.** Deshalb keine 7B-CPU-Geschwindigkeit, kein tatsächlicher 7B-RAM-Verbrauch und keine 7B-Coding-Qualität gemessen. Die Anbindung ist vorbereitet; der Vergleich bleibt offen. Modellbetrieb darf nicht durch Unterlaufen der Runnerreserve erzwungen werden.

## Spätere Modelle – nur Vormerkungen

| Kandidat | Gegenwärtige Behandlung |
|---|---|
| Qwen3-Coder-30B-A3B-Instruct | Vorhandenes Profil erhalten; bevorzugter späterer stärkerer Coder, keine lokalen Gewichte und keine 30B-Abnahme |
| Qwen3-Coder-Next | Offiziell 80B Gesamtparameter / 3B aktiv; hybrider Aufbau. Neue gesperrte Vormerkung; 40 GB ist nur eine theoretische 4-Bit-Gewichtsuntergrenze, keine gemessene GGUF-Größe |
| Devstral Small 2 24B | Neue gesperrte Vormerkung. Offizieller Upstream ist nicht automatisch eine akzeptierte GGUF-Konvertierung; 12 GB nur theoretische 4-Bit-Untergrenze. Text-/Multimodalbehandlung, Template und Backend offen |

Beide neuen Upstream-Kataloge nennen Apache-2.0. Keine Coder-Next-/Devstral-Gewichte oder zusätzlichen Bibliotheken heruntergeladen. Quellen: [Qwen3-Coder-Next](https://huggingface.co/Qwen/Qwen3-Coder-Next), [Devstral Small 2](https://huggingface.co/mistralai/Devstral-Small-2-24B-Instruct-2512). Abgelegte Metadatenbelege: `scratch/session23-upstream-models.json`.

## Tatsächlich gemessene vorhandene Inferenz

Modell: qwen2.5:1.5b, vorhandener CPU-Worker und Live-API 1.19.0. Drei feste kleine Textaufgaben mit JSON-Schema: Additionsfehler korrigieren, zuständige Datei eines Zweidateiprojekts auswählen, strukturierte `read_file`-Anforderung erzeugen. Diese Proben sind ein reproduzierbarer Ausgangspunkt für denselben späteren 7B-Vergleich, **kein realistischer vollständiger Coding-/Build-/Testnachweis**.

| Aufgabe | Ende-zu-Ende | Erstes Textstück | Höchster gesampelter Worker-RSS | Referenztext |
|---|---:|---:|---:|---|
| Additionskorrektur | 5,47 s | 3,62 s | 1.041.805.312 Byte | JSON und Literalreferenz passend |
| Dateiauswahl | 5,35 s | 3,45 s | 1.045.430.272 Byte | JSON und Literalreferenz passend |
| Strukturierte Leseaktion | 4,68 s | 3,09 s | 1.052.487.680 Byte | JSON und Literalreferenz passend |

Zusätzliche Nicht-Streaming-Messung derselben ersten Aufgabe: 27 Ausgabetoken in 4,97 s, **5,43 Ausgabetoken/s Ende-zu-Ende**, einschließlich Prompt-/HTTP-Aufwand, keine reine Decoder-Geschwindigkeit. SSE liefert aktuell keine Nutzungszahl; deshalb keine Tokenzahl aus Zeichen geschätzt. RSS stammt aus Worker-Prozessmeldungen und ist ein gesampelter Wert, kein garantierter absoluter Peak und kein vollständiges Speicherbilanz-/Kaltstartmaß. Hintergrundprogramme liefen weiter.

Beleg: `scratch/coding-api-benchmark-49b45b32-e2ce-4f81-91d2-fed24fbba581.json`. Alle drei strukturierten Kleinproben passen diesmal zur Literalreferenz. Das widerlegt den früheren fehlerhaften freien 1,5B-Vorschlag nicht und beweist keine allgemeine Zuverlässigkeit. Es wurde kein Code ausgeführt oder übernommen, auch keine Modellaktion dispatcht. Native OpenAI-Funktionsaufrufe sind weiterhin nicht freigegeben; hier wurde ausschließlich das vorhandene AMU-JSON-Werkzeugprotokoll geprüft. **Kein Vergleichsergebnis für das nicht installierte 7B-Modell.**

## Runner, Systemfreigaben und kürzester Fortgang

Aktueller Vorbereitungslauf wählt C: als geeignetes vorhandenes internes NTFS-Ziel, während die HDD ausgeschlossen bleibt. Die verbleibenden tatsächlichen Blockaden sind VMP, modernes WSL und ein aktiver Hypervisor; Rootless Docker/Containerabnahme folgen erst danach. Kein echter Runner und keine echte isolierte Mehrdateien-/Build-/Test-/Reparaturausführung erfolgt.

Konkrete gesonderte VMP-Freigabe wurde dem Eigentümer vorgelegt: `dism.exe /Online /Enable-Feature /FeatureName:VirtualMachinePlatform /All /NoRestart` über Windows-UAC, ausschließlich dieses Feature samt erforderlichen Windows-Abhängigkeiten. Kein Reboot, keine Linux-/Docker-Installation und keine HDD-Änderung daraus ableiten. Vollständiger Maßnahmen-/Wiederanlaufplan: `scratch/session23-vmp-approval.md`. Ausführung nur nach tatsächlicher Antwort. Der zum Abschluss vorliegende Freigabe-/Ausführungsstatus steht in `scratch/session23-closeout.json`; ein ausgeführter Schritt muss zusätzlich `session23-vmp-result.json` mit Exitcode und tatsächlicher Featureabfrage besitzen. Ein Plan oder Skript gilt nicht als aktiviertes Feature.

Nach einer erfolgreichen Aktivierung ist ein **separat genehmigter Windows-Neustart** einzuplanen. Zuvor Arbeitsstände, aktive API-Aufträge und Sicherungen geordnet abschließen; API-/Codex-Unterbrechung ankündigen. Danach tatsächliche Readiness, Version, Modell und Streaming prüfen. Kein doppelter Supervisorstart; der vorhandene Starter verweigert belegte Ports. Kein pauschaler Rollback oder Zurückkopieren produktiver Datenbanken.

Danach separate Freigabe für modernes WSL, dedizierte Ubuntu-24.04-LTS-Distribution, Node 24, Rootless Docker und ein verifiziertes lokales Node-Image. Vorgesehene Pfade: `C:\AMU-Runner\WSL\AMU-Runner`, Installationsmaterial `C:\AMU-Runner\Install`, Swap `C:\AMU-Runner\WSL\swap.vhdx`. Diese Verzeichnisse wurden nicht angelegt. Die genaue installierte Linux-/Docker-/Imagegröße ist ohne Bereitstellung nicht gemessen. Das 20-GiB-Startbudget ist ein Sicherheits-/Planungsbudget, keine angeblich gemessene Paketgröße. Zunächst VM 4 GiB / 2 CPUs / 1 GiB Swap, ein Auftrag, 512 MiB / 1 CPU / 32 Prozesse; Wirkung auf aktuelle Inferenz nach realer Einrichtung messen. Linux-native Dateien, keine Windows-Mounts/Interop, cgroup v2, mTLS und unabhängige Containerabnahme bleiben zwingend.

Erst nach dieser Abnahme den kleinen Mehrdateienworkflow mit echtem Fehler, Korrektur und erneut bestandenen Tests durchführen; Übernahme gesondert genehmigen. Vor der zusätzlichen 7B-Datei mehr freigegebenen Speicher und RAM nachweisen oder Ressourcenplanung ausdrücklich neu entscheiden. Keine weiteren Löschungen, Hardwarekäufe, neuen Modellserver oder Cloud-Anbieter ausgeführt.

## Prüfungen und Sicherungen

- Vor Änderungen API-Vollsicherung ohne Gewichte-Neukopie erstellt und authentifiziert verifiziert: `778af98d-f046-40ee-92df-69a586ad2563`, SHA-256 `d785d2708a9f915dff3dc215c9b327d82a8ddf1adf742f0b004106f545f7ddc1`. Die laufende Version 1.19 sichert config noch nicht; unveränderte Policy zusätzlich durch das geprüfte Konfigurationsergänzungsarchiv `9957ac0e-e212-479a-8e62-953080f3b44d` samt USB-Kopie erhalten. Keine vorhandene Sicherung gelöscht.
- Neue `session23-models.test.mjs` bestanden: offizielle Identität/Dimensionen, falsches SHA und Umbenennung kleiner Modelle verweigert, Disk-/RAM-Grenzen, rein vorgemerkte Kandidaten gesperrt, unabhängiges C:-Ziel trotz HDD-Sperre. Keine nativen Modelle geladen oder Downloads.
- Relevante Sitzung-10-Coding-/Dashboard- und Sitzung-11-/12-Dashboard-Regressionen bestanden; tatsächliche lokale HTTP-/Handler-/Datei-/Git-Operationen in Testfixtures, Modellsteuerung dort nicht mit großen Gewichten geprüft. Profilanzahl in bestehenden Tests auf sechs angepasst, Fallback- und 30B-Profilpositionen erhalten.
- Sitzung-17-Vorbereitung und Sitzung-20-Eigentümersperre bestanden. Paketintegrität für `scratch/session23-runner-handoff` mit Manifest-SHA-256 `9bd7e2f39648141a70898fc701ac73cfef00b3786cd9dfe26d6edc155a9bed53` tatsächlich geprüft. Keine Übertragung/Installation.
- TypeScript `tsc --noEmit`, Benchmark-Syntax und vorbereiteter PowerShell-VMP-Befehl per Parser geprüft. Kein Projektbuild auf Windows und kein Linux-Erfolg aus Fixtures abgeleitet.
- Live-API: Modellliste mit Schlüssel 200/ohne Schlüssel 401, SSE bis DONE, Clientzugriff auf Administration verweigert. Adminseite 200 und inline-JavaScript syntaktisch gültig. Kein neuer interaktiver Admin-Browsertest behauptet.
- AMU WEB: exakt die beiden Hauptkarten, Quellhashes unverändert, drei Websites/drei Seiten/drei Versionen sowie zwei Mailboxen/sechs Nachrichten erhalten; SQLite quick_check ok, Start/Admin erreichbar. Kein interaktiver Mailversandtest behauptet; bestehender Kommunikationsumfang nicht erweitert. Keine WEB-Dateien geändert.

Endgültiger Commit, sauberer Git-Zustand, aktuelle freie Ressourcen, Live-Version, tatsächlicher Windows-Freigabestatus und Abschlusssicherung werden nach Abschluss unter `scratch/session23-closeout.json` protokolliert. Installiert und real getestet bleibt ausschließlich der vorhandene 1,5B-Fallback. Stärkere Gewichte und der echte Linux-Coding-Workflow sind weiterhin offen.

## Tatsächliche VMP-Aktivierung nach Eigentümerfreigabe

Am 27.10.2026 um 21:29 UTC wurde ausschließlich VirtualMachinePlatform über Windows-UAC mit /All /NoRestart aktiviert. DISM-Exitcode 3010; Win32_OptionalFeature InstallState wechselte von 2 auf 1. Windows fordert einen Neustart. Kein Neustart, keine Linux-/Docker-Installation und keine HDD-Änderung durchgeführt. Beleg: scratch/session23-vmp-result.json. Der Hypervisor und ein echter isolierter Runner sind damit noch nicht als betriebsbereit nachgewiesen. C: direkt danach 22.996.144.128 Byte frei (21,42 GiB). Die zuvor beschriebenen VMP-Blockaden beziehen sich auf die Bestandsaufnahme vor diesem freigegebenen Schritt; nächster Schritt ist die separate Neustartfreigabe.

