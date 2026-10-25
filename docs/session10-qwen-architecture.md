# Sitzung 10 – vorbereitete Qwen-Architektur, noch keine Implementierungszusage

Recherche am 25.10.2026, ausschließlich Metadaten und Primärquellen gelesen. Keine Gewichte heruntergeladen, keine neue Laufzeit installiert und kein neuer Server gestartet.

## Modellentscheidung und Artefakte

Ziel bleibt **Qwen/Qwen3-Coder-30B-A3B-Instruct**: offene Apache-2.0-Lizenz, MoE-Architektur `qwen3_moe`, rund 30 Milliarden Gesamtparameter mit rund drei Milliarden aktiven Parametern je Token, 48 Schichten. Der große beworbene Kontext ist kein auf dieser Hardware zugesicherter Betriebswert. Offizielle Quelle und Lizenz: [Qwen-Modellkarte](https://huggingface.co/Qwen/Qwen3-Coder-30B-A3B-Instruct). Die konkrete Architektur ist in [config.json](https://huggingface.co/Qwen/Qwen3-Coder-30B-A3B-Instruct/blob/main/config.json) nachprüfbar.

Ein GGUF-Kandidat vom llama.cpp-Projekt ist [ggml-org/Qwen3-Coder-30B-A3B-Instruct-GGUF](https://huggingface.co/ggml-org/Qwen3-Coder-30B-A3B-Instruct-GGUF): BF16, Q8_0 und Q4_K_M, letzteres ungefähr 18 GB allein für Gewichte. Dies ist eine Konvertierung durch ggml-org, kein hier verifiziertes Qwen-eigenes GGUF-Release. Konkreten Dateinamen, unveränderliche Revision, vollständigen SHA-256 und Lizenzbeilage vor Übernahme festhalten. Die Dateibaum-Abfrage war im Recherchewerkzeug nicht abrufbar; daher ist kein konkreter Qwen3-GGUF-Dateihash freigegeben.

Alternative: **Qwen/Qwen2.5-Coder-32B-Instruct**, Apache-2.0, dichtes `qwen2`-Modell mit 32,5 Milliarden Parametern und 64 Schichten. [Offizielle Modellkarte](https://huggingface.co/Qwen/Qwen2.5-Coder-32B-Instruct) und [Qwen-eigenes GGUF-Verzeichnis](https://huggingface.co/Qwen/Qwen2.5-Coder-32B-Instruct-GGUF/tree/main) sind bestätigt. Dort wird `qwen2.5-coder-32b-instruct-q4_k_m.gguf` mit etwa 19,9 GB angeboten, auch geteilt in drei Dateien. Für lange Kontexte beschreibt die Modellkarte zusätzliche Skalierung; diese ist nicht automatisch in AMU aktiv.

Reine Gewichtsgröße ist nicht der RAM-Bedarf: Betriebssystem, andere Anwendungen, Runtime, Kontext-/KV-Cache, temporäre Berechnung und Parallelität kommen hinzu. MoE reduziert aktive Rechenarbeit, bedeutet aber nicht nur drei Milliarden Parameter im Speicher. Auf dem aktuellen 24-GiB-Rechner mit ungefähr 8–9 GiB freiem RAM ist kein belastbarer Start dieser Profile freigegeben. Keine Geschwindigkeitszusage oder Kaufempfehlung; zuerst tatsächliche Zielhardware, ISA-Unterstützung, RAM, freie Platte und gegebenenfalls GPU/VRAM messen. Apache-Lizenz-/NOTICE-Pflichten bei Weitergabe beibehalten; Lizenz und Artefaktherkunft getrennt dokumentieren.

## Templates und Werkzeugaufrufe

Qwen3-Coder hat ein eigenes Toolformat. Das offizielle [Tokenizer-/Chat-Template](https://huggingface.co/Qwen/Qwen3-Coder-30B-A3B-Instruct/blob/main/tokenizer_config.json) und der dort gepflegte Toolparser müssen zur konkreten Revision passen. Ein normaler Qwen-/ChatML-Wrapper allein beweist keine passende Codervariante. Das installierte `QwenChatWrapper` in node-llama-cpp enthält unter anderem JSON-artige Toolaufrufe; die AMU-Kompatibilität mit dem spezifischen Coderformat ist deshalb gesondert zu prüfen.

[node-llama-cpp dokumentiert Function Calling](https://node-llama-cpp.withcat.ai/guide/function-calling) mit modellabhängigen Wrappern und validierten Parametern. AMU nutzt diese Möglichkeit im öffentlichen Chat-Endpunkt bislang nicht: `tools`, `tool_choice`, `functions`, `response_format` werden weiterhin mit HTTP 400 abgewiesen. Der bestehende AMU Core verwendet eine eigene beschränkte strukturierte Planung und kontrollierte Werkzeuge. Das ist keine Abnahme nativer Qwen3-Coder-Toolaufrufe.

## Umsetzung innerhalb der vorhandenen Module

Keine zweite API und kein neuer Projektbaum. Bestehende Grenzen nutzen: `src/inference/contracts.ts` (`InferenceWorker`), Worker/Pool/Slot, Modellregister, AMU-Core-Controller, zentrale Authentifizierung und Ressourcenpolitik.

1. Versionierte Modellprofile ergänzen: Profil-ID, Repository/Revision, lokale Dateien/Hashes, Architektur/Quantisierung, Template-Digest, Runtime-Mindeststand, Tokenizer, erlaubte Fähigkeiten, konservativer Standardkontext und Ressourcenbedarf. Vor Aktivierung Hash und Architektur prüfen; unbestätigte Fähigkeiten bleiben deaktiviert.
2. Vorhandenen Embedded-Adapter um Capability-Meldung und Template-/Toolparser-Auswahl erweitern. Native Ladeprüfung zunächst mit konservativem Kontext und einem Worker. CPU bleibt unterstützt; ein späteres GPU-Profil erfordert geprüften lokalen Build. Der aktuelle Worker setzt GPU ausdrücklich auf false.
3. Parsing trennt Modelltext von Werkzeugereignissen. Namens-Allowlist, JSON-Schema, Größen-/Zeit-/Schrittgrenzen, Schleifenabbruch, Pfadprüfung und Autorisierung bleiben AMU-Verantwortung. Modelltext erteilt niemals selbst Ausführungsrechte. Änderungen weiterhin erst nach Prüfung über bestehende Core-Funktionen anwenden.
4. Kontextverwaltung ergänzt tokenbasierte Budgets, begrenzte Dateiausschnitte und kontrollierte Zusammenfassung. Kein unbeschränktes Einspeisen ganzer Projekte. Isolierung nach Anwendung/Auftrag, keine übergreifende Gesprächshistorie oder unkontrollierte Kommandoausführung.
5. Abnahmekriterien: Text JSON/SSE/Abbruch; korrektes offizielles Template; erlaubter und verbotener Toolaufruf; ungültige Parameter; Schleifen-/Deadline-Abbruch; Rechte-/Mandantengrenzen; RAM-Grenze; kleiner reproduzierbarer Codeanalyse-/Reparaturfall. Erst danach gewünschtes Modell als betriebsbereit anzeigen.

Anschließend echte TLS-Verbindung zum zweiten Rechner prüfen. Bereits vorhandene Remote-Worker bleiben optionale AMU-eigene Transportadapter. Keine dauerhafte Abhängigkeit von einem externen Inferenzdienst wird eingeführt. Sitzung 9 schaltet keines dieser großen Modell- oder Toolprofile vorzeitig frei.
