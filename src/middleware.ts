import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  if (process.env.MAINTENANCE_MODE !== "true") {
    return NextResponse.next();
  }

  const { pathname } = req.nextUrl;

  // メンテナンス画面自体・静的アセット・faviconは除外
  if (
    pathname.startsWith("/maintenance") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // API リクエストには 503 を返す
  if (pathname.startsWith("/api")) {
    return NextResponse.json(
      { error: "ただいま メンテナンスちゅう です。しばらく おまちください。" },
      { status: 503, headers: { "Retry-After": "300" } }
    );
  }

  // ページリクエストはメンテナンス画面にリライト
  const url = req.nextUrl.clone();
  url.pathname = "/maintenance";
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
