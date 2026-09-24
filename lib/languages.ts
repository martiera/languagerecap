export type LanguageCapability = {
  code: string;
  name: string;
  flag: string;
  locale: string;
  vocabularyReview: boolean;
  conjugationReview: boolean;
  generatedPresent: boolean;
};

export const languages: LanguageCapability[] = [
  { code: 'en', name: 'English', flag: '🇬🇧', locale: 'en-US', vocabularyReview: true, conjugationReview: true, generatedPresent: false },
  { code: 'it', name: 'Italian', flag: '🇮🇹', locale: 'it-IT', vocabularyReview: true, conjugationReview: true, generatedPresent: true },
  { code: 'es', name: 'Spanish', flag: '🇪🇸', locale: 'es-ES', vocabularyReview: true, conjugationReview: false, generatedPresent: false },
  { code: 'fr', name: 'French', flag: '🇫🇷', locale: 'fr-FR', vocabularyReview: true, conjugationReview: false, generatedPresent: false },
  { code: 'de', name: 'German', flag: '🇩🇪', locale: 'de-DE', vocabularyReview: true, conjugationReview: false, generatedPresent: false },
  { code: 'lv', name: 'Latvian', flag: '🇱🇻', locale: 'lv-LV', vocabularyReview: true, conjugationReview: false, generatedPresent: false },
  { code: 'sv', name: 'Swedish', flag: '🇸🇪', locale: 'sv-SE', vocabularyReview: true, conjugationReview: false, generatedPresent: false },
];

export const supportedLanguageCodes = languages.map((language) => language.code);

export function getLanguage(code: string) {
  return languages.find((language) => language.code === code);
}

export function supportsLanguage(code: string) {
  return Boolean(getLanguage(code));
}
