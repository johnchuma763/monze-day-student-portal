const fs = require("node:fs");

const file = "server-postgres.js";
let code = fs.readFileSync(file, "utf8");

const oldCode = `    uploadAdminPhoto.single("photo"),
    async (req, res) => {`;

const newCode = `    (req, res, next) => {
        uploadAdminPhoto.single("photo")(req, res, (error) => {
            if (error) {
                console.error("Admin photo upload error:", error);

                const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;

                return res.status(status).json({
                    message: error.message || "Photo upload failed."
                });
            }

            next();
        });
    },
    async (req, res) => {`;

if (!code.includes(oldCode)) {
    console.log("Expected upload middleware not found. No changes made.");
    process.exit(1);
}

fs.copyFileSync(file, file + ".backup-photo-errors");

code = code.replace(oldCode, newCode);
fs.writeFileSync(file, code);

console.log("Admin photo error handling updated.");
console.log("Backup created.");
