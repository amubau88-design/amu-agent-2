# Sitzung 36 und Fortsetzung am 1. November 2026

**Status: noch nicht vollständig qualifiziert.** Quellversion 1.34.0; bestehender Branch master. Ausgangspunkt 1.33.0 / 6da4c67. Keine neue Plattform. Die Unterbrechungen und Eigentümerfreigaben erstreckten sich über mehrere Kalendertage; keine Behauptung einer durchgehenden 40-Minuten-Sitzung.

## Implementierte Korrekturen

- Begrenzte Fortsetzung des ursprünglichen Agentenfensters vor der Zuweisung eines Reparaturkindes. Gleiche Task-ID, gemeinsame Aufruf-/Token-/Schritt-/Zeitgrenzen, persistierte Fortsetzungsanzahl. Keine Fortsetzung nach Eigentümerpause, Abbruch, fehlgeschlagenem Kandidaten oder verbrauchtem Budget.
- Mehrdatei-Reparaturen können Dateihinweise aus echten Container-Stacktraces innerhalb bereits erlaubter Scopes berücksichtigen. Nur wenn jeder fehlgeschlagene Prüfbereich einen zulässigen Hinweis liefert, wird eingegrenzt. Sonst bleibt die konservative Vereinigungsmenge erhalten. Ein explizit diagnostizierter Fehler des aktuellen Kandidaten darf nicht mit einer No-op-Antwort als korrigiert gelten. Gute vorhandene Entwürfe bleiben erhalten.
- Administrativ gesetzte Disk-Stop-Grenze wird vor Modellreservierung sowie vor jedem Profil und Quelltransfer geprüft und an Reparaturkinder vererbt. Für genau die beiden S36-Testkopien genehmigte der Eigentümer 14 GiB. Keine globale Reserve abgesenkt; keine Downloads oder Löschungen.
- Exklusive, private `flock`-Sitzungslease vor Runner-Start. Ein konkurrierender Sitzungsstarter darf den bereits laufenden eigenen Runner weder übernehmen noch stoppen.
- Runner-Widerruf bleibt über die begrenzte Sicherheitsroute auch nach ausgeschöpftem normalem Polling-Limit möglich. Authentifizierung, Rollen und eigenständige Rate-Limits bleiben bestehen; Aktivierungsrouten sind nicht ausgenommen.
- Explizites lokales Review-Werkzeug bindet ausschließlich den SHA-256 eines bereits real bestandenen, aktuellen Isolationsberichts. Prüft Runtime, Image, Adapter, UID und Socket; erstellt vorher eine private Konfigurationskopie. Keine Erzeugung von Erfolgsnachweisen und keine zentrale Ausführungsfreigabe durch dieses Werkzeug. Der Lease-Zweck verwendet den bereits wiederherstellbaren Typ `acceptance`.
- Austauschbare Inferenz-Registry im vorhandenen Worker-Pool, siehe [inference-backends.md](inference-backends.md). Installierte Adapter: eingebettetes llama.cpp und vorhandener sicherer AMU-Remote-Worker. Der Pool meldet das tatsächliche Backend statt eines fest vorgegebenen llama.cpp-Namens. Registrierung nur aus vertrauenswürdigem Anwendungscode; unbekannte Adapter und unvollständige Verträge werden abgelehnt. **Kein real qualifizierter Ollama-Adapter.** Qwen/Llama sind Modellfamilien, keine Transportprotokolle.

## Reale Linux-Prüfungen

Alle acht vorhandenen Isolationsgruppen bestanden real in Ubuntu/Rootless Docker: Containergrenzen, Prozessbaum-Timeout, Abbruch, Output-Limit, OOM, PID-Limit, tatsächliche Projektprüfungen und Fehler-/Korrekturlauf. Beleg `scratch/session36-real-acceptance.json`; Bericht vom 31.10.2026 22:21 UTC, begrenzte Gültigkeit bis 01.11.2026 22:21 UTC. Kein wiederholtes Ausführen dieser acht Gruppen, um eine grüne Anzeige zu erzwingen.

Identitäten: Docker 29.8.2, Node 24.22.1, UID 1000, privater Rootless-Socket; Adapterdigest `541ab0a52eb06456f27f3a4f8713b9dfd7bbf37e48821fd144bc93a80ac886df`. Ressourcen: WSL 2 CPUs/4 GiB RAM/1 GiB Swap; Container 1 CPU/512 MiB/32 Prozesse, 10 Sekunden, Netzwerk aus, schreibgeschützte Eingabe und Root-Dateisystem, begrenzte tmpfs. Keine Windows-Projektlaufwerke im Container.

Kontrollierter tatsächlicher Dienst-Stop/Start und authentifizierte Wiederverbindung bestanden, während der Unterbrechung HTTP 503, danach dieselbe Runner-ID; keine Job-Wiederholung. Gleichzeitiger zweiter Sitzungsstart wurde real abgelehnt, erste Sitzung blieb gesund. mTLS verweigerte fehlendes Clientzertifikat sowie nicht vertraute CA. Belege: `session36-real-lifecycle.json`, `session36-real-lease.json`, `session36-real-tls-negative.json`.

**Nicht bestanden/nicht ausgeführt:** Der vorbereitete Idle-SIGKILL-Test lehnte seine eigene PID-Prüfung vor dem Kill ab: der Dienst verwendet einen relativen Skriptpfad. Daher kein nachgewiesener Crash-Recovery-Test. Aktiver Job-Crash ebenfalls nicht abgenommen. Eine nach SIGKILL verbleibende Lifecycle-Lease darf nicht blind gelöscht werden; das vorhandene explizite Recovery-Werkzeug verlangt nachgewiesenen Prozessstillstand und Containerabgleich.

## Zwei unabhängige Modellaufgaben

Beide Fälle besitzen separate neue Referenz- und Git-Arbeitskopien. Bestehende Unit-/HTTP-Verträge blieben unverändert; neue gezielte Regressionen wurden vor der Modellgenerierung festgeschrieben. Defekte Ausgangszustände wurden real geprüft: Build/Syntax bestanden, Unit/Integration schlugen tatsächlich fehl. Keine produktiven Projekte als Testobjekte, keine Ausführung des Projektcodes auf Windows.

| Fall | Modellreservierungen | AMU-Fortsetzungen / Kind | Ergebnis |
| --- | ---: | --- | --- |
| Lagerbestand | 7 (4 Root, 3 Kind) | 2 gemeinsame Fortsetzungen, 1 Kind | Nicht bestanden: Zeitgrenzen und fehlerhafte Modellausgaben; kein fertiges Paket und keine Übernahme. Ein guter Entwurf blieb erhalten. |
| Temperatur | 5 (4 Root, 1 Kind) | 1 automatische Root-Fortsetzung, 1 Kind; zusätzlich explizite administrative Wiederaufnahme nach API-Ausfall | Drei-Datei-Paket real in allen vier Profilen bestanden; nach konkreter Eigentümerfreigabe angewendet, Test-Commit und Restore bestanden. |

Temperatur: `convert.mjs` korrigiert den Offset, `constants.mjs` den Faktor, `handlers.mjs` den Import. Paket `4e82e1e4-f9dc-4754-99db-08ea6deed8e3`, Digest `e1f0526e49a2a031d551f1e09286d69e70945c4aca1da6bf37d8ba4e5396f581`. Tatsächlicher Runner-Prüflauf `ffb4cf1c-c332-4290-b619-47c16d043234`: vier Profile passed, Unit inklusive Regression 4/4, HTTP 1/1. Exakter Review: `scratch/session36-temperature-change-review.md`.

Eigentümerfreigabe am 01.11.2026 für exakt diese drei Testdateien, Commit und Restore. Test-Commit `9b8dee333a1bad8700bd7d41318ed872e2b3cbd0`; danach sämtliche neun ursprünglichen Dateien und Referenzen per SHA-256 gleich. Falscher Paketdigest wurde zuvor mit 403 abgewiesen. Keine weiteren Modellaufrufe bei Anwendung/Abschluss. Belege `session36-temperature-owner-apply.json`, `session36-temperature-test-commit.json`, `session36-temperature-restored.json`.

AMU erledigte Datei-Lesen, Modellgenerierung, begrenzte Fortsetzung, Kindauftrag, Entwurfserhalt und Paket-Zusammenführung. Codex erstellte Testgerüste und Policy, koordinierte die Prüfungen und setzte nach Prozessunterbrechung administrativ fort; **keine manuelle Reparatur der Testquellen während der Modellläufe**. Planung aus vorliegenden Baseline-Befunden war algorithmisch (`nativeModelPlanning:false`), kein separat qualifizierter autonomer Modellplan.

Persistierte aktive Laufzeit: Lagerbestand etwa 420,6 Sekunden, Temperatur etwa 367,8 Sekunden; Wartedauer über die Unterbrechung ist keine aktive Modellzeit. Bekannte Tokenzahlen nur abgeschlossener Antworten: Lagerbestand 5376 Prompt/390 Ausgabe, Temperatur 3573 Prompt/261 Ausgabe. Abgebrochene bzw. beim Prozessausfall verlorene Antwortmetriken sind unvollständig. Reservierte Obergrenzen 30464 bzw. 21760 sind ausdrücklich **kein gemessener Tokenverbrauch**.

## Unterbrechungen und Grenzen der Nachweise

Der erste Harness verwarf den frischen Bericht zunächst an der strikten Validierung. Derselbe unveränderte Bericht wurde später gültig geprüft. Die ursprüngliche Ursache ist nicht bewiesen; kein nachgewiesener Zeit-/Identitätsbugfix. Zweiter Handoff-Fehler war die alte lokale Report-SHA-Bindung, die nach unabhängigem Review mit Konfigurationsbackup erneuert wurde.

Am 31.10.2026 22:51 UTC beobachtete der Supervisor einen Heartbeat-Timeout, beendete die API und startete sie neu. Der zweite Modelllauf wurde dadurch unterbrochen und aus seinem Checkpoint fortgesetzt. Kein Budgetreset. Ursache des Heartbeat-Ausfalls noch offen. Zwei anschließende Beobachterfehler wurden sicher behandelt: HTTP 202 wurde irrtümlich als Fehler gewertet; danach wurde ein nicht zulässiger Poll-Abstand abgelehnt. Es erfolgte kein zweiter Resume, kein unkontrollierter Test-Replay und keine Dateiübernahme dadurch.

## Management, API und Browser

31 gezielte Regression-/Management-Suiten bestanden nach den Änderungen; überwiegend Fixtures und Mock-Modelle, **keine 31 echten Linux-Qualifikationen**. Zusätzlich vier Management-Suiten für Schlüssel/Sitzungen, Runner-Protokoll, Mandantenverwaltung und Zentralserver bestanden. `tsc --noEmit`, Registry-Vertragstest und CLI-Syntaxprüfung bestanden. Belege `session36-resumed-regressions.json`, `session36-resumed-management.json`.

Reale API: zwei parallele lokale Qwen-SSE-Antworten vollständig, dritter Stream abgebrochen; Warteschlangen und aktive Anfragen danach null. Authentifizierung und abschließendes Modellstreaming siehe `session36-project-checks-final.json`. `/health` bereits vorhanden: drei echte HTTP-200-Messungen 2–64 ms, Kontext 4096. Gemessene Modellladezeit 7639 ms: **Kaltladen unter drei Sekunden nicht erreicht**. HTTP-Antwortzeit ist keine Modellladezeit.

Browser-Abnahme offen: zunächst 401/keine Sitzung, später konnte die vorhandene Browser-Steuerung den Tab mit `browser.user is unavailable` nicht binden. Lokaler Administrator-Helfer auf ausdrücklichen Wunsch geöffnet; kein Einmalcode im Chat, keine geschützte Browser-Funktion als bestanden behauptet. Automatisierte Sitzungs-/Rechtetests ersetzen die fehlende echte Browser-Abnahme nicht.

## Bestandsschutz, Systemzustand und Veröffentlichung

Nur bestehendes AMU-Agent-2 weiterentwickelt. Kein Paket-/Modell-/Image-Download, keine Daten-/Cache-Löschung, keine Windows-/Firewall-/HDD-/Partitions-/Hardwareänderung. Docker-Cache praktisch nicht reclaimbar (etwa 45 KiB), daher keine Bereinigung. Die genehmigte Linux-Änderung deaktiviert lediglich den bisherigen Runner-Benutzerdienst-Autostart; der Dienstinhalt blieb gleich. Zusätzlich ausschließlich Report-Pin mit Backup aktualisiert.

Abschließend Runner inaktiv, Autostart disabled, null Container, rootful Docker/Socket/containerd masked und core_pattern=core. Zentrale Ausführungsfreigabe widerrufen. Private Linux-Wiederanlaufdaten lokal gesichert. Ursprüngliche Modellrollen wiederhergestellt; beide vorhandenen Qwen-Gewichte erhalten. AMU WEB wird ausschließlich lesend auf vorhandene Quellhashes, zwei Dashboardkarten, drei Websites und Datenbankintegrität geprüft; keine Aussage über nicht geprüfte externe Mailzustellung. Andere Projekte und HDD bleiben unberührt.

Vorheriges verschlüsseltes Backup durch authentifizierte Extraktion geprüft; abschließendes Quell-/Konfigurations-/Evidenzbackup separat, keine Löschung alter Backups. Kein vollständiges VHD-/Datenbankbackup oder Modellgewichtsduplikat behauptet. Freier Speicher und RAM im Abschlussartefakt `scratch/session36-end-status.json`.

Eigentümerziel für GitHub: `https://github.com/alharror/amu-agent-2.git`, als origin eingetragen. Lesender Zugriff meldete „Repository not found“; Existenz/Zugangsrechte sind daher eine konkrete Push-Blockade. Kein Force-Push, keine Umbenennung/Überschreibung fremder Historie. Angeforderter Tag `v1.0-agent2` kennzeichnet diesen Entwicklungsstand und **keine Produktionsfreigabe**. Lokaler Quellcommit/Tag werden unabhängig vom Netzwerkzugriff gesichert. Testrepository-Commit bleibt lokaler Testnachweis und ist nicht Teil der Hauptrepository-Historie.

## Prioritäten der nächsten Sitzung

1. Heartbeat-Ausfall ursächlich untersuchen und Crash-/Reconnect-Abnahme mit sicherer Lease-/Container-Reconciliation abschließen.
2. Lagerbestandsfall ohne manuelle Musterlösung innerhalb begrenzter Budgets erfolgreich reparieren; beide Fälle anschließend reproduzierbar ohne administrative Wiederaufnahme qualifizieren.
3. Tatsächliche geschützte Browserabläufe nach lokaler Anmeldung und funktionierender Browseranbindung prüfen.
4. GitHub-Repository/Berechtigungen klären, geprüften Commit und angeforderten Tag pushen; keine Erfolgsmeldung ohne Remote-Nachweis.
5. Optionalen Ollama-Adapter separat implementieren und real abnehmen, sofern gewünscht/verfügbar; kein neuer Dienstzwang. Modellladezeit ehrlich weiter messen. R630-/GPU-Kompatibilität bleibt ungeprüft.
