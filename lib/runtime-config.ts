import { readFileSync } from 'node:fs';

function readSecret(name: string) {
  const file = process.env[`${name}_FILE`];
  if (file) {
    try {
      return readFileSync(file, 'utf8').trim();
    } catch (error) {
      throw new Error(`Could not read ${name} secret file: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }
  return process.env[name] || '';
}

export function getRuntimeConfig() {
  return {
    databaseUrl: readSecret('DATABASE_URL'),
    authSecret: readSecret('AUTH_SECRET'),
    geminiApiKey: readSecret('GEMINI_API_KEY'),
    geminiModel: process.env.GEMINI_MODEL || '',
    geminiVerifierModel: process.env.GEMINI_VERIFIER_MODEL || '',
    appUrl: process.env.NEXT_PUBLIC_APP_URL || '',
  };
}
