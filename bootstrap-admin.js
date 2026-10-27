import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { createPool } from './database.js';

const { BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD } = process.env;

if (!BOOTSTRAP_ADMIN_NAME || !BOOTSTRAP_ADMIN_EMAIL || !BOOTSTRAP_ADMIN_PASSWORD) {
  throw new Error('Set BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_EMAIL, and BOOTSTRAP_ADMIN_PASSWORD.');
}
if (BOOTSTRAP_ADMIN_PASSWORD.length < 12) {
  throw new Error('BOOTSTRAP_ADMIN_PASSWORD must contain at least 12 characters.');
}

const pool = createPool();

try {
  const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [BOOTSTRAP_ADMIN_EMAIL.trim().toLowerCase()]);
  if (existing.length) {
    throw new Error('A user with BOOTSTRAP_ADMIN_EMAIL already exists; refusing to overwrite it.');
  }
  const [users] = await pool.query('SELECT id FROM users LIMIT 1');
  if (users.length) {
    throw new Error('Bootstrap is only allowed before any CampusFlow user exists.');
  }

  const hash = await bcrypt.hash(BOOTSTRAP_ADMIN_PASSWORD, 12);
  const id = randomUUID();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.execute(
      'INSERT INTO users (id, full_name, email, role, department, password_hash) VALUES (?, ?, ?, ?, ?, ?)',
      [id, BOOTSTRAP_ADMIN_NAME.trim(), BOOTSTRAP_ADMIN_EMAIL.trim().toLowerCase(), 'administrator', 'University Administration', hash],
    );
    await connection.execute(
      'INSERT INTO audit_log (actor_id, action, module_key, record_id) VALUES (?, ?, ?, ?)',
      [id, 'create', 'users', id],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  console.log('Initial CampusFlow administrator created.');
} catch (error) {
  console.error('Administrator bootstrap failed:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
