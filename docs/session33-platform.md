# Sitzung 33 – AMU-Reparaturverkettung, Rabatt-Qualifikation und Betriebsstatus

## Ergebnis und Ausgang

Ausgang **1.30.0 / 5544fd4 / master**, Hauptarbeitsbaum tatsächlich sauber. API bereit; bestehendes Qwen aktiv. Zu Beginn etwa 16,72 GiB auf C: und 15,14 GiB RAM frei. Vor Änderungen wurde die verschlüsselte Quellen-/Konfigurationssicherung **4a227c48-c062-4567-9c79-bed7fbbfca18** authentifiziert extrahiert geprüft.

Neue Quell- und API-Version **1.31.0**. Endcommit, Branch, Sicherung und Ressourcenwerte stehen im Abschlussbericht sowie scratch/session33-end-status.json.

**Die AMU-interne, herkunftsgebundene Reparaturverkettung hat mit echten Modellentwürfen neue isolierte Pflichtprüfungen, Eigentümerfreigabe, Faktenabschluss, Testcommit und Restore bestanden. Ein vollautonomer Einzelauftrag ohne gesonderte Reparatursteuerung ist weiterhin nicht qualifiziert.** Keine 100-%- oder allgemeine Produktionsfreigabe.

## Implementierung und behobene Fehler

### Reparaturaufträge innerhalb der AMU-Steuerung

Neue `src/core/repair-merge.ts` und Controller-/API-Methoden stellen einen geprüften Zusammenführungsplan bereit:

- Elternauftrag muss gestoppt, Reparaturauftrag im Review und beide müssen geführte Aufträge desselben Eigentümers in getrennten Workspaces sein.
- Der vollständige ausdrücklich erklärte Dateikontext muss übereinstimmen. Jede Reparatureingabe muss exakt dem erhaltenen Elternentwurf bzw. dessen unveränderter Referenz entsprechen. Basis-, Inhaltshashes, Aufgaben-/Workspace-Zuordnung und Reparaturpaket-Digest werden überprüft.
- Reparaturausgabe muss zum aktuellen nativen Entwurf und Paket des Reparaturauftrags gehören. Fremde Dateien, Eigentümer, geschützte Tests, abgeschwächte append-only-Regeln und verletzte direkte Modulverträge werden abgewiesen. Die erste Implementierung unterstützt bestehende Textdateien; automatische Lösch-/Neuanlageverkettung ist nicht freigegeben.
- `POST /api/core/tasks/:id/repair-merge-plan` ist eine Administratorvorschau. `POST .../repair-merge` verlangt den exakten erneut geprüften Digest und bereitet ausschließlich ein neues, mit dem Elternauftrag verbundenes Review-Paket vor.
- Verbrauchte Modell-, Fehler-, Zeit- und Schrittbudgets bleiben erhalten. Keine Quotenänderung, keine automatische Anwendung und keine implizite Freigabe neuer Tests. Für das neue Paket sind frische gebundene isolierte Pflichtprüfungen erforderlich; alte Reparaturprüfungen können diese nicht ersetzen.
- Herkunft, vorheriger Fehler und vorheriger Modulprüfstand werden im Verlauf festgehalten. Aktuelle Statusfelder werden nach erfolgreicher Syntaxprüfung aktualisiert, statt alte Fehler als aktuellen Zustand weiterzuzeigen.

Die bestehende Administrationsoberfläche hat dafür eine Planvorschau, getrennte Bestätigung und ein Staging ohne Dateianwendung. Entwickler erhalten keinen Zugriff. Die UI wurde syntaxgeprüft und durch die bestehenden Authentifizierungstests abgesichert; ein vollständiger interaktiver Klicktest aller Ansichten wurde nicht durchgeführt.

### Gezielt reparieren und Befunde korrekt anzeigen

Der reale Versuch zeigte eine falsche Reparaturpriorität: Bei einem ungültigen Import-Alias sollte der bereits korrekte Export geändert werden. Die Auswahl berücksichtigt nun geschützte Importverträge. Werden Exportnamen von geschützten Tests verlangt, wird der Export repariert; andernfalls wird zuerst der fehlerhafte Importeur ausgewählt. Nicht reparierbare geschützte Bereiche bleiben gesperrt. Diese Auswahl wurde mit den gegensätzlichen S32-/S33-Konstellationen regressionsgeprüft; es wurde kein weiterer vollständiger Modellversuch zum Erzwingen eines grünen Status gestartet.

Modellfeedback zu Testlogs enthält jetzt ursprüngliche Längen und Kürzungskennzeichen. Der begrenzte Modellkontext wird nicht als vollständiges Fehlerprotokoll ausgegeben; die tatsächlichen begrenzten Runner-Logs bleiben in den Prüfberichten erhalten.

Eine hinterlegte Abnahme und eine alte Ressourcenmeldung bedeuteten bisher im Readiness-Status bereits ready/connected. Das wurde getrennt: Autorisierung, historische Probe und aktuelle Verfügbarkeit sind verschiedene Angaben. Ein synchroner Statusabruf ohne Live-Prüfung verspricht keine laufende Gegenstelle. Nach Abschluss: previous_probe_only, serviceReady false, Ausführungsfreigabe widerrufen. Vor jeder tatsächlichen Ausführung bleibt die authentifizierte Live-Prüfung verbindlich.

## Reale anspruchsvollere Aufgabe

Neue kontrollierte Testkopie mit neun Dateien, davon acht ausdrücklich im Auftrag: pricing.mjs, discount.mjs, handlers.mjs sowie geschützte server.mjs, unit.mjs, integration.mjs, extension.mjs und package.json. README.md blieb außerhalb der Modellerlaubnis unverändert.

Die bisherigen HTTP-Vertragstests wurden bytegleich erhalten. Die ursprünglichen zwei Unit-Assertions blieben als unveränderter Präfix bestehen; ein zusätzlicher Import bindet eine separate geschützte Regressionsdatei ein. Drei notwendige neue Fälle prüfen zehn Prozent Rabatt, vollständigen Rabatt und einen gebrochenen Einzelpreis. Tests wurden weder vom Modell geändert noch nachträglich abgeschwächt.

Zu korrigieren waren Multiplikation, Rabattfaktor und ein abhängiger Import-Alias. Die Eingabevalidierung für optionale Rabatte war Teil der vorbereiteten Testeingabe und wird nicht als vollständig vom Modell neu entwickelt dargestellt.

### Modellgrenzen und Reparatur

- Elternauftrag **cfcd7190-60e9-4e27-be13-bd3bcce0b602**: zunächst sechs reservierte Modellaufrufe, ein erkannter Schnittstellenfehler, 14 Schritte und rund 240,05 Sekunden verbuchte Laufzeit. Zwei 120-Sekunden-Abschnitte endeten mit Timeout. Rechnung und Rabattfaktor waren korrigiert, der Import-Alias nicht. Kein Paket wurde automatisch angewendet.
- Gesonderter eng begrenzter Import-Reparaturauftrag **a5d13b26-d2f6-43e7-87ba-46e04fd3b6b2**: zwei Modellaufrufe, null Modellfehler, zehn Schritte und rund 93,04 Sekunden bis zum Review. Die anderen Entwürfe und Tests waren geschützt.
- Die neue AMU-Steuerung prüfte die tatsächlichen Eingaben, führte die drei Korrekturen in den ursprünglichen Auftrag zurück und erzeugte das Paket selbst. Anders als in S32 wurde das Gesamtpaket nicht außerhalb des Controllers manuell zusammengestellt.
- Der ursprüngliche Auftrag erreichte nach den genehmigten Nachprüfungen und dem Faktenabschluss completed mit weiterhin **sechs Modellaufrufen**, einem Fehler, 22 Schritten und rund 242,40 Sekunden verbuchter Agentlaufzeit. Der zusätzliche Reparaturauftrag behält sein eigenes unverändertes Budget. Eine automatische Kindauftragserstellung und ein übergreifender Kettenbudget-Scheduler stehen noch aus.

Der neue ausschließlich temporäre S33-Testclient erhielt vorab 40.000 lokale Tokens, eingeschränkte Modellrechte und Parallelität eins. Es wurden keine bestehenden Clientlimits erhöht oder Verbrauchszähler zurückgesetzt. Der Testclient wurde anschließend widerrufen.

### Tatsächlich neu ausgeführte Containerprüfungen

| Prüfung | Fehlerhafter Ausgang | Repariertes Paket |
| --- | --- | --- |
| Unit einschließlich Erweiterung | fünf Tests fehlgeschlagen | fünf bestanden, null fehlgeschlagen |
| HTTP-Vertrag | fehlgeschlagen | ein Vertragstest bestanden |
| Build | nicht als eigener Ausgangstest wiederholt | bestanden, Syntaxprüfung der vier Programmmodule |
| Syntaxprofil | nicht als eigener Ausgangstest wiederholt | bestanden |

Alle ausführenden Projektprüfungen liefen im bestehenden Rootless-Container mit den exakt freigegebenen Profilen, unverändertem Image, Netzwerkabschaltung und bestehenden CPU-/RAM-/PID-/Zeitgrenzen. Syntaxprüfungen mit Node --check auf dem Host führen keinen Projektcode aus. In dieser Sitzung wurde kein generierter Projektcode auf Windows ausgeführt.

Finales Paket **b8eb80d9ec8a7cb031600b96b8697afe10225ec3d29829e39afd3a89113b476f** änderte nur pricing.mjs, discount.mjs und handlers.mjs. Ein Entwickler durfte den Zusammenführungsplan nicht anfordern; ein falscher Plan-Digest und eine Anwendung vor frischen Pflichtprüfungen wurden an der echten API abgewiesen.

Nach konkreter Eigentümerfreigabe wurde exakt dieses Paket übernommen. Acht sichere Nachprüfungen wurden durchgeführt; beim Durchlauf-Schrittlimit wurde ausdrücklich innerhalb der bestehenden Gesamtgrenze fortgesetzt. Kein zusätzlicher Modellaufruf war nötig. Anschließend Testcommit **269b5c34ea519517804bc495c695147f142cc7c0** im separaten Testrepository und gezielter Restore. Alle neun Dateien und die Referenz entsprechen wieder den ursprünglichen Hashes. Die Testhistorie bleibt erhalten; der Auftrag steht nach Restore bewusst pausiert und darf nicht automatisch erneut anwenden.

## Tatsächliche Runner-Unterbrechungen und Sicherheit

In einer separaten Testkopie ohne Anwendungsrechte lief ein harmloser Node-Prozessbaum mit sichtbarer Startmarkierung:

- Zehn-Sekunden-Zeitlimit führte real zu timed_out, Prozessbaum/Container wurden beendet.
- Expliziter Abbruch eines gestarteten Prozessbaums führte real zu cancelled.
- Der eigene mTLS-Runnerdienst wurde während eines laufenden Auftrags geordnet gestoppt. Das Ergebnis blieb cancelled; nach Neustart war eine authentifizierte Wiederanbindung möglich. Es wurde kein neuer Ausführungsauftrag automatisch wiederholt. Dies war ein echter Dienststopp, keine bloße Simulatorantwort.
- Nach den Tests waren null Container vorhanden. Der begrenzte Dienst wurde beendet. Rootful Docker, Docker-Socket und containerd bleiben maskiert; core_pattern bleibt core.

Der bestehende Achtgruppenbericht wurde erneut mit Adapter-/Hash-/Altersbindung überprüft; die vollständigen acht Gruppen wurden nicht als neue S33-Ausführung ausgegeben. Frische Zertifikats-/mTLS-Negativfälle mit simuliertem Executor, unbekannten Ergebnissen und Wiederanlauf bleiben in S16 gesondert gekennzeichnet.

An der tatsächlichen API wurden private Pfade, Pfadtraversierung und ein Zugriff außerhalb des gewählten Workspace jeweils mit 403 abgewiesen. Dafür wurde nur eine neu erzeugte harmlose Sentinel-Datei verwendet, kein echtes Geheimnis gelesen. Fremde Eigentümer, geänderte Kontexte, Testmanipulation und erneutes Staging desselben Plans wurden zusätzlich in den neuen isolierten Controller-/Provenienztests abgewiesen.

## Weitere Prüfungen und Migration

Bestanden: TypeScript --noEmit; Admin-JavaScript-Syntax; neue S33-Provenienz-, Controller- und Migrationsprüfungen; bestehende S32-Mehrdatei-/Controller- und S31-Protokollregressionen. Der Sammellauf mit 19 Testdateien von S20 bis S33 steht in session33-regressions.json. Zusätzlich S16-Kommunikation einschließlich neuer API-Autorisierung, S6-Verwaltung, S9-Zugriff und zentrale API-Tests bestanden. Diese Verwaltungs-/Simulatorprüfungen sind keine realen Linux-Projektprüfungen.

Neues lesendes `scripts/migration-readiness.mjs` prüft konfigurierte Pfade, CPU/RAM, Node-ABI und vorhandene Modellgrößen/Header/Hashes. Beide bestehenden Gewichte wurden tatsächlich hashgeprüft. Offener Inventarpunkt: normale 20-GiB-Freiplatzreserve nicht nachgewiesen. Der Befehl gibt keine Produktionsbereitschaft vor und startet keine Dienste oder Modelle.

Linux-Service- und Environment-Vorlagen sowie das bestehende Backup-/Restore-Verfahren sind in docs/r630-migration.md dokumentiert. Es wurde nichts auf dem R630 installiert oder migriert. Zielbetriebssystem, native Bibliotheken, Pfadzuordnung, Dienstberechtigungen, Hardwarelast und optionales GPU-Offloading müssen dort erst geprüft werden. Der derzeit qualifizierte Inferenzpfad bleibt CPU; GPU-Unterstützung ist nicht freigegeben.

## Modulstand, Restarbeiten und Endzustand

| Bereich | Stand |
| --- | --- |
| API, Authentifizierung, SSE | Implementiert und lokal real geprüft; Mandanten-/Schlüsselregressionen bestanden. Externe LAN-Abnahme offen. |
| Reparaturverkettung | Herkunftsgebundenes Staging, neue Pflichtprüfungen, Owner-Gate, Commit und Restore real bestanden. Start des eng begrenzten Reparaturauftrags wurde noch durch Codex gesteuert. |
| Mehrdatei-/Feature-Coding | Betreute Rabatt-Aufgabe mit drei Modulen und geschützten Alt-/Regressionstests bestanden. Vollautonome Einzelaufgabe nicht bestanden. |
| Runner | Frische echte Projekt-, Timeout-, Abbruch- und Dienstunterbrechungsprüfungen bestanden. Bestehende unabhängige Isolationsabnahme weiterverwendet. |
| Admin / Status / Diagnose | Reparaturplan und gesondertes Staging, Protokollkürzung und ehrliche Verfügbarkeitsanzeige implementiert. Vollständiger interaktiver UI-Test offen. |
| Modelle / Ressourcen | Beide lokalen Modelle erhalten, Ressourcen-/Rollenverwaltung weiterverwendet. Kleine Modellqualität und CPU-Laufzeit bleiben Grenzen. |
| Sicherung / Wiederherstellung | Quellen-/Konfigurationsarchive authentifiziert extrahiert geprüft; echte gezielte Testdatei-Wiederherstellung bestanden. Keine vollständige Wiederherstellung aller produktiven Datenbanken/Rechner. |
| R630 / Linux-Gateway / GPU | Lesendes Inventar und nicht installierte Dienstvorlagen vorbereitet. Reale Zielsystem-/GPU-Abnahme offen. |

Endzustand: API **1.31.0 ready**, bisheriges qwen2.5:1.5b wieder für alle Rollen aktiv, beide Gewichte erhalten. Authentifizierte Modellabfrage 200, ohne Schlüssel 401, echte lokale Antwort mit abgeschlossenem SSE-Stream. Testzugang und zentrale Runnerfreigabe widerrufen; Dienst inaktiv, null Container, Readiness behauptet keine Live-Bereitschaft.

AMU WEB nur lesend geprüft: Baseline-Quellhashes, zwei Hauptkarten, drei Websites/Seiten/Versionen, zwei Postfächer und sechs Nachrichten unverändert; SQLite quick_check ok, HTTP erreichbar. Interaktive Mailzustellung und Anmeldung nicht geprüft. Keine Änderungen an Agent-3, SYSTEM, Preis Assistent, anderen Projekten, Windows-/Firewall-/BIOS-Einstellungen oder Datenträgern. Keine Pakete, Modelle oder Hardware installiert; keine Betriebssystem-Neustarts.

Genaue Abschlussressourcen, Commit und finale verschlüsselte Sicherung: scratch/session33-end-status.json und session33-final-backup.json. Sicherungsumfang: Quellen, ausgewählte Konfiguration und kleine Wiederanlauf-/Prüfnachweise, nicht komplette Modellgewichte, produktive Datenbanken oder WSL-VHD. Frühere Sicherungen bleiben erhalten.

Priorität S34: Begrenzte Kindauftragserstellung mit explizitem Kettenbudget und Herkunfts-/Reparaturzielbindung; keine stillen Budgetresets. Erst danach einen weiteren unveränderten vollautonomen Vergleich wagen. Zusätzlich aktuelle Zustands-/UI-Übergänge interaktiv prüfen und Linux-Zielinstallation nur nach separater Freigabe auf real vorhandener Hardware abnehmen. Größere Modelle, GPU-Last und höhere Parallelität brauchen nachgewiesene Hardware-/Speicherreserven; Kindauftragsscheduler, Fehlerauswertung und weitere UI-Tests sind bereits vorher softwareseitig möglich.
