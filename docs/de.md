# AhoyDTU

Verfolge deine **Hoymiles-Mikrowechselrichter** in Gladys über
[AhoyDTU](https://github.com/lumapu/ahoy), die freie Firmware für ESP8266-
und ESP32-Boards, die per Funk mit den Wechselrichtern spricht. Alles bleibt
in deinem lokalen Netz: keine Hoymiles-Cloud, kein Konto.

> **Ohne die Hardware entwickelt: Rückmeldungen willkommen.** Diese
> Integration wurde anhand des Quellcodes von AhoyDTU 0.8 geschrieben und
> gegen eine getreue Simulation ihrer API getestet, nicht gegen eine echte
> DTU. Wenn etwas nicht stimmt, sag es im Gladys-Forum oder in einem
> GitHub-Issue.

## Überblick

- Ein Gladys-Gerät pro in AhoyDTU eingerichtetem Wechselrichter (Serien HM,
  HMS, HMT).
- AC-Leistung live, Ertrag heute, Gesamtertrag, Netzspannung und Temperatur,
  dazu Leistung und Tagesertrag jedes Moduls.
- Eine Funktion „Erreichbar“ und ein Text „Zustand“, die die Nacht (der
  Wechselrichter schläft, das ist normal) von einem echten Ausfall
  unterscheiden.
- Zwei Szenen-Auslöser: ein Wechselrichter, der tagsüber nicht mehr
  antwortet, und die erste Produktion des Tages.
- Ein vorübergehendes Leistungslimit, als Aktion und als Szenen-Aktion,
  **standardmäßig aus**.
- Ein Dashboard-Widget „AhoyDTU“.

Du nutzt OpenDTU statt AhoyDTU? Installiere stattdessen die Integration
**Hoymiles (OpenDTU)** aus dem Store: Diese liest dieselben Wechselrichter über
OpenDTU.

## Voraussetzungen

- Eine AhoyDTU mit Firmware **0.8** (getestet gegen 0.8.155), im selben Netz
  wie Gladys, mit bereits eingerichteten Wechselrichtern (Settings >
  Inverter).
- Die IP-Adresse der DTU: auf ihrem Display, falls vorhanden, in deinem Router oder
  auf der Seite System der AhoyDTU. Eine feste Adresse (DHCP-Reservierung)
  wird empfohlen.
- Gladys 5.1 oder neuer.

Damit die Nacht genau erkannt wird, trag die Koordinaten deiner Anlage in
AhoyDTU ein (Settings > Sunrise & Sunset): AhoyDTU liefert dann die Zeiten von
Sonnenauf- und -untergang. Ohne sie funktioniert die Integration trotzdem und
richtet sich danach, wie der Wechselrichter verstummt ist (siehe „Nacht und
Tag“).

## Konfiguration

- **IP-Adresse**: die Adresse deiner AhoyDTU, z. B. `192.168.1.50`. Ein
  Hostname geht auch.
- **Admin-Passwort**: nur wenn AhoyDTU eines hat (System > Protection) und du
  das Leistungslimit nutzen willst. Zum Lesen der Werte ist keines nötig.
- **Aktualisierungsintervall**: 10, 15 (Standard), 30 oder 60 Sekunden.
  AhoyDTU fragt die Wechselrichter selbst standardmäßig alle 15 Sekunden ab:
  öfter lesen bringt nichts.
- **Leistungslimit erlauben**: standardmäßig aus. Solange es aus ist, wird an
  die Wechselrichter nie etwas gesendet.
- **Sprache der Texte**: Namen neuer Geräte und Funktionen, Zustandstexte und
  Meldungen der Aktionen. Standardmäßig Französisch.

Klicke dann auf **Verbindung testen**, öffne den Tab **Entdecken** und füge
deine Wechselrichter hinzu.

## Geräte

Jeder Wechselrichter wird ein Gerät mit seinem Namen aus AhoyDTU (oder
„Wechselrichter“ und seiner Seriennummer, wenn er keinen Namen hat). Seine
Funktionen:

| Funktion         | Einheit | Hinweise                                         |
| ---------------- | ------- | ------------------------------------------------ |
| Leistung         | W       | ins Haus eingespeiste AC-Leistung                |
| Ertrag heute     | kWh     | nach Mitternacht wieder 0                        |
| Gesamtertrag     | kWh     | Zählerstand, nie zurückgesetzt                   |
| Netzspannung     | V       |                                                  |
| Temperatur       | °C      | des Wechselrichters                              |
| Erreichbar       | 0/1     | 1, wenn der Wechselrichter per Funk antwortet    |
| Zustand          | Text    | produziert, wach, schläft (Nacht)…               |
| Leistung Modul N | W       | eine pro DC-Eingang, mit dem Modulnamen aus Ahoy |
| Ertrag Modul N   | kWh     | Tagesertrag, einer pro DC-Eingang                |

Die Namen werden beim Anlegen des Geräts festgelegt: Benenne sie in Gladys
um, wenn du willst.

## Nacht und Tag

Ein Hoymiles-Wechselrichter wird von seinen Modulen versorgt: In der
Dämmerung antwortet er nicht mehr, und AhoyDTU markiert ihn fünf Minuten
später als nicht verfügbar. Die Integration hält das nicht für einen Fehler:

- mit den Sonnenzeiten von AhoyDTU ist ein Wechselrichter, der nach
  Sonnenuntergang verstummt, **schlafend**;
- ohne sie ist ein Wechselrichter schlafend, dessen Leistung schon vor dem
  Verstummen auf 0 W gefallen war, während einer, der mitten in der
  Produktion ausfällt, **nicht antwortet**.

Nachts ist die Leistung 0 W, der Zustand zeigt „Schläft (Nacht)“ und der
Gesamtertrag behält seinen Wert. Der Ertrag heute geht nach Mitternacht auf
0 zurück, auch wenn der Wechselrichter noch schläft. Nachts liest die
Integration AhoyDTU einmal pro Intervall, ohne die Werte der schlafenden
Wechselrichter abzufragen.

## Widget

Das Widget **AhoyDTU** zeigt die Produktion jetzt und heute, eine Kurve über
24 Stunden und den Zustand jedes Wechselrichters (mit seinem Leistungslimit,
falls gesetzt). Mit nur einem Wechselrichter in Gladys folgen die Kacheln
seinen Funktionen live; mit mehreren zeigen sie die Summen. Die Kurve und die
Zeilen der Wechselrichter lassen sich in den Widget-Einstellungen
ausblenden.

## Szenen-Auslöser

- **Hoymiles-Wechselrichter antwortet nicht**: ein Wechselrichter antwortet
  tagsüber nicht mehr, oder die AhoyDTU selbst nicht mehr (Variable `cause`:
  `inverter` oder `dtu`). Nie nachts. Höchstens ein Ereignis alle 10 Minuten
  pro Wechselrichter.
- **Hoymiles-Produktion gestartet**: ein Wechselrichter produziert zum ersten
  Mal heute (Aufwachen am Morgen), einmal am Tag. Praktisch, um eine
  Waschmaschine mit Sonnenstrom zu starten.

Beide lassen sich auf einen Wechselrichter beschränken und geben seinen
Namen (`inverter`) an die Szene weiter. Für „Leistung über X W“ nimm den
normalen Geräte-Auslöser auf der Funktion Leistung: Er hat Schwelle und
Dauer.

## Leistungslimit

Verfügbar als Aktion der Integration (**Leistung begrenzen**) und als
Szenen-Aktion, sobald **Leistungslimit erlauben** aktiv ist. Wähle den
Wechselrichter und ein Limit von 2 bis 100 % seiner Nennleistung; 100 % hebt
das Limit auf.

Das Limit wird **nicht dauerhaft** gesendet: Es wird nicht in den Speicher
des Wechselrichters geschrieben und geht beim Neustart verloren, also jeden
Morgen. Es ist für Szenen gedacht (Nulleinspeisung bei negativem Preis zum
Beispiel), nicht als feste Einstellung. AhoyDTU lehnt es nachts ab, wenn der
Wechselrichter nicht antwortet.

## Szenen-Beispiele

- Wenn „Hoymiles-Wechselrichter antwortet nicht“ mit der Ursache `inverter`
  auslöst, eine Nachricht senden: Vielleicht ist eine Sicherung geflogen.
- Wenn „Hoymiles-Produktion gestartet“, die Spülmaschine starten.
- Wenn der Netzpreis negativ wird, die Leistung auf 2 % begrenzen; wieder auf
  100 % setzen, wenn er positiv wird.

## Fehlerbehebung

- **„AhoyDTU antwortet nicht“**: Prüfe die Adresse, ob das Board Strom hat
  und im selben Netz ist. Die Meldung nennt den Netzwerkfehler.
- **Kein Gerät in Entdecken**: Die Wechselrichter müssen in AhoyDTU
  eingerichtet sein (Settings > Inverter). Klicke auf **Verbindung testen**:
  Der Test sagt, wie viele Wechselrichter AhoyDTU verwaltet.
- **Jeden Abend „Antwortet nicht“**: Trag die Koordinaten in AhoyDTU ein,
  damit sie die Zeit des Sonnenuntergangs kennt.
- **„AhoyDTU hat das Passwort abgelehnt“** / **„mit einem Passwort
  geschützt“**: Gib das Admin-Passwort der AhoyDTU in der Konfiguration ein.
- **Das Limit wird nachts abgelehnt**: normal, der Wechselrichter schläft.
- Stell die Protokollstufe in Gladys auf debug, um jede Anfrage zu sehen.

## Grenzen

- Ohne die Hardware entwickelt, gegen eine Simulation der API von AhoyDTU
  0.8: Rückmeldungen willkommen.
- AhoyDTU 0.7 und älter sind nicht getestet. MQTT wird nicht genutzt: nur die
  REST-API.
- Nur das relative, nicht dauerhafte Limit wird angeboten; kein Ein/Aus, kein
  Neustart, kein dauerhaftes Limit (es nutzt den Speicher des
  Wechselrichters ab).
- Keine Funktionen für Frequenz, Strom oder Wirkungsgrad.
- Die Ertragswerte sind die des Wechselrichters: Diese können leicht von denen
  eines Zählers abweichen.

## Daten und Netzwerk

- Die Integration spricht nur mit der eingegebenen Adresse, über einfaches
  HTTP (das einzige Protokoll der AhoyDTU), in deinem lokalen Netz. Nichts
  verlässt dein Zuhause.
- Die Integration speichert in ihrem Volume `/data` die Liste der Wechselrichter
  (Seriennummern, Namen, Modulnamen), um sie nach einem Neustart
  wiederzufinden. Das Passwort bleibt in der Gladys-Konfiguration und wird nie
  in ein Protokoll geschrieben.
- Nicht verbunden mit Hoymiles oder dem Projekt AhoyDTU.
