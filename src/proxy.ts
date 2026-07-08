import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes
  const publicPaths = ["/", "/login", "/register"];
  const isPublicPath = publicPaths.some(
    (p) => pathname === p || pathname.startsWith("/api/auth/")
  );

  if (isPublicPath) {
    return NextResponse.next();
  }

  // Check for session cookie
  const sessionCookie =
    request.cookies.get("better-auth.session_token")?.value ||
    request.cookies.get("session_token")?.value;

  if (!sessionCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.svg|.*\\.png|.*\\.jpg|uploads).*)",
  ],
};
