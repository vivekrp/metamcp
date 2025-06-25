"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { vanillaTrpcClient } from "@/lib/trpc";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [isSignupDisabled, setIsSignupDisabled] = useState(false);
  const [checkingSignupStatus, setCheckingSignupStatus] = useState(true);

  const router = useRouter();

  // Function to check signup status
  const checkSignupStatus = async () => {
    try {
      const isDisabled =
        await vanillaTrpcClient.frontend.config.getSignupDisabled.query();
      setIsSignupDisabled(isDisabled);
    } catch (error) {
      console.error("Failed to check signup status:", error);
      // If we can't check, allow signup to proceed (fail open)
      setIsSignupDisabled(false);
    } finally {
      setCheckingSignupStatus(false);
    }
  };

  // Check if signup is disabled on mount and periodically
  useEffect(() => {
    checkSignupStatus();

    // Check every 30 seconds for admin changes
    const interval = setInterval(checkSignupStatus, 30000);

    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Re-check signup status before attempting to register
    await checkSignupStatus();

    if (isSignupDisabled) {
      setError("New user registration is currently disabled.");
      return;
    }

    setIsLoading(true);
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setIsLoading(false);
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long");
      setIsLoading(false);
      return;
    }

    try {
      const { error } = await authClient.signUp.email({
        email,
        password,
        name,
        callbackURL: "/",
      });

      if (error) {
        // Check if the error is related to disabled signup
        if (
          error.message?.includes("registration is currently disabled") ||
          error.message?.includes("disabled") ||
          error.status === 400 ||
          error.status === 403
        ) {
          setError(
            "New user registration is currently disabled. Please contact an administrator.",
          );
          // Refresh the signup status to update the UI
          await checkSignupStatus();
        } else {
          setError(error.message || "Registration failed");
        }
      } else {
        router.push("/");
        router.refresh();
      }
    } catch (err: any) {
      // Handle any other errors
      if (
        err?.message?.includes("registration is currently disabled") ||
        err?.message?.includes("disabled")
      ) {
        setError(
          "New user registration is currently disabled. Please contact an administrator.",
        );
        // Refresh the signup status to update the UI
        await checkSignupStatus();
      } else {
        setError("An unexpected error occurred");
      }
      console.error("Registration error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  if (checkingSignupStatus) {
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

  if (isSignupDisabled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full space-y-8">
          <div>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
              Registration Disabled
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              New user registration is currently disabled. Please contact an
              administrator if you need an account.
            </p>
          </div>
          <div className="text-center">
            <Link
              href="/login"
              className="text-sm text-blue-600 hover:text-blue-500"
            >
              Already have an account? Sign in
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Create your account
          </h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="sr-only">
                Full name
              </label>
              <Input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                disabled={isLoading}
              />
            </div>
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
                disabled={isLoading}
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
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (min. 6 characters)"
                disabled={isLoading}
              />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="sr-only">
                Confirm Password
              </label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                disabled={isLoading}
              />
            </div>
          </div>

          {error && (
            <div className="text-red-600 text-sm text-center bg-red-50 p-3 rounded-md border border-red-200">
              {error}
            </div>
          )}

          <div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Creating account..." : "Create account"}
            </Button>
          </div>

          <div className="text-center">
            <Link
              href="/login"
              className="text-sm text-blue-600 hover:text-blue-500"
            >
              Already have an account? Sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
