require("dotenv").config();

const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");
const { Pool } = require("pg");

const tables = {
    students: [
        "id", "full_name", "student_number", "class_name",
        "email", "password", "created_at", "must_change_password"
    ],
    teachers: [
        "id", "full_name", "email", "password", "created_at",
        "subjects", "classes", "is_class_teacher",
        "assigned_class", "approved", "photo_url"
    ],
    admins: [
        "id", "full_name", "email", "password", "created_at"
    ],
    announcements: [
        "id", "title", "message", "author_name",
        "author_role", "created_at", "is_published"
    ],
    academic_results: [
        "id", "student_id", "subject", "term", "year",
        "score", "grade", "remarks", "created_at"
    ],
    password_reset_tokens: [
        "id", "student_id", "token_hash", "expires_at", "used"
    ]
};

async function migrate() {
    if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL is missing from .env");
    }

    if (!fs.existsSync("portal-before-migration.db")) {
        throw new Error(
            "Backup not found. Create it first with: cp portal.db portal-before-migration.db"
        );
    }

    const sqlite = new DatabaseSync("portal.db");

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    const client = await pool.connect();

    try {
        // Refuse to overwrite existing Neon records.
        for (const table of Object.keys(tables)) {
            const result = await client.query(
                `SELECT COUNT(*)::int AS total FROM "${table}"`
            );

            if (result.rows[0].total !== 0) {
                throw new Error(
                    `Neon table "${table}" is not empty. Migration stopped.`
                );
            }
        }

        await client.query("BEGIN");

        // Copy students and other tables in dependency order.
        const order = [
            "students",
            "teachers",
            "admins",
            "announcements",
            "academic_results",
            "password_reset_tokens"
        ];

        for (const table of order) {
            const columns = tables[table];

            const rows = sqlite.prepare(
                `SELECT ${columns.map(c => `"${c}"`).join(", ")} FROM "${table}"`
            ).all();

            for (const row of rows) {
                const placeholders = columns.map(
                    (_, i) => `$${i + 1}`
                ).join(", ");

                const columnNames = columns.map(
                    c => `"${c}"`
                ).join(", ");

                await client.query(
                    `INSERT INTO "${table}" (${columnNames})
                     VALUES (${placeholders})`,
                    columns.map(c => row[c])
                );
            }

            console.log(`${table}: copied ${rows.length} record(s)`);
        }

        // Reset ID sequences so future records receive correct IDs.
        for (const table of order) {
            await client.query(
                `SELECT setval(
                    pg_get_serial_sequence($1, 'id'),
                    COALESCE(MAX(id), 1),
                    COUNT(*) > 0
                ) FROM "${table}"`,
                [table]
            );
        }

        await client.query("COMMIT");

        console.log("\nMIGRATION COMPLETED SUCCESSFULLY!");

    } catch (error) {
        await client.query("ROLLBACK");
        console.error("\nMIGRATION STOPPED:", error.message);
    } finally {
        sqlite.close();
        client.release();
        await pool.end();
    }
}

migrate().catch(error => {
    console.error("ERROR:", error.message);
    process.exitCode = 1;
});
