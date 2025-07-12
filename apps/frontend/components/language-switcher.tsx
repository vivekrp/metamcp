"use client";

import { Languages } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslations } from "@/hooks/useTranslations";
import {
  getPathnameWithoutLocale,
  LOCALE_NAMES,
  SUPPORTED_LOCALES,
  SupportedLocale,
} from "@/lib/i18n";

export function LanguageSwitcher() {
  const { t, locale: currentLocale } = useTranslations();
  const router = useRouter();
  const pathname = usePathname();

  const handleLanguageChange = (newLanguage: SupportedLocale) => {
    if (newLanguage === currentLocale) return;

    // Get the current path without locale
    const pathnameWithoutLocale = getPathnameWithoutLocale(pathname);

    // Build the new path with the new locale
    const newPath = `/${newLanguage}${pathnameWithoutLocale === "/" ? "" : pathnameWithoutLocale}`;

    // Navigate to the new path
    router.push(newPath);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          <Languages className="h-4 w-4" />
          <span className="sr-only">{t("common:switchLanguage")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {SUPPORTED_LOCALES.map((locale) => (
          <DropdownMenuItem
            key={locale}
            onClick={() => handleLanguageChange(locale)}
            className={currentLocale === locale ? "bg-accent" : ""}
          >
            {LOCALE_NAMES[locale]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
