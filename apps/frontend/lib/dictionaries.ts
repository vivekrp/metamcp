import "server-only";

// Type definitions for our dictionaries
export type Dictionary = {
  common: typeof import("../public/locales/en/common.json");
  auth: typeof import("../public/locales/en/auth.json");
  navigation: typeof import("../public/locales/en/navigation.json");
  "mcp-servers": typeof import("../public/locales/en/mcp-servers.json");
  namespaces: typeof import("../public/locales/en/namespaces.json");
  endpoints: typeof import("../public/locales/en/endpoints.json");
  "api-keys": typeof import("../public/locales/en/api-keys.json");
  settings: typeof import("../public/locales/en/settings.json");
  search: typeof import("../public/locales/en/search.json");
  inspector: typeof import("../public/locales/en/inspector.json");
  logs: typeof import("../public/locales/en/logs.json");
};

// Supported locales
export const SUPPORTED_LOCALES = ["en", "zh"] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_NAMES = {
  en: "English",
  zh: "中文",
} as const;

// Dictionary cache
const dictionaries = new Map<SupportedLocale, Dictionary>();

// Load dictionary for a specific locale
export const getDictionary = async (
  locale: SupportedLocale,
): Promise<Dictionary> => {
  // Check cache first
  if (dictionaries.has(locale)) {
    return dictionaries.get(locale)!;
  }

  let dictionary: Dictionary;

  if (locale === "en") {
    // Load English dictionaries
    dictionary = {
      common: (await import("../public/locales/en/common.json")).default,
      auth: (await import("../public/locales/en/auth.json")).default,
      navigation: (await import("../public/locales/en/navigation.json"))
        .default,
      "mcp-servers": (await import("../public/locales/en/mcp-servers.json"))
        .default,
      namespaces: (await import("../public/locales/en/namespaces.json"))
        .default,
      endpoints: (await import("../public/locales/en/endpoints.json")).default,
      "api-keys": (await import("../public/locales/en/api-keys.json")).default,
      settings: (await import("../public/locales/en/settings.json")).default,
      search: (await import("../public/locales/en/search.json")).default,
      inspector: (await import("../public/locales/en/inspector.json")).default,
      logs: (await import("../public/locales/en/logs.json")).default,
    };
  } else if (locale === "zh") {
    // Load Chinese dictionaries with fallback to English
    const [
      commonZh,
      authZh,
      navigationZh,
      mcpServersZh,
      namespacesZh,
      endpointsZh,
      apiKeysZh,
      settingsZh,
      searchZh,
      inspectorZh,
      logsZh,
    ] = await Promise.all([
      import("../public/locales/zh/common.json").catch(() => ({ default: {} })),
      import("../public/locales/zh/auth.json").catch(() => ({ default: {} })),
      import("../public/locales/zh/navigation.json").catch(() => ({
        default: {},
      })),
      import("../public/locales/zh/mcp-servers.json").catch(() => ({
        default: {},
      })),
      import("../public/locales/zh/namespaces.json").catch(() => ({
        default: {},
      })),
      import("../public/locales/zh/endpoints.json").catch(() => ({
        default: {},
      })),
      import("../public/locales/zh/api-keys.json").catch(() => ({
        default: {},
      })),
      import("../public/locales/zh/settings.json").catch(() => ({
        default: {},
      })),
      import("../public/locales/zh/search.json").catch(() => ({ default: {} })),
      import("../public/locales/zh/inspector.json").catch(() => ({
        default: {},
      })),
      import("../public/locales/zh/logs.json").catch(() => ({ default: {} })),
    ]);

    // Get English fallback
    const englishDict = await getDictionary("en");

    dictionary = {
      common: { ...englishDict.common, ...commonZh.default },
      auth: { ...englishDict.auth, ...authZh.default },
      navigation: { ...englishDict.navigation, ...navigationZh.default },
      "mcp-servers": { ...englishDict["mcp-servers"], ...mcpServersZh.default },
      namespaces: { ...englishDict.namespaces, ...namespacesZh.default },
      endpoints: { ...englishDict.endpoints, ...endpointsZh.default },
      "api-keys": { ...englishDict["api-keys"], ...apiKeysZh.default },
      settings: { ...englishDict.settings, ...settingsZh.default },
      search: { ...englishDict.search, ...searchZh.default },
      inspector: { ...englishDict.inspector, ...inspectorZh.default },
      logs: { ...englishDict.logs, ...logsZh.default },
    };
  } else {
    // Fallback to English for unsupported locales
    dictionary = await getDictionary("en");
  }

  // Cache the dictionary
  dictionaries.set(locale, dictionary);
  return dictionary;
};

// Utility functions for working with localized paths
export function getPathnameWithoutLocale(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  const firstSegment = segments[0];

  if (SUPPORTED_LOCALES.includes(firstSegment as SupportedLocale)) {
    return "/" + segments.slice(1).join("/");
  }

  return pathname;
}

export function getLocalizedPath(
  pathname: string,
  locale: SupportedLocale,
): string {
  const pathnameWithoutLocale = getPathnameWithoutLocale(pathname);

  if (locale === "en") {
    return pathnameWithoutLocale;
  }

  return `/${locale}${pathnameWithoutLocale === "/" ? "" : pathnameWithoutLocale}`;
}

// Helper function to get nested translation value
export function getTranslation(
  dictionary: Dictionary,
  key: string,
  params?: Record<string, string | number>,
): string {
  const keys = key.split(":");
  let value: any = dictionary;

  // Navigate through the nested structure
  for (const k of keys) {
    if (value && typeof value === "object" && k in value) {
      value = value[k];
    } else {
      return key; // Return the key if translation not found
    }
  }

  if (typeof value !== "string") {
    return key; // Return the key if the final value is not a string
  }

  // Simple parameter interpolation
  if (params) {
    return value.replace(/\{\{(\w+)\}\}/g, (match, paramKey) => {
      return params[paramKey]?.toString() || match;
    });
  }

  return value;
}
