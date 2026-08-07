/**
 * Configuracion central de la app. Se lee una sola vez al arrancar.
 * Modulo compartido: no agregar dependencias hacia el resto del codigo.
 */

import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Falta la variable de entorno ${name}. Copia .env.example a .env`);
  }
  return value;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return raw === 'true' || raw === '1';
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT ?? 4000),
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',

  jwtSecret: required('JWT_SECRET', 'dev-secret-cambiar-en-produccion'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '12h',

  /**
   * Clave AES-256-GCM (32 bytes en hex) para cifrar certificados en reposo.
   */
  encryptionKey: required(
    'APP_ENCRYPTION_KEY',
    '0000000000000000000000000000000000000000000000000000000000000000',
  ),

  /**
   * En modo demo la integracion con ARCA se simula: la app funciona de punta
   * a punta sin certificados reales. Se apaga poniendo ARCA_DEMO_MODE=false.
   */
  demoMode: bool('ARCA_DEMO_MODE', true),

  arca: {
    wsaa: {
      HOMO: process.env.ARCA_WSAA_HOMO ?? 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
      PROD: process.env.ARCA_WSAA_PROD ?? 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
    },
    wsfev1: {
      HOMO: process.env.ARCA_WSFEV1_HOMO ?? 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
      PROD: process.env.ARCA_WSFEV1_PROD ?? 'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
    },
    padron: {
      HOMO:
        process.env.ARCA_PADRON_HOMO ??
        'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5',
      PROD:
        process.env.ARCA_PADRON_PROD ??
        'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA5',
    },
    /** Base del QR obligatorio en los comprobantes. */
    qrBase: 'https://www.afip.gob.ar/fe/qr/?p=',
    /** Timeout de las llamadas SOAP, en ms. */
    timeoutMs: Number(process.env.ARCA_TIMEOUT_MS ?? 30000),
  },
} as const;

export type AppConfig = typeof config;
