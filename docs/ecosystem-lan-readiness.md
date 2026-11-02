# Optionaler HTTPS-LAN-Zugang (1.37.1)

Die lokale Verwaltung bleibt auf http://127.0.0.1:3030/admin. Ein optionaler zweiter TLS-Listener teilt denselben API-Prozess, Scheduler und dieselben Modell-/Clientlimits. Keine zweite Inferenzinstanz.

Die private Datei scratch/secrets/lan-listener.json aktiviert Port 8080 mit bindHost 0.0.0.0, allowedCidrs [192.168.2.0/24], bestehendem server-cert.pem/server-key.pem und allowRemoteAdmin false. Zertifikatsnamen werden aus dem vorhandenen TLS-Verzeichnis aufgelöst; ungültige Profile oder Zertifikate verhindern den LAN-Start. Ein Fehler lässt den lokalen Listener bestehen. TLS ab 1.2; individuelle API-Schlüssel erforderlich. Remote-Administration und öffentliche Eigentümer-Codeausgabe bleiben gesperrt.

Das explizite, idempotente Administratorskript scripts/enable-lan-firewall.ps1 prüft Prozessidentität und Profil vor Erstellung der einzelnen Regel AMU-AI-8080. Keine automatische Aktivierung durch normalen API-Start. Rücknahme: ausschließlich diese Regel über Windows-Firewall deaktivieren und enabled im privaten Listenerprofil auf false setzen, dann geordnet über den Supervisor neu laden. Modelle und Primärport bleiben erhalten.

Die Client-Konfiguration bewirbt den zweiten HTTPS-Port. /ai/active liefert für berechtigte Modell-Clients ausschließlich ready, model, ctxSize und loadMs; Aufträge und Checkpoints sind weiterhin administrativ geschützt. /owner/verify verwendet dieselbe lokale Einmalcode-Prüfung wie der vorhandene Login. /owner/register erlaubt nur bestehenden lokalen Administratoren eine Statusbestätigung, keine neue Berechtigung.

Qwen3-14B ist ausschließlich ein planningOnly-Profil. Herkunft der Größen-/Architekturdaten:
- https://huggingface.co/Qwen/Qwen3-14B/blob/main/config.json
- https://huggingface.co/ggml-org/Qwen3-14B-GGUF/raw/main/Qwen3-14B-Q4_K_M.gguf

Die Laufwerksinventur, aktuelle Grenzen und Abnahmeergebnisse stehen in FINAL_PATHS.md und FINAL_STATUS.md. Insbesondere ersetzt ein HTTPS-Test zur eigenen LAN-IP keine Prüfung von einem zweiten Computer.
