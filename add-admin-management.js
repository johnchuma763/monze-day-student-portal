const fs = require("fs");

const file = "server-postgres.js";
let code = fs.readFileSync(file, "utf8");

const marker = "// ADMINISTRATOR STUDENT MANAGEMENT";

if (!code.includes(marker)) {
    console.error("ERROR: Insertion location not found. No changes made.");
    process.exit(1);
}

if (code.includes('app.get("/api/admin/results"')) {
    console.error("Administrator results routes already exist. No changes made.");
    process.exit(1);
}

const routes = `
// =====================================
// ADMINISTRATOR ACADEMIC RESULTS
// =====================================

// VIEW ALL RESULTS
app.get("/api/admin/results", requireAdmin, async (req, res) => {
    try {
        const search = String(req.query.search || "").trim();
        const term = String(req.query.term || "").trim();
        const className = String(req.query.className || "").trim();
        const subject = String(req.query.subject || "").trim();

        const result = await pool.query(\`
            SELECT r.id, r.student_id, s.full_name,
                   s.student_number, s.class_name,
                   r.subject, r.term, r.year,
                   r.score, r.grade, r.remarks
            FROM academic_results r
            JOIN students s ON s.id = r.student_id
            WHERE (
                s.full_name ILIKE $1
                OR s.student_number ILIKE $1
            )
            AND ($2 = '' OR r.term = $2)
            AND ($3 = '' OR s.class_name = $3)
            AND ($4 = '' OR LOWER(r.subject) = LOWER($4))
            ORDER BY r.year DESC, s.class_name, s.full_name, r.subject
        \`, [\`%\${search}%\`, term, className, subject]);

        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Unable to load academic results."
        });
    }
});


// PUBLISH RESULT
app.post("/api/admin/results", requireAdmin, async (req, res) => {
    const studentNumber = String(req.body.studentNumber || "").trim();
    const subject = String(req.body.subject || "").trim();
    const term = String(req.body.term || "");
    const year = Number(req.body.year);
    const score = Number(req.body.score);
    const grade = String(req.body.grade || "");
    const remarks = String(req.body.remarks || "").trim();

    if (!studentNumber || !subject || !term ||
        !req.body.year || req.body.score === undefined || !grade) {
        return res.status(400).json({
            message: "Please complete all required fields."
        });
    }

    if (!Number.isFinite(score) || score < 0 || score > 100) {
        return res.status(400).json({
            message: "Score must be between 0 and 100."
        });
    }

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        return res.status(400).json({
            message: "Please enter a valid academic year."
        });
    }

    if (!["Term 1", "Term 2", "Term 3"].includes(term)) {
        return res.status(400).json({
            message: "Invalid academic term."
        });
    }

    if (!["Distinction", "Merit", "Credit", "Pass", "Fail"].includes(grade)) {
        return res.status(400).json({
            message: "Please select a valid grade."
        });
    }

    if (subject.length > 100 || remarks.length > 1000) {
        return res.status(400).json({
            message: "Subject or remarks are too long."
        });
    }

    try {
        const student = await pool.query(
            "SELECT id FROM students WHERE student_number = $1",
            [studentNumber]
        );

        if (!student.rows[0]) {
            return res.status(404).json({
                message: "Student not found."
            });
        }

        const duplicate = await pool.query(
            \`SELECT id FROM academic_results
             WHERE student_id = $1
             AND LOWER(subject) = LOWER($2)
             AND term = $3 AND year = $4\`,
            [student.rows[0].id, subject, term, year]
        );

        if (duplicate.rows.length) {
            return res.status(409).json({
                message: "A result already exists for this student, subject, term and year."
            });
        }

        await pool.query(
            \`INSERT INTO academic_results
             (student_id, subject, term, year, score, grade, remarks)
             VALUES ($1, $2, $3, $4, $5, $6, $7)\`,
            [student.rows[0].id, subject, term, year, score, grade, remarks]
        );

        res.status(201).json({
            message: "Academic result published successfully."
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Unable to publish academic result."
        });
    }
});


// EDIT RESULT
app.put("/api/admin/results/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const subject = String(req.body.subject || "").trim();
    const term = String(req.body.term || "");
    const year = Number(req.body.year);
    const score = Number(req.body.score);
    const grade = String(req.body.grade || "");
    const remarks = String(req.body.remarks || "").trim();

    if (!Number.isInteger(id) || id < 1 ||
        !subject || !term || !req.body.year ||
        req.body.score === undefined || !grade) {
        return res.status(400).json({
            message: "Please complete all required fields."
        });
    }

    if (!Number.isFinite(score) || score < 0 || score > 100 ||
        !Number.isInteger(year) || year < 2000 || year > 2100 ||
        !["Term 1", "Term 2", "Term 3"].includes(term) ||
        !["Distinction", "Merit", "Credit", "Pass", "Fail"].includes(grade) ||
        subject.length > 100 || remarks.length > 1000) {
        return res.status(400).json({
            message: "Please check the result details."
        });
    }

    try {
        const result = await pool.query(
            \`UPDATE academic_results
             SET subject = $1, term = $2, year = $3,
                 score = $4, grade = $5, remarks = $6
             WHERE id = $7
             RETURNING id\`,
            [subject, term, year, score, grade, remarks, id]
        );

        if (!result.rows.length) {
            return res.status(404).json({
                message: "Academic result not found."
            });
        }

        res.json({
            message: "Academic result updated successfully."
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Unable to update academic result."
        });
    }
});


// DELETE RESULT
app.delete("/api/admin/results/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({
            message: "Invalid result ID."
        });
    }

    try {
        const result = await pool.query(
            "DELETE FROM academic_results WHERE id = $1 RETURNING id",
            [id]
        );

        if (!result.rows.length) {
            return res.status(404).json({
                message: "Academic result not found."
            });
        }

        res.json({
            message: "Academic result deleted successfully."
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Unable to delete academic result."
        });
    }
});


// =====================================
// ADMINISTRATOR ANNOUNCEMENTS
// =====================================

// VIEW ALL ANNOUNCEMENTS
app.get("/api/admin/announcements", requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(\`
            SELECT id, title, message, author_name,
                   author_role, is_published, created_at
            FROM announcements
            ORDER BY created_at DESC, id DESC
        \`);

        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Unable to load announcements."
        });
    }
});


// POST ADMIN ANNOUNCEMENT
app.post("/api/admin/announcements", requireAdmin, async (req, res) => {
    const title = String(req.body.title || "").trim();
    const message = String(req.body.message || "").trim();

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
        const admin = await pool.query(
            "SELECT full_name FROM admins WHERE id = $1",
            [req.session.adminId]
        );

        if (!admin.rows[0]) {
            return res.status(401).json({
                message: "Administrator account not found."
            });
        }

        await pool.query(
            \`INSERT INTO announcements
             (title, message, author_name, author_role)
             VALUES ($1, $2, $3, $4)\`,
            [title, message, admin.rows[0].full_name, "Administrator"]
        );

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


// EDIT ANNOUNCEMENT
app.put("/api/admin/announcements/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const title = String(req.body.title || "").trim();
    const message = String(req.body.message || "").trim();

    if (!Number.isInteger(id) || id < 1 ||
        !title || !message ||
        title.length > 150 || message.length > 5000) {
        return res.status(400).json({
            message: "Please check the announcement details."
        });
    }

    try {
        const result = await pool.query(
            \`UPDATE announcements
             SET title = $1, message = $2
             WHERE id = $3
             RETURNING id\`,
            [title, message, id]
        );

        if (!result.rows.length) {
            return res.status(404).json({
                message: "Announcement not found."
            });
        }

        res.json({
            message: "Announcement updated successfully."
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Unable to update announcement."
        });
    }
});


// DELETE ANNOUNCEMENT
app.delete("/api/admin/announcements/:id", requireAdmin, async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({
            message: "Invalid announcement ID."
        });
    }

    try {
        const result = await pool.query(
            "DELETE FROM announcements WHERE id = $1 RETURNING id",
            [id]
        );

        if (!result.rows.length) {
            return res.status(404).json({
                message: "Announcement not found."
            });
        }

        res.json({
            message: "Announcement deleted successfully."
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Unable to delete announcement."
        });
    }
});

`;

code = code.replace(marker, routes + marker);
fs.writeFileSync(file, code);

console.log("Administrator results and announcement routes added.");

