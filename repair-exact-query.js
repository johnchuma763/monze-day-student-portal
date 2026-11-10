const fs = require("fs");

const file = "server-postgres.js";
const lines = fs.readFileSync(file, "utf8").split("\n");

const bad = lines.findIndex(line =>
    line.includes("REGEXP_REPLACE(LOWER(TRIM(class_name))")
);

if (bad === -1) {
    console.log("Broken query not found. No changes made.");
    process.exit(1);
}

let start = bad;
while (start >= 0 && !lines[start].includes("const studentResult = await pool.query")) {
    start--;
}

let end = bad;
while (end < lines.length && !lines[end].includes("[studentNumber.trim(), selectedClass]")) {
    end++;
}

if (start < 0 || end >= lines.length || !lines[end + 1].includes(");")) {
    console.log("Could not safely identify the query. No changes made.");
    process.exit(1);
}

const replacement = [
    "        const studentResult = await pool.query(",
    "            `SELECT id, class_name",
    "             FROM students",
    "             WHERE student_number = $1",
    "               AND REPLACE(LOWER(TRIM(class_name)), ' ', '') = REPLACE($2, ' ', '')`,",
    "            [studentNumber.trim(), selectedClass]",
    "        );"
];

fs.copyFileSync(file, file + ".before-exact-query-repair");

lines.splice(start, end + 2 - start, ...replacement);
fs.writeFileSync(file, lines.join("\n"));

console.log("Exact student query repaired.");
