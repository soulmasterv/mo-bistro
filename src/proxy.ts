import { NextRequest, NextResponse } from "next/server";
import { pilotPathAllowed } from "@/lib/pilot/config";

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (!pilotPathAllowed(pathname)) {
    if (pathname.startsWith('/api/')) return NextResponse.json({error:'Not available in the pilot'},{status:404});
    return NextResponse.redirect(new URL('/',request.url));
  }

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
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
