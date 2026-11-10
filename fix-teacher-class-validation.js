const fs = require("fs");

const file = "server-postgres.js";
let code = fs.readFileSync(file, "utf8");

const oldCode = `if (
        is_class_teacher === "yes" &&
        !["Form 1", "Form 2", "Form 3", "Form 4"].includes(assigned_class)
    ) {
        return res.status(400).json({
            message: "Please select your assigned class."
        });
    }`;

const newCode = `const normalizedAssignedClass = (assigned_class || "")
        .trim()
        .replace(/^Form\\s*([1-4])\\s*([A-D])$/i, "Form $1$2");

    if (
        is_class_teacher === "yes" &&
        !/^Form [1-4][A-D]$/.test(normalizedAssignedClass)
    ) {
        return res.status(400).json({
            message: "Please select a valid assigned class, such as Form 2C."
        });
    }`;

if (!code.includes(oldCode)) {
    console.log("The expected validation code was not found. No changes made.");
    process.exit(1);
}

code = code.replace(oldCode, newCode);

code = code.replace(
    'is_class_teacher === "yes" ? assigned_class : ""',
    'is_class_teacher === "yes" ? normalizedAssignedClass : ""'
);

fs.writeFileSync(file, code);
console.log("Teacher class validation fixed successfully.");
