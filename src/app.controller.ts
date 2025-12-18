import { Controller, Get, Optional } from '@nestjs/common';
import { AppService } from './app.service';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly configService: ConfigService,
    @Optional() @InjectDataSource() private readonly dataSource: DataSource | null,
  ) {
    // Log if DataSource is available
    if (this.dataSource) {
      console.log('✅ DataSource injected successfully');
    } else {
      console.warn('⚠️  DataSource not available - TypeORM may not be initialized');
    }
  }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('ping')
  ping() {
    // Simple endpoint that doesn't require any dependencies
    return {
      status: 'ok',
      message: 'Node.js app is running',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  @Get('debug/env')
  getEnvDebug() {
    // Return environment variables (without exposing sensitive data)
    return {
      message: 'Environment Variables Debug',
      timestamp: new Date().toISOString(),
      environment: {
        NODE_ENV: process.env.NODE_ENV || 'NOT SET',
        PORT: process.env.PORT || 'NOT SET',
        DB_HOST: process.env.DB_HOST || 'NOT SET',
        DB_PORT: process.env.DB_PORT || 'NOT SET',
        DB_USERNAME: process.env.DB_USERNAME ? '***SET***' : 'NOT SET',
        DB_PASSWORD: process.env.DB_PASSWORD ? '***SET***' : 'NOT SET',
        DB_DATABASE: process.env.DB_DATABASE || 'NOT SET',
      },
      configService: {
        NODE_ENV: this.configService.get('NODE_ENV', 'NOT SET'),
        PORT: this.configService.get('PORT', 'NOT SET'),
        DB_HOST: this.configService.get('DB_HOST', 'NOT SET'),
        DB_PORT: this.configService.get('DB_PORT', 'NOT SET'),
        DB_USERNAME: this.configService.get('DB_USERNAME') ? '***SET***' : 'NOT SET',
        DB_PASSWORD: this.configService.get('DB_PASSWORD') ? '***SET***' : 'NOT SET',
        DB_DATABASE: this.configService.get('DB_DATABASE', 'NOT SET'),
      },
      note: 'Check Digital Ocean App Platform environment variables in Settings > App-Level Environment Variables',
    };
  }

  @Get('debug/status')
  async getStatus() {
    const status = {
      app: 'running',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      database: {
        connected: false,
        initialized: false,
        available: this.dataSource !== null,
        error: null as string | null,
      },
    };

    // Test database connection only if DataSource is available
    if (this.dataSource) {
      try {
        status.database.initialized = this.dataSource.isInitialized;
        if (this.dataSource.isInitialized) {
          await this.dataSource.query('SELECT 1');
          status.database.connected = true;
        } else {
          status.database.error = 'Database not initialized yet';
        }
      } catch (error) {
        status.database.error = error instanceof Error ? error.message : 'Unknown error';
        console.error('Database connection test failed:', error);
      }
    } else {
      status.database.error = 'DataSource not injected (TypeORM may not be initialized)';
    }

    return status;
  }

  @Get('debug/db-test')
  async testDatabase() {
    try {
      if (!this.dataSource) {
        return {
          success: false,
          message: 'DataSource not available',
          error: 'DataSource not injected. TypeORM may have failed to initialize.',
          note: 'Check application logs for TypeORM connection errors',
        };
      }

      const startTime = Date.now();
      const isInitialized = this.dataSource.isInitialized;
      
      if (!isInitialized) {
        return {
          success: false,
          message: 'Database not initialized',
          error: 'TypeORM DataSource is not initialized. Check connection settings.',
          connectionInfo: {
            host: this.configService.get('DB_HOST', 'NOT SET'),
            port: this.configService.get('DB_PORT', 'NOT SET'),
            database: this.configService.get('DB_DATABASE', 'NOT SET'),
            isInitialized: false,
          },
        };
      }

      const result = await this.dataSource.query('SELECT 1 as test, NOW() as current_time');
      const duration = Date.now() - startTime;

      return {
        success: true,
        message: 'Database connection successful',
        duration: `${duration}ms`,
        result,
        connectionInfo: {
          host: this.configService.get('DB_HOST', 'NOT SET'),
          port: this.configService.get('DB_PORT', 'NOT SET'),
          database: this.configService.get('DB_DATABASE', 'NOT SET'),
          isInitialized: true,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: 'Database connection failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        connectionInfo: {
          host: this.configService.get('DB_HOST', 'NOT SET'),
          port: this.configService.get('DB_PORT', 'NOT SET'),
          database: this.configService.get('DB_DATABASE', 'NOT SET'),
          isInitialized: this.dataSource?.isInitialized || false,
        },
      };
    }
  }

  @Get('debug/process')
  getProcessInfo() {
    return {
      pid: process.pid,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      platform: process.platform,
      nodeVersion: process.version,
      env: {
        NODE_ENV: process.env.NODE_ENV,
        PORT: process.env.PORT,
      },
    };
  }
}