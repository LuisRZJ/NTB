// Se comparte el formato del respaldo entre el navegador y el worker.
async function readTaskBackup() {
  const [
    taskList, catList, projList, histList, chatList, folderList,
    orModel, gModel, aiProv,
    makerCats, savedThemeConfig,
    cloudAutoSync, tokenAuditLog
  ] = await Promise.all([
    dbGetAll(), dbGetAllCats(), dbGetAllProjects(), dbGetHistory(),
    typeof dbGetAllChats === 'function' ? dbGetAllChats() : Promise.resolve([]),
    typeof dbGetAllChatFolders === 'function' ? dbGetAllChatFolders() : Promise.resolve([]),
    dbGetMeta('openRouterModel'),
    dbGetMeta('googleAIModel'),
    dbGetMeta('aiProvider'),
    dbGetMeta('makerCategories'), dbGetMeta('themeConfig'),
    dbGetMeta('cloudAutoSync'),
    dbGetMeta('aiTokenAuditLog')
  ]);
  return {
    version: 1,
    exported: new Date().toISOString(),
    tasks: taskList,
    categories: catList,
    projects: projList,
    history: histList,
    aiChats: chatList,
    aiChatFolders: folderList,
    meta: {
      openRouterModel: orModel || null,
      googleAIModel: gModel || null,
      aiProvider: aiProv || null,
      cloudAutoSync: cloudAutoSync === true,
      makerCategories: makerCats || [],
      themeConfig: savedThemeConfig || null,
      aiTokenAuditLog: Array.isArray(tokenAuditLog) ? tokenAuditLog : []
    }
  };
}

async function processTaskBackup(action, input) {
  if (action === 'import') return JSON.parse(await input.file.text());
  if (action === 'decrypt') return JSON.parse(await self.decryptText(input.envelope, input.key));
  const payload = await readTaskBackup();
  if (action === 'export') return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const encrypted = await self.encryptText(JSON.stringify(payload), input.key);
  const data = { encrypted: true, v: 1, alg: 'AES-256-GCM', kdf: 'PBKDF2-SHA256', iterations: 100000, ...encrypted };
  const body = new Blob([JSON.stringify({ password: input.password, module: 'tareas', action: 'push', data })], { type: 'application/json' });
  return { body, exported: payload.exported };
}

if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  importScripts('db.js', 'crypto.js');
  self.onmessage = async ({ data }) => {
    try {
      if (data.action === 'export' || data.action === 'push') await dbInit();
      self.postMessage({ value: await processTaskBackup(data.action, data.input) });
    } catch (error) {
      self.postMessage({ error: error.message });
    }
  };
}

function runTaskBackup(action, input = {}) {
  if (location.protocol === 'file:' || typeof Worker !== 'function') return processTaskBackup(action, input);
  return new Promise((resolve, reject) => {
    const worker = new Worker('tareas/js/componentes/backup.js');
    worker.onmessage = ({ data }) => {
      worker.terminate();
      if (data.error) reject(new Error(data.error));
      else resolve(data.value);
    };
    worker.onerror = event => {
      worker.terminate();
      reject(new Error(event.message || 'No se pudo abrir el procesador de respaldos'));
    };
    worker.postMessage({ action, input });
  });
}
