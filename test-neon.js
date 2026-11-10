require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function test() {
    try {
        const result = await pool.query(
            "SELECT current_database() AS database"
        );

        console.log("NEON CONNECTION SUCCESSFUL!");
        console.log("Database:", result.rows[0].database);
    } catch (error) {
        console.log("CONNECTION FAILED:", error.message);
    } finally {
        await pool.end();
    }
}

test();
