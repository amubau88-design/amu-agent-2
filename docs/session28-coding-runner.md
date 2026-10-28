# Sitzung 28 – reale Coding-Abnahme und begrenzte Runner-Verwaltung

Quellversion **1.26.0**. Ausgangscommit **11f9660** bei sauberem Git-Arbeitsbaum bestätigt. Ausschließlich AMU-Agent-2 geändert. Windows-/BIOS-/Firewall-/HDD-/Partitionskonfiguration unverändert, keine Pakete oder Modellgewichte heruntergeladen, kein Betriebssystemneustart. Bestehende API über ihren Supervisor nach geprüften Quelländerungen kontrolliert neu geladen; Abschlusslaufzeit 1.26.0 bereit.

## Implementiert

- Modellaufruf-Messung im Coding-Agenten: Phase, Warte-/Ausgabestatus, erster/letzter Chunk, Ausgabezeichen, Eingabeumfang, tatsächliche Eingabe-/Ausgabetokens, Zeit bis zur ersten Ausgabe, native und gesamte Laufzeit, Unterbrechung und Finish-Grund. Fortschrittscheckpoints höchstens alle zwei Sekunden; vorhandene Admin-SSE-Beobachtung führt niemals einen Auftrag erneut aus. Unvollständige Ausgabe bleibt bei Fehlern auf 4096 Zeichen im privaten, autorisierten Aufgabenstatus begrenzt; keine Quellinhalte in Metriken oder öffentlichen Logs.
- Geführter Modus sendet den bisher unnötig vollständigen Werkzeugkatalog nicht mehr mit. Gelesene Dateiinhalte werden nicht über Werkzeugbeobachtungen doppelt gesendet. Plan erhält Dateinamen; Bericht nur kurze Ergebnisdaten. Plan/Abschluss auf 192/128 Ausgabetokens, freie Werkzeugbegründung auf 160 Zeichen begrenzt. Quelldateien, Paketprüfung, Sandbox und exakte Freigabe bleiben unverändert wirksam.
- Harte Grenzen erhalten: je Fortsetzung maximal 120 Sekunden (zusätzlich Plattformlimit), Gesamtbudget konfigurierbar 10–600 Sekunden, Modell-/Schritt-/Fehlergrenzen unverändert. Neue Testaufträge hatten von Anfang an 300 Sekunden Gesamtbudget. Kein rückwirkendes Erhöhen eines ausgeschöpften Auftrags und kein unbegrenztes Wiederholen.
- `scripts/runner-session.mjs`: ausdrücklich gestartete Windows-/WSL-Testsitzung mit 1–60 Minuten Höchstdauer, vorhandener Benutzer-Loopbackdienst, mTLS-Healthchecks und begrenzte Fehlertoleranz ohne Jobwiederholung. Verweigert die Übernahme eines bereits aktiven Dienstes; stoppt den selbst gestarteten Dienst geordnet. Kein dauerhafter Autostart.
- `scripts/recover-stopped-runner.mjs`: explizite nicht-root Operator-Recovery, nur nach gestopptem Dienst. Prüft Sperridentität und nachweislich fehlenden alten Prozess; vorhandener Adapter bereinigt ausschließlich anhand eigener Containerlabels. Unveränderte Sperre wird archiviert, nicht automatisch gestohlen. Unbekannte Testergebnisse werden nicht zu Erfolg umgedeutet.
- Modellrollen für Standard-/Chat, Coding und Fallback getrennt speichern und ausdrücklich aktivieren. Nur tatsächlich installierte IDs; kein Wechsel während laufender Entwicklungs-/Inferenzarbeit. RAM-Vorprüfung und vorhandener Pool bleiben zuständig. Bei Ressourcenmangel ausschließlich bereits laufendes geprüftes Fallback behalten; keine Downloads. Nativer Ladefehler-Fallback vorbereitet, aber mangels zweitem Modell nicht real durchgespielt.
- Admin-Oberfläche zeigt Rollen und Modellmesswerte. Registrierte Gewichte, Startfähigkeit und tatsächlich laufende Verfügbarkeit getrennt. Qwen3-32B als gesperrtes Planungsprofil ergänzt; KV-Dimensionen für Coder-30B vervollständigt. Keine großen Modelle freigegeben.

## Modellzeiten und Grenzen

Die Sitzung-27-120-Sekunden-Grenze umfasste mehrere Modellphasen. Der erste neue Auftrag verlor nach 17,9 Sekunden Planung in der Änderungsphase 101,6 Sekunden ohne erste Ausgabe. Nach Promptkürzung betrug diese Phase 31,2 Sekunden, 591 Eingabe-/227 Ausgabetokens, erste Ausgabe nach 15,9 Sekunden. Ein vollständiger ursächlicher Nachweis für jeden nativen Stillstand liegt damit nicht vor.

Dieser erste Auftrag verlangte zusätzlich ein exaktes CLI-Präfix. Qwen ließ dieses aus: Build, Syntax und Unit bestanden, echte Integration scheiterte. Eine begrenzte Reparatur wiederholte dieselben Inhalte. Keine Übernahme; Paket verworfen und Befund erhalten. Die Tests wurden nicht passend zum Ergebnis verändert.

Der gesonderte zweite Abnahmeauftrag hatte zwei andere klar definierte Fehler: Subtraktion statt Addition und ein zusätzliches +1 im CLI-Ergebnis. Auch hier gab es zunächst eine unterbrochene Teilausgabe. Nach Begrenzung der freien Begründung gelang eine explizite Fortsetzung. Die konkrete Ursache des nativen Ausgabestillstands ist nicht abschließend bewiesen; bestehende Zeitlimits unterbrachen sicher, Inferenz erholte sich. Dies ist ein reales verbleibendes Zuverlässigkeitsrisiko.

## Vollständiger realer zweiter Auftrag

Auftrag **c739b35d-f8b6-47cb-8031-d1522b855785**, separate neue Arbeitskopie **7cff321c-cc3d-4cb4-935d-28eefebe095f** unter `scratch/core/workspaces/managed-a5f88173-2d60-49b7-b4e6-564bb218861d`.

1. Echtes lokales Qwen erzeugte Plan und zwei Dateiänderungen. Kein nachgebildetes Modell, kein Hostausführen des Testprojekts.
2. Kandidatensnapshot und exakte Profile über tatsächliches mTLS an vorhandenen Rootless-Runner übertragen; bestehende unabhängig geprüfte Achtgruppen-Abnahme von Sitzung 27 war noch gültig und Adaptercode unverändert.
3. Reale Containerprüfungen: Build **2,624 s**, Syntax **1,658 s**, Unit **1,646 s**, Integration **1,722 s**, alle passed. Unveränderte Testdateien kontrollieren die gewünschte Addition und CLI-Ausgabe.
4. Exakter Diff/Digest `370527fe6bfca90259deba1c5677c21ffaa5bb1c5474c09066470527a2cf27e5` nach separater ausdrücklicher Eigentümerfreigabe übernommen. Keine pauschale Übernahme.
5. Sichere nachgelagerte Syntaxprüfung und echter Modellbericht bis **completed**. Plan 16,707 s (240/141 Eingabe-/Ausgabetokens), erfolgreiche Änderung 32,484 s (639/223), Bericht 15,996 s (373/96). Konfigurierter Kontext 4096 Tokens. Gesamte angerechnete Agentenlaufzeit **173,312 s**, einschließlich abgebrochenem Versuch, innerhalb des ursprünglichen 300-Sekunden-Budgets. Fünf tatsächliche Dateileseschritte und ein erfolgreiches prepare_changes; keine Modellentscheidung wurde als Dateiübernahme ausgeführt.
6. Auftragsgebundener Test-Git-Commit **f798264fa6261c01be14900644a1aa978a586738** erfolgreich.
7. Beide freigegebenen Dateien gezielt wiederhergestellt und bytegenau gegen ihre unveränderte Referenz geprüft. Nach Restore korrekt **paused**, Abschlussereignis und Commit bleiben im Admin-Auftragsverlauf erhalten. Dies ist eine beaufsichtigte erfolgreiche Testabnahme mit expliziter Wiederaufnahme und Eigentümerfreigabe, kein Nachweis beliebiger unbeaufsichtigter Softwareentwicklung.

Belege: `scratch/session28-second-verification.json`, `session28-completed-task.json`, `session28-test-commit.json`, `session28-restored.json`, `session28-dashboard-final-task.json` und konkrete Diff-Datei `session28-second-change-review.md`.

## Echter Dienstausfall während aktivem Job

Aktiver neuer harmloser Containerauftrag, anschließend gezieltes SIGKILL ausschließlich des eigenen Runner-Hauptprozesses. Zentrale Ausführung **995ed808-bfa1-45e2-8776-7b1b50ccbce7** wurde **indeterminate**, nicht wiederholt. Automatischer Benutzer-Dienstneustart wurde von der bestehenden Lebenszyklussperre korrekt blockiert. Kein automatisches Entfernen der Sperre.

Danach Benutzer-Testdienst kontrolliert gestoppt, alten Prozess unabhängig ausgeschlossen, genau **ein** eigener Testcontainer über den vorhandenen Adapter bereinigt, Eingabeverzeichnisse erhalten, unveränderte Sperre archiviert und mTLS-Dienst gestartet. Authentifizierte Reconciliation ergab **stopped_unknown**, niemals passed. Neue Aufträge können erst nach geklärtem Wiederherstellungszustand fortgesetzt werden. Belege: `session28-recovery-diagnostic.json`, `session28-controlled-recovery.json`, `session28-reconciled-failure.json`. Dies ist eine tatsächlich geprüfte manuelle Recovery, keine behauptete automatische Crash-Abnahme.

Zentrale Ausführungsfreigabe zum Abschluss widerrufen, neuer Testclient widerrufen. Kein produktiver Runnerzugriff. Neue permanente Windows-/WSL-Autostartlösung nicht aktiviert; der ältere Benutzerdienst stammt aus Sitzung 27. Ein dauerhafter Betrieb benötigt weiterhin gesonderte Eigentümerfreigabe und Abnahme.

## Weitere notwendige Prüfungen

TypeScript --noEmit, Admin-JavaScript-Syntax und git diff --check bestanden. Neue Sitzung-28-Managementtests, Sitzung-16-Workflowregression, Sitzung-23-Modell-/Ressourcenregression und Sitzung-27-TLS-/Widerrufstests bestanden. Diese Regressionen enthalten nachgebildete Modelle/Executor; sie sind von den oben beschriebenen echten Linux-/Modellläufen getrennt.

Echte fehlende Clientidentität und falscher Serverpin bei der erneuten Integration abgelehnt. Keine neuen Zertifikate notwendig; vorhandene Identitäten/Fristen geprüft. Reale Ressourcenrollen-API: nicht installierte ID abgelehnt, Entwicklerzugriff 403, drei Rollen auf einziges installiertes Modell gespeichert, vorhandenes Coding-Modell ausdrücklich aktiviert. RAM-Fallback-Entscheidung und Recovery-Verweigerung bei lebendem PID zusätzlich als Managementtests geprüft, kein absichtlich großer Modellstart.

API 1.26.0 ready, Authentifizierung 401/200 und reales Qwen-SSE bis [DONE] nach Abschluss bestanden. AMU WEB: fünf Referenzdatei-Hashes unverändert, exakt zwei Hauptkarten und drei Websites/Seiten/Versionen, zwei Mailkonten und sechs Nachrichten unverändert; SQLite quick_check=ok, HTTP bereit. Kein interaktiver Mailversand-/Login- oder neuer produktiver Datenbank-Restore-Test.

Momentaufnahme 20:49 Uhr Europe/Berlin: C: **17,35 GiB** frei, RAM **12,54 GiB** frei von 23,91 GiB; CPU-Gesamtauslastung **17,9 %** über zwei Sekunden. CPU: Xeon E3-1230 V2, acht logische Prozessoren. Linux weiterhin 2 CPUs/4 GiB/1 GiB Swap. HDD-Identität lesend bestätigt und unverändert geschützt; fehlende Partitionen sind keine Löschfreigabe.

## Modellplanung und Sitzung 29

Details, KV-Berechnung und Primärquellen: [Modell-/Hardwarebericht](session28-model-hardware.md). Qwen3-32B Q4_K_M etwa 19,8 GB, Coder-30B-A3B etwa 18 GB (konkretes GGUF abhängig vom Herausgeber). Beide passen nicht zu aktuellen RAM-/SSD-Reserven. Vorhanden ist generisches Qwen2.5-1.5B, kein tatsächlich installiertes kleines Coder-Modell. 7B ist eine spätere Zwischenoption nach Speicherfreigabe, ohne jetzigen Download. Planungsziel für große Modelle einschließlich Windows/Runner etwa 48–64 GiB RAM und mehr SSD-Reserve; Kompatibilität der vorhandenen Plattform und GPU-Versorgung nicht bestätigt.

Prioritäten 29: nativen Ausgabestillstand gezielt anhand begrenzter Teilausgaben untersuchen; echten schwierigen Präfix-/Reparaturauftrag mit besserem kleinen Coder gesondert qualifizieren; dauerhafte WSL-Überwachung erst nach konkreter Freigabe; Recovery weiter unter PID-Wiederverwendung, Wiederholungs- und Netzunterbrechungsszenarien prüfen; Speicherreserve erhalten. Keine vollständige Produktivfreigabe aus diesem kleinen erfolgreichen Test ableiten.

Abschließender Lebenszyklusnachweis: neuer begrenzter Start mit mTLS-Healthchecks für genau eine Minute, Exitcode 0, danach Dienst inactive und kein Listener auf 9443. Keine eigenen Container mehr vorhanden; core_pattern=core, alle drei systemweiten Docker-Dienste weiterhin masked. Keine neuen Windows-WSL-Crash-Dumps. Zusätzliche Sitzung-15-Dashboardregression bestanden (Fixture). Vorherige Source-/Konfigurationssicherung b2292728-6b0b-48e8-ada1-98712da3cba4 authentifiziert extrahiert; neue Linux-Recoverydaten privat erfasst. Kein vollständiger neuer DB-/VHD-Restore-Test.
