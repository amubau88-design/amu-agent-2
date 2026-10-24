# Anmelden und eine Anwendung verbinden

1. Auf dem Agent-2-Rechner `http://127.0.0.1:3030/admin` öffnen. Vor der Anmeldung zeigt die Seite bereits, ob die API erreichbar und die KI bereit ist. „Anmeldung erforderlich“ bedeutet keinen Serverausfall.
2. Den **vorhandenen** Administrator-Schlüssel aus der geschützten lokalen Datei `scratch/secrets/central-admin-key.txt` in das Passwortfeld einsetzen und „Verbinden / Status laden“ wählen. Den Inhalt nicht in Chat, Quellcode, Git oder allgemeine Protokolle kopieren. Es gibt keinen erforderlichen Schlüssel-Reset.
3. Nach erfolgreicher Anmeldung stehen Benutzername, Rolle, Aktualisierungszeit und die echten Ressourcenwerte auf der Seite. Der Schlüssel bleibt nur im Arbeitsspeicher dieses Browser-Tabs. Nach Neuladen oder „Abmelden / Schlüssel vergessen“ erneut anmelden. Es wird bewusst kein Schlüssel in Local Storage oder einer URL gespeichert.

| Anzeige | Bedeutung und nächster Schritt |
|---|---|
| API erreichbar · Anmeldung erforderlich | Dienst läuft. Für Verwaltungsdaten anmelden. |
| HTTP 401 | Schlüssel fehlt, wurde gesperrt/erneuert oder ist falsch. Richtigen vorhandenen Schlüssel einsetzen. |
| HTTP 403 | Rolle, Funktions-/Modellfreigaben oder erlaubtes Quellnetz prüfen. Kein neuer Schlüssel ist automatisch nötig. |
| API erreichbar · Dienst nicht bereit / HTTP 503 | API antwortet, aber Worker lädt/ist gestoppt oder Wartung läuft. Modell-/Backupstatus prüfen. |
| HTTP 429 | Anfrage-, Parallelitäts-, Budget- oder Statuslimit erreicht. Laufende Arbeit und Limits prüfen. |
| API vorübergehend nicht erreichbar | Prozess, lokale Adresse und Port prüfen. Authentifizierte Statusabfragen versuchen später erneut zu verbinden; Generierungen werden nicht automatisch wiederholt. |

## Neue Anwendung

„Neue Anwendung vorbereiten“ setzt das Formular einschließlich Kontextlimit zurück. Frei wählbaren Namen eintragen. Für normale KI-Anfragen die Rolle **Inferenz**, „Modelle auflisten“ und „KI-Antworten und Streaming“ wählen. Modell, RPM, Parallelität, Ausgabetokens, Tagesbudget, Kontext und Priorität passend begrenzen. Danach „Client erstellen“ wählen.

Der vollständige geheime Schlüssel erscheint einmalig mit Client-ID und nicht geheimer Schlüsselkennung. Über „Einmaligen Schlüssel kopieren“ in den geschützten Konfigurationsspeicher der Anwendung übernehmen, danach „Schlüssel ausblenden und vergessen“. Die Verwaltung speichert den Schlüssel als Hash; sie bietet keinen erneuten Klartextabruf. Die Schlüsselkennung ist kein Anmeldeschlüssel. Bestandszugänge erhalten eine `legacy-…`-Kennung, ohne ihren Schlüssel zu ändern. Neue/rotierte Schlüssel erhalten eine eigene UUID und einen Erstellungszeitpunkt. Eine automatische zeitliche Ablaufregel ist derzeit nicht eingerichtet; Sperre, Rotation und Widerruf steuern die Gültigkeit.

„Verbindungskonfiguration“ zeigt Adresse, Modell, Rechte und Limits. „Konfiguration ohne Geheimnis exportieren“ lädt diese Informationen als JSON herunter. **`api_key` bleibt ein Platzhalter.** Nur den individuellen Anwendungsschlüssel ergänzen; den Administrator-Schlüssel nicht an normale Anwendungen verteilen.

„Rechte ändern“ lädt den vorhandenen Zugang ins Formular. „Sperren“ deaktiviert, „Reaktivieren“ aktiviert denselben Zugang wieder. „Schlüssel erneuern“ erzeugt einen Ersatz und macht den bisherigen Schlüssel sofort ungültig. Danach die Konfiguration der betreffenden Anwendung anpassen. Andere Anwendungen bleiben gültig. Archivieren erfordert eine Bestätigung; Wiederherstellen einer archivierten Anwendung erzeugt einen neuen Schlüssel. Ein dauerhaft mit Namensbestätigung widerrufener Zugang kann nicht reaktiviert werden.

## Neustart und andere Rechner

Ressourcenprofil-Felder zeigen nach der Anmeldung gespeicherte Werte. Änderungen speichern und erst nach Abschluss laufender Arbeit kontrolliert die API neu starten. Der nächste Start prüft CPU-/RAM- und Workergrenzen gegen die tatsächliche Hardware. Die aktuellen sicheren Werte sind keine Festlegung auf diesen Rechner.

Nach einem kontrollierten API-Neustart kann eine bereits geladene Seite Statusverbindungen wieder aufnehmen. Wird die komplette Browser-Seite genau während des Neustarts geladen, kann der Browser eine eigene Verbindungsfehlerseite anzeigen. Nach Bereitschaft erneut die normale Dashboard-Adresse öffnen. Eine funktionierende neue Dashboard-Ansicht wurde in Sitzung 8 bereitgestellt.

`127.0.0.1` funktioniert nur auf Agent-2 selbst. Für einen anderen Computer eine tatsächliche private HTTPS-IP oder Domain, passendes Zertifikat/SAN, geprüfte öffentliche CA, Quellnetzfreigabe und gesondert genehmigten Portzugriff verwenden. Anleitung: [Zwei Rechner sicher verbinden](network-two-computers.md). Ein Test auf demselben Rechner bestätigt keine Verbindung zweier Computer.

Core-Aufgaben besitzen einen geschützten Statusstream unter `GET /api/core/tasks/<ID>/events`. Das Dashboard verwendet ihn für aktive ausgewählte Aufgaben und fällt bei Unterbrechung auf Statusabfragen zurück. Dieser Beobachtungsstream startet oder wiederholt keine Entwicklungsaktion. Er endet bei Abschluss, Widerruf, Zeitlimit oder zu langsamem Empfänger. Entwicklungsaufträge und Vorschläge bleiben separat zugriffsgeschützt; Vorschläge werden weiterhin erst nach ausdrücklicher Prüfung angewendet.
