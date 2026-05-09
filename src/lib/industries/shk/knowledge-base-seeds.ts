export interface ShkKnowledgeBaseSeed {
  title: string;
  category: "Notdienst" | "Heizung" | "Sanitär" | "Klima/Lüftung" | "Förderungen" | "Allgemein";
  content: string;
}

export const shkKnowledgeBaseSeeds: ShkKnowledgeBaseSeed[] = [
  {
    title: "Wasserrohrbruch",
    category: "Notdienst",
    content:
      "Q: Was tun bei Wasserrohrbruch?\nA: 1. Hauptwasserhahn zudrehen (meist im Keller). 2. Strom in betroffenen Räumen abschalten. 3. Sofort unseren Notdienst rufen oder die hinterlegte Bereitschaftsnummer wählen. 4. Foto vom Schaden machen für die Versicherung. Wir kommen schnellstmöglich.",
  },
  {
    title: "Gas-Geruch",
    category: "Notdienst",
    content:
      "Q: Was tun bei Gas-Geruch?\nA: Sicherheit zuerst: keine elektrischen Schalter betätigen, kein Licht anschalten, Handy nicht in der Wohnung benutzen, keine offene Flamme. Fenster und Türen öffnen, alle Personen aus dem Gebäude bringen. Gas-Notruf 0800 280 33 22 wählen. Bei akuter Lebensgefahr 112. Nicht selbst Reparaturen versuchen.",
  },
  {
    title: "Heizungsausfall im Winter",
    category: "Notdienst",
    content:
      "Q: Heizung fällt im Winter aus, was tun?\nA: Bei Komplettausfall in der Heizsaison ist das ein Notdienst-Fall. Bitte Notdienst-Hotline anrufen. Vorab Frostschutz: Wasser in Heizkörpern nicht ablassen, Räume nicht zu stark auskühlen lassen, Türen zu unbeheizten Räumen schließen. Bei Smart-Thermostaten App und Stromversorgung prüfen.",
  },
  {
    title: "Verstopfte Leitung",
    category: "Notdienst",
    content:
      "Q: Was tun bei verstopfter Abflussleitung?\nA: Bei Rückstau aus Toilette oder Bad zuerst Wasserzulauf reduzieren. Keine ätzenden Rohrreiniger im Übermaß. Bei Rückfluss von Schmutzwasser oder Geruch aus mehreren Abflüssen ist meist die Hauptleitung betroffen — bitte Notdienst kontaktieren.",
  },
  {
    title: "Notdienst-Aufschlag",
    category: "Notdienst",
    content:
      "Q: Wie hoch ist der Notdienst-Aufschlag außerhalb der Öffnungszeiten?\nA: Notdienst-Einsätze außerhalb der regulären Öffnungszeiten haben einen Zuschlag, der je nach Tageszeit, Wochentag und Anfahrt variiert. Die genaue Höhe wird vor Anfahrt mitgeteilt. Bei akuten Sicherheitsrisiken (Gas, Wasser) hat schnelle Hilfe Vorrang vor Preisdiskussion.",
  },
  {
    title: "Heizungswartung Sinn",
    category: "Heizung",
    content:
      "Q: Wann ist Heizungswartung sinnvoll?\nA: Einmal jährlich, idealerweise im Sommer (vor der Heizsaison). Bei Gas- und Öl-Heizungen ist regelmäßige Wartung gesetzlich empfohlen (BImSchV) und für viele Garantien Voraussetzung. Wartung verlängert die Lebensdauer und senkt Heizkosten.",
  },
  {
    title: "Heizungswartung Kosten",
    category: "Heizung",
    content:
      "Q: Was kostet eine Heizungswartung?\nA: Eine Heizungswartung kostet je nach System und Anfahrt grob 120€ bis 220€. Wartungsverträge mit jährlicher Inspektion sind oft günstiger pro Jahr und beinhalten teilweise Notdienst-Vorrang. Genaue Kosten nennen wir nach Klärung des Heizungstyps.",
  },
  {
    title: "Wärmepumpe Kosten",
    category: "Heizung",
    content:
      "Q: Wie viel kostet eine neue Wärmepumpe?\nA: Eine Wärmepumpe kostet je nach Größe, Typ (Luft-Wasser, Sole-Wasser, Wasser-Wasser) und Aufwand zwischen 15.000€ und 35.000€ inklusive Installation. Mit BAFA-Förderung können effektive Kosten oft bei 8.000-15.000€ liegen. Verbindliche Angabe nur nach Vor-Ort-Termin.",
  },
  {
    title: "Heizungstausch Beratung",
    category: "Heizung",
    content:
      "Q: Wann sollte ich meine Heizung tauschen?\nA: Heizungen über 20 Jahre arbeiten oft ineffizient. Außerdem gibt es seit 2024 eine schrittweise Austauschpflicht für sehr alte Konstanttemperatur-Kessel (Details geregelt durch GEG/BEG, regulatorisch sensibel — bitte Energieberater oder Hersteller-Information prüfen). Beratungstermin sinnvoll bei System älter als 15 Jahre.",
  },
  {
    title: "Heizkosten optimieren",
    category: "Heizung",
    content:
      "Q: Wie kann ich meine Heizkosten senken?\nA: Häufige Stellschrauben: hydraulischer Abgleich der Heizungsanlage, moderne Thermostate (programmierbar), Dämmung der Heizungsrohre im Keller, regelmäßige Wartung, Vorlauftemperatur korrekt eingestellt. Eine Sichtprüfung zeigt schnell, wo Einsparpotential liegt.",
  },
  {
    title: "Sanitär Reparaturen",
    category: "Sanitär",
    content:
      "Q: Welche Sanitär-Reparaturen führen Sie durch?\nA: Tropfende Wasserhähne, defekte Spülkästen, undichte Siphons, verstopfte Abflüsse, Boiler-Probleme, defekte Duschköpfe, Wasserdruck-Probleme, Reparatur und Tausch von Sanitärkeramik. Akute Wasserschäden gehen in den Notdienst.",
  },
  {
    title: "Bad-Renovierung Dauer",
    category: "Sanitär",
    content:
      "Q: Wie lange dauert eine Bad-Renovierung?\nA: Eine komplette Bad-Renovierung (Demontage, Fliesen, Sanitär, Elektrik, Maler) dauert typischerweise 2 bis 4 Wochen je nach Größe und Umfang. Während der Bauphase ist das Bad nicht nutzbar; bei Bedarf besprechen wir Alternativen.",
  },
  {
    title: "Wasserschaden",
    category: "Sanitär",
    content:
      "Q: Wer übernimmt Wasserschäden?\nA: Wasserschäden sind in der Regel über Gebäude- oder Hausratversicherung gedeckt, je nach Ursache. Bitte Schadensfotos machen, Versicherung melden, und bei aktuem Wasseraustritt Hauptwasserhahn schließen und Notdienst rufen. Wir helfen mit Reparatur und Trocknung.",
  },
  {
    title: "Wasserdruck zu niedrig",
    category: "Sanitär",
    content:
      "Q: Mein Wasserdruck ist zu niedrig, woran liegt das?\nA: Ursachen reichen von verkalkten Perlatoren über defekte Druckregler bis zu Problemen am Hausanschluss. Erste Selbsthilfe: Perlator am Wasserhahn entkalken, anderen Wasserhahn testen. Wenn überall niedrig: Hausanschluss prüfen lassen.",
  },
  {
    title: "Klimaanlage Wartung",
    category: "Klima/Lüftung",
    content:
      "Q: Wie oft sollte eine Klimaanlage gewartet werden?\nA: Klimaanlagen sollten jährlich gewartet werden — Filter reinigen oder tauschen, Kältemittel-Druck prüfen, Verdampfer und Verflüssiger reinigen. Bei Splitgeräten ab bestimmten Kältemittelmengen ist Dichtheitsprüfung gesetzlich vorgeschrieben.",
  },
  {
    title: "Klimaanlage Installation",
    category: "Klima/Lüftung",
    content:
      "Q: Was kostet eine Klimaanlage?\nA: Ein Splitgerät kostet je nach Hersteller, Leistung und Installationsaufwand grob 1.800€ bis 4.500€ pro Innengerät. Mehrräume-Anlagen liegen höher. Genauer Preis nach Sichttermin (Wandbeschaffenheit, Leitungsweg, Außengerät-Position).",
  },
  {
    title: "Lüftungsanlage",
    category: "Klima/Lüftung",
    content:
      "Q: Brauche ich eine kontrollierte Wohnraumlüftung?\nA: Bei Neubauten und energetischer Sanierung empfehlenswert, da moderne dichte Gebäude sonst Schimmelrisiko haben. Eine Lüftungsanlage mit Wärmerückgewinnung kann Energie sparen und Komfort steigern. Beratung im Sichttermin.",
  },
  {
    title: "Klimaanlage Sommer",
    category: "Klima/Lüftung",
    content:
      "Q: Wann sollte ich eine Klimaanlage einbauen lassen?\nA: Idealerweise im Frühjahr (März-Mai), da im Hochsommer die Wartezeiten oft mehrere Wochen betragen. Bei Wärmepumpen-Klimaanlagen kann gleichzeitig Heiz-Funktion mit installiert werden, was Kosten und Aufwand spart.",
  },
  {
    title: "BAFA Heizung Förderung",
    category: "Förderungen",
    content:
      "Q: Welche Förderung gibt es für eine neue Wärmepumpe?\nA: Das BAFA fördert klimafreundliche Heizungen über die Bundesförderung für effiziente Gebäude (BEG). Förderhöhen ändern sich regelmäßig — verbindliche Auskunft nur über BAFA-Webseite oder zertifizierten Energieberater. Wichtig: Antrag vor Auftragserteilung stellen.",
  },
  {
    title: "KfW Sanierung",
    category: "Förderungen",
    content:
      "Q: Wie funktioniert die KfW-Sanierungsförderung?\nA: Die KfW vergibt zinsgünstige Kredite und Tilgungszuschüsse für energetische Sanierungen. Voraussetzung ist meist die Einbindung eines Energie-Effizienz-Experten (Energieberater). Programme und Konditionen ändern sich; aktuelle Angaben über kfw.de oder Energieberater.",
  },
  {
    title: "Steuer-Bonus Sanierung",
    category: "Förderungen",
    content:
      "Q: Kann ich Sanierungskosten von der Steuer absetzen?\nA: Für selbstgenutztes Wohneigentum gibt es einen Steuer-Bonus für energetische Maßnahmen über mehrere Jahre verteilt. Voraussetzungen wie Gebäudealter, Maßnahmenliste und Bescheinigung durch Fachunternehmen sind zu beachten. Beratung durch Steuerberater empfohlen.",
  },
  {
    title: "Förderantrag Reihenfolge",
    category: "Förderungen",
    content:
      "Q: Muss der Förderantrag vor dem Auftrag gestellt werden?\nA: Ja — bei den meisten Programmen (BAFA, KfW) muss der Antrag vor Auftragserteilung gestellt sein, sonst entfällt die Förderung. Bitte vor Vertragsunterzeichnung prüfen lassen. Wir helfen mit Energieberater-Empfehlung.",
  },
  {
    title: "Energieberater nötig",
    category: "Förderungen",
    content:
      "Q: Brauche ich einen Energieberater für die Förderung?\nA: Für viele BEG-Programme ist die Einbindung eines zertifizierten Energie-Effizienz-Experten (Energieberater) Pflicht. Wir empfehlen gerne lokale Berater oder können den Erstkontakt herstellen. Diese Beratung wird teilweise selbst gefördert.",
  },
  {
    title: "Anfahrt und Servicegebiet",
    category: "Allgemein",
    content:
      "Q: In welchem Gebiet sind Sie tätig?\nA: Unser Servicegebiet wird im Profil des Betriebs hinterlegt (typischerweise im Umkreis von 30-50 km). Anfahrtszeit fließt in den Termin ein und wird transparent angesagt. Bei größerer Entfernung kann Anfahrtszuschlag anfallen.",
  },
  {
    title: "Zahlungsbedingungen",
    category: "Allgemein",
    content:
      "Q: Wie kann ich bezahlen?\nA: Wir akzeptieren Banküberweisung nach Rechnung und (je nach Betrieb) auch Bar- oder Kartenzahlung vor Ort. Bei größeren Aufträgen mit längerer Bauzeit sind Teilrechnungen üblich. Genaue Zahlungsbedingungen stehen im Angebot.",
  },
  {
    title: "Garantie und Gewährleistung",
    category: "Allgemein",
    content:
      "Q: Wie lange ist die Garantie auf Ihre Arbeit?\nA: Auf Werkleistung gilt die gesetzliche Gewährleistung von 2 Jahren bei Verbrauchern (5 Jahre bei Bauleistungen am Bauwerk). Auf Material gilt zusätzlich die Hersteller-Garantie. Bei Fragen zu konkreten Geräten gerne nachfragen.",
  },
  {
    title: "Öffnungszeiten",
    category: "Allgemein",
    content:
      "Q: Wann sind Sie erreichbar?\nA: Die regulären Öffnungs- und Bürozeiten werden im Profil hinterlegt und in Auto-Antworten verwendet. Außerhalb der Bürozeiten erreichen Sie für echte Notfälle (Wasser, Gas, Heizungsausfall im Winter) den Bereitschaftsdienst.",
  },
  {
    title: "Terminabsage",
    category: "Allgemein",
    content:
      "Q: Wie kann ich einen Termin absagen?\nA: Bitte mindestens 24 Stunden vorher absagen oder verschieben — bei Notdienst-Terminen so früh wie möglich. Kurzfristige Absagen aus terminlichen Gründen sind in der Regel kostenfrei; bei vorbereiteter Anfahrt mit Material kann ein anteiliger Aufwand entstehen.",
  },
];

export const shkKnowledgeBaseSeedCount = shkKnowledgeBaseSeeds.length;
