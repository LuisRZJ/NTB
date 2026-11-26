// ============================================================
// crypto.js — Utilidades criptográficas locales globales (Web Crypto API)
// ============================================================

(function(window) {
    /**
     * Deriva una clave criptográfica AES-GCM a partir de una contraseña y una sal (salt).
     * @param {string} password - Contraseña maestra
     * @param {Uint8Array} salt - Sal aleatoria
     * @returns {Promise<CryptoKey>}
     */
    async function deriveKey(password, salt) {
        const encoder = new TextEncoder();
        
        const passwordKey = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            'PBKDF2',
            false,
            ['deriveKey']
        );
        
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

    function uint8ToBase64(bytes) {
        const chunkSize = 0x8000; // 32 KB por bloque para evitar stack overflow en String.fromCharCode
        let binary = '';
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, i + chunkSize);
            binary += String.fromCharCode.apply(null, chunk);
        }
        return btoa(binary);
    }

    function base64ToUint8(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    /**
     * Cifra un texto utilizando AES-GCM con una contraseña maestra.
     * @param {string} text - Texto en claro a cifrar
     * @param {string} password - Contraseña maestra
     * @returns {Promise<{ciphertext: string, salt: string, iv: string}>} Objetos codificados en Base64
     */
    async function encryptText(text, password) {
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
            ciphertext: uint8ToBase64(new Uint8Array(encrypted)),
            salt: uint8ToBase64(salt),
            iv: uint8ToBase64(iv)
        };
    }

    /**
     * Descifra un bloque de datos cifrados utilizando AES-GCM con una contraseña maestra.
     * @param {{ciphertext: string, salt: string, iv: string}} encryptedData - Datos cifrados en Base64
     * @param {string} password - Contraseña maestra
     * @returns {Promise<string>} Texto descifrado
     * @throws {Error} Si la contraseña es incorrecta o los datos están corruptos
     */
    async function decryptText(encryptedData, password) {
        try {
            const salt = base64ToUint8(encryptedData.salt);
            const iv = base64ToUint8(encryptedData.iv);
            const ciphertext = base64ToUint8(encryptedData.ciphertext);
            
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

    // Exponer a window global
    window.encryptText = encryptText;
    window.decryptText = decryptText;
})(window);
