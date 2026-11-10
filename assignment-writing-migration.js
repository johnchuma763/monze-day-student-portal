require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function migrate() {
    try {
        await pool.query(`
            ALTER TABLE assignment_submissions
                ALTER COLUMN file_name DROP NOT NULL,
                ALTER COLUMN original_file_name DROP NOT NULL,
                ALTER COLUMN mime_type DROP NOT NULL,
                ALTER COLUMN file_size DROP NOT NULL;

            ALTER TABLE assignment_submissions
                ADD COLUMN IF NOT EXISTS answer_text TEXT NOT NULL DEFAULT '',
                ADD COLUMN IF NOT EXISTS calculation_text TEXT NOT NULL DEFAULT '',
                ADD COLUMN IF NOT EXISTS draft_saved_at TIMESTAMPTZ;

            ALTER TABLE assignment_submissions
                DROP CONSTRAINT IF EXISTS assignment_submissions_status_check;

            ALTER TABLE assignment_submissions
                ADD CONSTRAINT assignment_submissions_status_check
                CHECK (status IN ('draft', 'submitted', 'graded'));
        `);

        console.log("SUCCESS: Written assignment support is ready.");
    } catch (error) {
        console.error("Migration failed:", error.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

migrate();
