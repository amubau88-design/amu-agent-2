# Sitzung 20 – Hardware und Betriebssystem (27.10.2026)

## Tatsächlich gelesen

CIM-/Storage-Inventar wurde ausschließlich lesend erhoben; keine Benchmarks, BIOS-, Treiber- oder Windows-Änderungen. Rohbelege liegen lokal unter `scratch/session20-hardware.json`, `session20-storage.json`, `session20-environment.json` und `session20-security-sandbox.json`. Seriennummern, Lizenzschlüssel und Passwörter werden nicht protokolliert. Wiederholbare Hardwareabfrage: `npm run hardware:inventory` (je nach Windows-Rechten mit freigegebenem erhöhtem Zugriff).

| Bauteil | Feststellung | Grenze der Aussage |
|---|---|---|
| Rechner | FUJITSU CELSIUS W520 POWER | Aktuell eingebautes Netzteil dadurch nicht nachgewiesen |
| Hauptplatine | D3167-A1; SMBIOS S26361-D3167-A1 | Aufgedruckte PCB-Revision ungeprüft |
| BIOS | V4.6.5.3 R1.20.0, 17.07.2013 | Kein Update durchgeführt; GPU-UEFI-Kompatibilität ungeprüft |
| CPU | Xeon E3-1230 v2, 4 Kerne / 8 Threads, 3,3 GHz | AVX, kein AVX2; heutige große Modelle bleiben CPU-begrenzt |
| RAM | 24 GiB, DDR3-1600, alle vier Steckplätze belegt | Keine freien DIMM-Steckplätze |
| DIMMs | Zweimal Samsung M378B5173QH0-CK0 4 GiB; zweimal Hynix HMT41GU6BFR8A-PB 8 GiB | 64/64 Bit: aktuell Non-ECC, keine ECC-Korrektur nachgewiesen |
| RAM-Grenze | SMBIOS 32 GiB; Herstellerplattform vier DIMMs | CPU kann ECC, vorhandene Bestückung ist Non-ECC; kein RDIMM oder ECC-Mix |
| GPU | GeForce 605; Treiber meldet 1 GiB; Treiber 23.21.13.8813 von 2017 | Keine unabhängige NVML-VRAM-Prüfung; kein geeigneter großer KI-Beschleuniger |
| PCIe | SMBIOS primär x16, sekundär x4 mit mechanischem x16-Stecker; drei x1, zwei PCI | Keine Messung der aktiven Linkgeneration; frei/belegt und tatsächliche Kartenfreiheit nicht gesichert |
| Netzteil / Gehäuse | Modell, Wattzahl, native 6/8-Pin-Anschlüsse und freier Kartenplatz ausdrücklich unbekannt | Vom Eigentümer bestätigt: keine vollständig kompatible GPU-Kaufempfehlung möglich |

Intel nennt 32 GB DDR3-1333/1600, zwei Speicherkanäle, 69 W TDP und PCIe 3.0 für diese CPU. Das beweist weder das aktuelle Netzteilbudget noch die tatsächlich verdrahteten Slots. Herstellerarchiv: [Intel CPU-Spezifikation](https://www.intel.com/content/www/us/en/products/sku/65732/intel-xeon-processor-e31230-v2-8m-cache-3-30-ghz/specifications.html), [Fujitsu W520-Datenblatt](https://sp.ts.fujitsu.com/dmsp/publications/public/ds-celsius-w520.pdf). Das Fujitsu-PDF war nur über den Suchindex verfügbar, direkter Abruf gesperrt; deshalb keine Behauptung einer vollständigen Handbuchprüfung.

## Bedingte, kostenbewusste Optionen – kein Kauf und keine Installation

Der Eigentümer möchte derzeit keine neue Hardware kaufen. Die folgenden Angaben dienen einer späteren Entscheidung, nicht als Kaufauftrag.

**RAM:** Für 32 GiB müssten die beiden 4-GiB-Module durch zwei passende 8-GiB-Non-ECC-UDIMMs ersetzt werden. Die vorhandenen zwei 8-GiB-Module bleiben. Gesucht: DDR3-1600, unbuffered, 240 Pin, JEDEC; Spannungs- und Boardfreigabe des genauen Artikels prüfen. Beispiel dieser Bauart: [Kingston KVR16N11/8, 8 GB, 1,5 V](https://www.kingston.com/datasheets/KVR16N11_8.pdf). Keine DDR4-, Registered- oder beliebige ECC-Bestückung. Mehr RAM erleichtert Kontext und Teil-Offload, erhöht aber nicht automatisch CPU-Inferenzgeschwindigkeit.

Beobachtete gebrauchte Angebotspreise für 2 × 8 GB lagen ungefähr bei 25–40 Euro; keine verbindlichen Angebote oder Kompatibilitätszusage: [Marktplatzsuche DDR3-1600](https://www.kleinanzeigen.de/s-multimedia-elektronik/2x8gb-ram-ddr3-1600/k0c161).

**GPU:** Eine gebrauchte RTX 3060 **12 GB** wäre eine spätere Preis-/VRAM-Option (beobachtete Angebotspreise ungefähr 250–300 Euro). Gegenwärtig ausdrücklich **nicht als kompatibel abgenommen**. Beispiel Palit Dual: 170 W, ein nativer 8-Pin-Stecker, 245 × 119 × 40 mm, zwei Slots; Hersteller empfiehlt 550-W-Netzteil. Andere RTX-3060-Ausführungen unterscheiden sich in Größe, Anschlüssen und Netzteilvorgaben. Vor jeder Auswahl: Netzteiletikett, freie Leistung, native Stecker, Kartenfreiheit, Luftstrom und BIOS-/UEFI-Verträglichkeit prüfen. Keine Stromadapterlösung freigegeben. Quellen: [Palit Dual 12 GB](https://www.palit.com/palit/vgapro.php?id=4089&lang=en&pn=NE63060019K9-190AD&tab=sp), [aktuelle gebrauchte Angebote](https://www.kleinanzeigen.de/s-grafikkarte-3060-12-gb/k0).

12 GB reichen nicht für vollständiges Laden eines etwa 18-GB-30B-Quant-Modells plus Kontext. Die AMU-Konfiguration verwendet gegenwärtig CPU-Inferenz; GPU-Nutzung bräuchte später passende Treiber, Backendkonfiguration und echte Abnahme. Keine größeren Modelle heruntergeladen. Ohne bestätigte Strom-/Platzdaten ist keine GPU-Bestellung sinnvoll.

## Windows und Sicherheitslage

Registry: Windows 10 Pro 22H2, **19045.6466**. InstalledOn-Daten einzelner Hotfixes aus 2026 beweisen keinen aktuellen kumulativen Patchstand. Microsoft ordnet Build 19045.6466 dem 11.11.2025 zu; die ESU-Tabelle nennt für 13.10.2026 Build 19045.7807. Das vorhandene System liegt darunter. Regulärer Windows-10-Support endete am 14.10.2025. Quellen: [Microsoft Build-Tabelle](https://learn.microsoft.com/en-us/windows/release-health/release-information), [Supportende](https://support.microsoft.com/en-us/windows/deployment/updates-lifecycle/windows-10-support-has-ended-on-october-14-2025).

Defender meldet Echtzeitschutz aktiv und aktuelle Signaturen (1.461.211.0, 26.10.2026); das ersetzt keine Betriebssystemupdates. ESU-Berechtigung/Aktivierung ist nicht bestätigt: die lokale Lizenzabfrage war nicht verfügbar. Ein ESU-Vorbereitungspaket beweist keine Aktivierung. Secure Boot und TPM wurden nicht bestätigt; daraus wird keine Aktivierung oder Abwesenheit abgeleitet. Kein Online-Update-Scan und keine Änderung ausgeführt. Vor produktiver LAN-Freigabe ist eine eigene Entscheidung zu unterstütztem, aktuell gepatchtem Windows erforderlich; Anmeldung, Aktivierung, Updates oder Neustart nur separat freigeben. [Microsoft ESU-Information](https://www.microsoft.com/en-us/windows/end-of-support).
