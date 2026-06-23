// Import at the top level to catch import errors
try {
  console.error('📦 Loading dependencies...');
} catch (e) {
  console.error('❌ Error loading dependencies:', e);
}

// Load .env file BEFORE anything else
import { config } from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load .env file from the app root directory
// In Docker: process.cwd() = /app, .env is at /app/.env
// In development: process.cwd() = project root, .env is at project root
let envPath = path.resolve(process.cwd(), '.env');

// Also check common locations if the default doesn't exist
if (!fs.existsSync(envPath)) {
  // Check parent directory if running from dist/src (for compiled code)
  if (__dirname.includes('dist')) {
    const parentEnvPath = path.resolve(__dirname, '../../.env');
    if (fs.existsSync(parentEnvPath)) {
      envPath = parentEnvPath;
    }
  }
  // Check /app/.env (Docker container root)
  const dockerEnvPath = '/app/.env';
  if (fs.existsSync(dockerEnvPath)) {
    envPath = dockerEnvPath;
  }
}

console.error('🔍 Loading .env file from:', envPath);
console.error('🔍 Current working directory:', process.cwd());
console.error('🔍 __dirname:', __dirname);

try {
  const result = config({ path: envPath });
  if (result.error) {
    console.error(
      '⚠️  Warning: Could not load .env file:',
      result.error.message,
    );
    console.error('⚠️  Will use environment variables from system/container');
  } else {
    console.error('✅ .env file loaded successfully');
    // Log which variables were loaded (without showing values)
    const loadedVars = Object.keys(result.parsed || {});
    const dbVars = loadedVars.filter(
      (v) => v.startsWith('DB_') || v === 'PORT' || v === 'NODE_ENV',
    );
    if (dbVars.length > 0) {
      console.error(
        `📋 Loaded ${dbVars.length} variables from .env:`,
        dbVars.join(', '),
      );
    }
  }
} catch (error) {
  console.error('⚠️  Warning: Error loading .env file:', error);
  console.error('⚠️  Will use environment variables from system/container');
}

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  // Log immediately to catch any early errors - use console.error so Digital Ocean captures it
  console.error('🚀 Bootstrap function called');
  console.error('Current working directory:', process.cwd());
  console.error('Node version:', process.version);
  console.error('__dirname:', __dirname);

  // Check if dist directory exists
  const distPath = path.join(__dirname, '..');
  console.error('Checking dist path:', distPath);
  if (fs.existsSync(distPath)) {
    console.error('✅ dist directory exists');
    const mainPath = path.join(__dirname, 'main.js');
    console.error('Checking main.js at:', mainPath);
    if (fs.existsSync(mainPath)) {
      console.error('✅ main.js exists');
    } else {
      console.error('❌ main.js NOT FOUND at:', mainPath);
      console.error('Files in dist:', fs.readdirSync(distPath));
    }
  } else {
    console.error('❌ dist directory NOT FOUND');
  }

  try {
    console.log('🚀 Starting NestJS application...');
    console.log('═══════════════════════════════════════════════════════');
    console.log('📋 Environment Variables Check:');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`NODE_ENV: ${process.env.NODE_ENV || 'NOT SET'}`);
    console.log(`PORT: ${process.env.PORT || 'NOT SET (default: 4000)'}`); // CAMBIADO: 4000
    console.log(
      `DB_HOST: ${process.env.DB_HOST || 'NOT SET (default: localhost)'}`,
    );
    console.log(`DB_PORT: ${process.env.DB_PORT || 'NOT SET (default: 3306)'}`);
    console.log(
      `DB_USERNAME: ${process.env.DB_USERNAME ? '***SET***' : 'NOT SET'}`,
    );
    console.log(
      `DB_PASSWORD: ${process.env.DB_PASSWORD ? '***SET***' : 'NOT SET'}`,
    );
    console.log(
      `DB_DATABASE: ${process.env.DB_DATABASE || 'NOT SET (default: projectdb)'}`,
    ); // CAMBIADO
    console.log('═══════════════════════════════════════════════════════');

    // Validate critical environment variables
    const missingVars: string[] = [];
    if (!process.env.DB_HOST) missingVars.push('DB_HOST');
    if (!process.env.DB_USERNAME) missingVars.push('DB_USERNAME');
    if (!process.env.DB_PASSWORD) missingVars.push('DB_PASSWORD');
    if (!process.env.DB_DATABASE) missingVars.push('DB_DATABASE');

    if (missingVars.length > 0) {
      console.warn(
        `⚠️  WARNING: Missing environment variables: ${missingVars.join(', ')}`,
      );
      console.warn(
        `⚠️  App will attempt to start but database connection may fail`,
      );
      console.warn(
        `⚠️  Please set these in Digital Ocean App Platform: Settings > Environment Variables`,
      );
    } else {
      console.log(`✅ All required database environment variables are set`);
    }

    console.log(
      `📊 Database connection will use: ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 3306}`,
    );

    // Create app with timeout to prevent hanging on database connection
    const createAppPromise = NestFactory.create<NestExpressApplication>(
      AppModule,
      {
        logger: ['error', 'warn', 'log'],
        abortOnError: false, // Critical: Don't abort on TypeORM connection errors
      },
    );

    // Set a 15 second timeout for app creation - fail fast if database is blocking
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error('App creation timeout after 15s')),
        15000,
      ),
    );

    // ==================== CONFIGURACIÓN DE CORS ====================
    // CORS solo afecta a navegadores (web). Las apps móviles nativas no envían
    // Origin y no se ven afectadas. Lista de orígenes permitidos por env:
    //   CORS_ORIGINS=https://app.tudominio.com,http://localhost:3000
    // Si está vacía, se permiten todos los orígenes (fallback) con un aviso.
    const corsOrigins = (process.env.CORS_ORIGINS ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);

    let corsOptions: CorsOptions;
    if (corsOrigins.length > 0) {
      corsOptions = { origin: corsOrigins, credentials: true };
      console.log(`🔒 CORS restringido a: ${corsOrigins.join(', ')}`);
    } else {
      corsOptions = { origin: true, credentials: true };
      console.warn(
        '⚠️  CORS ABIERTO a todos los orígenes (CORS_ORIGINS no definido). ' +
          'Define CORS_ORIGINS con tus dominios de frontend antes de producción.',
      );
    }

    let app: NestExpressApplication;
    try {
      app = await Promise.race([createAppPromise, timeoutPromise]);

      app.enableCors(corsOptions);
    } catch (timeoutError) {
      if (
        timeoutError instanceof Error &&
        timeoutError.message.includes('timeout')
      ) {
        console.error('⚠️ App creation timed out');

        app = await NestFactory.create<NestExpressApplication>(AppModule, {
          logger: ['error', 'warn'],
          abortOnError: false,
        });

        app.enableCors(corsOptions);
      } else {
        throw timeoutError;
      }
    }

    // Detrás de Nginx / Digital Ocean: confiar en X-Forwarded-For para que el
    // rate limiting (ThrottlerGuard) cuente por IP real del cliente y no por la
    // IP del proxy.
    app.set('trust proxy', 1);

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );

    const port = process.env.PORT ?? 4000; // CAMBIADO: 4000
    console.log(`🌐 Starting HTTP server on port ${port}...`);

    // Add error handlers - but don't exit immediately, log and continue.
    // No terminamos el proceso (la app debe seguir sirviendo); solo registramos
    // el máximo detalle posible para poder diagnosticar el error después.
    process.on('uncaughtException', (error) => {
      console.error('❌ UNCAUGHT EXCEPTION');
      console.error('🕒 Timestamp:', new Date().toISOString());
      console.error('🏷️  Tipo:', error?.constructor?.name || typeof error);
      console.error('💬 Mensaje:', error?.message);
      console.error('📋 Stack:', error?.stack);
      console.error('⚠️  App will continue running despite uncaught exception');
      // Don't exit - let the app keep running
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ UNHANDLED REJECTION');
      console.error('🕒 Timestamp:', new Date().toISOString());
      console.error('📍 En promise:', promise);
      if (reason instanceof Error) {
        console.error('🏷️  Tipo:', reason.constructor?.name);
        console.error('💬 Mensaje:', reason.message);
        console.error('📋 Stack:', reason.stack);
      } else {
        console.error('💬 Reason:', reason);
      }
      console.error(
        '⚠️  App will continue running despite unhandled rejection',
      );
      // Don't exit - let the app keep running
    });

    // Keep the process alive
    process.on('SIGTERM', () => {
      console.error('⚠️  SIGTERM received, shutting down gracefully...');
      process.exit(0);
    });

    process.on('SIGINT', () => {
      console.error('⚠️  SIGINT received, shutting down gracefully...');
      process.exit(0);
    });

    console.error(`🌐 Attempting to listen on port ${port}...`);
    console.error(
      `🌐 PORT environment variable: ${process.env.PORT || 'NOT SET (using default 4000)'}`,
    ); // CAMBIADO

    await app.listen(port, '0.0.0.0');

    // Verify the server is actually listening
    const server = app.getHttpServer();
    const address = server.address();
    console.error(`✅ Server listening on:`, address);

    // Double-check the port
    if (address && typeof address === 'object') {
      console.error(`✅ Verified: Server is listening on port ${address.port}`);
      if (address.port !== Number(port)) {
        console.error(
          `⚠️  WARNING: Port mismatch! Expected ${port}, but listening on ${address.port}`,
        );
      }
    }
    console.error(`✅ Application is running on: http://0.0.0.0:${port}`);
    console.error(`✅ Test endpoint: http://0.0.0.0:${port}/ping`);
    console.error(
      `✅ Health check available at: http://0.0.0.0:${port}/health`,
    );
    console.error(
      `✅ Debug endpoints available at: http://0.0.0.0:${port}/debug/status`,
    );
    console.error(
      `⚠️  Database connection will retry in background if not available`,
    );

    // Log startup completion - use console.error so it shows in Digital Ocean logs
    console.error('═══════════════════════════════════════════════════════');
    console.error('✅ APPLICATION STARTUP COMPLETE');
    console.error('═══════════════════════════════════════════════════════');

    // Also log to stdout for supervisor
    console.log(`✅ Application is running on: http://0.0.0.0:${port}`);
    console.log(`✅ APPLICATION STARTUP COMPLETE`);

    // Keep the process alive and log periodically to verify it's running
    setInterval(() => {
      console.log(
        `💓 Heartbeat: App still running (uptime: ${Math.floor(process.uptime())}s)`,
      );
    }, 30000); // Every 30 seconds

    // Log a message after 10 seconds to confirm app is still running
    setTimeout(() => {
      console.log(
        `✅ App has been running for 10 seconds - startup successful`,
      );
    }, 10000);
  } catch (error) {
    console.error('❌ Failed to start application');
    console.error('❌ Error type:', error?.constructor?.name || typeof error);
    console.error(
      '❌ Error message:',
      error instanceof Error ? error.message : String(error),
    );
    console.error(
      '❌ Error stack:',
      error instanceof Error ? error.stack : 'No stack trace',
    );

    if (error instanceof Error) {
      if (error.message.includes('timeout')) {
        console.error(
          '⚠️  App creation timed out - database connection may be slow',
        );
        console.error(
          '⚠️  The app may still be initializing. Check logs for database connection status.',
        );
      }
      if (error.message.includes('Cannot find module')) {
        console.error(
          '⚠️  Module not found - check if build completed successfully',
        );
        console.error('⚠️  Expected path: dist/src/main.js');
      }
    }

    // Log environment one more time before exiting
    console.error('Environment at crash:');
    console.error('  NODE_ENV:', process.env.NODE_ENV);
    console.error('  PORT:', process.env.PORT);
    console.error('  DB_HOST:', process.env.DB_HOST || 'NOT SET');

    // Exit and let supervisor restart it
    process.exit(1);
  }
}

// Catch any uncaught errors before bootstrap
process.on('uncaughtException', (error) => {
  console.error('❌ UNCAUGHT EXCEPTION:', error);
  console.error('Stack:', error.stack);
  console.error('This error occurred before the app could start');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ UNHANDLED REJECTION:', reason);
  console.error('Promise:', promise);
  if (reason instanceof Error) {
    console.error('Error stack:', reason.stack);
  }
  process.exit(1);
});

void bootstrap();
