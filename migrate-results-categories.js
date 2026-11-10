require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(`
      ALTER TABLE academic_results
      ADD COLUMN IF NOT EXISTS assessment_type TEXT NOT NULL DEFAULT 'unclassified',
      ADD COLUMN IF NOT EXISTS assessment_kind TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS assessment_name TEXT NOT NULL DEFAULT ''
    `);

    const result = await client.query(`
      UPDATE academic_results ar
      SET assessment_type = 'end_of_term',
          assessment_kind = 'End-of-Term Examination',
          assessment_name = 'End-of-Term Examination'
      FROM students s
      WHERE ar.student_id = s.id
        AND ar.id = 2
        AND s.student_number = '001'
        AND ar.subject = 'Maths'
        AND ar.term = 'Term 1'
        AND ar.year = 2026
    `);

    if (result.rowCount !== 1) {
      throw new Error(
        `Expected to update exactly one matching record, but updated ${result.rowCount}.`
      );
    }

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_academic_results_category
      ON academic_results (student_id, assessment_type, year, term)
    `);

    await client.query("COMMIT");

    const check = await client.query(`
      SELECT ar.id, s.student_number, ar.subject, ar.term, ar.year,
             ar.score, ar.assessment_type, ar.assessment_kind
      FROM academic_results ar
      JOIN students s ON s.id = ar.student_id
      ORDER BY ar.year, ar.id
    `);

    console.log("Migration completed successfully.");
    console.table(check.rows);

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Migration failed. Changes were rolled back:", error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
