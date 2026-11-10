const fs = require("fs");

const file = "server-postgres.js";
let code = fs.readFileSync(file, "utf8");

const start = code.indexOf("        const studentResult = await pool.query(");
const end = code.indexOf(
    "        const student = studentResult.rows[0];",
    start
);

if (start === -1 || end === -1) {
    console.log("Could not find the complete student query. No changes made.");
    process.exit(1);
}

const replacement = [
    "        const studentResult = await pool.query(",
    "            `SELECT id, class_name",
    "             FROM students",
    "             WHERE student_number = $1",
    "               AND REPLACE(LOWER(TRIM(class_name)), ' ', '') = REPLACE($2, ' ', '')`,",
    "            [studentNumber.trim(), selectedClass]",
    "        );",
    ""
].join("\n");

fs.copyFileSync(file, file + ".before-simple-class-query");

code = code.slice(0, start) + replacement + code.slice(end);
fs.writeFileSync(file, code);

console.log("Student class query repaired successfully.");
