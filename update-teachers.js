const { DatabaseSync } = require("node:sqlite");

const db = new DatabaseSync("portal.db");

const fields = [
    ["subjects", "TEXT DEFAULT ''"],
    ["classes", "TEXT DEFAULT ''"],
    ["is_class_teacher", "INTEGER DEFAULT 0"],
    ["assigned_class", "TEXT DEFAULT ''"]
];

try {
    const existing = db.prepare(
        "PRAGMA table_info(teachers)"
    ).all();

    const existingNames = existing.map(column => column.name);

    if (existing.length === 0) {
        throw new Error("Teachers table was not found.");
    }

    for (const [name, type] of fields) {
        if (!existingNames.includes(name)) {
            db.exec(`ALTER TABLE teachers ADD COLUMN ${name} ${type}`);
            console.log("Added field:", name);
        } else {
            console.log("Already exists:", name);
        }
    }

    console.log("Teacher information database updated!");

} catch (error) {
    console.error("Update failed:", error.message);
} finally {
    db.close();
}
