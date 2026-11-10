const { DatabaseSync } = require("node:sqlite");
const bcrypt = require("bcryptjs");
const readline = require("readline");

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function ask(question) {
    return new Promise(resolve => rl.question(question, resolve));
}

async function createAdmin() {
    const db = new DatabaseSync("portal.db");

    try {
        db.exec(`
            CREATE TABLE IF NOT EXISTS admins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                full_name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("\nMONZE DAY ADMIN ACCOUNT SETUP\n");

        const name = await ask("Administrator full name: ");
        const email = await ask("Administrator email: ");
        const password = await ask("Administrator password: ");

        if (!name.trim() || !email.trim() || password.length < 8) {
            console.log("Please enter all details and a password of at least 8 characters.");
            return;
        }

        const hash = await bcrypt.hash(password, 12);

        db.prepare(`
            INSERT INTO admins (full_name, email, password)
            VALUES (?, ?, ?)
        `).run(name.trim(), email.trim().toLowerCase(), hash);

        console.log("\nAdministrator account created successfully!");

    } catch (error) {
        console.log("\nError: " + error.message);
    } finally {
        db.close();
        rl.close();
    }
}

createAdmin();
