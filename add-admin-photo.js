const fs = require("node:fs");

const file = "server-postgres.js";
let code = fs.readFileSync(file, "utf8");

if (code.includes("uploadAdminPhoto") ||
    code.includes("/api/admin/photo")) {
    console.log("Admin photo feature already appears to exist. No changes made.");
    process.exit(0);
}

const configAnchor = 'app.use(express.json());';

const adminPhotoConfig = `
/* ADMINISTRATOR PROFILE PHOTO UPLOADS */
const adminPhotoDirectory = path.join(
    __dirname, "uploads", "admin-photos"
);

fs.mkdirSync(adminPhotoDirectory, { recursive: true });

const adminPhotoStorage = multer.diskStorage({
    destination: (req, file, callback) => {
        callback(null, adminPhotoDirectory);
    },
    filename: (req, file, callback) => {
        const extensions = {
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/webp": ".webp"
        };
        callback(null, crypto.randomUUID() + extensions[file.mimetype]);
    }
});

const uploadAdminPhoto = multer({
    storage: adminPhotoStorage,
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, callback) => {
        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/webp"
        ];

        if (!allowedTypes.includes(file.mimetype)) {
            return callback(
                new Error("Only JPG, PNG and WEBP images are allowed.")
            );
        }

        callback(null, true);
    }
});

const adminPhotoColumnReady = pool.query(
    "ALTER TABLE admins ADD COLUMN IF NOT EXISTS photo_url TEXT"
);

`;

if (!code.includes(configAnchor)) {
    console.error("Could not find the middleware insertion point. No changes made.");
    process.exit(1);
}

const meAnchor = 'app.get("/api/admin/me", async (req, res) => {';
const logoutAnchor = 'app.post("/api/admin/logout",';

if (!code.includes(meAnchor) || !code.includes(logoutAnchor)) {
    console.error("Could not find the admin routes. No changes made.");
    process.exit(1);
}

const meStart = code.indexOf(meAnchor);
const logoutStart = code.indexOf(logoutAnchor);
const meSection = code.slice(meStart, logoutStart);

if (!meSection.includes("SELECT id, full_name, email, created_at")) {
    console.error("The expected admin profile query was not found. No changes made.");
    process.exit(1);
}

const updatedMeSection = meSection.replace(
    "SELECT id, full_name, email, created_at",
    "SELECT id, full_name, email, created_at, photo_url"
);

const photoRoute = `
/* ADMINISTRATOR PROFILE PHOTO ROUTE */
app.post("/api/admin/photo",
    async (req, res, next) => {
        if (!req.session.adminId) {
            return res.status(401).json({
                message: "Administrator login required."
            });
        }

        try {
            await adminPhotoColumnReady;
            next();
        } catch (error) {
            console.error(error);
            res.status(500).json({
                message: "Administrator photo storage is unavailable."
            });
        }
    },
    uploadAdminPhoto.single("photo"),
    async (req, res) => {
        if (!req.file) {
            return res.status(400).json({
                message: "Please select a photo."
            });
        }

        let oldPhotoUrl = null;

        try {
            const current = await pool.query(
                "SELECT photo_url FROM admins WHERE id = $1",
                [req.session.adminId]
            );

            oldPhotoUrl = current.rows[0]?.photo_url || null;

            const photoUrl = "/uploads/admin-photos/" + req.file.filename;

            await pool.query(
                "UPDATE admins SET photo_url = $1 WHERE id = $2",
                [photoUrl, req.session.adminId]
            );

            if (
                oldPhotoUrl &&
                oldPhotoUrl.startsWith("/uploads/admin-photos/")
            ) {
                const oldFile = path.join(
                    adminPhotoDirectory,
                    path.basename(oldPhotoUrl)
                );

                if (fs.existsSync(oldFile)) {
                    fs.unlinkSync(oldFile);
                }
            }

            res.json({
                message: "Administrator profile photo updated successfully.",
                photo_url: photoUrl
            });
        } catch (error) {
            console.error(error);

            if (req.file && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }

            res.status(500).json({
                message: "Unable to save administrator profile photo."
            });
        }
    }
);

`;

fs.copyFileSync(file, file + ".backup-admin-photo");

code = code.replace(configAnchor, adminPhotoConfig + configAnchor);
code = code.replace(meSection, updatedMeSection);
code = code.replace(logoutAnchor, photoRoute + logoutAnchor);

fs.writeFileSync(file, code);

console.log("Admin photo backend added.");
console.log("Backup created: server-postgres.js.backup-admin-photo");
