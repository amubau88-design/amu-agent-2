# Sitzung 32 – Mehrdatei-Qualifikation und gezielte Reparatur

## Ergebnis und Ausgang

Ausgang **1.29.0 / bec223e / master**, tatsächlich sauber; API bereit, bisheriges Qwen aktiv. Freier Speicher zu Beginn etwa 16,77 GiB, freier RAM etwa 15,30 GiB. Vor Änderungen verschlüsselte Quellen-/Konfigurationssicherung ea75ef06-ea19-4db7-aa85-211849819aa0 mit authentifiziert geprüfter Extraktion.

Neue Quelle und laufende API: **1.30.0**, weiterhin master. Endcommit und genaue Abschlussressourcen stehen im Abschlussbericht sowie scratch/session32-end-status.json.

**Ein administrativ betreuter Dreidatei-Ablauf mit separatem Modell-Reparaturauftrag hat reale Build-, Syntax-, Unit- und Integrationstests sowie die ausdrücklich freigegebene Übernahme, den Testcommit und Restore bestanden. Die vollautonome Mehrdatei-Einzelaufgabe hat nicht bestanden.** Diese Ergebnisse sind getrennt zu bewerten.

## Implementierte Reparaturen

- Neuer statischer Modulvertrag in `src/core/module-contracts.ts`: begrenzte Import-/Export-Fakten aus freigegebenen ESM-Dateien, ohne Laden oder Ausführen der Module. Der geführte Agent sieht nun neben seiner Zieldatei die Schnittstellen der anderen deklarierten Dateien und erhaltenen Kandidaten.
- Fehlende direkte benannte Exporte werden vor dem Staging abgefangen. Nur zugelassene Dateien dürfen für Reparaturen ausgewählt werden; bestehende Entwürfe und Basis-Hashes bleiben erhalten.
- Eine leere Modelländerung wird abgewiesen, wenn der betroffene Import-/Export-Vertrag noch verletzt ist. Der Reparaturprompt benennt fehlende Exportnamen ausdrücklich. Nach behobenem Schnittstellenfehler werden unnötige weitere Modulreparaturen entfernt.
- Faktenberichte zählen nur Syntaxprüfungen des aktuellen Pakets und der aktuellen Quelldateihashes. Alte erfolgreiche Prüfungen anderer Kandidaten erhöhen die angezeigten Erfolgszahlen nicht mehr.
- Neuer Administratorendpunkt `POST /api/core/change-sets/:id/snapshot` stellt für ein noch nicht angewendetes Paket einen gebundenen Prüfsnapshot her. Er führt keinen Code aus und erteilt keine Ausführungsfreigabe. Die vorhandene Runner-Planfreigabe bleibt erforderlich. Fehlende/ungültige Kontextdateilisten werden mit 400 abgewiesen, Entwickler dürfen diesen Administratorendpunkt nicht verwenden.
- Regressionen für zusammenhängende Module, gezielte Reparatur, No-op-Ablehnung, erhaltene Kandidaten, unveränderte geschützte Tests und aktuelle Ergebniszählung ergänzt. Bestehende Runner-/Freigabe-/Git-Infrastruktur wurde weiterverwendet.

Grenzen der statischen Prüfung: CommonJS, unbekannte oder abgeschnittene Module, Stern-Reexports und dynamische Auflösung sind nicht vollständig bewiesen. Der Bericht kennzeichnet unbekannte Ziele; ein fehlerfreier statischer Vertrag ersetzt keine realen Tests. Es werden keine zusätzlichen Projektdateien außerhalb der erklärten Leserechte aufgelöst.

## Reale Aufgabe und unveränderte Tests

Neue isolierte Testkopie mit sieben Dateien: pricing.mjs, handlers.mjs, server.mjs, unit.mjs, integration.mjs, package.json und README.md. Genau drei Programmdateien waren bearbeitbar. Die vorhandenen Unit- und HTTP-Vertragstests wurden bytegleich aus dem geprüften S29-Referenzbestand übernommen und blieben geschützt.

Aufgabe: Pricing-Export und Multiplikation korrigieren, Handler-Import an den tatsächlichen Export binden und den HTTP-Adapter-Import korrigieren. Die bereits in der Testeingabe vorhandene Eingabevalidierung wurde erhalten; ihre Neuentwicklung wurde nicht dem Modell zugeschrieben.

### Fehlgeschlagene und blockierte Abläufe

1. Ausgangsprojekt: echter HTTP-Integrationstest fehlgeschlagen, erwartungsgemäß wegen defekter Modulverträge.
2. Erster vollständiger Modellauftrag 294f43e2-009d-428b-a43c-7b8780536663: sieben reservierte Modellaufrufe, ein statischer Fehler, rund 240,04 Sekunden verbuchte Laufzeit. Zwei Ausführungsabschnitte erreichten die bestehende 120-Sekunden-Grenze; erhaltene Entwürfe wurden innerhalb der ursprünglichen Gesamtgrenzen weiterverwendet. Das Modell korrigierte die Rechnung, nicht den benötigten Export. Kein Paket angewendet.
3. Vergleich nach den konkreten Protokollkorrekturen, Auftrag 855c23cb-30ee-44b3-b837-caec41de11b6: sieben reservierte Modellaufrufe, zwei Fehler, rund 238,08 Sekunden verbuchte Laufzeit, schließlich Modellaufrufbudget erschöpft. Der Export blieb falsch. Keine Grenzwerte des Auftrags zurückgesetzt und keine Änderungen übernommen.
4. Der Vergleich wurde zwischenzeitlich durch das 16.000-Token-Tagesbudget des ausschließlich neuen S32-Testclients korrekt gestoppt. Für die beauftragte Qualifikation wurde dieses eigene Testbudget einmal administrativ auf 32.000 lokale Tokens gesetzt, ohne den Verbrauch zu löschen. Modellaufruf-, Fehler- und Laufzeitlimits blieben unverändert. Dieser Budgetvorgang und die vorherige Nutzung sind in session32-test-budget-adjustment.json dokumentiert; produktive Clients blieben unverändert. Reservierte Modellaufrufe schließen den wegen Quote abgewiesenen Versuch ein und sind nicht gleichbedeutend mit erfolgreichen nativen Antworten.
5. Bei der Einrichtung wurden außerdem ein ungültiger Schrittgrenzwert und ein nicht zum aktiven Modell passender Clientaufruf korrekt abgewiesen. Dies waren keine bestandenen Coding-Prüfungen.

Der erste Controller-Regressionsentwurf zeigte unnötige zusätzliche Reparaturziele nach einer bereits behobenen Schnittstelle. Nach Korrektur besteht der Test sowohl mit direkter Reparatur als auch mit vorheriger No-op-Ablehnung.

### Gesonderte gezielte Reparatur und echte Containerergebnisse

Die drei nativen Modellentwürfe wurden mit geprüften Basis- und Inhaltshashes in eine neue Reparaturkopie übernommen. Ein gesonderter Auftrag 2c23ae37-7732-41b4-8b89-1ef5d86f62dd durfte ausschließlich den fehlenden Pricing-Export ändern. Er erreichte Review nach zwei Modellaufrufen ohne Modellfehler, rund 49,59 Sekunden. Alle übrigen Entwürfe und Vertragstests blieben geschützt.

Die endgültigen Inhalte stammen ausschließlich aus den erhaltenen nativen Entwürfen und dieser nativen Exportkorrektur. Codex führte sie über die bestehende Verwaltungs-API in einem überprüfbaren Dreidatei-Paket zusammen; dies war eine administrative Orchestrierung, kein selbstständig abgeschlossener Einzelauftrag des AMU-Agenten.

| Reale Prüfung | Modellkandidat vor Exportkorrektur | Endgültiges Dreidatei-Paket |
| --- | --- | --- |
| Build | bestanden | bestanden |
| Syntax | bestanden | bestanden |
| Unit | fehlgeschlagen | bestanden |
| HTTP-Integration | fehlgeschlagen | bestanden |

Sämtliche oben genannten Projektprüfungen liefen neu im vorhandenen Rootless-Container. Die negativen Ergebnisse wurden getrennt erhalten. Der finale Snapshot ist an Paket- und Profildigests gebunden; Exitcode und tatsächliche Quellausführung wurden überprüft. Auf dem Windows-Host wurde kein generierter Projektcode ausgeführt.

Finales Paket d90c5f42-008a-40eb-8e58-09e7aeac6d57, Digest **26371874b38630d031e577c5806ec0a341d146126ebe9e374f00c23409165b23**:

- pricing.mjs: Export subtotal wird total; Addition wird Multiplikation.
- handlers.mjs: Import total als subtotal, bestehender Aufruf und Validierung erhalten.
- server.mjs: Import handle als handleQuote, bestehender HTTP-Adapter erhalten.

Nach ausdrücklicher konkreter Eigentümerfreigabe: falscher Anwendungsdigest abgewiesen, exaktes Paket übernommen, aktuelle Dateihashes mit den geprüften Inhalten verglichen und nur diese drei Pfade im separaten Testrepository committed. **Testcommit ce43e87c046de3bb3d672ae215e8303225faecf5.** Danach gezielter Paket-Restore: alle sieben Arbeitsdateien und die Referenz entsprechen wieder den ursprünglichen Hashes. Die Test-Git-Historie bleibt erhalten; der Restore ist als Rückänderung gegenüber dem Testcommit sichtbar. Das Hauptrepository ist davon getrennt.

## Weitere tatsächlich bestandene Prüfungen

- Neue statische Mehrdatei- und Controllerregressionen; letztere mit ausdrücklich simuliertem Modell und ohne Projektausführung.
- S31-Protokollregressionen und S29-Controllerregression.
- TypeScript `--noEmit` und Git-Diff-Whitespaceprüfung.
- Sammellauf S20 Policy/Export, S21 Lifecycle, S22 Acceptance/Backup, S23 Modelle, S24 Backupfehler/Neustartplan, S25 Hypervisorplan, S26 Rootless-Policy, S27 Zertifikatsintegration, S28 Workflow, S29 Stabilität, S30 Modellreserve, S31 Protokoll und S32 statische Mehrdateiprüfung. Einzelresultate: session32-regressions.json.
- S6-Verwaltung und S9-Zugriff: Schlüsselrotation, Deaktivierung, endgültiger Widerruf, unabhängige Anwendungsschlüssel, Browser-Sitzungsschutz und Mandantentrennung in isolierten Testzuständen bestanden.
- Zentrale API-Tests bestanden. S16-Kommunikationsregression mit tatsächlichem mTLS, aber simuliertem Modell/Executor bestanden, einschließlich neuem Snapshot-Endpunkt, Entwicklerablehnung, Eingabeprüfung, Fehlern, Abbruch, unbekannten Ergebnissen und Restore. Dies ist keine zusätzliche Linux-Isolationsabnahme.
- Der vorhandene reale Achtgruppen-Isolationsbericht wurde gegen unveränderten Runner-Adapter, Hash und Gültigkeit erneut abgeglichen; seine acht Gruppen wurden nicht als neue S32-Ausführung dargestellt.

## Modulstand und Endzustand

| Modul | Qualifikationsstand |
| --- | --- |
| Inferenz / Modellprofile | Bestehende lokale Modelle real verwendet; altes Qwen als Rückfall erhalten. Größere Modelle nicht installiert oder geprüft. |
| Mehrdatei-Agent | Neue Schnittstellen- und Reparaturkontrollen real an Modellfehlern wirksam; administrativ betreute Dreidatei-Kette bestanden. Vollautonome Einzelaufgabe weiterhin nicht bestanden. |
| Runner / Transport | Tatsächliches mTLS, unveränderte Rootless-Isolation, gebundene negative/positive Projektprüfungen bestanden. Kein neuer Hardware-/Netzwerkangriffstest außerhalb des bestehenden Abnahmeumfangs. |
| Freigabe / Git / Restore | Genaues Dreidatei-Paket nach Eigentümerfreigabe übernommen, Testcommit und Hash-Restore bestanden. Keine produktiven Projektänderungen. |
| API / Schlüssel | Lokale API, Authentifizierung und SSE real geprüft; Mandanten-/Schlüsselregressionen bestanden. Externe LAN-Abnahme offen. |
| Administration / Status | Bestehende Verwaltung weiterverwendet; aktuelle Paket-/Hashzählung korrigiert. Kein vollständiger interaktiver Klicktest jeder Adminansicht. |
| Backups | Quellen-/Konfigurationssicherung authentifiziert extrahiert geprüft; keine vollständige produktive Rechner-/Datenbank-/VHD-Wiederherstellung durchgeführt. |
| R630 / GPU | Migrationsverfahren ergänzt; CPU ist der tatsächlich geprüfte Inferenzpfad. GPU-Offloading ist deaktiviert und auf unbekannter Zielhardware nicht qualifiziert. |

API **1.30.0 ready**; qwen2.5:1.5b wieder aktiv für alle Rollen. Beide Modellgewichte erhalten. Reale lokale Modellantwort und SSE-Abschluss bestanden, Modellabfrage ohne Schlüssel 401 und authentifiziert 200. Der neue Testclient wurde widerrufen, die zentrale Runnerfreigabe widerrufen. Linux-Dienst inaktiv, null Container; rootful docker.service/docker.socket/containerd.service weiterhin maskiert, core_pattern core. Keine neuen Pakete, Modelle, Windows-/Firewall-/BIOS-Einstellungen, Neustarts oder Datenträgeränderungen.

AMU WEB wurde nur lesend geprüft: Quellhashes unverändert, exakt zwei Hauptkarten, drei Websites/Seiten/Versionen, zwei Postfächer und sechs Nachrichten unverändert; SQLite quick_check ok und HTTP erreichbar. Interaktive Anmeldung und Mailzustellung nicht geprüft. SYSTEM, Agent-3, Preis Assistent, Archive und separate HDD wurden nicht bearbeitet.

Genaue Ressourcenwerte und finale Sicherung: scratch/session32-end-status.json und session32-final-backup.json. Die finale verschlüsselte Sicherung enthält Quellen, Konfiguration und kleine Runner-/Prüfnachweise; ausdrücklich keine vollständigen Modellgewichte, Datenbanken oder WSL-VHD. Vorhandene Sicherungen bleiben erhalten.

## Nächste Priorität

Die betreute Reparaturkette in eine klar begrenzte, provenancegebundene AMU-Auftragsverkettung überführen, ohne Modell-/Quotenlimits stillschweigend zurückzusetzen. Fehlende Exportkorrekturen bleiben ein nachgewiesenes Problem des kleinen Modells im aktuellen Ausgabeprotokoll. Weitere vollständige Wiederholungen oder Gewichtsdownloads sind vor einer gezielten Protokoll-/Modellentscheidung nicht sinnvoll. Den identischen geschützten Vertrag als Vergleich erhalten.

Migration siehe docs/r630-migration.md: Modellverzeichnis, Rollen, CPU-/Kontextlimits und Datenkonfiguration getrennt übertragen; Zielhardware, neue Laufzeiten und GPU-Unterstützung erst nach Freigabe und realer Prüfung. Zusätzlicher RAM/SSD macht weder GPU-Offloading noch verlässliche Modellentscheidungen automatisch fertig. Keine pauschale Produktionsfreigabe.
