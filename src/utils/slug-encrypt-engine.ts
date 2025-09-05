// Short AES util (works in browser & Node.js)
// --- CONFIG ---
const AES_KEY = "1234567890123456"; // 16 chars = 128-bit key (change to your own!)
const AES_IV = "6543210987654321"; // 16 chars IV (must match for decrypt)

// --- UTIL ---
export function encrypt(text) {
    if (typeof window !== "undefined" && window.crypto?.subtle) {
        // Browser - use SubtleCrypto
        const enc = new TextEncoder().encode(text);
        return window.crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(AES_KEY),
            { name: "AES-CBC" },
            false,
            ["encrypt"]
        ).then(key =>
            window.crypto.subtle.encrypt({ name: "AES-CBC", iv: new TextEncoder().encode(AES_IV) }, key, enc)
        ).then(buf => btoa(String.fromCharCode(...new Uint8Array(buf))));
    } else {
        // Node.js
        const crypto = require("crypto");
        const cipher = crypto.createCipheriv("aes-128-cbc", AES_KEY, AES_IV);
        let encrypted = cipher.update(text, "utf8", "base64");
        encrypted += cipher.final("base64");
        return encrypted;
    }
}

export function decrypt(base64Text) {
    if (typeof window !== "undefined" && window.crypto?.subtle) {
        // Browser
        const data = Uint8Array.from(atob(base64Text), c => c.charCodeAt(0));
        return window.crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(AES_KEY),
            { name: "AES-CBC" },
            false,
            ["decrypt"]
        ).then(key =>
            window.crypto.subtle.decrypt({ name: "AES-CBC", iv: new TextEncoder().encode(AES_IV) }, key, data)
        ).then(buf => new TextDecoder().decode(buf));
    } else {
        // Node.js
        const crypto = require("crypto");
        const decipher = crypto.createDecipheriv("aes-128-cbc", AES_KEY, AES_IV);
        let decrypted = decipher.update(base64Text, "base64", "utf8");
        decrypted += decipher.final("utf8");
        return decrypted;
    }
}

export function generateUUIDKey(length = 8) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, length);
}

