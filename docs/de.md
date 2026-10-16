# Tempest

Bringt deine **WeatherFlow-Tempest**-Wetterstationen in Gladys: Temperatur,
Luftfeuchtigkeit, Luftdruck, Wind, Regen, Blitze, UV, Sonneneinstrahlung und
die eigene Vorhersage der Station, in Echtzeit.

> Entwickelt ohne die Hardware: Diese Integration folgt der offiziellen
> Dokumentation der Tempest-API und echten API-Antworten, die andere Projekte
> veröffentlicht haben, wurde aber noch nicht an einer echten Station
> ausprobiert. Rückmeldungen sind im GitHub-Repository willkommen.

Diese Integration steht in keiner Verbindung zu WeatherFlow-Tempest, Inc.

## Überblick

Die Integration verbindet sich mit deinem persönlichen Zugriffstoken mit der
**Tempest-Cloud**, genau wie die Tempest-App:

- ein Gladys-Gerät pro Station deines Kontos;
- ein **Live-Datenstrom** (WebSocket): eine Beobachtung pro Minute, der Wind
  alle 3 Sekunden, Regen und Blitze im Moment ihrer Erkennung;
- die **Vorhersage der Station** („better forecast“ der Tempest-API) für
  heute, morgen und die nächsten Tage;
- zwei Szenen-Auslöser, eine Szenen-Aktion und ein Dashboard-Widget.

Alles ist schreibgeschützt: Die Integration ändert nie etwas an deinem
Tempest-Konto.

## Voraussetzungen

- Gladys 5.1 oder neuer.
- Eine Tempest-Station (der All-in-one-Sensor, `ST`), eingerichtet in der
  Tempest-App. Ältere WeatherFlow-Sensoren AIR und SKY werden nicht
  unterstützt.
- Internetzugang von Gladys aus: Die Daten kommen aus der Tempest-Cloud.
- Ein **persönlicher Zugriffstoken**: Melde dich in der Tempest-Web-App
  (tempestwx.com) an, öffne **Settings → Data Authorizations** und dann
  **Create Token**. Kopiere den Token.

Die Tempest sendet ihre Daten auch im lokalen Netzwerk (UDP), aber
Gladys-Integrationen laufen in einem isolierten Container, der keine lokalen
Broadcasts empfängt: Diese Integration nutzt daher nur die Cloud.

## Konfiguration

1. Installiere die Integration: **Integrationen → Von GitHub installieren**
   oder aus dem Store.
2. Füge im Tab **Konfiguration** deinen **persönlichen Zugriffstoken** ein und
   speichere.
3. Optionale Einstellungen:
   - **Sprache der Texte** (standardmäßig Französisch): die Namen der
     Funktionen künftig hinzugefügter Stationen, die Niederschlagsart, die
     Vorhersagetexte und die Szenen-Sätze;
   - **Momentanwind alle 3 Sekunden** (standardmäßig an): siehe unten.
4. Klicke auf **Meine Stationen auflisten**, um den Token zu prüfen: Der
   Button listet die Stationen deines Kontos auf und sagt, welche hinzugefügt
   werden können.
5. Öffne den Tab **Erkennung** und füge deine Station hinzu.

Der Status oben im Konfigurationsbildschirm zeigt an, wenn der Token
abgelehnt wird oder der Tempest-Dienst nicht erreichbar ist.

## Das Stationsgerät

Jede Station bringt diese Funktionen mit (schreibgeschützt):

| Funktion                                    | Einheit          | Quelle                 |
| ------------------------------------------- | ---------------- | ---------------------- |
| Temperatur, gefühlte Temperatur, Taupunkt   | °C               | jede Minute            |
| Luftfeuchtigkeit                            | %                | jede Minute            |
| Luftdruck (Station), Luftdruck (Meereshöhe) | hPa              | jede Minute            |
| Mittlerer Wind, Windböen                    | km/h             | jede Minute            |
| Windrichtung                                | Grad             | jede Minute            |
| Momentanwind (3 s)                          | km/h             | alle 3 s, ohne Verlauf |
| Regenintensität                             | mm/h             | jede Minute            |
| Regen heute                                 | mm               | jede Minute            |
| Es regnet                                   | ja/nein          | jede Minute            |
| Niederschlagsart                            | Text             | keiner, Regen, Hagel   |
| Blitze (letzte Stunde)                      | Anzahl           | jede Minute            |
| Entfernung des letzten Blitzes              | km               | bei jedem Blitz        |
| UV-Index, Sonneneinstrahlung, Helligkeit    | Index, W/m², Lux | jede Minute            |
| Batteriespannung                            | V                | jede Minute            |
| Vorhersage heute / morgen                   | Text             | alle 30 Minuten        |
| Tiefst- und Höchstwert heute / morgen       | °C               | alle 30 Minuten        |
| Regenwahrscheinlichkeit heute / morgen      | %                | alle 30 Minuten        |

Gladys rechnet Temperaturen und Geschwindigkeiten in deine bevorzugten
Einheiten um. Die Batterie ist die Spannung des Superkondensators der Tempest
(etwa 2,4 bis 2,8 V; unter 2,45 V spart die Station Energie), kein
Prozentwert. Der Luftdruck auf Meereshöhe wird aus dem Stationsluftdruck und
der Höhe der Station berechnet, mit der Formel der Tempest-Dokumentation.

## Widget

Füge das Widget **Tempest-Station** zu einem Dashboard hinzu und wähle eine
Station:

- fünf Live-Kacheln: Temperatur, Feuchtigkeit, Wind, Regen heute, Luftdruck;
- eine Statusliste: aktuelle Wetterlage, Windrichtung und Böen,
  Luftdrucktendenz, Niederschlag, letzter Blitz (Entfernung und Zeit),
  UV-Index;
- die Vorhersage der nächsten Tage oder der nächsten Stunden
  (Widget-Einstellung).

## Szenen-Auslöser

Im Szenen-Editor, Kategorie **Integrationen**:

- **Es beginnt zu regnen** — die Station erkennt Regen nach mindestens 30
  Minuten ohne. Löst einmal pro Regenepisode aus, dank des Regenbeginn-Ereignisses
  der Station innerhalb von Sekunden. Optionaler Filter: die Station.
  Variable: der Name der Station.
- **Blitz in der Nähe** — ein Blitz innerhalb der gewählten Entfernung (5,
  10, 15, 20, 30 oder 40 km), der erste seit 30 Minuten in dieser Entfernung.
  Kommt ein Gewitter näher, lösen die kürzeren Entfernungen nacheinander aus.
  Variablen: die Entfernung des Blitzes (km) und der Name der Station.

Nach einem Neustart der Integration lösen ein bereits fallender Regen oder
ein bereits bekannter Blitz die Auslöser nicht erneut aus.

## Szenen-Aktion

**Vorhersage-Zusammenfassung** — die Vorhersage einer Station für heute oder
morgen:

- `summary`: ein fertiger Satz, z. B. „Heute: Regen möglich, 4 bis 12 °C,
  60 % Regenwahrscheinlichkeit.“;
- `condition`, `temperature_min`, `temperature_max`,
  `precipitation_probability`: die Werte, für Bedingungen.

Der Satz folgt der Einstellung **Sprache der Texte**.

## Szenen-Beispiele

- **Die Markise bei Regenbeginn einfahren**: Auslöser „Es beginnt zu
  regnen“, Aktion „Markise schließen“.
- **Den Antennenverstärker vor einem Gewitter trennen**: Auslöser „Blitz in
  der Nähe“ innerhalb von 10 km, Aktion: Steckdose ausschalten und eine
  Nachricht mit der Entfernung des Blitzes senden.
- **Morgenbericht**: um 7:00 die Aktion „Vorhersage-Zusammenfassung“ (heute),
  dann die Ausgabe `summary` als Nachricht senden.
- **Bewässerung auslassen**: um 6:00 „Vorhersage-Zusammenfassung“; liegt die
  Regenwahrscheinlichkeit über 60 %, den Rasensprenger nicht starten. Die
  Funktion „Regen heute“ kann ihn auch nach einem Schauer stoppen.

## Aktualisierung und Datennutzung

- Der Live-Datenstrom hält eine einzige Verbindung zur Tempest-Cloud für alle
  deine Stationen; er verbindet sich selbst neu (1 Sekunde bis 5 Minuten
  zwischen den Versuchen) und wird neu geöffnet, wenn er 3 Minuten still
  bleibt.
- Solange der Live-Datenstrom ausfällt, wird jede hinzugefügte Station einmal
  pro Minute über die REST-API gelesen. Die Vorhersage wird alle 30 Minuten
  pro Station gelesen.
- WeatherFlow bittet Anwendungen, unter 100 REST-Anfragen pro Minute und
  Benutzer zu bleiben: Die Integration stellt höchstens etwa 3 pro Minute und
  Station.
- Nur die zu Gladys hinzugefügten Stationen werden verfolgt.
- Ein unveränderter Wert wird alle 6 Stunden erneut gesendet, damit nie
  „kein aktueller Wert“ angezeigt wird.
- Tempest-Daten sind für den persönlichen Gebrauch des Stationsbesitzers
  bestimmt (Tempest-Richtlinie für den Fernzugriff auf Daten).

## Fehlerbehebung

- **„Der Tempest-Zugriffstoken wurde abgelehnt“**: Der Token wurde gelöscht
  oder falsch kopiert. Erstelle einen neuen auf tempestwx.com und füge ihn
  erneut ein.
- **Keine Station in der Erkennung**: Klicke auf **Meine Stationen
  auflisten**. Eine Station ohne Tempest (nur AIR und SKY) kann nicht
  hinzugefügt werden.
- **Die Werte ändern sich nicht mehr**: Prüfe, ob Gladys Internetzugang hat,
  und sieh dir die Protokolle der Integration an (eine Zeile, wenn ein
  Problem beginnt, eine, wenn es endet; `LOG_LEVEL=debug` zeigt jede
  Nachricht).
- **Der Momentanwind schwankt zu stark**: Schalte **Momentanwind alle 3
  Sekunden** aus; die Funktion folgt dann dem Minutenmittel.

## Grenzen

- Entwickelt ohne die Hardware: Die Integration wurde noch nicht an einer
  echten Station ausprobiert.
- Nur Cloud: keine lokalen Daten (UDP), die vom Container der Integration aus
  nicht erreichbar sind.
- Nur Tempest-Stationen (`ST`): kein AIR oder SKY.
- Die Namen der Funktionen werden beim Hinzufügen der Station festgelegt: Eine
  spätere Sprachänderung gilt nur für danach hinzugefügte Stationen.
- Szenen-Filter vergleichen nur auf Gleichheit: Der Blitz-Auslöser bietet
  feste Entfernungen.
- Die Vorhersage ist die von Tempest, für den Standort der Station.
