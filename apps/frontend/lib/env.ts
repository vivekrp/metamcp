import { env } from "next-runtime-env";

export const getAppUrl = () => {
  const NEXT_PUBLIC_APP_URL = env("NEXT_PUBLIC_APP_URL");
  if (!NEXT_PUBLIC_APP_URL) {
    throw new Error("NEXT_PUBLIC_APP_URL is not set");
  }
  return NEXT_PUBLIC_APP_URL;
};
