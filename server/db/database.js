const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle database client:', err.message);
});

async function readUsers() {
  const res = await pool.query('SELECT * FROM users');
  return res.rows.map(mapUser);
}

async function findUserByEmail(email) {
  if (!email || typeof email !== 'string' || !email.trim()) return undefined;
  const res = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);
  return res.rows[0] ? mapUser(res.rows[0]) : undefined;
}

async function findUserById(id) {
  if (!id || typeof id !== 'string' || !id.trim()) return undefined;
  const res = await pool.query('SELECT * FROM users WHERE id = $1', [id.trim()]);
  return res.rows[0] ? mapUser(res.rows[0]) : undefined;
}

async function createUser(userData) {
  if (!userData || !userData.email) return userData;
  const res = await pool.query(`
    INSERT INTO users (id, full_name, email, password, role, is_verified, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (email) DO UPDATE SET 
      full_name = EXCLUDED.full_name,
      password = EXCLUDED.password,
      role = EXCLUDED.role,
      is_verified = EXCLUDED.is_verified,
      updated_at = EXCLUDED.updated_at
    RETURNING *
  `, [
    userData.id, userData.fullName, userData.email.toLowerCase().trim(), userData.password, 
    userData.role || 'customer', userData.isVerified || false, 
    userData.createdAt || new Date(), userData.updatedAt || new Date()
  ]);
  return mapUser(res.rows[0]);
}

async function updateUser(email, updates) {
  if (!email || typeof email !== 'string' || !email.trim()) return null;
  const target = email.trim().toLowerCase();
  
  const current = await findUserByEmail(target);
  if (!current) return null;

  const merged = { ...current, ...updates };
  const res = await pool.query(`
    UPDATE users SET 
      full_name = $1, password = $2, role = $3, is_verified = $4, updated_at = $5
    WHERE LOWER(email) = $6 RETURNING *
  `, [
    merged.fullName, merged.password, merged.role, merged.isVerified, new Date(), target
  ]);
  
  return res.rows[0] ? mapUser(res.rows[0]) : null;
}

async function deleteUser(email) {
  if (!email || typeof email !== 'string' || !email.trim()) return false;
  const res = await pool.query('DELETE FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);
  return res.rowCount > 0;
}

async function readJobs() {
  const res = await pool.query('SELECT * FROM jobs');
  return res.rows.map(mapJob);
}

async function findJobById(id) {
  if (!id || typeof id !== 'string' || !id.trim()) return undefined;
  const res = await pool.query('SELECT * FROM jobs WHERE id = $1', [id.trim()]);
  return res.rows[0] ? mapJob(res.rows[0]) : undefined;
}

async function createJob(jobData) {
  if (!jobData) throw new TypeError('jobData must be a valid non-null object');
  const res = await pool.query(`
    INSERT INTO jobs (
      id, title, description, category, category_slug, category_name, location, budget, 
      urgency, preferred_date, preferred_time, photos, status, customer_id, user_id, 
      customer_name, customer_email, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
    RETURNING *
  `, [
    jobData.id, jobData.title, jobData.description, jobData.category, jobData.categorySlug, 
    jobData.categoryName, jobData.location, jobData.budget, jobData.urgency, jobData.preferredDate, 
    jobData.preferredTime, JSON.stringify(jobData.photos || []), jobData.status, jobData.customerId, 
    jobData.userId, jobData.customerName, jobData.customerEmail, jobData.createdAt || new Date(), 
    jobData.updatedAt || new Date()
  ]);
  return mapJob(res.rows[0]);
}

async function updateJob(id, updates) {
  if (!id || !updates) return null;
  const current = await findJobById(id);
  if (!current) return null;

  const merged = { ...current, ...updates };
  const res = await pool.query(`
    UPDATE jobs SET 
      title = $1, description = $2, category = $3, category_slug = $4, category_name = $5,
      location = $6, budget = $7, urgency = $8, preferred_date = $9, preferred_time = $10,
      photos = $11, status = $12, updated_at = $13
    WHERE id = $14 RETURNING *
  `, [
    merged.title, merged.description, merged.category, merged.categorySlug, merged.categoryName,
    merged.location, merged.budget, merged.urgency, merged.preferredDate, merged.preferredTime,
    JSON.stringify(merged.photos || []), merged.status, new Date(), id
  ]);
  
  return res.rows[0] ? mapJob(res.rows[0]) : null;
}

async function deleteJob(id, soft = true) {
  if (!id) return soft ? null : false;
  if (soft) {
    const res = await pool.query(`UPDATE jobs SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *`, [id]);
    return res.rows[0] ? mapJob(res.rows[0]) : null;
  } else {
    const res = await pool.query('DELETE FROM jobs WHERE id = $1', [id]);
    return res.rowCount > 0;
  }
}

function writeJobs() { return true; } // no-op compatibility

// Mapping functions (snake_case -> camelCase)
function mapUser(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    password: row.password,
    role: row.role,
    isVerified: row.is_verified,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapJob(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    categorySlug: row.category_slug,
    categoryName: row.category_name,
    location: row.location,
    budget: row.budget,
    urgency: row.urgency,
    preferredDate: row.preferred_date,
    preferredTime: row.preferred_time,
    photos: typeof row.photos === 'string' ? JSON.parse(row.photos) : (row.photos || []),
    status: row.status,
    customerId: row.customer_id,
    userId: row.user_id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

module.exports = {
  pool,
  findUserByEmail,
  createUser,
  updateUser,
  deleteUser,
  readUsers,
  findUserById,
  readJobs,
  writeJobs,
  findJobById,
  createJob,
  updateJob,
  deleteJob
};
