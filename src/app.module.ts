import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GeneratedModules } from './generated-modules';
import { AuthModule } from './auth/auth.module';
import { CleanupTask } from './tasks/cleanup.task';
import { OfferExpirationTask } from './tasks/offer-expiration.task';
import { VerificationModule } from './verification/verification.module';
//import { SeedsModule } from './database/seeds/seeds.module';
import { join } from 'path';
import { ServeStaticModule } from '@nestjs/serve-static';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { SessionModule } from './session/session.module';
import { IAPromptsModule } from './IAprompts/ia_prompts.module';
import { FeedbacksModule } from './feedbacks/feedbacks.module';
//import { TemplatesModule } from './templates/templates.module';
import { ServiceCategoryModule } from './service_category/service_category.module';
import { CompanyCategoryModule } from './company_category/company_category.module';
import { ProductCategoryModule } from './product_category/product_category.module';
import { OfferModule } from './Offer/offer.module';
import { ReportsModule } from './reports/reports.module';
import { RealtimeModule } from './realtime/realtime.module';
import { NotificationModule } from './notification/notification.module';
import { PayrollModule } from './payroll/payroll.module';

@Module({
  imports: [
    EventEmitterModule.forRoot({
      // Configuración opcional
      wildcard: false,
      delimiter: '.',
      newListener: false,
      removeListener: false,
      maxListeners: 10,
      verboseMemoryLeak: false,
      ignoreErrors: false,
    }),
    ScheduleModule.forRoot(),
    // Rate limiting global: 100 req/min por IP. Endpoints sensibles de auth
    // aplican un límite más estricto vía @Throttle.
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'assets'),
      serveRoot: '/assets',
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env', // Will be ignored if .env doesn't exist (like on Digital Ocean)
      expandVariables: true,
      // On Digital Ocean, env vars are set directly, so ignore .env file errors
      ignoreEnvFile: false,
      // Load from process.env (Digital Ocean sets these directly)
      load: [],
    }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        // Get database configuration
        // On Digital Ocean App Platform, DB_HOST should be set directly
        // For local Docker, use host.docker.internal if DB_HOST is localhost
        const dbHost = configService.get('DB_HOST', 'localhost');
        const isLocalDocker =
          dbHost === 'localhost' && process.env.NODE_ENV !== 'production';

        const dbConfig = {
          type: 'mysql' as const,
          host: process.env.DB_HOST,
          port: configService.get<number>('DB_PORT', 3307),
          username: configService.get('DB_USERNAME', 'root'),
          password: configService.get('DB_PASSWORD', ''),
          database: configService.get('DB_DATABASE', 'clyps'),
          // utf8mb4 permite guardar emojis (caracteres de 4 bytes)
          charset: 'utf8mb4',
          entities: [__dirname + '/**/*.entity{.ts,.js}'],
          synchronize: false,
          logging: configService.get('NODE_ENV') === 'development',
          retryDelay: 1000,
          retryAttempts: 1, // Only try once, then let app start - connection will retry in background
          extra: {
            connectionLimit: 10,
            connectTimeout: 10000, // 10s para establecer la conexión TCP
            // Esperar a que se libere una conexión en lugar de fallar al instante
            waitForConnections: true,
            queueLimit: 0, // cola ilimitada de peticiones en espera
          },
          autoLoadEntities: true,
        };
        console.log(
          `📊 Database config: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`,
        );
        console.log(
          `📊 DB_USERNAME: ${dbConfig.username ? '***SET***' : 'NOT SET'}`,
        );
        if (isLocalDocker) {
          console.log(
            `ℹ️  Using host.docker.internal to connect to MySQL on host machine`,
          );
        }
        return dbConfig;
      },
      inject: [ConfigService],
    }),

    GeneratedModules,
    AuthModule,
    VerificationModule,
    //SeedsModule,
    //TemplatesModule,

    IAPromptsModule,
    FeedbacksModule,
    ServiceCategoryModule,
    CompanyCategoryModule,
    ProductCategoryModule,
    OfferModule,
    ReportsModule,
    SessionModule,
    PayrollModule,
    RealtimeModule,
    NotificationModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    CleanupTask,
    OfferExpirationTask,
    // Activa el rate limiting de forma global en toda la app.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
