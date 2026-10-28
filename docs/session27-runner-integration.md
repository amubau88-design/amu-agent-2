# Sitzung 27 – Runner-Integration und reale Verifikation

Quellversion **1.25.0**. Ausgangscommit **0e76ebf** bei sauberem Arbeitsbaum verifiziert. Die bestehende Windows-API wurde nach Eigentümerfreigabe R27 über ihren Supervisor einmal kontrolliert neu gestartet und läuft bereit auf **1.25.0**.

## Implementiert
- Runner prüft vor Dienststart und bei Anfragen CA, Zertifikatsgültigkeit, IP-SAN, Server-/Clientzweck und passenden privaten Schlüssel. Geänderte geladene Identitäten verlangen einen kontrollierten Neustart; keine Schlüssel in Antworten.
- Authentifizierte Ressourcenanzeige für CPUs, RAM, Prozess-RSS und aktive Aufträge, mit numerischer Grenzprüfung in der Zentrale. Keine Gleichsetzung mit unabhängig geprüfter Isolation.
- Administratorroute `POST /api/core/runner/acceptance/revoke` und Verwaltungsbutton. Vorheriger Freigabebeleg wird beim Widerruf archiviert.
- Abnahmeskript: RAM-Überschreitungsprüfung erhält 15 Sekunden statt 5 Sekunden und dokumentiert OOM-Status/Exit-Code. Der ursprüngliche fehlgeschlagene Bericht bleibt erhalten.
- Neue getrennte mTLS-Identitäten und Benutzer-Testdienst `amu-runner27.service`, ausschließlich Linux-Loopback `127.0.0.1:9443`; keine CA im Windows-Vertrauensspeicher. Ausschließlich sechs neue begrenzte Testprofile und vorhandenes unveränderliches Containerimage.

## Reale Linux-Abnahme
Erster Lauf: sieben von acht Gruppen bestanden; Speicherprobe ohne geforderten OOM-Nachweis. Gezielte Diagnose mit 15 Sekunden: Exit-Code 137, `OOMKilled=true`. Anschließend vollständige neue Abnahme mit korrigiertem Prüfzeitbudget: alle acht Gruppen bestanden.

Bericht `scratch/session27-actual-acceptance-passed.json`, SHA-256:
`8566e061f527bb56484e1e7cbb8a05dd658e07c083658178ec604a297d1fdc1d`.

Tatsächlich beobachtet: Non-root, Netzwerk nur Loopback/ausgehend gesperrt, keine Geheimnisse, Eingaben und Root-Dateisystem nur lesbar, keine erweiterten Rechte/Capabilities, Seccomp, Core-Limit null, CPU-Drosselung, 512-MiB-/32-Prozess-/1-CPU-Grenzen. Reale Timeout-, Abbruch-, Ausgabe-, Speicher- und Prozessüberschreitungen einschließlich Containerbereinigung. Reale Build-/Unit-/Integrationstests sowie absichtlicher Testfehler und korrigierter Nachtest bestanden. Dies ist keine Behauptung einer mathematisch vollständigen Ausbruchssicherheit.

Systemweite Docker-/Socket-/containerd-Dienste weiterhin masked/inactive; Rootless Docker 29.8.2 unter UID 1000, Node 24.22.1, Linux 2 CPUs/4 GiB RAM/1 GiB Swap, core_pattern=core. Keine neuen Windows-Crash-Dumps; nur die beiden bereits vorhandenen kleinen Dumps sichtbar.

## Echte zentrale Integration
- Beidseitig authentifizierter TLS-Probeabruf, Serveridentität, Ressourcen und Abnahmebericht zentral geprüft. Abnahmehash unabhängig mit lokal übernommenem Bericht verglichen.
- Ohne Clientzertifikat abgelehnt; falscher Serverpin abgelehnt; gültiges, aber nicht zugelassenes Clientzertifikat HTTP 403; tatsächlich abgelaufenes Clientzertifikat Verbindungsabbruch.
- Zentraler realer Abbruch: cancelled; realer Timeout: timed_out mit `S27_READY` aus dem gestarteten Testprozess.
- Kontrollierter Neustart des Testdienstes bei leeren Containern; gespeicherte Abbruch-/Timeoutberichte danach authentifiziert unverändert abrufbar, keine Wiederholung. Harter Absturz während eines aktiven Jobs wurde nicht real geprüft; hierfür existieren Fixture-Regressionen.
- WSL beendet eine Instanz trotz systemd-Dienst, sobald keine relevante Sitzung mehr aktiv ist. Für die Abnahme wurde eine auf 30 Minuten begrenzte Sitzung offengehalten. Keine Windows-Lebenszykluseinstellungen geändert. Dauerbetrieb ist deshalb noch nicht abgenommen.

## Modellgestützter Ablauf und Freigabe
Auftrag `85f5a811-9bfe-4404-89ae-f6a030c1da5e`, neue harmlose Arbeitskopie `58243b45-fb52-4362-8383-da0086714f72`. Produktive Projekte nicht als Testobjekte verwendet.

Lokales echtes Qwen erzeugte Plan und Änderung ausschließlich in math.mjs: Subtraktion auf Addition. Separater Kandidatensnapshot wurde über mTLS mit tatsächlichen Dateien in den Runner übertragen. Reale Profile s27-build, s27-syntax, s27-unit und s27-integration: alle passed. Entwickler durfte die Admin-Prüfung nicht starten; vor bestandener Prüfung und bei falschem Digest blieb Übernahme gesperrt.

Paket `cc04e710-1e9d-4c8f-a738-144767f7fdbd`, Digest `40ddb76450f23a41087755b3fe53e63b09775c185be350fbfe02732865668c8e`. Nach separater ausdrücklicher Eigentümerfreigabe exakt übernommen. Nachgelagerte sichere Syntaxprüfungen bestanden.

**Grenze:** Der abschließende Modellbericht überschritt das auf 120 Sekunden begrenzte Gesamtbudget. Auftrag deshalb blocked, nicht completed. Die auftragsgebundene Git-Commit-Funktion hat korrekt verweigert; kein Testprojekt-Commit und keine Umgehung. Die freigegebene gezielte Wiederherstellung wurde erfolgreich durchgeführt und bytegenau mit der unveränderten Referenz verglichen. Ein vollständig bis zum Abschlussbericht und Test-Git-Commit durchgelaufener Modellauftrag bleibt offen.

Zum Abschluss zentrale Ausführungsfreigabe ausdrücklich widerrufen und neuen Testclient widerrufen. Registrierung/Belege bleiben zur Nachvollziehbarkeit erhalten. Keine produktive Gesamtfreigabe.

## Weitere Prüfungen und Bestandsschutz
TypeScript --noEmit und git diff --check bestanden. Gezielte Sitzung-14/15/16-Runner-, Sitzung-15-Dashboard-, Sitzung-26-Rootless- und neue Sitzung-27-Regression bestanden. Diese lokalen Fixture-Tests verwenden teilweise nachgebildetes Modell/Executor; sie ersetzen nicht die oben getrennt dokumentierten echten Containerläufe.

API Auth 401/200 und echtes Qwen2.5-1.5B-SSE bis [DONE] nach Neustart bestanden. AMU WEB: fünf Referenzdatei-Hashes unverändert; exakt zwei Hauptkarten; drei Websites/Seiten/Versionen, zwei Mailkonten/sechs Nachrichten unverändert; SQLite quick_check=ok, HTTP bereit, MySQL-Port erreichbar. Kein interaktiver Login-/Mailversandtest. Keine Änderungen an WEB, AMU SYSTEM, Datenbanken, Modellen, HDD, Partitionen, Firewall oder Windows-Einstellungen; keine Pakete/Modelle heruntergeladen und kein Betriebssystemneustart.

C: vor Integration 18,82 GiB, nach realen Läufen 17,59 GiB frei (Momentaufnahmen). Freier Windows-RAM vor Aktivierung 14,39 GiB. Virtuelles Linux-Laufwerk wächst durch reale Containerarbeit; keine automatische Kompaktierung oder Löschung.

Verschlüsselter Source-/Konfigurationssnapshot vor Aktivierung `445237be-8201-4802-b366-b3d29d1ff782`, authentifizierte Extraktion bestanden. Neue Linux-Testidentitäten/Konfiguration/Berichte zusätzlich privat für verschlüsselte Sicherung exportiert. Kein neuer vollständiger Datenbank-/VM-Wiederherstellungstest; frühere Backups erhalten.

## Sitzung 28
1. Begrenzten, überwachten WSL-/Runner-Lebenszyklus im vorhandenen Supervisor konkret vorbereiten; Systemänderungen erst nach Eigentümerfreigabe.
2. Einen neuen minimalen Modellauftrag mit hardwaregerechtem Gesamtbudget und kurzem Abschlussbericht bis zum auftragsgebundenen Commit durchführen; bestehende Zeitlimits nicht rückwirkend umgehen.
3. Aktiven Jobabbruch durch Dienstunterbrechung und anschließende Reconciliation real prüfen; unbekannte Ergebnisse weiterhin gesperrt halten.
4. Speicherreserve beobachten, keine Downloads/Modelle ohne getrennte Freigabe. Produktivfreigabe erst nach diesen verbleibenden Abnahmen.
