// lib/i18n/translations.ts

export type TranslationKey = keyof typeof da;

export const da = {
  // App
  appName: "Havørred Logbog",
  appSubtitle: "Din personlige fangstjournal",

  // Auth
  login: "Login",
  signup: "Opret bruger",
  email: "E-mail",
  password: "Adgangskode",
  passwordHint: "Adgangskode (min. 6 tegn)",
  rememberMe: "Gem mig",
  back: "Tilbage",
  loginError: "Login fejl",
  signupError: "Oprettelse fejl",
  userCreated: "Bruger oprettet",
  userCreatedMsg: "Du kan nu logge ind.",
  loginToContinue: "Log ind for at fortsætte",
  notLoggedIn: "Ikke logget ind",

  // Navigation
  trip: "Fisketur",
  newCatch: "Ny fangst",
  gallery: "Galleri",
  settings: "Indstillinger",

  // Settings
  account: "Konto",
  aboutApp: "Om appen",
  version: "Version",
  privacyPolicy: "Privatlivspolitik",
  privacyDesc: "Læs hvordan dine data behandles",
  export: "Eksporter",
  pdfStats: "PDF-statistik",
  pdfDesc: "Download en personlig rapport med alle dine fangstdata",
  downloadReport: "Download rapport",
  import: "Importer",
  manualImport: "Manuel import",
  manualImportDesc: "Tilføj gamle data til din statistik fra tidligere sæsoner",
  openImport: "Åbn import",
  data: "Data",
  deleteAllData: "Slet alle data",
  deleteAllDataDesc: "Fjern alle ture, fangster og spots permanent",
  deleteData: "Slet data",
  logout: "Log ud",
  language: "Sprog",
  languageDesc: "Vælg appens sprog",

  // Delete modal
  deleteTitle: "Slet alle dine data",
  deleteWarning: "Denne handling kan ikke fortrydes. Alle dine ture, fangster, spots og offline-data bliver slettet permanent.",
  deleteConfirmPrompt: "Skriv",
  deleteConfirmWord: "Bekræft",
  deleteConfirmEnd: "herunder for at fortsætte.",
  deleteSuccess: "Dine data er slettet",
  deleteSuccessMsg: "Alle dine ture, fangster, spots og offline-data i appen er nu fjernet. Du kan stadig bruge appen og begynde forfra med nye ture.",
  cancel: "Annullér",
  ok: "OK",
  close: "Luk",

  // Report modal
  downloadStats: "Download statistik",
  downloadStatsDesc: "Vælg hvilken statistik du vil eksportere som PDF-logbog.",
  currentYear: "indeværende år",
  allTime: "All Time",

  // Trip tracking
  startTrip: "Start tur",
  stopTrip: "Stop tur",
  tripRunning: "Tur i gang",
  duration: "Varighed",
  distance: "Distance",
  catches: "Fangster",
  addCatch: "Tilføj fangst",

  // Weather
  weather: "Vejr",
  airTemp: "Lufttemperatur",
  waterTemp: "Vandtemperatur",
  windSpeed: "Vindstyrke",
  windDir: "Vindretning",
  waterLevel: "Vandstand",

  // Common
  loading: "Indlæser...",
  error: "Fejl",
  save: "Gem",
  delete: "Slet",
  edit: "Rediger",
  confirm: "Bekræft",
  yes: "Ja",
  no: "Nej",
};

export const en: typeof da = {
  // App
  appName: "Sea Trout Log",
  appSubtitle: "Your personal catch journal",

  // Auth
  login: "Login",
  signup: "Sign up",
  email: "Email",
  password: "Password",
  passwordHint: "Password (min. 6 characters)",
  rememberMe: "Remember me",
  back: "Back",
  loginError: "Login error",
  signupError: "Sign up error",
  userCreated: "User created",
  userCreatedMsg: "You can now log in.",
  loginToContinue: "Log in to continue",
  notLoggedIn: "Not logged in",

  // Navigation
  trip: "Fishing trip",
  newCatch: "New catch",
  gallery: "Gallery",
  settings: "Settings",

  // Settings
  account: "Account",
  aboutApp: "About the app",
  version: "Version",
  privacyPolicy: "Privacy policy",
  privacyDesc: "Read how your data is processed",
  export: "Export",
  pdfStats: "PDF statistics",
  pdfDesc: "Download a personal report with all your catch data",
  downloadReport: "Download report",
  import: "Import",
  manualImport: "Manual import",
  manualImportDesc: "Add old data to your statistics from previous seasons",
  openImport: "Open import",
  data: "Data",
  deleteAllData: "Delete all data",
  deleteAllDataDesc: "Remove all trips, catches and spots permanently",
  deleteData: "Delete data",
  logout: "Log out",
  language: "Language",
  languageDesc: "Choose app language",

  // Delete modal
  deleteTitle: "Delete all your data",
  deleteWarning: "This action cannot be undone. All your trips, catches, spots and offline data will be permanently deleted.",
  deleteConfirmPrompt: "Type",
  deleteConfirmWord: "Confirm",
  deleteConfirmEnd: "below to continue.",
  deleteSuccess: "Your data has been deleted",
  deleteSuccessMsg: "All your trips, catches, spots and offline data in the app have been removed. You can still use the app and start over with new trips.",
  cancel: "Cancel",
  ok: "OK",
  close: "Close",

  // Report modal
  downloadStats: "Download statistics",
  downloadStatsDesc: "Choose which statistics to export as PDF logbook.",
  currentYear: "current year",
  allTime: "All Time",

  // Trip tracking
  startTrip: "Start trip",
  stopTrip: "Stop trip",
  tripRunning: "Trip in progress",
  duration: "Duration",
  distance: "Distance",
  catches: "Catches",
  addCatch: "Add catch",

  // Weather
  weather: "Weather",
  airTemp: "Air temperature",
  waterTemp: "Water temperature",
  windSpeed: "Wind speed",
  windDir: "Wind direction",
  waterLevel: "Water level",

  // Common
  loading: "Loading...",
  error: "Error",
  save: "Save",
  delete: "Delete",
  edit: "Edit",
  confirm: "Confirm",
  yes: "Yes",
  no: "No",
};

export const translations = {
  da,
  en,
};

export type Language = keyof typeof translations;
