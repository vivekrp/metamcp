"use client";

import React, { useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useTranslations } from "@/hooks/useTranslations";
import { trpc } from "@/lib/trpc";

export default function SettingsPage() {
  const { t } = useTranslations();
  const [isSignupDisabled, setIsSignupDisabled] = useState(false);

  // Get current signup disabled status
  const {
    data: signupDisabled,
    isLoading,
    refetch,
  } = trpc.frontend.config.getSignupDisabled.useQuery();

  // Mutation to update signup disabled status
  const setSignupDisabledMutation =
    trpc.frontend.config.setSignupDisabled.useMutation({
      onSuccess: () => {
        // Refresh the query data
        refetch();
      },
    });

  // Update local state when data is loaded
  React.useEffect(() => {
    if (signupDisabled !== undefined) {
      setIsSignupDisabled(signupDisabled);
    }
  }, [signupDisabled]);

  const handleSignupToggle = async (checked: boolean) => {
    setIsSignupDisabled(checked);
    try {
      await setSignupDisabledMutation.mutateAsync({ disabled: checked });
    } catch (error) {
      // Revert on error
      setIsSignupDisabled(!checked);
      console.error("Failed to update signup setting:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            {t("settings:title")}
          </h1>
          <p className="text-muted-foreground">{t("settings:description")}</p>
        </div>
        <div>{t("settings:loading")}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {t("settings:title")}
        </h1>
        <p className="text-muted-foreground">{t("settings:description")}</p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("settings:authSettings")}</CardTitle>
            <CardDescription>
              {t("settings:authSettingsDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="disable-signup" className="text-base">
                  {t("settings:disableSignup")}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t("settings:disableSignupDescription")}
                </p>
              </div>
              <Switch
                id="disable-signup"
                checked={isSignupDisabled}
                onCheckedChange={handleSignupToggle}
                disabled={setSignupDisabledMutation.isPending}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
