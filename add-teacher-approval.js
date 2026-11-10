const { DatabaseSync } = require("node:sqlite");

const db = new DatabaseSync("portal.db");

try {
    const columns = db.prepare(
        "PRAGMA table_info(teachers)"
    ).all();

    if (!columns.some(column => column.name === "approved")) {
        db.exec(`
            ALTER TABLE teachers
            ADD COLUMN approved INTEGER NOT NULL DEFAULT 0
        `);
        console.log("Approval field added.");
    } else {
        console.log("Approval field already exists.");
    }

    // Preserve access for the teacher account created earlier.
    db.prepare(`
        UPDATE teachers
        SET approved = 1
        WHERE approved IS NULL
    `).run();

    console.log("Teacher approval setup completed.");

} catch (error) {
    console.error(error.message);
} finally {
    db.close();
}
