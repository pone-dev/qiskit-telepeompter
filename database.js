import 'dotenv/config';
import mysql from 'mysql2/promise';

const databaseVariables = ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE'];

export function validateDatabaseEnvironment() {
  const missing = databaseVariables.filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

export function validateEnvironment() {
  validateDatabaseEnvironment();
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters.');
  }
  if (process.env.USER_PROVISIONING_TOKEN && process.env.USER_PROVISIONING_TOKEN.length < 32) {
    throw new Error('USER_PROVISIONING_TOKEN must contain at least 32 characters.');
  }
}

export function createPool() {
  validateDatabaseEnvironment();
  return mysql.createPool({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10),
    charset: 'utf8mb4',
    timezone: 'Z',
    ...(process.env.MYSQL_SSL === 'true' ? {
      ssl: {
        rejectUnauthorized: true,
        ...(process.env.MYSQL_SSL_CA ? { ca: process.env.MYSQL_SSL_CA.replace(/\\n/g, '\n') } : {}),
      },
    } : {}),
  });
}
