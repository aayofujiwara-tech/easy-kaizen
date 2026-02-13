const SYSTEM_PROMPT = `あなたは工場や現場の改善提案を構造化するアシスタントです。
現場スタッフから送られてくる改善報告を分析し、以下のJSON形式で返してください。

出力形式（JSON）:
{
  "summary": "現場の言葉を標準的な日本語に直した1行要約（30文字以内）",
  "category": "分類カテゴリ（安全/品質/効率/環境/コスト/コミュニケーション/その他）",
  "priority": 優先度（1-5の整数。5が最も緊急）,
  "feedback_to_user": "投稿者へのポジティブで教育的なフィードバック（やさしい言葉で、ひらがな多めに）"
}

優先度の基準:
- 5: 安全に関わる緊急の問題
- 4: 品質や生産に大きく影響する問題
- 3: 改善すれば効率が上がる提案
- 2: あると嬉しい改善
- 1: 良い気づき・ナイスの共有

フィードバックのルール:
- 難しい漢字は使わない
- 投稿してくれたことを褒める
- 具体的に何が良かったか伝える
- 改善のヒントがあれば添える
- 「ナイス！」「すごい！」など元気の出る言葉を使う

必ずJSON形式のみで回答してください。マークダウンのコードブロックは使わないでください。`;

interface AiResult {
  summary: string;
  category: string;
  priority: number;
  feedback_to_user: string;
}

function buildUserMessage(emotion: string, text: string): string {
  const emotionLabels: Record<string, string> = {
    red: "イラッ（問題点）",
    yellow: "提案・相談",
    blue: "発見・ナイス",
  };
  const label = emotionLabels[emotion] || emotion;
  return `【感情ラベル】${label}\n【報告内容】${text}`;
}

function isValidApiKey(key: string | undefined): key is string {
  return !!key && !key.startsWith("your_") && key.length > 10;
}

export async function analyzeWithAi(
  emotion: string,
  text: string
): Promise<AiResult> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (isValidApiKey(geminiKey)) {
    return analyzeWithGemini(geminiKey, emotion, text);
  } else if (isValidApiKey(openaiKey)) {
    return analyzeWithOpenAi(openaiKey, emotion, text);
  } else {
    // フォールバック: APIキーがない場合のデフォルト処理
    return generateFallbackResult(emotion, text);
  }
}

async function analyzeWithGemini(
  apiKey: string,
  emotion: string,
  text: string
): Promise<AiResult> {
  try {
    const userMessage = buildUserMessage(emotion, text);

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: `${SYSTEM_PROMPT}\n\n${userMessage}` },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error("Gemini API error:", errText);
      return generateFallbackResult(emotion, text);
    }

    const data = await res.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) {
      return generateFallbackResult(emotion, text);
    }

    return JSON.parse(content) as AiResult;
  } catch (error) {
    console.error("Gemini fetch error:", error);
    return generateFallbackResult(emotion, text);
  }
}

async function analyzeWithOpenAi(
  apiKey: string,
  emotion: string,
  text: string
): Promise<AiResult> {
  try {
    const userMessage = buildUserMessage(emotion, text);

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("OpenAI API error:", errText);
      return generateFallbackResult(emotion, text);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return generateFallbackResult(emotion, text);
    }

    return JSON.parse(content) as AiResult;
  } catch (error) {
    console.error("OpenAI fetch error:", error);
    return generateFallbackResult(emotion, text);
  }
}

function generateFallbackResult(emotion: string, text: string): AiResult {
  const priorityMap: Record<string, number> = {
    red: 4,
    yellow: 3,
    blue: 1,
  };
  const categoryMap: Record<string, string> = {
    red: "安全",
    yellow: "効率",
    blue: "その他",
  };
  const feedbackMap: Record<string, string> = {
    red: "きづいてくれて ありがとう！みんなの あんぜんを まもる だいじな ほうこくです。すぐに かくにん します！",
    yellow:
      "いい ていあん ですね！げんばの こえが いちばん たいせつ。いっしょに かいぜん していきましょう！",
    blue: "ナイス はっけん！いいところに きづける あなたは すごい！みんなにも きょうゆう しますね！",
  };

  return {
    summary: text.slice(0, 30),
    category: categoryMap[emotion] || "その他",
    priority: priorityMap[emotion] || 3,
    feedback_to_user:
      feedbackMap[emotion] ||
      "ほうこく ありがとう！げんばの こえを とどけてくれて うれしいです！",
  };
}
