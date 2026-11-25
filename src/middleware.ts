import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// --- 1. KONFIGURASI KEAMANAN & ANTI-IDOR ---
const LEGACY_BLOCKED_ROUTES = /^\/(api\/)?(contacts|upgrade|billing)(\/|$)/i;
const ALLOWED_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
const SAFE_HOST_PATTERN = /^[a-zA-Z0-9.-]+(:\d{1,5})?$/;

// Header identitas yang tidak boleh dipalsukan dari client (Anti Header-Spoofing IDOR)
const SPOOFABLE_IDENTITY_HEADERS = [
  "x-user-id",
  "x-verified-user-id",
  "x-verified-user-email",
  "x-forwarded-user",
  "x-auth-user",
  "x-tenant-id",
  "x-company-id",
  "x-organization-id",
  "x-role",
  "x-is-admin"
];

// Parameter query identitas yang wajib cocok dengan user login (Anti Query-Tampering & HPP IDOR)
const IDOR_IDENTITY_QUERY_PARAMS = new Set([
  "user_id",
  "userid",
  "host_id",
  "hostid",
  "owner_id",
  "ownerid",
  "account_id",
  "accountid",
  "profile_id",
  "profileid"
]);

// Blokir akses ke .env, .git, file konfigurasi, backup, dan target scan umum
const BLOCKED_PATH_PATTERNS: RegExp[] = [
  /(^|\/)\.(env|git|hg|svn|htaccess|htpasswd|DS_Store|docker|aws|ssh|npmrc|yarnrc|bashrc|profile)/i,
  /\.(env|bak|old|orig|save|swp|swo|sql|dump|log|ini|conf|cfg|yml|yaml|toml|pem|key|crt|p12|zip|tar|gz|rar|7z|map)$/i,
  /^\/(wp-admin|wp-login|wp-content|wp-includes|xmlrpc\.php|phpmyadmin|pma|adminer|phpinfo|server-status|server-info|actuator|cgi-bin|vendor|composer\.(json|lock)|package(-lock)?\.json|tsconfig\.json|next\.config\.(js|mjs|ts)|dockerfile|docker-compose)/i
];

// Blokir tool scanner otomatis
const SCANNER_UA_PATTERN =
  /(sqlmap|nikto|nmap|masscan|zgrab|dirbuster|dirsearch|gobuster|feroxbuster|ffuf|wfuzz|nuclei|wpscan|acunetix|nessus|openvas|netsparker|appscan|hydra|medusa|havij|burpsuite|owasp|jaeles|dalfox|xsstrike|commix|httpx|subfinder)/i;

// Pola Anti SQL Injection (aman untuk meeting code ber-tanda hubung & token OAuth)
const SQLI_PATTERNS: RegExp[] = [
  /(\bunion\b[\s/+*]+(\ball\b[\s/+*]+)?\bselect\b)/i,
  /(\bselect\b[\s/+*]+.{1,40}\bfrom\b)/i,
  /(\binsert\b[\s/+*]+\binto\b|\bdelete\b[\s/+*]+\bfrom\b|\bdrop\b[\s/+*]+(table|database|schema)\b|\balter\b[\s/+*]+\btable\b|\btruncate\b[\s/+*]+\btable\b)/i,
  /(;\s*(select|insert|update|delete|drop|alter|create|exec|execute|declare)\b)/i,
  /(['"`]\s*(or|and)\s*['"`]?\d+['"`]?\s*=\s*['"`]?\d+)|(\b(or|and)\b\s+\d+\s*=\s*\d+)/i,
  /(\b(sleep|pg_sleep|benchmark)\s*\(|\bwaitfor\s+delay\b)/i,
  /(\binformation_schema\b|\bpg_catalog\b|\bsys\.tables\b|\bxp_cmdshell\b|\bload_file\s*\(|\binto\s+(outfile|dumpfile)\b)/i,
  /(\/\*[\s\S]*?\*\/|--\s|--$|#\s*$)/
];

// Pola Anti XSS, LFI, dan Command Injection di URL/Query
const INJECTION_PATTERNS: RegExp[] = [
  /(<\s*script\b|javascript\s*:|vbscript\s*:|on(error|load|click|mouseover|focus)\s*=)/i,
  /(\.\.[/\\]|%2e%2e|\0|%00)/i,
  /(\/etc\/passwd|\/etc\/shadow|\/proc\/self|\/bin\/(ba)?sh|cmd\.exe|powershell)/i
];

// Rate limiting & auto-ban in-memory (berbatas agar anti-OOM)
const MAX_TRACKED_IPS = 5000;
const RATE_WINDOW_MS = 60_000;
const STRIKE_WINDOW_MS = 10 * 60_000;
const BAN_DURATION_MS = 15 * 60_000;
const MAX_STRIKES_BEFORE_BAN = 3;

const rateStore = new Map<string, { count: number; resetAt: number }>();
const strikeStore = new Map<string, { strikes: number; resetAt: number; bannedUntil: number }>();

type PendingCookie = {
  name: string;
  value: string;
  options?: any;
};

function getClientIp(req: NextRequest): string {
  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

function getSafeHost(req: NextRequest): string | null {
  const rawHost = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (!rawHost) return null;
  const host = rawHost.split(",")[0].trim();
  return SAFE_HOST_PATTERN.test(host) ? host : null;
}

function safeDecode(input: string): string | null {
  let current = input;
  try {
    // Decode hingga 2 kali untuk menangkap double-encoding (%252e%252e)
    for (let i = 0; i < 2; i++) {
      const next = decodeURIComponent(current);
      if (next === current) break;
      current = next;
    }
    return current;
  } catch {
    return null;
  }
}

function recordStrike(ip: string): boolean {
  if (ip === "unknown") return false;
  const now = Date.now();
  const entry = strikeStore.get(ip);

  if (!entry || now > entry.resetAt) {
    strikeStore.set(ip, { strikes: 1, resetAt: now + STRIKE_WINDOW_MS, bannedUntil: 0 });
    return false;
  }

  entry.strikes += 1;
  if (entry.strikes >= MAX_STRIKES_BEFORE_BAN) {
    entry.bannedUntil = now + BAN_DURATION_MS;
    return true;
  }

  if (strikeStore.size > MAX_TRACKED_IPS) {
    for (const [k, v] of Array.from(strikeStore.entries())) {
      if (now > v.resetAt && now > v.bannedUntil) strikeStore.delete(k);
    }
  }
  return false;
}

function isIpBanned(ip: string): boolean {
  if (ip === "unknown") return false;
  const entry = strikeStore.get(ip);
  if (!entry) return false;
  const now = Date.now();
  if (entry.bannedUntil > now) return true;
  if (now > entry.resetAt) strikeStore.delete(ip);
  return false;
}

function isRateLimited(ip: string, bucket: string, maxRequests: number): boolean {
  const now = Date.now();
  const key = `${ip}:${bucket}`;
  const entry = rateStore.get(key);

  if (!entry || now > entry.resetAt) {
    rateStore.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }

  entry.count += 1;
  if (rateStore.size > MAX_TRACKED_IPS) {
    for (const [k, v] of Array.from(rateStore.entries())) {
      if (now > v.resetAt) rateStore.delete(k);
    }
  }
  return entry.count > maxRequests;
}

function applySecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  res.headers.set(
    "Permissions-Policy",
    "camera=(self), microphone=(self), display-capture=(self), geolocation=(), payment=(), usb=()"
  );
  res.headers.set("X-DNS-Prefetch-Control", "off");
  res.headers.delete("X-Powered-By");
  return res;
}

function blockedResponse(
  status: 400 | 401 | 403 | 404 | 405 | 429,
  message: string,
  asJson = false
): NextResponse {
  const res = asJson
    ? NextResponse.json(
        { error: message },
        { status, headers: { "Cache-Control": "no-store, private" } }
      )
    : new NextResponse(message, {
        status,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
      });

  if (status === 429) {
    res.headers.set("Retry-After", "60");
  }
  return applySecurityHeaders(res);
}

function clearStaleSupabaseCookies(request: NextRequest, target: NextResponse) {
  request.cookies
    .getAll()
    .filter((c) => c.name.startsWith("sb-"))
    .forEach((c) => {
      target.cookies.delete(c.name);
    });
}

function buildForwardHeaders(
  request: NextRequest,
  verifiedUser?: { id: string; email?: string | null } | null
): Headers {
  const headers = new Headers(request.headers);
  for (const h of SPOOFABLE_IDENTITY_HEADERS) {
    headers.delete(h);
  }
  if (verifiedUser?.id) {
    headers.set("x-verified-user-id", verifiedUser.id);
    if (verifiedUser.email) {
      headers.set("x-verified-user-email", verifiedUser.email);
    }
  }
  return headers;
}

function buildRedirectUrl(request: NextRequest, targetPath: string): URL {
  const host = getSafeHost(request);
  if (!host) return new URL(targetPath, request.url);

  const rawProto = request.headers.get("x-forwarded-proto");
  const candidateProto = rawProto
    ? rawProto.split(",")[0].trim().toLowerCase()
    : request.nextUrl.protocol.replace(":", "").toLowerCase();
  const proto = candidateProto === "http" || candidateProto === "https" ? candidateProto : "https";

  return new URL(targetPath, `${proto}://${host}`);
}

function hasIdorQueryTampering(request: NextRequest, authenticatedUserId: string): boolean {
  const seenIdentityParams = new Set<string>();
  for (const [rawKey, rawValue] of Array.from(request.nextUrl.searchParams.entries())) {
    const key = rawKey.toLowerCase();
    if (!IDOR_IDENTITY_QUERY_PARAMS.has(key)) continue;

    // Tolak HTTP Parameter Pollution (duplikasi parameter identitas)
    if (seenIdentityParams.has(key)) return true;
    seenIdentityParams.add(key);

    // Tolak jika nilai identitas tidak sama persis dengan user yang sedang login
    if (rawValue.trim() !== authenticatedUserId) {
      return true;
    }
  }
  return false;
}

function runSecurityWaf(request: NextRequest): NextResponse | null {
  const ip = getClientIp(request);
  const method = request.method.toUpperCase();
  const userAgent = request.headers.get("user-agent") || "";
  const rawPathname = request.nextUrl.pathname;
  const rawSearch = request.nextUrl.search || "";
  const isApiRaw = rawPathname.startsWith("/api/");

  // 1. Tolak IP yang sedang di-ban karena aktivitas scanning/attack
  if (isIpBanned(ip)) {
    return blockedResponse(403, "Forbidden", isApiRaw);
  }

  // 2. Tolak metode HTTP yang tidak diperlukan (TRACE, TRACK, CONNECT, dll.)
  if (!ALLOWED_METHODS.has(method)) {
    return blockedResponse(405, "Method Not Allowed", isApiRaw);
  }

  // 3. Blokir User-Agent scanner otomatis (sqlmap, nikto, dirsearch, nuclei, dll.)
  if (userAgent && SCANNER_UA_PATTERN.test(userAgent)) {
    recordStrike(ip);
    return blockedResponse(403, "Forbidden", isApiRaw);
  }

  // 4. Decode URL & cek Path Traversal / malform encoding
  const decodedPath = safeDecode(rawPathname);
  const decodedSearch = safeDecode(rawSearch);
  if (decodedPath === null || decodedSearch === null) {
    recordStrike(ip);
    return blockedResponse(400, "Bad Request", isApiRaw);
  }

  const isApi = decodedPath.startsWith("/api/");

  // 4b. Tutup rute lama Contacts/Upgrade/Billing agar tidak bisa diakses langsung
  if (LEGACY_BLOCKED_ROUTES.test(decodedPath)) {
    return blockedResponse(404, "Not Found", isApi);
  }

  // 5. Blokir akses .env, .git, backup file, dan path probing
  if (BLOCKED_PATH_PATTERNS.some((p) => p.test(decodedPath))) {
    recordStrike(ip);
    return blockedResponse(404, "Not Found", isApi);
  }

  // 6. Anti-SQL Injection & Anti-XSS/LFI pada path dan query string
  const combinedTarget = `${decodedPath} ${decodedSearch}`;
  if (
    SQLI_PATTERNS.some((p) => p.test(combinedTarget)) ||
    INJECTION_PATTERNS.some((p) => p.test(combinedTarget))
  ) {
    recordStrike(ip);
    return blockedResponse(403, "Forbidden", isApi);
  }

  // 7. Rate Limiting bertingkat (Anti Brute-Force & Anti Burp Intruder)
  const isAuth =
    decodedPath.startsWith("/login") ||
    decodedPath.startsWith("/register") ||
    decodedPath.startsWith("/auth");

  if (isAuth && isRateLimited(ip, "auth", 25)) {
    return blockedResponse(429, "Too Many Requests", isApi);
  }
  if (isApi && isRateLimited(ip, "api", 60)) {
    return blockedResponse(429, "Too Many Requests", true);
  }
  if (!isApi && !isAuth && isRateLimited(ip, "web", 120)) {
    return blockedResponse(429, "Too Many Requests", false);
  }

  // 8. Anti-CSRF ketat untuk API mutasi (validasi Sec-Fetch-Site, Origin, & Referer)
  if (isApi && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const secFetchSite = request.headers.get("sec-fetch-site");
    if (secFetchSite && secFetchSite.toLowerCase() === "cross-site") {
      return blockedResponse(403, "Forbidden: Cross-site request blocked", true);
    }

    const host = getSafeHost(request);
    const origin = request.headers.get("origin");
    const referer = request.headers.get("referer");

    if (host && origin) {
      try {
        if (new URL(origin).host !== host) {
          return blockedResponse(403, "Forbidden: Invalid Origin", true);
        }
      } catch {
        return blockedResponse(403, "Forbidden: Invalid Origin", true);
      }
    } else if (host && referer) {
      try {
        if (new URL(referer).host !== host) {
          return blockedResponse(403, "Forbidden: Invalid Referer", true);
        }
      } catch {
        return blockedResponse(403, "Forbidden: Invalid Referer", true);
      }
    }
  }

  return null;
}

// --- 2. MIDDLEWARE UTAMA ---
export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Bypass cepat untuk Kubernetes Readiness/Liveness Probe
  if (pathname === "/api/health") {
    return NextResponse.json(
      { status: "ok" },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }

  const securityBlock = runSecurityWaf(request);
  if (securityBlock) return securityBlock;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    const fallbackRes = NextResponse.next({
      request: { headers: buildForwardHeaders(request, null) }
    });
    return applySecurityHeaders(fallbackRes);
  }

  const hasSupabaseCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-"));

  let user: { id: string; email?: string | null } | null = null;
  let shouldClearStaleCookies = false;
  let pendingCookies: PendingCookie[] = [];

  if (hasSupabaseCookie) {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: PendingCookie[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          pendingCookies = cookiesToSet;
        }
      }
    });

    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        if (
          error.code === "refresh_token_not_found" ||
          error.code === "invalid_refresh_token" ||
          error.status === 400
        ) {
          shouldClearStaleCookies = true;
        }
      } else if (data.user) {
        user = { id: data.user.id, email: data.user.email };
      }
    } catch {
      shouldClearStaleCookies = true;
    }
  }

  const isPublicAuthPage = pathname.startsWith("/login") || pathname.startsWith("/register");
  const isAuthCallback = pathname.startsWith("/auth");
  const isApiRoute = pathname.startsWith("/api");
  const isPublicApiRoute = pathname === "/api/health" || pathname.startsWith("/api/auth/");

  // Anti-IDOR Layer 1: Blokir akses API terproteksi jika tidak terautentikasi
  if (isApiRoute && !isPublicApiRoute && !user) {
    const unauthRes = blockedResponse(401, "Unauthorized", true);
    if (shouldClearStaleCookies) {
      clearStaleSupabaseCookies(request, unauthRes);
    }
    return unauthRes;
  }

  // Anti-IDOR Layer 2: Blokir manipulasi parameter identitas & HPP pada API
  if (isApiRoute && user && hasIdorQueryTampering(request, user.id)) {
    recordStrike(getClientIp(request));
    return blockedResponse(403, "Forbidden: Identity mismatch", true);
  }

  // Redirect halaman terproteksi ke /login bila belum login
  if (!user && !isPublicAuthPage && !isAuthCallback && !isApiRoute) {
    const loginUrl = buildRedirectUrl(request, "/login");
    const safeRedirect =
      pathname.startsWith("/") && !pathname.startsWith("//") && !pathname.includes("\\")
        ? pathname
        : "/";
    loginUrl.searchParams.set("redirect", safeRedirect);

    const redirectRes = NextResponse.redirect(loginUrl);
    if (shouldClearStaleCookies) {
      clearStaleSupabaseCookies(request, redirectRes);
    }
    return applySecurityHeaders(redirectRes);
  }

  // Redirect user yang sudah login keluar dari halaman /login & /register
  if (user && isPublicAuthPage) {
    const redirectRes = NextResponse.redirect(buildRedirectUrl(request, "/"));
    pendingCookies.forEach(({ name, value, options }) => {
      redirectRes.cookies.set(name, value, options);
    });
    return applySecurityHeaders(redirectRes);
  }

  // Teruskan request dengan header bersih + x-verified-user-id dari server
  const response = NextResponse.next({
    request: { headers: buildForwardHeaders(request, user) }
  });

  pendingCookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });

  if (shouldClearStaleCookies) {
    clearStaleSupabaseCookies(request, response);
  }

  if (isApiRoute) {
    response.headers.set("Cache-Control", "no-store, private");
  }

  return applySecurityHeaders(response);
}

export const config = {
  matcher: [
    "/((?!api/health|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf)$).*)"
  ]
};
