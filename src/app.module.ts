import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { GeneratedModules } from './generated-modules';
import { AuthModule } from './auth/auth.module';
//import { CleanupTask } from './tasks/cleanup.task';
//import { VerificationModule } from './verification/verification.module';

//import { SeedsModule } from './database/seeds/seeds.module';
import { join } from 'path';
import { ServeStaticModule } from '@nestjs/serve-static';
import { EventEmitterModule } from '@nestjs/event-emitter';
//import { TemplatesModule } from './templates/templates.module';


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
        const isLocalDocker = dbHost === 'localhost' && process.env.NODE_ENV !== 'production';
        const finalHost = isLocalDocker ? 'host.docker.internal' : dbHost;
        
        const dbConfig = {
          type: 'mysql' as const,
          host: process.env.DB_HOST,
          port: configService.get<number>('DB_PORT', 3307),
          username: configService.get('DB_USERNAME', 'root'),
          password: configService.get('DB_PASSWORD', ''),
          database: configService.get('DB_DATABASE', 'clyps'), 
          entities: [__dirname + '/**/*.entity{.ts,.js}'],
          synchronize: false,
          logging: configService.get('NODE_ENV') === 'development',
          retryDelay: 1000,
          retryAttempts: 1, // Only try once, then let app start - connection will retry in background
          extra: {
            connectionLimit: 10,
            connectTimeout: 3000, // 3 second timeout - fail fast
            acquireTimeout: 3000,
            // Enable connection pool to avoid blocking
            waitForConnections: false, // Don't wait for connections
            queueLimit: 0,
          },
          autoLoadEntities: true,
        };
        console.log(`📊 Database config: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
        console.log(`📊 DB_USERNAME: ${dbConfig.username ? '***SET***' : 'NOT SET'}`);
        if (isLocalDocker) {
          console.log(`ℹ️  Using host.docker.internal to connect to MySQL on host machine`);
        }
        return dbConfig;
      },
      inject: [ConfigService],
    }),

    GeneratedModules,
    AuthModule,
    //VerificationModule,
       //SeedsModule,
    //TemplatesModule,
    
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}