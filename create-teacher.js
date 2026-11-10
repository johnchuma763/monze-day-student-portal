const { DatabaseSync } = require("node:sqlite");
const bcrypt = require("bcryptjs");
const readline = require("readline");

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function ask(question) {
    return new Promise(resolve => {
        rl.question(question, resolve);
    });
}

async function createTeacher() {
    const name = await ask("Teacher full name: ");
    const email = await ask("Teacher email: ");
    const password = await ask("Teacher password: ");

    if (!name.trim() || !email.trim() || password.length < 8) {
        console.log("Please enter valid details and a password of at least 8 characters.");
        rl.close();
        return;
    }

    const db = new DatabaseSync("portal.db");

    try {
        const hash = await bcrypt.hash(password, 12);

        db.prepare(`
            INSERT INTO teachers (full_name, email, password)
            VALUES (?, ?, ?)
        `).run(name.trim(), email.trim().toLowerCase(), hash);

        console.log("Teacher account created successfully!");

    } catch (error) {
        console.log("Error: " + error.message);
    } finally {
        db.close();
        rl.close();
    }
}

createTeacher();
