# Migration der AMU AI Engine auf einen späteren Dell PowerEdge R630

Diese Anleitung verändert weder den derzeitigen Rechner noch den R630. RAM, SSDs, CPU-Ausstattung, Betriebssystem und GPU des Zielsystems sind nicht geprüft. Es gibt keine Modell-, Hardware- oder Produktionsfreigabe. Die Modelladapter, API, Coding-Steuerung und Runner bleiben getrennte Komponenten.

## Vorbereitungs- und Übertragungsplan

1. Zielbetriebssystem und vorhandene Hardware inventarisieren: physischer/verfügbarer RAM, CPU-Kerne, freier SSD-Speicher und Dateisystem. Mindestreserve und gleichzeitigen Verbrauch von API, Modell, Kontext/KV-Cache, Runner und Windows/Linux berücksichtigen. Der Modell-Ressourcenprüfer bleibt eine konservative Schätzung; ein realer Lasttest ist zusätzlich nötig. GPU nicht voraussetzen.
2. Wartungsfenster ausdrücklich vereinbaren. Neue Aufträge sperren, laufende Aufträge geordnet beenden und unbekannte Runner-Ergebnisse vor dem Wechsel abgleichen. Keine unbestätigten Aufträge wiederholen. Bestehenden Rechner als Rückfall unverändert erhalten.
3. Verschlüsselte Sicherung mit vorhandenem AMU-Backupverfahren erstellen und authentifiziert in einem separaten Verzeichnis extrahieren. Sicherungsumfang und Ausschlüsse dokumentieren. Zusätzlich Datenbanken mit ihren konsistenten Sicherungsverfahren und alle benötigten Arbeitskopien/Repositories separat sichern. Eine Quellen-/Konfigurationssicherung enthält nicht automatisch Datenbanken, Modelle, WSL-VHD oder den gesamten Git-Verlauf.
4. Den exakten geprüften Git-Stand einschließlich Historie übertragen. Keine fremden Projekt-Repositories in die AMU-Engine aufnehmen. Schlüssel, Clientregister, Rollen, Rechte, Quoten und Konfiguration nur verschlüsselt übertragen; Wiederherstellungsschlüssel über einen separaten sicheren Weg. Keine Geheimnisse in Git, Protokollen oder diesem Bericht ablegen.
5. Modellgewichte getrennt vom Programm auf freigegebenem SSD-Speicher ablegen. `AMU_MODEL_DIR` vor dem Start auf diesen Ordner setzen; zugehörige registry.json konsistent übertragen. Größe, SHA-256, GGUF-Architektur, Template und Lizenz jedes Artefakts überprüfen. Kleines bisheriges Qwen-Modell als Fallback behalten. Keine absolute Windows-Pfadstruktur blind auf Linux übernehmen. Neue Modellprofile sind Vorschläge und keine erfolgreiche Coding-Qualifikation.
6. `AMU_CENTRAL_STATE_DIR` und `AMU_CORE_STATE_DIR` auf geschützte persistente Ordner setzen. Bestehende Berechtigungen des Zielbetriebssystems anwenden und Backup-Wiederherstellung prüfen. Node-Laufzeit und native Inferenzbibliothek für das Zielsystem separat prüfen; Windows-Binärdateien/node_modules nicht als Linux-Laufzeit übernehmen. Paketinstallation benötigt eine eigene Freigabe.
7. Isolierten Runner mit eigener Identität, Rootless-Containerlaufzeit und separaten Arbeitsverzeichnissen bereitstellen. Keine produktiven Host-Projekte oder Geheimnisse mounten. Zertifikate für die neue Gegenstelle ausstellen, mTLS-Pins bewusst ersetzen und alte Identität nicht ungeprüft übernehmen. Auf Rootless/cgroup/seccomp/Netzwerksperre/CPU/RAM/PID/Timeout/Abbruch/Bereinigung real prüfen. Neue reale Achtgruppen-Abnahme und unabhängige Freigabe sind erforderlich.
8. Neue API zunächst ausschließlich lokal starten. Authentifizierung, Mandantentrennung, Schlüsselrotation/-widerruf, Streaming und eingeschränkte Modellrollen prüfen. Für LAN später gesondert TLS, erlaubte Clients und Windows/Linux-Netzwerkregeln freigeben. Keine öffentlichen Endpunkte oder offenen Runner-Port voraussetzen.
9. Erst nach bestandenem harmlosen Coding-Auftrag einschließlich Tests, konkreter Diff-Freigabe, Commit und Restore die Anwendungen kontrolliert einzeln umstellen. AMU WEB, SYSTEM, Agent-3 und Preis Assistent behalten getrennte Schlüssel, Rechte, Daten und Zuständigkeiten. Deren Konfigurationen werden in dieser Sitzung nicht geändert.
10. Zielstart, geordneten Stopp, API-Wiederanlauf, Runner-Abbruch und Sicherungswiederherstellung dokumentieren. Bei Problemen keine parallelen Schreibdienste mit denselben Daten betreiben: Ziel geordnet stoppen, unbekannte Aufträge abgleichen und ausdrücklich zum bisherigen System zurückkehren.

## Abnahmekriterien vor stärkeren Modellen

- Ausreichend freier SSD-Speicher nach Gewicht, temporären Dateien, Sicherung und Runner-Reserve; normale 20-GiB-Beschaffungsreserve nicht durch die einmalige M30-Ausnahme ersetzen.
- Modell passt einschließlich Kontext und gleichzeitig laufender Dienste in ein gemessenes RAM-Budget; kein bloßes Vertrauen auf Dateigröße oder Modellbezeichnung.
- Manueller Modellwechsel, fehlerhafter Wechsel und Rückfall geprüft; laufende oder wartende Inferenz verhindert einen Wechsel.
- Strukturierte Ausgabe, exakte Anker, Schutz unveränderlicher Tests und mehrere Dateien mit unverändertem Qualifikationssatz prüfen. Größere Parameterzahl ist kein Nachweis einer bestandenen AMU-Abnahme.
- Ein Testfehler, nicht ausgeführter Test oder unbekanntes Ergebnis blockiert die Übernahme. Eigentümerfreigaben bleiben erforderlich.

Ein R630-Umzug, reale stärkere Modellmessungen und ein Lasttest auf dessen Hardware stehen noch aus. Diese Arbeiten werden durch zusätzliche RAM-/SSD-Kapazität ermöglicht, aber dadurch nicht automatisch bestanden.

## Ergänzung Sitzung 32: reproduzierbare Mehrdatei-Abnahme

Vor dem Umzug den aktuellen qualifizierten Stand und den Prüfbericht `docs/session32-multifile.md` übertragen. `npm run test:session32` umfasst ausschließlich die vertrauenswürdigen statischen/Controller-Regressionen; es ist keine Container- oder Hardwareabnahme. Generierte Projektmodule niemals mit node:vm oder direkten Build-/Testbefehlen auf dem Host ausführen. Reale Projekte nur mit gebundenem Snapshot, den exakt provisionierten Profilen, unabhängiger aktueller Isolationsabnahme und separater Eigentümerfreigabe prüfen.

Die statische Schnittstellenprüfung erkennt direkte benannte ESM-Importe zwischen ausdrücklich freigegebenen Dateien. CommonJS, unbekannte oder abgeschnittene Dateien, dynamische Auflösung und Stern-Reexports werden nicht als vollständig bewiesen behandelt. Build und Vertragstests bleiben verbindlich.

Der derzeit tatsächlich geprüfte Inferenzpfad ist CPU-basiert. GPU-Offloading ist im Worker deaktiviert. Ein GPU-Betriebsprofil, passende bereits lokal installierte native Bibliotheken, ausreichender nachgewiesener VRAM und ein realer GPU-/Fallback-Test müssen auf dem Zielsystem gesondert qualifiziert werden. Weder GPU-Unterstützung noch bestimmte R630-Ausstattung werden durch die konfigurierbaren GGUF-Modellprofile zugesagt. Modellverzeichnis, Modellidentität, Kontext und CPU-Threadlimits können bereits unabhängig vom Programmstand verwaltet werden.
