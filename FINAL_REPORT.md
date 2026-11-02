# AMU AI Engine – FINAL_REPORT

Stand: 02.11.2026 · Version 1.37.0 · Sitzung 40

**Freigabe: v1.36.0 → Produktionsfreigabe v1.37.0 für den real qualifizierten lokalen, begrenzten Coding-Workflow.**

## Tatsächliche Abnahme

| Prüfung | Ergebnis |
|---|---|
| Autonome kombinierte Temperatur-/Lager-/Versandaufgabe | Bestanden im dritten, dokumentierten Lauf |
| Modellplanung und drei Modulentwürfe | Lokales Qwen2.5-Coder-1.5B; keine manuellen Implementierungsreparaturen im erfolgreichen Lauf |
| Echter Absturz während stock.mjs | Inferenz-Worker PID 20640 beendet; automatische Wiederherstellung und Fortsetzung aus SQLite-WAL |
| Checkpoint-Erhalt | Bereits validierter Temperaturentwurf und Budgets erhalten; nur unbestätigte Inferenz erneut gestellt |
| Isolierte Build-/Syntax-/Unit-/HTTP-Integration | Alle vier Profile real bestanden |
| Regressionen | 35 eindeutige Testprogramme bestanden; zwölf bestehende Suites darin enthalten |
| Linux-Isolation | Acht Gruppen real bestanden; Ressourcen-, Netzwerk-, Prozess-, Dateisystem-, Abbruch- und Bereinigungsnachweise |
| Übernahmefreigabe | Falscher Digest abgewiesen; exakt geprüftes Testpaket unter S40-Eigentümerfreigabe übernommen |
| Test-Commit und Restore | b3bca14693007451e3360407a8f7256d6a4bbe22; alle acht Dateien anschließend hashgleich wiederhergestellt |
| API /health, /ai/active, /metrics | Real geprüft; Betriebs-/Auftragsdaten erfordern Administratorauthentifizierung |
| Qwen-Streaming | Während Job vollständig; finale warme SSE-Prüfungen 1,220 / 1,048 s |
| Verschlüsselter Konfigurationsexport nach Crash | f75b1c28-90dc-450e-b663-bc1ecd6f504a; Authentifizierung und sechs SQLite-Integritätsprüfungen bestanden |
| Windows-Langpfad-/WAL-Regression | Bestanden; keine Betriebssystemeinstellung geändert |
| Eigentümer-Browser | Regulärer lokaler Einmalcode, admin, Reload und echtes Streaming auf 1.37.0 bestanden |
| Quellprüfung | TypeScript --noEmit bestanden |

Erfolgreicher Auftrag: dff08a01-b2e4-462a-9fff-3d415133644e. Isolierter Run: df2787f7-1a8c-4fb5-810a-8ce51d96f0c2. Exakter Paketdigest: 7557232891a26dde9955e2cbc5686bcc9e80c8891b4a728dd16de95f86144e25.

Der erfolgreiche Lauf benötigte fünf Modellanfragen einschließlich der unterbrochenen Anfrage, zwei automatische Fensterfortsetzungen und keinen Kindauftrag. Nach Paketübernahme erreichte er completed. Der bewusst ausgeführte Restore setzte den aktuellen Testauftrag anschließend auf paused; die erfolgreiche Abnahme bleibt als Checkpoint erhalten. Die drei Versuche insgesamt verbrauchten elf Modellanfragen. Erster Lauf durch zu viele Managementabfragen abgebrochen; zweiter Lauf an Modellzeitgrenzen gescheitert. Diese Fehlschläge bleiben dokumentiert. Quelle, Tests, Limits und Budgets wurden nicht zur nachträglichen Erfolgsbehauptung zurückgesetzt.

## Implementiert

SQLite-WAL-Checkpoints mit voller Synchronisierung, Eigentümer-/Digestbindung und JSON-Wiederherstellungsspiegel; eng begrenzte administrativ autorisierte Inferenz-Worker-Recovery; authentifizierte Aktivitäts- und Metrikendpunkte; statische wörtliche Vertragstestbeispiele für das lokale Modell; kleinere Modellkontexte bei unveränderten serverseitigen Sicherheitsprüfungen. Wiederholbare S40-Verwaltungsprüfung: `npm run test:session40`. Unverändertes Projekttestgerüst: `src/tests/fixtures/session40-combined.json`; dessen Programme ausschließlich im abgenommenen Linux-Runner ausführen.

## Betriebszustand und Gültigkeitsbereich

API 1.37.0 lokal bereit, Qwen2.5-1.5B als Chatmodell aktiv, beide vorhandenen Gewichte erhalten, Kontext 4096. Ende der Abnahme: keine aktiven/angestauten Aufträge, Linux-Runner gestoppt, zentrale Ausführungsfreigabe widerrufen, null Container. Rootful-Dienste gesperrt; Core-Dump-Schutz unverändert. Freier Speicher am Abschlussprüfpunkt etwa 19,03 GiB, freier RAM etwa 12,26 GiB.

Freigegeben ist der nachgewiesene lokale Ablauf mit explizit begrenzten neuen Workspaces, eingefrorenen Tests, einem Coding-Job und separater Administratorfreigabe. Keine pauschale 100-Prozent-Zusage für beliebige Softwareprojekte. Noch nicht abgenommen sind Gesamt-Windows-/Gateway-Abstürze mitten in Containerjobs, LAN-/Mehrrechnerbetrieb und R630-Migration. Kaltes Modellladen benötigte 7,043 s; Streaming im belegten Ein-Worker-Betrieb wartete im erfolgreichen Lauf ca. 82 s. Höhere Last und andere Modelle benötigen eigene Qualifikation.

AMU WEB, AMU SYSTEM, Agent-3, Preis Assistent, Datenträger, Firewall und Windows-Einstellungen wurden nicht bearbeitet. Keine neuen Modelle, Pakete, Images oder kostenpflichtigen Dienste installiert. Es wurde keine produktive Fremdprojektdatei als Testobjekt verwendet.

## Veröffentlichung und Nachweise

Release-Ziel: `origin/main`, annotiertes Tag `v1.37.0`; alter Snapshot `v1.36.0` bleibt unverändert. Der konkrete Quellcommit ist über das aufgelöste Tag und `git log -1` überprüfbar. Ausführlicher Ablauf: `docs/session40-qualification.md`. Vollständige private Prüfberichte, Screenshot, Transaktions-/Wiederherstellungsdaten und Sicherungsmetadaten liegen im ignorierten `scratch/session40-*` und werden verschlüsselt gesichert; keine Schlüssel im öffentlichen Repository.
