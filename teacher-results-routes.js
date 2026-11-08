function registerTeacherResultsRoutes(app, pool) {
    const normalizeClass = value =>
        String(value || "")
            .trim()
            .replace(/\s+/g, "")
            .toLowerCase();

    const validTerm = term =>
        ["Term 1", "Term 2", "Term 3"].includes(term);

    const validYear = year =>
        Number.isInteger(Number(year)) &&
        Number(year) >= 2000 &&
        Number(year) <= 2100;

    const validScore = score =>
        Number.isFinite(Number(score)) &&
        Number(score) >= 0 &&
        Number(score) <= 100;

    const validGrade = grade =>
        ["Distinction", "Merit", "Credit", "Pass", "Fail"].includes(grade);

    async function getTeacher(teacherId) {
        const result = await pool.query(
            `SELECT id, subjects, classes, is_class_teacher,
                    assigned_class, approved
             FROM teachers
             WHERE id = $1`,
            [teacherId]
        );

        const teacher = result.rows[0];

        if (!teacher || Number(teacher.approved) !== 1) {
            return null;
        }

        return teacher;
    }

    function teacherClasses(teacher) {
        return String(teacher.classes || "")
            .split(",")
            .concat(teacher.assigned_class ? [teacher.assigned_class] : [])
            .map(normalizeClass)
            .filter(Boolean);
    }

    function isClassTeacher(teacher) {
        return Number(teacher.is_class_teacher) === 1 ||
            teacher.is_class_teacher === true ||
            teacher.is_class_teacher === "t";
    }

    function teacherSubjects(teacher) {
        return String(teacher.subjects || "")
            .split(",")
            .map(subject => subject.trim())
            .filter(Boolean);
    }

    async function getOfficialSubjects(className) {
        const match = normalizeClass(className).match(
            /^form([1-4])([a-d])$/i
        );

        if (!match) return [];

        const result = await pool.query(
            `SELECT subject_name
             FROM class_subjects
             WHERE form_number = $1
               AND UPPER(TRIM(class_letter::text)) = $2
             ORDER BY subject_name`,
            [Number(match[1]), match[2].toUpperCase()]
        );

        return result.rows.map(row => row.subject_name);
    }

    async function findStudent(studentNumber, className) {
        const result = await pool.query(
            `SELECT id, full_name, student_number, class_name
             FROM students
             WHERE TRIM(student_number) = $1
               AND REPLACE(LOWER(TRIM(class_name)), ' ', '') = $2
             LIMIT 1`,
            [String(studentNumber || "").trim(), normalizeClass(className)]
        );

        return result.rows[0] || null;
    }

    // SEARCH STUDENT BY STUDENT NUMBER AND CLASS
    app.get("/api/teacher/search-student", async (req, res) => {
        if (!req.session.teacherId) {
            return res.status(401).json({ message: "Teacher login required." });
        }

        try {
            const teacher = await getTeacher(req.session.teacherId);

            if (!teacher) {
                return res.status(403).json({
                    message: "Approved teacher account required."
                });
            }

            const { studentNumber, className } = req.query;
            const selectedClass = normalizeClass(className);

            if (!studentNumber || !selectedClass) {
                return res.status(400).json({
                    message: "Enter the student number and class."
                });
            }

            if (!teacherClasses(teacher).includes(selectedClass)) {
                return res.status(403).json({
                    message: "You are not assigned to this class."
                });
            }

            const student = await findStudent(studentNumber, className);

            if (!student) {
                return res.status(404).json({
                    message: "Student not found in the selected class."
                });
            }

            res.json({
                full_name: student.full_name,
                student_number: student.student_number,
                class_name: student.class_name
            });
        } catch (error) {
            console.error("Student search error:", error);
            res.status(500).json({
                message: "Unable to search for student."
            });
        }
    });

    // LOAD OFFICIAL SUBJECTS FOR THE CLASS TEACHER
    app.get("/api/teacher/official-subjects", async (req, res) => {
        if (!req.session.teacherId) {
            return res.status(401).json({ message: "Teacher login required." });
        }

        try {
            const teacher = await getTeacher(req.session.teacherId);

            if (!teacher) {
                return res.status(403).json({
                    message: "Approved teacher account required."
                });
            }

            if (!isClassTeacher(teacher)) {
                return res.status(403).json({
                    message: "Only the class teacher can access this feature."
                });
            }

            const className = normalizeClass(req.query.className);

            if (!teacher.assigned_class ||
                normalizeClass(teacher.assigned_class) !== className) {
                return res.status(403).json({
                    message: "You can only manage your assigned class."
                });
            }

            const subjects = await getOfficialSubjects(req.query.className);

            res.json(subjects);
        } catch (error) {
            console.error("Official subjects error:", error);
            res.status(500).json({
                message: "Unable to load official subjects."
            });
        }
    });

    // SUBMIT ALL END-OF-TERM SUBJECT RESULTS IN ONE TRANSACTION
    app.post("/api/teacher/end-term-results", async (req, res) => {
        if (!req.session.teacherId) {
            return res.status(401).json({ message: "Teacher login required." });
        }

        const { studentNumber, className, term, year, subjects } = req.body;
        const numericYear = Number(year);

        if (!studentNumber?.trim() || !className?.trim() ||
            !validTerm(term) || !validYear(numericYear) ||
            !Array.isArray(subjects) || subjects.length === 0) {
            return res.status(400).json({
                message: "Complete the student, class, term, year and subject results."
            });
        }

        const client = await pool.connect();

        try {
            const teacherResult = await client.query(
                `SELECT subjects, classes, is_class_teacher,
                        assigned_class, approved
                 FROM teachers
                 WHERE id = $1`,
                [req.session.teacherId]
            );

            const teacher = teacherResult.rows[0];

            if (!teacher || Number(teacher.approved) !== 1) {
                return res.status(403).json({
                    message: "Approved teacher account required."
                });
            }

            if (!isClassTeacher(teacher)) {
                return res.status(403).json({
                    message: "Only the class teacher can submit end-of-term results."
                });
            }

            const selectedClass = normalizeClass(className);

            if (!teacher.assigned_class ||
                normalizeClass(teacher.assigned_class) !== selectedClass) {
                return res.status(403).json({
                    message: "You can only submit results for your assigned class."
                });
            }

            const student = await findStudent(studentNumber, className);

            if (!student) {
                return res.status(404).json({
                    message: "Student not found in the selected class."
                });
            }

            const officialSubjects = await getOfficialSubjects(className);

            if (!officialSubjects.length) {
                return res.status(400).json({
                    message: "No official subjects are configured for this class."
                });
            }

            const submittedNames = subjects.map(item =>
                String(item.subject || "").trim().toLowerCase()
            );

            const officialNames = officialSubjects.map(subject =>
                subject.trim().toLowerCase()
            );

            if (submittedNames.length !== officialNames.length ||
                new Set(submittedNames).size !== submittedNames.length ||
                officialNames.some(subject => !submittedNames.includes(subject))) {
                return res.status(400).json({
                    message: "You must submit exactly one result for every official subject."
                });
            }

            for (const item of subjects) {
                if (!validScore(item.score) || !validGrade(item.grade)) {
                    return res.status(400).json({
                        message: "Every subject needs a valid score and grade."
                    });
                }
            }

            await client.query("BEGIN");

            const duplicate = await client.query(
                `SELECT subject
                 FROM academic_results
                 WHERE student_id = $1
                   AND assessment_type = 'end_of_term'
                   AND term = $2
                   AND year = $3
                   AND LOWER(subject) = ANY($4::text[])
                 FOR UPDATE`,
                [student.id, term, numericYear, officialNames]
            );

            if (duplicate.rows.length) {
                await client.query("ROLLBACK");
                return res.status(409).json({
                    message: "Some end-of-term results already exist for this student, term and year. No results were saved."
                });
            }

            for (const item of subjects) {
                const officialSubject = officialSubjects.find(
                    subject => subject.toLowerCase() ===
                        String(item.subject).trim().toLowerCase()
                );

                await client.query(
                    `INSERT INTO academic_results
                     (student_id, subject, term, year, score, grade, remarks,
                      assessment_type, assessment_kind, assessment_name)
                     VALUES ($1, $2, $3, $4, $5, $6, $7,
                             'end_of_term', 'End-of-Term Examination',
                             'End-of-Term Examination')`,
                    [
                        student.id,
                        officialSubject,
                        term,
                        numericYear,
                        Number(item.score),
                        item.grade,
                        String(item.remarks || "").trim()
                    ]
                );
            }

            await client.query("COMMIT");

            res.status(201).json({
                message: "End-of-term results for all official subjects were saved successfully.",
                subjectsSaved: subjects.length
            });
        } catch (error) {
            await client.query("ROLLBACK");
            console.error("End-of-term submission error:", error);
            res.status(500).json({
                message: "Unable to save end-of-term results."
            });
        } finally {
            client.release();
        }
    });

    // SUBMIT CLASS TESTS, MID-TERM TESTS, ASSIGNMENTS AND OTHER TESTS
    app.post("/api/teacher/other-assessments", async (req, res) => {
        if (!req.session.teacherId) {
            return res.status(401).json({ message: "Teacher login required." });
        }

        const {
            studentNumber, className, subject, term, year,
            score, grade, remarks, assessmentKind, assessmentName
        } = req.body;

        const numericYear = Number(year);
        const allowedKinds = [
            "Class Test",
            "Mid-Term Test",
            "Assignment",
            "Other Test"
        ];

        if (!studentNumber?.trim() || !className?.trim() ||
            !subject?.trim() || !validTerm(term) ||
            !validYear(numericYear) || !validScore(score) ||
            !validGrade(grade) || !allowedKinds.includes(assessmentKind) ||
            !assessmentName?.trim() || assessmentName.trim().length > 120) {
            return res.status(400).json({
                message: "Please complete all fields with valid information."
            });
        }

        try {
            const teacher = await getTeacher(req.session.teacherId);

            if (!teacher) {
                return res.status(403).json({
                    message: "Approved teacher account required."
                });
            }

            const selectedClass = normalizeClass(className);

            if (!teacherClasses(teacher).includes(selectedClass)) {
                return res.status(403).json({
                    message: "You are not assigned to the selected class."
                });
            }

            const assignedSubject = teacherSubjects(teacher).find(
                item => item.toLowerCase() === subject.trim().toLowerCase()
            );

            if (!assignedSubject) {
                return res.status(403).json({
                    message: "You are not assigned to teach this subject."
                });
            }

            const student = await findStudent(studentNumber, className);

            if (!student) {
                return res.status(404).json({
                    message: "Student not found in the selected class."
                });
            }

            const duplicate = await pool.query(
                `SELECT id
                 FROM academic_results
                 WHERE student_id = $1
                   AND assessment_type = 'other_assessment'
                   AND LOWER(subject) = LOWER($2)
                   AND term = $3
                   AND year = $4
                   AND LOWER(assessment_name) = LOWER($5)
                 LIMIT 1`,
                [
                    student.id, assignedSubject, term,
                    numericYear, assessmentName.trim()
                ]
            );

            if (duplicate.rows.length) {
                return res.status(409).json({
                    message: "This assessment has already been recorded for the student."
                });
            }

            await pool.query(
                `INSERT INTO academic_results
                 (student_id, subject, term, year, score, grade, remarks,
                  assessment_type, assessment_kind, assessment_name)
                 VALUES ($1, $2, $3, $4, $5, $6, $7,
                         'other_assessment', $8, $9)`,
                [
                    student.id,
                    assignedSubject,
                    term,
                    numericYear,
                    Number(score),
                    grade,
                    String(remarks || "").trim(),
                    assessmentKind,
                    assessmentName.trim()
                ]
            );

            res.status(201).json({
                message: "Assessment result saved successfully."
            });
        } catch (error) {
            console.error("Other assessment submission error:", error);
            res.status(500).json({
                message: "Unable to save assessment result."
            });
        }
    });

    // VIEW RESULTS WITH CLASS-TEACHER AND SUBJECT-TEACHER PERMISSIONS
    app.get("/api/teacher/results", async (req, res) => {
        if (!req.session.teacherId) {
            return res.status(401).json({ message: "Teacher login required." });
        }

        try {
            const teacher = await getTeacher(req.session.teacherId);

            if (!teacher) {
                return res.status(403).json({
                    message: "Approved teacher account required."
                });
            }

            const classes = teacherClasses(teacher);
            const subjects = teacherSubjects(teacher).map(
                subject => subject.toLowerCase()
            );

            if (!classes.length) return res.json([]);

            const result = await pool.query(
                `SELECT ar.id, s.full_name, s.student_number, s.class_name,
                        ar.subject, ar.term, ar.year, ar.score, ar.grade,
                        ar.remarks, ar.assessment_type, ar.assessment_kind,
                        ar.assessment_name, ar.created_at
                 FROM academic_results ar
                 JOIN students s ON s.id = ar.student_id
                 WHERE REPLACE(LOWER(TRIM(s.class_name)), ' ', '') =
                       ANY($1::text[])
                   AND (
                       LOWER(TRIM(ar.subject)) = ANY($2::text[])
                       OR (
                           $3::boolean = TRUE
                           AND REPLACE(LOWER(TRIM(s.class_name)), ' ', '') = $4
                       )
                   )
                 ORDER BY s.class_name, s.full_name, ar.year DESC,
                          ar.term, ar.subject`,
                [
                    classes,
                    subjects,
                    isClassTeacher(teacher),
                    normalizeClass(teacher.assigned_class)
                ]
            );

            res.json(result.rows);
        } catch (error) {
            console.error("Teacher results error:", error);
            res.status(500).json({
                message: "Unable to load academic results."
            });
        }
    });
}

module.exports = registerTeacherResultsRoutes;
