import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname !== "/" && !pathname.startsWith("/management")) {
    return NextResponse.next();
  }

  // This is a navigation guard, not the authorization boundary.
  // Staff API handlers independently validate server-side sessions.
  const hasCookie = Boolean(
    request.cookies.get("restaurant_staff_session")?.value
  );

  if (!hasCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/management/:path*"],
};
