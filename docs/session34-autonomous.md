# Sitzung 34 — begrenzte autonome Reparaturkette

Datum: 29.10.2026. Ausgang: master, 1.31.0, Commit 28282a8; Arbeitsbaum vor Beginn sauber. Ergebnisquelle: 1.32.0. Der zugehörige Abschluss-Commit steht in Git und im lokalen `scratch/session34-end-status.json`.

## Implementierte Änderungen

Eine dauerhafte Reparaturketten-Buchführung verbindet den ursprünglichen Coding-Auftrag mit höchstens einem automatisch erzeugten Kindauftrag. Modellaufrufe, konservative Tokenreservierungen, Schritte, Fehler und aktive Laufzeit teilen sich feste Grenzen. Unterbrechungen erstatten keine Modellreservierung. Die Tokenwerte sind obere Reservierungsgrenzen, keine gemessenen Verbrauchstoken. Aktive Laufzeit summiert die Auftragsausführung; Wartezeit auf Eigentümerfreigabe zählt nicht dazu.

Die Engine übernimmt validierte Entwürfe und geschützten Kontext in eine eigene Reparaturkopie. Ziele entstehen aus fehlenden Entwürfen, statischen Modulverträgen und fehlgeschlagenen Prüfprofilen. Der Kindplan wird aus diesen Fakten abgeleitet. Das Modell liefert die Änderungen. Exakte Reparaturanker und eine zusätzliche Prüfung verhindern, dass weiterhin verwendete benannte Import-Aliase verloren gehen. Diese Prüfung ist bewusst konservativ und ersetzt keinen vollständigen Sprachcompiler. Bereits korrekte Entwürfe bleiben erhalten; unveränderte Dateien werden nicht als Änderungen eingereicht.

Eine vollständige, bereits validierte Entwurfssammlung kann an der Schrittgrenze ohne weiteren Modellaufruf zum Review-Paket werden. Das umgeht weder Lese-, Hash-, Modul- noch Eigentümerprüfungen. Ein Kind darf keine Dateianwendung ausführen. Die automatische Zusammenführung verlangt dieselbe Kettenzugehörigkeit und frische isolierte Paketprüfungen. Fremde Kinder können das gemeinsame Budget nicht umgehen.

Nach Prozessverlust wird eine verwaiste Koordination als unterbrochen angezeigt und nicht blind wiederholt. Eigentümerabbruch beendet die aktive Kette. Die Verwaltung bietet die explizite Administratoroption mit Grenzen und eine Kettenstatusansicht. Die neue Option zum Sammeln gewöhnlicher Testfehler bleibt standardmäßig aus: Sie sammelt mehrere echte Fehler, stoppt aber weiterhin bei Abbruch, Timeout, OOM oder unbekanntem Ergebnis. Rückmeldungen enthalten begrenzte Auszüge und gebundene Lauf-/Paket-/Snapshot-Kennungen.

## Tatsächliche native Coding-Versuche

Neues ungefährliches Steuer-/Preis-Testprojekt, neun Dateien, drei bearbeitbare Module. Bestehende HTTP-Vertragstests blieben bytegleich; ursprüngliche Unit-Assertions blieben erhalten. Drei neue Regressionen prüfen Steueraufschlag, Grenzwert und Bruchteile. Kein generierter Projektcode lief auf Windows.

1. Auftrag `bc708df0-6a8f-48d9-8f7c-412f9adc1106`, Kind `2fd875e8-5154-4a1a-8b16-bb1e3f6088df`: gescheitert. Acht Modellreservierungen, 34.816 reservierte Token, 24 Schritte, zwei Fehler, etwa 307,4 Sekunden gemeinsame aktive Laufzeit. Fehler waren verlorene lokale Importbindung und mehrdeutiger Reparaturanker. Kein Quellpaket angewendet. Das Ledger bleibt erhalten.
2. Kontrollierter Vergleich nach gezielter Fehlerbehebung mit identischen Quelldateien, Tests und Grenzen: Auftrag `2b1bfca3-5285-4dbf-8acf-d4bbb892eeee`, Kind `8881690d-bc72-4098-920a-75e67cbf6aea`. Erfolgreiches Review-Paket nach drei Modellanfragen im Elternauftrag und zwei im automatisch gestarteten Kind. Eine Elternanfrage endete an der Laufzeitgrenze. Insgesamt fünf Reservierungen, 21.760 reservierte Token, 21 Schritte und etwa 231,1 Sekunden aktive Coding-Laufzeit. Keine manuellen Fortsetzungen, Kind-Erstellungen, Zusammenführungen oder Codekorrekturen zwischen Start und Review. Der Kindplan stammt aus AMU-Fakten, nicht aus einem zusätzlichen Modellaufruf.

Die initiale Testaufgabe, Profile, Grenzen und spätere Runner-Ausführung wurden administrativ eingerichtet. Die Tests wurden nicht vom Modell selbst autonom gestartet. Es gab zwei Versuche, keinen versteckten dritten Versuch und keine Rücksetzung des ersten Budgets. Das erfolgreiche Paket ist eine nachgewiesene autonome Kandidaten- und Reparaturerzeugung, keine allgemeine Qualifikation beliebiger Projekte.

## Reale isolierte Tests und Eigentümerfreigabe

Das bestehende Linux-Runnerimage wurde unverändert genutzt, mit Rootless Docker, Ressourcenlimits, getrenntem temporärem Projekt und deaktiviertem Containernetzwerk. Der mTLS-Dienst wurde begrenzt auf Linux-Loopback gestartet. Die vorhandene Acht-Gruppen-Abnahme wurde auf Gültigkeit und Bindungen geprüft, nicht als acht neue Tests ausgegeben.

Der reale Ausgangstest sammelte in einem genehmigten Lauf beide Fehler: Build und Syntax erfolgreich, Unit und HTTP-Integration fehlgeschlagen. Das neue Paket bestand danach alle vier Prüfungen real im isolierten Container. Geschützte Testdateien blieben unverändert. Belege: `scratch/session34-real-baseline.json`, `session34-real-verification.json`, `session34-real-run.log`.

Paketdigest: `468f414adc707c2ea5342d962ae756676398ad4e8aef7852c3832d5c0af59ff0`. Änderungen: Multiplikation in pricing.mjs, Steuerfaktor in rates.mjs, Import-Alias in handlers.mjs. Erst nach der konkreten menschlichen Zustimmung wurden diese drei Dateien angewendet. Ein falscher Digest wurde vorher abgelehnt. Die anschließende faktenbasierte Aufgabenverifikation benötigte keine weiteren Modellanfragen. Test-Commit: `41db711c0c8188b181de76ab77f849a58def6d07`. Danach erfolgte der freigegebene Restore: alle neun Dateien in Arbeitskopie und Referenz entsprechen wieder ihren Ausgangshashes. Das Testrepository enthält die nachvollziehbare Rückänderung gegenüber seinem Test-Commit; es wurde nicht destruktiv zurückgesetzt.

## Regressionen und Betriebszustand

TypeScript-Prüfung und Syntaxprüfung des Verwaltungsskripts bestanden. 21 gezielte Fixture-/Verwaltungssuiten aus Sitzung 20–34 bestanden. Die neuen Kettentests benutzen ein Modell-Mock und führen keinen erzeugten Projektcode aus: Sie prüfen gemeinsame Grenzen, automatisches Kind/Merge, Kontextschutz, Abbruch und Nichtwiederholung nach Neustart. Weitere Zugriffs-, Management-, Zentralserver- und Runnerprotokolltests sind separat protokolliert. Echte TLS-Prüfungen sind von simulierten Executor-Antworten zu unterscheiden. Neue physische Dienstabsturz-, Ausbruchs- und vollständige achtteilige Isolationsprüfungen wurden hier nicht wiederholt.

Windows-API kontrolliert auf 1.32.0 geladen, authentifizierte Modellliste 200, ohne Schlüssel 401, lokales Qwen-Streaming bis DONE erfolgreich. Altes Qwen ist wieder Chat-/Coding-/Fallback-Standard; beide vorhandenen Gewichte bleiben erhalten. Zentraler Runner-Ausführungszugang und neuer Testclient wurden widerrufen. Abschlussprüfung: Runnerdienst inactive, keine Container, Rootful-Docker-/Socket-/containerd-Dienste masked, core_pattern weiterhin core. Kein Paket-/Modelldownload, keine Betriebssystem-, Firewall-, HDD- oder Fremdprojektänderung.

AMU WEB wurde ausschließlich gelesen: Quellhashes unverändert, genau zwei Hauptkarten, drei Websites, je drei Seiten/Versionen, zwei Mailboxen, sechs Nachrichten, SQLite quick_check ok; Startseite und Verwaltung erreichbar. Interaktive Anmeldung und Mailzustellung wurden nicht getestet. Die Verwaltungsoberfläche wurde syntaktisch und über Berechtigungswege geprüft, nicht vollständig interaktiv durchgeklickt.

Vorherige verschlüsselte Quell-/Konfigurationssicherung mit authentifizierter Extraktion: `70d9641c-28b6-46b2-8a1c-785b6d64694b`. Abschlussarchiv und Ressourcenwerte stehen in `scratch/session34-final-backup.json` und `session34-end-status.json`. Archive enthalten keine Modellgewichte und sind keine vollständige Windows-/Datenbank-/WSL-VHD-Sicherung. Private Linux-Wiederherstellungsdaten werden nur geschützt archiviert. Bei Migration müssen Kettenledger, Mitgliedsaufträge, Arbeitskopien, Register und Prüfbelege gemeinsam erhalten bleiben; Budgets dürfen nicht durch fehlende Ledger neu beginnen. R630-Hardwareannahmen wurden nicht verändert oder als geprüft ausgegeben.

## Offene Abnahme / Sitzung 35

Priorität ist eine zweite unabhängige reale Mehrdatei-Aufgabe mit denselben unveränderten Vertrags- und Eigentümergrenzen. Die erfolgreiche Einzelqualifikation muss reproduzierbar werden. Danach: interaktive Verwaltungsprüfung, ausdrückliche Wiederaufnahme einer nach echtem Prozessverlust unterbrochenen Kette und breitere Sprach-/Modulkontrakte. Gemeinsame Fehlerauswertung ist implementiert; ihre Kombination mit einer vollständig automatisch gestarteten realen Test-/Reparaturschleife ist noch nicht umfassend qualifiziert. Anwendung und Git-Commit bleiben menschlich freigegeben. Keine produktive Vollautonomie oder 100-Prozent-Fertigstellung abgenommen.
