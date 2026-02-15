# メール送信・スプレッドシート書き込み 障害調査報告

## 概要
投稿(submit)処理は正常に完了するが、メール送信とGoogle Sheets書き込みが実行されない問題を調査した。

---

## 根本原因

**`src/app/api/submit/route.ts` 193行目: `Promise.allSettled()` に `await` がなかった**

### 修正前のコード
```typescript
// ❌ await がない — fire-and-forget（発火して放置）
Promise.allSettled([
  appendToSheet(backgroundPayload),
  sendNotificationEmail(backgroundPayload),
]).then(([sheetsResult, emailResult]) => { ... });

// レスポンスが即座に返却される
return NextResponse.json({ id, feedback_to_user, summary });
```

### 何が起きていたか
1. `Promise.allSettled(...)` は非同期処理を開始するが、`await` がないため「完了を待たない」
2. 次の行 `return NextResponse.json(...)` で即座にHTTPレスポンスが返却される
3. **Vercelサーバーレス環境では、レスポンス返却後にプロセスが終了する**
4. メール送信・Sheets API呼び出しは接続確立すらできないまま中断される

### 影響範囲
- メール通知: 全投稿で送信されない
- Google Sheets: 全投稿で書き込まれない
- DB保存・AI分析: **正常**（`await` されているため）

---

## 修正内容

### 修正後のコード
```typescript
// ✅ await を追加 — 完了を待ってからレスポンスを返す
const [sheetsResult, emailResult] = await Promise.allSettled([
  appendToSheet(backgroundPayload),
  sendNotificationEmail(backgroundPayload),
]);
if (sheetsResult.status === "rejected") {
  console.error("[Google Sheets] 書き込みエラー:", sheetsResult.reason);
}
if (emailResult.status === "rejected") {
  console.error("[Email] 送信エラー:", emailResult.reason);
}

return NextResponse.json({ id, feedback_to_user, summary });
```

### 修正のポイント
| 項目 | 説明 |
|---|---|
| `await` 追加 | Sheets書き込み・メール送信が完了してからレスポンスを返す |
| `Promise.allSettled` を維持 | 片方が失敗しても、もう片方は実行される |
| エラーログ出力 | `rejected` の場合にログ出力（投稿自体は成功扱い） |
| ユーザー体感 | Sheets/メール処理分（通常1-3秒）レスポンスが遅くなるが、確実に実行される |

---

## 副次的な確認事項

### 問題なし
| チェック項目 | 結果 |
|---|---|
| 環境変数のビルド時固定 | 問題なし — `process.env` は関数内で読み取り |
| 秘密鍵の改行処理 | 問題なし — `\\n` → `\n` 変換済み |
| プレースホルダー判定 | 問題なし — `your_` / `YOUR_KEY_HERE` で正しく判定 |
| Sheets APIのスコープ | 問題なし — `spreadsheets` + `drive` の両方を設定済み |

### 要注意（環境依存）
| チェック項目 | 確認方法 |
|---|---|
| SMTP接続 | Vercelでポート587が通るか → デプロイ後のログで確認 |
| Google Sheets API認証 | サービスアカウントの権限 → デプロイ後のログで確認 |
| Vercel環境変数 | Vercelダッシュボードで正しく設定されているか確認 |

---

## 検証方法

デプロイ後に以下を確認:

1. **テスト投稿を実行**
2. **Vercelログを確認** — 以下のログが出力されること:
   - `[Email] 通知メールを xxx へ送信します...`
   - `[Email] 送信完了: xxx`
   - `[Sheets] No.X — 投稿ログ + 対応管理シートに追記完了`
3. **メールの到着を確認**
4. **Google Sheetsにデータが追記されたことを確認**

エラーが出る場合は、ログのエラーメッセージから具体的な原因（認証エラー、ネットワークエラー等）を特定できます。

---

## 修正ファイル
- `src/app/api/submit/route.ts` — `Promise.allSettled` に `await` を追加（1行変更）
