import { NextRequest, NextResponse } from "next/server";
import { getUserSessionCookieFromRequest, verifyUserSessionCookie } from "@/lib/auth";
import { isBirthdaysEnabledPublic } from "@/lib/featureFlags";
import { getEdgeAppAccessState } from "@/lib/app-access/edge";
import { isEmergencyAccessCookieValid } from "@/lib/app-access/emergency";

const STAFF_ALLOWED_ADMIN_ROUTES = [
  '/admin/attendance',
  '/admin/tokens',
  '/admin/day-brief',
  '/admin/users',
  '/admin/reusable-tokens',
  '/admin/dj',
  '/admin/music-orders',
  '/admin/generadorinvitaciones',
];

const STAFF_ALLOWED_ADMIN_APIS = [
  '/api/admin/attendance',
  '/api/admin/tokens',
  '/api/admin/day-brief',
  '/api/admin/users',
  '/api/admin/birthdays',
  '/api/admin/reusable-tokens',
  '/api/admin/reusable-prizes',
  '/api/admin/music-system',
  '/api/admin/invitations',
  '/api/admin/daily-evaluation',
  '/api/admin/producciones',
];

const COLLAB_ALLOWED_ADMIN_APIS = [
  '/api/admin/birthdays',
];

const AREA_ADMIN_ROUTES: Record<string, string[]> = {
  'DJs': ['/admin/dj', '/admin/music-orders'],
  'Animación': ['/admin/tokens', '/admin/reusable-tokens', '/admin/shows', '/admin/prizes', '/admin/static-batches', '/admin/statics'],
  'Multimedia': ['/admin/shows', '/admin/static-batches', '/admin/statics', '/admin/print'],
};

const AREA_ADMIN_APIS: Record<string, string[]> = {
  'DJs': ['/api/admin/music-system'],
  'Animación': ['/api/admin/tokens', '/api/admin/reusable-tokens', '/api/admin/reusable-prizes', '/api/admin/token-groups'],
  'Multimedia': ['/api/admin/reusable-tokens', '/api/admin/reusable-prizes', '/api/admin/token-groups', '/api/admin/producciones'],
};

function matchesAny(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname.startsWith(p));
}

const LEGACY_PUBLIC_HOST = "tokensapp-production.up.railway.app";
const CANONICAL_PUBLIC_URL = "https://www.ktdrallounge.com";

const APP_ACCESS_BYPASS_PATHS = [
  '/service-suspended',
  '/admin/recovery',
  '/api/public/app-access',
  '/api/admin/app-access/emergency',
];

const EMERGENCY_AUTH_PATHS = [
  '/u/login',
  '/u/change-password',
  '/api/user/auth/login',
  '/api/user/auth/change-password',
  '/api/user/auth/logout',
  '/api/user/auth/me',
];

function isAppAccessBypassPath(pathname: string): boolean {
  return APP_ACCESS_BYPASS_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function isEmergencyAuthPath(req: NextRequest): boolean {
  const { pathname, searchParams } = req.nextUrl;
  if (pathname === '/u/login') {
    return searchParams.get('from') === 'emergency' && searchParams.get('next') === '/admin/service-access';
  }
  return EMERGENCY_AUTH_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function isAdminControlPath(pathname: string): boolean {
  return pathname === '/admin/service-access' || pathname === '/api/admin/app-access';
}

function isAssetPath(pathname: string): boolean {
  return pathname.startsWith('/_next/') || pathname === '/favicon.ico' || pathname === '/manifest.webmanifest' || pathname === '/sw.js';
}

function shouldRedirectLegacyPublicRequest(req: NextRequest): boolean {
  const forwardedHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const requestHost = forwardedHost || req.headers.get("host") || req.nextUrl.hostname;
  const hostname = requestHost.split(":")[0].toLowerCase();
  const pathname = req.nextUrl.pathname;

  if (hostname !== LEGACY_PUBLIC_HOST) return false;

  // Keep internal traffic on its original host: APIs, assets, websockets and
  // health checks must not be redirected by the browser-facing canonical URL.
  return !(
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/socket.io/") ||
    pathname === "/favicon.ico"
  );
}

function areaAllowsAdminRoute(area: string | undefined, pathname: string): boolean {
  if (!area) return false;
  const allowed = AREA_ADMIN_ROUTES[area];
  return !!allowed && matchesAny(pathname, allowed);
}

function areaAllowsAdminAPI(area: string | undefined, pathname: string): boolean {
  if (!area) return false;
  const allowed = AREA_ADMIN_APIS[area];
  return !!allowed && matchesAny(pathname, allowed);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (shouldRedirectLegacyPublicRequest(req)) {
    const canonicalUrl = new URL(`${CANONICAL_PUBLIC_URL}${pathname}`);
    canonicalUrl.search = req.nextUrl.search;
    return NextResponse.redirect(canonicalUrl, 307);
  }

  if (!isAssetPath(pathname) && !isAppAccessBypassPath(pathname)) {
    const appAccess = await getEdgeAppAccessState(req.url);
    const isBlocked = appAccess?.status === 'SUSPENDED' || appAccess?.status === 'MAINTENANCE';
    const hasEmergencyAccess = isBlocked && await isEmergencyAccessCookieValid(req);

    if (isBlocked) {
      const rawCookie = getUserSessionCookieFromRequest(req);
      const session = rawCookie ? await verifyUserSessionCookie(rawCookie) : null;
      const isPrivilegedAdmin = session?.role === 'ADMIN';

      if (pathname === '/admin' || pathname.startsWith('/admin/')) {
        if (isPrivilegedAdmin && pathname !== '/admin/service-access') {
          return NextResponse.redirect(new URL('/admin/service-access', req.url));
        }
      }

      if (isAdminControlPath(pathname) && isPrivilegedAdmin) {
        // An authenticated ADMIN may only use the service control panel while blocked.
      } else if (hasEmergencyAccess && isEmergencyAuthPath(req)) {
        // The recovery cookie only opens the administrator authentication flow.
        // It never grants access to /u or to regular application routes.
      } else {
        if (pathname.startsWith('/api/')) {
          return NextResponse.json(
            { error: 'APP_ACCESS_BLOCKED', message: 'El servicio se encuentra temporalmente suspendido.' },
            { status: 503, headers: { 'Cache-Control': 'no-store' } },
          );
        }

        return NextResponse.redirect(new URL('/service-suspended', req.url));
      }
    }
  }

  if (pathname === "/") {
    return NextResponse.rewrite(new URL("/marketing", req.url));
  }

  if (pathname === "/marketing") {
    return NextResponse.redirect(new URL("/", req.url), 301);
  }

  const publicRoutes = [
    "/marketing/",
    "/reservatucumple",
    "/u/login",
    "/api/user/auth/login",
  ];

  if (publicRoutes.some((route) => pathname === route || pathname.startsWith(route))) {
    return NextResponse.next();
  }

  const userCookie = getUserSessionCookieFromRequest(req);
  const userSession = userCookie ? await verifyUserSessionCookie(userCookie) : null;

  const role = userSession?.role;
  const area = userSession?.area;

  const redirectToLogin = () => {
    const loginUrl = new URL('/u/login', req.nextUrl.origin);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  };

  if (pathname.startsWith('/api/admin/custom-qrs/') && pathname.endsWith('/redeem')) {
    if (!userSession) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }
    if (['ADMIN', 'COORDINATOR', 'STAFF', 'COLLAB'].includes(role || '')) {
      return NextResponse.next();
    }
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  if (pathname.startsWith("/u/") || pathname === "/u") {
    if (!userSession) return redirectToLogin();
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin/")) {
    if (!userSession) return redirectToLogin();

    if (pathname === '/admin/service-access' && role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/admin', req.nextUrl.origin));
    }

    if (role === 'ADMIN' || role === 'COORDINATOR') return NextResponse.next();
    if (role === 'STAFF' && matchesAny(pathname, STAFF_ALLOWED_ADMIN_ROUTES)) return NextResponse.next();
    if (areaAllowsAdminRoute(area, pathname)) return NextResponse.next();

    return redirectToLogin();
  }

  if (pathname.startsWith("/api/admin/")) {
    if (!userSession) {
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }

    if (role === 'ADMIN' || role === 'COORDINATOR') return NextResponse.next();
    if (role === 'STAFF' && matchesAny(pathname, STAFF_ALLOWED_ADMIN_APIS)) return NextResponse.next();
    if (role === 'COLLAB' && matchesAny(pathname, COLLAB_ALLOWED_ADMIN_APIS)) return NextResponse.next();
    if (role === 'COLLAB' && pathname.startsWith('/api/admin/daily-evaluation')) return NextResponse.next();
    if (areaAllowsAdminAPI(area, pathname)) return NextResponse.next();

    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  if (pathname.startsWith("/api/system/")) {
    const publicRouletteSystemApis = [
      '/api/system/tokens/sidebar',
      '/api/system/tokens/spins',
    ];

    if (publicRouletteSystemApis.includes(pathname)) {
      return NextResponse.next();
    }

    if (pathname === '/api/system/tokens/enable-scheduled' || pathname === '/api/system/tokens/toggle') {
      const cronSecret = req.headers.get('x-cron-secret') || '';
      if (cronSecret && cronSecret === (process.env.CRON_SECRET || '')) {
        return NextResponse.next();
      }
    }

    if (!userSession || !['ADMIN', 'COORDINATOR', 'STAFF'].includes(userSession.role)) {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/scanner")) {
    if (!userSession) return redirectToLogin();
    return NextResponse.next();
  }

  const protectedAPIs = [
    "/api/prizes",
    "/api/batch",
    "/api/batches",
    "/api/scanner",
    "/api/tickets",
  ];

  const publicBirthdayAPIs = [
    "/api/birthdays/packs",
    "/api/birthdays/slots",
    "/api/birthdays/reservations",
    "/api/birthdays/referrers/",
    "/api/birthdays/search",
    "/api/birthdays/invite/",
    "/api/birthdays/public/",
  ];

  const isProtectedAPI = protectedAPIs.some((api) => pathname.startsWith(api));
  const isPublicBirthdayAPI = publicBirthdayAPIs.some((api) => pathname.startsWith(api));

  if (isPublicBirthdayAPI && isBirthdaysEnabledPublic()) return NextResponse.next();
  if (pathname.startsWith("/api/birthdays") && !userSession) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  if (isProtectedAPI && !userSession) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }

  return NextResponse.next();
}
