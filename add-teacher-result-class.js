const fs = require("fs");

const pageFile = "teacher-results.html";
const serverFile = "server-postgres.js";

let page = fs.readFileSync(pageFile, "utf8");
let server = fs.readFileSync(serverFile, "utf8");

// Backup existing files
fs.copyFileSync(pageFile, pageFile + ".before-class-selection");
fs.copyFileSync(serverFile, serverFile + ".before-class-selection");

// 1. Add class dropdown to the results form
const studentField = `            <div class="form-group">
                <label for="studentNumber">Student Number *</label>
                <input
                    type="text"
                    id="studentNumber"
                    placeholder="Enter student number"
                    required
                >
            </div>`;

const classField = studentField + `

            <div class="form-group">
                <label for="resultClass">Select Class *</label>
                <select id="resultClass" required>
                    <option value="">Loading assigned classes...</option>
                </select>
            </div>`;

if (!page.includes(studentField)) {
    console.log("Student field not found. No page changes made.");
    process.exit(1);
}

page = page.replace(studentField, classField);

// 2. Add class loading to loadTeacher()
const teacherInfoCode = `        teacherInfo.textContent =
            "Teacher: " + teacher.full_name +
            " | " + teacher.email;`;

const teacherInfoReplacement = teacherInfoCode + `

        const classSelect = document.getElementById("resultClass");
        const assignedClasses = String(teacher.classes || "")
            .split(",")
            .concat(
                teacher.assigned_class ? [teacher.assigned_class] : []
            )
            .map(value => value.trim())
            .map(value => value.replace(
                /^Form\\s*([1-4])\\s*([A-D])$/i,
                "Form $1$2"
            ))
            .filter(value => /^Form [1-4][A-D]$/.test(value));

        const uniqueClasses = [...new Set(assignedClasses)];

        classSelect.innerHTML = '<option value="">Select Class</option>';

        uniqueClasses.sort().forEach(className => {
            const option = document.createElement("option");
            option.value = className;
            option.textContent = className;
            classSelect.appendChild(option);
        });

        if (!uniqueClasses.length) {
            classSelect.innerHTML =
                '<option value="">No valid assigned classes</option>';
        }`;

if (!page.includes(teacherInfoCode)) {
    console.log("Teacher information code not found. No changes made.");
    process.exit(1);
}

page = page.replace(teacherInfoCode, teacherInfoReplacement);

// 3. Include selected class in submitted data
const oldData = `        studentNumber: document.getElementById("studentNumber").value.trim(),
        subject: document.getElementById("subject").value.trim(),`;

const newData = `        studentNumber: document.getElementById("studentNumber").value.trim(),
        className: document.getElementById("resultClass").value,
        subject: document.getElementById("subject").value.trim(),`;

if (!page.includes(oldData)) {
    console.log("Result submission data not found. No changes made.");
    process.exit(1);
}

page = page.replace(oldData, newData);

// 4. Add className to backend request validation
const oldDestructure = `        studentNumber, subject, term, year,
        score, grade, remarks
    } = req.body;`;

const newDestructure = `        studentNumber, className, subject, term, year,
        score, grade, remarks
    } = req.body;`;

if (!server.includes(oldDestructure)) {
    console.log("Backend request fields not found. No changes made.");
    process.exit(1);
}

server = server.replace(oldDestructure, newDestructure);

// 5. Require selected class
const oldRequired = `        !studentNumber?.trim() || !subject?.trim() ||
        !term || !year || score === undefined || !grade`;

const newRequired = `        !studentNumber?.trim() || !className?.trim() ||
        !subject?.trim() || !term || !year ||
        score === undefined || !grade`;

if (!server.includes(oldRequired)) {
    console.log("Backend required-field validation not found. No changes made.");
    process.exit(1);
}

server = server.replace(oldRequired, newRequired);

// 6. Replace student lookup and class authorization
const oldStudentBlock = `        const studentResult = await pool.query(
            \`SELECT id, class_name
             FROM students
             WHERE student_number = $1\`,
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
        }`;

const newStudentBlock = `        const normalizeClass = value =>
            String(value || "")
                .trim()
                .replace(/^Form\\s*([1-4])\\s*([A-D])$/i, "Form $1$2")
                .toLowerCase();

        const selectedClass = normalizeClass(className);

        if (!/^form [1-4][a-d]$/.test(selectedClass)) {
            return res.status(400).json({
                message: "Please select a valid class."
            });
        }

        const assignedClasses = String(teacher.classes || "")
            .split(",")
            .concat(
                teacher.assigned_class ? [teacher.assigned_class] : []
            )
            .map(normalizeClass)
            .filter(Boolean);

        if (!assignedClasses.includes(selectedClass)) {
            return res.status(403).json({
                message: "You are not assigned to the selected class."
            });
        }

        const studentResult = await pool.query(
            \`SELECT id, class_name
             FROM students
             WHERE student_number = $1
               AND LOWER(TRIM(class_name)) = $2\`,
            [studentNumber.trim(), selectedClass]
        );

        const student = studentResult.rows[0];

        if (!student) {
            return res.status(404).json({
                message: "Student not found in the selected class. Check the student number and class."
            });
        }`;

if (!server.includes(oldStudentBlock)) {
    console.log("Student authorization block not found. No changes made.");
    process.exit(1);
}

server = server.replace(oldStudentBlock, newStudentBlock);

// Save both files
fs.writeFileSync(pageFile, page);
fs.writeFileSync(serverFile, server);

console.log("Teacher result class selection installed successfully.");
console.log("Backups created for both files.");
