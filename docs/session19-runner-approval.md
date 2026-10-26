# Sitzung 19 · Verbindlicher Hostschutz und noch ausstehende Einrichtung

Projekt-/Quellstand **1.17.0**, Ausgang 1.16.0 / Commit `1113c9b`, Arbeitsbaum zuvor sauber. Ausschließlich AMU-Agent-2 geändert. Es gibt weiterhin **keine Eigentümerfreigabe zur Partitionierung oder Formatierung**. Es wurden keine Datenträger initialisiert/partitioniert/formatiert, Daten verschoben/gelöscht, Windows-Komponenten aktiviert, Pakete installiert, Zertifikate produktiv ersetzt oder Neustarts angefordert. Keine Änderung an anderen Projekten oder Computern.

## Erneut tatsächlich geprüft

Die frische ausschließlich lesende Inventur bestätigt Datenträger **1**, ST1000DM003-1ER162, SATA, MBR, **1.000.204.886.016 Byte** physische Kapazität, **0 Partitionen**, online/nicht schreibgeschützt, kein System-/Bootdatenträger. Größter nicht zugeordneter Bereich: **1.000.202.043.392 Byte** (ca. 931,51 GiB). Gerätefingerabdruck **`e9b4a6627084fdeb30a1a28c74aafe10ced0deaa6c111388c52ffeb75d844f62`** stimmt exakt mit Sitzung 18 überein. Keine Aussage darüber, ob frühere Daten benötigt werden oder noch rekonstruierbar sind.

SSD C: weiterhin knapp, ca. **5,67 GiB frei**. SSD-System-/Recovery-Partitionen bleiben unangetastet. D: CD-ROM, E: exFAT-USB „AMU-BACKUP“ mit ca. 29 GiB frei; R: weiterhin nicht belegt. Der USB wurde nicht beschrieben und ist kein dauerhaftes Runnerziel. Vollständige neue Metadaten: `scratch/session19-storage.json`.

Windows 10 Pro Build 19045; Xeon E3-1230 V2, 4 Kerne/8 Threads, ca. 23,9 GiB RAM und zum Messzeitpunkt 7,59 GiB frei, CPU-Last 15 %. BIOS-Virtualisierung/VT-x/SLAT aktiv. WSL-Windows-Komponente aktiviert, **VirtualMachinePlatform deaktiviert, Hypervisor nicht aktiv**. Vorhandenes WSL erkennt `--version` nicht; keine Linux-Distribution installiert. Docker/Podman weiterhin nicht vorhanden. Rohbeleg: `scratch/session19-environment.json`. Keine Voraussetzung ist durch erneute Abfrage aktiviert worden.

Die vorhandene verschlüsselte AMU-Sicherung **`08cf0a66-e5c9-4f51-82a5-e33dc6026d13`** wurde vor Änderungen erneut verifiziert (SHA-256 `c62c58782eb34e3d7dc62cb82713b89970956b969879e3a05a8c4d35196ffd26`). Diese Sicherung schützt das AMU-Projekt und seinen Zustand, **nicht die gesamte Windows-Installation oder mögliche frühere HDD-Daten**. Die Inventur ist kein binäres Datenträgerabbild und ermöglicht kein garantiertes Rückgängigmachen einer Formatierung. Bei relevanten früheren Daten zuerst eine geeignete Datensicherung/Datenrettungsprüfung veranlassen, keine Schreibänderung freigeben.

## Tatsächliche Implementierung

Die Integrationsprüfung fand eine reale Lücke: Windows-Automount-/Interop-/Gruppenprüfungen lagen im optionalen Linux-Vorprüfskript, während der tatsächliche Docker-Adapter diese Hostgrenze nicht selbst erzwang. Ein ausgelassenes Vorprüfskript hätte damit einen schwächer vorbereiteten WSL-Host zugelassen.

Jetzt erzwingt **der tatsächliche Adapter vor dem Docker-Zugriff** denselben Hostschutz: echtes Nicht-Root-Linux, systemd als PID 1, keine sudo-/wheel-/rootful-docker-Gruppen. Unter WSL zusätzlich explizite Boot-/Automount-/fstab-/Interop-Konfiguration, kein aktiver Windows-Interop-Handler, keine 9p-/DrvFs-Freigabemounts und kein Zustand unter `/mnt/<Windows-Laufwerk>`. Die Linux-Vorprüfung verwendet diese gemeinsame Implementierung, statt eine abweichende Kopie. Unbekannte oder fehlende Werte bleiben gesperrt.

Der Zustand benötigt außerdem mindestens **2 GiB tatsächlich für den nicht privilegierten Benutzer verfügbaren Dateisystemplatz**. Prüfung beim Runtime-Vorlauf und erneut bei Auftragszulassung, bevor Eingangsdateien geschrieben werden. Fehlerhafte Statistik oder weniger Platz sperrt die Ausführung. Diese Reserve ist keine neue Dateisystemquota und keine Garantie gegen externe parallele Plattenbelegung. Die bestehenden Containergrenzen bleiben: 256 MiB Arbeits-tmpfs, 16 MiB temporäres tmpfs, schreibgeschützter Eingang und Root, kein Netzwerk, CPU/RAM/PID-/Ausgabe-/Zeitlimits und bestätigte Containerbereinigung. Reale Durchsetzung muss nach Einrichtung erneut abgenommen werden.

Die reine WSL-Konfigurationsvorlage deaktiviert nun zusätzlich GUI-Anwendungen. Dadurch sollen für den reinen Runner unnötige WSLg-/9p-Freigaben vermieden werden; die Runtime akzeptiert solche Freigaben trotzdem nicht. Die Vorlage wird nicht automatisch installiert. Die Codeänderung verändert den Adapterhash; frühere Abnahmen werden dadurch ungültig. Es gibt keinen Schalter zum Umgehen dieser Prüfung.

Gegenseitiges TLS, exakte Profil-/Snapshot-/Freigabebindung, Timeout, Abbruch, Quarantäne und Ergebnisabgleich bleiben erhalten. Ohne bereitgestellte IP, eigene echte Zertifikate und unabhängige Abnahme wurde keine produktive Runnerverbindung eingetragen. Bestehende API-Schlüssel und Rechte wurden nicht erweitert oder rotiert. Lokale Qwen-Inferenz und Modellprofile unverändert; kein Download oder kostenpflichtiger Provider.

## Freigabe A – HDD: konkreter Gegenstand und noch nicht ausgeführte Befehle

Betroffen wäre ausschließlich die oben identifizierte interne HDD, zum Inventurzeitpunkt Datenträger 1. Vorgeschlagen: **100 GiB = 107.374.182.400 Byte**, neue NTFS-Partition **R:** mit Label **AMU-RUNNER**. MBR bleibt MBR; keine Neuinitialisierung oder GPT-Konvertierung. Der übrige Bereich (ca. 831,5 GiB) bleibt unzugeordnet und unverändert. C:, E: und alle bestehenden Partitionen bleiben erhalten.

Risiko: Partitionsanlage/Formatierung schreibt Metadaten auf die HDD und kann die Wiederherstellung früherer Daten beeinträchtigen. Ein fehlender Laufwerksbuchstabe oder null erkannte Partitionen ist keine Bestätigung, dass dort keine benötigten Daten liegen. Erforderliche Eigentümerbestätigung: **Frühere Daten sind nicht mehr erforderlich beziehungsweise anderweitig geeignet gesichert; genau dieser neue 100-GiB-Bereich darf eingerichtet werden.**

Die folgenden Befehle sind ausschließlich zur Prüfung vorgelegt. **Nicht ausgeführt, keine Freigabe durch Vorhandensein dieses Dokuments.** Vor einer späteren Ausführung erneut die Sicherung verifizieren, aktuelle vollständige Inventur und Gerätebindung prüfen und bei jeder Abweichung abbrechen. PowerShell-7-Syntax wurde anhand lokal vorhandener Befehlsmetadaten geprüft; kein `New-Partition`-/`Format-Volume`-Probelauf durchgeführt.

```powershell
# Erst nach gesonderter ausdrücklicher Eigentümerfreigabe in administrativer PowerShell 7:
$amuRunnerDisk = Get-Disk -Number 1 -ErrorAction Stop
$amuIdentity = [ordered]@{
  uniqueId = [string]$amuRunnerDisk.UniqueId
  model = [string]$amuRunnerDisk.FriendlyName
  bus = [string]$amuRunnerDisk.BusType
  bytes = $amuRunnerDisk.Size
} | ConvertTo-Json -Compress
$amuHasher = [Security.Cryptography.SHA256]::Create()
try {
  $amuIdentityHash = [Convert]::ToHexString(
    $amuHasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($amuIdentity))
  ).ToLowerInvariant()
} finally { $amuHasher.Dispose() }
if ($amuIdentityHash -ne 'e9b4a6627084fdeb30a1a28c74aafe10ced0deaa6c111388c52ffeb75d844f62') {
  throw 'Andere HDD-Identität: abbrechen und neu prüfen'
}
if ($amuRunnerDisk.IsBoot -or $amuRunnerDisk.IsSystem -or $amuRunnerDisk.IsOffline -or
    $amuRunnerDisk.IsReadOnly -or $amuRunnerDisk.PartitionStyle -ne 'MBR' -or
    $amuRunnerDisk.NumberOfPartitions -ne 0 -or $amuRunnerDisk.LargestFreeExtent -lt 107374182400) {
  throw 'Datenträgerzustand geändert: abbrechen'
}
if (@(Get-Volume -ErrorAction Stop | Where-Object DriveLetter -eq 'R').Count -ne 0) {
  throw 'R: bereits belegt: abbrechen'
}
$amuRunnerPartition = New-Partition -InputObject $amuRunnerDisk -Size 107374182400 -DriveLetter R -MbrType IFS -ErrorAction Stop
Format-Volume -Partition $amuRunnerPartition -FileSystem NTFS -NewFileSystemLabel 'AMU-RUNNER' -Confirm -ErrorAction Stop
Get-Volume -DriveLetter R -ErrorAction Stop | Select-Object DriveLetter,FileSystem,Size,SizeRemaining
```

Die Formatierung bezieht sich auf das gerade erzeugte Partitionsobjekt, nicht auf eine ungeprüft übernommene Laufwerkskennung. Kein `-Force`, keine volle Löschung und kein automatischer Rückbau anderer Partitionen. Bei Teilfehlern nicht blind wiederholen, sondern Zustand erneut lesen. Offizielle Referenz: [Microsoft New-Partition](https://learn.microsoft.com/en-us/powershell/module/storage/new-partition).

## Freigabe B – Windows, Linux und Speicherbedarf

Nach gesonderter Zustimmung zu Windows-Änderungen:

```powershell
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
```

Dieser Befehl wurde nicht ausgeführt. Kein pauschales Hyper-V-/Sandbox-Einschalten, keine Firewall-/Portproxy-/Bootänderung. Den erwarteten **Windows-Neustart separat** abstimmen: vorab aktive Aufträge und Sicherungen geordnet beenden; API-Unterbrechung ankündigen; danach API/Qwen erneut prüfen. Der Befehl selbst verlangt keinen sofortigen Neustart. [Microsoft: WSL-/VirtualMachinePlatform-Voraussetzung](https://learn.microsoft.com/en-us/windows/wsl/install-manual).

Modernes systemd-fähiges WSL und eine verifizierte offizielle Linux-Rootfs-Datei erst nach Installations-/Downloadfreigabe bereitstellen. Kein Installationspaket und kein Basisimage wurde hier heruntergeladen. WSL-/Linux-Komponenten und Rootless-Werkzeuge brauchen eigene Freigabe; die konkrete spätere Paketauswahl und tatsächlichen Paketgrößen sind deshalb noch nicht abschließend gemessen. Es wäre falsch, Planungsbudgets als bereits gemessenen Installationsbedarf auszugeben.

| Bereich | Vorgesehener Ort / Grenze |
| --- | --- |
| Windows-/WSL-Hostkomponenten | Weiterhin C:, vor Einrichtung freien Platz und Servicing-Bedarf erneut prüfen; 5,67 GiB sind knapp und keine Installationsgarantie |
| Linux-VHDX | `R:\AMU-Runner\WSL\AMU-Runner`, innerhalb der neuen 100-GiB-Partition |
| Eigene Installationsdateien | `R:\AMU-Runner\Install`, keine Migration vorhandener Dateien |
| WSL-Swap | `R:\AMU-Runner\WSL\swap.vhdx`, 1 GiB, nicht standardmäßig auf C: |
| Linux/Node/Rootless Docker/Offline-Image/Projektzustand | Innerhalb der Linux-VHDX, zunächst mindestens 20 GiB Startreserve; konservativ grob 20–30 GiB Gesamtstartbudget, keine gemessene Paketgröße |
| VM-RAM/CPU | 4 GiB RAM / 2 virtuelle CPUs; nach Einrichtung Auswirkung auf bestehende Inferenz messen |
| Auftragsstart | Ein Auftrag gleichzeitig, zunächst 512 MiB RAM / 1 CPU / 32 Prozesse / 10 Sekunden / 8 KiB Ausgabe |
| Temporäre Projektdateien | Container-tmpfs 256 MiB plus `/tmp` 16 MiB, kein dauerhaftes Projektvolume |
| Runnerzustandsreserve | Mindestens 2 GiB nicht privilegiert verfügbar; neue Zulassung bei Unterschreitung gesperrt |

Nach bestätigter Partition und freigegebener verifizierter Rootfs-Datei wäre der konkrete Import:

```powershell
wsl --import AMU-Runner "R:\AMU-Runner\WSL\AMU-Runner" "R:\AMU-Runner\Install\ubuntu-24.04-rootfs.tar" --version 2
```

Dieser Dateiname bezeichnet nur den geplanten geprüften Artefaktpfad, keine bereits heruntergeladene Datei. Keine andere Distribution oder bestehende Daten überschreiben. Die Linux-/TLS-/Image-/Benutzerdienstschritte aus [Sitzung 17](session17-runner-setup.md) gelten weiterhin; zusätzlich die jetzt verpflichtende Hostprüfung beachten. Ein eigenes überprüftes Image muss lokal vorhanden und unveränderlich gepinnt sein. Kein automatischer Image-Pull. Den USB nicht als Linux-/Container-/Datenbankziel verwenden.

## Tatsächlich durchgeführte Prüfungen

* Frische echte Windows-Datenträger-/Partitions-/Volume-/WSL-/Virtualisierungsabfragen, HDD-Identität gegen Sitzung 18 verglichen; bestehende verschlüsselte Sicherung erneut verifiziert.
* `tsc --noEmit`: bestanden. Kein Build erzeugt.
* `session19-boundary.test.mjs`: bestanden. Eigene Policy-Beobachtungen prüfen fehlende Hostgrenzen und 2-GiB-Grenzwerte; echte Windows-Verweigerung vor Zugriff auf einen Runnerzustand. Kein Linux und kein Container gestartet.
* Relevante Regressionen `session14-runner`, `session16-runner`, `session17-setup`, `session18-storage`: bestanden. Tatsächliches mTLS und Freigabe-/Abbruch-/Wiederherstellungslogik mit ausdrücklich vorgegebenem Ausführungsadapter; keine OS-Isolationsabnahme und kein Projektcode unter Windows.
* Syntaxprüfung des geänderten Linux-Vorprüfskripts bestanden; Vorbereitungspaket aus aktuellen Quellen mit neuen Adapterhashes erstellt und auf Integrität geprüft. Pfad `scratch/session19-runner-handoff`, Manifest-SHA-256 `64d917dd275a81b83a260692120777016ac7525a88acab9c5ed90d292312d24d`. Keine Übertragung.
* Echte lokale Qwen-SSE-Antwort mit `[DONE]`, `/health` und `/ready`, Modellliste mit Schlüssel 200/ohne Schlüssel 401. Anwendungsschlüssel für administrative Routen weiterhin 403. Vorhandener Auftrag und Git-Historie erhalten; 30B-Profil weiterhin nicht installiert und automatische Downloads aus.

Die bestehende API meldet bei dieser Prüfung **1.16.0 / ready** und eingebettete Inferenz bereit. Der neue Quellstand ist 1.17.0; ohne angeforderten Neustart wird er nicht als bereits neu gestartete API ausgegeben. Adminseite HTTP 200, Syntax des eingebetteten JavaScript und authentifizierter Bereitschaftsstatus wurden geprüft; kein neuer interaktiver Browsertest behauptet. Die PowerShell-Befehlsblöcke dieses Freigabeplans wurden ausschließlich mit dem Parser geprüft, nicht ausgeführt. Endgültigen Commit, sauberen Zustand, tatsächliche Live-Version und verschlüsselte Abschlussverifikation dokumentiert `scratch/session19-closeout.json`.

**Echter Linux-Runner: NEIN. Echte Projekt-Build-/Unit-/Integration-Ausführung: nicht durchgeführt und nicht abgenommen.** Kein Projektcode wurde ersatzweise auf Windows ausgeführt. Dateisystem-, Netzwerk-, Ressourcen-, Prozessbaum-/Timeout-, Bereinigungs- und Neustartnachweise in realen Containern bleiben wegen fehlender Umgebung und Freigaben offen. Die verschärften Softwareprüfungen ersetzen diese Abnahme nicht.

## Exakte nächste Schritte für Sitzung 20

1. Eigentümer klärt frühere HDD-Daten und erteilt gegebenenfalls Freigabe A für genau den bezeichneten 100-GiB-Bereich. Ohne diese Erklärung keine Schreibänderung.
2. Frische Geräte-/Layout-/Buchstaben- und Sicherungsprüfung, dann ausschließlich freigegebene Partition einrichten; tatsächlichen NTFS-Freiraum prüfen. Kein ungeprüfter Rückbau bei Fehlern.
3. Separate Freigabe B für VirtualMachinePlatform, moderne WSL-/Linux-/Rootless-Einrichtung und ein gesondertes Neustartfenster einholen. C:-Platzbedarf nochmals prüfen, ohne automatische Datenverschiebung.
4. Nach Neustart lokale API/Qwen wieder bereit nachweisen, eigenes Linux ohne Windows-Freigaben bereitstellen, Ressourcen-/Hostschutz wirklich prüfen, eigene echte mTLS-Identitäten einrichten und reale Containerabnahme mit aktuellem Code unabhängig prüfen.
5. Erst dann den ungefährlichen eigenen Test-Workspace vollständig mit echtem Fehler, gezielter Modellkorrektur, neuer isolierter Prüfung, separater Übernahmefreigabe, Git-Commit und Restore abnehmen. Kein kostenpflichtiger Provider und kein neues Hardwareprojekt.
