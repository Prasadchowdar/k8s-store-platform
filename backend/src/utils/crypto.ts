import crypto from 'crypto';

export function generatePassword(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex').substring(0, length);
}

export function generateSalt(length: number = 64): string {
  return crypto.randomBytes(length).toString('base64').substring(0, length);
}

export function generateWordPressKeys(): Record<string, string> {
  return {
    AUTH_KEY: generateSalt(),
    SECURE_AUTH_KEY: generateSalt(),
    LOGGED_IN_KEY: generateSalt(),
    NONCE_KEY: generateSalt(),
    AUTH_SALT: generateSalt(),
    SECURE_AUTH_SALT: generateSalt(),
    LOGGED_IN_SALT: generateSalt(),
    NONCE_SALT: generateSalt(),
  };
}
