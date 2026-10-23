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

Aktueller Stand nach Entwicklungssitzung 2: [session2-engine.md](docs/session2-engine.md). Windows-Anmeldeautostart, Checkpoints/Wiederaufnahme, Rollen, RAM-Schutz und TLS-Vorbereitung sind ergänzt. Der tatsächlich laufende Server bleibt standardmäßig auf Loopback beschränkt.
