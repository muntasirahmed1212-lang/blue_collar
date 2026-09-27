const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Starting migration...');

    // 1. Create tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            TEXT PRIMARY KEY,
        full_name     TEXT NOT NULL,
        email         TEXT UNIQUE NOT NULL,
        password      TEXT NOT NULL,
        role          TEXT NOT NULL DEFAULT 'customer',
        is_verified   BOOLEAN NOT NULL DEFAULT FALSE,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id              TEXT PRIMARY KEY,
        title           TEXT NOT NULL,
        description     TEXT DEFAULT '',
        category        TEXT DEFAULT '',
        category_slug   TEXT DEFAULT '',
        category_name   TEXT DEFAULT '',
        location        TEXT DEFAULT '',
        budget          TEXT DEFAULT '',
        urgency         TEXT NOT NULL DEFAULT 'medium',
        preferred_date  TEXT DEFAULT 'Flexible',
        preferred_time  TEXT DEFAULT 'Flexible',
        photos          JSONB DEFAULT '[]',
        status          TEXT NOT NULL DEFAULT 'open',
        customer_id     TEXT NOT NULL,
        user_id         TEXT NOT NULL,
        customer_name   TEXT DEFAULT '',
        customer_email  TEXT DEFAULT '',
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Add connect-pg-simple session table (optional, but good practice)
    await client.query(`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL,
        CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
      ) WITH (OIDS=FALSE);
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");`);

    console.log('Tables created successfully.');

    // 2. Migrate Users
    const usersPath = path.join(__dirname, 'users.json');
    if (fs.existsSync(usersPath)) {
      const usersData = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
      let migratedUsers = 0;
      for (const user of usersData) {
        // Skip test users
        if (user.email.includes('@jobs-test.example.com') || user.email.includes('@adv-test.com')) {
          continue;
        }
        
        await client.query(`
          INSERT INTO users (id, full_name, email, password, role, is_verified, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (email) DO NOTHING
        `, [
          user.id, user.fullName, user.email, user.password, user.role, 
          user.isVerified, user.createdAt || new Date(), user.updatedAt || new Date()
        ]);
        migratedUsers++;
      }
      console.log(`Migrated ${migratedUsers} real users.`);
    }

    // 3. Migrate Jobs
    const jobsPath = path.join(__dirname, 'jobs.json');
    if (fs.existsSync(jobsPath)) {
      const jobsData = JSON.parse(fs.readFileSync(jobsPath, 'utf8'));
      for (const job of jobsData) {
        await client.query(`
          INSERT INTO jobs (
            id, title, description, category, category_slug, category_name, location, budget, 
            urgency, preferred_date, preferred_time, photos, status, customer_id, user_id, 
            customer_name, customer_email, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
          ) ON CONFLICT (id) DO NOTHING
        `, [
          job.id, job.title, job.description, job.category, job.categorySlug, job.categoryName, 
          job.location, job.budget, job.urgency, job.preferredDate, job.preferredTime, 
          JSON.stringify(job.photos || []), job.status, job.customerId, job.userId, 
          job.customerName, job.customerEmail, job.createdAt || new Date(), job.updatedAt || new Date()
        ]);
      }
      console.log(`Migrated ${jobsData.length} jobs.`);
    }

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    client.release();
    pool.end();
  }
}

migrate();
