# Sitzung 31 – Stabilisierung, Coding-Protokoll und reale kleine Abnahme

## Ausgang und Endergebnis

Ausgang 1.28.0 / 97587a5, Branch master, sauberer Arbeitsbaum, tatsächlich geprüft. Neue Quell- und API-Version **1.29.0**. Der Quellcommit wird im Abschlussbericht und in scratch/session31-final-backup.json dokumentiert.

**Die kleine reale Coding-Abnahme ist bestanden, einschließlich ausdrücklicher Eigentümerfreigabe, Testcommit und Restore. Eine allgemeine oder produktive Coding-Freigabe folgt daraus nicht. Der komplexere Siebendatei-Auftrag aus Sitzung 30 bleibt nicht abgenommen.**

Vor Änderungen wurde eine verschlüsselte Quellen-/Konfigurationssicherung erstellt und authentifiziert extrahiert: 63fa93d1-c5a3-47e8-a497-3f089e307c59. Keine neuen Gewichte, Pakete, Windows-/Firewall-/BIOS-Einstellungen, Datenträgeränderungen oder Neustarts.

## Fehleranalyse und Änderungen

1. Die bisherige frühe TypeScript-Parserprüfung konnte TypeScript-Syntax in JavaScript akzeptieren. `anchored-edits.ts` prüft .js/.mjs/.cjs zusätzlich mit Node `--check` im passenden Modulmodus, begrenzt auf fünf Sekunden, 128 MiB Heap und bereinigte Umgebung. Projektcode wird dabei nicht ausgeführt. AST-Prüfung und spätere Paket-/Containerprüfungen bleiben erforderlich.
2. `coding-agent.ts` fordert jetzt genau den einen Edit, den das geführte Schema tatsächlich zulässt; die konkrete dynamische Ein-Datei-Antwort wird vor der No-op-Behandlung nochmals gegen das Schema geprüft. Geschützte Tests, append-only-Regeln, eindeutige Anker und unvollständige/abgeschnittene JSON-Ablehnung bleiben wirksam.
3. `repair-policy.ts` berücksichtigt die Vereinigung der deklarierten Bereiche aller tatsächlich fehlgeschlagenen Prüfungen. Nicht ausgeführte Prüfungen liefern keine Reparaturziele. Ohne deklarierte Teilbereiche bleibt die bisherige konservative Auswahl der Kandidatendateien erhalten. Keine automatische Anwendungs- oder Testfreigabe.
4. Nach systemd `is-active` war der mTLS-Listener noch nicht zwingend bereit. `runner-session.mjs` wartet jetzt begrenzt auf authentifizierte Gesundheit; die Frist gilt auch bei einer hängenden Abfrage. Abbruch und Stop bleiben wirksam. Nur Gesundheitsabfragen werden wiederholt; Aufträge werden nicht wiederholt.
5. Ein zentral registriertes Testprofil ist nicht automatisch auf dem Runner genehmigt. `runner-admission.ts` und `runner-executions.ts` prüfen vor Übertragung der Quellinhalte per Metadata-only-Request die exakte Profil-, Snapshot-, Challenge-, Lauf- und Serveridentität. Ablehnung oder falsche Bindung verhindert die Ausführung. Bestehende Genehmigungen wurden nicht erweitert.
6. Nach dem letzten gezählten Nachprüfungsschritt konnte ein reiner Faktenabschluss am exakt aufgebrauchten Schrittbudget hängen. `agent-finalization.ts`, Controller und Coding-Agent erlauben ausschließlich diesen Abschluss, wenn sämtliche aktuellen Dateihashes bereits erfolgreich geprüft sind und evidenceReport aktiv ist. Modell-/Werkzeugaufrufe bleiben gesperrt; Laufzeitgrenzen bleiben unverändert. Reale Abnahme: zwölf verbrauchte Schritte, weiterhin nur zwei Modellaufrufe.
7. Die Modellverwaltung verwendet jetzt den tatsächlich konfigurierten `AMU_MODEL_DIR` für installierte Modellpfade. Bestehende Modelladapter, Rollen, Ressourcenprüfung und manueller Wechsel wurden weiterverwendet. Keine zweite Modellinfrastruktur.
8. Bei der Nachkontrolle des alten Embedded-Tests wurde entdeckt, dass dieser zuvor einen kleinen Modellvorschlag in node:vm auf Windows ausführte. Der alte Test war in dieser Sitzung bereits einmal gelaufen; das war kein isolierter Runner-Test. Der Ausführungspfad wurde entfernt. Der erneut bestandene Test prüft den erzeugten Quelltext nur syntaktisch und per AST. node:vm ist keine zulässige Sicherheitsgrenze. Verhaltensprüfungen bleiben dem echten Runner vorbehalten.

Geänderte Dateien: package.json, package-lock.json, scripts/runner-session.mjs; src/core/anchored-edits.ts, coding-agent.ts, repair-policy.ts, runner-executions.ts, controller.ts sowie neue agent-finalization.ts und runner-admission.ts; src/inference/coding-management.ts; src/tests/embedded-engine.test.ts und neue session31-protocol.test.mjs; diese Dokumentation und r630-migration.md.

## Reale kleine Abnahme

Nur neue Testrepositories mit fünf Dateien wurden verwendet; Referenzen wurden read-only registriert. Geschützte Unit-/Integrationstests und andere Dateien blieben unverändert.

- Modell: vorhandenes lokales Qwen2.5-Coder-1.5B Q4_0, kein Download. Aufgabe: `sum` von Subtraktion auf Addition korrigieren.
- Erste Probe: korrektes Diff nach zwei Modellaufrufen, kein Modellfehler. Containerprüfung zunächst unavailable wegen beendeter begrenzter Sitzung, danach Profilablehnung vor Ausführung. Beide Ergebnisse wurden erhalten und nicht als bestandene Tests dargestellt.
- Neue Probe mit bereits genehmigten exakten Runner-Profilen: Auftrag 0461e7ec-38af-4b74-9305-bfa709bbb61c, zwei Modellaufrufe, null Modellfehler, rund 41,34 Sekunden bis zum Review.
- Geprüftes Paket 9b516093-ab34-4299-9146-8f727e7d9c89, Digest fd0fc0176d16fd8fe653ad94c741710fdf1ae82e5d767c9e1e49b7258b5bab19. Nur handlers.mjs: `a-b` wird `a+b`.
- **Build, Syntax, Unit und Integration real im Rootless-Container bestanden.** Ergebnisse enthalten tatsächliche Ausführung, Exitcode 0 und Quellausführung. Bestehendes Image und bestehende Ressourcenlimits wurden verwendet.
- Falscher Anwendungsdigest wurde abgewiesen. Nach ausdrücklicher Benutzerfreigabe wurde exakt das Paket übernommen. Nachprüfungen bestanden; Faktenauftrag completed, zwei Modellaufrufe und zwölf Schritte unverändert.
- Testcommit **d1112ba3fecb4b07e5223f6bdc19dd40c9b50e0d** ausschließlich im separaten Testrepository. Anschließend gezielter Restore: alle fünf Arbeitsdateien und die Referenz stimmen wieder mit den ursprünglichen Hashes überein. Git-Historie bewahrt den Testcommit; der Restore setzt Dateien kontrolliert zurück.

Nachweise: scratch/session31b-real-recheck.json, session31b-task-terminal.json, session31-owner-apply.json, session31-final-completed-task.json, session31-test-commit.json und session31-restored.json. Der frühere blocked-Zwischenstand in session31-completed-task.json bleibt als Nachweis des behobenen Abschlussfehlers erhalten.

## Prüfungen und Grenzen

Bestanden: tsc --noEmit; neue Protokoll-/Parser-/Mehrfachfehler-/Readiness-/Admission-/Abschlussgrenztests; Controllerregression S29; Verwaltungs-/Policytests S20, Export S20, Lifecycle S21, Acceptance und Backup S22, Modelle S23, Backupfehler und Neustartplan S24, Hypervisorplan S25, Rootless-Policy S26, Zertifikatsintegration S27, Workflow S28, Stabilität S29 und Modellreserve S30. Der Sammellauf mit 15 Dateien steht in scratch/session31-regressions.json. Zusätzliche Schlüssel-/Mandanten-/Browsersitzungsprüfungen S6 und S9 sowie zentrale API-Tests bestanden.

S16: tatsächliches mTLS mit simuliertem Modell/Executor bestanden, einschließlich Abbruch, unbekanntem Ergebnis, Widerruf, Git/Restore und fehlgeschlagener Pflichtprüfung. Dies ist keine reale Linux-Isolationsabnahme. Der bestehende reale Achtgruppenbericht wurde mit unverändertem Adapter, Hash und gültigem Ablauf erneut geprüft; diese acht Gruppen wurden in S31 nicht neu ausgeführt. Die vier kleinen Projektprüfungen oben wurden dagegen neu real ausgeführt.

Der korrigierte Embedded-Test bestand mit echter lokaler JSON-/Streaming-Inferenz, Kontextgrenzen, Abbruch und Wiederanlauf sowie ausschließlich nicht ausführender Quellprüfung. Seine isolierten Testzustände sind keine produktive Dateifreigabe und kein vollständiger Projekttest.

## Modulbewertung

| Modul | Stand und praktische Grenze |
| --- | --- |
| Lokale Inferenz / Modelladapter | Implementiert und mit zwei lokalen Modellen real benutzt; aktuelles kleines Qwen als Rückfall. Größere Modelle und GPU nicht qualifiziert. |
| Modellverwaltung / Ressourcen | Installierte Profile, Rollen, manueller Wechsel und Ressourcenprüfung vorhanden und gezielt geprüft. RAM-Schätzungen ersetzen keinen Lasttest. |
| API / Streaming / Authentifizierung | Reale lokale API und SSE bestanden; Rechte, ACL, Rotation, Deaktivierung, Widerruf und Mandantentrennung in Verwaltungs-/APItests geprüft. Keine externe LAN-Abnahme. |
| Coding-Agent | Kleiner realer Ablauf einschließlich Owner-Gate, Commit und Restore bestanden. Komplexere Mehrdatei-Reparaturen weiterhin unvollständig qualifiziert. |
| Isolierter Runner | Bestehende Rootless-Isolation weiterverwendet; aktuelle mTLS-Verbindung und vier echte Projektprüfungen bestanden. Neuer Admission-Preflight aktiv. Achtgruppen-Isolationsabnahme aus Vorbericht revalidiert, nicht neu gelaufen. |
| Fehler / Abbruch / Wiederaufnahme | Aktueller Readiness-/Budgetgrenzfall repariert; unbekannte Ergebnisse werden nicht wiederholt. Nicht jede mögliche Hardware-/Netzwerkstörung real injiziert. |
| Admin-Oberfläche | Bestehende Modelle, Rollen, Clients, Aufgaben, Berichte und Ressourcen weiterverwendet; Modellpfad korrigiert. Kein vollständiger interaktiver Klicktest aller Ansichten. |
| Backup / Restore | Verschlüsselte Sicherungs-/Fehler-/Wiederherstellungstests und gezielter Testdatei-Restore bestanden. Keine vollständige Wiederherstellung des produktiven Computers oder aller Datenbanken. |
| Hardware / R630 | Aktueller Rechner ermöglicht kleine Tests. Größere Modell-/Kontext-/Parallelitätsmessungen durch Speicherreserve/CPU begrenzt; R630-Migration und dessen Hardwarelasttest stehen aus. |
| Andere AMU-Anwendungen | Keine Änderungen. WEB lesend kontrolliert; Agent-3, Preis Assistent und SYSTEM nicht funktional abgenommen. |

## Endzustand, Ressourcen und nächster Schritt

API 1.29.0 ready, bisheriges qwen2.5:1.5b aktiv für alle Rollen; beide Gewichte erhalten. Authentifizierte Modellabfrage 200, ohne Schlüssel 401 und lokaler SSE-Abschluss real geprüft. Neue S31-Testclients widerrufen, zentrale Runnerfreigabe widerrufen, Dienst inaktiv, null Container, rootful Docker/Socket/containerd maskiert, core_pattern core.

AMU WEB: unveränderte Quellhashes, exakt zwei Karten, drei Websites/Seiten/Versionen, zwei Postfächer und sechs Nachrichten wie im Bestand. SQLite quick_check ok und HTTP erreichbar. Keine interaktive Mail-/Anmeldeprüfung. SYSTEM, Archive, separate HDD und andere Projekte wurden nicht verändert.

Exakte Abschlusswerte für freien Speicher/RAM und finale verschlüsselte Sicherung stehen in scratch/session31-end-status.json. Die finale Sicherung umfasst Quellen/Konfiguration und kleine Wiederanlauf-/Prüfnachweise, ausdrücklich nicht komplette Datenbanken, Modellgewichte oder WSL-VHD. Frühere Sicherungen bleiben erhalten.

Priorität S32: unveränderte Mehrdatei-Qualifikationsaufgabe schrittweise aufbauen (Handler, append-only-Testergänzung, gemeinsamer Vertrag), jeweils klare Teilabnahmen und dieselben geschützten Tests. Keine weiteren Gewichte vor nachgewiesener Reserve und Freigabe. Den dokumentierten R630-Plan erst nach Bereitstellung der tatsächlichen Zielhardware und gesonderter Installation-/Netzwerkfreigabe ausführen. Keine allgemeine Produktionsfreigabe.
