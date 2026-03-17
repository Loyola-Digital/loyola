import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/invite(.*)",
]);

// Routes that guests are allowed to access
const isGuestAllowedRoute = createRouteMatcher(["/projects(.*)", "/invite(.*)"]);

export default clerkMiddleware(async (auth, request) => {
  if (isPublicRoute(request)) return;

  await auth.protect();

  // Redirect guests away from global (non-project) routes
  const { sessionClaims } = await auth();
  const role = (sessionClaims?.metadata as Record<string, unknown> | undefined)
    ?.role as string | undefined;

  if (role === "guest" && !isGuestAllowedRoute(request)) {
    const url = request.nextUrl.clone();
    url.pathname = "/projects";
    return NextResponse.redirect(url);
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};
