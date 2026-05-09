export interface DentalKnowledgeBaseSeed {
  title: string;
  category: "Praxis-Info" | "Termin-Buchung" | "Versicherungen" | "Behandlungen" | "Kosten" | "Notfaelle" | "Kinder";
  content: string;
}

export const dentalKnowledgeBaseSeeds: DentalKnowledgeBaseSeed[] = [
  {
    title: "Oeffnungszeiten",
    category: "Praxis-Info",
    content:
      "Q: Was sind Ihre Oeffnungszeiten?\nA: Unsere Praxis ist Montag bis Freitag von 8:00 bis 19:00 Uhr geoeffnet, Samstag von 8:00 bis 14:00 Uhr. An Sonn- und Feiertagen ist die Praxis geschlossen. Fuer akute Notfaelle nutzen Sie bitte die hinterlegte Notfall-Hotline oder in lebensbedrohlichen Situationen den Rettungsdienst 112.",
  },
  {
    title: "Adresse und Anfahrt",
    category: "Praxis-Info",
    content:
      "Q: Wo befindet sich die Praxis?\nA: Die Praxisadresse wird beim Onboarding hinterlegt und in Terminbestaetigungen automatisch eingesetzt. Bitte planen Sie beim ersten Besuch zehn Minuten fuer Anmeldung und Unterlagen ein.",
  },
  {
    title: "Parken",
    category: "Praxis-Info",
    content:
      "Q: Gibt es Parkmoeglichkeiten?\nA: In der Regel stehen Parkplaetze in Praxisnaehe oder oeffentliche Parkmoeglichkeiten zur Verfuegung. Die konkreten Parkhinweise werden von der Praxis im Profil ergaenzt.",
  },
  {
    title: "Barrierefreiheit",
    category: "Praxis-Info",
    content:
      "Q: Ist die Praxis barrierefrei?\nA: Bitte fragen Sie vorab nach, wenn Sie einen barrierefreien Zugang, Aufzug oder besondere Unterstuetzung benoetigen. Das Praxisteam bestaetigt die Moeglichkeiten fuer den konkreten Standort.",
  },
  {
    title: "Sprachen",
    category: "Praxis-Info",
    content:
      "Q: Welche Sprachen spricht das Praxisteam?\nA: Deutsch ist Standardsprache. Weitere Sprachen koennen je nach Praxisteam verfuegbar sein. Bei Bedarf wird die Anfrage an das Team weitergeleitet.",
  },
  {
    title: "Ersttermin Unterlagen",
    category: "Termin-Buchung",
    content:
      "Q: Was muss ich zum ersten Termin mitbringen?\nA: Bitte bringen Sie Versicherungskarte oder Versicherungsnachweis, vorhandene Roentgenbilder, Medikamentenplan, Allergiepass und relevante Vorbefunde mit.",
  },
  {
    title: "Termin verschieben",
    category: "Termin-Buchung",
    content:
      "Q: Wie kann ich meinen Termin verschieben?\nA: Bitte melden Sie sich moeglichst frueh per Telefon, E-Mail oder WhatsApp. Nennen Sie Name, Terminzeit und Wunschzeitraum fuer einen Ersatztermin.",
  },
  {
    title: "Kurzfristige Absage",
    category: "Termin-Buchung",
    content:
      "Q: Was passiert bei kurzfristiger Absage?\nA: Bitte informieren Sie die Praxis so frueh wie moeglich. Ob Ausfallhonorare gelten, haengt von der Praxisvereinbarung und Behandlungsart ab und wird vom Praxisteam geklaert.",
  },
  {
    title: "Kontrolltermin Frequenz",
    category: "Termin-Buchung",
    content:
      "Q: Wie oft sollte ich zur Kontrolle kommen?\nA: Fuer viele Patientinnen und Patienten ist eine zahnmedizinische Kontrolle alle sechs Monate sinnvoll. Individuelle Empfehlungen legt die Zahnaerztin oder der Zahnarzt fest.",
  },
  {
    title: "Akuttermin",
    category: "Termin-Buchung",
    content:
      "Q: Bekomme ich bei Schmerzen kurzfristig einen Termin?\nA: Bei akuten Schmerzen wird die Anfrage priorisiert und an das Praxisteam eskaliert. Bitte nennen Sie Telefonnummer, Beschwerden, Dauer und ob eine Schwellung oder Fieber besteht.",
  },
  {
    title: "Gesetzliche Krankenkassen",
    category: "Versicherungen",
    content:
      "Q: Welche Krankenkassen werden akzeptiert?\nA: Wir akzeptieren alle gesetzlichen Krankenkassen sowie private Vollversicherungen. Bei Selbstzahler-Leistungen erhalten Sie einen detaillierten Heil- und Kostenplan.",
  },
  {
    title: "Private Krankenversicherung",
    category: "Versicherungen",
    content:
      "Q: Wie laeuft die Abrechnung bei privater Krankenversicherung?\nA: Privat versicherte Patientinnen und Patienten erhalten in der Regel eine Rechnung nach GOZ. Die Erstattung haengt vom individuellen Tarif ab.",
  },
  {
    title: "Zahnzusatzversicherung",
    category: "Versicherungen",
    content:
      "Q: Hilft eine Zahnzusatzversicherung bei Kosten?\nA: Eine Zahnzusatzversicherung kann je nach Tarif Leistungen wie Prophylaxe, Zahnersatz oder Implantate bezuschussen. Verbindliche Auskunft gibt der Versicherer anhand des Tarifs und eines Heil- und Kostenplans.",
  },
  {
    title: "Heil- und Kostenplan Einreichung",
    category: "Versicherungen",
    content:
      "Q: Muss ich den Heil- und Kostenplan einreichen?\nA: Bei vielen Zahnersatz- und Implantatbehandlungen sollte der Heil- und Kostenplan vor Behandlungsbeginn bei Krankenkasse oder Versicherung eingereicht werden.",
  },
  {
    title: "Selbstzahlerleistungen",
    category: "Versicherungen",
    content:
      "Q: Welche Leistungen sind Selbstzahlerleistungen?\nA: Das haengt von Befund, Versicherung und gewuenschter Versorgung ab. Typische Beispiele koennen professionelle Zahnreinigung, Bleaching oder bestimmte hochwertige Materialien sein.",
  },
  {
    title: "Professionelle Zahnreinigung Dauer",
    category: "Behandlungen",
    content:
      "Q: Wie lange dauert eine professionelle Zahnreinigung?\nA: Die professionelle Zahnreinigung dauert in der Regel 45 bis 60 Minuten. Empfohlen wird sie haeufig alle sechs Monate, je nach individuellem Risiko auch anders.",
  },
  {
    title: "PZR Vorbereitung",
    category: "Behandlungen",
    content:
      "Q: Muss ich mich auf die professionelle Zahnreinigung vorbereiten?\nA: Eine besondere Vorbereitung ist meist nicht noetig. Bitte teilen Sie Allergien, empfindliche Zaehne, Schwangerschaft oder relevante Erkrankungen vorab mit.",
  },
  {
    title: "Wurzelbehandlung",
    category: "Behandlungen",
    content:
      "Q: Was ist eine Wurzelbehandlung?\nA: Bei einer Wurzelbehandlung wird entzuendetes oder abgestorbenes Gewebe aus dem Zahninneren entfernt und der Zahn anschliessend gereinigt und verschlossen. Details erklaert die Zahnaerztin oder der Zahnarzt nach Befund.",
  },
  {
    title: "Implantat Beratung",
    category: "Behandlungen",
    content:
      "Q: Kann ich mich zu Implantaten beraten lassen?\nA: Ja, fuer Implantate ist ein Beratungstermin sinnvoll. Bitte bringen Sie vorhandene Roentgenbilder, Medikamentenplan und Informationen zu Vorerkrankungen mit.",
  },
  {
    title: "Bleaching",
    category: "Behandlungen",
    content:
      "Q: Bietet die Praxis Bleaching an?\nA: Viele Praxen bieten Bleaching nach vorheriger Kontrolle an. Vorab sollte geklaert werden, ob Zaehne und Zahnfleisch geeignet sind und ob Fuellungen oder Kronen sichtbar betroffen sind.",
  },
  {
    title: "Fuellungstherapie",
    category: "Behandlungen",
    content:
      "Q: Welche Fuellungen gibt es?\nA: Welche Fuellung geeignet ist, haengt von Defektgroesse, Zahnposition, Aesthetik und Versicherung ab. Das Praxisteam erklaert Optionen und moegliche Eigenanteile.",
  },
  {
    title: "Kosten PZR",
    category: "Kosten",
    content:
      "Q: Was kostet eine professionelle Zahnreinigung?\nA: Die Kosten variieren je nach Aufwand und Praxis. Viele Praxen liegen grob im Bereich von 80 bis 150 Euro. Gesetzliche Kassen bezuschussen teilweise, bitte pruefen Sie Ihre Kasse.",
  },
  {
    title: "Kosten Implantat",
    category: "Kosten",
    content:
      "Q: Was kostet ein Implantat?\nA: Implantatkosten unterscheiden sich stark nach Befund, Material, Knochenaufbau und Zahnersatz. Eine verlaessliche Einschaetzung ist erst nach Untersuchung und Heil- und Kostenplan moeglich.",
  },
  {
    title: "Kosten Bleaching",
    category: "Kosten",
    content:
      "Q: Was kostet Bleaching?\nA: Bleaching ist meist eine Selbstzahlerleistung. Die Kosten haengen von Methode und Umfang ab und werden vorab vom Praxisteam mitgeteilt.",
  },
  {
    title: "Ratenzahlung",
    category: "Kosten",
    content:
      "Q: Gibt es Ratenzahlung?\nA: Manche Praxen bieten Ratenzahlung oder Abrechnung ueber Dienstleister an. Die konkrete Moeglichkeit wird vor Behandlungsbeginn durch das Praxisteam bestaetigt.",
  },
  {
    title: "Zahnschmerzen",
    category: "Notfaelle",
    content:
      "Q: Was soll ich bei starken Zahnschmerzen tun?\nA: Bitte kontaktieren Sie die Praxis oder Notfall-Hotline zeitnah. Bei starken Schmerzen, Schwellung, Fieber oder Unfall wird die Anfrage sofort priorisiert. Es wird keine medizinische Beratung per Chat gegeben.",
  },
  {
    title: "Schwellung",
    category: "Notfaelle",
    content:
      "Q: Was mache ich bei einer Schwellung im Mund- oder Gesichtsbereich?\nA: Eine Schwellung sollte zeitnah abgeklärt werden. Bei Atemnot, Schluckbeschwerden oder rascher Verschlechterung waehlen Sie bitte sofort 112.",
  },
  {
    title: "Zahn ausgeschlagen",
    category: "Notfaelle",
    content:
      "Q: Was tun, wenn ein Zahn ausgeschlagen wurde?\nA: Bitte sofort die Notfall-Hotline oder Praxis kontaktieren. Bei Unfallverletzungen oder starken Blutungen waehlen Sie den Notdienst beziehungsweise 112. Chat-Antworten ersetzen keine Akutversorgung.",
  },
  {
    title: "Krone oder Fuellung herausgefallen",
    category: "Notfaelle",
    content:
      "Q: Was tun, wenn Krone, Inlay oder Fuellung herausgefallen ist?\nA: Bitte vereinbaren Sie zeitnah einen Termin und bringen Sie das herausgefallene Teil mit, falls vorhanden. Bei Schmerzen wird die Anfrage priorisiert.",
  },
  {
    title: "Nachblutung",
    category: "Notfaelle",
    content:
      "Q: Was mache ich bei Nachblutung nach einem Eingriff?\nA: Bitte kontaktieren Sie die Praxis oder Notfall-Hotline. Bei starker oder nicht stillbarer Blutung suchen Sie umgehend medizinische Hilfe beziehungsweise den Rettungsdienst.",
  },
  {
    title: "Erster Zahnarztbesuch Kind",
    category: "Kinder",
    content:
      "Q: Wann sollte ein Kind zum ersten Mal zum Zahnarzt?\nA: Viele Empfehlungen sehen den ersten Besuch ab dem ersten Zahn oder im Kleinkindalter vor. Der Termin dient vor allem Kennenlernen, Kontrolle und Beratung der Eltern.",
  },
  {
    title: "Kinderprophylaxe",
    category: "Kinder",
    content:
      "Q: Gibt es Prophylaxe fuer Kinder?\nA: Ja, Kinder und Jugendliche koennen altersgerechte Prophylaxe, Putztraining und Fluoridierungsberatung erhalten. Die Details richten sich nach Alter und Befund.",
  },
  {
    title: "Angstpatienten",
    category: "Kinder",
    content:
      "Q: Was ist, wenn mein Kind oder ich Angst vor dem Zahnarzt haben?\nA: Bitte teilen Sie Angst oder schlechte Erfahrungen bei der Terminbuchung mit. Die Praxis kann mehr Zeit einplanen und behutsam vorgehen.",
  },
  {
    title: "Schulbescheinigung",
    category: "Kinder",
    content:
      "Q: Stellt die Praxis eine Schulbescheinigung aus?\nA: Auf Wunsch kann das Praxisteam in der Regel eine Bescheinigung fuer Schule oder Arbeitgeber ausstellen. Bitte fragen Sie beim Termin danach.",
  },
  {
    title: "Milchzahn Unfall",
    category: "Kinder",
    content:
      "Q: Was tun bei einem Milchzahn-Unfall?\nA: Bitte kontaktieren Sie die Praxis oder den zahnärztlichen Notdienst zeitnah. Bei starken Blutungen, Kopfverletzung oder Bewusstseinsproblemen waehlen Sie 112.",
  },
];

export const dentalKnowledgeBaseSeedCount = dentalKnowledgeBaseSeeds.length;
