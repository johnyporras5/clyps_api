import { DataSource } from 'typeorm';
import { config } from 'dotenv';

config();

export default new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  username: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.DB_DATABASE || 'wellnessme',
  charset: 'utf8mb4',
  // Rutas relativas a ESTE archivo, nunca a NODE_ENV: compilado resuelve los
  // .js de `dist/`, y por ts-node los .ts de `src/`. Depender de NODE_ENV hacía
  // que el contenedor buscara en `src/` —que la imagen de producción no copia—
  // y las migraciones se saltaran EN SILENCIO: encontraba cero y salía con
  // éxito. Mismo idioma que app.module.ts.
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
  synchronize: false,
  logging: true,
});
