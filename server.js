const express = require("express");
const bcrypt = require("bcryptjs");
const session = require("express-session");
const { DatabaseSync } =
 require("node:sqlite");
const path = require("path");
const fs = require("node:fs");
const multer = require("multer");
const crypto = require("node:crypto");
const app = express();
const PORT = process.env.PORT || 3000;

// Connect to SQLite database
const db = new DatabaseSync("portal.db");


// TEACHER PROFILE PHOTO UPLOADS
const uploadDirectory = path.join(__dirname, "uploads", "teacher-photos");

fs.mkdirSync(uploadDirectory, { recursive: true });

const photoStorage = multer.diskStorage({
    destination: (req, file, callback) => {
        callback(null, uploadDirectory);
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

const uploadTeacherPhoto = multer({
    storage: photoStorage,
    limits: {
        fileSize: 2 * 1024 * 1024
    },
    fileFilter: (req, file, callback) => {
        const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

        if (!allowedTypes.includes(file.mimetype)) {
            return callback(new Error("Only JPG, PNG and WEBP images are allowed."));
        }

        callback(null, true);
    }
});

// Create student accounts table
db.exec(`
    CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        student_number TEXT NOT NULL UNIQUE,
        class_name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
`);

// Store secure student password-reset tokens
db.exec(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at INTEGER NOT NULL,
        used INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    );
`);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Development session settings
app.use(session({
    secret: process.env.SESSION_SECRET || "change-this-secret-before-deployment",
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        maxAge: 1000 * 60 * 60 * 2
    }
}));

// Serve website pages
app.use(express.static(__dirname));


/* STUDENT ACCOUNTS ARE CREATED BY ADMINISTRATORS */
app.post("/api/register", (req, res) => {
    res.status(403).json({
        message: "Student accounts are created by the school administrator."
    });
});

// Student login: email and password
app.post("/api/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message: "Enter your email address and password."
            });
        }

        const student = db.prepare(
            "SELECT * FROM students WHERE email = ?"
        ).get(email.trim().toLowerCase());

        if (!student) {
            return res.status(401).json({
                message: "Invalid email address or password."
            });
        }

        const passwordMatches = await bcrypt.compare(
            password,
            student.password
        );

        if (!passwordMatches) {
            return res.status(401).json({
                message: "Invalid email address or password."
            });
        }

        req.session.studentId = student.id;

        res.json({
            message: "Login successful.",
            mustChangePassword: student.must_change_password === 1,
            student: {
                fullName: student.full_name,
                studentNumber: student.student_number,
                className: student.class_name,
                email: student.email
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Login failed. Please try again."
        });
    }
});

// Get signed-in student's profile
app.get("/api/student/me", (req, res) => {
    if (!req.session.studentId) {
        return res.status(401).json({
            message: "Please sign in first."
        });
    }

    const student = db.prepare(`
        SELECT full_name, student_number, class_name, email,
               must_change_password
        FROM students
        WHERE id = ?
    `).get(req.session.studentId);

    if (!student) {
        return res.status(404).json({
            message: "Student account not found."
        });
    }

    if (student.must_change_password === 1) {
        return res.status(403).json({
            mustChangePassword: true,
            message: "Please change your temporary password first."
        });
    }

    delete student.must_change_password;
    res.json(student);
});

// Change temporary student password
app.post("/api/student/change-password", async (req, res) => {
    try {
        if (!req.session.studentId) {
            return res.status(401).json({
                message: "Please sign in first."
            });
        }

        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                message: "Complete all password fields."
            });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({
                message: "Your new password must contain at least 8 characters."
            });
        }

        if (currentPassword === newPassword) {
            return res.status(400).json({
                message: "Choose a different new password."
            });
        }

        const student = db.prepare(
            "SELECT password FROM students WHERE id = ?"
        ).get(req.session.studentId);

        if (!student) {
            return res.status(404).json({
                message: "Student account not found."
            });
        }

        const matches = await bcrypt.compare(
            currentPassword,
            student.password
        );

        if (!matches) {
            return res.status(401).json({
                message: "Current password is incorrect."
            });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 12);

        db.prepare(`
            UPDATE students
            SET password = ?, must_change_password = 0
            WHERE id = ?
        `).run(hashedPassword, req.session.studentId);

        res.json({
            message: "Password changed successfully. You can now access your dashboard."
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Unable to change password."
        });
    }
});


const resetLimiter = new Map();

// Request a password-reset link
app.post("/api/student/forgot-password", async (req, res) => {
    try {
        const email = String(req.body.email || "").trim().toLowerCase();

        if (!email || email.length > 254) {
            return res.status(400).json({
                message: "Enter a valid email address."
            });
        }

        const now = Date.now();
        const previous = resetLimiter.get(email) || 0;

        if (now - previous < 60000) {
            return res.json({
                message: "If an account exists, reset instructions will be provided."
            });
        }

        resetLimiter.set(email, now);

        const student = db.prepare(
            "SELECT id FROM students WHERE email = ?"
        ).get(email);

        if (student) {
            const token = crypto.randomBytes(32).toString("hex");
            const tokenHash = crypto.createHash("sha256")
                .update(token).digest("hex");

            db.prepare(
                "DELETE FROM password_reset_tokens WHERE student_id = ?"
            ).run(student.id);

            db.prepare(`
                INSERT INTO password_reset_tokens
                (student_id, token_hash, expires_at)
                VALUES (?, ?, ?)
            `).run(student.id, tokenHash, now + 15 * 60 * 1000);

            if (process.env.NODE_ENV !== "production") {
                const link = "http://" + req.get("host") +
                    "/reset-password.html?token=" + token;

                console.log("DEVELOPMENT PASSWORD RESET LINK:", link);
            }
        }

        res.json({
            message: "If an account exists, reset instructions will be provided."
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Unable to process your request."
        });
    }
});

// Complete a password reset
app.post("/api/student/reset-password", async (req, res) => {
    try {
        const token = String(req.body.token || "");
        const newPassword = String(req.body.newPassword || "");

        if (!token || token.length !== 64 || !/^[a-f0-9]+$/i.test(token)) {
            return res.status(400).json({
                message: "Invalid or expired reset link."
            });
        }

        if (newPassword.length < 8 || newPassword.length > 128) {
            return res.status(400).json({
                message: "Password must contain between 8 and 128 characters."
            });
        }

        const tokenHash = crypto.createHash("sha256")
            .update(token).digest("hex");

        const record = db.prepare(`
            SELECT id, student_id
            FROM password_reset_tokens
            WHERE token_hash = ? AND used = 0 AND expires_at > ?
        `).get(tokenHash, Date.now());

        if (!record) {
            return res.status(400).json({
                message: "Invalid or expired reset link."
            });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 12);

        db.prepare("UPDATE students SET password = ?, must_change_password = 0 WHERE id = ?")
            .run(hashedPassword, record.student_id);

        db.prepare("UPDATE password_reset_tokens SET used = 1 WHERE id = ?")
            .run(record.id);

        db.prepare("DELETE FROM password_reset_tokens WHERE student_id = ? AND id != ?")
            .run(record.student_id, record.id);

        res.json({
            message: "Password reset successfully. You can now sign in."
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Unable to reset your password."
        });
    }
});

// Student logout
app.post("/api/logout", (req, res) => {
    req.session.destroy(() => {
        res.json({
            message: "Logged out successfully."
        });
    });
});

// GET A STUDENT'S ACADEMIC RESULTS
app.get("/api/student/results", (req, res) => {
    if (!req.session.studentId) {
        return res.status(401).json({
            message: "Please log in first."
        });
    }

    try {
        const student = db.prepare(
            "SELECT must_change_password FROM students WHERE id = ?"
        ).get(req.session.studentId);

        if (!student) {
            return res.status(404).json({
                message: "Student account not found."
            });
        }

        if (student.must_change_password === 1) {
            return res.status(403).json({
                mustChangePassword: true,
                message: "Change your temporary password first."
            });
        }

        const results = db.prepare(`
            SELECT subject, term, year, score, grade, remarks
            FROM academic_results
            WHERE student_id = ?
            ORDER BY year DESC, term ASC, subject ASC
        `).all(req.session.studentId);

        res.json(results);

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Unable to load academic results."
        });
    }
});

// TEACHER REGISTRATION
app.post("/api/teacher/register", async (req, res) => {
    const {
        full_name, email, password, subjects,
        classes, is_class_teacher, assigned_class
    } = req.body;

    if (
        !full_name?.trim() ||
        !email?.trim() ||
        !password ||
        password.length < 8 ||
        !subjects?.trim() ||
        !classes?.trim() ||
        !["yes", "no"].includes(is_class_teacher)
    ) {
        return res.status(400).json({
            message: "Please complete all required fields."
        });
    }

    if (
        is_class_teacher === "yes" &&
        !["Form 1", "Form 2", "Form 3", "Form 4"].includes(assigned_class)
    ) {
        return res.status(400).json({
            message: "Please select your assigned class."
        });
    }

    try {
        const normalizedEmail = email.trim().toLowerCase();

        const existing = db.prepare(
            "SELECT id FROM teachers WHERE email = ?"
        ).get(normalizedEmail);

        if (existing) {
            return res.status(409).json({
                message: "An account with this email already exists."
            });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        db.prepare(`
            INSERT INTO teachers (
                full_name, email, password, subjects,
                classes, is_class_teacher, assigned_class, approved
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, 0)
        `).run(
            full_name.trim(),
            normalizedEmail,
            hashedPassword,
            subjects.trim(),
            classes.trim(),
            is_class_teacher === "yes" ? 1 : 0,
            is_class_teacher === "yes" ? assigned_class : ""
        );

        res.status(201).json({
            message: "Registration submitted! Please wait for administrator approval."
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Unable to complete registration."
        });
    }
});

// TEACHER LOGIN
app.post("/api/teacher/login", async (req, res) => {
    const { email, password } = req.body;

    try {
        const teacher = db.prepare(
            "SELECT * FROM teachers WHERE email = ?"
        ).get(email.toLowerCase().trim());

        if (!teacher) {
            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        const validPassword = await bcrypt.compare(
            password,
            teacher.password
        );

        if (!validPassword) {
            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        if (teacher.approved !== 1) {
            return res.status(403).json({
                message: "Your account is awaiting administrator approval."
            });
        }

        req.session.teacherId = teacher.id;

        res.json({
            message: "Teacher login successful!",
            full_name: teacher.full_name
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Unable to log in."
        });
    }
});


// TEACHER PROFILE
app.get("/api/teacher/me", (req, res) => {
    if (!req.session.teacherId) {
        return res.status(401).json({
            message: "Please log in first."
        });
    }

    try {
        const teacher = db.prepare(`
            SELECT
                full_name,
                email,
                subjects,
                classes,
                is_class_teacher,
                assigned_class,
                photo_url,
                created_at
            FROM teachers
            WHERE id = ?
        `).get(req.session.teacherId);

        if (!teacher) {
            return res.status(404).json({
                message: "Teacher account not found."
            });
        }

        res.json(teacher);

    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Unable to load teacher profile."
        });
    }
});


// TEACHER: UPDATE PROFILE
app.put("/api/teacher/profile", (req, res) => {
    if (!req.session.teacherId) {
        return res.status(401).json({
            message: "Teacher login required."
        });
    }

    const {
        full_name,
        email,
        subjects,
        classes,
        is_class_teacher,
        assigned_class
    } = req.body;

    if (
        !full_name?.trim() ||
        !email?.trim() ||
        !subjects?.trim() ||
        !classes?.trim() ||
        !["yes", "no"].includes(is_class_teacher)
    ) {
        return res.status(400).json({
            message: "Please complete all required fields."
        });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return res.status(400).json({
            message: "Please enter a valid email address."
        });
    }

    if (
        is_class_teacher === "yes" &&
        !["Form 1", "Form 2", "Form 3", "Form 4"].includes(assigned_class)
    ) {
        return res.status(400).json({
            message: "Please select your assigned class."
        });
    }

    try {
        const existing = db.prepare(`
            SELECT id FROM teachers
            WHERE email = ? AND id != ?
        `).get(normalizedEmail, req.session.teacherId);

        if (existing) {
            return res.status(409).json({
                message: "That email address is already in use."
            });
        }

        db.prepare(`
            UPDATE teachers
            SET
                full_name = ?,
                email = ?,
                subjects = ?,
                classes = ?,
                is_class_teacher = ?,
                assigned_class = ?
            WHERE id = ?
        `).run(
            full_name.trim(),
            normalizedEmail,
            subjects.trim(),
            classes.trim(),
            is_class_teacher === "yes" ? 1 : 0,
            is_class_teacher === "yes" ? assigned_class : "",
            req.session.teacherId
        );

        res.json({
            message: "Teacher profile updated successfully."
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Unable to update teacher profile."
        });
    }
});

// TEACHER: CHANGE PASSWORD
app.post("/api/teacher/change-password", async (req, res) => {
    if (!req.session.teacherId) {
        return res.status(401).json({
            message: "Teacher login required."
        });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({
            message: "Please complete all password fields."
        });
    }

    if (newPassword.length < 8) {
        return res.status(400).json({
            message: "New password must contain at least 8 characters."
        });
    }

    try {
        const teacher = db.prepare(
            "SELECT password FROM teachers WHERE id = ?"
        ).get(req.session.teacherId);

        if (!teacher) {
            return res.status(404).json({
                message: "Teacher account not found."
            });
        }

        const validPassword = await bcrypt.compare(
            currentPassword,
            teacher.password
        );

        if (!validPassword) {
            return res.status(401).json({
                message: "Current password is incorrect."
            });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 12);

        db.prepare(
            "UPDATE teachers SET password = ? WHERE id = ?"
        ).run(hashedPassword, req.session.teacherId);

        res.json({
            message: "Password changed successfully."
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Unable to change password."
        });
    }
});


// TEACHER: UPLOAD PROFILE PHOTO
app.post(
    "/api/teacher/photo",
    (req, res, next) => {
        if (!req.session.teacherId) {
            return res.status(401).json({
                message: "Teacher login required."
            });
        }

        next();
    },
    uploadTeacherPhoto.single("photo"),
    (req, res) => {
        if (!req.file) {
            return res.status(400).json({
                message: "Please select a profile photo."
            });
        }

        try {
            const photoUrl =
                "/uploads/teacher-photos/" + req.file.filename;

            const teacher = db.prepare(
                "SELECT photo_url FROM teachers WHERE id = ?"
            ).get(req.session.teacherId);

            if (!teacher) {
                fs.unlinkSync(req.file.path);

                return res.status(404).json({
                    message: "Teacher account not found."
                });
            }

            db.prepare(
                "UPDATE teachers SET photo_url = ? WHERE id = ?"
            ).run(photoUrl, req.session.teacherId);

            // Remove the previous uploaded photo
            if (teacher.photo_url &&
                teacher.photo_url.startsWith("/uploads/teacher-photos/")) {

                const oldPhoto = path.basename(teacher.photo_url);
                const oldPath = path.join(uploadDirectory, oldPhoto);

                if (fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath);
                }
            }

            res.json({
                message: "Profile photo updated successfully.",
                photo_url: photoUrl
            });

        } catch (error) {
            console.error(error);

            res.status(500).json({
                message: "Unable to update profile photo."
            });
        }
    }
);


// TEACHER: ADD STUDENT ACADEMIC RESULT
app.post("/api/teacher/results", (req, res) => {
    if (!req.session.teacherId) {
        return res.status(401).json({
            message: "Teacher login required."
        });
    }

    const {
        studentNumber,
        subject,
        term,
        year,
        score,
        grade,
        remarks
    } = req.body;

    if (!studentNumber?.trim() || !subject?.trim() ||
        !term || !year || score === undefined || !grade) {
        return res.status(400).json({
            message: "Please complete all required fields."
        });
    }

    const numericScore = Number(score);
    const numericYear = Number(year);

    if (!Number.isFinite(numericScore) ||
        numericScore < 0 || numericScore > 100) {
        return res.status(400).json({
            message: "Score must be between 0 and 100."
        });
    }

    if (!Number.isInteger(numericYear) ||
        numericYear < 2000 || numericYear > 2100) {
        return res.status(400).json({
            message: "Please enter a valid academic year."
        });
    }

    if (!["Term 1", "Term 2", "Term 3"].includes(term)) {
        return res.status(400).json({
            message: "Invalid academic term."
        });
    }

    const allowedGrades = [
        "Distinction", "Merit", "Credit", "Pass", "Fail"
    ];

    if (!allowedGrades.includes(grade)) {
        return res.status(400).json({
            message: "Please select a valid grade."
        });
    }

    try {
        const teacher = db.prepare(
            "SELECT subjects, classes, is_class_teacher, assigned_class FROM teachers WHERE id = ? AND approved = 1"
        ).get(req.session.teacherId);

        if (!teacher) {
            return res.status(403).json({
                message: "Approved teacher account required."
            });
        }

        const student = db.prepare(
            "SELECT id, class_name FROM students WHERE student_number = ?"
        ).get(studentNumber.trim());

        if (!student) {
            return res.status(404).json({
                message: "Student not found."
            });
        }

        const assignedClasses = (teacher.classes || "")
            .split(",")
            .map(value => value.trim().toLowerCase())
            .filter(Boolean);

        if (teacher.is_class_teacher === 1 && teacher.assigned_class) {
            assignedClasses.push(teacher.assigned_class.trim().toLowerCase());
        }

        if (!assignedClasses.includes(student.class_name.trim().toLowerCase())) {
            return res.status(403).json({
                message: "You are not assigned to this student's class."
            });
        }

        const assignedSubjects = (teacher.subjects || "")
            .split(",")
            .map(value => value.trim().toLowerCase())
            .filter(Boolean);

        if (!assignedSubjects.includes(subject.trim().toLowerCase())) {
            return res.status(403).json({
                message: "You are not assigned to teach this subject."
            });
        }

        const duplicate = db.prepare(`
            SELECT id FROM academic_results
            WHERE student_id = ?
              AND LOWER(subject) = LOWER(?)
              AND term = ?
              AND year = ?
        `).get(student.id, subject.trim(), term, numericYear);

        if (duplicate) {
            return res.status(409).json({
                message: "A result for this student, subject, term and year already exists."
            });
        }

        db.prepare(`
            INSERT INTO academic_results
            (student_id, subject, term, year, score, grade, remarks)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            student.id,
            subject.trim(),
            term,
            numericYear,
            numericScore,
            grade,
            (remarks || "").trim()
        );

        res.status(201).json({
            message: "Academic result saved successfully."
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Unable to save academic result."
        });
    }
});

// START SERVER

// PUBLIC: GET APPROVED TEACHERS FOR HOMEPAGE
app.get("/api/public/teachers", (req, res) => {
    try {
        const teachers = db.prepare(`
            SELECT full_name, subjects, classes,
                   is_class_teacher, assigned_class, photo_url
            FROM teachers
            WHERE approved = 1
            ORDER BY full_name ASC
        `).all();

        res.json(teachers);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Unable to load teachers."
        });
    }
});


// TEACHER: VIEW REGISTERED STUDENTS
app.get("/api/teacher/students", (req, res) => {
    if (!req.session.teacherId) {
        return res.status(401).json({
            message: "Teacher login required."
        });
    }

    try {
        const students = db.prepare(`
            SELECT full_name, student_number, class_name
            FROM students
            ORDER BY class_name ASC, full_name ASC
        `).all();

        res.json(students);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Unable to load students."
        });
    }
});


// PUBLIC: VIEW PUBLISHED ANNOUNCEMENTS
app.get("/api/announcements", (req, res) => {
    try {
        const announcements = db.prepare(`
            SELECT id, title, message, author_name, author_role, created_at
            FROM announcements
            WHERE is_published = 1
            ORDER BY created_at DESC, id DESC
        `).all();

        res.json(announcements);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Unable to load announcements."
        });
    }
});

// TEACHER: PUBLISH ANNOUNCEMENT
app.post("/api/teacher/announcements", (req, res) => {
    if (!req.session.teacherId) {
        return res.status(401).json({
            message: "Teacher login required."
        });
    }

    const title = (req.body.title || "").trim();
    const message = (req.body.message || "").trim();

    if (!title || !message) {
        return res.status(400).json({
            message: "Please enter an announcement title and message."
        });
    }

    if (title.length > 150 || message.length > 5000) {
        return res.status(400).json({
            message: "The title or message is too long."
        });
    }

    try {
        const teacher = db.prepare(`
            SELECT full_name, approved
            FROM teachers
            WHERE id = ?
        `).get(req.session.teacherId);

        if (!teacher || teacher.approved !== 1) {
            return res.status(403).json({
                message: "Approved teacher account required."
            });
        }

        db.prepare(`
            INSERT INTO announcements
            (title, message, author_name, author_role)
            VALUES (?, ?, ?, ?)
        `).run(title, message, teacher.full_name, "Teacher");

        res.status(201).json({
            message: "Announcement published successfully."
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Unable to publish announcement."
        });
    }
});


// =====================================
// ADMINISTRATOR AUTHENTICATION
// =====================================

app.post("/api/admin/login", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            message: "Please enter your email and password."
        });
    }

    try {
        const admin = db.prepare(
            "SELECT * FROM admins WHERE email = ?"
        ).get(email.trim().toLowerCase());

        if (!admin || !(await bcrypt.compare(password, admin.password))) {
            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        req.session.regenerate((error) => {
            if (error) {
                return res.status(500).json({
                    message: "Unable to create administrator session."
                });
            }

            req.session.adminId = admin.id;

            res.json({
                message: "Administrator login successful.",
                full_name: admin.full_name
            });
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Administrator login failed."
        });
    }
});

app.get("/api/admin/me", (req, res) => {
    if (!req.session.adminId) {
        return res.status(401).json({
            message: "Administrator login required."
        });
    }

    const admin = db.prepare(
        "SELECT id, full_name, email, created_at FROM admins WHERE id = ?"
    ).get(req.session.adminId);

    if (!admin) {
        return res.status(401).json({
            message: "Administrator account not found."
        });
    }

    res.json(admin);
});

app.post("/api/admin/logout", (req, res) => {
    if (!req.session.adminId) {
        return res.status(401).json({
            message: "Administrator login required."
        });
    }

    req.session.destroy((error) => {
        if (error) {
            return res.status(500).json({
                message: "Unable to log out."
            });
        }

        res.json({
            message: "Administrator logged out successfully."
        });
    });
});


// =====================================
// ADMINISTRATOR MANAGEMENT
// =====================================

function requireAdmin(req, res, next) {
    if (!req.session.adminId) {
        return res.status(401).json({
            message: "Administrator login required."
        });
    }

    const admin = db.prepare(
        "SELECT id FROM admins WHERE id = ?"
    ).get(req.session.adminId);

    if (!admin) {
        return res.status(401).json({
            message: "Administrator account not found."
        });
    }

    next();
}

// School statistics
app.get("/api/admin/overview", requireAdmin, (req, res) => {
    try {
        const students = db.prepare(
            "SELECT COUNT(*) AS total FROM students"
        ).get().total;

        const teachers = db.prepare(
            "SELECT COUNT(*) AS total FROM teachers"
        ).get().total;

        const pendingTeachers = db.prepare(
            "SELECT COUNT(*) AS total FROM teachers WHERE approved = 0"
        ).get().total;

        const results = db.prepare(
            "SELECT COUNT(*) AS total FROM academic_results"
        ).get().total;

        const announcements = db.prepare(
            "SELECT COUNT(*) AS total FROM announcements"
        ).get().total;

        res.json({
            students,
            teachers,
            pendingTeachers,
            results,
            announcements
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Unable to load school statistics."
        });
    }
});

// View registered teachers
app.get("/api/admin/teachers", requireAdmin, (req, res) => {
    try {
        const teachers = db.prepare(`
            SELECT id, full_name, email, subjects, classes,
                   is_class_teacher, assigned_class, approved, created_at
            FROM teachers
            ORDER BY created_at DESC
        `).all();

        res.json(teachers);

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Unable to load teachers."
        });
    }
});

// Approve a teacher
app.patch("/api/admin/teachers/:id/approve", requireAdmin, (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({
            message: "Invalid teacher ID."
        });
    }

    try {
        const result = db.prepare(
            "UPDATE teachers SET approved = 1 WHERE id = ?"
        ).run(id);

        if (result.changes === 0) {
            return res.status(404).json({
                message: "Teacher not found."
            });
        }

        res.json({
            message: "Teacher approved successfully."
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Unable to approve teacher."
        });
    }
});


// =====================================
// ADMINISTRATOR STUDENT MANAGEMENT
// =====================================

app.get("/api/admin/students", requireAdmin, (req, res) => {
    try {
        const search = String(req.query.search || "").trim();

        const students = db.prepare(`
            SELECT s.id, s.full_name, s.student_number,
                   s.class_name, s.email, s.created_at,
                   (SELECT COUNT(*) FROM academic_results r
                    WHERE r.student_id = s.id) AS results_count
            FROM students s
            WHERE s.full_name LIKE ?
               OR s.student_number LIKE ?
               OR s.class_name LIKE ?
               OR s.email LIKE ?
            ORDER BY s.created_at DESC
        `).all(
            `%${search}%`,
            `%${search}%`,
            `%${search}%`,
            `%${search}%`
        );

        res.json(students);
    } catch (error) {
        console.error(error);
        res.status(500).json({message:"Unable to load students."});
    }
});

app.post("/api/admin/students", requireAdmin, async (req, res) => {
    try {
        const {full_name, student_number, class_name, email, password} = req.body;

        if (!full_name || !student_number || !class_name || !email || !password) {
            return res.status(400).json({message:"Please complete all student fields."});
        }

        if (password.length < 8) {
            return res.status(400).json({message:"Password must contain at least 8 characters."});
        }

        const cleanEmail = email.trim().toLowerCase();
        const cleanNumber = student_number.trim();

        const existing = db.prepare(
            "SELECT id FROM students WHERE email = ? OR student_number = ?"
        ).get(cleanEmail, cleanNumber);

        if (existing) {
            return res.status(409).json({message:"Email or student number already exists."});
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        db.prepare(`
            INSERT INTO students
            (full_name, student_number, class_name, email, password, must_change_password)
            VALUES (?, ?, ?, ?, ?, 1)
        `).run(
            full_name.trim(),
            cleanNumber,
            class_name.trim(),
            cleanEmail,
            hashedPassword
        );

        res.status(201).json({message:"Student registered successfully."});
    } catch (error) {
        console.error(error);
        res.status(500).json({message:"Unable to register student."});
    }
});

app.patch("/api/admin/students/:id", requireAdmin, (req, res) => {
    try {
        const id = Number(req.params.id);
        const {full_name, student_number, class_name, email} = req.body;

        if (!Number.isSafeInteger(id) || id <= 0) {
            return res.status(400).json({message:"Invalid student ID."});
        }

        if (!full_name || !student_number || !class_name || !email) {
            return res.status(400).json({message:"Please complete all student fields."});
        }

        const cleanEmail = email.trim().toLowerCase();
        const cleanNumber = student_number.trim();

        const existing = db.prepare(`
            SELECT id FROM students
            WHERE (email = ? OR student_number = ?) AND id != ?
        `).get(cleanEmail, cleanNumber, id);

        if (existing) {
            return res.status(409).json({message:"Another student already uses that email or student number."});
        }

        const result = db.prepare(`
            UPDATE students
            SET full_name = ?, student_number = ?, class_name = ?, email = ?
            WHERE id = ?
        `).run(
            full_name.trim(),
            cleanNumber,
            class_name.trim(),
            cleanEmail,
            id
        );

        if (result.changes === 0) {
            return res.status(404).json({message:"Student not found."});
        }

        res.json({message:"Student information updated successfully."});
    } catch (error) {
        console.error(error);
        res.status(500).json({message:"Unable to update student."});
    }
});


app.delete("/api/admin/students/:id", requireAdmin, (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({message:"Invalid student ID."});
    }

    try {
        const student = db.prepare(
            "SELECT id, full_name FROM students WHERE id = ?"
        ).get(id);

        if (!student) {
            return res.status(404).json({message:"Student not found."});
        }

        db.exec("BEGIN IMMEDIATE");

        try {
            db.prepare(
                "DELETE FROM password_reset_tokens WHERE student_id = ?"
            ).run(id);

            db.prepare(
                "DELETE FROM academic_results WHERE student_id = ?"
            ).run(id);

            db.prepare(
                "DELETE FROM students WHERE id = ?"
            ).run(id);

            db.exec("COMMIT");
        } catch (error) {
            db.exec("ROLLBACK");
            throw error;
        }

        res.json({
            message: student.full_name + " and their associated records were deleted successfully."
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({message:"Unable to delete student."});
    }
});

app.listen(PORT, "0.0.0.0", () => {
    console.log("=================================");
    console.log("MONZE DAY STUDENT PORTAL");
    console.log("Server running on port " + PORT);
    console.log("Open http://127.0.0.1:3000");
    console.log("=================================");
});


