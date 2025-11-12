import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const ALGORITHM = 'aes-256-cbc';

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
  throw new Error('ENCRYPTION_KEY must be at least 32 characters');
}

// Generar key de 32 bytes desde la ENCRYPTION_KEY
const KEY = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();

/**
 * Encripta un string
 * @param {string} text - Texto a encriptar
 * @returns {string} Texto encriptado en formato: iv:encryptedData
 */
export function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Retornar IV + encrypted data (separados por :)
  return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Desencripta un string
 * @param {string} encryptedText - Texto encriptado en formato: iv:encryptedData
 * @returns {string} Texto desencriptado
 */
export function decrypt(encryptedText) {
  const [ivHex, encrypted] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Encripta credenciales de Twitter
 * @param {object} credentials - { apiKey, apiSecret, accessToken, accessSecret }
 * @returns {object} Credenciales encriptadas
 */
export function encryptTwitterCredentials(credentials) {
  return {
    api_key_encrypted: encrypt(credentials.apiKey),
    api_secret_encrypted: encrypt(credentials.apiSecret),
    access_token_encrypted: encrypt(credentials.accessToken),
    access_secret_encrypted: encrypt(credentials.accessSecret)
  };
}

/**
 * Desencripta credenciales de Twitter
 * @param {object} encryptedCredentials - Credenciales encriptadas
 * @returns {object} Credenciales desencriptadas
 */
export function decryptTwitterCredentials(encryptedCredentials) {
  return {
    apiKey: decrypt(encryptedCredentials.api_key_encrypted),
    apiSecret: decrypt(encryptedCredentials.api_secret_encrypted),
    accessToken: decrypt(encryptedCredentials.access_token_encrypted),
    accessSecret: decrypt(encryptedCredentials.access_secret_encrypted)
  };
}
