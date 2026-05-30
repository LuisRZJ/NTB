// ============================================================
// github.js — Capa de integración con la API REST de GitHub global
// ============================================================

(function(window) {
    /**
     * Consulta la API de GitHub para obtener el SHA de un archivo existente y sus metadatos.
     * @param {string} token - GitHub Personal Access Token
     * @param {string} repo - Repositorio en formato 'usuario/repositorio'
     * @param {string} filepath - Ruta del archivo en el repositorio
     * @param {string} branch - Rama del repositorio
     * @returns {Promise<{sha: string|null, content: string|null, updatedAt: string|null}>}
     */
    async function getBackupMetadata(token, repo, filepath, branch = 'main') {
        const url = `https://api.github.com/repos/${repo}/contents/${filepath}?ref=${branch}`;
        
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Cache-Control': 'no-cache'
                }
            });
            
            if (response.status === 404) {
                return { sha: null, content: null, updatedAt: null };
            }
            
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.message || `Error HTTP ${response.status}`);
            }
            
            const data = await response.json();
            
            let updatedAt = null;
            try {
                const commitsUrl = `https://api.github.com/repos/${repo}/commits?path=${filepath}&sha=${branch}&per_page=1`;
                const commitsRes = await fetch(commitsUrl, {
                    headers: { 'Authorization': `token ${token}` }
                });
                if (commitsRes.ok) {
                    const commitsData = await commitsRes.json();
                    if (commitsData && commitsData.length > 0) {
                        updatedAt = commitsData[0].commit.committer.date;
                    }
                }
            } catch (e) {
                console.warn('[GitHubAPI] No se pudo obtener la fecha exacta del commit:', e);
            }
            
            return {
                sha: data.sha,
                content: data.content,
                updatedAt: updatedAt
            };
        } catch (error) {
            console.error('[GitHubAPI] Error al obtener metadatos de copia de seguridad:', error);
            throw error;
        }
    }

    /**
     * Descarga y decodifica el archivo de copia de seguridad de GitHub.
     * @param {string} token - GitHub Personal Access Token
     * @param {string} repo - Repositorio en formato 'usuario/repositorio'
     * @param {string} filepath - Ruta del archivo en el repositorio
     * @param {string} branch - Rama del repositorio
     * @returns {Promise<{content: any, updatedAt: string, sha: string}>} Datos decodificados
     */
    async function downloadBackup(token, repo, filepath, branch = 'main') {
        const meta = await getBackupMetadata(token, repo, filepath, branch);
        if (!meta.content) {
            throw new Error('El archivo de respaldo no existe en el repositorio.');
        }
        
        const cleanBase64 = meta.content.replace(/\s/g, '');
        const jsonString = decodeURIComponent(escape(atob(cleanBase64)));
        const backupData = JSON.parse(jsonString);
        
        return {
            content: backupData,
            updatedAt: meta.updatedAt || new Date().toISOString(),
            sha: meta.sha
        };
    }

    /**
     * Crea o actualiza el archivo de copia de seguridad en GitHub.
     * @param {string} token - GitHub Personal Access Token
     * @param {string} repo - Repositorio en formato 'usuario/repositorio'
     * @param {string} filepath - Ruta del archivo en el repositorio
     * @param {string} branch - Rama del repositorio
     * @param {any} backupData - Datos a respaldar
     * @param {string|null} sha - SHA actual del archivo si se conoce
     * @returns {Promise<string>} Nuevo SHA del archivo
     */
    async function uploadBackupRemote(token, repo, filepath, branch = 'main', backupData, sha = null) {
        const url = `https://api.github.com/repos/${repo}/contents/${filepath}`;
        
        let activeSha = sha;
        if (!activeSha) {
            const meta = await getBackupMetadata(token, repo, filepath, branch);
            activeSha = meta.sha;
        }
        
        const jsonString = JSON.stringify(backupData, null, 2);
        const base64Content = btoa(unescape(encodeURIComponent(jsonString)));
        
        const body = {
            message: 'Update NTB tasks backup [skip ci]',
            content: base64Content,
            branch: branch
        };
        
        if (activeSha) {
            body.sha = activeSha;
        }
        
        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/vnd.github.v3+json'
            },
            body: JSON.stringify(body)
        });
        
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.message || `Error HTTP ${response.status} al subir respaldo`);
        }
        
        const resData = await response.json();
        return resData.content.sha;
    }

    // Exponer a window global
    window.getBackupMetadata = getBackupMetadata;
    window.downloadBackup = downloadBackup;
    window.uploadBackupRemote = uploadBackupRemote;
})(window);
