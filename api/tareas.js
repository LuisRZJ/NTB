// api/tareas.js — Endpoint de solo lectura para consultar tareas del día por prioridad
// Soporta CORS para frontend/backend, autenticación por token y rate limiting integrado.

// ── Rate Limiter en Memoria (Ventana Deslizante) ──
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minuto
const RATE_LIMIT_MAX_REQUESTS = 30;     // 30 peticiones por minuto por IP
const ipRequestMap = new Map();

// Limpieza periódica de IPs inactivas para evitar consumo de memoria
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of ipRequestMap.entries()) {
    if (now - data.resetTime > RATE_LIMIT_WINDOW_MS) {
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
    return {
      allowed: true,
      limit: RATE_LIMIT_MAX_REQUESTS,
      remaining: RATE_LIMIT_MAX_REQUESTS - 1,
      reset: Math.ceil(record.resetTime / 1000)
    };
  }

  record.count++;
  const remaining = Math.max(0, RATE_LIMIT_MAX_REQUESTS - record.count);
  const reset = Math.ceil(record.resetTime / 1000);

  return {
    allowed: record.count <= RATE_LIMIT_MAX_REQUESTS,
    limit: RATE_LIMIT_MAX_REQUESTS,
    remaining,
    reset
  };
}

module.exports = async function handler(req, res) {
  // ── Cabeceras CORS y Anti-Caché ──
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
  res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido (solo GET)' });
  }

  // ── Rate Limiting por IP ──
  const headers = req.headers || {};
  const query = req.query || {};
  const clientIp = (headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || '127.0.0.1').split(',')[0].trim();
  const rateLimit = checkRateLimit(clientIp);

  res.setHeader('X-RateLimit-Limit', rateLimit.limit.toString());
  res.setHeader('X-RateLimit-Remaining', rateLimit.remaining.toString());
  res.setHeader('X-RateLimit-Reset', rateLimit.reset.toString());

  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({
      error: 'Demasiadas solicitudes (Too Many Requests)',
      mensaje: `Has excedido el límite de ${RATE_LIMIT_MAX_REQUESTS} peticiones por minuto. Intenta de nuevo en un momento.`,
      limite: rateLimit.limit,
      reintenta_en_segundos: 60
    });
  }

  // ── Autenticación por Token ──
  const API_KEY = process.env.TASKS_API_KEY || process.env.SYNC_PASSWORD;
  const authHeader = headers['authorization'] || '';
  const customHeader = headers['x-api-key'] || '';
  const queryToken = query.token || query.key || '';

  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const providedToken = bearerToken || customHeader || queryToken;

  if (!API_KEY) {
    return res.status(500).json({ error: 'La variable de entorno TASKS_API_KEY o SYNC_PASSWORD no está configurada en Vercel.' });
  }

  if (!providedToken || providedToken !== API_KEY) {
    return res.status(401).json({
      error: 'No autorizado',
      mensaje: 'Token de acceso inválido o no proporcionado. Envía tu token mediante Authorization: Bearer <TOKEN>, header x-api-key o parámetro ?token='
    });
  }

  // ── Variables de GitHub ──
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_REPO = process.env.GITHUB_REPO;
  const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
  const FILE_PATH = process.env.TAREAS_BACKUP_PATH || 'planner-backup.json';

  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    return res.status(500).json({ error: 'Variables de entorno de GitHub no configuradas en el servidor (GITHUB_TOKEN, GITHUB_REPO).' });
  }

  try {
    // ── Descargar Respaldo desde GitHub REST API ──
    const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${FILE_PATH}?ref=${GITHUB_BRANCH}&_t=${Date.now()}`;
    const ghRes = await fetch(url, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'ntb-tasks-api',
      },
    });

    if (ghRes.status === 404) {
      return res.status(404).json({ error: `El archivo de respaldo "${FILE_PATH}" no existe en el repositorio de GitHub.` });
    }
    if (!ghRes.ok) {
      return res.status(ghRes.status).json({ error: 'Error al consultar la API de GitHub', status: ghRes.status });
    }

    const ghJson = await ghRes.json();
    let backupData;

    if (ghJson.content) {
      const rawBase64 = ghJson.content.replace(/\s/g, '');
      const jsonStr = Buffer.from(rawBase64, 'base64').toString('utf8');
      backupData = JSON.parse(jsonStr);
    } else if (ghJson.download_url) {
      const downloadRes = await fetch(ghJson.download_url, {
        headers: { Authorization: `Bearer ${GITHUB_TOKEN}` }
      });
      backupData = await downloadRes.json();
    } else {
      throw new Error('Formato de respuesta de GitHub desconocido');
    }

    const allTasks = Array.isArray(backupData.tasks) ? backupData.tasks : [];
    const categories = Array.isArray(backupData.categories) ? backupData.categories : [];
    const projects = Array.isArray(backupData.projects) ? backupData.projects : [];

    // Diccionarios para resolución rápida de nombres y colores
    const catMap = Object.fromEntries(categories.map(c => [c.key, { label: c.label, color: c.color }]));
    const projMap = Object.fromEntries(projects.map(p => [p.id, p.name]));

    // ── Zona Horaria y Fecha Objetivo ──
    const timeZone = req.query.tz || process.env.TIMEZONE || 'America/Mexico_City';
    let targetDate = req.query.date;

    if (!targetDate) {
      try {
        const formatter = new Intl.DateTimeFormat('en-CA', {
          timeZone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        });
        targetDate = formatter.format(new Date()); // Retorna YYYY-MM-DD
      } catch (tzErr) {
        // Fallback si la zona horaria proporcionada es inválida
        targetDate = new Date().toISOString().slice(0, 10);
      }
    }

    const includeOverdue = req.query.include_overdue === 'true';

    // Evaluación de repetición semanal (ej: dw:1,2,3,4,5)
    function isAllowedByRepeat(dateStr, repeat) {
      if (!repeat || !repeat.startsWith('dw:')) return true;
      const allowed = repeat.slice(3).split(',').map(Number);
      const [y, m, d] = dateStr.split('-').map(Number);
      const dayOfWeek = new Date(y, m - 1, d).getDay(); // 0=Dom, 1=Lun, ..., 6=Sáb
      return allowed.includes(dayOfWeek);
    }

    // Mapeo de subtareas a sus padres
    const subtaskMap = new Map();
    allTasks.filter(t => t.parentId).forEach(sub => {
      if (!subtaskMap.has(sub.parentId)) subtaskMap.set(sub.parentId, []);
      subtaskMap.get(sub.parentId).push(sub);
    });

    // ── Filtrado de Tareas Pendientes para la Fecha ──
    const pendingTodayTasks = allTasks.filter(t => {
      // Excluir tareas completadas y subtareas independientes
      if (t.done || t.parentId) return false;

      // Coincidencia con la fecha programada
      if (t.due === targetDate) {
        return isAllowedByRepeat(targetDate, t.repeat);
      }

      // Incluir tareas atrasadas no completadas si se solicitó
      if (includeOverdue && t.due && t.due < targetDate) {
        return true;
      }

      return false;
    });

    // ── Ordenamiento Estricto por Prioridad y Hora ──
    const priorityWeight = { high: 1, mid: 2, low: 3 };

    pendingTodayTasks.sort((a, b) => {
      const weightA = priorityWeight[a.pri] || 99;
      const weightB = priorityWeight[b.pri] || 99;
      if (weightA !== weightB) return weightA - weightB;

      // Orden secundario por hora de vencimiento
      const timeA = a.dueTime || '99:99';
      const timeB = b.dueTime || '99:99';
      return timeA.localeCompare(timeB);
    });

    // ── Formateo Detallado de Salida ──
    const formattedTasks = pendingTodayTasks.map(t => {
      const subs = subtaskMap.get(t.id) || [];
      const completedSubs = subs.filter(s => s.done).length;

      const taskCats = Array.isArray(t.cats) && t.cats.length ? t.cats : (t.cat ? [t.cat] : []);
      const resolvedCats = taskCats.map(cKey => ({
        key: cKey,
        label: catMap[cKey]?.label || cKey,
        color: catMap[cKey]?.color || '#94a3b8'
      }));

      const isOverdue = Boolean(t.due && t.due < targetDate);

      return {
        id: t.id,
        titulo: t.text,
        descripcion: t.desc || '',
        prioridad: t.pri || 'mid',
        prioridad_texto: t.pri === 'high' ? 'Alta' : t.pri === 'low' ? 'Baja' : 'Media',
        fecha_vencimiento: t.due,
        hora_vencimiento: t.dueTime || null,
        esta_atrasada: isOverdue,
        proyecto: t.project ? (projMap[t.project] || t.project) : null,
        categorias: resolvedCats,
        es_recurrente: Boolean(t.repeat),
        regla_repeticion: t.repeat || null,
        subtareas: {
          total: subs.length,
          completadas: completedSubs,
          pendientes: subs.length - completedSubs,
          progreso_porcentaje: subs.length ? Math.round((completedSubs / subs.length) * 100) : 100,
          items: subs.map(s => ({
            id: s.id,
            titulo: s.text,
            completada: s.done,
            prioridad: s.pri || 'mid'
          }))
        }
      };
    });

    // Resumen estadístico
    const summary = {
      alta: formattedTasks.filter(t => t.prioridad === 'high').length,
      media: formattedTasks.filter(t => t.prioridad === 'mid').length,
      baja: formattedTasks.filter(t => t.prioridad === 'low').length,
      con_hora_definida: formattedTasks.filter(t => t.hora_vencimiento !== null).length,
      atrasadas_incluidas: formattedTasks.filter(t => t.esta_atrasada).length
    };

    return res.status(200).json({
      fecha: targetDate,
      zona_horaria: timeZone,
      total_pendientes: formattedTasks.length,
      resumen_prioridad: summary,
      tareas: formattedTasks
    });

  } catch (error) {
    return res.status(500).json({
      error: 'Error interno del servidor al procesar las tareas',
      detalle: error.message
    });
  }
};
