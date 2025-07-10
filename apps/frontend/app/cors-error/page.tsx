"use client";

import { AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAppUrl } from "@/lib/env";

function CorsErrorContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentDomain, setCurrentDomain] = useState<string>("");
  const [correctDomain, setCorrectDomain] = useState<string>("");

  useEffect(() => {
    // Get the current domain from the URL
    const currentUrl = window.location.origin;
    setCurrentDomain(currentUrl);

    // Get the correct domain from the environment
    try {
      const appUrl = getAppUrl();
      setCorrectDomain(appUrl);
    } catch (error) {
      console.error("Error getting app URL:", error);
    }
  }, []);

  const attemptedPath = searchParams.get("callbackUrl") || "/";

  const handleRedirectToCorrectDomain = () => {
    if (correctDomain) {
      const redirectUrl = `${correctDomain}${attemptedPath}`;
      window.location.href = redirectUrl;
    }
  };

  const handleRefresh = () => {
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          <CardTitle className="text-2xl font-bold text-destructive">
            CORS Policy Violation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center space-y-2">
            <p className="text-muted-foreground">
              You&apos;re accessing MetaMCP from an unauthorized domain. For
              security reasons, this application enforces a strict CORS (Cross-
              Origin Resource Sharing) policy.
            </p>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <div className="space-y-2">
              <div className="text-sm">
                <span className="font-medium text-destructive">
                  Current domain:
                </span>
                <div className="font-mono text-sm bg-background px-2 py-1 rounded mt-1 border">
                  {currentDomain || "Loading..."}
                </div>
              </div>
              <div className="text-sm">
                <span className="font-medium text-green-600">
                  Authorized domain:
                </span>
                <div className="font-mono text-sm bg-background px-2 py-1 rounded mt-1 border">
                  {correctDomain || "Loading..."}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold">To resolve this issue:</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start space-x-2">
                <span className="flex-shrink-0 w-5 h-5 bg-primary/10 rounded-full flex items-center justify-center text-xs font-bold text-primary mt-0.5">
                  1
                </span>
                <span>
                  Access the application from the authorized domain shown above
                </span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="flex-shrink-0 w-5 h-5 bg-primary/10 rounded-full flex items-center justify-center text-xs font-bold text-primary mt-0.5">
                  2
                </span>
                <span>
                  If you&apos;re an administrator, update the{" "}
                  <code className="bg-muted px-1 rounded">APP_URL</code>{" "}
                  environment variable to match your desired domain
                </span>
              </li>
              <li className="flex items-start space-x-2">
                <span className="flex-shrink-0 w-5 h-5 bg-primary/10 rounded-full flex items-center justify-center text-xs font-bold text-primary mt-0.5">
                  3
                </span>
                <span>
                  Ensure all requests (including API calls) are made from the
                  same authorized domain
                </span>
              </li>
            </ul>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Button
              onClick={handleRedirectToCorrectDomain}
              disabled={!correctDomain}
              className="flex-1"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Go to Authorized Domain
            </Button>
            <Button
              onClick={handleRefresh}
              variant="outline"
              className="flex-1"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh Page
            </Button>
          </div>

          <div className="text-xs text-muted-foreground text-center pt-4 border-t">
            <p>
              This security measure prevents unauthorized cross-origin requests
              and protects your MetaMCP instance from potential security
              threats.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function CorsErrorPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-2 text-muted-foreground">Loading...</p>
          </div>
        </div>
      }
    >
      <CorsErrorContent />
    </Suspense>
  );
}
