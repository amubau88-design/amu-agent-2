# Manuelle Wiederherstellung und getrennte Sicherung

Die Dashboard-Wiederherstellung prüft ein verschlüsseltes Archiv einschließlich SQLite-Integrität und legt eine **isolierte Prüfkopie** an. Sie aktiviert keine alten Datenbanken. Aktuelle Client-Widerrufe, Anfrageidentitäten und neue Nutzdaten dürfen nicht durch einen älteren Stand ersetzt werden.

## Sicherung auf einem getrennten Medium

Für normale Bedienung: Im Dashboard eine Sicherung erstellen, „Integrität und Passwort prüfen“ ausführen und das verschlüsselte Paket herunterladen. Im Speichern-Dialog ein angeschlossenes Sicherungsmedium wählen. Den Wiederherstellungsschlüssel beziehungsweise das Passwort unabhängig davon geschützt aufbewahren. Ein auf derselben Systemplatte gespeichertes Archiv schützt nicht vor deren Ausfall.

Für eine durchgehend SHA-256-geprüfte Kopie steht ein lokaler Helfer bereit:

```powershell
# Vorher im Dashboard verifizieren; das Zielverzeichnis muss bereits bestehen.
npm run backup:export -- <Sicherungs-ID> 'E:\AMU-Sicherungen'
```

Das Werkzeug überträgt ausschließlich das verschlüsselte Paket und seine Metadaten in ein neues, eindeutig benanntes Unterverzeichnis. Es prüft den beim Entschlüsseln verifizierten Ciphertext-Hash erneut, synchronisiert die Datei vor der Veröffentlichung und überschreibt keine frühere Kopie. Fehlgeschlagene Übertragungen bleiben als `.partial` erkennbar. Der lokale Wiederherstellungsschlüssel wird **nicht** mitkopiert. Zielpfade über symbolische Links werden abgewiesen. Ein externer Datenträger wurde in Sitzung 7 nicht bereitgestellt; der Zielpfad und Fehlerfälle wurden ausschließlich im Projekt-Testverzeichnis geprüft. Ein echtes Medium benötigt zusätzlich einen eigenen Rücklese-/Importtest.

## Kontrollierter Programm-Rollback

Dieses Verfahren stellt ausschließlich `src`, `scripts`, `docs` und `README.md` aus einer authentifizierten Prüfkopie wieder her. **`scratch`, Datenbanken, API-Schlüssel, Widerrufe, Modelle, `node_modules`, Paketdateien und Git bleiben aktuell.** Ein Datenbank-Rollback oder eine Versionsmigration gehört nicht zu diesem Werkzeug.

Zulässig sind nur Patchstände derselben Haupt-/Nebenversion mit gleichem Abhängigkeitsvertrag, Lockfile-Inhalt (abgesehen von der Projektversion), Compilerprofil und Journal-Schema 1. Unvereinbare Stände werden abgewiesen. Die Paketversion bleibt dabei erhalten; die konkrete Quell-Prüfkopie steht im Rollback-Plan. Nach einem erfolgreichen Rollback die Änderung und den Quellstand prüfen und gesondert in Git sichern.

1. Arbeit beenden. Einen **aktuellen**, vollständigen verschlüsselten Wiederherstellungspunkt erstellen und prüfen. Auch die ursprünglichen Modellarchive behalten.
2. Gewünschtes älteres Vollarchiv im Dashboard prüfen und „In separates Prüfverzeichnis wiederherstellen“ wählen. Verzeichnis-ID notieren. Eine vorbereitete Konfigurationssicherung genügt nicht.
3. Gateway und Supervisor stoppen, gegebenenfalls auch den eigenen Remote-Worker-Supervisor. Während der Wartung keine automatische/neue manuelle Instanz starten und keine neue Benutzeranmeldung auslösen, die den bestehenden AtLogOn-Start ausführt. Der Helfer prüft bekannte Prozess-IDs und den API-Port. Andere Programme bleiben unberührt.

```powershell
powershell -NoProfile -File scripts/windows-autostart.ps1 -Action Stop
node scripts/manual-rollback.mjs prepare 'scratch/restores/<Prüfkopie-ID>'
```

4. Die Ausgabe prüfen: Quell-Prüfkopie, `scope: program-code-only`, neue Vorgangs-ID und `confirmationHash`. Der Plan liegt unter `scratch/rollback/<Vorgangs-ID>/plan.json`. Anschließend ausdrücklich anwenden:

```powershell
node scripts/manual-rollback.mjs apply <Vorgangs-ID> <confirmationHash>
```

Der Helfer verlangt den unveränderten Vorschau-Hash, prüft den aktuellen und vorbereiteten Code erneut und erhält jeden ersetzten Originalordner. Ein exklusiver Prozessschutz verhindert konkurrierende Befehle. Ein dauerhaftes Wartungskennzeichen blockiert den aktuellen Gateway-/Supervisorstart bei unvollständiger Übernahme. Die einzelnen Schritte werden synchronisiert protokolliert. Der Vorgang ist über mehrere Ordner hinweg nicht atomar; bei Unterbrechung bleibt der Dienst absichtlich gestoppt.

5. Im gestoppten Zustand `npm run build` ausführen. Nur bei Erfolg den Dienst wieder über den bisherigen Startweg starten und `/ready` sowie eine kurze Client-Anfrage prüfen. Keine automatischen Generierungswiederholungen aktivieren.

## Rücknahme oder Unterbrechung

Eine Rücknahme benötigt ebenfalls die Vorgangs-ID und den geprüften Bestätigungshash. Das Werkzeug prüft die erhaltenen Originale vor der Rückübernahme. Es überschreibt keine nachträglich veränderten erfolgreichen Rollbacks ungeprüft.

```powershell
# Funktioniert auch dann, wenn der ältere scripts/-Ordner den Helfer noch nicht enthält:
node 'scratch/rollback/<Vorgangs-ID>/undo.mjs' <confirmationHash>
```

Der erhaltene Helfer liegt außerhalb der ersetzten Programmordner. Die Rücknahme erhält auch den ersetzten Kandidatencode zur Untersuchung. Erst nach erfolgreicher Integritätsprüfung wird die Startsperre aufgehoben. Bei einer Integritätsabweichung den Dienst gestoppt lassen, den Vorgangsordner erhalten und Ursache prüfen; keine Sperrdateien blind löschen. Vorhandene Paket-/Datenbankmigrationen erfordern eine gesonderte Wiederherstellungsplanung.

Sitzung 7 prüfte erfolgreiche Übernahme und Rücknahme, veränderte Vorschau, veränderten Plan, beschädigte Originalkopie, inkompatible Abhängigkeiten und einen unterbrochenen Ordnerwechsel **nur in isolierten Fixtures**. Es wurde kein produktiver Rollback ausgeführt, kein echter Stromausfall simuliert und kein altes Produktivdatum aktiviert.
