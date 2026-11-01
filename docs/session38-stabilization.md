# Sitzung 38 – 1. November 2026

**Version 1.36.0, Branch master; noch nicht vollständig qualifiziert.** Verifizierter Ausgangspunkt: d69b44a / 1.35.0, sauberer Arbeitsbaum. Der S37-Commit enthielt tatsächlich zehn Dateien, nicht sieben. Bestehende Commits und der Tag v1.0-agent2 bleiben erhalten. Keine neue Plattform.

## Technische Änderungen

- Vor einer neuen Modellreservierung wird aus vollständigen bisherigen Antwortlaufzeiten beziehungsweise der vererbten Elterndauer geschätzt, ob noch genügend Platz im aktuellen Ausführungsfenster bleibt. Wenn nicht, wird ein dauerhafter `model_window_deferred`-Checkpoint geschrieben: kein neuer Modellaufruf, keine Tokenreservierung. Harte Deadlines, Gesamtzeit, Fehler-, Schritt- und Aufrufgrenzen bleiben unverändert. Unbekannte/fehlgeschlagene Messungen liefern keine erfundene Schätzung.
- Mehrere zulässige Elternfortsetzungen werden innerhalb der schon bestehenden gemeinsamen Obergrenze verarbeitet, bevor ein Reparaturkind beansprucht wird. Quellhashes, Modellbindung und Eigentümerabbruch bleiben maßgeblich. Kein Budgetreset.
- Abgelehnte Ersatztexte bleiben privat für die Fingerprint-Prüfung gespeichert, werden aber nicht erneut als Codebeispiele in den Modellprompt kopiert. Der Prompt enthält begrenzte Fingerprints, Ziele und Fehlermeldungen. Das verhindert keine Modellfehler und ist keine eingebaute Musterlösung.
- Aus einer real fehlgeschlagenen Versandkostenprüfung abgeleitet: neue direkte Funktionswert-Arithmetik wie `base + withDelivery` wird per AST vor dem Staging abgewiesen. Bedingte Rekursion, gleichnamige Parameter, Eigenschaften und unveränderte vorhandene Stellen werden nicht pauschal verboten. Konservativer Guard, kein vollständiger Typbeweis und keine automatische Reparatur.
- Eigentümer-Helfer unterstützt `--existing-tab`: zeigt den Code ausschließlich lokal und öffnet keinen zweiten Browser. Windows-SID-/Dateieigentümerprüfung, Ablauf und Einmalverwendung unverändert.
- Eigentümerformular zeigt fehlenden Code und fehlgeschlagene beziehungsweise bestätigte Anmeldung unmittelbar neben dem Feld. Leerer Code erzeugt keinen Serverversuch. Bestehende Sitzungen werden beim Seitenstart geprüft. Veraltete Bestätigungen werden beim Sitzungsverlust entfernt; eine akzeptierte Codeprüfung ohne anschließend bestätigte Verbindung gilt nicht als erfolgreiche Anmeldung. Keine Änderung der serverseitigen Rechte-, Origin- oder Cookie-Sicherheitsregeln.

Dateien: package.json, package-lock.json, scripts/AMU-Administratorzugang.cmd, src/core/coding-agent.ts, src/core/controller.ts, src/core/model-recovery.ts, src/core/model-window.ts, src/core/contract-edits.ts, src/web-ui/public/admin.html, src/tests/fixtures/session38-shipping.json, vier session38-Tests und dieser Bericht.

## Gezielte Prüfungen

Zwölf gezielte Fixture-/Management-Suiten bestanden, siehe `scratch/session38-tests.json`; `tsc --noEmit` und `git diff --check` ebenfalls bestanden. Die vier neuen Suiten decken Fensterplanung, echte Controller-Persistenz, Funktionswert-Arithmetik sowie Eigentümer-UI/Sitzungen ab. **Keine zwölf nativen Coding-Erfolge.**

Der Controller-Fenstertest verwendet ausdrücklich simulierte Zeit und Modellantworten: drei produktive Reservierungen über drei unveränderte begrenzte Fenster, zwei gemeinsame Fortsetzungen, kein vorschnelles Kind und keine Dateiübernahme. Reale Timer oder Windows-Uhr wurden nicht geändert.

Der Eigentümertest bedient die tatsächlichen Dashboard-Handler im simulierten DOM gegen echtes Loopback-HTTP: leerer Code ohne Request, falscher Code abgelehnt, korrekter Fixture-Grant mit HttpOnly-Administratorsitzung, erneutes Erkennen einer vorhandenen Verbindung, Zurücknahme einer abgelaufenen/ungültigen Sitzung, Logout sowie akzeptierter Code bei fehlender Cookie-Übernahme. Keine Windows-Eigentümerprüfung oder produktive Browseranmeldung vorgetäuscht.

Zwei neue Fixtures mussten zunächst korrigiert werden: fehlendes `show_diff`-Recht im Fenster-Test führte zur richtigen Verweigerung; eine nicht normalisierte Windows-Verzeichniszeichenfolge im Owner-Test wurde korrekt abgelehnt. Nur diese Fixture-Voraussetzungen wurden korrigiert, keine Produktivfreigaben erweitert und keine Prüfassertion abgeschwächt.

## Reale isolierte Coding-Ergebnisse

Normale 16-GiB-Stop-Grenze; keine Reserveausnahme, Downloads oder Löschungen. Neue separate Referenzen und Git-Testkopien für Lagerbestand und Versandkosten. Alle Vertrags- und Regressionstests vor Modellstart eingefroren. Kein generierter Projektcode auf dem Windows-Host ausgeführt. Die bestehende noch gültige S36-Isolationsabnahme wurde auf Alter/Identität/Adapter geprüft und wiederverwendet; acht unveränderte Isolationsgruppen nicht erneut ausgeführt.

| Fall | Reservierte Modellaufrufe | Aktive Aufgabenzeit | Ergebnis |
| --- | ---: | ---: | --- |
| Lagerbestand | 4 | 336,194 s | Nicht bestanden. Rekursiver clamp-Vorschlag wiederholt, sicher gestoppt; kein Paket angewendet. |
| Versandkosten, erster Lauf | 4 | 365,718 s | Paket entstanden; Build/Syntax bestanden, Unit 3/4 und HTTP-Integration fehlgeschlagen. Keine Übernahme. |
| Versandkosten, genau ein Neulauf nach AST-Fix | 4 | 341,429 s | Funktionswert-Fehler vor dem Staging erkannt; Kind wiederholt den Vorschlag, Fehlerbudget beendet. Kein Paket angewendet. |

Insgesamt zwölf Coding-Reservierungen, zwölf vollständige Antworten, **kein unterbrochener Modellversuch** in diesen S38-Läufen; gemeinsame Budgets und höchstens ein Kind je Auftrag unverändert. Jeder Lauf erzeugte drei Fenster-Deferrals; maximal zwei gemeinsame Fortsetzungen. Die Zeitfensterverbesserung löste die semantische Modellgrenze nicht. Zum Vergleich benötigte der S37-Lagerbestandslauf sieben Reservierungen und 462,673 Sekunden mit drei unterbrochenen Versuchen. Dies sind Einzelbeobachtungen, kein kontrollierter Hardware-Benchmark.

Root-Tasks:

- Lagerbestand: 5fd3a981-905f-44e0-a79c-5927269ec0e9.
- Versandkosten: 1b04cc98-e3b6-48db-96c9-ecb6a9c82c15.
- Versandkosten nach Guard: 1298c593-bd81-41a5-8c69-d249ebc31a2e.

Die erste Versand-Baseline wurde vor jedem Quelltransfer als `unavailable` abgewiesen: neu benannte Profile waren auf dem Runner nicht provisioniert. Anschließend wurden die bereits freigegebenen unveränderten s29-Rezepte im neuen Testworkspace gebunden. Keine Linux-Konfiguration, Testinhalte oder Ressourcenlimits geändert. Die korrekte Baseline reproduzierte die defekten Unit-/HTTP-Verträge real. Für den späteren Neulauf wurde diese unveränderte Baseline mit erneuter Hashkontrolle wiederverwendet, nicht noch einmal ausgeführt.

Der reale fehlgeschlagene Kandidatenlauf `4970576d-0ae2-4aef-8fec-871f0c2aead6` führte alle vier Profile aus. Das Modell korrigierte die Multiplikation und AMU ließ den Import durch sein Kind reparieren, verwendete aber in fees.mjs den Funktionswert statt des numerischen Parameters. Die Tests meldeten tatsächlich einen String statt 17. Paketdigest `fddee5485a32e20917b0123c27586a827dbcccaca11ab2d813cb27f424c5a7e0`; dieses Paket wurde niemals übernommen.

Codex entwickelte die Plattformkorrekturen und Testgerüste. Innerhalb der Modellläufe gab es keine manuellen Testquellen-Reparaturen, keine festen Ersatzlösungen und keine Budgetresets. Der zusätzliche Versandversuch erfolgte erst nach einem konkreten neuen generischen Guard-Fix; alle ursprünglichen Versuche bleiben erhalten und werden mitgezählt. AMU erledigte Lesen, Modellvorschläge, automatische Fortsetzung, Kindsteuerung, Paketbildung und die isolierte Prüfkoordination. Baseline-Planung war algorithmisch aus Befunden abgeleitet, keine separat qualifizierte Modellplanung.

Alle neun Dateien beider Testkopien und ihrer Referenzen sind SHA-256-gleich geblieben. **Keine Übernahmefreigabe angefordert**, weil kein vollständig bestandenes Paket vorlag. Kein neuer Projekt-Test-Commit und keine angewendete Restore-Operation. Ein unverändertes Original ist kein neuer Restore-Nachweis. Der Plattform-Quellcommit wird getrennt lokal gesichert.

## API, Leistung und Runner

API 1.36.0 abschließend ready, Qwen2.5-1.5B lokal, Kontext 4096, anonyme Modellabfrage 401, keine aktiven/angestauten Anfragen. Beide vorhandenen Qwen-Gewichte und die Backend-Registry erhalten; keine Ollama-Installation oder -Qualifikation.

Gemessene Modellladezeiten beim Reload/Wechsel etwa 6,95, 6,91 und abschließend 6,88 Sekunden. Zwei echte warme 8-Token-SSE-Prüfungen vollständig: etwa 1,16 und 0,98 Sekunden. Gleicher nativer PID und unveränderte Ladezeit bei beiden warmen Anfragen bestätigt. Bestehendes Warmhalten genutzt, keine aggressivere Speicherpolitik. Keine Garantie einer verbesserten Kaltladezeit und kein erreichtes Drei-Sekunden-Kaltladeziel.

Vorhandener Heartbeat-Watchdog unverändert aktiv. Ereignisnachweis in `session38-evidence-summary.json`; geplante API-Reloads für neue Quellkorrekturen sind von Fehlerneustarts getrennt. Ursache des früheren Heartbeat-Ausfalls sowie echter aktiver Job-Crash bleiben unqualifiziert. Ausbleibende Reproduktion ist kein Ursachenbeweis.

Runner nach jedem begrenzten Lauf gestoppt und zentrale Ausführungsfreigabe widerrufen. Abschluss: Dienst inaktiv, Autostart disabled, null Container, rootful Docker/Socket/containerd masked, core_pattern=core. TLS-/Quell-/Profilbindung und Limits unverändert. Kein dauerhafter Ausführungszugang.

## Tatsächlicher Eigentümer- und GitHub-Status

Der bestehende eingebettete Browser wurde real geöffnet, die neue Fehleranzeige geladen und eine leere Eigentümeranmeldung sicher clientseitig abgewiesen. Screenshot: `scratch/session38-owner-empty.jpg`. Trotz Nutzerbestätigung zeigte der geprüfte Tab keine authentifizierte Verbindung; ein produktiver positiver Sitzungs-/Administrationsnachweis liegt nicht vor. Der Code wurde weder ausgelesen noch im Chat ausgegeben. Die HTTP-/DOM-Erfolgstests sind ausdrücklich Fixtures.

Git: origin unverändert `https://github.com/alharror/amu-agent-2.git`, Branch master. Vorhandener Git Credential Manager geprüft; zusätzliche Geräteanmeldung ausschließlich im lokalen sichtbaren Fenster angeboten. Der Nutzer meldete deren Abschluss, aber die nachfolgende Konten-/Remote-Prüfung lieferte weiterhin keine gespeicherten Zugangsdaten. Keine Authentifizierung erfunden, kein Push, kein Force-Push, keine fremden Branches überschrieben. Grund für die fehlende Persistierung nicht nachgewiesen; keine Windows-Anmeldespeicher- oder Sicherheitseinstellungen geändert.

## Bestandsschutz und Sicherung

Nur AMU-Agent-2 entwickelt. Keine anderen Projektquellen geändert, keine Pakete/Images/Modelle heruntergeladen, keine HDD-/Partitions-/Firewall-/Betriebssystemänderungen, keine Datenbereinigung. Erster S38-Snapshot rund 19,54 GiB frei auf C: und 13,43 GiB RAM; Abschlusswerte in `session38-end-status.json`.

AMU WEB ausschließlich lesend geprüft: Quellhashes unverändert, SQLite quick_check ok, zwei Hauptkarten, drei Websites/Seiten/Versionen und unveränderte Mailbox-/Nachrichtenbestände. Der bekannte Audit-Zähler steht gegenüber der alten Cleanup-Referenz bei 9 statt 8; Herkunft nicht behauptet, kein Reset/Restore vorgenommen. Keine Behauptung byteidentischer gesamter Fremddatenbank oder neuer Mailzustellungsabnahme.

Verschlüsseltes Vorher-Backup `094a9795-f7af-40c3-98d3-e34d0eab0eda` durch authentifizierte Extraktion geprüft. Abschließendes Quell-/Konfigurations-/Evidenzbackup inklusive Screenshot und privater Runner-Wiederanlaufdaten nach lokalem Commit, separat extrahiert und geprüft. Alte Backups unverändert erhalten; keine vollständige neue VHD-/Datenbank-/Modellgewichtsicherung behauptet.

## Verbleibende Prioritäten

1. Semantische Kontextübergabe an das kleine Coding-Modell verbessern, insbesondere Parameter gegenüber Funktions-/Importnamen hervorheben. Nicht erneut dieselben schwachen Vorschläge unbegrenzt versuchen oder Tests anpassen.
2. Erst bei real vollständig bestandenem Kandidaten konkrete Freigabe, Übernahme, Projekt-Commit und Restore durchführen. Die autonome Coding-Abnahme bleibt derzeit fehlgeschlagen.
3. Produktive Eigentümersitzung im tatsächlich verwendeten Browser nachweisen und geschützte Aktionen prüfen; Git-Kontopersistierung getrennt klären, dann Remote-Historie prüfen und normal pushen.
4. Aktive Job-/Prozess-Crash-Recovery mit unabhängiger Lease-/Container-Reconciliation abnehmen. Vorhandene Sicherheit nicht zur Beschleunigung abschwächen.
