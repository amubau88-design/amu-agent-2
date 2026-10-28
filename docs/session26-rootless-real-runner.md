# Sitzung 26 – echte Rootless-Container und erster lokaler Modell-Codingtest

Datum: 28.10.2026. Ausgangsstand 1.23.0 / 1e62455, Git sauber, API 1.22.0. Neuer Quellstand 1.24.0; finaler Commit und aktuelle Ressourcen: scratch/session26-closeout.json. Kein Windows-Neustart, keine HDD-/AMU-SYSTEM-/WEB-Quelländerung und kein Modell-Download.

## Tatsächlich genehmigt und installiert

- L26: ausschließlich AMU-Runner. Node 24.22.1 Linux x64, offizielles nodejs.org-Archiv 32.026.916 Byte, SHA-256 6c172a9ab6718f7b801fb5a7bd486af2ee5e32758086a04b84fcce2aa77095e6. Offizielle HTTPS-Checksumme geprüft; keine GPG-Signaturprüfung des Node-Tarballs behauptet.
- Docker CE/CLI/Rootless-Extras 29.8.2, containerd.io 2.4.2, Buildx 0.38.1 und neue Ubuntu-Abhängigkeiten. Docker-Repository noble/stable mit eigenem Signed-By-Schlüssel; Herausgeberfingerprint 9DC858229FC7DD38854AE2D88D81803C0EBFCD88 tatsächlich geprüft. APT-Resolver verweigerte Entfernung/Upgrade bestehender Pakete und begrenzte die geplante Größe. Protokollierte neue Paketgröße 351.478 KiB, Downloads 94.338.022 Byte, zusätzlich Node und Metadaten. Kein apt upgrade, keine Cachelöschung.
- Rootful docker.service/docker.socket/containerd.service vor Installation maskiert, danach als maskiert/inaktiv geprüft. Nur Rootless-Benutzerdienst amu-runner, Unix-Socket /run/user/1000/docker.sock. Keine TCP-Docker-API oder Gruppen sudo/docker für den Benutzer. Neue cgroup-Delegation und Linger wie freigegeben eingerichtet.
- Tatsächlicher Rootless-Wiederanlauf nach gezieltem Linux-Neustart bestand; keine Ressourcenwarnungen, systemd/cgroup v2/Seccomp, damals 0 Images/0 Container. Gemessener Dienstspeicher zunächst etwa 223 MiB, nach Wiederanlauf etwa 247 MiB; kein garantierter Gesamt-/Peakverbrauch aller Container daraus abgeleitet. WSL-Grenzen unverändert 2 CPUs/4 GiB/1 GiB Swap.

Herstellergrundlagen: [Docker Ubuntu](https://docs.docker.com/engine/install/ubuntu/), [Rootless Docker](https://docs.docker.com/engine/security/rootless/), [Node-Veröffentlichung](https://nodejs.org/dist/v24.22.1/SHASUMS256.txt). Keine Cloud-Inferenz verwendet.

## Reales Image und nachgewiesene Fehlerkorrektur

I26 wurde separat genehmigt. Offizielles Node 24.22.1-bookworm-slim für Linux amd64 per unveränderlichem Manifest sha256:2dd9a4f758e173b65fee15388f7706af6fb01ef50cf7a2c0538711d67a6981ae. Metadaten-Digest überprüft, Schichten zusammen 81.042.384 Byte komprimiert. Daraus vorhandenes AMU-Dockerfile/entry.mjs gebaut, ohne Projekt-Hostcode, Windows-Bindmount oder weitere Paketinstallation. Der beabsichtigt fehlende Standardwert für BASE_IMAGE erzeugte eine Buildwarnung; tatsächlich wurde immer das explizite lokale Digest-Image verwendet.

Die erste echte Abnahme scheiterte. Eine kontrollierte Diagnose bewies: Dienst-umask 0077 machte die Eingabekopie 0700/0400, sodass Container-UID 1000 im Rootless-Namespace /input nicht lesen konnte. Mit umask 0022 bestand derselbe Test; mit 0077 wurde Permission denied [/input] reproduziert. Adapter korrigiert: ausschließlich genehmigte Eingabekopie explizit 0755/0444, umschließender privater Zustandsordner bleibt 0700. Read-only-Bind bleibt erzwungen. Keine globale Lockerung der Dienst-umask.

Danach bestand die reale Abnahme unter 0077. Zusätzlich verbessert: Timeout/Abbruch verlangt einen tatsächlich vom Kindprozess ausgegebenen Startmarker; Read-only-Nachweis prüft Mountflags statt nur eines möglicherweise durch fehlende Schreibrechte verursachten Fehlers. Kein Fixture wurde als Containererfolg umetikettiert. Erster Bericht unverändert archiviert und lokal gesichert.

## Tatsächlicher Modellauftrag

Nach bestandener Isolation neues harmloses Dreidateienprojekt ausschließlich als Linux-native Container-Eingabekopie geprüft. Ausgangsfunktion sum(a,b)=a-b: echte Unit-Tests fehlgeschlagen. Lokales eingebettetes Qwen2.5-1.5B erzeugte als JSON die Korrektur export const sum=(a,b)=>a+b;. Echte Syntaxprüfung und drei Fälle (positiv, negativ, null) im begrenzten Container bestanden. Git-Diff als Reviewartefakt erstellt, keine bestehende Projektdatei übernommen. Nach der zusätzlichen Core-Sicherheitsänderung derselbe Modellvorschlag auf dem endgültigen Image erneut erfolgreich geprüft, ohne unnötige zweite Modellgenerierung.

Belege: scratch/session26-model-coding-result.json, scratch/session26-model-review/change.diff, scratch/session26-core-crash-proof.json. Dieser kleine Erfolg beweist keine allgemeine selbstständige Programmierqualität des 1,5B-Modells und noch keinen vollständigen AMU-Admin-End-to-End-Workflow.

## Unerwarteter Windows-Speicherverbrauch und gesonderte Freigaben

C: sank während fehlgeschlagener Tests zeitweise unter die 16-GiB-Sperrgrenze. Weitere Jobs/Installationen wurden angehalten und der Verbrauch lesend eingegrenzt. WSL kernel.core_pattern war |/wsl-capture-crash %t %E %p %s. Die Node-Abstürze wurden außerhalb des Container-Dateisystems als Windows-Dumps gespeichert. Acht große neue Dateien: 4.725.538.816 Byte (4,40 GiB). Linux selbst belegte zu diesem Zeitpunkt etwa 3 GiB, Docker-Daten rund 554 MiB. Windows-Auslagerungsdatei unverändert gelassen.

- Q26 separat ausdrücklich genehmigt: genau die acht nach Name/Größe/Zeit erneut geprüften Dateien gelöscht. Andere Dateien im WSL-Crash-Verzeichnis erhalten. Tatsächlich entfernte Bytezahl und freier Platz davor/danach in scratch/session26-dump-cleanup-result.json. Keine pauschale Temp-/Backup-/Modellbereinigung.
- C26 separat ausdrücklich genehmigt: Linux-Kernelwert auf core umgestellt, neue /etc/sysctl.d/60-amu-runner-core.conf und vorhandenen Linux-Schutzdienst ergänzt. Kernelwert gilt WSL-weit; vorher ausschließlich AMU-Runner registriert. Keine Windows-Registry/.wslconfig/Firewall-/Auslagerungsänderung. Alter Wert/Schutzdienst gesichert. Schutzdienst neu gestartet; kein weiterer Betriebssystem-Neustart daraus abgeleitet.
- Jeder Container erhält jetzt core=0:0. WSL-Adapter verweigert gepipete/fehlende/unbekannte Core-Policy. Abnahme verlangt tatsächlich abgelesenes Null-Limit in /proc/self/limits. Prozesslimitprobe verwendet einfache sleep-Prozesse, um unnötige V8-Abstürze bei Threadmangel zu vermeiden; das tatsächliche PID-Limit/EAGAIN bleibt erforderlich.
- Image lokal aus bereits vorhandener Basis neu gebaut, keine weiteren Schichten/Pakete heruntergeladen. Alte Images und Prüfberichte nicht gelöscht. Aktualisierte vollständige Abnahme bestanden, Windows-Dump-Bestand dabei unverändert. Zusätzlicher einzelner Crash-Test und abschließender Nachweis in scratch/session26-core-crash-proof.json.

Die neue Core-Policy ist konfiguriert und durch Dienst-/Jobprüfungen nachgewiesen. Ein vollständiger erneuter Windows-/WSL-Boot wurde nach C26 nicht durchgeführt; vor jedem Job wird der tatsächliche Kernelwert erneut kontrolliert und bei Abweichung blockiert.

## Tatsächliche Prüfungen und gegenwärtige Grenzen

- Reale finale Containerbeobachtungen: nicht root, nur Loopback/kein Netzwerk, keine Secrets, read-only Root/Input, NoNewPrivileges, alle Fähigkeiten entfernt, Seccomp, memory.max 536870912, pids.max 32, cpu.max 100000 100000 samt beobachteter Drosselung, Core-Limit 0.
- Reale Zeitüberschreitung mit gestartetem Prozessbaum, Abbruch, Ausgabelimit, erzwungener OOM, PID-Limit, Build/Unit/Integration, absichtlicher Fehler und erfolgreiche Korrektur. Containerbereinigung durch Adapter verifiziert. Finales Ergebnis und Hash in scratch/session26-closeout.json; keine automatische Produktionsfreigabe.
- mTLS-/Freigabe-/Abbruch-/Wiederherstellungsregressionen Sitzung 14/15/16 und Lifecycle bestanden. Echter TLS-Transport dabei, Executor in diesen Regressionen ausdrücklich Fixture; keine reale Linux-Abnahme daraus behauptet. Zusätzliche Rootless-Metadaten- und Hostgrenzenprüfungen, Abnahmeschema mit fehlendem Core-Nachweis verweigert, TypeScript noEmit und Syntaxprüfungen bestanden.
- API 1.22.0 und Qwen-Streaming vor/nach Linux-Arbeit geprüft; Clientauthentifizierung erhalten. WEB-Quellhashes unverändert, exakt Meine Websites und E-Mail & Kommunikation, drei Websites/drei Seiten/drei Versionen, zwei Mailboxen/sechs Nachrichten; SQLite quick_check ok, Home/Admin erreichbar. Kein interaktiver Login-/Mailversandtest behauptet. MySQL ping erfolgreich, keine SQL-/XAMPP-Konfiguration verändert.
- Neue echte Test-CA/Server-/Clientdateien mit privaten Rechten und offline OpenSSL-Zweckprüfung. Kurzlebige Testidentitäten, kein laufender mTLS-Runnerdienst. Zentrale Runner-Produktionsaktivierung und Übernahme in bestehende Projekte bleiben false.

Nächste Schritte: finale Berichte unabhängig prüfen, reguläre Runneridentität über vorhandene Zertifikatsverwaltung provisionieren, Loopback-mTLS-Dienst und zentrale Registrierung kontrolliert freigeben, vollständigen echten Auftrag im Admin-Workflow einschließlich Freigabe/Git/Restore abnehmen. Windows-/WSL-Wiederanlauf und Core-Policy beim nächsten geplanten Boot prüfen. Kein größeres Modell installieren; zuerst Ressourcen neu bewerten und ausdrücklich freigeben lassen.

Git-/Quell- und verschlüsselte Konfigurationssicherung sind im Abschlussnachweis aufgeführt. Neue Sicherung umfasst Quellstand und Linux-Konfiguration/Testidentitäten, keine VHD-/Image-/Modell-Neukopie. Frühere Vollsicherungen samt bekanntem Langpfad-Prüfhinweis unverändert erhalten. Freier Speicher/RAM vor/nach und exakte Nettoänderung stehen ebenfalls dort.
