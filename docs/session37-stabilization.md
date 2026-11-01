# Sitzung 37 – 1. November 2026

**Version 1.35.0, Branch master; noch nicht vollständig qualifiziert.** Ausgangspunkt: 1.34.0 / 3f090d7, sauberer Arbeitsbaum. Der bestehende Tag v1.0-agent2 bleibt unverändert auf dem S36-Commit. Nur AMU-Agent-2 wurde weiterentwickelt.

## Behobene Steuerungsfehler

1. S36 setzte das Reparaturkind nach ausgeschöpftem Fehlerbudget erneut fort, weil eine breite Textsuche auch „Model output failure budget exhausted“ als normalen Fensterwechsel behandelte. Jetzt sind ausschließlich tatsächlicher Timeout oder normales Schrittfenster zulässig; Fehler-, Aufruf-, Schritt- und Laufzeitgrenzen werden unabhängig geprüft. Kein Budgetreset.
2. Auch eine explizite Wiederaufnahme darf ein verbrauchtes Modellfehlerbudget nicht umgehen: vor einer neuen Modellreservierung wird es geprüft. Verifizierte Abschluss-/Review-Schritte erhalten keine zusätzliche Generierungsberechtigung dadurch.
3. Der Kindauftrag erhält die letzte gezielt zum Reparaturziel passende Fehlermeldung des Elternauftrags und dessen abgelehnte Edits. Private, persistierte Historie: maximal vier deduplizierte Fingerprints, jeweils begrenzte Vorschautexte. Keine Ausweitung der Dateirechte und keine eingebaute Musterlösung.
4. Identische bereits abgelehnte Edits werden vor der weiteren Verarbeitung mit 422 abgewiesen. Nur tatsächlich gerade geprüfte Edits gelangen in diese Historie; unvollständiges JSON darf nicht irrtümlich den alten erfolgreichen Vorschlag als abgelehnt markieren. Bestehende strikte JSON-/Schemaschranken, Syntax-/Modulprüfungen, Hashes und Eigentümerfreigaben bleiben erhalten.
5. Ein älterer Agententest zeigte einen weiteren Fehler: der Aufruf eines inzwischen entzogenen bekannten Werkzeugs wurde als reparierbarer Schemafehler behandelt. Die Rechteprüfung verwirft diesen Fall jetzt endgültig mit 403 vor weiteren Modellversuchen. Positive Aktionen benötigen weiterhin das vollständige gültige Schema. Der bestehende Test wurde nicht abgeschwächt und besteht nun.
6. Der API-Heartbeat hängt nicht mehr von vollständiger Modell-/Monitoring-Statusserialisierung ab. Er sendet ein kleines Lebenszeichen mit Zeit, gemessener Timerverzögerung und RSS; bei ausstehender IPC-Zustellung wird kein unbeschränkter Nachrichtenstau erzeugt. Der bestehende 30-Sekunden-Watchdog bleibt aktiv. Die Ursache des S36-Ausfalls ist damit **nicht bewiesen oder abschließend behoben**.

Geänderte Dateien: package.json, package-lock.json, src/core/coding-agent.ts, src/core/controller.ts, src/index.ts, src/core/model-recovery.ts, src/core/heartbeat.ts, src/tests/session37-recovery.test.mjs, src/tests/session37-controller.test.mjs und dieser Bericht.

## Gezielte Softwareprüfungen

14 gezielte S31–S37-Suiten bestanden (`scratch/session37-tests.json`), einschließlich der beiden neuen Recovery-/Controller-Suiten. Nach den letzten Guards wurden beide neuen Suiten und `tsc --noEmit` erneut erfolgreich ausgeführt; `git diff --check` ist ohne Fehler. Fixtures/Mock-Modelle, **keine 14 nativen Coding-Abnahmen**.

Die neue Controller-Regression führt absichtlich rekursive Mock-Vorschläge durch den realen Controller: Fehlerkontext im Kindprompt nachgewiesen, genau vier reservierte Modellaufrufe inklusive Planung, kein dritter Kindaufruf, keine automatische Fortsetzung nach Fehlerbudget, kein Paket und unveränderte Originaldatei. Direkte Wiederaufnahme mit erschöpftem Fehlerbudget erzeugt keinen zusätzlichen Modellaufruf.

Zusätzlich bestand der unveränderte ältere `session12-agent.test.mjs` nach dem Rechtefix: echtes Loopback-HTTP, strikte Schemas, Scope-Grenzen, Pause/Abbruch, explizite Wiederaufnahme, persistierte Apply-/Task-Crash-Lücke ohne Replay, exakte Freigabe und gezielter Restore. Modell simuliert, 32 Mock-Aufrufe; nur sichere Syntax-Subprozesse auf dem Host, keine Ausführung generierten Projektcodes. Der zuerst fehlgeschlagene Test und die Korrektur sind in `session37-supplemental-checks.json` dokumentiert.

## Neuer realer Lagerbestandslauf

Genau eine neue isolierte Testkopie: `scratch/core/workspaces/managed-5b382a1a-31c2-4145-aa77-0f50c5ed8d6d`, Workspace-ID 61dd1ee4-f118-44d0-bea5-86f6e654158d. Bestehende Unit-/HTTP-Verträge unverändert; gezielte Regression vor der Modellgenerierung ergänzt. Eigentümer genehmigte ausdrücklich die sitzungsbezogene 14-GiB-Stop-Grenze. Kein Download, keine Löschung, keine globale Reserveänderung.

Die noch gültige unveränderte S36-Isolationsabnahme wurde strikt erneut auf Identität, Alter und Adapterdigest geprüft und verwendet. Die acht unveränderten Isolationsgruppen wurden **nicht unnötig neu ausgeführt**. mTLS-Probe/Reportbindung und reale Quellübertragung erfolgten im vorhandenen Rootless-Runner. Baseline real: Build und Syntax bestanden, Unit und HTTP-Integration fehlerhaft. Ressourcen-/Netzwerk-/Dateisystemgrenzen unverändert.

Root-Task `c2d7d1fb-dcfb-4056-975a-35fd46bcd0d6`, Kind `74cb6922-875c-4021-b200-06448d194195`. **Ergebnis: nicht bestanden.** Sieben reservierte Modellaufrufe, zwei gemeinsame begrenzte Fortsetzungen, ein Kind, 23 Schritte, drei Fehler insgesamt, etwa 462,7 Sekunden aktive Aufgabenlaufzeit. Vier vollständige Antworten, drei unterbrochene Versuche. Bekannte Tokenzahlen nur vollständiger Antworten: 4716 Prompt / 324 Ausgabe. Reservierte Obergrenze 30464 ist ausdrücklich kein gemessener Verbrauch. TTFT der vollständigen Antworten etwa 58–92 Sekunden.

AMU erhielt den korrekten stock.mjs-Entwurf, startete das Kind und übergab ihm die letzte Rekursionsablehnung samt Fingerprint. Das lokale Qwen-Coder-1.5B wiederholte trotzdem den fehlerhaften `clamp(n)`-Ersatz. Die neue Wiederholungsprüfung griff real zweimal; das Kind stoppte nach seinem initialen Fehler und einem erlaubten Fehler-Retry. Keine zusätzliche Fortsetzung über diese Grenze. Dadurch ist die **Recovery-Sicherheit verbessert, die autonome Lösungsqualität aber nicht qualifiziert**.

Codex bereitete Testgerüst/Policy und Softwarekorrekturen vor; keine manuelle Reparatur der Testquellen während des nativen Laufs. AMU erledigte Datei-Lesen, echte Modellaufrufe, Fehlerübergabe und Kindsteuerung. Baseline-Plan algorithmisch aus Evidenz, kein separat nachgewiesener Modellplan. Keine manuelle Wiederaufnahme des nativen Laufs. Das anschließend ergänzte Verbot einer expliziten Wiederaufnahme nach verbrauchtem Fehlerbudget sowie der nicht geführte Tool-Rechtefix sind separat durch Fixtures geprüft, nicht als zusätzliche native Modellleistung gezählt.

Kein fertiges Änderungspaket, daher keine Übernahmefreigabe angefordert, kein neuer Test-Commit und keine Restore-Anwendung. Alle neun Dateien der Testkopie und Referenz per SHA-256 unverändert (`session37-original-hashes.json`). Die historische S36-Übernahme-/Restore-Abnahme bleibt erhalten und wird nicht als neuer S37-Restore ausgegeben.

## Laufzeit, Runner, Leistung

Nach Abschluss zentrale Runner-Ausführungsfreigabe widerrufen; Benutzerdienst inaktiv, Autostart disabled, null Container. Rootful Docker/Socket/containerd weiter masked, core_pattern=core. Private Wiederanlaufdaten lokal gesichert (`session37-linux-final-completed.json`, privates Recovery-Tar). Keine neuen Linux-Pakete, keine Betriebssystem-, Firewall-, HDD-, Partitions- oder Hardwareänderung.

Im beobachteten Zeitraum seit dem initialen S37-Reload **null Heartbeat-Timeouts**. API-PID blieb während des nativen Laufs stabil; abschließend geplanter Reload auf den vollständigen Quellstand. Kein neuer erzwungener Crash-/Job-Ausfalltest; diese Qualifikation bleibt offen.

API 1.35.0 ready, Qwen2.5-1.5B und SSE funktionsfähig, nicht authentifiziertes `/v1/models` weiter 401, Kontext 4096. Ursprüngliche Modellrollen wiederhergestellt, beide Qwen-Gewichte erhalten. Gemessene Ladezeiten beim S37-Reload etwa 7,15 und 8,31 Sekunden; Drei-Sekunden-Kaltladeziel nicht erreicht. Zwei echte kurze SSE-Antworten bestanden. Deren Einzel-Wallzeiten gingen durch einen nachfolgenden Prüfharness-Fehler verloren und werden nicht erfunden; letzte warme Generierung laut Engine 1037 ms. Wiederverwendung des geladenen Workers wird separat in `session37-warm-reuse.json` festgehalten. Keine aggressivere Warmhalte- oder Speicherpolitik eingeführt. Backend-Registry unverändert; Ollama weder installiert noch qualifiziert.

## Eigentümer-Browserprüfung und GitHub

Die vorhandene Browsersteuerung ließ sich nach einem Bindungsreset wieder mit demselben eingebetteten Tab verbinden. Echte sichtbare Prüfung: Version 1.35.0, API bereit, Anmeldung erforderlich. Lokaler bestehender Administrator-Helfer geöffnet; keine Codes, Passwörter oder Schlüssel im Chat. Nach der Nutzerbestätigung und erneutem „Status laden“ zeigte genau dieser Tab weiterhin keine authentifizierte Verbindung. Serverseitig war der frische Owner-Grant unbenutzt, nicht abgelaufen, und die Browsersitzungsliste leer. **Geschützte Browser-Abnahme nicht bestanden.** Kein Umgehen der Anmeldung.

Konkreter verbleibender Schritt: frischen Code aus `scripts/AMU-Administratorzugang.cmd` ausschließlich im tatsächlich eingebetteten AMU-Tab in „Lokaler Eigentümer-Einmalcode“ einsetzen und „Als Eigentümer anmelden“ abschließen; erst bei sichtbarer authentifizierter Sitzung geschützt weiterprüfen. Kein weiterer Code während dieser Sitzung angefordert.

origin bleibt `https://github.com/alharror/amu-agent-2.git`. Ein lesender nicht interaktiver Zugriff scheiterte weiter an fehlenden Git-Zugangsdaten. Kein Push ohne Authentifizierung/Remote-Prüfung, kein Force-Push, keine fremde Historie überschrieben. Lokaler Commit ist die verlässliche Sicherung; der alte Tag bleibt unverändert.

## Bestandsschutz, Daten und Sicherungen

AMU WEB ausschließlich lesend geprüft: Quellhashes gleich, zwei Dashboardkarten, drei Websites/drei Seiten/drei Versionen, zwei Mailboxen/sechs Nachrichten, SQLite-Integrität ok. Gegenüber der älteren Cleanup-Referenz steht Audit auf 9 statt 8; Herkunft/Zeitpunkt nicht nachgewiesen, kein Reset/Restore vorgenommen. Keine Behauptung byteidentischer gesamter Fremddatenbank. Ein neuer Prüfharness verglich zunächst irrtümlich alle Referenztabellen gegen eine nur sechs Tabellen umfassende Map; dies verursachte einen falschen Abbruch. Die vollständige lesende Bestandsaufnahme trennt unveränderte Geschäftsdaten und den abweichenden Audit-Zähler transparent. Keine Tests oder Projektverträge abgeschwächt.

AMU SYSTEM, WEB, Preis Assistent, Agent-3 und Auftragsplattform nicht entwickelt oder zurückgesetzt. Keine Modelle, Datenbanken, Schlüssel oder alte Backups gelöscht. Keine Disk-Bereinigung in S37. Erster S37-Ressourcensnapshot nach Reload etwa 19,51 GiB frei auf C:; der Unterschied zu S36 wird nicht als eigener Speichergewinn ausgegeben. Abschlusswerte siehe `scratch/session37-end-status.json`.

Vor Änderungen verschlüsseltes Backup `966ec799-ee6d-436b-9376-f51dbb5f84c2` erstellt und durch authentifizierte Extraktion geprüft. Abschließendes Quell-/Konfigurations-/Evidenzbackup separat nach Commit; Nachweis in `session37-final-backup.json`. Keine vollständige neue VHD-/Datenbank-/Modellgewichtssicherung behauptet. Vorhandene Sicherungen bleiben erhalten.

## Prioritäten für Sitzung 38

1. Lange Prefill-Zeiten und verlorene Zeitfenster vor neuer Modellreservierung messen; bestehende Budgets beibehalten und verschwendete Aufrufe vermeiden. Semantische Modell-Recovery bleibt das Hauptproblem, nicht JSON-Reparatur allein.
2. Lagerbestandsfall ohne Codex-Musterlösung und ohne Budgetreset erfolgreich lösen; erst bei vollständig grünem Paket konkrete Übernahme/Commit/Restore freigeben lassen.
3. Tatsächliche lokale Eigentümeranmeldung und geschützte Browseraktionen abschließen; GitHub-Zugang getrennt reparieren.
4. Prozess-/Job-Crash-Recovery mit unabhängig geprüften Leases und Containerabgleich qualifizieren. Keine blinde Lock-Übernahme und keine behauptete vollständige Produktionsreife.
