from pathlib import Path

file = Path("server-postgres.js")
code = file.read_text()

start = code.find("// TEACHER: CHANGE PASSWORD")
end = code.find("// PUBLIC: VIEW PUBLISHED ANNOUNCEMENTS")

if start < 0 or end < 0 or start >= end:
    raise SystemExit("Could not locate teacher routes. No changes made.")

replacement = r'''
// TEACHER: CHANGE PASSWORD
app.post("/api/teacher/change-password", async (req, res) => {
    if (!req.session.teacherId) {
        return res.status(401).json({ message: "Teacher login required." });
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
        const result = await pool.query(
            "SELECT password FROM teachers WHERE id = $1",
            [req.session.teacherId]
        );

        const teacher = result.rows[0];

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

        await pool.query(
            "UPDATE teachers SET password = $1 WHERE id = $2",
            [hashedPassword, req.session.teacherId]
        );

        res.json({ message: "Password changed successfully." });
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
    async (req, res) => {
        if (!req.file) {
            return res.status(400).json({
                message: "Please select a profile photo."
            });
        }

        try {
            const photoUrl =
                "/uploads/teacher-photos/" + req.file.filename;

            const result = await pool.query(
                "SELECT photo_url FROM teachers WHERE id = $1",
                [req.session.teacherId]
            );

            const teacher = result.rows[0];

            if (!teacher) {
                fs.unlinkSync(req.file.path);
                return res.status(404).json({
                    message: "Teacher account not found."
                });
            }

            await pool.query(
                "UPDATE teachers SET photo_url = $1 WHERE id = $2",
                [photoUrl, req.session.teacherId]
            );

            if (
                teacher.photo_url &&
                teacher.photo_url.startsWith("/uploads/teacher-photos/")
            ) {
                const oldPath = path.join(
                    uploadDirectory,
                    path.basename(teacher.photo_url)
                );

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

            if (req.file && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }

            res.status(500).json({
                message: "Unable to update profile photo."
            });
        }
    }
);


// TEACHER: ADD STUDENT ACADEMIC RESULT
app.post("/api/teacher/results", async (req, res) => {
    if (!req.session.teacherId) {
        return res.status(401).json({
            message: "Teacher login required."
        });
    }

    const {
        studentNumber, subject, term, year,
        score, grade, remarks
    } = req.body;

    if (
        !studentNumber?.trim() || !subject?.trim() ||
        !term || !year || score === undefined || !grade
    ) {
        return res.status(400).json({
            message: "Please complete all required fields."
        });
    }

    const numericScore = Number(score);
    const numericYear = Number(year);

    if (
        !Number.isFinite(numericScore) ||
        numericScore < 0 || numericScore > 100
    ) {
        return res.status(400).json({
            message: "Score must be between 0 and 100."
        });
    }

    if (
        !Number.isInteger(numericYear) ||
        numericYear < 2000 || numericYear > 2100
    ) {
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
        const teacherResult = await pool.query(
            `SELECT subjects, classes, is_class_teacher, assigned_class
             FROM teachers
             WHERE id = $1 AND approved = 1`,
            [req.session.teacherId]
        );

        const teacher = teacherResult.rows[0];

        if (!teacher) {
            return res.status(403).json({
                message: "Approved teacher account required."
            });
        }

        const studentResult = await pool.query(
            `SELECT id, class_name
             FROM students
             WHERE student_number = $1`,
            [studentNumber.trim()]
        );

        const student = studentResult.rows[0];

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
            assignedClasses.push(
                teacher.assigned_class.trim().toLowerCase()
            );
        }

        if (!assignedClasses.includes(
            student.class_name.trim().toLowerCase()
        )) {
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

        const duplicate = await pool.query(
            `SELECT id FROM academic_results
             WHERE student_id = $1
             AND LOWER(subject) = LOWER($2)
             AND term = $3 AND year = $4`,
            [student.id, subject.trim(), term, numericYear]
        );

        if (duplicate.rows.length > 0) {
            return res.status(409).json({
                message: "A result for this student, subject, term and year already exists."
            });
        }

        await pool.query(
            `INSERT INTO academic_results
             (student_id, subject, term, year, score, grade, remarks)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                student.id, subject.trim(), term,
                numericYear, numericScore, grade,
                (remarks || "").trim()
            ]
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


// PUBLIC: GET APPROVED TEACHERS
app.get("/api/public/teachers", async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT full_name, subjects, classes,
                   is_class_teacher, assigned_class, photo_url
            FROM teachers
            WHERE approved = 1
            ORDER BY full_name ASC
        `);

        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Unable to load teachers."
        });
    }
});


// TEACHER: VIEW REGISTERED STUDENTS
app.get("/api/teacher/students", async (req, res) => {
    if (!req.session.teacherId) {
        return res.status(401).json({
            message: "Teacher login required."
        });
    }

    try {
        const result = await pool.query(`
            SELECT full_name, student_number, class_name
            FROM students
            ORDER BY class_name ASC, full_name ASC
        `);

        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Unable to load students."
        });
    }
});

'''

file.write_text(code[:start] + replacement + code[end:])
print("SUCCESS: Teacher routes converted to PostgreSQL.")
