import { NextResponse, type NextRequest } from "next/server";
import { IS_MOCK_AUTH } from "@/lib/auth/config";

export async function middleware(request: NextRequest) {
  // Skip auth check for login page
  if (request.nextUrl.pathname === "/login") {
    return NextResponse.next();
  }

  if (IS_MOCK_AUTH) {
    const mockUser = request.cookies.get("mock-auth-user");
    if (!mockUser?.value) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
  }

  // Live Supabase mode
  const { updateSession } = await import("@/lib/supabase/middleware");
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
