from pathlib import Path

file = Path("server-postgres.js")
code = file.read_text()

start_marker = "// PUBLIC: VIEW PUBLISHED ANNOUNCEMENTS"
end_marker = 'app.listen(PORT, "0.0.0.0"'

start = code.find(start_marker)
end = code.find(end_marker)

if start == -1 or end == -1 or start >= end:
    raise SystemExit("ERROR: Could not locate the replacement section. No changes made.")

replacement = r'''
// PUBLIC: VIEW PUBLISHED ANNOUNCEMENTS
app.get("/api/announcements", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, title, message, author_name, author_role, created_at
            FROM announcements
            WHERE is_published = 1
            ORDER BY created_at DESC, id DESC
        `);

        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Unable to load announcements."
        });
    }
});


// TEACHER: PUBLISH ANNOUNCEMENT
app.post("/api/teacher/announcements", async (req, res) => {
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
        const result = await pool.query(
            `SELECT full_name, approved
             FROM teachers
             WHERE id = $1`,
            [req.session.teacherId]
        );

        const teacher = result.rows[0];

        if (!teacher || teacher.approved !== 1) {
            return res.status(403).json({
                message: "Approved teacher account required."
            });
        }

        await pool.query(
            `INSERT INTO announcements
             (title, message, author_name, author_role)
             VALUES ($1, $2, $3, $4)`,
            [title, message, teacher.full_name, "Teacher"]
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
        const result = await pool.query(
            "SELECT * FROM admins WHERE email = $1",
            [email.trim().toLowerCase()]
        );

        const admin = result.rows[0];

        if (!admin || !(await bcrypt.compare(password, admin.password))) {
            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        req.session.regenerate((error) => {
            if (error) {
                console.error(error);
                return res.status(500).json({
                    message: "Unable to create administrator session."
                });
            }

            req.session.adminId = admin.id;

            req.session.save((saveError) => {
                if (saveError) {
                    console.error(saveError);
                    return res.status(500).json({
                        message: "Unable to create administrator session."
                    });
                }

                res.json({
                    message: "Administrator login successful.",
                    full_name: admin.full_name
                });
            });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Administrator login failed."
        });
    }
});


app.get("/api/admin/me", async (req, res) => {
    if (!req.session.adminId) {
        return res.status(401).json({
            message: "Administrator login required."
        });
    }

    try {
        const result = await pool.query(
            `SELECT id, full_name, email, created_at
             FROM admins
             WHERE id = $1`,
            [req.session.adminId]
        );

        const admin = result.rows[0];

        if (!admin) {
            return res.status(401).json({
                message: "Administrator account not found."
            });
        }

        res.json(admin);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Unable to load administrator account."
        });
    }
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

async function requireAdmin(req, res, next) {
    if (!req.session.adminId) {
        return res.status(401).json({
            message: "Administrator login required."
        });
    }

    try {
        const result = await pool.query(
            "SELECT id FROM admins WHERE id = $1",
            [req.session.adminId]
        );

        if (!result.rows[0]) {
            return res.status(401).json({
                message: "Administrator account not found."
            });
        }

        next();
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Unable to verify administrator account."
        });
    }
}


// SCHOOL STATISTICS
app.get("/api/admin/overview", requireAdmin, async (req, res) => {
    try {
        const queries = await Promise.all([
            pool.query("SELECT COUNT(*) AS total FROM students"),
            pool.query("SELECT COUNT(*) AS total FROM teachers"),
            pool.query("SELECT COUNT(*) AS total FROM teachers WHERE approved = 0"),
            pool.query("SELECT COUNT(*) AS total FROM academic_results"),
            pool.query("SELECT COUNT(*) AS total FROM announcements")
        ]);

        const count = result => Number(result.rows[0].total);

        res.json({
            students: count(queries[0]),
            teachers: count(queries[1]),
            pendingTeachers: count(queries[2]),
            results: count(queries[3]),
            announcements: count(queries[4])
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Unable to load school statistics."
        });
    }
});


// VIEW REGISTERED TEACHERS
app.get("/api/admin/teachers", requireAdmin, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, full_name, email, subjects, classes,
                   is_class_teacher, assigned_class, approved, created_at
            FROM teachers
            ORDER BY created_at DESC
        `);

        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Unable to load teachers."
        });
    }
});


// APPROVE A TEACHER
app.patch("/api/admin/teachers/:id/approve", requireAdmin, async (req, res) => {
    const id = req.params.id;

    if (!/^[1-9]\d*$/.test(id)) {
        return res.status(400).json({
            message: "Invalid teacher ID."
        });
    }

    try {
        const result = await pool.query(
            "UPDATE teachers SET approved = 1 WHERE id = $1",
            [id]
        );

        if (result.rowCount === 0) {
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

// VIEW REGISTERED STUDENTS
app.get("/api/admin/students", requireAdmin, async (req, res) => {
    try {
        const search = String(req.query.search || "").trim();
        const pattern = `%${search}%`;

        const result = await pool.query(`
            SELECT s.id, s.full_name, s.student_number,
                   s.class_name, s.email, s.created_at,
                   (SELECT COUNT(*)
                    FROM academic_results r
                    WHERE r.student_id = s.id) AS results_count
            FROM students s
            WHERE s.full_name ILIKE $1
               OR s.student_number ILIKE $1
               OR s.class_name ILIKE $1
               OR s.email ILIKE $1
            ORDER BY s.created_at DESC
        `, [pattern]);

        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Unable to load students."
        });
    }
});


// REGISTER A STUDENT
app.post("/api/admin/students", requireAdmin, async (req, res) => {
    try {
        const {
            full_name,
            student_number,
            class_name,
            email,
            password
        } = req.body;

        if (!full_name || !student_number || !class_name || !email || !password) {
            return res.status(400).json({
                message: "Please complete all student fields."
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                message: "Password must contain at least 8 characters."
            });
        }

        const cleanEmail = email.trim().toLowerCase();
        const cleanNumber = student_number.trim();

        const hashedPassword = await bcrypt.hash(password, 12);

        await pool.query(`
            INSERT INTO students
            (full_name, student_number, class_name, email, password, must_change_password)
            VALUES ($1, $2, $3, $4, $5, 1)
        `, [
            full_name.trim(),
            cleanNumber,
            class_name.trim(),
            cleanEmail,
            hashedPassword
        ]);

        res.status(201).json({
            message: "Student registered successfully."
        });
    } catch (error) {
        console.error(error);

        if (error.code === "23505") {
            return res.status(409).json({
                message: "Email or student number already exists."
            });
        }

        res.status(500).json({
            message: "Unable to register student."
        });
    }
});


// UPDATE STUDENT INFORMATION
app.patch("/api/admin/students/:id", requireAdmin, async (req, res) => {
    try {
        const id = req.params.id;
        const {
            full_name,
            student_number,
            class_name,
            email
        } = req.body;

        if (!/^[1-9]\d*$/.test(id)) {
            return res.status(400).json({
                message: "Invalid student ID."
            });
        }

        if (!full_name || !student_number || !class_name || !email) {
            return res.status(400).json({
                message: "Please complete all student fields."
            });
        }

        const cleanEmail = email.trim().toLowerCase();
        const cleanNumber = student_number.trim();

        const result = await pool.query(`
            UPDATE students
            SET full_name = $1,
                student_number = $2,
                class_name = $3,
                email = $4
            WHERE id = $5
        `, [
            full_name.trim(),
            cleanNumber,
            class_name.trim(),
            cleanEmail,
            id
        ]);

        if (result.rowCount === 0) {
            return res.status(404).json({
                message: "Student not found."
            });
        }

        res.json({
            message: "Student information updated successfully."
        });
    } catch (error) {
        console.error(error);

        if (error.code === "23505") {
            return res.status(409).json({
                message: "Another student already uses that email or student number."
            });
        }

        res.status(500).json({
            message: "Unable to update student."
        });
    }
});


// DELETE STUDENT AND ASSOCIATED RECORDS
app.delete("/api/admin/students/:id", requireAdmin, async (req, res) => {
    const id = req.params.id;

    if (!/^[1-9]\d*$/.test(id)) {
        return res.status(400).json({
            message: "Invalid student ID."
        });
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        const result = await client.query(
            "SELECT id, full_name FROM students WHERE id = $1 FOR UPDATE",
            [id]
        );

        const student = result.rows[0];

        if (!student) {
            await client.query("ROLLBACK");
            return res.status(404).json({
                message: "Student not found."
            });
        }

        await client.query(
            "DELETE FROM password_reset_tokens WHERE student_id = $1",
            [id]
        );

        await client.query(
            "DELETE FROM academic_results WHERE student_id = $1",
            [id]
        );

        await client.query(
            "DELETE FROM students WHERE id = $1",
            [id]
        );

        await client.query("COMMIT");

        res.json({
            message: student.full_name +
                " and their associated records were deleted successfully."
        });
    } catch (error) {
        await client.query("ROLLBACK");
        console.error(error);

        res.status(500).json({
            message: "Unable to delete student."
        });
    } finally {
        client.release();
    }
});

'''

new_code = code[:start] + replacement + "\n" + code[end:]
file.write_text(new_code)

print("SUCCESS: Remaining routes converted to PostgreSQL.")
print("Your original server.js was not changed.")
