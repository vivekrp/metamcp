"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { DomainWarningBanner } from "@/components/domain-warning-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslations } from "@/hooks/useTranslations";
import { authClient } from "@/lib/auth-client";
import { vanillaTrpcClient } from "@/lib/trpc";

function LoginForm() {
  const { t } = useTranslations();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [isSignupDisabled, setIsSignupDisabled] = useState(false);
  const [isOidcLoading, setIsOidcLoading] = useState(false);
  const [isOidcEnabled, setIsOidcEnabled] = useState(false);
  const [authProvidersLoading, setAuthProvidersLoading] = useState(true);

  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";

  // Check if signup is disabled
  useEffect(() => {
    const checkSignupStatus = async () => {
      try {
        const isDisabled =
          await vanillaTrpcClient.frontend.config.getSignupDisabled.query();
        setIsSignupDisabled(isDisabled);
      } catch (error) {
        console.error("Failed to fetch signup status:", error);
      }
    };

    checkSignupStatus();
  }, []);

  // Check if OIDC is enabled
  useEffect(() => {
    const checkOidcStatus = async () => {
      try {
        const providers =
          await vanillaTrpcClient.frontend.config.getAuthProviders.query();
        const oidcProvider = providers.find(
          (provider) => provider.id === "oidc" && provider.enabled,
        );
        setIsOidcEnabled(!!oidcProvider);
      } catch (error) {
        console.error("Failed to fetch OIDC config:", error);
      } finally {
        setAuthProvidersLoading(false);
      }
    };

    checkOidcStatus();
  }, []);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const { error } = await authClient.signIn.email({
        email,
        password,
        callbackURL: callbackUrl,
      });

      if (error) {
        setError(error.message || t("auth:signInError"));
      } else {
        router.push(callbackUrl);
      }
    } catch (err) {
      setError(t("auth:signInError"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleOidcSignIn = async () => {
    setIsOidcLoading(true);
    try {
      await authClient.signIn.social({
        provider: "oidc",
        callbackURL: callbackUrl,
      });
    } catch (error) {
      console.error("OIDC sign in failed:", error);
      setError(t("auth:oidcSignInError"));
    } finally {
      setIsOidcLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("auth:signInToAccount")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("auth:enterCredentials")}
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <form onSubmit={handleSignIn} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium">
            {t("auth:email")}
          </label>
          <Input
            id="email"
            type="email"
            placeholder={t("auth:emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isLoading}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium">
            {t("auth:password")}
          </label>
          <Input
            id="password"
            type="password"
            placeholder={t("auth:passwordPlaceholder")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={isLoading}
          />
        </div>

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? t("auth:signingIn") : t("auth:signIn")}
        </Button>
      </form>

      {!authProvidersLoading && isOidcEnabled && (
        <>
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                {t("auth:orContinueWith")}
              </span>
            </div>
          </div>

          <Button
            variant="outline"
            className="w-full"
            onClick={handleOidcSignIn}
            disabled={isOidcLoading}
          >
            {isOidcLoading ? t("auth:signingIn") : t("auth:signInWithOidc")}
          </Button>
        </>
      )}

      {!isSignupDisabled && (
        <div className="text-center text-sm">
          <span className="text-muted-foreground">{t("auth:noAccount")} </span>
          <Link href="/register" className="underline underline-offset-4">
            {t("auth:signUp")}
          </Link>
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="container relative h-screen flex-col items-center justify-center grid lg:max-w-none lg:grid-cols-2 lg:px-0">
      <div className="relative hidden h-full flex-col bg-muted p-10 text-white dark:border-r lg:flex">
        <div className="absolute inset-0 bg-zinc-900" />
        <div className="relative z-20 flex items-center text-lg font-medium">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mr-2 h-6 w-6"
          >
            <path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" />
          </svg>
          MetaMCP
        </div>
        <div className="relative z-20 mt-auto">
          <blockquote className="space-y-2">
            <p className="text-lg">
              "MetaMCP simplifies MCP server management with an intuitive
              interface and powerful tools."
            </p>
          </blockquote>
        </div>
      </div>
      <div className="lg:p-8">
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
          <DomainWarningBanner />
          <Suspense fallback={<div>Loading...</div>}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
