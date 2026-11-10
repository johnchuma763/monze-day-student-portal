const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const multer = require("multer");

module.exports = function registerAssignmentRoutes(app, { pool }) {

    // PRIVATE ASSIGNMENT STORAGE
    const uploadDirectory = path.resolve(
        __dirname,
        "..",
        "private-assignment-uploads"
    );

    fs.mkdirSync(uploadDirectory, {
        recursive: true,
        mode: 0o700
    });

    fs.chmodSync(uploadDirectory, 0o700);

    const allowedTypes = {
        "application/pdf": ".pdf",
        "application/msword": ".doc",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
        "application/vnd.ms-excel": ".xls",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
        "application/vnd.ms-powerpoint": ".ppt",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
        "text/plain": ".txt",
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp"
    };

    const storage = multer.diskStorage({
        destination: (req, file, callback) => {
            callback(null, uploadDirectory);
        },

        filename: (req, file, callback) => {
            callback(
                null,
                crypto.randomUUID() + allowedTypes[file.mimetype]
            );
        }
    });

    const upload = multer({
        storage,
        limits: {
            fileSize: 10 * 1024 * 1024,
            fieldSize: 1500000,
            files: 1
        },
        fileFilter: (req, file, callback) => {
            if (!allowedTypes[file.mimetype]) {
                return callback(
                    new Error("Unsupported file type. Upload PDF, Word, Excel, PowerPoint, TXT or an image.")
                );
            }

            callback(null, true);
        }
    });

    function handleUpload(fieldName) {
        return (req, res, next) => {
            upload.single(fieldName)(req, res, error => {
                if (error) {
                    return res.status(400).json({
                        message: error.message
                    });
                }

                next();
            });
        };
    }

    function normalizeClass(value) {
        return String(value || "")
            .trim()
            .replace(/\s+/g, " ")
            .replace(/\s*([A-D])$/i, (_, letter) =>
                letter.toUpperCase()
            );
    }

    function normalizeSubject(value) {
        return String(value || "").trim().toLowerCase();
    }

    function cleanFilename(value) {
        return path.posix.basename(
            String(value || "document").replace(/\\/g, "/")
        )
        .replace(/[\x00-\x1f\x7f]/g, "")
        .slice(0, 180) || "document";
    }

    function deleteFile(filename) {
        if (!filename) return;

        const safeName = path.basename(filename);

        if (safeName !== filename) return;

        fs.unlink(
            path.join(uploadDirectory, safeName),
            () => {}
        );
    }

    function sendPrivateFile(res, filename, originalName, mimeType) {
        if (!/^[a-f0-9-]{36}\.[a-z0-9]+$/i.test(filename || "")) {
            return res.status(404).json({
                message: "File not found."
            });
        }

        const filePath = path.join(uploadDirectory, filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                message: "File is no longer available."
            });
        }

        res.setHeader(
            "X-Content-Type-Options",
            "nosniff"
        );

        res.download(
            filePath,
            cleanFilename(originalName),
            {
                headers: {
                    "Content-Type": mimeType || "application/octet-stream"
                }
            },
            error => {
                if (error && !res.headersSent) {
                    console.error("Assignment download error:", error);
                    res.status(500).json({
                        message: "Unable to download file."
                    });
                }
            }
        );
    }

    // VERIFY APPROVED TEACHER
    async function requireTeacher(req, res, next) {
        if (!req.session.teacherId) {
            return res.status(401).json({
                message: "Teacher login required."
            });
        }

        try {
            const result = await pool.query(
                `SELECT id, full_name, subjects, classes, approved
                 FROM teachers
                 WHERE id = $1`,
                [req.session.teacherId]
            );

            const teacher = result.rows[0];

            if (!teacher || Number(teacher.approved) !== 1) {
                return res.status(403).json({
                    message: "Approved teacher account required."
                });
            }

            req.assignmentTeacher = teacher;
            next();

        } catch (error) {
            console.error(error);

            res.status(500).json({
                message: "Unable to verify teacher account."
            });
        }
    }

    // VERIFY STUDENT
    async function requireStudent(req, res, next) {
        if (!req.session.studentId) {
            return res.status(401).json({
                message: "Student login required."
            });
        }

        try {
            const result = await pool.query(
                `SELECT id, full_name, student_number, class_name
                 FROM students
                 WHERE id = $1`,
                [req.session.studentId]
            );

            if (!result.rows.length) {
                return res.status(401).json({
                    message: "Student account not found."
                });
            }

            req.assignmentStudent = result.rows[0];
            next();

        } catch (error) {
            console.error(error);

            res.status(500).json({
                message: "Unable to verify student account."
            });
        }
    }

    function teacherCanAccess(teacher, className, subjectName) {
        const classes = String(teacher.classes || "")
            .split(",")
            .map(normalizeClass);

        const subjects = String(teacher.subjects || "")
            .split(",")
            .map(normalizeSubject);

        return (
            classes.includes(normalizeClass(className)) &&
            subjects.includes(normalizeSubject(subjectName))
        );
    }

    // TEACHER: CREATE ASSIGNMENT
    app.post(
        "/api/teacher/assignments",
        requireTeacher,
        handleUpload("attachment"),
        async (req, res) => {
            const file = req.file;

            try {
                const title = String(req.body.title || "").trim();
                const instructions = String(
                    req.body.instructions || ""
                ).trim();

                const className = normalizeClass(
                    req.body.class_name
                );

                const subjectName = String(
                    req.body.subject_name || ""
                ).trim();

                const dueAt = new Date(req.body.due_at);

                if (!title || !instructions || !className || !subjectName) {
                    deleteFile(file?.filename);

                    return res.status(400).json({
                        message: "Complete all required assignment fields."
                    });
                }

                if (title.length > 160 || instructions.length > 8000) {
                    deleteFile(file?.filename);

                    return res.status(400).json({
                        message: "Assignment title or instructions are too long."
                    });
                }

                if (
                    !Number.isFinite(dueAt.getTime()) ||
                    dueAt.getTime() <= Date.now()
                ) {
                    deleteFile(file?.filename);

                    return res.status(400).json({
                        message: "Select a valid future submission deadline."
                    });
                }

                const teacher = req.assignmentTeacher;

                if (!teacherCanAccess(
                    teacher,
                    className,
                    subjectName
                )) {
                    deleteFile(file?.filename);

                    return res.status(403).json({
                        message: "You are not assigned to this class and subject."
                    });
                }

                const result = await pool.query(
                    `INSERT INTO assignments (
                        teacher_id,
                        title,
                        instructions,
                        class_name,
                        subject_name,
                        due_at,
                        status,
                        attachment_name,
                        attachment_original_name,
                        attachment_mime_type,
                        attachment_size
                    )
                    VALUES ($1,$2,$3,$4,$5,$6,'published',$7,$8,$9,$10)
                    RETURNING id`,
                    [
                        teacher.id,
                        title,
                        instructions,
                        className,
                        subjectName,
                        dueAt,
                        file?.filename || null,
                        file ? cleanFilename(file.originalname) : null,
                        file?.mimetype || null,
                        file?.size || null
                    ]
                );

                // Notify students in the assignment's class.
                try {
                    const notificationResult = await pool.query(`
                        INSERT INTO notifications
                            (recipient_type, recipient_id, title, message)
                        SELECT
                            'student',
                            id,
                            $1,
                            $2
                        FROM students
                        WHERE LOWER(TRIM(class_name)) =
                              LOWER(TRIM($3))
                    `, [
                        "New assignment: " + title,
                        subjectName + " assignment for " +
                            className + ". Due: " +
                            dueAt.toLocaleString() +
                            ". Open your Assignments page to view it.",
                        className
                    ]);

                    console.log(
                        "Assignment notifications sent:",
                        notificationResult.rowCount
                    );
                } catch (notificationError) {
                    console.error(
                        "Assignment notification error:",
                        notificationError
                    );
                }

                res.status(201).json({
                    message: "Assignment published successfully.",
                    assignmentId: result.rows[0].id
                });

            } catch (error) {
                deleteFile(file?.filename);

                console.error("Create assignment error:", error);

                res.status(500).json({
                    message: "Unable to publish assignment."
                });
            }
        }
    );

    // TEACHER: VIEW OWN ASSIGNMENTS
    app.get(
        "/api/teacher/assignments",
        requireTeacher,
        async (req, res) => {
            try {
                const result = await pool.query(
                    `SELECT
                        a.*,
                        COUNT(s.id)::INTEGER AS submission_count
                     FROM assignments a
                     LEFT JOIN assignment_submissions s
                        ON s.assignment_id = a.id
                     WHERE a.teacher_id = $1
                     GROUP BY a.id
                     ORDER BY a.created_at DESC`,
                    [req.assignmentTeacher.id]
                );

                res.json(result.rows);

            } catch (error) {
                console.error(error);

                res.status(500).json({
                    message: "Unable to load assignments."
                });
            }
        }
    );

    // STUDENT: VIEW CLASS ASSIGNMENTS
    app.get(
        "/api/student/assignments",
        requireStudent,
        async (req, res) => {
            try {
                const result = await pool.query(
                    `SELECT
                        a.id,
                        a.title,
                        a.instructions,
                        a.class_name,
                        a.subject_name,
                        a.due_at,
                        a.created_at,
                        a.attachment_name IS NOT NULL AS has_attachment,
                        s.id AS submission_id,
                        s.submitted_at,
                        s.status AS submission_status,
                        s.answer_text,
                        s.calculation_text,
                        s.formula_text,
                        s.calculation_drawing,
                        s.answer_drawing,
                        s.draft_saved_at,
                        f.marks,
                        f.maximum_marks,
                        f.comments,
                        f.graded_at
                     FROM assignments a
                     LEFT JOIN assignment_submissions s
                        ON s.assignment_id = a.id
                        AND s.student_id = $2
                     LEFT JOIN assignment_feedback f
                        ON f.submission_id = s.id
                     WHERE UPPER(TRIM(a.class_name)) =
                           UPPER(TRIM($1))
                       AND a.status = 'published'
                     ORDER BY a.due_at ASC`,
                    [
                        normalizeClass(
                            req.assignmentStudent.class_name
                        ),
                        req.assignmentStudent.id
                    ]
                );

                res.json(result.rows);

            } catch (error) {
                console.error(error);

                res.status(500).json({
                    message: "Unable to load assignments."
                });
            }
        }
    );


    // STUDENT: SAVE WRITTEN ASSIGNMENT DRAFT
    app.post(
        "/api/student/assignments/:id/draft",
        requireStudent,
        async (req, res) => {
            try {
                const answer = String(req.body.answer_text || "");
                const calculation = String(req.body.calculation_text || "");
                const formula = String(req.body.formula_text || "");
                const calculationDrawing = String(req.body.calculation_drawing || "");
                const answerDrawing = String(req.body.answer_drawing || "");

                const validDrawing = value =>
                    !value || (
                        value.length <= 1400000 &&
                        /^data:image\/(png|jpeg|webp);base64,/.test(value)
                    );


                if (
                    answer.length > 50000 ||
                    calculation.length > 50000 ||
                    formula.length > 20000 ||
                    !validDrawing(calculationDrawing) ||
                    !validDrawing(answerDrawing)
                ) {
                    return res.status(400).json({
                        message: "Your answer is too long. Maximum 50,000 characters."
                    });
                }

                const assignmentResult = await pool.query(
                    `SELECT id, class_name, due_at, status
                     FROM assignments WHERE id = $1`,
                    [req.params.id]
                );

                const assignment = assignmentResult.rows[0];

                if (
                    !assignment ||
                    normalizeClass(assignment.class_name) !==
                    normalizeClass(req.assignmentStudent.class_name)
                ) {
                    return res.status(404).json({
                        message: "Assignment not found."
                    });
                }

                if (
                    assignment.status !== "published" ||
                    new Date(assignment.due_at).getTime() <= Date.now()
                ) {
                    return res.status(403).json({
                        message: "The assignment deadline has passed or the assignment is closed."
                    });
                }

                const result = await pool.query(
                    `INSERT INTO assignment_submissions (
                        assignment_id, student_id, answer_text, calculation_text,
                        draft_saved_at, status, submitted_at
                    )
                    VALUES ($1,$2,$3,$4,CURRENT_TIMESTAMP,'draft',NULL)
                    ON CONFLICT (assignment_id, student_id)
                    DO UPDATE SET
                        answer_text = EXCLUDED.answer_text,
                        calculation_text = EXCLUDED.calculation_text,
                        draft_saved_at = CURRENT_TIMESTAMP,
                        status = 'draft',
                        submitted_at = NULL
                    RETURNING id`,
                    [
                        assignment.id,
                        req.assignmentStudent.id,
                        answer,
                        calculation
                    ]
                );

                await pool.query(
                    `UPDATE assignment_submissions
                     SET formula_text = $1,
                         calculation_drawing = $2,
                         answer_drawing = $3
                     WHERE id = $4`,
                    [formula, calculationDrawing, answerDrawing, result.rows[0].id]
                );

                res.json({
                    message: "Your draft has been saved.",
                    submissionId: result.rows[0].id
                });

            } catch (error) {
                console.error("Save draft error:", error);
                res.status(500).json({
                    message: "Unable to save your draft."
                });
            }
        }
    );

    // STUDENT: SUBMIT WRITTEN ANSWER AND/OR FILE
    app.post(
        "/api/student/assignments/:id/submit",
        requireStudent,
        handleUpload("submission"),
        async (req, res) => {
            const file = req.file;

            try {
                const answer = String(req.body.answer_text || "");
                const calculation = String(req.body.calculation_text || "");
                const formula = String(req.body.formula_text || "");
                const calculationDrawing = String(req.body.calculation_drawing || "");
                const answerDrawing = String(req.body.answer_drawing || "");

                const validDrawing = value =>
                    !value || (
                        value.length <= 1400000 &&
                        /^data:image\/(png|jpeg|webp);base64,/.test(value)
                    );


                if (
                    answer.length > 50000 ||
                    calculation.length > 50000 ||
                    formula.length > 20000 ||
                    !validDrawing(calculationDrawing) ||
                    !validDrawing(answerDrawing)
                ) {
                    deleteFile(file?.filename);
                    return res.status(400).json({
                        message: "Your answer is too long. Maximum 50,000 characters."
                    });
                }

                if (
                    !file && !answer.trim() && !calculation.trim() &&
                    !formula.trim() && !calculationDrawing && !answerDrawing
                ) {
                    return res.status(400).json({
                        message: "Write an answer or choose a document to submit."
                    });
                }

                const assignmentResult = await pool.query(
                    `SELECT id, class_name, due_at, status
                     FROM assignments WHERE id = $1`,
                    [req.params.id]
                );

                const assignment = assignmentResult.rows[0];

                if (
                    !assignment ||
                    normalizeClass(assignment.class_name) !==
                    normalizeClass(req.assignmentStudent.class_name)
                ) {
                    deleteFile(file?.filename);
                    return res.status(404).json({
                        message: "Assignment not found."
                    });
                }

                if (
                    assignment.status !== "published" ||
                    new Date(assignment.due_at).getTime() <= Date.now()
                ) {
                    deleteFile(file?.filename);
                    return res.status(403).json({
                        message: "The submission deadline has passed or the assignment is closed."
                    });
                }

                const previous = await pool.query(
                    `SELECT file_name
                     FROM assignment_submissions
                     WHERE assignment_id = $1 AND student_id = $2`,
                    [assignment.id, req.assignmentStudent.id]
                );

                const result = await pool.query(
                    `INSERT INTO assignment_submissions (
                        assignment_id, student_id, file_name,
                        original_file_name, mime_type, file_size,
                        answer_text, calculation_text, submitted_at, draft_saved_at, status
                    )
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP,NULL,'submitted')
                    ON CONFLICT (assignment_id, student_id)
                    DO UPDATE SET
                        file_name = EXCLUDED.file_name,
                        original_file_name = EXCLUDED.original_file_name,
                        mime_type = EXCLUDED.mime_type,
                        file_size = EXCLUDED.file_size,
                        answer_text = EXCLUDED.answer_text,
                        calculation_text = EXCLUDED.calculation_text,
                        submitted_at = CURRENT_TIMESTAMP,
                        draft_saved_at = NULL,
                        status = 'submitted'
                    RETURNING id`,
                    [
                        assignment.id,
                        req.assignmentStudent.id,
                        file?.filename || null,
                        file ? cleanFilename(file.originalname) : null,
                        file?.mimetype || null,
                        file?.size || null,
                        answer,
                        calculation
                    ]
                );

                await pool.query(
                    `UPDATE assignment_submissions
                     SET formula_text = $1,
                         calculation_drawing = $2,
                         answer_drawing = $3
                     WHERE id = $4`,
                    [formula, calculationDrawing, answerDrawing, result.rows[0].id]
                );

                if (previous.rows.length && previous.rows[0].file_name) {
                    if (previous.rows[0].file_name !== file?.filename) {
                        deleteFile(previous.rows[0].file_name);
                    }
                }

                res.status(201).json({
                    message: "Assignment submitted successfully.",
                    submissionId: result.rows[0].id
                });

            } catch (error) {
                deleteFile(file?.filename);
                console.error("Assignment submission error:", error);
                res.status(500).json({
                    message: "Unable to submit assignment."
                });
            }
        }
    );

    // TEACHER: VIEW STUDENT SUBMISSIONS
    app.get(
        "/api/teacher/assignments/:id/submissions",
        requireTeacher,
        async (req, res) => {
            try {
                const result = await pool.query(
                    `SELECT
                        s.id,
                        s.original_file_name,
                        s.file_size,
                        s.answer_text,
                        s.calculation_text,
                        s.formula_text,
                        s.calculation_drawing,
                        s.answer_drawing,
                        s.submitted_at,
                        s.status,
                        st.full_name,
                        st.student_number,
                        f.marks,
                        f.maximum_marks,
                        f.comments,
                        f.graded_at
                     FROM assignment_submissions s
                     JOIN assignments a
                        ON a.id = s.assignment_id
                     JOIN students st
                        ON st.id = s.student_id
                     LEFT JOIN assignment_feedback f
                        ON f.submission_id = s.id
                     WHERE a.id = $1
                       AND a.teacher_id = $2
                       AND s.status <> 'draft'
                     ORDER BY s.submitted_at DESC`,
                    [
                        req.params.id,
                        req.assignmentTeacher.id
                    ]
                );

                res.json(result.rows);

            } catch (error) {
                console.error(error);

                res.status(500).json({
                    message: "Unable to load submissions."
                });
            }
        }
    );

    // TEACHER: DOWNLOAD STUDENT SUBMISSION
    app.get(
        "/api/teacher/assignment-submissions/:id/download",
        requireTeacher,
        async (req, res) => {
            try {
                const result = await pool.query(
                    `SELECT
                        s.file_name,
                        s.original_file_name,
                        s.mime_type
                     FROM assignment_submissions s
                     JOIN assignments a
                        ON a.id = s.assignment_id
                     WHERE s.id = $1
                       AND a.teacher_id = $2`,
                    [
                        req.params.id,
                        req.assignmentTeacher.id
                    ]
                );

                if (!result.rows.length) {
                    return res.status(404).json({
                        message: "Submission not found."
                    });
                }

                const file = result.rows[0];

                sendPrivateFile(
                    res,
                    file.file_name,
                    file.original_file_name,
                    file.mime_type
                );

            } catch (error) {
                console.error(error);

                res.status(500).json({
                    message: "Unable to download submission."
                });
            }
        }
    );

    // STUDENT: DOWNLOAD OWN SUBMISSION
    app.get(
        "/api/student/assignment-submissions/:id/download",
        requireStudent,
        async (req, res) => {
            try {
                const result = await pool.query(
                    `SELECT file_name, original_file_name, mime_type
                     FROM assignment_submissions
                     WHERE id = $1
                       AND student_id = $2`,
                    [
                        req.params.id,
                        req.assignmentStudent.id
                    ]
                );

                if (!result.rows.length) {
                    return res.status(404).json({
                        message: "Submission not found."
                    });
                }

                const file = result.rows[0];

                sendPrivateFile(
                    res,
                    file.file_name,
                    file.original_file_name,
                    file.mime_type
                );

            } catch (error) {
                console.error(error);

                res.status(500).json({
                    message: "Unable to download submission."
                });
            }
        }
    );

    // STUDENT: DOWNLOAD ASSIGNMENT ATTACHMENT
    app.get(
        "/api/student/assignments/:id/attachment",
        requireStudent,
        async (req, res) => {
            try {
                const result = await pool.query(
                    `SELECT
                        attachment_name,
                        attachment_original_name,
                        attachment_mime_type
                     FROM assignments
                     WHERE id = $1
                       AND UPPER(TRIM(class_name)) =
                           UPPER(TRIM($2))
                       AND status = 'published'`,
                    [
                        req.params.id,
                        normalizeClass(
                            req.assignmentStudent.class_name
                        )
                    ]
                );

                const file = result.rows[0];

                if (!file || !file.attachment_name) {
                    return res.status(404).json({
                        message: "Attachment not found."
                    });
                }

                sendPrivateFile(
                    res,
                    file.attachment_name,
                    file.attachment_original_name,
                    file.attachment_mime_type
                );

            } catch (error) {
                console.error(error);

                res.status(500).json({
                    message: "Unable to download attachment."
                });
            }
        }
    );

    // TEACHER: DOWNLOAD OWN ASSIGNMENT ATTACHMENT
    app.get(
        "/api/teacher/assignments/:id/attachment",
        requireTeacher,
        async (req, res) => {
            try {
                const result = await pool.query(
                    `SELECT
                        attachment_name,
                        attachment_original_name,
                        attachment_mime_type
                     FROM assignments
                     WHERE id = $1
                       AND teacher_id = $2`,
                    [
                        req.params.id,
                        req.assignmentTeacher.id
                    ]
                );

                const file = result.rows[0];

                if (!file || !file.attachment_name) {
                    return res.status(404).json({
                        message: "Attachment not found."
                    });
                }

                sendPrivateFile(
                    res,
                    file.attachment_name,
                    file.attachment_original_name,
                    file.attachment_mime_type
                );

            } catch (error) {
                console.error(error);

                res.status(500).json({
                    message: "Unable to download attachment."
                });
            }
        }
    );

    // TEACHER: GRADE STUDENT SUBMISSION
    app.patch(
        "/api/teacher/assignment-submissions/:id/grade",
        requireTeacher,
        async (req, res) => {
            try {
                const marks = Number(req.body.marks);
                const maximumMarks = Number(req.body.maximum_marks);
                const comments = String(
                    req.body.comments || ""
                ).trim();

                if (
                    !Number.isFinite(marks) ||
                    !Number.isFinite(maximumMarks) ||
                    maximumMarks <= 0 ||
                    marks < 0 ||
                    marks > maximumMarks
                ) {
                    return res.status(400).json({
                        message: "Enter valid marks and maximum marks."
                    });
                }

                if (comments.length > 4000) {
                    return res.status(400).json({
                        message: "Feedback is too long."
                    });
                }

                const submission = await pool.query(
                    `SELECT s.id
                     FROM assignment_submissions s
                     JOIN assignments a
                        ON a.id = s.assignment_id
                     WHERE s.id = $1
                       AND a.teacher_id = $2`,
                    [
                        req.params.id,
                        req.assignmentTeacher.id
                    ]
                );

                if (!submission.rows.length) {
                    return res.status(404).json({
                        message: "Submission not found."
                    });
                }

                await pool.query(
                    `INSERT INTO assignment_feedback (
                        submission_id,
                        teacher_id,
                        marks,
                        maximum_marks,
                        comments,
                        graded_at
                    )
                    VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)
                    ON CONFLICT (submission_id)
                    DO UPDATE SET
                        teacher_id = EXCLUDED.teacher_id,
                        marks = EXCLUDED.marks,
                        maximum_marks = EXCLUDED.maximum_marks,
                        comments = EXCLUDED.comments,
                        graded_at = CURRENT_TIMESTAMP`,
                    [
                        req.params.id,
                        req.assignmentTeacher.id,
                        marks,
                        maximumMarks,
                        comments
                    ]
                );

                await pool.query(
                    `UPDATE assignment_submissions
                     SET status = 'graded'
                     WHERE id = $1`,
                    [req.params.id]
                );

                res.json({
                    message: "Submission graded successfully."
                });

            } catch (error) {
                console.error("Assignment grading error:", error);

                res.status(500).json({
                    message: "Unable to grade submission."
                });
            }
        }
    );

    console.log("MONZE DAY: Assignment routes loaded.");
};
