# Modell- und Hardwareprüfung Sitzung 28

Prüfdatum: 28.10.2026. Keine Gewichte heruntergeladen, kein Modell ausgetauscht, kein kostenpflichtiger Dienst. Istwerte: Intel Xeon E3-1230 V2 @3,30 GHz, acht logische CPUs, 23,91 GiB physischer RAM; Windows-API, WEB und Linux-Reserve bleiben erforderlich. Aktuelle Momentaufnahmen stehen in scratch/session28-before.json und session28-model-hardware.json. Während des laufenden Systems mit WSL zuletzt etwa 11,58 GiB RAM frei. C: vor Sitzung etwa 17,41 GiB frei. Interne 1-TB-HDD bleibt geschützt und ist kein verfügbarer Installationsort.

| Modell | Gewichte | KV-Cache FP16 bei 4K / 8K | Vorsichtige Modell-RAM-Schätzung bei 4K | Status |
|---|---:|---:|---:|---|
| Vorhandenes Qwen2.5-1.5B | 986.048.512 Byte, 0,918 GiB | 112 / 224 MiB | ca. 1,71 GiB | Installiert, echte lokale Inferenz; generisches Qwen, kein Coder-Nachweis |
| Qwen2.5-Coder-7B Q4_K_M | 4.683.073.536 Byte, 4,36 GiB | 224 / 448 MiB | ca. 5,95 GiB | Bestehendes Profil, nicht installiert; vorsichtiger Einstieg 2K-Kontext |
| Qwen3-32B Q4_K_M | offizielles GGUF etwa 19,8 GB dezimal | 1 / 2 GiB | ca. 23,63 GiB | Neues reines Planungsprofil; Registrierung/Start blockiert |
| Qwen3-Coder-30B-A3B Q4_K_M | ggml-org GGUF etwa 18 GB dezimal | 384 / 768 MiB | ca. 20,99 GiB | Bestehendes vorbereitetes Profil, nicht installiert/abgenommen |

Schätzformel: Gewichtsgröße ×1,2 + FP16-KV +512 MiB Arbeitsreserve. KV: Kontext × Schichten × KV-Köpfe × Kopfgröße ×4 Byte (K+V, FP16). Das sind Planungswerte, keine nativen Messungen großer Modelle. Kontextlänge wirkt linear auf KV; weitere Laufzeitpuffer, Promptauswertung und Fragmentierung können die reale Belegung erhöhen. Der gesamte MoE-Gewichtssatz muss gespeichert werden; 3B aktive Parameter ersetzen nicht rund 30B Gesamtgewichte. Tatsächliche GGUF-Größe ist abhängig vom konkreten Quantisierungsartefakt; kein unbestätigter Dateipin wird als Installationsfreigabe verwendet.

Die vorhandene AMU-Beschaffungsprüfung verlangt nach Download weiterhin 20 GiB freien Runner-/Windows-Speicher. Für 7B sind daher mindestens etwa 24,36 GiB vorher frei erforderlich; für die großen Kandidaten rund 37–39 GiB. Aktuell passt keiner dieser neuen Downloads zu dieser Reserve. RAM-seitig wäre 7B bei 2K-Kontext grundsätzlich eher realistisch als 30/32B; genaue Last-/Geschwindigkeitsabnahme fehlt und eine Installation bleibt gesondert freizugeben. Das vorhandene 1,5B-Modell ist deshalb derzeit die sichere Zwischenlösung.

Für 30/32B gleichzeitig mit Windows, WEB und 4-GiB-Runner ist ein System mit mindestens etwa 48 GiB, sinnvoller 64 GiB RAM ein Planungsziel. Das ist keine Bestätigung, dass das vorhandene Mainboard/CPU diese Aufrüstung unterstützt. Ein neueres CPU-/Speichersystem mit AVX2 und höherer Speicherbandbreite wäre für brauchbare CPU-Inferenz zu prüfen. Die jetzige Ivy-Bridge-CPU hat deutliche Leistungsgrenzen; konkrete Tokens/s für große Modelle wurden nicht gemessen. Keine vollständig kompatible GPU-Kaufempfehlung: Netzteil, Stecker und Gehäuseplatz bleiben unbestätigt.

## Backend, Templates und Schutz

Installiert: node-llama-cpp 3.22.2, CPU-Windows-x64-Build; lokale Buildmetadaten nennen eingebettetes llama.cpp Release v0.7.0. Keine Aktualisierung erforderlich für den kleinen tatsächlichen Nachweis. Die vorhandenen APIs verwenden AMU-eigenes strukturiertes JSON-Werkzeugprotokoll. Native Tool-Calls sind nicht freigegeben.

Qwen3-32B verlangt das passende eingebettete Qwen3-Template einschließlich kontrollierter Thinking-Einstellung; ein beliebiges ChatML-Template wird nicht als gleichwertig akzeptiert. Das neue Profil bleibt planningOnly, bis konkretes Artefakt, Template und nativer Start geprüft sind. Beim vorhandenen Coder-30B-Profil sind Architektur, Dimensionen und erwarteter Template-Hash bereits geprüft vorbereitet, aber ein tatsächlicher Großmodellstart ist nicht nachgewiesen. Daher keine Behauptung, dass die konkrete installierte native Buildversion alle großen Kandidaten korrekt ausführt.

Modellrollen speichern Standard-/Chat-, Coding- und Fallback-Zuordnung getrennt. Eine Rollenaktivierung bleibt eine explizite Adminaktion und verändert keinen laufenden Auftrag. Nur installierte lokale IDs zulässig; RAM-Mangel blockiert einen unpassenden Start vor dem Entladen. Als automatischer Ressourcen-Fallback ist ausschließlich ein bereits laufendes geprüftes Modell erlaubt; keine fiktive Alternative und kein automatischer Download. Ladefehler werden gesondert gemeldet und ein vorher funktionsfähiges Modell nur über die vorhandene Start-/Ressourcenprüfung wiederhergestellt.

## Überprüfte Primärquellen

- [Offizielles Qwen3-32B-GGUF](https://huggingface.co/Qwen/Qwen3-32B-GGUF/tree/main): Q4_K_M rund 19,8 GB.
- [Qwen3-32B-Konfiguration](https://huggingface.co/Qwen/Qwen3-32B/raw/main/config.json): 64 Schichten, 8 KV-Köpfe, Kopfdimension 128.
- [Qwen3-Coder-Konfiguration](https://huggingface.co/Qwen/Qwen3-Coder-30B-A3B-Instruct/raw/main/config.json): 48 Schichten, 4 KV-Köpfe, Kopfdimension 128.
- [llama.cpp-Herausgeber GGUF Coder-30B](https://huggingface.co/ggml-org/Qwen3-Coder-30B-A3B-Instruct-GGUF): Q4_K_M etwa 18 GB; andere Konvertierungen können abweichen.
- [Qwen3-32B Modellkarte/Thinking-Template](https://huggingface.co/Qwen/Qwen3-32B): Thinking-Steuerung und Templateanwendung. Keine Übernahme fremder Installationsbefehle.

Datenträger-Metadaten erneut lesend bestätigt: SSD INTEL SSDSC2CT120A3 mit 120.034.123.776 Byte; C: 18.647.334.912 Byte frei zum Inventarzeitpunkt. HDD ST1000DM003-1ER162 mit 1.000.204.886.016 Byte, ohne erkannte Partition; kein daraus abgeleiteter freier Nutzspeicher und keine Schreibfreigabe. USB AMU-BACKUP: 31.136.415.744 Byte nutzbar, 31.126.650.880 Byte frei; keine Verwendung für Modelle, Datenbanken oder Runner. Beleg: scratch/session28-storage.json.
