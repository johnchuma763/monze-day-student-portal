const { DatabaseSync } = require("node:sqlite");
const db = new DatabaseSync("portal.db");

try {
    const columns = db.prepare("PRAGMA table_info(teachers)").all();
    if (!columns.some(column => column.name === "photo_url")) {
        db.exec("ALTER TABLE teachers ADD COLUMN photo_url TEXT DEFAULT ''");
        console.log("Teacher photo field added.");
    } else {
        console.log("Teacher photo field already exists.");
    }
} finally {
    db.close();
}
