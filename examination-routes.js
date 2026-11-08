module.exports = function (app, { pool, requireAdmin }) {
    function requireStudent(req, res, next) {
        if (!req.session.studentId) {
            return res.status(401).json({
                message: "Please log in as a student."
            });
        }
        next();
    }

    function normalizeClass(value) {
        const match = String(value || "").trim()
            .match(/^Form\s*([1-4])\s*([A-D])$/i);

        return match
            ? `Form ${match[1]}${match[2].toUpperCase()}`
            : "";
    }

    // ADMIN: View all examination entries
    app.get("/api/admin/examinations", requireAdmin, async (req, res) => {
        try {
            const result = await pool.query(`
                SELECT *
                FROM examination_timetable
                ORDER BY exam_date ASC, start_time ASC
            `);

            res.json(result.rows);
        } catch (error) {
            console.error("Examination list error:", error);
            res.status(500).json({
                message: "Unable to load examinations."
            });
        }
    });

    // ADMIN: Add an examination
    app.post("/api/admin/examinations", requireAdmin, async (req, res) => {
        try {
            const {
                class_name,
                subject,
                exam_date,
                start_time,
                end_time,
                venue,
                instructions
            } = req.body;

            const normalizedClass = normalizeClass(class_name);

            if (
                !normalizedClass ||
                !subject?.trim() ||
                !exam_date ||
                !start_time ||
                !end_time ||
                !venue?.trim()
            ) {
                return res.status(400).json({
                    message: "Please complete all required fields."
                });
            }

            if (end_time <= start_time) {
                return res.status(400).json({
                    message: "End time must be later than start time."
                });
            }

            const result = await pool.query(`
                INSERT INTO examination_timetable
                (class_name, subject, exam_date, start_time,
                 end_time, venue, instructions)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *
            `, [
                normalizedClass,
                subject.trim(),
                exam_date,
                start_time,
                end_time,
                venue.trim(),
                instructions || ""
            ]);

            res.status(201).json({
                message: "Examination added successfully.",
                examination: result.rows[0]
            });
        } catch (error) {
            console.error("Add examination error:", error);
            res.status(500).json({
                message: "Unable to add examination."
            });
        }
    });

    // ADMIN: Update an examination
    app.patch("/api/admin/examinations/:id", requireAdmin, async (req, res) => {
        try {
            const {
                class_name,
                subject,
                exam_date,
                start_time,
                end_time,
                venue,
                instructions
            } = req.body;

            const normalizedClass = normalizeClass(class_name);

            if (
                !normalizedClass ||
                !subject?.trim() ||
                !exam_date ||
                !start_time ||
                !end_time ||
                !venue?.trim()
            ) {
                return res.status(400).json({
                    message: "Please complete all required fields."
                });
            }

            if (end_time <= start_time) {
                return res.status(400).json({
                    message: "End time must be later than start time."
                });
            }

            const result = await pool.query(`
                UPDATE examination_timetable
                SET class_name = $1,
                    subject = $2,
                    exam_date = $3,
                    start_time = $4,
                    end_time = $5,
                    venue = $6,
                    instructions = $7,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $8
                RETURNING *
            `, [
                normalizedClass,
                subject.trim(),
                exam_date,
                start_time,
                end_time,
                venue.trim(),
                instructions || "",
                req.params.id
            ]);

            if (!result.rows.length) {
                return res.status(404).json({
                    message: "Examination not found."
                });
            }

            res.json({
                message: "Examination updated successfully.",
                examination: result.rows[0]
            });
        } catch (error) {
            console.error("Update examination error:", error);
            res.status(500).json({
                message: "Unable to update examination."
            });
        }
    });

    // ADMIN: Delete an examination
    app.delete("/api/admin/examinations/:id", requireAdmin, async (req, res) => {
        try {
            const result = await pool.query(`
                DELETE FROM examination_timetable
                WHERE id = $1
                RETURNING id
            `, [req.params.id]);

            if (!result.rows.length) {
                return res.status(404).json({
                    message: "Examination not found."
                });
            }

            res.json({
                message: "Examination deleted successfully."
            });
        } catch (error) {
            console.error("Delete examination error:", error);
            res.status(500).json({
                message: "Unable to delete examination."
            });
        }
    });

    // STUDENT: View examinations for the logged-in student's class
    app.get("/api/student/examinations", requireStudent, async (req, res) => {
        try {
            const student = await pool.query(`
                SELECT class_name
                FROM students
                WHERE id = $1
                LIMIT 1
            `, [req.session.studentId]);

            if (!student.rows.length) {
                return res.status(404).json({
                    message: "Student profile not found."
                });
            }

            const className = normalizeClass(student.rows[0].class_name);

            if (!className) {
                return res.status(400).json({
                    message: "Your class information is invalid."
                });
            }

            const result = await pool.query(`
                SELECT *
                FROM examination_timetable
                WHERE class_name = $1
                ORDER BY exam_date ASC, start_time ASC
            `, [className]);

            res.json(result.rows);
        } catch (error) {
            console.error("Student examinations error:", error);
            res.status(500).json({
                message: "Unable to load your examination timetable."
            });
        }
    });
};
