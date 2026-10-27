import bcrypt from 'bcryptjs';
import { createPool } from './database.js';

const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

if (!process.argv.includes('--confirm')) {
  throw new Error('Pass --confirm to reset the existing administrator login.');
}
if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  throw new Error('Set BOOTSTRAP_ADMIN_EMAIL to a valid email address.');
}
if (!password || password.length < 12 || password.length > 1024) {
  throw new Error('Set BOOTSTRAP_ADMIN_PASSWORD to a password between 12 and 1024 characters.');
}

const pool = createPool();

try {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [admins] = await connection.execute(
      "SELECT id, active FROM users WHERE role = 'administrator' FOR UPDATE",
    );
    if (admins.length !== 1) {
      throw new Error('Expected exactly one administrator; refusing to reset the account.');
    }
    if (!admins[0].active) {
      throw new Error('The administrator account is inactive; refusing to reset it.');
    }

    const [emailConflicts] = await connection.execute(
      'SELECT id FROM users WHERE email = ? AND id <> ? LIMIT 1',
      [email, admins[0].id],
    );
    if (emailConflicts.length) {
      throw new Error('BOOTSTRAP_ADMIN_EMAIL is already assigned to another user.');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await connection.execute(
      'UPDATE users SET email = ?, password_hash = ? WHERE id = ? AND active = TRUE',
      [email, passwordHash, admins[0].id],
    );
    await connection.execute(
      'INSERT INTO audit_log (actor_id, action, module_key, record_id) VALUES (?, ?, ?, ?)',
      [admins[0].id, 'update', 'users', admins[0].id],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  console.log('Administrator login reset successfully.');
} catch (error) {
  console.error('Administrator reset failed:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
