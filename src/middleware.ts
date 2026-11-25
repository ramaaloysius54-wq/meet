import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// --- 1. KONFIGURASI KEAMANAN ---
const LEGACY_BLOCKED_ROUTES = /^\/(api\/)?(contacts|upgrade|billing)(\/|$)/i;
const ALLOWED_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);

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

function getClientIp(req: NextRequest): string {
  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
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

function blockedResponse(status: 400 | 403 | 404 | 405 | 429, message: string): NextResponse {
  const res = new NextResponse(message, {
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

function runSecurityWaf(request: NextRequest): NextResponse | null {
  const ip = getClientIp(request);
  const method = request.method.toUpperCase();
  const userAgent = request.headers.get("user-agent") || "";
  const rawPathname = request.nextUrl.pathname;
  const rawSearch = request.nextUrl.search || "";

  // 1. Tolak IP yang sedang di-ban karena aktivitas scanning/attack
  if (isIpBanned(ip)) {
    return blockedResponse(403, "Forbidden");
  }

  // 2. Tolak metode HTTP yang tidak diperlukan (TRACE, TRACK, CONNECT, dll.)
  if (!ALLOWED_METHODS.has(method)) {
    return blockedResponse(405, "Method Not Allowed");
  }

  // 3. Blokir User-Agent scanner otomatis (sqlmap, nikto, dirsearch, nuclei, dll.)
  if (userAgent && SCANNER_UA_PATTERN.test(userAgent)) {
    recordStrike(ip);
    return blockedResponse(403, "Forbidden");
  }

  // 4. Decode URL & cek Path Traversal / malform encoding
  const decodedPath = safeDecode(rawPathname);
  const decodedSearch = safeDecode(rawSearch);
  if (decodedPath === null || decodedSearch === null) {
    recordStrike(ip);
    return blockedResponse(400, "Bad Request");
  }

  // 4b. Tutup rute lama Contacts/Upgrade/Billing agar tidak bisa diakses langsung
  if (LEGACY_BLOCKED_ROUTES.test(decodedPath)) {
    return blockedResponse(404, "Not Found");
  }

  // 5. Blokir akses .env, .git, backup file, dan path probing
  if (BLOCKED_PATH_PATTERNS.some((p) => p.test(decodedPath))) {
    recordStrike(ip);
    return blockedResponse(404, "Not Found");
  }

  // 6. Anti-SQL Injection & Anti-XSS/LFI pada path dan query string
  const combinedTarget = `${decodedPath} ${decodedSearch}`;
  if (
    SQLI_PATTERNS.some((p) => p.test(combinedTarget)) ||
    INJECTION_PATTERNS.some((p) => p.test(combinedTarget))
  ) {
    recordStrike(ip);
    return blockedResponse(403, "Forbidden");
  }

  // 7. Rate Limiting bertingkat (Anti Brute-Force & Anti Burp Intruder)
  const isApi = decodedPath.startsWith("/api/");
  const isAuth =
    decodedPath.startsWith("/login") ||
    decodedPath.startsWith("/register") ||
    decodedPath.startsWith("/auth");

  if (isAuth && isRateLimited(ip, "auth", 25)) {
    return blockedResponse(429, "Too Many Requests");
  }
  if (isApi && isRateLimited(ip, "api", 60)) {
    return blockedResponse(429, "Too Many Requests");
  }
  if (!isApi && !isAuth && isRateLimited(ip, "web", 120)) {
    return blockedResponse(429, "Too Many Requests");
  }

  // 8. Anti-CSRF untuk API mutasi (validasi Origin vs Host)
  if (isApi && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const origin = request.headers.get("origin");
    const rawHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
    const host = rawHost ? rawHost.split(",")[0].trim() : null;
    if (origin && host) {
      try {
        if (new URL(origin).host !== host) {
          return blockedResponse(403, "Forbidden: Invalid Origin");
        }
      } catch {
        return blockedResponse(403, "Forbidden: Invalid Origin");
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
    return NextResponse.json({ status: "ok" }, { status: 200 });
  }

  const securityBlock = runSecurityWaf(request);
  if (securityBlock) return securityBlock;

  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return applySecurityHeaders(response);
  }

  const hasSupabaseCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-"));

  let user = null;
  let shouldClearStaleCookies = false;

  if (hasSupabaseCookie) {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
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
      } else {
        user = data.user;
      }
    } catch {
      shouldClearStaleCookies = true;
    }
  }

  const isPublicAuthPage = pathname.startsWith("/login") || pathname.startsWith("/register");
  const isAuthCallback = pathname.startsWith("/auth");
  const isApiRoute = pathname.startsWith("/api");

  if (!user && !isPublicAuthPage && !isAuthCallback && !isApiRoute) {
    const loginUrl = new URL("/login", request.url);
    const safeRedirect =
      pathname.startsWith("/") && !pathname.startsWith("//") ? pathname : "/";
    loginUrl.searchParams.set("redirect", safeRedirect);
    const redirectRes = NextResponse.redirect(loginUrl);
    if (shouldClearStaleCookies) {
      clearStaleSupabaseCookies(request, redirectRes);
    }
    return applySecurityHeaders(redirectRes);
  }

  if (user && isPublicAuthPage) {
    return applySecurityHeaders(NextResponse.redirect(new URL("/", request.url)));
  }

  if (shouldClearStaleCookies) {
    clearStaleSupabaseCookies(request, response);
  }

  return applySecurityHeaders(response);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"]
};
