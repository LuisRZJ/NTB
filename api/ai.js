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

const MODEL_PRICING_PER_MILLION = {
  'gemini-2.5-flash-lite': { input: 0.10, cachedInput: 0.025, output: 0.40 },
  'gemini-3.5-flash-lite': { input: 0.10, cachedInput: 0.025, output: 0.40 },
  'gemini-2.5-flash': { input: 0.30, cachedInput: 0.075, output: 2.50 },
  'gemini-2.5-pro': { input: 1.25, cachedInput: 0.3125, output: 10.00 },
  'gemini-2.0-flash-lite': { input: 0.075, cachedInput: 0.01875, output: 0.30 },
  'gemini-2.0-flash': { input: 0.10, cachedInput: 0.025, output: 0.40 },
  'mistral-small': { input: 0.10, cachedInput: 0.05, output: 0.30 },
  'claude-3.5-sonnet': { input: 3.00, cachedInput: 0.30, output: 15.00 },
  'claude-3.7-sonnet': { input: 3.00, cachedInput: 0.30, output: 15.00 },
  'claude-3.5-haiku': { input: 0.80, cachedInput: 0.08, output: 4.00 },
  'gpt-4o-mini': { input: 0.15, cachedInput: 0.075, output: 0.60 },
  'gpt-4o': { input: 2.50, cachedInput: 1.25, output: 10.00 },
  'deepseek-chat': { input: 0.27, cachedInput: 0.07, output: 1.10 },
  'deepseek-reasoner': { input: 0.55, cachedInput: 0.14, output: 2.19 },
  'deepseek-r1': { input: 0.55, cachedInput: 0.14, output: 2.19 }
};

function getModelPricing(modelName) {
  if (!modelName || typeof modelName !== 'string') return null;
  let norm = modelName.trim().toLowerCase();
  if (norm.startsWith('models/')) norm = norm.slice(7);
  if (norm.includes('/')) norm = norm.split('/').pop();
  norm = norm.split(':')[0];
  if (MODEL_PRICING_PER_MILLION[norm]) return MODEL_PRICING_PER_MILLION[norm];
  const keys = Object.keys(MODEL_PRICING_PER_MILLION).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (norm === key || norm.startsWith(key) || norm.includes(key)) {
      return MODEL_PRICING_PER_MILLION[key];
    }
  }
  return null;
}

function buildUsagePayload({ promptTokens = 0, cachedTokens = 0, cacheWriteTokens = 0, completionTokens = 0, totalTokens = 0, cacheMode = 'implicit', model = '', providerCostUsd = null }) {
  const prompt = Math.max(0, Number(promptTokens) || 0);
  const cached = Math.max(0, Number(cachedTokens) || 0);
  const cacheWrite = Math.max(0, Number(cacheWriteTokens) || 0);
  const completion = Math.max(0, Number(completionTokens) || 0);
  const total = Math.max(0, Number(totalTokens) || (prompt + completion));
  const ratio = prompt > 0 ? Math.min(1, Math.max(0, cached / prompt)) : 0;

  const pricing = getModelPricing(model);
  let costUsd = 0;
  let costSource = 'unknown';

  if (typeof providerCostUsd === 'number' && Number.isFinite(providerCostUsd) && providerCostUsd >= 0) {
    costUsd = Number(providerCostUsd.toFixed(6));
    costSource = 'provider';
  } else if (pricing) {
    const nonCachedInput = Math.max(0, prompt - cached);
    const rawCost = ((nonCachedInput * pricing.input) + (cached * pricing.cachedInput) + (completion * pricing.output)) / 1e6;
    costUsd = Number(rawCost.toFixed(6));
    costSource = 'estimated';
  }

  const savedUsd = (pricing && cached > 0)
    ? Number(((cached * Math.max(0, pricing.input - pricing.cachedInput)) / 1e6).toFixed(6))
    : 0;

  return {
    promptTokens: prompt,
    cachedTokens: cached,
    cacheWriteTokens: cacheWrite,
    completionTokens: completion,
    totalTokens: total,
    cacheHitRatio: Number(ratio.toFixed(4)),
    cacheMode,
    costUsd,
    savedUsd,
    costSource
  };
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
      const meta = data.usageMetadata || {};
      const usage = buildUsagePayload({
        promptTokens: meta.promptTokenCount,
        cachedTokens: meta.cachedContentTokenCount,
        completionTokens: meta.candidatesTokenCount,
        totalTokens: meta.totalTokenCount,
        cacheMode: 'implicit',
        model: cleanModel,
        providerCostUsd: null
      });
      return res.status(200).json({
        text: text.trim(),
        provider: 'googleai',
        model: cleanModel,
        usage
      });
    }

    // OpenRouter
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'La variable de entorno OPENROUTER_API_KEY no está configurada en Vercel.' });
    }

    const cleanModel = (typeof model === 'string' && model.trim()) ? model.trim() : 'mistralai/mistral-small-2603';
    const conversationMessages = messages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content ?? '')
    }));

    const buildOpenRouterBody = (useExplicitCache) => {
      const apiMessages = [];
      if (systemInstruction) {
        if (useExplicitCache) {
          apiMessages.push({
            role: 'system',
            content: [
              {
                type: 'text',
                text: String(systemInstruction),
                cache_control: { type: 'ephemeral' }
              }
            ]
          });
        } else {
          apiMessages.push({ role: 'system', content: String(systemInstruction) });
        }
      }
      apiMessages.push(...conversationMessages);

      const bodyObj = {
        model: cleanModel,
        messages: apiMessages,
        usage: { include: true }
      };
      if (isJson) {
        bodyObj.response_format = { type: 'json_object' };
      }
      if (maxTokens) {
        bodyObj.max_tokens = Number(maxTokens);
      }
      return bodyObj;
    };

    const reqOrigin = headers.origin || headers.referer || 'https://ntb-workspace.vercel.app';
    const sendOpenRouterRequest = (useExplicitCache) => fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': reqOrigin,
        'X-Title': 'Daily Planner App',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(buildOpenRouterBody(useExplicitCache))
    });

    let cacheMode = systemInstruction ? 'explicit' : 'implicit';
    let upstreamRes = await sendOpenRouterRequest(Boolean(systemInstruction));

    if (!upstreamRes.ok && upstreamRes.status === 400 && systemInstruction) {
      cacheMode = 'implicit';
      upstreamRes = await sendOpenRouterRequest(false);
    }

    if (!upstreamRes.ok) {
      const errData = await upstreamRes.json().catch(() => null);
      const msg = errData?.error?.message || `Error HTTP ${upstreamRes.status} en OpenRouter`;
      return res.status(upstreamRes.status).json({ error: msg });
    }

    const data = await upstreamRes.json();
    const text = data.choices?.[0]?.message?.content || '';
    const rawUsage = data.usage || {};
    const promptDetails = rawUsage.prompt_tokens_details || {};
    const providerCostUsd = typeof rawUsage.cost === 'number'
      ? rawUsage.cost
      : (typeof rawUsage.total_cost === 'number' ? rawUsage.total_cost : null);
    const usage = buildUsagePayload({
      promptTokens: rawUsage.prompt_tokens,
      cachedTokens: promptDetails.cached_tokens ?? rawUsage.cached_tokens,
      cacheWriteTokens: promptDetails.cache_write_tokens ?? rawUsage.cache_creation_input_tokens,
      completionTokens: rawUsage.completion_tokens,
      totalTokens: rawUsage.total_tokens,
      cacheMode,
      model: cleanModel,
      providerCostUsd
    });
    return res.status(200).json({
      text: text.trim(),
      provider: 'openrouter',
      model: cleanModel,
      usage
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Error interno al consultar proveedor de IA' });
  }
};
