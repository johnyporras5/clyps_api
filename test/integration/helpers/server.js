/* eslint-disable */
/**
 * Arranca la app COMPILADA (dist/) para las pruebas de integración.
 *
 * La lanza global-setup en un proceso aparte, desde una carpeta vacía (sin
 * .env) y con las variables de helpers/env.ts. Igual que main.ts aplica el
 * ValidationPipe global; además DETIENE las tareas programadas (correos,
 * recordatorios…) apenas arranca, antes de abrir el puerto.
 *
 * Se usa dist/ y no ts-node porque con ts-node el AppModule no arranca
 * (dependencias circulares entre módulos que tsc sí resuelve).
 *
 * Imprime `IT_READY <puerto>` cuando está lista.
 */
const path = require('path');
const root = process.env.IT_REPO_ROOT;
const req = (m) => require(path.join(root, 'node_modules', m));

const { NestFactory } = req('@nestjs/core');
const { ValidationPipe } = req('@nestjs/common');
const { SchedulerRegistry } = req('@nestjs/schedule');
const { DataSource } = req('typeorm');
const { AppModule } = require(path.join(root, 'dist', 'app.module'));

(async () => {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn'],
  });
  // Igual que main.ts: detrás del proxy, la IP real viene en X-Forwarded-For.
  // Las pruebas mandan una IP por petición (como teléfonos distintos) para no
  // chocar con el límite de 100 peticiones/min por IP, que sigue activo.
  app.set('trust proxy', 1);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.init();

  const registry = app.get(SchedulerRegistry);
  registry.getCronJobs().forEach((job) => job.stop());
  for (const name of registry.getIntervals()) registry.deleteInterval(name);
  for (const name of registry.getTimeouts()) registry.deleteTimeout(name);

  // Seguro extra: si por error apuntara a otra base, no arranca.
  const [{ db }] = await app.get(DataSource).query('SELECT DATABASE() AS db');
  if (db !== process.env.DB_DATABASE || process.env.DB_HOST !== '127.0.0.1') {
    console.error(`IT_ABORT base inesperada: ${db}@${process.env.DB_HOST}`);
    process.exit(2);
  }

  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address();
  console.log(`IT_READY ${port}`);
})().catch((error) => {
  console.error('IT_FAILED', error);
  process.exit(1);
});
