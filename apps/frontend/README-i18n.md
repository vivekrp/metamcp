# Internationalization (i18n) Setup

This project uses Next.js's built-in internationalization support with English and Chinese languages.

## Overview

- **Primary Language**: English (en)
- **Secondary Language**: Chinese Simplified (zh)
- **Framework**: Next.js App Router with [locale] routing
- **Auto-translation**: OpenAI GPT-4o (for generating Chinese translations)

## Project Structure

```
apps/frontend/
├── app/
│   └── [locale]/                  # Locale-based routing
│       ├── layout.tsx            # Locale layout
│       ├── login/
│       ├── (sidebar)/            # Sidebar layout group
│       │   ├── layout.tsx
│       │   ├── mcp-servers/
│       │   ├── namespaces/
│       │   └── ...
│       └── ...
├── public/locales/
│   ├── en/                       # English translations
│   │   ├── common.json
│   │   ├── auth.json
│   │   ├── navigation.json
│   │   ├── mcp-servers.json
│   │   ├── namespaces.json
│   │   ├── endpoints.json
│   │   ├── api-keys.json
│   │   ├── settings.json
│   │   ├── search.json
│   │   ├── inspector.json
│   │   └── logs.json
│   └── zh/                       # Chinese translations
│       └── (auto-generated)
├── lib/
│   ├── dictionaries.ts          # Server-side i18n utilities
│   └── i18n.ts                  # Client-side i18n utilities
├── hooks/
│   ├── useLocale.ts             # Hook to get current locale
│   └── useTranslations.ts       # Hook for client-side translations
├── components/
│   └── language-switcher.tsx    # Language switching component
└── middleware.ts                # Locale detection and routing
```

## Usage

### Server Components

For server components, use the `getDictionary` function:

```tsx
import { getDictionary } from "@/lib/dictionaries";

export default async function ServerComponent({ 
  params 
}: { 
  params: Promise<{ locale: string }> 
}) {
  const { locale } = await params;
  const dict = await getDictionary(locale as SupportedLocale);
  
  return (
    <div>
      <h1>{dict.common.title}</h1>
      <p>{dict.auth.signIn}</p>
    </div>
  );
}
```

### Client Components

For client components, use the `useTranslations` hook:

```tsx
"use client";

import { useTranslations } from "@/hooks/useTranslations";

function ClientComponent() {
  const { t, isLoading, locale } = useTranslations();
  
  if (isLoading) return <div>Loading...</div>;
  
  return (
    <div>
      <h1>{t('common:title')}</h1>
      <button>{t('auth:signIn')}</button>
    </div>
  );
}
```

### Using Parameters

```tsx
// In translation file: "welcome": "Welcome, {{name}}!"
<span>{t('welcome', { name: 'John' })}</span>
```

## Routing

The application uses Next.js's App Router with locale segments:

### URL Structure

- English: `/mcp-servers`, `/settings`
- Chinese: `/zh/mcp-servers`, `/zh/settings`

### Middleware

The middleware in `middleware.ts` handles:
- Locale detection from URL, cookies, and Accept-Language header
- Automatic redirects to appropriate locale
- Authentication checks

### Navigation

Use the `getLocalizedPath` utility for navigation:

```tsx
import { getLocalizedPath } from "@/lib/i18n";

const localizedPath = getLocalizedPath("/mcp-servers", "zh");
// Returns: "/zh/mcp-servers"
```

## Adding New Translations

1. **Add to English files first** in `public/locales/en/`
2. **Run the translation script** to generate Chinese translations
3. **Review and edit** the generated translations as needed

### Translation Script

```bash
# Generate Chinese translations from English
node scripts/translate.js
```

## Translation Keys

### Key Format

Use colon-separated namespaces:

```json
{
  "server": {
    "create": "Create Server",
    "edit": "Edit Server",
    "status": {
      "online": "Online",
      "offline": "Offline"
    }
  }
}
```

Usage: `t('mcp-servers:server.create')`

### Namespace Organization

- **common**: Shared UI elements (buttons, labels, etc.)
- **auth**: Authentication-related text
- **navigation**: Menu items, navigation text
- **[feature]**: Feature-specific translations

## Language Switching

The `LanguageSwitcher` component provides a dropdown to switch between languages:

```tsx
import { LanguageSwitcher } from "@/components/language-switcher";

function Header() {
  return (
    <header>
      <LanguageSwitcher />
    </header>
  );
}
```

## Best Practices

### 1. Translation Keys

- Use descriptive, hierarchical keys
- Use camelCase for consistency
- Group related translations together

### 2. Interpolation

- Use interpolation for dynamic content
- Keep variable names descriptive

```json
{
  "welcome": "Welcome, {{userName}}!",
  "itemCount": "{{count}} items found"
}
```

### 3. Fallbacks

- Chinese translations automatically fall back to English if missing
- Keys are returned as-is if no translation is found

## Troubleshooting

### Common Issues

1. **Missing translations**: Check browser console for missing key warnings
2. **Hydration errors**: Ensure consistent rendering between server and client
3. **Locale not detected**: Check middleware configuration and URL structure

### Debug Tips

- Use browser dev tools to inspect locale detection
- Check that translation files are properly formatted JSON
- Verify that the locale is correctly passed to components

## Migration Notes

This project was migrated from `react-i18next` to Next.js native i18n for better performance and simpler architecture. The key changes include:

- Server-side translation loading with `getDictionary`
- Client-side hooks with `useTranslations`
- Locale-based routing with `[locale]` segments
- Simplified middleware for locale detection

## Contributing

When adding new features:

1. Add English translations first
2. Use the translation script to generate Chinese versions
3. Test both locales thoroughly
4. Update this documentation if adding new patterns 