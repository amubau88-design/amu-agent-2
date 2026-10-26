# Sitzung 15 · Zentrale Runner-Integration und verpflichtende Projektprüfungen · 1.13.0

Ausgang: Version 1.12.0, Commit `d999520`, Git sauber. Ausschließlich AMU-Agent-2 wurde bearbeitet. Die verschlüsselte Ausgangssicherung `f0fbe384-4a65-4cae-80c0-451b1129488d` wurde vor Änderungen erstellt und verifiziert; SHA-256 `d97a6d574418c02e0e5abbad3fce79d4d1893f51a17c2dce6132cbadd53a77f0`. Keine anderen AMU-Projekte geändert, keine Datenbanken gelöscht, keine Gewichte heruntergeladen und keine kostenpflichtigen Dienste aktiviert.

## Tatsächlicher Stand

Die zentrale API ist jetzt mit der vorbereiteten Linux-Gegenstelle verbunden: Abnahme abrufen und prüfen, freigegebene Quell-Snapshots übertragen, feste Prüfprofile ausführen, Ergebnisse dauerhaft binden, abbrechen und unklare Ergebnisse ohne erneute Ausführung abgleichen. Der vorhandene Mehrschritt-Agent verwendet diese Strecke für ausdrücklich verlangte Pflichtprüfungen vor Dateiübernahme und Commit.

**Auf diesem Windows-Rechner ist weiterhin kein Linux-Runner bereitgestellt und keine reale Container-Isolation abgenommen.** Docker/Podman/Windows Sandbox wurden weiterhin nicht gefunden; die früher dokumentierten WSL-/Virtualisierungsvoraussetzungen wurden nicht verändert. In der produktiven AMU-Konfiguration wurde keine Gegenstelle oder Abnahme eingetragen. Deshalb bleiben ausführender Typecheck, Build, Unit- und Integrationstests hier gesperrt. Die positiven Transport-/Workflowtests verwenden ausschließlich eigene Fixture-Zertifikate, synthetische Abnahmeberichte und einen ausdrücklich vorgegebenen Adapter in getrennten Testzuständen. Das beweist Softwareintegration, keine Linux-Isolation.

## Abnahme, Zertifikate und verbindliche Identitäten

Der Linux-Dienst bietet zusätzlich `/runner/v1/attestation` und `/runner/v1/result` an. Alle Endpunkte behalten gegenseitiges TLS, Server-/Client-Pins, private IPs und das feste POST-Protokoll. CA-/Client-Zertifikate müssen gültig und der private Schlüssel passend sein. Die Administratorroute `/api/core/runner/certificates` liefert Fingerprints, Gültigkeitsdaten und Hinweise auf baldigen Ablauf; niemals PEM-Schlüsselmaterial. Verbindungen können weiterhin durch explizit geprüfte neue Dateiverweise/Zertifikat-Pins ersetzt werden. CA-/Client-Wechsel invalidieren die alte Abnahmebindung; bestehende Anwendungs-API-Schlüssel werden dabei nicht rotiert.

1. Die Gegenstelle muss die **reale** Linux-Abnahme aus Sitzung 14 mit dem aktuellen Code erneut durchführen. Codeänderungen invalidieren alte Adapter-Hashes. Ihr Administrator prüft das Ergebnis vor Ort und hinterlegt dessen exakten Datei-SHA-256 in der privaten Runner-Konfiguration.
2. Die zentrale Vorschau ruft diesen Bericht über den authentifizierten Dienst ab. Sie verlangt alle acht Abnahmegruppen, konkrete Containerbeobachtungen, Netzwerk-/Rechte-/seccomp-/CPU-Nachweise, die erwarteten cgroup-Werte, Nicht-Root-UID/Socket, Image-/Docker-Hashes, die aktuelle AMU-Runner-Codeversion und ein Alter unter 24 Stunden. Eine einfache Capability-Selbstauskunft kann diese Prüfung nicht ersetzen.
3. Der zentrale Administrator muss die reale Gegenstelle unabhängig geprüft haben, den **offline auf der Gegenstelle ermittelten Datei-Hash** eingeben und den exakten Vorschau-Digest freigeben. Dieser bindet Verbindung, CA-/Client-Identität, Server-Pin, Bericht, Code und Ablaufzeit. Modelle und Entwickler dürfen dies nicht freigeben.
4. Vor jeder ausführenden Prüfung wird der Live-Bericht erneut abgerufen. Geänderte/abgelaufene Berichte, Zertifikate, Daemon-/Codeversionen oder Verbindungen sperren die Übertragung. Unmittelbar vor dem Senden wird die Verbindung nochmals mit dem freigegebenen Plan verglichen. Keine automatische Ausführung nach Wiederverbindung.

Diese Nachweise beruhen auf der kontrollierten Gegenstelle und einer vertrauenswürdigen unabhängigen Administratorprüfung. Sie sind keine TPM-/Hardwareattestierung und kein Schutz gegen einen absichtlich lügenden Runner-Administrator. Das System schaltet nicht allein aufgrund gemeldeter boolescher Merkmale frei.

## Snapshot- und Testplan-Strecke

Ein privater Snapshot enthält ausschließlich ausdrücklich ausgewählte Dateien einer AMU-Git-Arbeitskopie. Für ein Agentenpaket wird der vorgeschlagene Inhalt über die alten Dateien gelegt, einschließlich neuer Dateien und Löschungen. Die Arbeitskopie und das Original werden dabei nicht verändert. Geänderte Paketgrundlagen oder Auftragsdateien blockieren das Staging. Alle Paketänderungen und der ausdrücklich deklarierte Prüfkontext müssen enthalten sein.

Der Testplan bindet Snapshot-/Paket-Hash, Workspace, 1–4 freigegebene Profil-IDs und Definitionen sowie Verbindung und Abnahme-Digest. Eine zweite Administratorfreigabe autorisiert **genau diese Quellübertragung und Prüfung**, nicht die Dateiübernahme. Ohne Abnahme entsteht ein dauerhafter `unavailable / isolation_missing`-Bericht; es werden keine Quellen übertragen.

Ausführung verwendet ausschließlich den isolierten Linux-Dienst, nie einen Windows-Hostprozess für Projektcode. Die Linux-Grenzen aus Sitzung 14 bleiben bestehen: kein Netzwerk, schreibgeschützter Eingang/Root, verwerfbare Arbeitskopie, Nicht-Root, entfernte Capabilities, seccomp, CPU-/RAM-/PID-/Ausgabe-/Zeitlimits, Container-Watchdog und überprüfte Containerentfernung. Ein Ausführungsbatch umfasst höchstens vier Profile, je bis zu 120 Sekunden. Ein Batch ist gleichzeitig aktiv; höchstens drei ausdrücklich gestartete Versuche pro unverändertem Paket/Snapshot. Es gibt keine automatischen Programm-Wiederholungen.

Profile sind unveränderlich. Optional bestimmen `family` und `revision` eine fortlaufende Versionsreihe; eine neue Revision braucht eine neue ID, einen neuen Vorschau-Hash und Administratorfreigabe. Alte Profile bleiben erhalten. Die Gegenstelle muss exakt dieselbe Profil-ID und Definition provisioniert haben. `kind:"typecheck"` ergänzt Build/Unit/Integration; ein tatsächlicher TypeScript-Typecheck benötigt ein geprüftes Offline-Image mit den benötigten Werkzeugen. Der Node-Basisrunner allein enthält keinen nachgewiesenen TypeScript-Compiler und installiert keine Abhängigkeiten automatisch.

Ergebnisberichte binden Server, Lauf, Snapshot, Profil, Status und begrenzte Ausgaben. Ein behaupteter Erfolg ohne tatsächliche Ausführungs-/Exit-Code-Angaben wird abgelehnt. Nach Frist, Abbruch oder Verbindungsverlust wird niemals `/execute` wiederholt. Stattdessen werden der bestehende Lauf abgebrochen und sein dauerhaftes Ergebnis begrenzt abgefragt. Bleibt das Ergebnis unklar, wird `indeterminate` beziehungsweise nach Neustart `interrupted` gespeichert und ein weiterer Lauf im betroffenen Workspace gesperrt. Der Administrator kann das Ergebnis ausdrücklich ohne Ausführungswiederholung abgleichen. Teilweise abgearbeitete Batches werden nicht als vollständig bestanden ausgegeben.

Aktive Ausführungen sperren Snapshot-Bereinigung, Paketänderungen, Sicherung und API-Neustart. Lese-/Prüfrechte werden bei Vorbereitung, Ausführung und vor weiteren Profilen erneut geprüft. Ein Plan des falschen Workspace wird **vor** der Ausführung abgelehnt. Bereits verbrauchte Ausführungspläne können nicht erneut angewendet werden.

## Vorhandener Coding-Agent

Neue Aufträge können `verificationProfiles:["typecheck-v1","build-v1","unit-v1","integration-v1"]` verlangen. Profile müssen im Workspace bereits freigegeben sein. Der Agent behält begrenzte Planung, Suche/Lesezugriffe, strukturierte Werkzeuge, mehrere explizite Dateien, Modell-/Profilbindung, Kontext- und Fehlerbudgets sowie Wiederaufnahme bei.

Der Ablauf ist verbunden: Analyse/Plan → Änderungspaket → echte sichere Syntax-Vorprüfung → gemeinsames Diff → eigener Snapshot-/Testplan → gesonderte Freigabe der isolierten Prüfung → Ergebnisse/Fehler → bei Bedarf ausdrücklich begrenzte Korrektur mit neuem Paket → erneute Prüfung → genaue Freigabe der Dateiübernahme → sichere Nachprüfung → lokaler Git-Commit und Abschlussbericht. Fehlende oder fehlgeschlagene Pflichtprüfungen sperren sowohl Anwendung als auch Commit. Ein späterer Lauf mit Fehler ersetzt keinen früheren Erfolg durch einen angeblichen Gesamt-Erfolg. Prüfpläne, Berichte und Aufgabenbezüge bleiben dauerhaft erhalten.

Nach einem Fehler kann der bestehende begrenzte Korrekturmechanismus verwendet werden; eine neue Paketversion muss neu geprüft und freigegeben werden. Gespeicherte Arbeit wird nach Unterbrechung nicht automatisch erneut ausgeführt. Gezielte Rücknahme erhält fremde Änderungen und Git-Historie. Vor einem Commit werden jetzt auch unveränderte deklarierte Kontextdateien gegen den Aufgabencheckpoint geprüft.

Alte Aufträge ohne Pflichtprofile bleiben kompatibel. Ihr erfolgreicher Syntaxlauf wird ausdrücklich **nicht** als Build-/Unit-Erfolg ausgegeben. Der Abschlussbericht unterscheidet tatsächliche Syntaxprüfungen, bestandene isolierte Profile und bloße Modellbewertung. Freie Werkzeugwahl und native Tool-Calls des kleinen Qwen-Modells sind weiterhin nicht praktisch abgenommen.

## Verwaltung und APIs

Die bestehende deutsche Verwaltung ergänzt Zertifikatsdiagnose, Abnahmevorschau mit Offline-Hash, Snapshot-Testpläne, genaue Quellübertragungsfreigabe, ausführliche Berichte, Abbruch/Ergebnisabgleich und verpflichtende Agentenprofile. Angezeigte Plan-IDs/Digests werden gebunden bestätigt; ein Wechsel von Aufgabe oder Snapshot führt nicht zur stillen Freigabe eines anderen Plans.

Neue zentrale Routen verwenden bestehende Rollen, `core:tasks`, Workspace-Kontrollen und Administratorfreigaben:

| Route | Funktion |
| --- | --- |
| `GET /api/core/runner/certificates` | Zertifikatsdiagnose ohne private Schlüssel |
| `POST /api/core/runner/acceptance/preview` | Live-Abnahme prüfen und anzeigen |
| `GET/POST /api/core/runner/acceptance` | Zustand / unabhängige genaue Administratorprüfung |
| `POST /api/core/runner/snapshots/:id/plan` | Konkreten Testplan vorbereiten |
| `POST /api/core/runner/plans/:id/execute` | Exakte Quellübertragung und Prüfung freigeben |
| `GET /api/core/runner/workspaces/:id/executions` | Eigene Berichte und Fehler |
| `POST /api/core/runner/executions/:id/cancel` | Eigene laufende Prüfung abbrechen |
| `POST /api/core/runner/executions/:id/reconcile` | Administrator: unklaren Lauf ohne Wiederholung abgleichen |
| `POST /api/core/tasks/:id/verification-plan` | Aktuelles Paket separat stagen |
| `POST /api/core/tasks/:id/verify` | Administrator: verknüpften Paket-Testplan ausführen |

Die bestehenden Workspace-Test-/Berichtschnittstellen sind ebenfalls verbunden: ausführende Prüfungen benötigen `planId`, exakten `digest` und `approve:true`; die Historie enthält isolierte Batches. Ohne Plan/Abnahme bleibt es beim gesperrten Bericht. Die alte lokale Node-Syntaxprüfung wird unverändert ohne Quellcode-Ausführung angeboten.

Anmeldung, Anwendungsregistrierung, Schlüsselrotation/-widerruf, Clientrechte, Nutzungslimits, Modellverwaltung und Backups bleiben erhalten. Bestehende Schlüssel werden nicht erneut ausgegeben. Die vorhandenen Konfigurationen speichern Schlüssel-Hashes statt abrufbarer Rohschlüssel; lokale bestehende Eigentümer-/Recovery-Dateien wurden nicht gelöscht oder in Git aufgenommen. Neue Backups verlangen mindestens Version **1.13.0**, damit eine ältere Anwendung die neuen Pflichtprüfungen nach Wiederherstellung nicht ignoriert.

Die vorhandenen Modell-/Hardwareprüfungen bleiben aktiv: Kontextgrenzen, RAM-Reserve, Worker-Speicherbudgets, CPU-/GPU-Inventar, GGUF-/Template-Prüfung, kontrollierter Modellwechsel und Ablehnung unpassender Ressourcen. Größere Qwen-Coder-Profile sind vorbereitet, aber große Gewichte, GPU-Betrieb und Modellqualität sind auf dieser Hardware nicht abgenommen. Keine Downloads oder Kosten.

## Tatsächliche Prüfungen dieser Sitzung

- `npm run test:session15`: reale getrennte APIs und gegenseitiges TLS, exakte Offline-/Administratorfreigabe, unangewendeter Quelloverlay, gesperrte Quellen ohne Abnahme, falscher Workspace, unveränderliche Profilrevisionen, fehlgeschlagene Pflichtprüfung, ausdrücklicher erneuter Lauf, echter Node-Syntaxcheck, echter Git-Commit/Rücknahme, Abbruch mit Ergebnisabfrage, keine Ausführungswiederholung, abgelaufene Live-Nachweise. Die OS-/Modellantworten sind dabei ausdrücklich vorgegeben, nicht echt isoliert ausgeführt.
- UI-Handler gegen eine getrennte echte API: Zertifikats-/Voraussetzungsdiagnose, neue Pflichtprofile/Testpläne, blockierter Lauf ohne Linux und verweigerte Dateiübernahme; vorhandene Freigabe-/Git-/Restore-Funktionen bleiben geprüft.
- Regression des Sitzung-13-Workflows, Typecheck und Build.
- Separater **realer lokaler Qwen2.5-1.5B-Auftrag** `25563871-d2eb-4231-8115-a40c6435fc62`: zwei Dateien analysiert/geändert, zwei sichere Vor- und zwei Nachprüfungen, genaue Freigabe, echter lokaler Commit `3257d2e6c03c353fe5451e9ff97ebfe13918ed9a`, anschließend beide Dateien gezielt wiederhergestellt und Historie erhalten. Drei Modellanfragen, sieben Schritte, null Fehler, 89,278 Sekunden aktive Laufzeit. Originale unverändert; eigene Quell-Fixture ohne Löschung geschlossen, Kopie schreibgeschützt. Nachweis `scratch/session15-native-result.json`.
- Im realen Auftrag wurden Typecheck, Build, Unit und Integration jeweils tatsächlich angefragt und als `unavailable / isolation_missing` abgewiesen. Die Integration ist implementiert, aber ein vollständiger Coding-Agent-Lauf **mit realen isolierten Projektprüfungen** ist hier nicht abgenommen.

Abschlussnachweise liegen lokal unter `scratch/session15-api-result.json`, `scratch/session15-final-status.json`, `scratch/session15-closeout.json`, den `session15-backup-*.json` und `session15-verify-*.json`. Der Abschlussbericht nennt den tatsächlich gesicherten Plattform-Commit und Archivstatus. Betriebliche Nachweise und Geheimnisse werden nicht in Git gespeichert; unveränderte Modellgewichte werden nicht erneut archiviert.

## Sitzung 16

Dedizierte Linux-Gegenstelle mit aktuellem Code und geprüftem Offline-Image tatsächlich bereitstellen. Die Anleitung aus Sitzung 14 bleibt Grundlage; deren früher offene zentrale Quell-/Ergebnisstrecke ist jetzt implementiert. Aktuelle reale Containerabnahme durchführen, beide Zertifikatsidentitäten prüfen und den Offline-Bericht unabhängig freigeben. Anschließend einen echten Zweirechner-Auftrag mit verpflichtendem Typecheck/Build/Unit/Integration, realem Testfehler, begrenzter Modellkorrektur, erneuter Prüfung, Dateiübernahme und Commit abnehmen. Dabei insbesondere harte Dienstunterbrechungen, Prozessbaum-/OOM-Bereinigung und Wiederverbindung prüfen. Erst danach größere Modelle und vollständige Qualitäts-/Produktionsabnahme. Ein Verbindungs- oder Softwaretest ersetzt diese praktische Abnahme nicht.
