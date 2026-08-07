/**
 * Punto de entrada del servidor.
 *
 * Levanta la API en `config.port` escuchando en 0.0.0.0 (para que funcione
 * dentro de un contenedor) y cierra ordenadamente ante SIGINT/SIGTERM.
 */

import { config } from './config.js';
import { buildApp } from './app.js';
import { disconnectPrisma } from './lib/prisma.js';

async function main(): Promise<void> {
  const app = await buildApp();

  let cerrando = false;
  const cerrar = async (senal: string): Promise<void> => {
    if (cerrando) return;
    cerrando = true;
    app.log.info(`Recibi ${senal}: cerrando el servidor...`);
    try {
      // Se dejan de aceptar conexiones nuevas y se esperan las en curso.
      await app.close();
      await disconnectPrisma();
      app.log.info('Servidor cerrado correctamente');
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'Error al cerrar el servidor');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void cerrar('SIGINT'));
  process.on('SIGTERM', () => void cerrar('SIGTERM'));

  process.on('unhandledRejection', (motivo) => {
    app.log.error({ err: motivo }, 'Promesa rechazada sin manejar');
  });
  process.on('uncaughtException', (err) => {
    app.log.fatal({ err }, 'Excepcion no capturada: se cierra el proceso');
    void cerrar('uncaughtException');
  });

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    app.log.info(
      {
        puerto: config.port,
        entorno: config.env,
        modoDemo: config.demoMode,
        origenWeb: config.webOrigin,
      },
      `Galcosto API escuchando en http://0.0.0.0:${config.port}`,
    );
    if (config.demoMode) {
      app.log.warn(
        'ARCA_DEMO_MODE=true: los comprobantes se simulan y NO tienen validez fiscal',
      );
    }
  } catch (err) {
    app.log.error({ err }, 'No se pudo iniciar el servidor');
    await disconnectPrisma();
    process.exit(1);
  }
}

void main();
