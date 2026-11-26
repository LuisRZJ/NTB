// api/ai.js — Proxy serverless seguro para OpenRouter y Google AI Studio

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 60;
const ipRequestMap = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of ipRequestMap.entries()) {
    if (now > data.resetTime) {
      ipRequestMap.delete(ip);
    }
  }
}, 5 * 60 * 1000);

function checkRateLimit(ip) {
  const now = Date.now();
  let record = ipRequestMap.get(ip);

  if (!record || now > record.resetTime) {
    record = { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS };
    ipRequestMap.set(ip, record);
    return { allowed: true };
  }

  record.count++;
  return { allowed: record.count <= RATE_LIMIT_MAX_REQUESTS };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido (solo POST)' });
  }

  const headers = req.headers || {};
  const clientIp = (headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || '127.0.0.1').split(',')[0].trim();
  const rateLimit = checkRateLimit(clientIp);
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'Demasiadas solicitudes a la IA. Intenta en un minuto.' });
  }

  const SYNC_PASSWORD = process.env.SYNC_PASSWORD;
  if (!SYNC_PASSWORD) {
    return res.status(500).json({ error: 'La variable de entorno SYNC_PASSWORD no está configurada en Vercel.' });
  }

  const {
    password,
    action = 'chat',
    provider,
    model,
    messages,
    systemInstruction,
    isJson,
    maxTokens
  } = req.body || {};

  if (!password || password !== SYNC_PASSWORD) {
    return res.status(401).json({ error: 'No autorizado: contraseña de sincronización incorrecta o faltante.' });
  }

  if (action === 'status') {
    return res.status(200).json({
      ok: true,
      providers: {
        openrouter: Boolean(process.env.OPENROUTER_API_KEY),
        googleai: Boolean(process.env.GOOGLE_AI_API_KEY)
      }
    });
  }

  if (action !== 'chat') {
    return res.status(400).json({ error: 'Acción inválida (usa "status" o "chat").' });
  }

  const normalizedProvider = (provider === 'googleai' || provider === 'google') ? 'googleai' : (provider === 'openrouter' ? 'openrouter' : null);
  if (!normalizedProvider) {
    return res.status(400).json({ error: 'Proveedor de IA inválido (debe ser "openrouter" o "googleai").' });
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'El arreglo "messages" es obligatorio y no puede estar vacío.' });
  }

  try {
    if (normalizedProvider === 'googleai') {
      const apiKey = process.env.GOOGLE_AI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: 'La variable de entorno GOOGLE_AI_API_KEY no está configurada en Vercel.' });
      }

      const rawModel = (typeof model === 'string' && model.trim()) ? model.trim() : 'gemini-2.5-flash';
      const cleanModel = rawModel.startsWith('models/') ? rawModel.slice(7) : rawModel;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cleanModel)}:generateContent`;

      const contents = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String(m.content ?? '') }]
      }));

      const reqBody = { contents };
      if (systemInstruction) {
        reqBody.systemInstruction = { parts: [{ text: String(systemInstruction) }] };
      }

      const generationConfig = {};
      if (isJson) generationConfig.responseMimeType = 'application/json';
      if (maxTokens) generationConfig.maxOutputTokens = Number(maxTokens);
      if (Object.keys(generationConfig).length > 0) {
        reqBody.generationConfig = generationConfig;
      }

      const upstreamRes = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify(reqBody)
      });

      if (!upstreamRes.ok) {
        const errData = await upstreamRes.json().catch(() => null);
        const msg = errData?.error?.message || `Error HTTP ${upstreamRes.status} en Google AI Studio`;
        return res.status(upstreamRes.status).json({ error: msg });
      }

      const data = await upstreamRes.json();
      const text = data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
      return res.status(200).json({
        text: text.trim(),
        provider: 'googleai',
        model: cleanModel
      });
    }

    // OpenRouter
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'La variable de entorno OPENROUTER_API_KEY no está configurada en Vercel.' });
    }

    const cleanModel = (typeof model === 'string' && model.trim()) ? model.trim() : 'mistralai/mistral-small-2603';
    const apiMessages = [];
    if (systemInstruction) {
      apiMessages.push({ role: 'system', content: String(systemInstruction) });
    }
    for (const m of messages) {
      apiMessages.push({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content ?? '')
      });
    }

    const bodyObj = {
      model: cleanModel,
      messages: apiMessages
    };
    if (isJson) {
      bodyObj.response_format = { type: 'json_object' };
    }
    if (maxTokens) {
      bodyObj.max_tokens = Number(maxTokens);
    }

    const reqOrigin = headers.origin || headers.referer || 'https://ntb-workspace.vercel.app';
    const upstreamRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': reqOrigin,
        'X-Title': 'Daily Planner App',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(bodyObj)
    });

    if (!upstreamRes.ok) {
      const errData = await upstreamRes.json().catch(() => null);
      const msg = errData?.error?.message || `Error HTTP ${upstreamRes.status} en OpenRouter`;
      return res.status(upstreamRes.status).json({ error: msg });
    }

    const data = await upstreamRes.json();
    const text = data.choices?.[0]?.message?.content || '';
    return res.status(200).json({
      text: text.trim(),
      provider: 'openrouter',
      model: cleanModel
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Error interno al consultar proveedor de IA' });
  }
};
