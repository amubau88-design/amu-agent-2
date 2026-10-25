# Sitzung 9 – Administratorzugang, Schlüssel und Qwen-Vorbereitung

Stand: 25.10.2026, Version 1.7.0. Ausschließlich AMU-Agent-2 geändert.

## Tatsächlich laufender Stand

Die beaufsichtigte API läuft auf http://127.0.0.1:3030. `/health` und `/ready` melden Bereitschaft. `/v1/models` benötigt einen Schlüssel. `/v1/chat/completions` liefert echte lokale JSON- und SSE-Antworten einschließlich `[DONE]`. Der bestehende Agent-3-Schlüssel wurde dafür auf Agent-2 benutzt; am Agent-3-Projekt wurde nichts geändert. Keine Cloud und kein separater Ollama-Server sind für diese Inferenz erforderlich. Andere lokale Dienste wurden nicht entfernt.

Aktiv bleibt das vorhandene allgemeine Qwen2.5-1.5B-Modell, kein Coder-30B/32B. Ein lokaler llama.cpp-Prozess über node-llama-cpp 3.22.2, vier Threads, Kontext 4096, CPU. Erkannt: Xeon E3-1230 V2, acht logische CPUs, ungefähr 24 GiB RAM. R630-Hardware und GPU-Beschleunigung sind nicht abgenommen. Native JSON und SSE benötigten im gemeinsamen kurzen Funktionstest rund 3,6 Sekunden; das ist kein Leistungsbenchmark.

## Ohne auffindbaren Administrator-Schlüssel anmelden

1. Im bestehenden Projekt `scripts/AMU-Administratorzugang.cmd` als AMU-Benutzer öffnen. Alternativ: `node --experimental-strip-types scripts/owner-access.mjs`.
2. Der Helfer liest über Windows-SID und .NET-Dateieigentümerschaft die Berechtigung. Nur der Eigentümer der vorhandenen Zugangskonfiguration oder ein erhöhter Windows-Administrator erhält einen fünf Minuten gültigen Einmalcode. Keine Ausführungsrichtlinie und keine ACL werden verändert.
3. Den Code unter **Eigentümer-Anmeldung und Wiederherstellung** im lokalen Dashboard einsetzen. Er ist einmal verwendbar und an Projektpfad, Zustandsverzeichnis und den bestehenden Hauptadministrator gebunden. Aufruf über das Netz ist ausgeschlossen. Falsche Codes sind begrenzt auf zehn Versuche je fünf Minuten pro Serverprozess.
4. Eine geschützte HttpOnly-/SameSite-Strict-Sitzung gilt acht Stunden und übersteht Neuladen. Unter TLS wird Secure gesetzt. Zustandsänderungen erfordern eine passende Origin. Abmelden löscht die Sitzung; Administratorrotation oder Sperre entzieht ihre Gültigkeit.

Der vorhandene Administrator-API-Schlüssel kann alternativ eine solche Sitzung öffnen. Es gibt keinen öffentlichen Reset, keinen neuen Administrator und keine Rücksetzung vorhandener Clients. Bei fehlender oder mehrdeutiger bestehender Administratorkonfiguration verweigert der Helfer die Ausstellung. Der Helfer benutzt bewusst das reguläre Projekt-Zustandsverzeichnis. Bei einem ausdrücklich abweichenden Betriebsverzeichnis ist vorher eine passende administrative Anpassung erforderlich.

Einmalcodes und Sitzungen werden nur gehasht gespeichert. Bereits vorhandene lokale Bootstrap-Schlüsseldateien bleiben erhalten. POSIX-Dateimodus 0600 ist keine Windows-ACL-Härtung; bestehende Windows-Zugriffsrechte wurden nicht als gehärtet zertifiziert. Lokale Betriebssystemadministratoren bleiben Vertrauenspersonen.

## API-Schlüsselverwaltung

Im Dashboard eine vorhandene Anwendung auswählen oder zunächst eine Anwendung anlegen. Mit **Neuen API-Schlüssel erstellen** wird ein benannter Zusatzschlüssel mit eigener Kennung erzeugt. Das Geheimnis erscheint ausschließlich in dieser Antwort, kann kopiert oder unmittelbar passwortverschlüsselt exportiert und anschließend ausgeblendet werden. Es gibt kein späteres Auslesen des Geheimnisses.

Zusatzschlüssel unterstützen Modellauflistung und Chat/Streaming. Rollen für Betrieb, Entwicklung und Administration werden damit nicht vergeben. Vorhandene Entwicklungszugänge bleiben im Bereich Anwendungen verwaltbar. Anwendungsmodellfreigaben und Limits bilden immer die Obergrenze. Eigene Modellliste, Funktionen, RPM, Ausgabe, Kontext, Parallelität, Tagesbudget und Priorität begrenzen zusätzlich. Ein leeres eigenes Tagesbudget bedeutet kein eigenes Budget, hebt aber das Anwendungsbudget nicht auf. Budgets laufen nach UTC, Reservierungen erfolgen vor Generierung. Das effektive Kontextlimit umfasst den bisherigen Plattformschutz.

Suche, Rechte-/Limitbearbeitung, Namensänderung, Rotation, Deaktivieren/Reaktivieren, Ablaufänderung, dauerhafter Widerruf mit Namensbestätigung und letzte Nutzung/Fehlerzähler sind vorhanden. Rotation/Sperre/Widerruf/Änderung eines Zusatzschlüssels brechen nur dessen registrierte laufende Chat-Anfragen ab. Bestandszugänge lassen sich zusätzlich benennen und mit Ablauf versehen. Ihre bisherige Anwendungsverwaltung bleibt bestehen. Änderungen eines Bestandsablaufs wirken auf neue Anmeldungen; eine bereits angenommene Anfrage bleibt höchstens bis zu ihrem bisherigen Ablauf beziehungsweise Serverzeitlimit bestehen.

Die Kennung eines Zusatzschlüssels bleibt bei Rotation stabil; `rotatedAt` kennzeichnet den Wechsel. Die Schlüsseldatei enthält nur SHA-256-Hashes zufälliger 256-Bit-Schlüssel. Metadaten und Protokolle enthalten keine Geheimnisse. Grenze: 10.000 gespeicherte Definitionen insgesamt, 64 nicht widerrufene Definitionen pro Anwendung; widerrufene Einträge bleiben als Nachweis erhalten. Automatische Bereinigung und Schlüsselrechte für Core-Aufträge sind noch nicht umgesetzt.

Administrationsendpunkte: `GET /api/central/keys`, `POST /api/central/keys/create`, `/keys/action` mit `rotate`, `configure`, `disable`, `enable`, `expiry`, `revoke`, sowie `/keys/legacy`. Nur Administratoren dürfen sie aufrufen.

Verschlüsselter Browserexport: Format `AMU-KEY-1`, AES-256-GCM, zufälliges 16-Byte-Salt/12-Byte-IV, PBKDF2-SHA256 mit 310.000 Iterationen. Passwort mindestens zwölf Zeichen und doppelte Eingabe, anschließend aus Eingabefeldern entfernt. Datei enthält ausschließlich den verschlüsselten Schlüssel, keine unverschlüsselte Zugangskopie. Passwort separat sichern. Ein Import-/Entschlüsselungsdialog ist noch nicht implementiert; korrekte Entschlüsselung ist im Test nachgewiesen.

## Bestandsschutz und Prüfung

Ausgangscommit `873c890`, vorher sauberer Arbeitsbaum. Vor Änderungen vollständige verschlüsselte Sicherung ohne erneute Modellkopie: `910bf7d9-e18c-4dd8-b158-b8c4a797266c`. 243 Dateien; authentifizierte Entschlüsselung und SQLite-Integrität `ok`. Das zuvor geprüfte Modellarchiv `83d5fc61-9352-4770-b740-c9d4e9254167` bleibt erhalten. Keine produktive Wiederherstellung und keine Schemaersetzung. Neue Schlüssel- und Sitzungsdateien werden bei Nutzung ergänzend angelegt; vorhandene Clients und Datenbanken bleiben bestehen.

Geprüft: TypeScript-Build; Sitzung-9-Zugangs-/Schlüsseltests mit isolierten Daten; tatsächliche Dashboard-Handler einschließlich Erstellung, Bearbeitung, Suche, Kopieren, Ausblenden und entschlüsselbarem Export; Sitzung-8-Verwaltung einschließlich isoliert gestarteter Wiederherstellung; Sitzung-8-Core-SSE-Schutz; echte Windows-Eigentümerprüfung und echter einmaliger Eigentümerlogin mit Wiederholungsablehnung ohne Änderung der Clientdatei; echter Browserlogin und Anmeldung nach Neuladen; reale lokale JSON-/SSE-Inferenz mit bestehendem Client.

Tests: `npm run test:session9`, `npm run test:session8`, `npm run build`. Die Tests verwenden temporäre Projekt-Unterverzeichnisse. Die neue Schlüsselverwaltung wurde im Browser sichtbar geprüft; produktive Schlüssel wurden dabei nicht neu vergeben. Der verschlüsselte Export und die neuen Änderungsbuttons wurden mit dem echten Dashboard-Skript gegen eine isolierte API ausgeführt.

## Verbindlicher nächster Umfang

Zuerst die in `session10-qwen-architecture.md` beschriebenen Modellprofile und Capability-Prüfungen umsetzen. Größere Gewichte erst nach Hardware-/Speicherprüfung und expliziter Auswahl bereitstellen. Qwen3-Coder-Toolformat mit konkretem Runtime-Build und Testfixtures prüfen, bevor Tool-Calling als verfügbar ausgewiesen wird. Echten TLS-LAN-Test mit Agent-3 auf zweitem Computer durchführen. Aktuell bleibt der Dienst ausschließlich lokal; es gibt keine behauptete LAN-Abnahme und keine Produktionsfreigabe für ein großes Coder-Modell.

Abschlusssicherung: `53a13564-f43c-45ba-8d59-b7daa8d5c1ec`, 256 Dateien, ohne erneute Modellkopie; authentifizierte Prüfung und SQLite-Integrität erfolgreich. SHA-256: `f1c8790a2f55d160ab01494990b6fb0132cbd3cb6126b7e5935dd394a2fd0794`. Die nachträglich ergänzte Sicherungsreferenz ist zusätzlich durch den Git-Abschluss gesichert. Auch die vorhandenen Sitzung-3-Tests zu Fairness, Rechteabgrenzung und Anwendungsbudgets sind bestanden.
