require("dotenv").config();

const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

function makePassword() {
  return crypto.randomBytes(12).toString("base64url");
}

async function main() {
  const accounts = [
    { table: "admins", role: "ADMIN" },
    { table: "teachers", role: "TEACHER" },
    { table: "students", role: "STUDENT" }
  ];

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const credentials = [];

    for (const account of accounts) {
      const result = await client.query(
        `SELECT id FROM ${account.table} ORDER BY id LIMIT 1`
      );

      if (result.rowCount !== 1) {
        throw new Error(`Expected one test account in ${account.table}`);
      }

      const password = makePassword();
      const hash = await bcrypt.hash(password, 12);

      if (account.table === "students") {
        await client.query(
          "UPDATE students SET password = $1, must_change_password = 1 WHERE id = $2",
          [hash, result.rows[0].id]
        );
      } else {
        await client.query(
          `UPDATE ${account.table} SET password = $1 WHERE id = $2`,
          [hash, result.rows[0].id]
        );
      }

      credentials.push({ role: account.role, password });
    }

    await client.query("COMMIT");

    console.log("\nPASSWORD RESET SUCCESSFUL");
    console.log("Save these temporary passwords somewhere safe:\n");

    for (const item of credentials) {
      console.log(`${item.role}: ${item.password}`);
    }

    console.log("\nDo not share these passwords in chat.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("RESET FAILED:", error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
