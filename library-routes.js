const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const multer = require("multer");

module.exports = function registerLibraryRoutes(app, { pool, requireAdmin }) {
  const uploadDir = path.resolve(__dirname, "..", "private-library-uploads");

  fs.mkdirSync(uploadDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(uploadDir, 0o700);

  const allowedTypes = {
    "application/pdf": ".pdf",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.ms-powerpoint": ".ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "text/plain": ".txt"
  };

  const storage = multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      cb(null, crypto.randomUUID() + allowedTypes[file.mimetype]);
    }
  });

  const upload = multer({
    storage,
    limits: { fileSize: 15 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => {
      if (!allowedTypes[file.mimetype]) {
        return cb(new Error("Only PDF, Word, PowerPoint, Excel and TXT files are allowed."));
      }
      cb(null, true);
    }
  });

  function handleUpload(req, res, next) {
    upload.single("file")(req, res, error => {
      if (error) {
        return res.status(400).json({ message: error.message });
      }
      next();
    });
  }

  function normalize(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function teacherCanAccess(teacher, className, subjectName) {
    const classes = String(teacher.classes || "").split(",").map(normalize);
    const subjects = String(teacher.subjects || "").split(",").map(normalize);

    return classes.includes(normalize(className)) &&
      subjects.includes(normalize(subjectName));
  }

  function safeOriginalName(name) {
    return path.basename(String(name || "document"))
      .replace(/[\x00-\x1f\x7f]/g, "")
      .slice(0, 200);
  }

  function deleteFile(fileName) {
    if (!/^[a-f0-9-]{36}\.(pdf|doc|docx|ppt|pptx|xls|xlsx|txt)$/i.test(fileName || "")) {
      return;
    }

    const filePath = path.join(uploadDir, fileName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  async function requireStudent(req, res, next) {
    if (!req.session.studentId) {
      return res.status(401).json({ message: "Student login required." });
    }

    try {
      const result = await pool.query(
        "SELECT id, full_name, class_name FROM students WHERE id = $1",
        [req.session.studentId]
      );

      if (!result.rows.length) {
        return res.status(401).json({ message: "Student account not found." });
      }

      req.libraryStudent = result.rows[0];
      next();
    } catch (error) {
      console.error("Library student verification:", error);
      res.status(500).json({ message: "Unable to verify student account." });
    }
  }

  async function requireTeacher(req, res, next) {
    if (!req.session.teacherId) {
      return res.status(401).json({ message: "Teacher login required." });
    }

    try {
      const result = await pool.query(
        "SELECT id, full_name, subjects, classes, approved FROM teachers WHERE id = $1",
        [req.session.teacherId]
      );

      const teacher = result.rows[0];

      if (!teacher || Number(teacher.approved) !== 1) {
        return res.status(403).json({ message: "Approved teacher account required." });
      }

      req.libraryTeacher = teacher;
      next();
    } catch (error) {
      console.error("Library teacher verification:", error);
      res.status(500).json({ message: "Unable to verify teacher account." });
    }
  }

  // STUDENT: Browse materials for their class
  app.get("/api/library/resources", requireStudent, async (req, res) => {
    try {
      const { search = "", subject = "", category = "" } = req.query;

      const result = await pool.query(
        `SELECT id, title, description, class_name, subject_name,
                category, original_file_name, file_size, created_at
         FROM library_resources
         WHERE LOWER(class_name) = LOWER($1)
           AND ($2 = '' OR LOWER(subject_name) = LOWER($2))
           AND ($3 = '' OR category = $3)
           AND ($4 = '' OR title ILIKE '%' || $4 || '%'
                OR description ILIKE '%' || $4 || '%')
         ORDER BY created_at DESC`,
        [
          req.libraryStudent.class_name,
          String(subject).slice(0, 100),
          String(category).slice(0, 30),
          String(search).slice(0, 100)
        ]
      );

      res.json({ resources: result.rows });
    } catch (error) {
      console.error("Library browse error:", error);
      res.status(500).json({ message: "Unable to load library materials." });
    }
  });

  // TEACHER: View own materials
  app.get("/api/teacher/library/resources", requireTeacher, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, title, description, class_name, subject_name,
                category, original_file_name, file_size, created_at
         FROM library_resources
         WHERE teacher_id = $1
         ORDER BY created_at DESC`,
        [req.libraryTeacher.id]
      );

      res.json({ resources: result.rows });
    } catch (error) {
      console.error("Teacher library error:", error);
      res.status(500).json({ message: "Unable to load your materials." });
    }
  });

  // TEACHER: Upload material
  app.post(
    "/api/teacher/library/resources",
    requireTeacher,
    handleUpload,
    async (req, res) => {
      const file = req.file;

      if (!file) {
        return res.status(400).json({ message: "Please select a file." });
      }

      try {
        const { title, description, class_name, subject_name, category } = req.body;

        if (!title || !class_name || !subject_name) {
          deleteFile(file.filename);
          return res.status(400).json({
            message: "Title, class and subject are required."
          });
        }

        if (!teacherCanAccess(req.libraryTeacher, class_name, subject_name)) {
          deleteFile(file.filename);
          return res.status(403).json({
            message: "You are not assigned to that class and subject."
          });
        }

        const validCategories = ["notes", "revision", "past_paper", "textbook", "other"];
        const selectedCategory = validCategories.includes(category) ? category : "notes";

        const result = await pool.query(
          `INSERT INTO library_resources
           (teacher_id, title, description, class_name, subject_name,
            category, file_name, original_file_name, mime_type, file_size)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           RETURNING id`,
          [
            req.libraryTeacher.id,
            String(title).trim().slice(0, 150),
            String(description || "").trim().slice(0, 1000),
            String(class_name).trim().slice(0, 80),
            String(subject_name).trim().slice(0, 80),
            selectedCategory,
            file.filename,
            safeOriginalName(file.originalname),
            file.mimetype,
            file.size
          ]
        );

        res.status(201).json({
          message: "Material uploaded successfully.",
          id: result.rows[0].id
        });
      } catch (error) {
        deleteFile(file.filename);
        console.error("Library upload error:", error);
        res.status(500).json({ message: "Unable to upload material." });
      }
    }
  );

  // TEACHER: Delete own material
  app.delete("/api/teacher/library/resources/:id", requireTeacher, async (req, res) => {
    try {
      const result = await pool.query(
        `DELETE FROM library_resources
         WHERE id = $1 AND teacher_id = $2
         RETURNING file_name`,
        [req.params.id, req.libraryTeacher.id]
      );

      if (!result.rows.length) {
        return res.status(404).json({ message: "Material not found." });
      }

      deleteFile(result.rows[0].file_name);
      res.json({ message: "Material deleted successfully." });
    } catch (error) {
      console.error("Teacher library delete error:", error);
      res.status(500).json({ message: "Unable to delete material." });
    }
  });

  // ADMIN: View all materials
  app.get("/api/admin/library/resources", requireAdmin, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, title, description, class_name, subject_name,
                category, original_file_name, file_size, created_at
         FROM library_resources
         ORDER BY created_at DESC`
      );

      res.json({ resources: result.rows });
    } catch (error) {
      console.error("Admin library error:", error);
      res.status(500).json({ message: "Unable to load library materials." });
    }
  });

  // ADMIN: Delete any material
  app.delete("/api/admin/library/resources/:id", requireAdmin, async (req, res) => {
    try {
      const result = await pool.query(
        `DELETE FROM library_resources WHERE id = $1 RETURNING file_name`,
        [req.params.id]
      );

      if (!result.rows.length) {
        return res.status(404).json({ message: "Material not found." });
      }

      deleteFile(result.rows[0].file_name);
      res.json({ message: "Material deleted successfully." });
    } catch (error) {
      console.error("Admin library delete error:", error);
      res.status(500).json({ message: "Unable to delete material." });
    }
  });

  // AUTHENTICATED DOWNLOAD
  app.get("/api/library/resources/:id/download", async (req, res) => {
    try {
      let allowed = false;
      let resourceClass = null;
      let resourceSubject = null;
      let fileName = null;
      let originalName = null;
      let mimeType = null;

      const result = await pool.query(
        `SELECT id, teacher_id, class_name, subject_name,
                file_name, original_file_name, mime_type
         FROM library_resources WHERE id = $1`,
        [req.params.id]
      );

      const resource = result.rows[0];

      if (!resource) {
        return res.status(404).json({ message: "Material not found." });
      }

      if (req.session.adminId) {
        allowed = true;
      } else if (req.session.studentId) {
        const student = await pool.query(
          "SELECT class_name FROM students WHERE id = $1",
          [req.session.studentId]
        );
        allowed = !!student.rows[0] &&
          normalize(student.rows[0].class_name) === normalize(resource.class_name);
      } else if (req.session.teacherId) {
        const teacher = await pool.query(
          "SELECT id, classes, subjects, approved FROM teachers WHERE id = $1",
          [req.session.teacherId]
        );

        const t = teacher.rows[0];
        allowed = !!t &&
          Number(t.approved) === 1 &&
          (String(t.id) === String(resource.teacher_id) ||
           teacherCanAccess(t, resource.class_name, resource.subject_name));
      }

      if (!allowed) {
        return res.status(403).json({ message: "You are not allowed to download this file." });
      }

      fileName = resource.file_name;
      originalName = resource.original_file_name;
      mimeType = resource.mime_type;

      if (!/^[a-f0-9-]{36}\.(pdf|doc|docx|ppt|pptx|xls|xlsx|txt)$/i.test(fileName)) {
        return res.status(400).json({ message: "Invalid file." });
      }

      const filePath = path.join(uploadDir, fileName);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: "File is unavailable." });
      }

      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Type", mimeType);
      res.download(filePath, originalName);
    } catch (error) {
      console.error("Library download error:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Unable to download material." });
      }
    }
  });

  console.log("Digital Library routes registered.");
};
