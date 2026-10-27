import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createPool } from './database.js';

const pool = createPool();

try {
  const schemaPath = fileURLToPath(new URL('../database/schema.sql', import.meta.url));
  const schema = await readFile(schemaPath, 'utf8');
  for (const statement of schema.split(';').map((item) => item.trim()).filter(Boolean)) {
    await pool.query(statement);
  }
  console.log('CampusFlow MySQL schema is up to date.');
} catch (error) {
  console.error('Database migration failed:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
