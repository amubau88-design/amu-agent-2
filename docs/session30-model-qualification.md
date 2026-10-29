# Sitzung 30 – Einzelqualifikation des lokalen Coding-Modells

## Ergebnis

Quellversion und laufende API: **1.28.0**, Branch **master**. Ausgangscommit: 0ecfd49. Die vollständige autonome Coding-Abnahme ist **nicht bestanden**. Das neue Modell bleibt installiert, ist aber für diesen AMU-Workflow nicht qualifiziert. Chat, Coding-Rolle und Rückfall sind wieder auf dem bisherigen qwen2.5:1.5b eingestellt. Es gab keine Übernahme von Teständerungen und keinen Test-Ergebniscommit; eine Wiederherstellung nach Übernahme war deshalb nicht ausführbar.

## Modell, Herkunft und Ressourcen

Mit ausdrücklicher Freigabe M30 wurde genau ein offizielles Artefakt heruntergeladen: Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF, Revision f86cb2c1fa58255f8052cc32aeede1b7482d4361, qwen2.5-coder-1.5b-instruct-q4_0.gguf, 1.066.227.264 Byte, SHA-256 aa8353e0d0fca3a0041828701e90db7635197400f040676d11d7798665fa316e. Größe und Hash wurden geprüft. GGUF enthält Qwen-Architektur, 28 Schichten und ein Chat-Template; eingebettete CPU-Inferenz wurde tatsächlich geladen und verwendet. Lizenz: Apache-2.0. Das bisherige Modell wurde erhalten.

Die normale Beschaffungsreserve von 20 GiB ist unverändert. Nur diese Einzelqualifikation erlaubte ausdrücklich mindestens 16 GiB Restplatz. Der Downloader begrenzt Herkunft, Bytes und Laufzeit, prüft während des Transfers den prognostizierten Restplatz, verhindert Überschreiben und bereinigt ausschließlich eigene identifizierte Teildateien. Die Freigabe gilt nicht für weitere Modelle.

Hardware: Xeon E3-1230 V2, acht logische CPUs, rund 23,91 GiB physischer RAM; native Inferenz mit vier Threads, 4096 Kontext und ohne GPU. Anfänglich rund 17,10 GiB frei auf C:, nach Installation und Prüfungen rund 16,03–16,10 GiB. Genaue Abschlusswerte stehen in scratch/session30-end-status.json. Geschätzter Modell-RAM für 4096 Kontext: rund 1,80 GiB; dies ist keine Gesamtsystemmessung. WSL behält zwei CPUs, 4 GiB RAM und 1 GiB Swap.

| Kandidat | Gewicht | Bewertung |
| --- | ---: | --- |
| Coder 1.5B Q4_0 | 0,993 GiB | Einmalig installiert und real geprüft; vollständiger Auftrag fehlgeschlagen |
| Coder 1.5B Q4_K_M | 1.041 GiB | Nicht heruntergeladen; knappe Restplatzreserve |
| Coder 3B Q4_K_M | 1,960 GiB | Nicht heruntergeladen; Restplatz reicht nicht für die Mindestreserve; separate qwen-research-Lizenzprüfung nötig |
| Coder 7B vorbereitetes Profil | rund 4,36 GiB | Nicht heruntergeladen; Speicherreserve fehlt, CPU-Laufzeit nicht qualifiziert |
| Modelle der Größenklasse 30/32B | deutlich größer | Auf diesem Speicher-/RAM-Budget nicht freigegeben; kein Download |

Primärquellen: [1.5B GGUF](https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF), [1.5B Modell](https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct), [3B GGUF](https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct-GGUF), [3B Lizenz/Modell](https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct), [7B GGUF](https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF). Artefaktmetadaten sind lokal in scratch/session30-model-sources.json und session30-coder15-artifacts.json gesichert.

## Implementierung

- Exaktes kleines Coder-Profil, begrenzte Einzelqualifikation und Verwaltungsanzeige; kein automatischer Download oder Rollenwechsel.
- Profilbezogene Reparaturbereiche schneiden sich mit tatsächlich geänderten Kandidatendateien. Bestehende Freigaben und unveränderliche Tests bleiben wirksam.
- Kurze strukturierte Pläne mit zwei bis drei begrenzten Schritten reduzieren abgeschnittene Antworten.
- Wiederholungsschleifen brechen die Modellantwort kontrolliert ab; die real beobachtete Schleife wurde im zweiten Versuch erkannt.
- Entwürfe erhalten eine frühe nicht ausführende Syntaxprüfung. Diese letzte Verbesserung wurde nach den nativen Versuchen implementiert, gezielt getestet und in die laufende API geladen; sie ist kein nachträglicher Beleg für eine bestandene Modellaufgabe.

## Tatsächliche Prüfungen

Der fehlerhafte S29-Kandidat wurde in einer neuen Testkopie reproduziert: Der reale HTTP-Integrationstest im isolierten Container scheiterte erwartungsgemäß. Referenz und Tests wurden nicht verändert.

Erster vollständiger Coder-Versuch: sechs Modellaufrufe, drei Fehler, rund 223,8 Sekunden. Unvollständige JSON-Pläne und eine repetitive Handler-Ausgabe verhinderten ein vollständiges Paket. Nach den gezielten Protokollverbesserungen folgte ein neuer begrenzter Vergleich auf denselben unveränderten Ausgangsdateien: acht Aufrufe, drei Fehler, rund 295,7 Sekunden. Der kurze Plan gelang beim ersten Versuch; Wiederholungsschleifen, ungültige Handler-Syntax und nicht passende Unit-Test-Anker verhinderten weiterhin den Abschluss. Innerhalb der ursprünglichen Budgets wurde fortgesetzt; es wurden keine Limits zurückgesetzt oder Tests abgeschwächt.

Eine separate Diagnose der beiden tatsächlich erzeugten Entwürfe im Container ergab:

| Prüfung | Tatsächliches Ergebnis |
| --- | --- |
| Build | Fehlgeschlagen: Handler-Syntax |
| Syntax | Fehlgeschlagen |
| Vorhandene Unit-Tests | Bestanden; keine neue Modell-Testabdeckung erzeugt |
| HTTP-Integration der Diagnose | Nicht ausgeführt: Snapshot-Versuchsbudget, HTTP 409 |
| Gesamter Mehrdatei-Auftrag | Blockiert, nicht bestanden |
| Übernahme, Testcommit und Restore | Nicht ausgeführt, da kein bestandenes Paket vorlag |

Autoritative Nachweise: scratch/session30-final-terminal.json, session30-partial-diagnostic-durable.json, session30-baseline-reproduction.json und session30-closeout.json. Zwischenstände mit noch laufendem Auftrag sind keine Abschlussnachweise.

Bestandene Softwareprüfungen: TypeScript --noEmit, Sitzung-30-Modell-/Reserve-/Reparatur-/Wiederholungs-/Syntaxprüfungen, Sitzung-29-Controllerregression und Sitzung-16-Kommunikationsprüfung. Letztere ersetzt keine neue Linux-Isolationsabnahme. Die bestehende reale S29-Isolationsabnahme wurde mit unverändertem Adapter und gültiger Gültigkeitsdauer erneut überprüft; ihre acht Prüfgruppen wurden nicht als neue S30-Prüfungen ausgegeben. Die neuen Projektprüfungen liefen ausschließlich in vorhandenen Rootless-Containern.

Abschlussprüfung: API ready 1.28.0; unauthentifizierte Modellabfrage 401, authentifizierte 200; echte lokale Antwort mit abgeschlossenem SSE-Stream. AMU WEB: Quellhashes unverändert, genau zwei Hauptkarten, drei Websites/Seiten/Versionen, zwei Postfächer und sechs Nachrichten wie im Bestand; SQLite quick_check ok, Startseite und Administration erreichbar. Interaktive Anmeldung und Mailzustellung wurden nicht geprüft.

## Sicherer Endzustand und Sicherung

Zentrale Runner-Ausführungsfreigabe und S30-Testclient wurden widerrufen. Linux-Runnerdienst ist inaktiv, keine Container verblieben. Rootful Docker/Socket/containerd bleiben maskiert; core_pattern bleibt core. Die begrenzte Linux-Sitzung war beim abschließenden Stop bereits nicht mehr vorhanden. Keine neuen Pakete, Containerimages, Windows-Einstellungen, Neustarts oder HDD-/Partitionsänderungen. Andere AMU-Projekte wurden nicht bearbeitet.

Vorherige geprüfte Sicherung: 6f83046c-8a2e-48ba-935c-7540df821d20. Abschließend wird eine verschlüsselte Sicherung von Quellen, Konfiguration, privaten Runner-Wiederanlaufdaten und kleinen Nachweisen authentifiziert extrahiert geprüft. Sie ist ausdrücklich **keine vollständige Datenbank-, Modellgewichts- oder WSL-VHD-Sicherung**. Vorhandene Modelle und frühere Sicherungen bleiben erhalten. Endcommit und Sicherungskennung stehen in scratch/session30-final-backup.json; Git-Status im Abschlussbericht.

## Sitzung 31

Zuerst eine kleine reproduzierbare Protokollqualifikation mit unveränderlichen Aufgaben etablieren: JSON-Abschluss, exakte Anker, syntaktisch gültiger Handler und gezielte Testergänzung jeweils separat messen. Modellfähigkeit und AMU-Ausgabeprotokoll sind durch diesen Versuch noch nicht kausal getrennt. Danach erst einen weiteren vollständigen unveränderten Auftrag versuchen. Vor zusätzlichen Gewichten müssen freigegebener SSD-Speicher, Reserve, Lizenz und Ressourcen nachgewiesen werden. Keine Kaufempfehlung und kein weiterer Download sind mit diesem Ergebnis verbunden.
