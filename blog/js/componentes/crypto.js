// ============================================================
// crypto.js — Utilidades criptográficas locales (Web Crypto API)
// ============================================================

/**
 * Deriva una clave criptográfica AES-GCM a partir de una contraseña y una sal (salt).
 * @param {string} password - Contraseña maestra
 * @param {Uint8Array} salt - Sal aleatoria
 * @returns {Promise<CryptoKey>}
 */
async function deriveKey(password, salt) {
    const encoder = new TextEncoder();
    
    // Importar la contraseña como clave base de derivación
    const passwordKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
    );
    
    // Derivar clave de 256 bits para AES-GCM
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: 100000,
            hash: 'SHA-256'
        },
        passwordKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * Cifra un texto utilizando AES-GCM con una contraseña maestra.
 * @param {string} text - Texto en claro a cifrar
 * @param {string} password - Contraseña maestra
 * @returns {Promise<{ciphertext: string, salt: string, iv: string}>} Objetos codificados en Base64
 */
export async function encryptText(text, password) {
    const encoder = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const key = await deriveKey(password, salt);
    
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        encoder.encode(text)
    );
    
    return {
        ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
        salt: btoa(String.fromCharCode(...salt)),
        iv: btoa(String.fromCharCode(...iv))
    };
}

/**
 * Descifra un bloque de datos cifrados utilizando AES-GCM con una contraseña maestra.
 * @param {{ciphertext: string, salt: string, iv: string}} encryptedData - Datos cifrados en Base64
 * @param {string} password - Contraseña maestra
 * @returns {Promise<string>} Texto descifrado
 * @throws {Error} Si la contraseña es incorrecta o los datos están corruptos
 */
export async function decryptText(encryptedData, password) {
    try {
        const salt = new Uint8Array(atob(encryptedData.salt).split('').map(c => c.charCodeAt(0)));
        const iv = new Uint8Array(atob(encryptedData.iv).split('').map(c => c.charCodeAt(0)));
        const ciphertext = new Uint8Array(atob(encryptedData.ciphertext).split('').map(c => c.charCodeAt(0)));
        
        const key = await deriveKey(password, salt);
        
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            ciphertext
        );
        
        return new TextDecoder().decode(decrypted);
    } catch (e) {
        throw new Error('Contraseña incorrecta o datos de sincronización corruptos');
    }
}
