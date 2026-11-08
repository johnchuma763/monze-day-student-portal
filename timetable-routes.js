module.exports = function registerTimetableRoutes(app, { pool, requireAdmin }) {
    console.log("NEW TIMETABLE ROUTES REGISTERING...");
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

    function normalizeClass(value) {
        const match = String(value || "").trim().match(/^Form\s*([1-4])\s*([A-D])$/i);
        return match ? `Form ${match[1]}${match[2].toUpperCase()}` : "";
    }

    function csv(value) {
        return String(value || "").split(",").map(v => v.trim()).filter(Boolean);
    }

    function timeToMinutes(value) {
        const match = String(value || "").match(/^([01]\d|2[0-3]):([0-5]\d)$/);
        return match ? Number(match[1]) * 60 + Number(match[2]) : null;
    }

    function minutesToTime(value) {
        return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
    }

    async function getApprovedTeacher(id, className, subject) {
        const result = await pool.query(
            `SELECT id, full_name, subjects, classes
             FROM teachers WHERE id = $1 AND approved = 1`,
            [id]
        );

        const teacher = result.rows[0];
        if (!teacher) return null;

        const teachesSubject = csv(teacher.subjects)
            .some(s => s.toLowerCase() === subject.toLowerCase());

        const teachesClass = csv(teacher.classes)
            .some(c => normalizeClass(c) === className);

        return teachesSubject && teachesClass ? teacher : null;
    }

    async function getEligibleTeachers(className, subject) {
        const result = await pool.query(
            `SELECT id, full_name, subjects, classes
             FROM teachers WHERE approved = 1
             ORDER BY full_name`
        );

        return result.rows
            .filter(t =>
                csv(t.subjects).some(s => s.toLowerCase() === subject.toLowerCase()) &&
                csv(t.classes).some(c => normalizeClass(c) === className)
            )
            .map(t => ({ id: t.id, full_name: t.full_name }));
    }

    function requireStudent(req, res, next) {
        if (!req.session.studentId) {
            return res.status(401).json({ message: "Please log in as a student." });
        }
        next();
    }

    function requireTeacher(req, res, next) {
        if (!req.session.teacherId) {
            return res.status(401).json({ message: "Please log in as a teacher." });
        }
        next();
    }

    async function buildPeriods(settings) {
        const start = timeToMinutes(settings.session_start);
        const end = timeToMinutes(settings.session_end);
        const breakStart = timeToMinutes(settings.break_start);
        const breakEnd = timeToMinutes(settings.break_end);
        const duration = Number(settings.lesson_minutes);

        if ([start, end, breakStart, breakEnd].some(v => v === null) ||
            !Number.isInteger(duration) || duration < 10 ||
            end <= start || breakEnd <= breakStart ||
            breakStart < start || breakEnd > end) {
            throw new Error("Invalid timetable settings.");
        }

        const periods = [];
        let current = start;
        let number = 1;

        while (current + duration <= end) {
            if (current >= breakStart && current < breakEnd) {
                periods.push({
                    period_number: "BREAK",
                    start_time: minutesToTime(breakStart),
                    end_time: minutesToTime(breakEnd),
                    is_break: true
                });
                current = breakEnd;
                continue;
            }

            if (current < breakStart && current + duration > breakStart) {
                current = breakEnd;
                continue;
            }

            if (current >= breakEnd || current + duration <= breakStart) {
                periods.push({
                    period_number: number++,
                    start_time: minutesToTime(current),
                    end_time: minutesToTime(current + duration),
                    is_break: false
                });
                current += duration;
            } else {
                current = breakEnd;
            }
        }

        if (!periods.some(p => p.is_break)) {
            periods.push({
                period_number: "BREAK",
                start_time: minutesToTime(breakStart),
                end_time: minutesToTime(breakEnd),
                is_break: true
            });
        }

        return periods.sort((a, b) =>
            timeToMinutes(a.start_time) - timeToMinutes(b.start_time)
        );
    }

    // ADMIN: LIST AVAILABLE CLASS STREAMS
    console.log("REGISTERING ADMIN CLASSES ROUTE");
    app.get("/api/admin/timetable/classes", requireAdmin, async (req, res) => {
        try {
            const result = await pool.query(`
                SELECT DISTINCT form_number, class_letter
                FROM class_subjects
                ORDER BY form_number, class_letter
            `);

            res.json(result.rows.map(row =>
                `Form ${row.form_number}${String(row.class_letter).trim()}`
            ));
        } catch (error) {
            console.error("Timetable classes:", error);
            res.status(500).json({ message: "Unable to load classes." });
        }
    });

    // ADMIN: SAVE CLASS TIMETABLE SETTINGS
    app.put("/api/admin/timetable/settings/:className", requireAdmin, async (req, res) => {
        const className = normalizeClass(req.params.className);
        const { session_start, session_end, lesson_minutes, break_start, break_end } = req.body;

        const start = timeToMinutes(session_start);
        const end = timeToMinutes(session_end);
        const bStart = timeToMinutes(break_start);
        const bEnd = timeToMinutes(break_end);
        const duration = Number(lesson_minutes);

        if (!className || [start, end, bStart, bEnd].some(v => v === null) ||
            !Number.isInteger(duration) || duration < 10 || duration > 180 ||
            end <= start || bStart < start || bEnd > end || bEnd <= bStart) {
            return res.status(400).json({ message: "Please enter valid class timetable settings." });
        }

        try {
            await pool.query(`
                INSERT INTO class_timetable_settings
                    (class_name, session_start, session_end, lesson_minutes, break_start, break_end)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (class_name) DO UPDATE SET
                    session_start = EXCLUDED.session_start,
                    session_end = EXCLUDED.session_end,
                    lesson_minutes = EXCLUDED.lesson_minutes,
                    break_start = EXCLUDED.break_start,
                    break_end = EXCLUDED.break_end,
                    updated_at = CURRENT_TIMESTAMP
            `, [className, session_start, session_end, duration, break_start, break_end]);

            res.json({ message: "Class timetable settings saved successfully." });
        } catch (error) {
            console.error("Timetable settings save:", error);
            res.status(500).json({ message: "Unable to save timetable settings." });
        }
    });

    // ADMIN: GET CLASS SETTINGS AND GENERATED PERIODS
    app.get("/api/admin/timetable/settings/:className", requireAdmin, async (req, res) => {
        const className = normalizeClass(req.params.className);
        if (!className) return res.status(400).json({ message: "Invalid class." });

        try {
            const result = await pool.query(
                `SELECT class_name,
                        TO_CHAR(session_start, 'HH24:MI') AS session_start,
                        TO_CHAR(session_end, 'HH24:MI') AS session_end,
                        lesson_minutes,
                        TO_CHAR(break_start, 'HH24:MI') AS break_start,
                        TO_CHAR(break_end, 'HH24:MI') AS break_end
                 FROM class_timetable_settings WHERE class_name = $1`,
                [className]
            );

            if (!result.rows[0]) {
                return res.json({ settings: null, periods: [] });
            }

            res.json({
                settings: result.rows[0],
                periods: await buildPeriods(result.rows[0])
            });
        } catch (error) {
            console.error("Timetable settings load:", error);
            res.status(500).json({ message: "Unable to load timetable settings." });
        }
    });

    // ADMIN: GET SUBJECTS FOR A STREAM
    app.get("/api/admin/timetable/subjects/:className", requireAdmin, async (req, res) => {
        const match = normalizeClass(req.params.className);
        if (!match) return res.status(400).json({ message: "Invalid class." });

        const parts = match.match(/^Form ([1-4])([A-D])$/);
        try {
            const result = await pool.query(`
                SELECT subject_name FROM class_subjects
                WHERE form_number = $1 AND UPPER(TRIM(class_letter::text)) = $2
                ORDER BY subject_name
            `, [Number(parts[1]), parts[2]]);

            res.json(result.rows.map(row => row.subject_name));
        } catch (error) {
            console.error("Timetable subjects:", error);
            res.status(500).json({ message: "Unable to load class subjects." });
        }
    });

    // ADMIN: FIND APPROVED TEACHERS FOR A SUBJECT AND STREAM
    app.get("/api/admin/timetable/teachers", requireAdmin, async (req, res) => {
        const className = normalizeClass(req.query.class_name);
        const subject = String(req.query.subject || "").trim();

        if (!className || !subject) {
            return res.status(400).json({ message: "Select a class and subject." });
        }

        try {
            res.json(await getEligibleTeachers(className, subject));
        } catch (error) {
            console.error("Timetable teacher matching:", error);
            res.status(500).json({ message: "Unable to find assigned teachers." });
        }
    });

    // ADMIN: GET COMPLETE WEEKLY TIMETABLE
    app.get("/api/admin/timetable", requireAdmin, async (req, res) => {
        try {
            const className = req.query.class_name
                ? normalizeClass(req.query.class_name)
                : "";

            const result = await pool.query(`
                SELECT t.id, t.class_name, t.day_of_week, t.period_number,
                       TO_CHAR(t.start_time, 'HH24:MI') AS start_time,
                       TO_CHAR(t.end_time, 'HH24:MI') AS end_time,
                       t.subject, t.teacher_id, te.full_name AS teacher_name
                FROM timetable t
                LEFT JOIN teachers te ON te.id = t.teacher_id
                WHERE ($1 = '' OR t.class_name = $1)
                ORDER BY t.class_name,
                    CASE t.day_of_week
                        WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2
                        WHEN 'Wednesday' THEN 3 WHEN 'Thursday' THEN 4
                        WHEN 'Friday' THEN 5
                    END, t.period_number
            `, [className]);

            res.json(result.rows);
        } catch (error) {
            console.error("Admin timetable load:", error);
            res.status(500).json({ message: "Unable to load timetable." });
        }
    });

    // ADMIN: SAVE OR REPLACE ONE DAY FOR A CLASS
    app.put("/api/admin/timetable/day", requireAdmin, async (req, res) => {
        const className = normalizeClass(req.body.class_name);
        const day = req.body.day_of_week;
        const entries = req.body.entries;

        if (!className || !days.includes(day) || !Array.isArray(entries)) {
            return res.status(400).json({ message: "Invalid class, day or timetable entries." });
        }

        const client = await pool.connect();
        try {
            await client.query("BEGIN");

            const settingsResult = await client.query(`
                SELECT TO_CHAR(session_start, 'HH24:MI') AS session_start,
                       TO_CHAR(session_end, 'HH24:MI') AS session_end,
                       lesson_minutes,
                       TO_CHAR(break_start, 'HH24:MI') AS break_start,
                       TO_CHAR(break_end, 'HH24:MI') AS break_end
                FROM class_timetable_settings WHERE class_name = $1
            `, [className]);

            if (!settingsResult.rows[0]) {
                await client.query("ROLLBACK");
                return res.status(400).json({ message: "Set the class timetable times first." });
            }

            const periods = await buildPeriods(settingsResult.rows[0]);
            const lessonPeriods = periods.filter(p => !p.is_break);

            if (entries.length > lessonPeriods.length) {
                await client.query("ROLLBACK");
                return res.status(400).json({ message: "There are more entries than available lessons." });
            }

            const selected = [];
            for (let i = 0; i < entries.length; i++) {
                const subject = String(entries[i].subject || "").trim();
                const teacherId = entries[i].teacher_id;

                if (!subject) continue;

                const allowed = await client.query(`
                    SELECT 1 FROM class_subjects
                    WHERE form_number = $1
                      AND UPPER(TRIM(class_letter::text)) = $2
                      AND LOWER(subject_name) = LOWER($3)
                `, [
                    Number(className.match(/^Form ([1-4])/)[1]),
                    className.slice(-1),
                    subject
                ]);

                if (!allowed.rows.length) {
                    throw new Error(`"${subject}" is not registered for ${className}.`);
                }

                const teacher = await getApprovedTeacher(teacherId, className, subject);
                if (!teacher) {
                    throw new Error(`Select an approved teacher assigned to ${className} for ${subject}.`);
                }

                selected.push({
                    period: lessonPeriods[i],
                    subject,
                    teacher
                });
            }

            await client.query(
                "DELETE FROM timetable WHERE class_name = $1 AND day_of_week = $2",
                [className, day]
            );

            for (const item of selected) {
                await client.query(`
                    INSERT INTO timetable
                        (class_name, day_of_week, period_number, start_time,
                         end_time, subject, teacher_id, teacher_name)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                `, [
                    className, day, item.period.period_number,
                    item.period.start_time, item.period.end_time,
                    item.subject, item.teacher.id, item.teacher.full_name
                ]);
            }

            await client.query("COMMIT");
            res.json({ message: `${day}'s timetable saved for ${className}.` });
        } catch (error) {
            await client.query("ROLLBACK");
            console.error("Save daily timetable:", error);
            res.status(400).json({ message: error.message || "Unable to save timetable." });
        } finally {
            client.release();
        }
    });

    // STUDENT: ONLY THEIR OWN CLASS, WITHOUT TEACHER NAMES
    app.get("/api/student/timetable", requireStudent, async (req, res) => {
        try {
            const studentResult = await pool.query(
                "SELECT class_name FROM students WHERE id = $1",
                [req.session.studentId]
            );

            const className = normalizeClass(studentResult.rows[0]?.class_name);

            if (!className) {
                return res.json({ lessons: [], settings: null });
            }

            const [lessonResult, settingsResult] = await Promise.all([
                pool.query(`
                    SELECT day_of_week, period_number,
                           TO_CHAR(start_time, 'HH24:MI') AS start_time,
                           TO_CHAR(end_time, 'HH24:MI') AS end_time,
                           subject
                    FROM timetable
                    WHERE class_name = $1
                    ORDER BY CASE day_of_week
                        WHEN 'Monday' THEN 1
                        WHEN 'Tuesday' THEN 2
                        WHEN 'Wednesday' THEN 3
                        WHEN 'Thursday' THEN 4
                        WHEN 'Friday' THEN 5
                    END, period_number
                `, [className]),

                pool.query(`
                    SELECT
                        TO_CHAR(break_start, 'HH24:MI') AS break_start,
                        TO_CHAR(break_end, 'HH24:MI') AS break_end
                    FROM class_timetable_settings
                    WHERE class_name = $1
                `, [className])
            ]);

            res.json({
                lessons: lessonResult.rows,
                settings: settingsResult.rows[0] || null
            });
        } catch (error) {
            console.error("Student timetable:", error);
            res.status(500).json({
                message: "Unable to load your timetable."
            });
        }
    });

    // TEACHER: ONLY THEIR OWN LESSONS, WITHOUT OTHER TEACHER NAMES
    app.get("/api/teacher/timetable", requireTeacher, async (req, res) => {
        try {
            const teacherResult = await pool.query(
                "SELECT approved FROM teachers WHERE id = $1",
                [req.session.teacherId]
            );

            if (!teacherResult.rows[0] || Number(teacherResult.rows[0].approved) !== 1) {
                return res.status(403).json({ message: "Your teacher account is not approved." });
            }

            const result = await pool.query(`
                SELECT class_name, day_of_week, period_number,
                       TO_CHAR(start_time, 'HH24:MI') AS start_time,
                       TO_CHAR(end_time, 'HH24:MI') AS end_time,
                       subject
                FROM timetable WHERE teacher_id = $1
                ORDER BY CASE day_of_week
                    WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2
                    WHEN 'Wednesday' THEN 3 WHEN 'Thursday' THEN 4
                    WHEN 'Friday' THEN 5
                END, period_number
            `, [req.session.teacherId]);

            res.json(result.rows);
        } catch (error) {
            console.error("Teacher timetable:", error);
            res.status(500).json({ message: "Unable to load your timetable." });
        }
    });
};
