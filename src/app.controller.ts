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
    @Optional()
    @InjectDataSource()
    private readonly dataSource: DataSource | null,
  ) {
    // Log if DataSource is available
    if (this.dataSource) {
      console.log('✅ DataSource injected successfully');
    } else {
      console.warn(
        '⚠️  DataSource not available - TypeORM may not be initialized',
      );
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

  // Health check para balanceador / Digital Ocean. Solo expone si la app y la
  // BD responden, sin filtrar host, credenciales, stack traces ni métricas del
  // proceso (eso era reconocimiento útil para un atacante).
  @Get('debug/status')
  async getStatus() {
    const status = {
      app: 'running',
      timestamp: new Date().toISOString(),
      database: {
        connected: false,
        initialized: false,
        available: this.dataSource !== null,
      },
    };

    if (this.dataSource) {
      try {
        status.database.initialized = this.dataSource.isInitialized;
        if (this.dataSource.isInitialized) {
          await this.dataSource.query('SELECT 1');
          status.database.connected = true;
        }
      } catch (error) {
        // El detalle del error va solo a logs del servidor, nunca a la respuesta.
        console.error('Database connection test failed:', error);
      }
    }

    return status;
  }

  // Comprobación de conectividad a la BD. Devuelve únicamente éxito/fallo:
  // sin host/puerto/nombre de BD, sin stack traces ni mensajes de error crudos.
  @Get('debug/db-test')
  async testDatabase() {
    try {
      if (!this.dataSource || !this.dataSource.isInitialized) {
        return { success: false, message: 'Database not available' };
      }

      const startTime = Date.now();
      await this.dataSource.query('SELECT 1');
      const duration = Date.now() - startTime;

      return {
        success: true,
        message: 'Database connection successful',
        duration: `${duration}ms`,
      };
    } catch (error) {
      console.error('Database connection test failed:', error);
      return { success: false, message: 'Database connection failed' };
    }
  }
}
