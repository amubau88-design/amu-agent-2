# Austauschbare Inferenz-Backends

Die REST-API verwendet den AMU-Worker-Pool und dessen `InferenceWorker`-Vertrag. `InferenceBackends` registriert vertrauenswürdige Adapter beim Anwendungsstart. Worker können über `backend` eine bereits registrierte Laufzeit auswählen. Unbekannte Adapter, doppelte Registrierungen, unvollständige Verträge und widersprüchliche Remote-Zuordnungen werden abgelehnt. Bestehende Worker ohne `backend` behalten ihre bisherige Laufzeit.

Installierte Standardadapter:

- `llama-cpp`: eingebettete lokale Inferenz, privater Kindprozess, vorhandene GGUF-Modelle.
- `amu-secure-worker`: vorhandenes AMU-HTTPS-Protokoll mit Zertifikatsbindung, ausschließlich entsprechend der bestehenden Remote-Freigaben.

Weitere Adapter werden als AMU-Quellcode implementiert und explizit mit `register(id, factory)` registriert. Der Pool akzeptiert die Registry als zweiten Konstruktorparameter. Jeder Adapter muss Status, Start, Pause, Modellwechsel, Generierung mit Streaming/Abbruch, Speicherüberwachung und Schließen implementieren. Autorisierung, Mandantenlimits und Warteschlange bleiben vor dem Adapter im AMU-Pool. REST-Anfragen können weder Adaptercode laden noch neue Netzwerkberechtigungen erzeugen.

Qwen und Llama sind Modellfamilien, keine Adapterprotokolle. Ein kompatibles, geprüftes GGUF-Modell kann über die vorhandene Modellverwaltung und llama.cpp laufen; die Eignung jedes Modells ist separat nachzuweisen. Es wurden keine zusätzlichen Modellgewichte heruntergeladen.

Ein Ollama-Adapter ist **nicht installiert oder real qualifiziert**. Die Registry schafft die Erweiterungsstelle, startet aber keinen Ollama-Dienst und stellt keine Verbindung zu ungeprüften Endpunkten her. Ein späterer Adapter muss insbesondere Kontextgrenzen, Timeout, Abbruch, Streaming, Ressourcenbeobachtung und die Herkunft seiner Modelle nachweisen. Die vorhandene unabhängige lokale Engine benötigt Ollama weiterhin nicht.

`session36-backends.test.mjs` prüft Registry und Pool mit einem ausdrücklich simulierten Adapter. Das ist kein Inferenznachweis für Ollama oder Llama-Modellgewichte.
