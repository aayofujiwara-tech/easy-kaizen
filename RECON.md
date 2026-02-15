# 偵察結果（Reconnaissance Report）

実行日時: 2026-02-15
対象: Easy Kaizen - 改善報告システム

## 1. APIエンドポイント一覧

| エンドポイント | メソッド | 認証 | 入力パラメータ | 入力の行き先 | リスク |
|---|---|---|---|---|---|
| `/api/submit` | POST | なし（公開） | `emotion`, `text`, `base_id`, `reporter_name`, `image` (FormData) | DB保存, AI送信, Google Sheets, メール通知, CSV出力 | **高** - 全ての入力がそのまま保存・転送される |
| `/api/auth/login` | POST | なし（トークン検証） | `token` (JSON body) | 環境変数と比較 | **中** - ブルートフォース対象 |
| `/api/auth/logout` | POST | なし | なし | Cookie削除のみ | **低** |
| `/api/reports` | GET | Cookie認証 | `page`, `limit`, `emotion`, `base_id`, `status`, `keyword`, `date_from`, `date_to` (Query) | DB検索条件 (LIKE含む) | **中** - keyword がLIKE検索に使用 |
| `/api/reports/[id]/status` | PATCH | Cookie認証 | `status` (JSON body), `id` (URL path) | DB更新 | **中** - IDの推測・IDOR |
| `/api/reports/export` | GET | Cookie認証 | `emotion`, `base_id`, `status`, `keyword`, `date_from`, `date_to` (Query) | CSV生成 | **高** - CSV Injection |
| `/api/reports/stats` | GET | Cookie認証 | なし | DB集計クエリ | **低** |
| `/api/board` | GET | なし（公開） | `base` (Query) | DB検索条件 | **低** - 公開情報のみ返す |

## 2. QRコードから到達可能なフロー

QRコードは以下のURLをエンコードしている想定：

```
投稿画面: https://app.example.com/?base=hq
ボード:   https://app.example.com/board?base=pacific
```

### フロー1: 投稿（匿名・認証不要）
```
QRスキャン → /?base=hq → 投稿フォーム表示
  → POST /api/submit (FormData)
    → DB INSERT (raw_text, emotion, base_id, reporter_name)
    → AI API呼び出し (Gemini/OpenAI)
    → Google Sheets追記
    → メール送信
    → CSV出力（管理者がダウンロード時）
```

### フロー2: 対応状況ボード（公開・認証不要）
```
QRスキャン → /board?base=pacific
  → GET /api/board?base=pacific
    → DB SELECT (summary, category, priority, status, created_at のみ)
    → JSON返却
```

### フロー3: ダッシュボード（認証必要）
```
/dashboard → ログインフォーム → POST /api/auth/login
  → Cookie発行 → GET /api/reports
  → PATCH /api/reports/[id]/status
  → GET /api/reports/export (CSV)
  → GET /api/reports/stats
```

## 3. 入力パラメータ詳細

### POST /api/submit（最大の攻撃面）
| パラメータ | 型 | 検証 | 最大長 | 行き先 |
|---|---|---|---|---|
| `emotion` | string | ホワイトリスト (`red`/`yellow`/`blue`) | - | DB, AI, Sheets, メール |
| `text` | string | 空チェック、最大長チェック | 2000文字 | DB, AI, Sheets, メール, CSV |
| `base_id` | string | ホワイトリスト (BASE_MAP) | - | DB, Sheets, メール |
| `reporter_name` | string | trim, 最大長 | 50文字 | DB, Sheets, メール, CSV |
| `image` | File | MIME, マジックバイト, サイズ | 5MB | Google Drive, メール添付 |

### CSRFチェック
- `Origin` ヘッダーと `Host` ヘッダーの一致を検証
- `Referer` ヘッダーの `Host` プレフィックスを検証
- `Host` ヘッダーが存在しない場合は403拒否

### レートリミット
- 汎用: 10リクエスト/分/IP
- 投稿専用: 3リクエスト/分/IP + グローバル30リクエスト/分
- IPはSHA-256ハッシュ化（ランダムソルト付き）

## 4. セキュリティヘッダー

| ヘッダー | 値 |
|---|---|
| Content-Security-Policy | `default-src 'self'; script-src 'self' 'unsafe-inline'; ...` |
| X-Content-Type-Options | `nosniff` |
| X-Frame-Options | `DENY` |
| X-XSS-Protection | `1; mode=block` |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| Permissions-Policy | `camera=(self), microphone=(self), geolocation=()` |

## 5. 攻撃面サマリ

| 攻撃ベクトル | 対象 | 深刻度 |
|---|---|---|
| スパム投稿 | POST /api/submit | 高 |
| CSV Injection | text, reporter_name → CSV出力 | 高 |
| AI Prompt Injection | text → AI API | 高 |
| XSS | text, reporter_name → HTML表示 | 中 |
| CSRF | POST /api/submit | 中 |
| SQL Injection | keyword → LIKE検索 | 中 |
| LIKE ワイルドカード | keyword → DB検索 | 中 |
| 認証バイパス | /api/reports, /api/reports/export | 中 |
| Open Redirect | base パラメータ | 低 |
| 情報漏洩 | エラーレスポンス | 低 |
| ReDoS | 正規表現入力 | 低 |
