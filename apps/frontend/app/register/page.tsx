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

    if (password.length < 8) {
      setError("Password must be at least 8 characters long");
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
        // Check if signup is actually disabled by checking the current status
        const currentSignupStatus =
          await vanillaTrpcClient.frontend.config.getSignupDisabled.query();

        if (currentSignupStatus) {
          // Signup is actually disabled, show that message
          setError(
            "New user registration is currently disabled. Please contact an administrator.",
          );
          setIsSignupDisabled(true);
        } else {
          // Signup is enabled but registration failed for other reasons (validation, etc.)
          // Show the actual error message from the backend
          setError(error.message || "Registration failed");
        }
      } else {
        router.push("/");
        router.refresh();
      }
    } catch (err) {
      // Handle any other errors
      console.error("Registration error:", err);

      // Check if signup is actually disabled
      try {
        const currentSignupStatus =
          await vanillaTrpcClient.frontend.config.getSignupDisabled.query();

        if (currentSignupStatus) {
          setError(
            "New user registration is currently disabled. Please contact an administrator.",
          );
          setIsSignupDisabled(true);
        } else {
          // Show the actual error message or a generic fallback
          setError((err as Error)?.message || "An unexpected error occurred");
        }
      } catch (_statusCheckError) {
        // If we can't check status, just show the original error
        setError((err as Error)?.message || "An unexpected error occurred");
      }
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
                placeholder="Password (min. 8 characters)"
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
