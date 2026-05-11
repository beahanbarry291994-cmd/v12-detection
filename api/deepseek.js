// DeepSeek API 代理 — Vercel Serverless Function
// 前端发送 { apiKey, model, messages, max_tokens }
// 本函数转发到 DeepSeek API 并返回结果

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { apiKey, model, messages, max_tokens } = req.body;

  if (!apiKey) {
    return res.status(400).json({ error: '缺少 apiKey' });
  }

  try {
    const resp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model || 'deepseek-v4-flash',
        messages: messages || [],
        max_tokens: max_tokens || 300
      })
    });

    const data = await resp.json();

    if (!resp.ok) {
      return res.status(resp.status).json(data);
    }

    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: '代理请求失败: ' + e.message });
  }
}
