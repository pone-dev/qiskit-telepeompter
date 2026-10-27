import 'dotenv/config';
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import { createPool, validateEnvironment } from './database.js';
import moduleFields from '../shared/module-fields.js';

validateEnvironment();
const pool = createPool();
const app = express();
const configuredPort = Number(process.env.PORT || 3001);
if (!Number.isInteger(configuredPort) || configuredPort < 1 || configuredPort > 65535) {
  throw new Error('PORT must be a valid TCP port between 1 and 65535.');
}
const port = configuredPort;
const isProduction = process.env.NODE_ENV === 'production';
const appOrigin = process.env.APP_ORIGIN || null;
if (appOrigin) {
  let parsedAppOrigin;
  try {
    parsedAppOrigin = new URL(appOrigin);
  } catch {
    throw new Error('APP_ORIGIN must be a valid HTTPS origin.');
  }
  if (parsedAppOrigin.origin !== appOrigin || (isProduction && parsedAppOrigin.protocol !== 'https:')) {
    throw new Error('APP_ORIGIN must be an exact HTTPS origin in production.');
  }
}
const cookieName = 'campusflow_session';
const sessionMaxAge = 8 * 60 * 60 * 1000;
const modules = Object.keys(moduleFields);
const sharedStudentModules = new Set(['academics', 'timetable', 'rooms', 'transport', 'announcements', 'events']);
const privateStudentModules = new Set(['attendance', 'exams', 'finance', 'documents', 'requests', 'hostels', 'library']);
const roleModules = {
  administrator: new Set(modules),
  staff: new Set(['students', 'academics', 'timetable', 'attendance', 'exams', 'staff', 'rooms', 'maintenance', 'assets', 'library', 'complaints', 'announcements', 'events', 'requests']),
  student: new Set(['academics', 'timetable', 'attendance', 'exams', 'rooms', 'transport', 'hostels', 'finance', 'documents', 'complaints', 'announcements', 'events', 'requests']),
};
const createModules = {
  administrator: new Set(modules.filter((module) => module !== 'analytics')),
  staff: new Set(['attendance', 'maintenance', 'announcements', 'events', 'requests']),
  student: new Set(['hostels', 'documents', 'requests', 'complaints']),
};
const updateModules = {
  administrator: new Set(modules.filter((module) => module !== 'analytics')),
  staff: new Set(['attendance', 'timetable', 'maintenance', 'assets', 'library', 'complaints', 'announcements', 'events', 'requests']),
  student: new Set(),
};

function safeTokenEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((part) => {
    const separator = part.indexOf('=');
    if (separator < 0) return ['', ''];
    try {
      return [part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim())];
    } catch {
      return ['', ''];
    }
  }).filter(([key]) => key));
}

function publicUser(row) {
  return {
    id: row.id,
    name: row.full_name,
    initials: row.full_name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase(),
    role: row.role,
    title: row.role === 'student' ? row.programme || 'Student' : row.role === 'staff' ? 'Faculty & staff' : 'University Administration',
    email: row.email,
    department: row.department || 'University Administration',
  };
}

function sendError(res, status, message) {
  return res.status(status).json({ error: message });
}

function validatePayload(module, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return 'Record data must be an object.';
  }
  const entries = Object.entries(payload);
  if (!entries.length || entries.length > 50) return 'Records must contain between 1 and 50 fields.';
  const allowedFields = moduleFields[module];
  if (!allowedFields) return 'Unknown record module.';
  for (const [key, value] of entries) {
    if (!key.trim() || key.length > 100 || key === 'id') return 'Record contains an invalid field name.';
    if (!allowedFields.includes(key)) return `Field "${key}" is not valid for ${module}.`;
    if (typeof value !== 'string' || value.length > 4000) return `Field "${key}" must be text of at most 4000 characters.`;
  }
  if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > 12000) return 'Record data exceeds the 12 KB limit.';
  return null;
}

function canAccess(user, module) {
  return modules.includes(module) && roleModules[user.role]?.has(module);
}

function audit(connection, actorId, action, module, recordId) {
  return connection.execute(
    'INSERT INTO audit_log (actor_id, action, module_key, record_id) VALUES (?, ?, ?, ?)',
    [module === 'complaints' ? null : actorId, action, module, recordId],
  );
}

app.disable('x-powered-by');
app.set('trust proxy', isProduction ? 1 : false);
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
    },
  },
}));
app.use(express.json({ limit: '32kb' }));
app.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin) {
    let parsedOrigin;
    try {
      parsedOrigin = new URL(origin);
    } catch {
      return sendError(res, 403, 'Invalid request origin.');
    }
    if (parsedOrigin.origin !== origin) return sendError(res, 403, 'Invalid request origin.');
    if (parsedOrigin.host !== req.get('host') && parsedOrigin.origin !== appOrigin) {
      return sendError(res, 403, 'Cross-origin requests are not allowed.');
    }
  }
  next();
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Try again in 15 minutes.' },
});
const provisioningLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many account creation attempts. Try again in 15 minutes.' },
});

async function requireUser(req, res, next) {
  try {
    const token = parseCookies(req.get('cookie'))[cookieName];
    if (!token) return sendError(res, 401, 'Sign in to continue.');
    const claims = jwt.verify(token, process.env.JWT_SECRET, { issuer: 'campusflow' });
    if (!claims || typeof claims === 'string' || typeof claims.sub !== 'string') {
      return sendError(res, 401, 'Your session is invalid. Sign in again.');
    }
    const [rows] = await pool.execute(
      'SELECT id, full_name, email, role, department, programme, active FROM users WHERE id = ? LIMIT 1',
      [claims.sub],
    );
    if (!rows.length || !rows[0].active) return sendError(res, 401, 'Your account is unavailable. Sign in again.');
    req.user = rows[0];
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      return sendError(res, 401, 'Your session has expired. Sign in again.');
    }
    next(error);
  }
}

app.get('/api/health', async (_req, res, next) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/login', loginLimiter, async (req, res, next) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !password || email.length > 254 || password.length > 1024) {
      return sendError(res, 400, 'Enter a valid email address and password.');
    }
    const [rows] = await pool.execute(
      'SELECT id, full_name, email, role, department, programme, password_hash, active FROM users WHERE email = ? LIMIT 1',
      [email],
    );
    if (!rows.length || !rows[0].active || !(await bcrypt.compare(password, rows[0].password_hash))) {
      return sendError(res, 401, 'Email or password is incorrect.');
    }
    const token = jwt.sign({ sub: rows[0].id }, process.env.JWT_SECRET, { expiresIn: '8h', issuer: 'campusflow' });
    res.cookie(cookieName, token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      path: '/',
      maxAge: sessionMaxAge,
    });
    res.json({ user: publicUser(rows[0]) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie(cookieName, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
  });
  res.status(204).end();
});

app.get('/api/auth/session', requireUser, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.post('/api/users', requireUser, provisioningLimiter, async (req, res, next) => {
  try {
    if (req.user.role !== 'administrator') return sendError(res, 403, 'Administrator access is required.');
    const setupToken = process.env.USER_PROVISIONING_TOKEN;
    const suppliedToken = req.get('x-campusflow-setup-token');
    if (!setupToken) return sendError(res, 503, 'User provisioning is disabled until USER_PROVISIONING_TOKEN is configured.');
    if (!suppliedToken || !safeTokenEqual(setupToken, suppliedToken)) return sendError(res, 403, 'The user provisioning token is invalid.');
    const { name, email, password, role, department, programme } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 160) return sendError(res, 400, 'Name is required and must be at most 160 characters.');
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return sendError(res, 400, 'Enter a valid email address.');
    if (typeof password !== 'string' || password.length < 12 || password.length > 128) return sendError(res, 400, 'Password must be between 12 and 128 characters.');
    if (!['administrator', 'staff', 'student'].includes(role)) return sendError(res, 400, 'Choose a valid user role.');
    for (const [key, value] of [['department', department], ['programme', programme]]) {
      if (value !== undefined && (typeof value !== 'string' || value.length > 160)) return sendError(res, 400, `${key} must be at most 160 characters.`);
    }
    const id = randomUUID();
    const passwordHash = await bcrypt.hash(password, 12);
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        'INSERT INTO users (id, full_name, email, role, department, programme, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, name.trim(), email.trim().toLowerCase(), role, department?.trim() || null, programme?.trim() || null, passwordHash],
      );
      await audit(connection, req.user.id, 'create', 'users', id);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    res.status(201).json({ user: { id, name: name.trim(), email: email.trim().toLowerCase(), role } });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return sendError(res, 409, 'A CampusFlow account with this email already exists.');
    next(error);
  }
});

app.get('/api/records', requireUser, async (req, res, next) => {
  try {
    const accessible = modules.filter((module) => canAccess(req.user, module));
    const placeholders = accessible.map(() => '?').join(', ');
    const ownOnly = accessible.filter((module) => req.user.role === 'student' && !sharedStudentModules.has(module));
    const publicModules = accessible.filter((module) => !ownOnly.includes(module) && module !== 'complaints');
    const publicRowsPromise = publicModules.length
      ? pool.execute(
        `SELECT id, module_key, payload FROM campus_records WHERE module_key IN (${publicModules.map(() => '?').join(', ')}) ORDER BY created_at DESC`,
        publicModules,
      )
      : Promise.resolve([[]]);
    const privateRowsPromise = ownOnly.length
      ? pool.execute(
        `SELECT id, module_key, payload FROM campus_records WHERE owner_id = ? AND module_key IN (${ownOnly.map(() => '?').join(', ')}) ORDER BY created_at DESC`,
        [req.user.id, ...ownOnly],
      )
      : Promise.resolve([[]]);
    const [publicResult, privateResult] = await Promise.all([publicRowsPromise, privateRowsPromise]);
    const result = Object.fromEntries(modules.map((module) => [module, []]));
    for (const row of [...publicResult[0], ...privateResult[0]]) {
      if (row.module_key === 'announcements' && req.user.role === 'student' && !/student|all campus|engineering/i.test(row.payload.Audience ?? '')) continue;
      result[row.module_key].push({ id: row.id, ...row.payload });
    }
    if (req.user.role !== 'student' && canAccess(req.user, 'complaints')) {
      const [rows] = await pool.execute('SELECT id, payload FROM campus_records WHERE module_key = ? ORDER BY created_at DESC', ['complaints']);
      result.complaints = rows.map((row) => ({ id: row.id, ...row.payload }));
    }
    res.json({ records: result });
  } catch (error) {
    next(error);
  }
});

app.post('/api/records/complaints/track', requireUser, async (req, res, next) => {
  try {
    if (req.user.role !== 'student') return sendError(res, 403, 'Complaint tracking is available to students.');
    const cases = req.body?.cases;
    if (!Array.isArray(cases) || cases.length > 50) return sendError(res, 400, 'Provide up to 50 complaint case credentials.');
    const records = [];
    for (const item of cases) {
      if (typeof item?.id !== 'string' || typeof item?.token !== 'string' || item.token.length < 32 || item.token.length > 128) {
        return sendError(res, 400, 'A complaint tracking credential is invalid.');
      }
      const hash = createHash('sha256').update(item.token).digest('hex');
      const [rows] = await pool.execute(
        'SELECT id, payload FROM campus_records WHERE id = ? AND module_key = ? AND tracking_token_hash = ? LIMIT 1',
        [item.id, 'complaints', hash],
      );
      if (rows.length) records.push({ id: rows[0].id, ...rows[0].payload });
    }
    res.json({ records });
  } catch (error) {
    next(error);
  }
});

app.post('/api/records/:module', requireUser, async (req, res, next) => {
  const { module } = req.params;
  const { payload } = req.body ?? {};
  try {
    if (!canAccess(req.user, module) || !createModules[req.user.role]?.has(module)) return sendError(res, 403, 'You do not have permission to create this record.');
    const validationError = validatePayload(module, payload);
    if (validationError) return sendError(res, 400, validationError);
    const id = randomUUID();
    let recordPayload = payload;
    let caseReference = null;
    let trackingToken = null;
    let trackingHash = null;
    let ownerId = req.user.role === 'student' ? req.user.id : null;
    let createdBy = req.user.id;
    if (req.user.role !== 'student' && privateStudentModules.has(module) && !req.body?.ownerEmail) {
      return sendError(res, 400, 'Assign this student record to an active student account by email.');
    }
    if (req.body?.ownerEmail !== undefined) {
      const staffAssignableModules = new Set(['attendance', 'requests']);
      const canAssign = req.user.role === 'administrator'
        || req.user.role === 'staff' && staffAssignableModules.has(module);
      if (!canAssign || !privateStudentModules.has(module)) {
        return sendError(res, 403, 'You do not have permission to assign student record ownership.');
      }
      if (typeof req.body.ownerEmail !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.ownerEmail)) {
        return sendError(res, 400, 'Enter a valid student account email.');
      }
      const [owners] = await pool.execute('SELECT id, full_name FROM users WHERE email = ? AND role = ? AND active = TRUE LIMIT 1', [req.body.ownerEmail.trim().toLowerCase(), 'student']);
      if (!owners.length) return sendError(res, 404, 'No active student account uses that email.');
      ownerId = owners[0].id;
      if (typeof payload.Student === 'string') recordPayload = { ...recordPayload, Student: owners[0].full_name };
      if (typeof payload['Submitted by'] === 'string') recordPayload = { ...recordPayload, 'Submitted by': owners[0].full_name };
    }
    if (module === 'complaints') {
      const { Category, Summary, Priority } = payload;
      if (!['Safety', 'Facilities', 'Academic', 'Harassment or conduct', 'Other'].includes(Category)) return sendError(res, 400, 'Choose a valid complaint category.');
      if (!Summary?.trim() || Summary.length > 500) return sendError(res, 400, 'Complaint summary must be between 1 and 500 characters.');
      if (!['Low', 'Medium', 'High'].includes(Priority)) return sendError(res, 400, 'Choose a valid complaint urgency.');
      caseReference = `CF-${randomBytes(6).toString('hex').toUpperCase()}`;
      trackingToken = randomBytes(32).toString('base64url');
      trackingHash = createHash('sha256').update(trackingToken).digest('hex');
      recordPayload = { 'Case reference': caseReference, Category, Summary: Summary.trim(), Priority, Status: 'Submitted' };
      ownerId = null;
      createdBy = null;
    } else if (req.user.role === 'student') {
      recordPayload = { ...payload };
      if ('Student' in recordPayload) recordPayload.Student = req.user.full_name;
      if ('Submitted by' in recordPayload) recordPayload['Submitted by'] = req.user.full_name;
      if ('Status' in recordPayload) recordPayload.Status = 'Submitted';
    }
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        'INSERT INTO campus_records (id, module_key, payload, owner_id, created_by, case_reference, tracking_token_hash) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, module, JSON.stringify(recordPayload), ownerId, createdBy, caseReference, trackingHash],
      );
      await audit(connection, req.user.id, 'create', module, id);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    res.status(201).json({ record: { id, ...recordPayload }, ...(trackingToken ? { trackingToken } : {}) });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/records/:module/:id', requireUser, async (req, res, next) => {
  const { module, id } = req.params;
  try {
    if (!canAccess(req.user, module) || !updateModules[req.user.role]?.has(module)) return sendError(res, 403, 'You do not have permission to update this record.');
    const validationError = validatePayload(module, req.body?.payload);
    if (validationError) return sendError(res, 400, validationError);
    if (module === 'complaints' && !['Submitted', 'Under review', 'Escalated', 'Resolved'].includes(req.body.payload.Status)) {
      return sendError(res, 400, 'Choose a valid complaint status.');
    }
    const [existing] = await pool.execute(
      'SELECT id, payload FROM campus_records WHERE id = ? AND module_key = ? LIMIT 1',
      [id, module],
    );
    if (!existing.length) return sendError(res, 404, 'Record not found.');
    const payload = module === 'complaints'
      ? { ...existing[0].payload, Status: req.body.payload.Status }
      : req.body.payload;
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        'UPDATE campus_records SET payload = ? WHERE id = ? AND module_key = ?',
        [JSON.stringify(payload), id, module],
      );
      await audit(connection, req.user.id, 'update', module, id);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    res.json({ record: { id, ...payload } });
  } catch (error) {
    next(error);
  }
});

app.use('/api', (_req, res) => sendError(res, 404, 'API endpoint not found.'));

const appDirectory = path.dirname(fileURLToPath(import.meta.url));
const distDirectory = path.resolve(appDirectory, '../dist');
app.use(express.static(distDirectory, { index: false, maxAge: isProduction ? '1y' : 0 }));
app.get('*', (_req, res, next) => {
  res.sendFile(path.join(distDirectory, 'index.html'), (error) => {
    if (error) next(error);
  });
});

app.use((error, _req, res, _next) => {
  console.error(error.stack || error.message || error);
  if (res.headersSent) return;
  if (error.status === 400 && error.type === 'entity.parse.failed') return sendError(res, 400, 'Request body must be valid JSON.');
  if (error.status === 413) return sendError(res, 413, 'Request body exceeds the 32 KB limit.');
  if (error.code === 'ER_NO_SUCH_TABLE') return sendError(res, 503, 'CampusFlow database is not initialized. Run the database migration.');
  sendError(res, 500, isProduction ? 'An unexpected server error occurred.' : error.message || 'An unexpected server error occurred.');
});

const server = app.listen(port, '0.0.0.0', async () => {
  try {
    const connection = await pool.getConnection();
    connection.release();
    console.log(`CampusFlow server listening on port ${port}.`);
  } catch (error) {
    console.error('CampusFlow could not connect to MySQL:', error);
    server.close(() => process.exit(1));
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  });
}
