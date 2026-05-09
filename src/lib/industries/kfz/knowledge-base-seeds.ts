export interface KfzKnowledgeBaseSeed {
  title: string;
  category: "Werkstatt-Info" | "Inspektionen" | "TÜV/HU" | "Reparaturen" | "Reifen" | "Versicherung & Gutachten";
  content: string;
}

export const kfzKnowledgeBaseSeeds: KfzKnowledgeBaseSeed[] = [
  {
    title: "Öffnungszeiten",
    category: "Werkstatt-Info",
    content: "Q: Was sind Ihre Öffnungszeiten?\nA: Die Werkstattzeiten werden im Kundenprofil hinterlegt. Für Pannen außerhalb der Öffnungszeiten bitte die Werkstatt-Hotline nutzen oder ADAC/Pannenhilfe kontaktieren.",
  },
  {
    title: "Anfahrt zur Werkstatt",
    category: "Werkstatt-Info",
    content: "Q: Wo befindet sich die Werkstatt?\nA: Die genaue Werkstatt-Adresse wird beim Onboarding hinterlegt und in Terminbestätigungen automatisch eingesetzt. Bitte planen Sie bei Erstterminen etwas Zeit für Annahme und Fahrzeugdaten ein.",
  },
  {
    title: "Pannenhilfe",
    category: "Werkstatt-Info",
    content: "Q: Was tun bei einer Panne?\nA: Fahrzeug sicher abstellen, Warnblinker einschalten, Warnweste anziehen, Warndreieck aufstellen und hinter die Leitplanke gehen. Danach Werkstatt-Hotline oder ADAC unter 22 22 22 kontaktieren. Bei Gefahr für Leib und Leben: 112.",
  },
  {
    title: "Ersatzwagen",
    category: "Werkstatt-Info",
    content: "Q: Gibt es einen Ersatzwagen?\nA: Je nach Verfügbarkeit kann ein Ersatzwagen oder eine Mobilitätslösung angeboten werden. Bitte bei der Terminbuchung angeben, ob Sie Ersatzmobilität benötigen.",
  },
  {
    title: "Fahrzeugabgabe außerhalb der Öffnungszeiten",
    category: "Werkstatt-Info",
    content: "Q: Kann ich mein Auto außerhalb der Öffnungszeiten abgeben?\nA: Manche Werkstätten bieten Schlüsselbriefkasten oder Nachtannahme an. Die konkrete Möglichkeit muss vom Werkstatt-Team bestätigt werden.",
  },
  {
    title: "Inspektion Umfang",
    category: "Inspektionen",
    content: "Q: Was wird bei einer Inspektion gemacht?\nA: Je nach Herstellerintervall werden Öl, Filter, Flüssigkeiten, Bremsen, Beleuchtung, Reifen, Fahrwerk und Fehlerspeicher geprüft. Der genaue Umfang hängt von Fahrzeug, Kilometerstand und Serviceplan ab.",
  },
  {
    title: "Kleine Inspektion",
    category: "Inspektionen",
    content: "Q: Was ist eine kleine Inspektion?\nA: Eine kleine Inspektion umfasst typischerweise Ölwechsel, Sichtprüfung, Flüssigkeitsstände, Beleuchtung, Reifen und Bremsencheck. Der Umfang variiert je nach Hersteller.",
  },
  {
    title: "Große Inspektion",
    category: "Inspektionen",
    content: "Q: Was ist eine große Inspektion?\nA: Eine große Inspektion ist umfangreicher und kann zusätzliche Filter, Zündkerzen, Getriebeöl, Bremsflüssigkeit oder weitere Prüfpunkte enthalten. Verbindlich ist der Hersteller-Serviceplan.",
  },
  {
    title: "Inspektion Kosten",
    category: "Inspektionen",
    content: "Q: Was kostet eine Inspektion?\nA: Die Kosten hängen von Fahrzeug, Motor, Teilen und Umfang ab. Grobe Spannen liegen oft zwischen 180€ und 600€, bei Premiumfahrzeugen oder Zusatzarbeiten höher. Ein finaler Preis ist erst nach Prüfung möglich.",
  },
  {
    title: "Serviceheft",
    category: "Inspektionen",
    content: "Q: Wird das Serviceheft gepflegt?\nA: Ja, die Werkstatt kann Wartungen im Serviceheft oder digitalen Service-Nachweis dokumentieren, sofern die Herstellerzugänge und Fahrzeugdaten verfügbar sind.",
  },
  {
    title: "HU/AU Kosten",
    category: "TÜV/HU",
    content: "Q: Wie viel kostet die TÜV-Hauptuntersuchung?\nA: Die HU/AU kostet je nach Fahrzeug und Prüforganisation meist zwischen 90€ und 140€. Bei der HU werden sicherheitsrelevante Komponenten geprüft. Die Plakette wird bei bestandener Prüfung vergeben.",
  },
  {
    title: "HU Fälligkeit",
    category: "TÜV/HU",
    content: "Q: Wann ist mein nächster TÜV fällig?\nA: Bei Neuwagen erstmals nach 36 Monaten, danach alle 24 Monate. Das genaue Datum steht auf der Plakette am Kennzeichen oder in den Fahrzeugpapieren.",
  },
  {
    title: "HU Prüfpunkte",
    category: "TÜV/HU",
    content: "Q: Was wird bei der HU geprüft?\nA: Geprüft werden unter anderem Bremsen, Lenkung, Fahrwerk, Beleuchtung, Reifen, Karosserie, Abgaswerte, Sicherheitsgurte und Pflichtausstattung.",
  },
  {
    title: "HU nicht bestanden",
    category: "TÜV/HU",
    content: "Q: Was passiert, wenn das Fahrzeug die HU nicht besteht?\nA: Mängel müssen behoben und das Fahrzeug zur Nachprüfung vorgestellt werden. Die Frist und Kosten hängen von Prüforganisation und Mangelumfang ab.",
  },
  {
    title: "HU Vorbereitung",
    category: "TÜV/HU",
    content: "Q: Kann die Werkstatt mein Auto für die HU vorbereiten?\nA: Ja, die Werkstatt kann vorab einen Check machen, typische Mängel identifizieren und Reparaturen vor der Prüfung abstimmen.",
  },
  {
    title: "Motorschaden während der Fahrt",
    category: "Reparaturen",
    content: "Q: Was tun bei Motorschaden während der Fahrt?\nA: Sofort sicher abstellen, Warnblinker an, Warnweste anziehen und Warndreieck aufstellen. Auf der Autobahn hinter die Leitplanke gehen. Pannenhilfe rufen: ADAC unter 22 22 22 oder Werkstatt-Hotline. Bei Lebensgefahr 112.",
  },
  {
    title: "Bremsen Warnung",
    category: "Reparaturen",
    content: "Q: Was tun, wenn die Bremsen quietschen oder eine Warnlampe leuchtet?\nA: Bei Bremsproblemen bitte nicht weiterfahren, wenn die Bremsleistung schwach ist, Geräusche stark sind oder eine rote Warnlampe leuchtet. Kontaktieren Sie Werkstatt oder Pannenhilfe.",
  },
  {
    title: "Motorkontrollleuchte",
    category: "Reparaturen",
    content: "Q: Was bedeutet die Motorkontrollleuchte?\nA: Eine gelbe Motorkontrollleuchte weist auf einen Fehler hin und sollte zeitnah ausgelesen werden. Blinkt die Leuchte oder läuft der Motor schlecht, bitte nicht weiterfahren und Pannenhilfe kontaktieren.",
  },
  {
    title: "Ölverlust",
    category: "Reparaturen",
    content: "Q: Was tun bei Ölverlust?\nA: Bei sichtbarem Ölverlust oder Öldruckwarnung nicht weiterfahren. Ölstand prüfen nur wenn sicher möglich, sonst Werkstatt oder Pannenhilfe kontaktieren.",
  },
  {
    title: "Reparaturdauer",
    category: "Reparaturen",
    content: "Q: Wie lange dauert eine Reparatur?\nA: Kleine Arbeiten dauern oft wenige Stunden, größere Reparaturen ein bis mehrere Tage. Dauer hängt von Diagnose, Teileverfügbarkeit und Auslastung ab.",
  },
  {
    title: "Reifenwechsel Dauer",
    category: "Reifen",
    content: "Q: Wie lange dauert ein Reifenwechsel?\nA: Ein normaler Räderwechsel dauert meist 30 bis 60 Minuten. Mit Einlagerung, Wuchten oder neuen Reifen kann es länger dauern.",
  },
  {
    title: "Reifenwechsel Saison",
    category: "Reifen",
    content: "Q: Wann sollte ich Sommer- oder Winterreifen wechseln?\nA: Als Faustregel gilt: Sommerreifen ab Frühjahr, Winterreifen ab Herbst. Viele Werkstätten planen Wechselkampagnen Anfang April und Anfang Oktober.",
  },
  {
    title: "Reifeneinlagerung",
    category: "Reifen",
    content: "Q: Kann ich Reifen einlagern lassen?\nA: Viele Werkstätten bieten Reifeneinlagerung inklusive Kontrolle von Profiltiefe und Zustand an. Verfügbarkeit und Preis werden vom Werkstatt-Team bestätigt.",
  },
  {
    title: "Reifenwechsel Kosten",
    category: "Reifen",
    content: "Q: Was kostet ein Reifenwechsel?\nA: Ein Räderwechsel kostet je nach Fahrzeug und Zusatzleistung häufig zwischen 30€ und 80€. Wuchten, neue Ventile, Reifendrucksensoren oder Einlagerung kosten zusätzlich.",
  },
  {
    title: "Mindestprofiltiefe",
    category: "Reifen",
    content: "Q: Welche Profiltiefe brauchen Reifen?\nA: Gesetzlich sind mindestens 1,6 mm vorgeschrieben. Aus Sicherheitsgründen empfehlen viele Fachleute mehr Profil, besonders bei Winterreifen. Die Werkstatt prüft den Zustand beim Termin.",
  },
  {
    title: "Kaskoschaden",
    category: "Versicherung & Gutachten",
    content: "Q: Was mache ich bei einem Kaskoschaden?\nA: Melden Sie den Schaden Ihrer Versicherung und fragen Sie nach Werkstattbindung. Für eine Einschätzung benötigt die Werkstatt Fahrzeugdaten, Schadenbeschreibung und Fotos.",
  },
  {
    title: "Haftpflichtschaden",
    category: "Versicherung & Gutachten",
    content: "Q: Was ist bei einem Haftpflichtschaden wichtig?\nA: Wenn die Gegenseite den Schaden verursacht hat, können Gutachten und Rechtsberatung relevant sein. Die Werkstatt darf keine Rechtsberatung ersetzen und verweist bei Bedarf an Fachleute.",
  },
  {
    title: "Gutachterkosten",
    category: "Versicherung & Gutachten",
    content: "Q: Wer bezahlt den Gutachter?\nA: Bei unverschuldeten Haftpflichtschäden werden Gutachterkosten häufig von der gegnerischen Versicherung übernommen. Details hängen vom Einzelfall ab; verbindliche Auskunft geben Gutachter, Anwalt oder Versicherung.",
  },
  {
    title: "Versicherungsdaten mitbringen",
    category: "Versicherung & Gutachten",
    content: "Q: Welche Versicherungsdaten soll ich mitbringen?\nA: Bitte bringen Sie Versicherungsschein oder Schadennummer, Fahrzeugschein, Fotos, Unfallbericht und Kontaktdaten der Versicherung mit, falls vorhanden.",
  },
];

export const kfzKnowledgeBaseSeedCount = kfzKnowledgeBaseSeeds.length;
