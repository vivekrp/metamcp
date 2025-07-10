import { betterFetch } from "@better-fetch/fetch";
import { NextRequest, NextResponse } from "next/server";
import { env } from "next-runtime-env";

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for static files, API routes, auth routes, and service routes
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/metamcp") ||
    pathname.startsWith("/health") ||
    pathname.startsWith("/service") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Skip CORS check for the CORS error page itself to prevent infinite redirect
  if (pathname === "/cors-error") {
    return NextResponse.next();
  }

  // Check for CORS violations by comparing request origin with configured APP_URL
  const configuredAppUrl = env("NEXT_PUBLIC_APP_URL");
  if (configuredAppUrl) {
    try {
      const configuredUrl = new URL(configuredAppUrl);
      const requestUrl = new URL(request.url);

      // Check if the request is coming from a different origin than configured
      if (requestUrl.origin !== configuredUrl.origin) {
        // Redirect to CORS error page with the attempted path
        const corsErrorUrl = new URL("/cors-error", configuredAppUrl);
        corsErrorUrl.searchParams.set("callbackUrl", pathname);
        return NextResponse.redirect(corsErrorUrl);
      }
    } catch (error) {
      console.error("Error checking CORS policy:", error);
      // If there's an error parsing URLs, log it but continue processing
    }
  }

  // Skip auth check for public routes
  const publicRoutes = ["/login", "/register", "/"];
  if (publicRoutes.includes(pathname)) {
    return NextResponse.next();
  }

  try {
    // Get the original host for nginx compatibility
    const originalHost =
      request.headers.get("x-forwarded-host") ||
      request.headers.get("host") ||
      "";

    // Check if user is authenticated by calling the session endpoint
    const { data: session } = await betterFetch("/api/auth/get-session", {
      // this hardcoded is correct, because in same container, we should use localhost, outside url won't work
      baseURL: "http://localhost:12009",
      headers: {
        cookie: request.headers.get("cookie") || "",
        // Pass nginx-forwarded host headers for better-auth baseURL resolution
        host: originalHost,
        // Include nginx forwarding headers if present
        "x-forwarded-host": request.headers.get("x-forwarded-host") || "",
        "x-forwarded-proto": request.headers.get("x-forwarded-proto") || "",
        "x-forwarded-for": request.headers.get("x-forwarded-for") || "",
      },
    });

    if (!session) {
      // Redirect to login if not authenticated
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    // On error, redirect to login
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
