// api/sync.js — Proxy serverless unificado para sincronización segura con GitHub

module.exports = async function handler(req, res) {
  // Cabeceras CORS para desarrollo local con `vercel dev`
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido (solo POST)' });
  }

  const { password, module: appModule, action, data } = req.body || {};

  // 1. Validar variables de entorno críticas del servidor
  const SYNC_PASSWORD = process.env.SYNC_PASSWORD;
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_REPO = process.env.GITHUB_REPO;
  const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

  if (!SYNC_PASSWORD) {
    return res.status(500).json({ error: 'La variable de entorno SYNC_PASSWORD no está configurada en Vercel.' });
  }
  if (!GITHUB_TOKEN) {
    return res.status(500).json({ error: 'La variable de entorno GITHUB_TOKEN no está configurada en Vercel.' });
  }
  if (!GITHUB_REPO) {
    return res.status(500).json({ error: 'La variable de entorno GITHUB_REPO no está configurada en Vercel.' });
  }

  // 2. Validar autenticación del usuario
  if (!password || password !== SYNC_PASSWORD) {
    return res.status(401).json({ error: 'Contraseña de sincronización incorrecta' });
  }

  // Si solo es verificar autenticación (action === 'auth')
  if (action === 'auth') {
    return res.status(200).json({ ok: true });
  }

  // 3. Validar módulo
  if (!['blog', 'notas', 'tareas'].includes(appModule)) {
    return res.status(400).json({ error: 'Módulo inválido o no especificado (debe ser blog, notas o tareas)' });
  }

  // 4. Resolver nombre del archivo según el módulo
  let filePath = '';
  if (appModule === 'blog') {
    filePath = process.env.BLOG_BACKUP_PATH || 'ntb-backup.json';
  } else if (appModule === 'notas') {
    filePath = process.env.NOTAS_BACKUP_PATH || 'notas-backup.json';
  } else if (appModule === 'tareas') {
    filePath = process.env.TAREAS_BACKUP_PATH || 'planner-backup.json';
  }

  // Configuración de cabeceras para GitHub API
  const BASE_URL = `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`;
  const GH_HEADERS = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'ntb-serverless-sync',
  };

  // ────────────────────────────────────────────────────────────────
  // ACCIÓN: check (Metadatos: SHA y fecha del último commit)
  // ────────────────────────────────────────────────────────────────
  if (action === 'check') {
    try {
      const getRes = await fetch(`${BASE_URL}?ref=${GITHUB_BRANCH}&_t=${Date.now()}`, { headers: GH_HEADERS });
      if (getRes.status === 404) {
        return res.status(200).json({ exists: false, sha: null, updatedAt: null });
      }
      if (!getRes.ok) {
        return res.status(getRes.status).json({ error: 'Error al consultar GitHub', status: getRes.status });
      }

      const getJson = await getRes.json();
      const sha = getJson.sha;

      // Intentar obtener fecha exacta del último commit
      let updatedAt = null;
      try {
        const commitsUrl = `https://api.github.com/repos/${GITHUB_REPO}/commits?path=${filePath}&sha=${GITHUB_BRANCH}&per_page=1&_t=${Date.now()}`;
        const commitsRes = await fetch(commitsUrl, { headers: GH_HEADERS });
        if (commitsRes.ok) {
          const commitsData = await commitsRes.json();
          if (commitsData && commitsData.length > 0) {
            updatedAt = commitsData[0].commit.committer.date;
          }
        }
      } catch (errCommits) {
        console.warn('Error obteniendo commit date:', errCommits.message);
      }

      return res.status(200).json({ exists: true, sha, updatedAt });
    } catch (err) {
      return res.status(500).json({ error: 'Error interno del servidor', detail: err.message });
    }
  }

  // ────────────────────────────────────────────────────────────────
  // ACCIÓN: pull (Descargar y decodificar respaldo)
  // ────────────────────────────────────────────────────────────────
  if (action === 'pull') {
    try {
      const getRes = await fetch(`${BASE_URL}?ref=${GITHUB_BRANCH}&_t=${Date.now()}`, { headers: GH_HEADERS });
      if (getRes.status === 404) {
        return res.status(404).json({ error: 'El archivo de respaldo no existe en el repositorio.' });
      }
      if (!getRes.ok) {
        return res.status(getRes.status).json({ error: 'Error al descargar de GitHub', status: getRes.status });
      }

      const getJson = await getRes.json();
      const sha = getJson.sha;

      // Decodificar Base64 de GitHub a JSON
      const rawBase64 = getJson.content.replace(/\s/g, '');
      const jsonString = Buffer.from(rawBase64, 'base64').toString('utf8');
      const content = JSON.parse(jsonString);

      // Intentar obtener la fecha exacta del commit
      let updatedAt = null;
      try {
        const commitsUrl = `https://api.github.com/repos/${GITHUB_REPO}/commits?path=${filePath}&sha=${GITHUB_BRANCH}&per_page=1&_t=${Date.now()}`;
        const commitsRes = await fetch(commitsUrl, { headers: GH_HEADERS });
        if (commitsRes.ok) {
          const commitsData = await commitsRes.json();
          if (commitsData && commitsData.length > 0) {
            updatedAt = commitsData[0].commit.committer.date;
          }
        }
      } catch (errCommits) {
        console.warn('Error obteniendo commit date:', errCommits.message);
      }

      return res.status(200).json({
        exists: true,
        content,
        sha,
        updatedAt: updatedAt || new Date().toISOString()
      });
    } catch (err) {
      return res.status(500).json({ error: 'Error al descargar/procesar el respaldo', detail: err.message });
    }
  }

  // ────────────────────────────────────────────────────────────────
  // ACCIÓN: push (Crear o actualizar respaldo)
  // ────────────────────────────────────────────────────────────────
  if (action === 'push') {
    if (!data) {
      return res.status(400).json({ error: 'Falta el objeto "data" en el cuerpo para realizar push' });
    }

    try {
      // 1. Obtener el SHA actual para evitar conflictos en GitHub (sobreescribir con seguridad)
      const getRes = await fetch(`${BASE_URL}?ref=${GITHUB_BRANCH}&_t=${Date.now()}`, { headers: GH_HEADERS });
      let sha = null;
      if (getRes.ok) {
        const getJson = await getRes.json();
        sha = getJson.sha;
      }

      // 2. Codificar contenido JSON a base64
      const jsonString = JSON.stringify(data, null, 2);
      const base64Content = Buffer.from(jsonString, 'utf8').toString('base64');

      // 3. Crear payload para GitHub PUT
      const body = {
        message: `Update NTB ${appModule} backup [skip ci]`,
        content: base64Content,
        branch: GITHUB_BRANCH,
      };
      if (sha) {
        body.sha = sha;
      }

      // 4. Subir a GitHub
      const putRes = await fetch(BASE_URL, {
        method: 'PUT',
        headers: { ...GH_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!putRes.ok) {
        const errText = await putRes.text();
        return res.status(putRes.status).json({ error: 'Error al subir a GitHub', detail: errText });
      }

      const putJson = await putRes.json();
      return res.status(200).json({ sha: putJson.content.sha });
    } catch (err) {
      return res.status(500).json({ error: 'Error al realizar el respaldo', detail: err.message });
    }
  }

  // Acción no soportada
  return res.status(400).json({ error: 'Acción inválida o no especificada (debe ser auth, check, pull o push)' });
};
