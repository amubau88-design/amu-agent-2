# Tatsächlicher Ecosystem-Status — 2. November 2026

Quell- und API-Version: **1.37.1**. Keine vollständige Ecosystem-Produktionsfreigabe. Die begrenzte Sitzung-40-Abnahme unter v1.37.0 bleibt unverändert dokumentiert in FINAL_REPORT.md.

| Auftrag | Tatsächliches Ergebnis |
|---|---|
| Modell | Vorhandenes Qwen2.5-1.5B bleibt aktiv; Kontext jetzt 16.384. Qwen3-14B fehlt. Kein Download. Gemessene Ladezeiten 7.032 und nach Neuladen 7.081 ms erfüllen die strikte Vorgabe unter 7.000 ms nicht. |
| LAN | HTTPS auf 192.168.2.100:8080, bestehende lokale API auf 127.0.0.1:3030 erhalten. Firewall auf Ethernet, node.exe, lokale IP und Quellnetz 192.168.2.0/24 begrenzt. TLS, Authentifizierung, Modelle und SSE über die LAN-IP auf demselben Rechner bestanden. Noch kein Nachweis von einem zweiten physischen Gerät. |
| Eigentümer | Bestehende geschützte Administratorsitzung im echten eingebetteten Browser bestätigt. Lokaler Windows-Eigentümerhelfer bleibt erforderlich. Keine öffentliche sechsstellige Bootstrap-Funktion, kein Schlüssel-Reset und keine zusätzliche Klartext-Token-Datei. |
| Produktionstag | v1.37.0-prod wird wegen nicht erfüllter Voraussetzungen nicht erstellt oder erzwungen. Bestehender Release v1.37.0 bleibt erhalten. |
| Agent-3 | Bestehender individueller Client-Schlüssel funktioniert über HTTPS8080; Verbindungsprofil aktualisiert, Schlüssel unverändert. Quellrepository und genannte Commits fehlen auf diesem PC; daher kein Programmstart, keine App-Tests und kein Agent-3-Push. |
| Preis-Assistent | Quellrepository nicht gefunden. Kein Build, Neustart, Browser-E2E oder kommerzieller Launch behauptet. AMU-SYSTEM-Preisregeln sind kein Ersatz. |

## Tatsächlich geprüfte Funktionen
36 relevante Regressionstestprogramme bestanden, einschließlich neuer echter TLS-/Zugriffs-/Eigentümer-Alias-Prüfung; TypeScript-Prüfung bestanden. Produktions-HTTPS: /health, /ready, /ai/active, /v1/models und SSE erfolgreich, ungültige Schlüssel abgelehnt, Inferenzzugriff auf /metrics verweigert. Falscher TLS-Hostname abgelehnt. Abschließendes echtes SSE mit Kontext 16.384: HTTP200, sechs Ereignisse, DONE vorhanden.

Die acht Linux-Isolationsgruppen und Crash-Recovery-/Coding-Abnahme aus Sitzung 40 wurden hier nicht nochmals durchgeführt. Deren damaliger Kontext war 4.096; eine neue vollständige Coding-Qualifikation mit 16.384 steht aus. Keine neuen Paket- oder Modellinstallationen, keine HDD-Änderung, keine Änderungen an AMU WEB, AMU SYSTEM oder fremden Projektdaten.

## Ressourcen und Blockaden
Verifiziertes Gerät: FUJITSU CELSIUS W520 POWER, ca. 23,9 GiB RAM insgesamt. Browser zuletzt ca. 12,5 GiB verfügbar. Qwen3-14B Q4_K_M: 9.001.753.376 Byte Gewichte; konservative 16k-RAM-Schätzung ca. 13,06 GiB gegenüber gemessenem Modellbudget 11,39 GiB. Ein Download würde C: auf etwa 10,62 GiB reduzieren, unter die bestehende Beschaffungsreserve. Profil nur zur Planung, keine Laufzeitqualifikation.

## Nächste Schritte
Agent-3 und Preis-Assistent müssen als tatsächliche bestehende Quellbestände auf diesem Rechner verfügbar werden. Danach Identität, Sicherung und Tests prüfen. LAN mit einem autorisierten zweiten Gerät und vertrauenswürdiger CA abnehmen. Größeren Kontext mit realen Coding-Budgets erneut qualifizieren. Qwen3-14B erst mit ausreichenden Reserven und qualifizierter Vorlage/Laufzeit erwägen.

[Bestehender Agent-2-Release](https://github.com/amubau88-design/amu-agent-2/releases/tag/v1.37.0). Weitere Ecosystem-Produktlinks werden ohne Nachweis nicht als veröffentlicht ausgegeben.

## Abschließende Sicherung
Verschlüsselter Konfigurationsexport 5012b3bf-da3c-4373-afa8-af577542aeab erfolgreich verifiziert; sechs wiederhergestellte SQLite-Datenbanken geprüft, keine Rückschreibung in laufende Daten. Quell-/Nachweissicherung zusätzlich authentifiziert extrahiert (Kennung lokal in scratch/ecosystem-final-source-backup.json). C: vor dieser kleinen Quellsicherung 20.382.842.880 Byte = ca. 18,98 GiB frei. Private Schlüssel, Suchinventar und Sicherungsarchive bleiben außerhalb von Git.
