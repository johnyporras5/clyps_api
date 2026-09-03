import { DataSource } from 'typeorm';
import { config } from 'dotenv';

config();

const isProd = process.env.NODE_ENV === 'production';

// Las bases gestionadas de DigitalOcean (puerto 25060) exigen TLS cuando se
// entra por la red publica, que es como conecta el runner de CI. Dentro del
// VPC se usa el host privado y no hace falta, asi que esto queda apagado
// mientras DB_SSL no valga 'true'.
const ssl =
  process.env.DB_SSL === 'true'
    ? process.env.DB_SSL_CA
      ? { ca: Buffer.from(process.env.DB_SSL_CA, 'base64').toString('utf8') }
      : { rejectUnauthorized: false }
    : undefined;

export default new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  username: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_DATABASE || 'wellnessme',
  charset: 'utf8mb4',
  ssl,
  entities: [isProd ? 'dist/**/*.entity.js' : 'src/**/*.entity.ts'],
  migrations: [
    isProd ? 'dist/database/migrations/*.js' : 'src/database/migrations/*.ts',
  ],
  synchronize: false,
  logging: true,
});
