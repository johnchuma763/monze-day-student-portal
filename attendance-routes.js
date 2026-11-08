module.exports = function registerAttendanceRoutes(app, { pool, requireAdmin }) {

    const VALID_STATUSES = ["Present", "Absent", "Late"];

    function normalizeClass(value) {
        return String(value || "")
            .trim()
            .replace(/\s+/g, " ")
            .replace(/\s*([A-D])$/i, (_, letter) => letter.toUpperCase());
    }

    async function requireTeacher(req, res, next) {
        if (!req.session.teacherId) {
            return res.status(401).json({ message: "Teacher login required." });
        }

        try {
            const result = await pool.query(
                "SELECT id FROM teachers WHERE id = $1",
                [req.session.teacherId]
            );

            if (!result.rows.length) {
                return res.status(403).json({ message: "Approved teacher account required." });
            }

            next();
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Unable to verify teacher account." });
        }
    }

    async function requireStudent(req, res, next) {
        if (!req.session.studentId) {
            return res.status(401).json({ message: "Student login required." });
        }

        try {
            const result = await pool.query(
                "SELECT id FROM students WHERE id = $1",
                [req.session.studentId]
            );

            if (!result.rows.length) {
                return res.status(401).json({ message: "Student account not found." });
            }

            next();
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Unable to verify student account." });
        }
    }

    async function teacherCanAccessClass(teacherId, className) {
        const result = await pool.query(
            "SELECT classes FROM teachers WHERE id = $1",
            [teacherId]
        );

        if (!result.rows.length) return false;

        const classes = String(result.rows[0].classes || "")
            .split(",")
            .map(normalizeClass);

        return classes.includes(normalizeClass(className));
    }

    // TEACHER: Get students in an assigned class.
    app.get("/api/teacher/attendance/students", requireTeacher, async (req, res) => {
        try {
            const className = normalizeClass(req.query.class_name);

            if (!className) {
                return res.status(400).json({ message: "Select a class." });
            }

            if (!await teacherCanAccessClass(req.session.teacherId, className)) {
                return res.status(403).json({ message: "You are not assigned to this class." });
            }

            const result = await pool.query(
                `SELECT id, student_number, full_name, class_name
                 FROM students
                 WHERE REGEXP_REPLACE(LOWER(class_name), '\\s+', '', 'g') =
                       REGEXP_REPLACE(LOWER($1), '\\s+', '', 'g')
                 ORDER BY full_name`,
                [className]
            );

            res.json({ students: result.rows });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Unable to load class students." });
        }
    });

    // TEACHER: Load attendance for a class and date.
    app.get("/api/teacher/attendance", requireTeacher, async (req, res) => {
        try {
            const className = normalizeClass(req.query.class_name);
            const date = req.query.date;

            if (!className || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                return res.status(400).json({ message: "A valid class and date are required." });
            }

            if (!await teacherCanAccessClass(req.session.teacherId, className)) {
                return res.status(403).json({ message: "You are not assigned to this class." });
            }

            const result = await pool.query(
                `SELECT s.id AS session_id, r.student_id, r.status
                 FROM attendance_sessions s
                 LEFT JOIN attendance_records r ON r.session_id = s.id
                 WHERE s.class_name = $1 AND s.attendance_date = $2`,
                [className, date]
            );

            res.json({
                records: result.rows,
                sessionId: result.rows[0]?.session_id || null
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Unable to load attendance." });
        }
    });

    // TEACHER: Save or update attendance.
    app.put("/api/teacher/attendance", requireTeacher, async (req, res) => {
        const client = await pool.connect();

        try {
            const className = normalizeClass(req.body.class_name);
            const date = req.body.date;
            const records = req.body.records;

            if (!className || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                return res.status(400).json({ message: "A valid class and date are required." });
            }

            if (!Array.isArray(records) || records.length === 0) {
                return res.status(400).json({ message: "Attendance records are required." });
            }

            if (!await teacherCanAccessClass(req.session.teacherId, className)) {
                return res.status(403).json({ message: "You are not assigned to this class." });
            }

            for (const record of records) {
                if (!Number.isInteger(Number(record.student_id)) ||
                    !VALID_STATUSES.includes(record.status)) {
                    return res.status(400).json({ message: "Invalid student or attendance status." });
                }
            }

            await client.query("BEGIN");

            const session = await client.query(
                `INSERT INTO attendance_sessions (class_name, attendance_date, teacher_id)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (class_name, attendance_date)
                 DO UPDATE SET teacher_id = EXCLUDED.teacher_id
                 RETURNING id`,
                [className, date, req.session.teacherId]
            );

            const sessionId = session.rows[0].id;

            const studentIds = records.map(record => Number(record.student_id));

            const validStudents = await client.query(
                `SELECT id FROM students
                 WHERE id = ANY($1::bigint[])
                 AND REGEXP_REPLACE(LOWER(class_name), '\\s+', '', 'g') =
                     REGEXP_REPLACE(LOWER($2), '\\s+', '', 'g')`,
                [studentIds, className]
            );

            if (validStudents.rows.length !== new Set(studentIds).size) {
                await client.query("ROLLBACK");
                return res.status(400).json({
                    message: "One or more students do not belong to this class."
                });
            }

            for (const record of records) {
                await client.query(
                    `INSERT INTO attendance_records (session_id, student_id, status)
                     VALUES ($1, $2, $3)
                     ON CONFLICT (session_id, student_id)
                     DO UPDATE SET status = EXCLUDED.status,
                                   marked_at = CURRENT_TIMESTAMP`,
                    [sessionId, Number(record.student_id), record.status]
                );
            }

            await client.query("COMMIT");
            res.json({ message: "Attendance saved successfully.", sessionId });
        } catch (error) {
            await client.query("ROLLBACK");
            console.error(error);
            res.status(500).json({ message: "Unable to save attendance." });
        } finally {
            client.release();
        }
    });


    // TEACHER: View attendance sessions recorded by this teacher.
    app.get("/api/teacher/attendance/history", requireTeacher, async (req, res) => {
        try {
            const result = await pool.query(
                `SELECT s.id, s.class_name, s.attendance_date,
                        COUNT(r.id)::int AS total_students,
                        COUNT(r.id) FILTER (WHERE r.status = 'Present')::int AS present,
                        COUNT(r.id) FILTER (WHERE r.status = 'Absent')::int AS absent,
                        COUNT(r.id) FILTER (WHERE r.status = 'Late')::int AS late
                 FROM attendance_sessions s
                 LEFT JOIN attendance_records r ON r.session_id = s.id
                 WHERE s.teacher_id = $1
                 GROUP BY s.id
                 ORDER BY s.attendance_date DESC, s.class_name`,
                [req.session.teacherId]
            );

            res.json({ sessions: result.rows });
        } catch (error) {
            console.error(error);
            res.status(500).json({
                message: "Unable to load attendance history."
            });
        }
    });

    // TEACHER: View the students in one of their recorded sessions.
    app.get("/api/teacher/attendance/history/:id", requireTeacher, async (req, res) => {
        try {
            const id = req.params.id;

            if (!/^[1-9]\\d*$/.test(id)) {
                return res.status(400).json({ message: "Invalid attendance record." });
            }

            const session = await pool.query(
                `SELECT id, class_name, attendance_date
                 FROM attendance_sessions
                 WHERE id = $1 AND teacher_id = $2`,
                [id, req.session.teacherId]
            );

            if (!session.rows.length) {
                return res.status(404).json({
                    message: "Attendance record not found."
                });
            }

            const records = await pool.query(
                `SELECT st.student_number, st.full_name, r.status, r.marked_at
                 FROM attendance_records r
                 JOIN students st ON st.id = r.student_id
                 WHERE r.session_id = $1
                 ORDER BY st.full_name`,
                [id]
            );

            res.json({
                session: session.rows[0],
                records: records.rows
            });
        } catch (error) {
            console.error(error);
            res.status(500).json({
                message: "Unable to load attendance details."
            });
        }
    });

    // STUDENT: View personal attendance history and summary.
    app.get("/api/student/attendance", requireStudent, async (req, res) => {
        try {
            const result = await pool.query(
                `SELECT s.attendance_date, s.class_name, r.status
                 FROM attendance_records r
                 JOIN attendance_sessions s ON s.id = r.session_id
                 WHERE r.student_id = $1
                 ORDER BY s.attendance_date DESC`,
                [req.session.studentId]
            );

            const summary = { Present: 0, Absent: 0, Late: 0 };

            for (const record of result.rows) {
                summary[record.status] = (summary[record.status] || 0) + 1;
            }

            res.json({ records: result.rows, summary });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Unable to load attendance history." });
        }
    });

    // ADMIN: View attendance sessions and records.
    app.get("/api/admin/attendance", requireAdmin, async (req, res) => {
        try {
            const values = [];
            let where = "";

            if (req.query.class_name) {
                values.push(normalizeClass(req.query.class_name));
                where += ` AND REGEXP_REPLACE(LOWER(s.class_name), '\\s+', '', 'g') =
                                REGEXP_REPLACE(LOWER($${values.length}), '\\s+', '', 'g')`;
            }

            if (req.query.date) {
                values.push(req.query.date);
                where += ` AND s.attendance_date = $${values.length}`;
            }

            const result = await pool.query(
                `SELECT s.id, s.class_name, s.attendance_date,
                        t.full_name AS teacher_name,
                        COUNT(r.id)::int AS total_marked,
                        COUNT(r.id) FILTER (WHERE r.status = 'Present')::int AS present,
                        COUNT(r.id) FILTER (WHERE r.status = 'Absent')::int AS absent,
                        COUNT(r.id) FILTER (WHERE r.status = 'Late')::int AS late
                 FROM attendance_sessions s
                 LEFT JOIN attendance_records r ON r.session_id = s.id
                 LEFT JOIN teachers t ON t.id = s.teacher_id
                 WHERE TRUE ${where}
                 GROUP BY s.id, t.full_name
                 ORDER BY s.attendance_date DESC, s.class_name`,
                values
            );

            res.json({ sessions: result.rows });
        } catch (error) {
            console.error(error);
            res.status(500).json({ message: "Unable to load attendance reports." });
        }
    });

    console.log("ATTENDANCE ROUTES REGISTERED");
};
