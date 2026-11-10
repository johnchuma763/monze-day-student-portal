const fs = require("fs");

const file = "server-postgres.js";
let code = fs.readFileSync(file, "utf8");

// Correct the registration route's whitespace regex.
code = code.replaceAll(
    String.raw`/^Form\\s*([1-4])\\s*([A-D])$/i`,
    String.raw`/^Form\s*([1-4])\s*([A-D])$/i`
);

// Ensure registration saves the normalized class.
const registrationStart = code.indexOf('app.post("/api/teacher/register"');
const profileStart = code.indexOf('app.put("/api/teacher/profile"');

if (registrationStart === -1 || profileStart === -1) {
    console.error("Could not locate both teacher routes.");
    process.exit(1);
}

let registration = code.slice(registrationStart, profileStart);
let profile = code.slice(profileStart);

registration = registration.replace(
    'is_class_teacher === "yes" ? assigned_class : ""',
    'is_class_teacher === "yes" ? normalizedAssignedClass : ""'
);

// Add normalization to the profile route.
const emailValidation = `if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(normalizedEmail)) {
        return res.status(400).json({
            message: "Please enter a valid email address."
        });
    }`;

const normalizedBlock = `
    const normalizedAssignedClass = (assigned_class || "")
        .trim()
        .replace(/^Form\\s*([1-4])\\s*([A-D])$/i, "Form $1$2");
`;

if (!profile.includes(emailValidation)) {
    console.error("Could not locate profile email validation. No changes saved.");
    process.exit(1);
}

profile = profile.replace(
    emailValidation,
    emailValidation + normalizedBlock
);

// Replace the old Form 1–4 validation.
const oldValidation = `if (
        is_class_teacher === "yes" &&
        !["Form 1", "Form 2", "Form 3", "Form 4"].includes(assigned_class)
    ) {
        return res.status(400).json({
            message: "Please select your assigned class."
        });
    }`;

const newValidation = `if (
        is_class_teacher === "yes" &&
        !/^Form [1-4][A-D]$/.test(normalizedAssignedClass)
    ) {
        return res.status(400).json({
            message: "Please select one valid assigned class, such as Form 2C."
        });
    }`;

if (!profile.includes(oldValidation)) {
    console.error("Could not locate old profile class validation. No changes saved.");
    process.exit(1);
}

profile = profile.replace(oldValidation, newValidation);

fs.copyFileSync(file, file + ".backup-fix-assigned-class");

code = code.slice(0, registrationStart) + registration + profile;
fs.writeFileSync(file, code);

console.log("Teacher registration and profile routes corrected.");
console.log("Backup created: server-postgres.js.backup-fix-assigned-class");
