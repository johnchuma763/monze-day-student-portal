module.exports = function registerSupportRoutes(app, { pool, requireAdmin }) {

    const VALID_CATEGORIES = [
        "Academic Issue",
        "Account/Login Problem",
        "Technical Problem",
        "Teacher/Staff Concern",
        "General Enquiry",
        "Other"
    ];

    const VALID_STATUSES = [
        "Pending",
        "In Progress",
        "Resolved"
    ];

    const ready = (async () => {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS support_requests (
                id BIGSERIAL PRIMARY KEY,
                student_id BIGINT NOT NULL
                    REFERENCES students(id) ON DELETE CASCADE,
                category TEXT NOT NULL,
                subject TEXT NOT NULL,
                description TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'Pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS support_messages (
                id BIGSERIAL PRIMARY KEY,
                request_id BIGINT NOT NULL
                    REFERENCES support_requests(id) ON DELETE CASCADE,
                sender_type TEXT NOT NULL
                    CHECK (sender_type IN ('student', 'admin')),
                sender_id BIGINT NOT NULL,
                message TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_support_student
            ON support_requests(student_id, created_at DESC)
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_support_status
            ON support_requests(status, updated_at DESC)
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_support_messages_request
            ON support_messages(request_id, created_at)
        `);

        console.log("Student Support database ready.");
    })();

    async function ensureReady(req, res, next) {
        try {
            await ready;
            next();
        } catch (error) {
            console.error("Support database error:", error);
            res.status(500).json({
                message: "Student Support is temporarily unavailable."
            });
        }
    }

    async function requireStudent(req, res, next) {
        if (!req.session.studentId) {
            return res.status(401).json({
                message: "Student login required."
            });
        }

        try {
            const result = await pool.query(
                "SELECT id FROM students WHERE id = $1",
                [req.session.studentId]
            );

            if (!result.rows.length) {
                return res.status(401).json({
                    message: "Student account not found."
                });
            }

            next();
        } catch (error) {
            console.error("Support student verification:", error);
            res.status(500).json({
                message: "Unable to verify student account."
            });
        }
    }

    function validId(value) {
        return /^\d+$/.test(String(value || "")) &&
            Number(value) > 0;
    }

    // STUDENT: Submit a support request.
    app.post(
        "/api/support/requests",
        ensureReady,
        requireStudent,
        async (req, res) => {
            try {
                const category = String(req.body.category || "").trim();
                const subject = String(req.body.subject || "").trim();
                const description = String(req.body.description || "").trim();

                if (!VALID_CATEGORIES.includes(category)) {
                    return res.status(400).json({
                        message: "Select a valid support category."
                    });
                }

                if (subject.length < 3 || subject.length > 150) {
                    return res.status(400).json({
                        message: "Subject must contain 3 to 150 characters."
                    });
                }

                if (description.length < 10 || description.length > 5000) {
                    return res.status(400).json({
                        message: "Description must contain 10 to 5000 characters."
                    });
                }

                const result = await pool.query(`
                    INSERT INTO support_requests
                        (student_id, category, subject, description)
                    VALUES ($1, $2, $3, $4)
                    RETURNING *
                `, [
                    req.session.studentId,
                    category,
                    subject,
                    description
                ]);

                res.status(201).json({
                    message: "Your support request has been submitted.",
                    request: result.rows[0]
                });

            } catch (error) {
                console.error("Submit support request:", error);
                res.status(500).json({
                    message: "Unable to submit your request."
                });
            }
        }
    );

    // STUDENT: View their previous requests.
    app.get(
        "/api/support/requests",
        ensureReady,
        requireStudent,
        async (req, res) => {
            try {
                const result = await pool.query(`
                    SELECT
                        r.*,
                        (
                            SELECT COUNT(*)::int
                            FROM support_messages m
                            WHERE m.request_id = r.id
                        ) AS message_count
                    FROM support_requests r
                    WHERE r.student_id = $1
                    ORDER BY r.updated_at DESC, r.id DESC
                `, [req.session.studentId]);

                res.json({ requests: result.rows });

            } catch (error) {
                console.error("Load student support requests:", error);
                res.status(500).json({
                    message: "Unable to load your support requests."
                });
            }
        }
    );

    // STUDENT: Read a request and its conversation.
    app.get(
        "/api/support/requests/:id/messages",
        ensureReady,
        requireStudent,
        async (req, res) => {
            try {
                if (!validId(req.params.id)) {
                    return res.status(400).json({
                        message: "Invalid request number."
                    });
                }

                const request = await pool.query(`
                    SELECT *
                    FROM support_requests
                    WHERE id = $1 AND student_id = $2
                `, [req.params.id, req.session.studentId]);

                if (!request.rows.length) {
                    return res.status(404).json({
                        message: "Support request not found."
                    });
                }

                const messages = await pool.query(`
                    SELECT id, sender_type, message, created_at
                    FROM support_messages
                    WHERE request_id = $1
                    ORDER BY created_at ASC, id ASC
                `, [req.params.id]);

                res.json({
                    request: request.rows[0],
                    messages: messages.rows
                });

            } catch (error) {
                console.error("Load support conversation:", error);
                res.status(500).json({
                    message: "Unable to load this conversation."
                });
            }
        }
    );

    // STUDENT: Add a follow-up message to their request.
    app.post(
        "/api/support/requests/:id/messages",
        ensureReady,
        requireStudent,
        async (req, res) => {
            try {
                if (!validId(req.params.id)) {
                    return res.status(400).json({
                        message: "Invalid request number."
                    });
                }

                const message = String(req.body.message || "").trim();

                if (message.length < 2 || message.length > 3000) {
                    return res.status(400).json({
                        message: "Message must contain 2 to 3000 characters."
                    });
                }

                const request = await pool.query(`
                    SELECT id, status
                    FROM support_requests
                    WHERE id = $1 AND student_id = $2
                `, [req.params.id, req.session.studentId]);

                if (!request.rows.length) {
                    return res.status(404).json({
                        message: "Support request not found."
                    });
                }

                if (request.rows[0].status === "Resolved") {
                    return res.status(400).json({
                        message: "This request is resolved. Submit a new request if you need more help."
                    });
                }

                const result = await pool.query(`
                    INSERT INTO support_messages
                        (request_id, sender_type, sender_id, message)
                    VALUES ($1, 'student', $2, $3)
                    RETURNING *
                `, [
                    req.params.id,
                    req.session.studentId,
                    message
                ]);

                await pool.query(`
                    UPDATE support_requests
                    SET updated_at = CURRENT_TIMESTAMP
                    WHERE id = $1
                `, [req.params.id]);

                res.status(201).json({
                    message: "Your message has been sent.",
                    reply: result.rows[0]
                });

            } catch (error) {
                console.error("Student support reply:", error);
                res.status(500).json({
                    message: "Unable to send your message."
                });
            }
        }
    );

    // ADMIN: View and search all student support requests.
    app.get(
        "/api/admin/support",
        ensureReady,
        requireAdmin,
        async (req, res) => {
            try {
                const search = String(req.query.search || "").trim();
                const status = String(req.query.status || "").trim();

                if (status && !VALID_STATUSES.includes(status)) {
                    return res.status(400).json({
                        message: "Invalid support status."
                    });
                }

                const result = await pool.query(`
                    SELECT
                        r.*,
                        s.full_name,
                        s.student_number,
                        s.class_name,
                        s.email,
                        (
                            SELECT COUNT(*)::int
                            FROM support_messages m
                            WHERE m.request_id = r.id
                        ) AS message_count
                    FROM support_requests r
                    JOIN students s ON s.id = r.student_id
                    WHERE
                        ($1 = '' OR r.status = $1)
                        AND (
                            $2 = ''
                            OR s.full_name ILIKE '%' || $2 || '%'
                            OR s.student_number ILIKE '%' || $2 || '%'
                            OR r.subject ILIKE '%' || $2 || '%'
                        )
                    ORDER BY
                        CASE WHEN r.status = 'Pending' THEN 0
                             WHEN r.status = 'In Progress' THEN 1
                             ELSE 2 END,
                        r.updated_at DESC
                `, [status, search]);

                res.json({ requests: result.rows });

            } catch (error) {
                console.error("Admin support requests:", error);
                res.status(500).json({
                    message: "Unable to load support requests."
                });
            }
        }
    );

    // ADMIN: View a request and its complete conversation.
    app.get(
        "/api/admin/support/:id/messages",
        ensureReady,
        requireAdmin,
        async (req, res) => {
            try {
                if (!validId(req.params.id)) {
                    return res.status(400).json({
                        message: "Invalid request number."
                    });
                }

                const request = await pool.query(`
                    SELECT
                        r.*,
                        s.full_name,
                        s.student_number,
                        s.class_name,
                        s.email
                    FROM support_requests r
                    JOIN students s ON s.id = r.student_id
                    WHERE r.id = $1
                `, [req.params.id]);

                if (!request.rows.length) {
                    return res.status(404).json({
                        message: "Support request not found."
                    });
                }

                const messages = await pool.query(`
                    SELECT id, sender_type, message, created_at
                    FROM support_messages
                    WHERE request_id = $1
                    ORDER BY created_at ASC, id ASC
                `, [req.params.id]);

                res.json({
                    request: request.rows[0],
                    messages: messages.rows
                });

            } catch (error) {
                console.error("Admin support conversation:", error);
                res.status(500).json({
                    message: "Unable to load this conversation."
                });
            }
        }
    );

    // ADMIN: Reply to a student.
    app.post(
        "/api/admin/support/:id/reply",
        ensureReady,
        requireAdmin,
        async (req, res) => {
            try {
                if (!validId(req.params.id)) {
                    return res.status(400).json({
                        message: "Invalid request number."
                    });
                }

                const message = String(req.body.message || "").trim();

                if (message.length < 2 || message.length > 3000) {
                    return res.status(400).json({
                        message: "Reply must contain 2 to 3000 characters."
                    });
                }

                const request = await pool.query(
                    "SELECT id FROM support_requests WHERE id = $1",
                    [req.params.id]
                );

                if (!request.rows.length) {
                    return res.status(404).json({
                        message: "Support request not found."
                    });
                }

                const result = await pool.query(`
                    INSERT INTO support_messages
                        (request_id, sender_type, sender_id, message)
                    VALUES ($1, 'admin', $2, $3)
                    RETURNING *
                `, [
                    req.params.id,
                    req.session.adminId,
                    message
                ]);

                await pool.query(`
                    UPDATE support_requests
                    SET status = CASE
                        WHEN status = 'Pending' THEN 'In Progress'
                        ELSE status
                    END,
                    updated_at = CURRENT_TIMESTAMP
                    WHERE id = $1
                `, [req.params.id]);

                res.status(201).json({
                    message: "Your response has been sent.",
                    reply: result.rows[0]
                });

            } catch (error) {
                console.error("Admin support reply:", error);
                res.status(500).json({
                    message: "Unable to send your response."
                });
            }
        }
    );

    // ADMIN: Change request status.
    app.patch(
        "/api/admin/support/:id/status",
        ensureReady,
        requireAdmin,
        async (req, res) => {
            try {
                if (!validId(req.params.id)) {
                    return res.status(400).json({
                        message: "Invalid request number."
                    });
                }

                const status = String(req.body.status || "").trim();

                if (!VALID_STATUSES.includes(status)) {
                    return res.status(400).json({
                        message: "Select a valid status."
                    });
                }

                const result = await pool.query(`
                    UPDATE support_requests
                    SET status = $1,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $2
                    RETURNING *
                `, [status, req.params.id]);

                if (!result.rows.length) {
                    return res.status(404).json({
                        message: "Support request not found."
                    });
                }

                res.json({
                    message: "Request status updated.",
                    request: result.rows[0]
                });

            } catch (error) {
                console.error("Update support status:", error);
                res.status(500).json({
                    message: "Unable to update request status."
                });
            }
        }
    );
};
