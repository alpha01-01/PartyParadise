import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_ROUTES = [
  "/login",
  "/login/forgot",
  "/login/reset",
  "/portal/login",
  "/portal/setup",
  "/contracts/sign",
];

const PORTAL_ROUTES = [
  "/portal/dashboard",
  "/portal/bookings",
  "/portal/invoices",
  "/portal/contracts",
  "/portal/documents",
  "/portal/notifications",
  "/portal/inquiries",
  "/portal/account",
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicRoute(pathname) || isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  if (isPortalRoute(pathname)) {
    const portalRefresh = request.cookies.get("pp_portal_refresh")?.value;
    if (!portalRefresh) {
      return NextResponse.redirect(new URL("/portal/login", request.url));
    }
    return NextResponse.next();
  }

  const staffRefresh = request.cookies.get("pp_refresh_token")?.value;
  if (!staffRefresh) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

function isPublicRoute(p: string) {
  return PUBLIC_ROUTES.some((r) => p === r || p.startsWith(r + "/"));
}

function isPortalRoute(p: string) {
  return PORTAL_ROUTES.some((r) => p === r || p.startsWith(r + "/"));
}

function isStaticAsset(p: string) {
  return (
    p.startsWith("/_next/") ||
    p.startsWith("/favicon") ||
    p.startsWith("/api/webhooks/") ||
    /\.(png|jpg|jpeg|svg|gif|ico|css|js|woff2?)$/.test(p)
  );
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
