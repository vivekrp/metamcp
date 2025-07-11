"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { DomainWarningBanner } from "@/components/domain-warning-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { vanillaTrpcClient } from "@/lib/trpc";

function LoginForm() {
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

  // Check auth providers and signup status
  useEffect(() => {
    const checkAuthConfig = async () => {
      try {
        const [authProviders, signupDisabled] = await Promise.all([
          vanillaTrpcClient.frontend.config.getAuthProviders.query(),
          vanillaTrpcClient.frontend.config.getSignupDisabled.query(),
        ]);

        // Check if OIDC is in the list of enabled providers
        const oidcProvider = authProviders.find(
          (provider) => provider.id === "oidc" && provider.enabled,
        );
        setIsOidcEnabled(!!oidcProvider);
        setIsSignupDisabled(signupDisabled);
      } catch (error) {
        console.error("Failed to check auth configuration:", error);
        // If we can't check, assume OIDC is disabled and signup is enabled (fail safe)
        setIsOidcEnabled(false);
        setIsSignupDisabled(false);
      } finally {
        setAuthProvidersLoading(false);
      }
    };

    checkAuthConfig();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
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
        setError(error.message || "Login failed");
      } else {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch (err) {
      setError("An unexpected error occurred");
      console.error("Login error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOidcLogin = async () => {
    setIsOidcLoading(true);
    setError("");

    try {
      await authClient.signIn.social({
        provider: "oidc",
        callbackURL: callbackUrl,
      });
    } catch (err) {
      setError("OIDC login failed");
      console.error("OIDC login error:", err);
      setIsOidcLoading(false);
    }
  };

  // Show loading state while checking auth providers
  if (authProvidersLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full space-y-8">
          <div>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
              Loading...
            </h2>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8">
        {/* Domain Warning Banner */}
        <DomainWarningBanner />

        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign in to your account
          </h2>
        </div>

        {/* OIDC Login Button */}
        {isOidcEnabled && (
          <div className="mt-6">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleOidcLogin}
              disabled={isOidcLoading || isLoading}
            >
              {isOidcLoading ? "Signing in with OIDC..." : "Sign in with OIDC"}
            </Button>

            <div className="mt-4 relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-gray-50 text-gray-500">
                  Or continue with email
                </span>
              </div>
            </div>
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                disabled={isLoading || isOidcLoading}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                disabled={isLoading || isOidcLoading}
              />
            </div>
          </div>

          {error && (
            <div className="text-red-600 text-sm text-center">{error}</div>
          )}

          <div>
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading || isOidcLoading}
              onClick={handleSubmit}
            >
              {isLoading ? "Signing in..." : "Sign in"}
            </Button>
          </div>

          {!isSignupDisabled && (
            <div className="text-center">
              <Link
                href="/register"
                className="text-sm text-blue-600 hover:text-blue-500"
              >
                Don&apos;t have an account? Sign up
              </Link>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}
