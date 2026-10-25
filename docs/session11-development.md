# Sitzung 11 · Kontrollierte Entwicklungsbereiche · Version 1.9.0

Ausgangsstand: `b1d0f91` / 1.8.0, sauberes Git-Arbeitsverzeichnis. Ausschließlich AMU-Agent-2 bearbeitet. Datenbanken, Schlüssel, Modelle und historische Sicherungen erhalten. Keine anderen AMU-Projekte geöffnet oder registriert, keine Installationen oder Downloads.

## Implementierter Workflow

1. Bestehenden Workspace öffnen oder ausdrücklich registrieren. Vorhandene Client-/Werkzeugfreigaben bleiben erhalten. `closed` schließt ohne Datenlöschung; Wiederöffnen erfolgt über die Projektübersicht. `readOnly` sperrt Schreibpfade einschließlich Einzeldatei-Vorschlägen und Wiederherstellung. Alte Datensätze bleiben kompatibel.
2. Eine getrennte Arbeitskopie anlegen: eigener Ordner und eigenes lokales Git-Repository auf `amu/development`, mit Ausgangscommit. Das Original bleibt unverändert. Die Kopie übernimmt den vorhandenen Arbeitsstand einschließlich uncommittierter Dateien. Höchstens 200 vollständig aufgelistete UTF-8-Quelldateien, insgesamt 4 MiB; versteckte/protegierte Verzeichnisse werden nicht kopiert.
3. Dateien mit den vorhandenen Werkzeugen lesen. Ein Änderungspaket enthält 1–12 neue/geänderte/ausdrücklich gelöschte Dateien. Es speichert Ausgangsinhalte, SHA-256 vor/nach Änderung, Paket-Hash, Status und Verlauf. Grenzen: 128 KiB neuer Inhalt je Datei; 512 KiB einschließlich Checkpoints je Paket.
4. Unified Diff prüfen. Nur ein Administrator kann exakt den angezeigten Paket-Hash zur Anwendung freigeben. Vor Beginn werden alle Ausgangshashes geprüft. Schreibkonflikte lassen fremde Änderungen unangetastet.
5. Änderungen pro Datei über exklusive temporäre Datei, Flush und Rename übernehmen. Mehrere Dateien sind **keine gemeinsame atomare Dateisystemtransaktion**. Ein Fehler nach Beginn hinterlässt Status `interrupted` und vollständige Checkpoints. Ein Neustart führt Änderungen nicht automatisch erneut aus.
6. Feste Syntaxprüfung durchführen und strukturierten Bericht lesen. Optional ausdrücklich freigegebene Dateien in Git sichern. Git-Schreibzugriffe sind auf AMU-erstellte Arbeitskopien begrenzt. Erforderlich sind aktueller Git-Status-Hash, genaue Dateipfade und Inhaltshashes. Vorhandene gestagte Arbeiten werden geschützt; die tatsächlichen Index-Inhalte werden nochmals geprüft und ausschließlich der geprüfte Index committed. Andere ungestagte Dateien werden nicht aufgenommen.
7. Bei Bedarf exakt dieses Paket zurücknehmen. Alle Dateien werden vorab auf Ausgangs-/Paketstand geprüft; fremde Inhalte verhindern die Rücknahme. Neue eigene Dateien werden entfernt, eigene Löschungen wiederhergestellt. Auch unterbrochene Anwendungen/Rücknahmen können ausdrücklich wiederhergestellt werden. Nach einem Git-Commit erzeugt die Rücknahme neue Arbeitsbaumänderungen; die Historie wird nicht umgeschrieben.

Git liest weder globale noch systemweite Konfigurationen und führt keine Hooks aus. Manipulierte Konfigurationen verwalteter Repositories sperren weitere Schreiboperationen. Ein Checkpoint-Journal hält Ausgangscommit und letzten Commit fest. Bei Git-Fehlern können gestagte Inhalte zur manuellen Prüfung erhalten bleiben. Keine automatischen Push-/Merge-/Fetch-/Deploy-Operationen, kein pauschales Reset/Clean.

Pfadschutz verweigert Links/Junctions, Traversal, versteckte/protegierte Pfade, ADS, Windows-Gerätenamen und mehrdeutige Endpunkte mit Punkt oder Leerzeichen. Dateizugriffsschutz und getrennte Arbeitskopien sind keine Sandbox für fremden Code. Gleichzeitige lokale Änderungen außerhalb der AMU-API bleiben durch Hashprüfungen begrenzt; es gibt keine vollständige Betriebssystemtransaktion.

Die bestehende deutsche Oberfläche bietet Projektzustand, Lesemodus, Schließen/Wiederöffnen, Git-Kopien/Status/Commit, Paket-Diff/Freigabe/Ablehnung/Rücknahme, Verlauf und Prüfberichte. Paket- und Commit-Eingaben sind zunächst technische JSON-Editoren, noch kein komfortabler Dateiassistent. Eigentümeranmeldung und Schlüsselverwaltung bleiben erhalten.

## Tatsächliche Grenze der Testausführung

Es wurden keine Docker-/Podman-Kommandos und keine Windows-Sandbox gefunden. **Kein geprüfter OS-isolierter Runner ist angebunden.** `GET /api/core/runner` meldet `isolationAvailable:false` und `projectExecutionEnabled:false`.

Aktiv ist ausschließlich `javascript-syntax`: Node `--check`, maximal 128 KiB Eingabe, zehn Sekunden, 16 KiB Ausgabe und 128 MiB V8-Heap. Der Heap-Wert ist kein hartes Betriebssystem-RSS-Limit. Die Kindprozessumgebung enthält nur grundlegende Pfad-/Windows-/Temp-Variablen. Quellcode und npm-Skripte werden nicht ausgeführt; diese Parserprüfung ist keine Sandbox. Weltweit sind höchstens zwei Unterprozesse und einer je Eigentümer erlaubt.

Build-/Unit-/Integrationstest- und Projektbefehle liefern einen dauerhaften Bericht `unavailable`. Mitgesendeter Shell-Text wird nicht ausgeführt. Kein Admin-Schalter umgeht die Grenze. `isolated-runner-contract.ts` definiert die spätere Schnittstelle: feste freigegebene Argumente, nachvollziehbarer Quellsnapshot, wegwerfbare Ausgabe, keine Anmeldedaten/Netzwerkverbindung, minimale Rechte, harte CPU-/RAM-/Prozess-/Ausgabe-/Zeitlimits und Abbruch der gesamten Umgebung. Der Vertrag ist implementiert, ein Container-/VM-Adapter noch nicht.

Berichte speichern Eigentümer, Workspace, Profil, Datei, Ausgangshash, begrenzte Ausgaben, Exit-Code und Zeitpunkte. Zwischenzeitliche Quelländerungen werden als Konflikt markiert. Abbruch und Zeitlimit sind berücksichtigt. Nach Prozessende werden offene Berichte als unterbrochen angezeigt; keine unbegrenzte Wiederholung oder Reparaturschleife.

## Neue API-Endpunkte

Bestehende Authentifizierung, Scope `core:tasks`, Rolle Administrator/Entwickler sowie Workspace-/Eigentümerprüfung gelten weiterhin. Konfiguration, Kopie, Commit, Anwendung und Rücknahme benötigen Administration.

| Methode/Pfad | Funktion |
| --- | --- |
| `POST /api/core/workspaces/:id/configure` | zusätzlich `closed` und `readOnly` |
| `POST /api/core/workspaces/:id/git/status` | Repository, Branch, Status und Status-Hash |
| `POST /api/core/workspaces/:id/git/copy` | `approve:true`: getrennte Git-Arbeitskopie |
| `POST /api/core/workspaces/:id/git/commit` | `approve,statusHash,files:[{path,sha256}]`; Löschhash `null` |
| `GET/POST /api/core/workspaces/:id/changes` | Verlauf / neues Paket mit `changes:[{path,baseHash,content}]` oder `delete:true` |
| `GET /api/core/change-sets/:id` | Diff, Checkpoint, Status, Paket-Hash |
| `POST /api/core/change-sets/:id/apply` | `approve:true,digest`: anwenden |
| `POST /api/core/change-sets/:id/reject` | wartendes Paket ablehnen |
| `POST /api/core/change-sets/:id/restore` | `approve:true,digest`: gezielt wiederherstellen |
| `GET /api/core/runner` | tatsächliche Fähigkeiten und Grenzen |
| `GET/POST /api/core/workspaces/:id/tests` | Berichte / feste Syntaxprüfung bzw. gesperrtes Profil |
| `POST /api/core/test-runs/:id/cancel` | laufende eigene Prüfung abbrechen |

Die alten Core-Aufträge, Vorschläge und Werkzeuge bestehen weiter. Die Modellplanung erzeugt noch nicht automatisch die neuen Mehrdatei-Pakete.

## Tatsächliche Prüfungen

- `npm run build`: TypeScript-Kompilierung.
- `npm run test:session11`: separate Zustandsdaten, API-Port und kleine Beispielprojekte; reale HTTP-Dateioperationen mit Hinzufügen/Ändern/Löschen, Konflikte vor Anwendung und Rücknahme, falsche Hashfreigabe, Client-Trennung, Lesemodus, Schließen/Öffnen, Ablehnung, Paket-Manipulation, Windows-Pfad-Aliasse und echte Junctions.
- Unterbrechungsprüfung: gespeichertes Abbruchjournal injiziert, anschließend echte gezielte Wiederherstellung. Dies ist kein Stromausfall-/Kill-Test.
- Tatsächliches separates Git-Repository mit Branch, Ausgangscommit, freigegebenem Commit und anschließender Rücknahme ohne Umschreiben der Historie.
- Echte Syntax-Unterprozesse mit nicht ausgeführtem `throw` im Eingabeprogramm, Parserfehler, Abbruch und Parallelitätsgrenze. Keine Unit-/Build-Ausführung von Projektcode.
- Tatsächliche Inline-Dashboard-Handler gegen eine reale separate HTTP-API in einem DOM-Testmodell. Zusätzlich echte vorhandene Browseroberfläche mit Administratoranmeldung und visueller Kontrolle. Keine vollständige Browser-/Sicherheits-/Lastabnahme.
- `node src/tests/session10-agent.test.mjs`: gezielte Regression der bestehenden Aufgabensteuerung; Modellentscheidungen dort gemockt.
- Laufender Server nach Neustart: `/ready`, `/v1/models` und echtes `/v1/chat/completions`-SSE bis `[DONE]` mit vorhandenem AMU-Agent-3-Zugang erfolgreich. Das Projekt AMU-Agent-3 wurde nicht angefasst. Der neue Mehrdateiablauf wurde nicht durch native autonome Modellplanung erzeugt.

Keine breite Gesamt-QC wiederholt. Der Prozess läuft auf `127.0.0.1:3030`: 1.9.0, `amu-embedded-llama.cpp`, Qwen2.5:1.5b, ein bereiter CPU-Worker, vier Threads, Kontext 4096. Ollama wird nicht benötigt. Große Qwen-Coder-Gewichte bleiben uninstalliert; ein echter Zwei-Rechner-Test bleibt offen.

## Sicherung und Sitzung 12

Ausgangssicherung ohne erneute Modellkopie: `7bd8bb43-b64d-4639-b8f3-914ccb317a23`, SHA-256 `67d931dff541712bb1f0d4c2b8e34abb6b69daeb99240d8fd9ad68f108dcfaa5`, verschlüsselt; Entschlüsselungs-/Integritäts-/Kompatibilitätsprüfung erfolgreich. Modellgewichte bleiben lokal und in früheren vollständigen Archiven erhalten. Abschlussbackup und Prüfprotokoll: `scratch/session11-backup-after.json` und `scratch/session11-verify-after.json`. Private Zustände und Schlüssel gehören nicht in Git.

Nächste Schritte:

1. Tatsächlichen VM-/Container-Runner installieren/anbinden und Isolation nachweisen, bevor Projektcode freigegeben werden kann.
2. Begrenzte mehrstufige Modellplanung mit Paketen, Prüfungen und Checkpoints verbinden; native Tool-Calls gesondert abnehmen.
3. JSON-Eingaben durch einen Dateiassistenten ergänzen. Git-Kopier-/Fehlerhistorie und Checkpoint-Auswahl ausbauen; derzeit gibt es Paketverläufe und den letzten Git-Checkpoint, keinen allgemeinen Git-Recovery-Assistenten.
4. Harte Prozessabbrüche während Schreiben/Staging prüfen, dann abschließende Gesamt-QC, Last, Zwei-Rechner-Netzwerk und Restore der neuen Entwicklungszustände. Keine Produktionsreife für die fehlende Ausführungsisolation behaupten.
