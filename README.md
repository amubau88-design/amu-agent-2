# AMU AI / API Engine

AMU-Agent-2 führt lokale GGUF-Modelle direkt mit einer eingebetteten nativen Bibliothek aus. Ein Ollama-, LM-Studio- oder Cloud-Inferenzserver ist für die Standardkonfiguration nicht erforderlich.

## Start

```powershell
npm ci --ignore-scripts
npm run build
npm run start:supervised
```

Node.js 24 oder neuer. Abhängigkeiten sind durch `package-lock.json` gesperrt. Auf diesem Rechner sind Installation, Modellimport und Serverstart bereits erfolgt. Ein zweiter Start auf demselben Port wird abgewiesen.

- API: `http://127.0.0.1:3030`
- Verwaltung: `http://127.0.0.1:3030/admin`
- Schlüssel lokal: `scratch/secrets/central-admin-key.txt`
- Status: `GET /health`
- Tests: `npm run test:safe`, `npm run typecheck`, `node scripts/verify-supervisor.mjs`, `node --experimental-strip-types scripts/verify-network.mjs`

Gewichte und private Daten gehören nicht in Git. Für eine andere Installation muss eine zugelassene GGUF-Datei einmalig mit SHA-256-Prüfung importiert werden. Beispiel und Betriebsdetails: [docs/amu-engine.md](docs/amu-engine.md).

API-Verwaltung, Queue, Client-Rechte, Entwicklungssteuerung, Dateischutz und Überwachung sind AMU-Software. Die mathematische Modellausführung verwendet `node-llama-cpp`/`llama.cpp`; die derzeitigen Modellgewichte sind Qwen2.5-1.5B unter Apache-2.0. Das Projekt ist kein neu trainiertes KI-Grundmodell.

Historischer Stand nach Entwicklungssitzung 2: [session2-engine.md](docs/session2-engine.md). Windows-Anmeldeautostart, Checkpoints/Wiederaufnahme, Rollen, RAM-Schutz und TLS-Vorbereitung sind ergänzt. Der tatsächlich laufende Server bleibt standardmäßig auf Loopback beschränkt.

Historischer Stand: **1.3.0 – zentrale Multi-Client-Plattform**. Beliebige Anwendungen, API-Freigaben, dauerhafte Nutzung und Tagesbudgets, faire Warteschlangen, Readiness und portable Ressourcenprofile. Betriebsstatus, Grenzen, Sicherungen und nächste Schritte: [Sitzung 3](docs/session3-platform.md). Gezielte Tests: `npm run test:session3`.

Historischer Stand: **1.4.0 – native Multi-Worker und verschlüsselte Sicherung/Restore**. Dynamische Worker mit gemeinsamen CPU-/RAM-Grenzen, fairer Dispatch, Wiederherstellung ausgefallener Worker, verschlüsselte Exporte und isolierte Restore-Prüfkopien sowie persistente Netzwerk-/TLS-Verwaltung. [Sitzung 4 und Grenzen](docs/session4-platform.md), [Zwei-Rechner-Anleitung](docs/network-two-computers.md). Gezielte Tests: `npm run test:session4`. Neue Exporte sind ausschließlich verschlüsselt.

Historischer Stand: **1.5.0 – TLS-Remote-Worker, Serverrollen, geplante verschlüsselte Sicherungen und Client-Konfigurationshilfe**. Native Inferenz bleibt erhalten. Auftragsjournale verhindern erneute Ausführung derselben Identität; Wiederverbindung führt keine fehlgeschlagenen Aufträge erneut aus. [Sitzung 5: Betrieb, tatsächliche Tests und Grenzen](docs/session5-platform.md). Gezielte Tests: `npm run test:session5`. Ein echter Zwei-Rechner-Test und automatischer produktiver Rollback stehen noch aus.

Aktueller Stand: **1.6.1 – notwendige Kernplattform lokal betriebsbereit**. Private HTTPS-Domains, sichere Client-Profile mit tatsächlichem Port, verständliche Betriebsübersicht, verifizierter Export auf ein getrenntes Medium und kontrollierter manueller Programm-Rollback ergänzen die bestehende native Engine. [Sitzung 7: Funktionen, Prüfungen, Betriebsbereitschaft und Grenzen](docs/session7-platform.md). Gezielte Tests: `npm run test:session7`. [Betriebsanleitung für Sicherung und manuelle Wiederherstellung](docs/operations/manual-recovery.md). Die produktive Zwei-Computer-Anbindung bleibt gesondert abzunehmen; weitere Plattformentwicklung pausiert zunächst.
