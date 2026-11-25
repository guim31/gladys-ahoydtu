// -----------------------------------------------------------------------------
// Every text the code shows to the user, in the four languages of the Gladys
// interface (en, fr, de, es). German says "du", Spanish says "usted".
// test/i18n.test.js checks that each one exists in all four, is not empty
// and fits where it is shown, and that no other source file writes a text.
//
// Vocabulary taken from the Gladys interface (front/src/config/i18n) and from
// AhoyDTU's own (Wechselrichter, Ertrag heute; inversor). Brand and product
// names are not translated.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

/** The text of one language, English when it is missing. */
export function pick(text, language) {
  return text[language] ?? text.en;
}

/** A multi-language object built by one function per language. */
export function localize(build) {
  return Object.fromEntries(LANGUAGES.map((language) => [language, build(language)]));
}

/** Decimal number in the conventions of a language, without thousands separator. */
export function formatNumber(value, digits, language) {
  const text = Number(value).toFixed(digits);
  return language === 'en' ? text : text.replace('.', ',');
}

/** A label typed in AhoyDTU, short enough for a feature name. */
const short = (label) => (label.length > 14 ? `${label.slice(0, 13)}…` : label);
const panel = (input, label) => (label ? `${input} (${short(label)})` : `${input}`);

// --- Device and feature names (frozen by Gladys when the device is created) ---

export const DEVICE_NAMES = {
  inverter: (serial) => ({
    en: `Inverter ${serial}`,
    fr: `Onduleur ${serial}`,
    de: `Wechselrichter ${serial}`,
    es: `Inversor ${serial}`,
  }),
};

export const FEATURE_NAMES = {
  acPower: {
    en: 'Power',
    fr: 'Puissance',
    de: 'Leistung',
    es: 'Potencia',
  },
  productionToday: {
    en: 'Production today',
    fr: 'Production du jour',
    de: 'Ertrag heute',
    es: 'Producción de hoy',
  },
  productionTotal: {
    en: 'Total production',
    fr: 'Production totale',
    de: 'Gesamtertrag',
    es: 'Producción total',
  },
  acVoltage: {
    en: 'Grid voltage',
    fr: 'Tension réseau',
    de: 'Netzspannung',
    es: 'Tensión de red',
  },
  temperature: {
    en: 'Temperature',
    fr: 'Température',
    de: 'Temperatur',
    es: 'Temperatura',
  },
  reachable: {
    en: 'Reachable',
    fr: 'Joignable',
    de: 'Erreichbar',
    es: 'Accesible',
  },
  state: {
    en: 'State',
    fr: 'État',
    de: 'Zustand',
    es: 'Estado',
  },
  dcPower: (input, label = '') => ({
    en: `Panel ${panel(input, label)} power`,
    fr: `Puissance panneau ${panel(input, label)}`,
    de: `Leistung Modul ${panel(input, label)}`,
    es: `Potencia panel ${panel(input, label)}`,
  }),
  dcToday: (input, label = '') => ({
    en: `Panel ${panel(input, label)} today`,
    fr: `Production panneau ${panel(input, label)}`,
    de: `Ertrag Modul ${panel(input, label)}`,
    es: `Producción panel ${panel(input, label)}`,
  }),
};

// --- States (text feature and widget, 40 characters at most) ---

export const INVERTER_STATES = {
  producing: { en: 'Producing', fr: 'En production', de: 'Produziert', es: 'Produciendo' },
  standby: {
    en: 'Awake, not producing',
    fr: 'Éveillé, sans production',
    de: 'Wach, ohne Produktion',
    es: 'Activo, sin producción',
  },
  sleeping: {
    en: 'Asleep (night)',
    fr: 'En veille (nuit)',
    de: 'Schläft (Nacht)',
    es: 'En reposo (noche)',
  },
  unreachable: {
    en: 'Not answering',
    fr: 'Ne répond pas',
    de: 'Antwortet nicht',
    es: 'No responde',
  },
  disabled: {
    en: 'Disabled in AhoyDTU',
    fr: 'Désactivé dans AhoyDTU',
    de: 'In AhoyDTU deaktiviert',
    es: 'Desactivado en AhoyDTU',
  },
  dtuUnreachable: {
    en: 'AhoyDTU not answering',
    fr: 'AhoyDTU ne répond pas',
    de: 'AhoyDTU antwortet nicht',
    es: 'AhoyDTU no responde',
  },
};

// --- Widget ---

export const WIDGET_TEXT = {
  production: { en: 'Production', fr: 'Production', de: 'Produktion', es: 'Producción' },
  today: { en: 'Today', fr: "Aujourd'hui", de: 'Heute', es: 'Hoy' },
  chartTitle: {
    en: 'Production, last 24 hours',
    fr: 'Production sur 24 heures',
    de: 'Produktion, letzte 24 Stunden',
    es: 'Producción, últimas 24 horas',
  },
  limit: {
    en: 'Power limit',
    fr: 'Limite de puissance',
    de: 'Leistungslimit',
    es: 'Límite de potencia',
  },
  updated: { en: 'Updated', fr: 'Mis à jour', de: 'Aktualisiert', es: 'Actualizado' },
};

export const WIDGET_MESSAGES = {
  notConfigured: {
    en: 'Enter the address of your AhoyDTU in the configuration of the integration.',
    fr: "Saisissez l'adresse de votre AhoyDTU dans la configuration de l'intégration.",
    de: 'Gib die Adresse deiner AhoyDTU in der Konfiguration der Integration ein.',
    es: 'Introduzca la dirección de su AhoyDTU en la configuración de la integración.',
  },
  noData: {
    en: 'No reading from AhoyDTU yet.',
    fr: "Pas encore de lecture de l'AhoyDTU.",
    de: 'Noch keine Messwerte von AhoyDTU.',
    es: 'Todavía no hay lecturas de AhoyDTU.',
  },
};

// --- Connection status and action messages ---

export const MESSAGES = {
  notConfigured: {
    en: 'Enter the address of your AhoyDTU in the configuration.',
    fr: "Saisissez l'adresse de votre AhoyDTU dans la configuration.",
    de: 'Gib die Adresse deiner AhoyDTU in der Konfiguration ein.',
    es: 'Introduzca la dirección de su AhoyDTU en la configuración.',
  },
  invalidHost: {
    en: 'The address of AhoyDTU is not valid: type its IP address, e.g. 192.168.1.50.',
    fr: "L'adresse de l'AhoyDTU n'est pas valide : saisissez son adresse IP, par ex. 192.168.1.50.",
    de: 'Die Adresse der AhoyDTU ist ungültig: Gib ihre IP-Adresse ein, z. B. 192.168.1.50.',
    es: 'La dirección de AhoyDTU no es válida: introduzca su dirección IP, p. ej. 192.168.1.50.',
  },
  unreachable: (detail) => ({
    en: `AhoyDTU does not answer (${detail}). Check its address and that it is powered on.`,
    fr: `L'AhoyDTU ne répond pas (${detail}). Vérifiez son adresse et qu'elle est alimentée.`,
    de: `AhoyDTU antwortet nicht (${detail}). Prüfe ihre Adresse und ob sie Strom hat.`,
    es: `AhoyDTU no responde (${detail}). Compruebe su dirección y que esté encendida.`,
  }),
  publishFailed: (detail) => ({
    en: `Gladys refused the inverters (${detail}).`,
    fr: `Gladys a refusé les onduleurs (${detail}).`,
    de: `Gladys hat die Wechselrichter abgelehnt (${detail}).`,
    es: `Gladys ha rechazado los inversores (${detail}).`,
  }),
  found: ({ version, count }) => ({
    en: `AhoyDTU ${version} answers: ${count} inverter(s) configured. Open the Discovery tab to add them.`,
    fr: `L'AhoyDTU ${version} répond : ${count} onduleur(s) configuré(s). Ouvrez l'onglet Découverte pour les ajouter.`,
    de: `AhoyDTU ${version} antwortet: ${count} Wechselrichter eingerichtet. Öffne den Tab „Entdecken“, um sie hinzuzufügen.`,
    es: `AhoyDTU ${version} responde: ${count} inversor(es) configurado(s). Abra la pestaña Descubrir para añadirlos.`,
  }),
  noInverter: {
    en: 'AhoyDTU answers, but no inverter is configured in it: add yours in its Settings > Inverter.',
    fr: "L'AhoyDTU répond, mais aucun onduleur n'y est configuré : ajoutez le vôtre dans Settings > Inverter.",
    de: 'AhoyDTU antwortet, aber dort ist kein Wechselrichter eingerichtet: Füge deinen unter Settings > Inverter hinzu.',
    es: 'AhoyDTU responde, pero no tiene ningún inversor configurado: añada el suyo en Settings > Inverter.',
  },
  limitDisabled: {
    en: 'The power limit is off: enable "Allow the power limit" in the configuration first.',
    fr: "La limite de puissance est désactivée : activez d'abord « Autoriser la limite de puissance » dans la configuration.",
    de: 'Das Leistungslimit ist aus: Aktiviere zuerst „Leistungslimit erlauben“ in der Konfiguration.',
    es: 'El límite de potencia está desactivado: active primero «Permitir el límite de potencia» en la configuración.',
  },
  limitInvalid: {
    en: 'The limit must be a whole number from 2 to 100 %.',
    fr: 'La limite doit être un nombre entier de 2 à 100 %.',
    de: 'Das Limit muss eine ganze Zahl von 2 bis 100 % sein.',
    es: 'El límite debe ser un número entero de 2 a 100 %.',
  },
  limitUnknownDevice: {
    en: 'Choose an inverter of this integration.',
    fr: 'Choisissez un onduleur de cette intégration.',
    de: 'Wähle einen Wechselrichter dieser Integration.',
    es: 'Elija un inversor de esta integración.',
  },
  limitAuth: {
    en: 'AhoyDTU refused the password: check it in the configuration.',
    fr: "L'AhoyDTU a refusé le mot de passe : vérifiez-le dans la configuration.",
    de: 'AhoyDTU hat das Passwort abgelehnt: Prüfe es in der Konfiguration.',
    es: 'AhoyDTU ha rechazado la contraseña: compruébela en la configuración.',
  },
  limitProtected: {
    en: 'AhoyDTU is protected by a password: enter it in the configuration.',
    fr: "L'AhoyDTU est protégée par un mot de passe : saisissez-le dans la configuration.",
    de: 'AhoyDTU ist mit einem Passwort geschützt: Gib es in der Konfiguration ein.',
    es: 'AhoyDTU está protegida con una contraseña: introdúzcala en la configuración.',
  },
  limitNotAccepted: {
    en: 'AhoyDTU did not accept the limit: the inverter is not reachable by radio (night?).',
    fr: "L'AhoyDTU n'a pas accepté la limite : l'onduleur n'est pas joignable par radio (nuit ?).",
    de: 'AhoyDTU hat das Limit nicht angenommen: Der Wechselrichter ist per Funk nicht erreichbar (Nacht?).',
    es: 'AhoyDTU no ha aceptado el límite: el inversor no es accesible por radio (¿noche?).',
  },
  limitFailed: (detail) => ({
    en: `The limit was not sent (${detail}).`,
    fr: `La limite n'a pas été envoyée (${detail}).`,
    de: `Das Limit wurde nicht gesendet (${detail}).`,
    es: `El límite no se ha enviado (${detail}).`,
  }),
  limitSent: (name, percent) => ({
    en: `Limit of ${percent} % sent to ${name}. Not kept: the inverter returns to its own limit when it restarts.`,
    fr: `Limite de ${percent} % envoyée à ${name}. Non conservée : l'onduleur reprend sa propre limite à son redémarrage.`,
    de: `Limit von ${percent} % an ${name} gesendet. Nicht dauerhaft: Beim Neustart gilt wieder das eigene Limit.`,
    es: `Límite de ${percent} % enviado a ${name}. No se conserva: el inversor recupera su propio límite al reiniciarse.`,
  }),
};
