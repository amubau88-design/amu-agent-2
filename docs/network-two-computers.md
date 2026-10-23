# Zwei AMU-Rechner sicher verbinden

Diese Anleitung bereitet den Anschluss beliebiger AMU-Anwendungen vor. Ein tatsächlicher Zweitrechner-Test wurde noch nicht durchgeführt. Es werden keine fremden AMU-Projekte automatisch geändert.

## Auf AMU-Agent-2

1. Im Dashboard als Administrator anmelden und für jede Anwendung einen eigenen eindeutigen Namen registrieren, beispielsweise AMU-Agent-3, AMU WEB, AMU SYSTEM oder AMU Preis Assistent. Weitere Namen funktionieren ohne Änderung am zentralen Quellcode.
2. Für reine Inferenz die Rolle „Inferenz“ und nur `models:read, chat:write` vergeben. Gewünschte Modelle und passende RPM-, Parallelitäts-, Token- und Tageslimits setzen. Den einmaligen Client-Schlüssel sicher übernehmen; keinen Administrator-Schlüssel an Anwendungen verteilen.
3. Im Netzwerkbereich ein gültiges Server-Zertifikat mit passendem privaten Schlüssel auswählen/importieren. Die IP-Adresse oder der DNS-Name, den der Client später nutzt, muss im Subject Alternative Name des Zertifikats enthalten sein. Laufzeit und Fingerabdruck prüfen. Vorhandene Zertifikate werden nicht automatisch für eine neue Server-IP gültig.
4. Bind-Adresse und nur das benötigte private Subnetz eintragen. Für alle lokalen Interfaces etwa `0.0.0.0`, für einen engeren Zugriff die tatsächlich vorhandene Server-IP. LAN-Bindung wird ohne TLS und Allowlist abgewiesen. Remote-Administration bleibt für reine Inferenz deaktiviert.
5. Profil speichern. Arbeit abschließen/abbrechen und API kontrolliert neu starten. Laufende Arbeit oder eine aktive Sicherung verhindern den Neustart.
6. Firewall-Freigabe für den festgelegten API-Port und das benötigte Quellnetz separat ausdrücklich genehmigen lassen. Diese Entwicklungssitzung hat keine Firewall-Regel eingerichtet.

## Auf dem Client-Rechner

1. Nur das öffentliche CA-Zertifikat auf einem gesicherten Weg übertragen und dessen Fingerabdruck unabhängig vergleichen. Niemals den CA-Privatschlüssel oder Server-Privatschlüssel verteilen.
2. CA-Vertrauen gezielt für die betreffende Anwendung konfigurieren. Bei Node kann dafür ein geprüftes CA-PEM über `NODE_EXTRA_CA_CERTS` verwendet werden. Eine Änderung des globalen Windows-Zertifikatsspeichers erfordert eine eigene Freigabe. Zertifikatsprüfung nicht abschalten.
3. OpenAI-kompatible Basisadresse: `https://<Servername-oder-IP>:3030/v1`. Den individuellen Client-Schlüssel und ein freigegebenes installiertes Modell konfigurieren. `3030` ist der Standard; bei einer ausdrücklich abweichenden `PORT`-Betriebskonfiguration den tatsächlichen Port verwenden.
4. Erst `/health` und `/ready` prüfen, danach mit Bearer-Authentifizierung `/v1/models`, eine kurze JSON-Anfrage an `/v1/chat/completions` und anschließend SSE mit `stream: true` prüfen.
5. Verwaltungszugriff mit dem Inferenzschlüssel muss 403 ergeben. Ein widerrufener/rotierter Schlüssel muss abgewiesen werden. Client- und Server-Request-ID für Fehlerkorrelation festhalten, keine Schlüssel oder vollständigen Prompts in allgemeine Logs schreiben.

## Abnahme

Eine erfolgreiche lokale HTTPS-Prüfung ersetzt keinen Netzwerktest. Als Zwei-Computer-Test darf erst eine tatsächlich von einem anderen Rechner ausgeführte, CA-geprüfte Anfrage mit gültiger Modellantwort und echtem Streaming dokumentiert werden. Datum, Rechner, verwendeter DNS-/IP-Name, Modell, Statuscodes und Sicherheitsprüfungen protokollieren; Geheimnisse auslassen.

Bei 429/503 den `Retry-After`-Hinweis und begrenztes Backoff beachten. Teilweise empfangene Streams oder Entwicklungsaktionen nicht blind wiederholen. Core-Aufträge über ihre ID und geprüfte Checkpoints fortsetzen.

## Serverumzug

Im Dashboard eine vollständige **verschlüsselte** Sicherung mit Modellgewichten erstellen und prüfen. Paket und Passwort bzw. lokalen Wiederherstellungsschlüssel getrennt sicher übertragen. Auf dem Ziel importieren, mit dem ursprünglichen Passwort/Schlüssel prüfen und in ein neues Verzeichnis restaurieren. Erst nach Sichtprüfung der Dateien und Anpassung der CPU-/RAM-/Workerwerte übernehmen; die aktuelle Installation wird durch die Restore-Funktion nicht überschrieben.

Vor dem ersten Start auf dem Ziel Bind-Adresse, TLS-SANs, Dateipfade, verfügbare CPUs und Worker-Kontextgrenzen kontrollieren. Ein an eine alte IP gebundenes Netzwerkprofil gegebenenfalls zunächst auf Loopback zurückstellen. Abhängigkeiten aus dem Lockfile installieren, Modellintegrität prüfen und die passende lokale Dienst-/Autostart-Konfiguration neu einrichten. Eine gegebenenfalls vorhandene alte Windows-Aufgabe enthält rechnergebundene Pfade und wird nicht ungeprüft übertragen.
