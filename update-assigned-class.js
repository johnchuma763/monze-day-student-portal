const fs = require("fs");

const settingsFile = "teacher-settings.html";
const serverFile = "server-postgres.js";

let settings = fs.readFileSync(settingsFile, "utf8");
let server = fs.readFileSync(serverFile, "utf8");

const oldDropdown = `<select id="editAssignedClass">
                <option value="">Select Class</option>
                <option value="Form 1">Form 1</option>
                <option value="Form 2">Form 2</option>
                <option value="Form 3">Form 3</option>
                <option value="Form 4">Form 4</option>
            </select>`;

let newOptions = `<select id="editAssignedClass">
                <option value="">Select Class</option>`;

for (let form = 1; form <= 4; form++) {
    for (const letter of ["A", "B", "C", "D"]) {
        const className = `Form ${form}${letter}`;
        newOptions += `
                <option value="${className}">${className}</option>`;
    }
}

newOptions += `
            </select>`;

if (!settings.includes(oldDropdown)) {
    console.error("Could not find the original Assigned Class dropdown.");
    process.exit(1);
}

const oldValidation = `if (
        is_class_teacher === "yes" &&
        !["Form 1", "Form 2", "Form 3", "Form 4"].includes(assigned_class)
    ) {
        return res.status(400).json({
            message: "Please select your assigned class."
        });
    }`;

const newValidation = `const normalizedAssignedClass = (assigned_class || "")
        .trim()
        .replace(/^Form\\\\s*([1-4])\\\\s*([A-D])$/i, "Form $1$2");

    if (
        is_class_teacher === "yes" &&
        !/^Form [1-4][A-D]$/.test(normalizedAssignedClass)
    ) {
        return res.status(400).json({
            message: "Please select one valid assigned class, such as Form 2C."
        });
    }`;

if (!server.includes(oldValidation)) {
    console.error("Could not find the original backend validation.");
    process.exit(1);
}

const saveOldValue = `is_class_teacher === "yes" ? assigned_class : "",`;

if (!server.includes(saveOldValue)) {
    console.error("Could not find the assigned class save statement.");
    process.exit(1);
}

fs.copyFileSync(settingsFile, settingsFile + ".backup-assigned-class");
fs.copyFileSync(serverFile, serverFile + ".backup-assigned-class");

settings = settings.replace(oldDropdown, newOptions);
server = server.replace(oldValidation, newValidation);
server = server.replace(
    saveOldValue,
    `is_class_teacher === "yes" ? normalizedAssignedClass : "",`
);

fs.writeFileSync(settingsFile, settings);
fs.writeFileSync(serverFile, server);

console.log("Assigned Class update completed successfully.");
console.log("All 16 classes are now available.");
console.log("Backups created for both files.");
