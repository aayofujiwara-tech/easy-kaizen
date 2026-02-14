/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",      // Next.jsハイドレーションに必要。unsafe-evalは除去
              "style-src 'self' 'unsafe-inline'",        // Tailwind CSS に必要
              "img-src 'self' data: blob:",
              "font-src 'self'",
              "connect-src 'self'",
              "frame-ancestors 'none'",                  // クリックジャッキング防止（X-Frame-Optionsを補強）
              "base-uri 'self'",                         // <base>タグ乗っ取り防止
              "form-action 'self'",                      // フォーム送信先を自サイトに限定
            ].join("; "),
          },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self), geolocation=()",  // GPS取得を禁止
          },
        ],
      },
    ];
  },
};

export default nextConfig;
