# Sitzung 16 · Praktische Runner-Voraussetzungen und sicherer Korrekturworkflow · 1.14.0

Ausgangspunkt: 1.13.0, Commit `549c692`, sauberes Arbeitsverzeichnis. Ausschließlich das bestehende AMU-Agent-2 wurde geändert. Die verschlüsselte vollständige Ausgangssicherung ohne erneute Modellkopie `d3075bc5-53f2-4acc-832a-c689d2ad27a1` wurde verifiziert (AES-256-GCM; SHA-256 `990a7837ceb215e857e1b5f00d4b738824b805d21eb583cb4ae6f8ae8dee5058`). Datenbanken, frühere Aufträge und Modellgewichte bleiben erhalten. Keine Installation, kein Modelldownload, kein kostenpflichtiger Dienst.

## Tatsächliche Ausführungsumgebung

Lesende Windows-Prüfung am 26.10.2026, einschließlich separat erlaubter CIM-Abfragen außerhalb der Sandbox:

| Gegenstand | Installiert / konfiguriert | Tatsächlich ausführbar / abgenommen |
| --- | --- | --- |
| Docker / Podman | Beide Befehle fehlen | Kein Containerlauf geprüft oder möglich über diese Befehle |
| WSL | `wsl.exe` vorhanden; WSL-Windows-Komponente aktiviert; Standardversion 2 | `wsl --status` endet mit Fehler; keine Distribution durch `wsl --list --quiet` bestätigt |
| Virtualisierung | Xeon E3-1230 V2; VT-x, SLAT und Firmwarevirtualisierung laut CIM aktiv | HypervisorPresent=false; VirtualMachinePlatform deaktiviert |
| Hyper-V / Windows Sandbox | Zugehörige optionale Komponenten deaktiviert; Sandbox-Befehl fehlt | Nicht geprüft / nicht nutzbar nachgewiesen |
| SSH | Client vorhanden | Kein Linux-Ziel konfiguriert oder getestet |
| Separater Linux-Runner | Benutzer ausdrücklich: „Noch keine Linux-Gegenstelle vorhanden“; produktive Runner-Verbindung nicht konfiguriert | Kein Netzwerk-, Container- oder Isolationsnachweis |

**Kein realer isolierter Runner läuft.** Es gibt keine nachgewiesene vollständige Entwicklung mit echten Builds und Projekttests. Die konkrete lokale Hürde ist die deaktivierte Windows-Komponente VirtualMachinePlatform plus fehlende Linux-/Container-Laufzeit, nicht pauschal ein deaktiviertes BIOS. Windows-Komponenten wurden nicht aktiviert, der Rechner nicht neu gestartet. Es gab keine Netzwerksuche und keine Änderungen an fremden Rechnern.

Neu: `pwsh -NoProfile -File scripts/runner-environment.ps1` erstellt eine rein lesende JSON-Bestandsaufnahme ohne Zugangsdaten, Installation oder Ausführungsfreigabe. Fehlende CIM-Rechte werden als unbekannt mit Einschränkung gemeldet. Die vorhandene Windows-PowerShell-Skriptrichtlinie blockierte den ersten Aufruf; diese Richtlinie wurde nicht verändert oder umgangen. Der bestehende PowerShell-7-Aufruf funktionierte. Ein gefundener Befehl wird ausdrücklich nicht als funktionsfähige oder sichere Laufzeit dargestellt. Belege lokal unter `scratch/session16-environment.json`, `session16-windows-virtualization.json` und `session16-windows-features.json`.

## Implementierte Änderungen

### Gezielte Reparatur nach isolierten Prüfungen

Der Mehrschritt-Agent erhält den letzten auftragsgebundenen Prüfbericht bei jeder Modellanfrage, auch wenn Lese-/Planungsschritte den Fehler aus den letzten drei Schritten verdrängen. Der Kontext enthält Status, Profil, Exit-Code, begrenzte Fehlerausgaben, Paket-/Snapshot-Hashes sowie die vorherigen, noch nicht angewendeten Kandidateninhalte. Das vermeidet Korrekturen gegen ausschließlich den unveränderten Originalstand.

Bericht, Paket, Aufgaben-ID, Eigentümer und ausdrücklich erlaubte Dateien müssen zusammenpassen; bestehende Lese-/Diff-Rechte werden erneut geprüft. Kandidateninhalte sind zusammen auf 4.000 Zeichen begrenzt, Ausgaben je Kanal auf die letzten 1.200 Zeichen, Ergebnisse auf vier Profile. Erfolgreiche Ausgabe wird weggelassen. Inhalte bleiben ausdrücklich nicht vertrauenswürdige Daten; sie vergeben weder Ausführungs- noch Übernahmerechte. Die vorhandenen Modell-, Fehler-, Zeit- und Schrittbudgets gelten unverändert. Eine Reparatur startet erst durch ausdrückliche Wiederaufnahme und erzeugt ein neues Paket mit eigener Prüfung und Freigabe.

### Wiederherstellung ohne erfundenen Testerfolg

Eine Laufzeit in Quarantäne kann ihre Voraussetzungen und damit Ausführungsbereitschaft nicht mehr positiv melden. Bei kontrolliertem Linux-Neustart prüft die vorhandene Wiederherstellung ausschließlich AMU-eigene, über Besitzerlabel gebundene Container und verifiziert deren Abwesenheit. Erst danach kann der Dienst einen frischen Wiederherstellungsbeleg in unterbrochene Journalberichte aufnehmen. Frühere Belege werden beim nächsten Start verworfen, wenn kein neuer gültiger Nachweis vorliegt. Eingangsdateien bleiben zur Prüfung erhalten.

Der Administrator darf einen unklaren Lauf über den mTLS-geschützten Ergebnisendpunkt abgleichen, auch wenn die Ausführungsabnahme inzwischen abgelaufen ist. Verbindung, Serveridentität, Challenge, Run-ID, Snapshot und Profil müssen unverändert passen. Ein höchstens 24 Stunden alter Bereinigungsbeleg ergibt ausschließlich `stopped_unknown`: Containerstillstand bekannt, Testergebnis weiterhin unbekannt, `executed:null`. Ohne Nachweis bleibt der Lauf `indeterminate` und sperrt weitere Ausführung. Das ist ein überprüfter Softwarebeleg der vertrauenswürdig verwalteten Gegenstelle, keine Hardwareattestierung.

`stopped_unknown` ist niemals eine bestandene Pflichtprüfung und erlaubt weder Übernahme noch Commit. Ein weiterer Lauf braucht einen neuen explizit freigegebenen Plan und weiterhin eine aktuelle unabhängige Ausführungsabnahme. Verbrauchte Pläne werden nicht erneut ausgeführt. Es gibt keine automatische Wiederholung und keine Windows-Host-Ausführung als Ersatz. Änderungen am Runner-Code invalidieren bestehende Abnahmehashes.

## Tatsächlich durchgeführte Prüfungen

* TypeScript-Prüfung des AMU-Quellcodes mit `tsc --noEmit`: bestanden. Kein Build erzeugt.
* `node src/tests/session16-runner.test.mjs`: bestanden. Eigene Testzustände, echte gegenseitige TLS-Verbindung, explizit simulierte Laufzeit und Modellantworten. Prüft unter anderem fehlende Freigabe, falschen Abnahmehash, Entwicklerverbote, Kandidatenübertragung, Fehlerkontext im Reparaturprompt, neues Paket, getrennte Übernahmefreigabe, Git/Restore, Abbruch, unklaren Ausgang, Wiederanlauf ohne/mit Bereinigungsbeleg und weiterhin gesperrte Ausführung bei abgelaufener Abnahme. **Kein Projektcode und kein Container wurden dabei ausgeführt.** Eine zunächst falsche Testannahme über zwischengespeicherte Freigabe wurde korrigiert; der finale Test lässt auch die zentrale gespeicherte Abnahme ablaufen und prüft die tatsächliche Ausführungssperre.
* Produktive lokale API: `/health` und `/ready` mit eingebetteter Inferenz bereit, `/v1/models` ohne Schlüssel 401, mit vorhandenem Client-Schlüssel 200. Echte Qwen2.5-1.5B-Antwort über `/v1/chat/completions` mit SSE-Chunks und `[DONE]`: bestanden. Kein Ollama-/Cloud-Inferenzdienst erforderlich.
* Echter lokaler Modellworkflow: zwei eigene kleine Dateien analysiert, Plan und gemeinsames Änderungspaket erzeugt, keine Änderung vor Freigabe, zwei nicht ausführende JavaScript-Syntaxprüfungen, ausdrücklich freigegebene Übernahme und lokaler Git-Commit `b79a15a877048dd0dbf78016b8cc2a7a91c14d81`, anschließend gezielte Wiederherstellung mit erhaltener Historie. Drei echte Modellanfragen, null Agentenfehler, etwa 120 Sekunden. Quelldateien im Original unverändert; eigene Prüfarbeitskopie am Ende schreibgeschützt.
* Typecheck-/Build-/Unit-/Integration-Ausführungsprofile im produktiven Auftrag liefern weiterhin `unavailable / isolation_missing`. Keine Builds oder Projekt-Unit-/Integrationstests auf dem Windows-Host ausgeführt. Diese realen Isolationsprüfungen sind ausdrücklich **nicht bestanden**, sondern mangels Umgebung offen.

Lokale Belege: `scratch/session16-api-result.json`, `session16-native-result.json`, `session16-final-status.json` sowie verschlüsselte Ausgangs-/Abschlusssicherungs- und Verifikationsberichte. Git enthält Quellcode und diesen Bericht, keine API-Schlüssel, Zertifikatschlüssel, Testzustände oder Gewichte. Der überwachte API-Prozess wurde kontrolliert neu gestartet; Fremdprogramme wurden nicht beendet.

## Sitzung 17: benötigte Infrastruktur und Abnahme

1. In einem ausdrücklich freigegebenen Wartungsfenster VirtualMachinePlatform aktivieren, notwendigen Neustart durchführen und eine Linux-Distribution bereitstellen; alternativ eine dedizierte Linux-Gegenstelle mit eigener Einrichtungsfreigabe bereitstellen. Eine Hardwareaufrüstung ist durch diese Virtualisierungsprüfung allein nicht begründet. Linux-/Rootless-Docker-Kompatibilität muss praktisch geprüft werden.
2. Dedizierten Nicht-Root-Benutzer, Rootless Docker mit cgroup v2, bestehendes Node 24 und ein lokal geprüftes, unveränderlich gepinntes Offline-Image bereitstellen. Buildwerkzeuge und Abhängigkeiten müssen im geprüften Image verfügbar sein; keine automatischen Installationen durch Projektaufträge.
3. Reale Abnahme aus `docs/session14-isolated-runner.md` mit aktuellem Code durchführen: Grenzen, Netzwerk, Mounts, Rechte, seccomp, CPU/RAM/PIDs, Timeout, Prozessabbruch, Ausgabegrenze, Bereinigung, Neustart sowie echter Build/Unit/Integration und Fehlerkorrektur. Belege unabhängig administrativ prüfen.
4. Echte mTLS-Zertifikate, private IP und exakten Offline-Abnahmehash auf beiden Seiten prüfen und freigeben. Erst dann mit einem ungefährlichen Testprojekt den vollständigen Ablauf einschließlich Fehler, neuer Korrektur, erneuter isolierter Prüfung, Freigabe, Commit und Restore real abnehmen.

Modelladapter und Hardwareprofile bleiben offen für weitere lokale Qwen-Coder-Modelle. Größere Modelle wurden nicht heruntergeladen. AMU-Agent-3 und andere Projekte wurden nicht verändert.
