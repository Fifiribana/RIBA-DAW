/**
 * RIBA i18n initialization.
 *
 * 5 bundled locales (fr, en, es, pt, sw). Language is auto-detected from
 * localStorage > navigator.language, persisted via the `riba-lang` key.
 *
 * Falls back to English for any missing key. Dynamic translations
 * (e.g. Bantu style descriptions, AI tutorials) can be fetched live via
 * `POST /api/ai/translate` — see `useDynamicTranslate` hook below.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import fr from './locales/fr.json';
import en from './locales/en.json';
import es from './locales/es.json';
import pt from './locales/pt.json';
import sw from './locales/sw.json';

export const SUPPORTED_LANGS = [
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'en', label: 'English',   flag: '🇬🇧' },
  { code: 'es', label: 'Español',  flag: '🇪🇸' },
  { code: 'pt', label: 'Português', flag: '🇵🇹' },
  { code: 'sw', label: 'Kiswahili', flag: '🇰🇪' },
];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      fr: { translation: fr },
      en: { translation: en },
      es: { translation: es },
      pt: { translation: pt },
      sw: { translation: sw },
    },
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGS.map(l => l.code),
    nonExplicitSupportedLngs: true,    // map "fr-FR" -> "fr"
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'riba-lang',
      caches: ['localStorage'],
    },
    returnNull: false,
  });

// Sync <html lang="..."> for accessibility / SEO.
i18n.on('languageChanged', (lng) => {
  try { document.documentElement.lang = lng; } catch { /* ignore */ }
});

export default i18n;
