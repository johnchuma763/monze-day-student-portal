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
            ADD COLUMN IF NOT EXISTS formula_text TEXT NOT NULL DEFAULT '',
            ADD COLUMN IF NOT EXISTS calculation_drawing TEXT NOT NULL DEFAULT '',
            ADD COLUMN IF NOT EXISTS answer_drawing TEXT NOT NULL DEFAULT '';
        `);

        console.log("SUCCESS: Formula and drawing support is ready.");
    } catch (error) {
        console.error("Migration failed:", error.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

migrate();
