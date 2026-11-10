
const message = document.getElementById("message");
const studentGroups = document.getElementById("studentGroups");
const classSummary = document.getElementById("classSummary");

let allStudents = [];

function showMessage(text, type = "success") {
    message.textContent = text;
    message.className = type;
}

async function api(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            ...(options.body ? {
                "Content-Type": "application/json"
            } : {}),
            ...(options.headers || {})
        }
    });

    let data = {};

    try {
        data = await response.json();
    } catch (error) {
        data = {};
    }

    if (response.status === 401) {
        location.href = "admin-login.html";
        throw new Error("Administrator login required.");
    }

    if (!response.ok) {
        throw new Error(data.message || "Request failed.");
    }

    return data;
}

async function checkAdmin() {
    try {
        const admin = await api("/api/admin/me");
        return Boolean(admin.id);
    } catch (error) {
        return false;
    }
}

function normaliseClass(value) {
    return String(value || "Unassigned")
        .trim()
        .replace(/\s+/g, " ");
}

function classSortValue(className) {
    const match = className.match(/Form\s*(\d+)\s*([A-Z])?/i);

    if (!match) return 9999;

    const form = Number(match[1]);
    const stream = match[2]
        ? match[2].toUpperCase().charCodeAt(0) - 65
        : 0;

    return form * 100 + stream;
}

function sortClasses(classes) {
    return classes.sort((a, b) =>
        classSortValue(a) - classSortValue(b) ||
        a.localeCompare(b)
    );
}

function makeCell(row, value, className = "") {
    const cell = row.insertCell();
    cell.textContent = value ?? "";

    if (className) {
        cell.className = className;
    }

    return cell;
}

function renderSummary(students) {
    classSummary.replaceChildren();

    const counts = {};

    students.forEach(student => {
        const className = normaliseClass(student.class_name);
        counts[className] = (counts[className] || 0) + 1;
    });

    const classes = sortClasses(Object.keys(counts));

    if (!classes.length) {
        classSummary.innerHTML =
            '<div class="empty-state">No class records available.</div>';
        return;
    }

    classes.forEach(className => {
        const card = document.createElement("div");
        card.className = "summary-card";

        const label = document.createElement("div");
        label.className = "class-label";
        label.textContent = className;

        const number = document.createElement("strong");
        number.textContent = counts[className];

        const small = document.createElement("small");
        small.textContent =
            counts[className] === 1 ? "Student" : "Students";

        card.append(label, number, small);
        classSummary.appendChild(card);
    });
}

function renderStudents(students) {
    studentGroups.replaceChildren();

    if (!students.length) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.textContent =
            "No students found. Try another student number or class.";
        studentGroups.appendChild(empty);
        return;
    }

    const grouped = {};

    students.forEach(student => {
        const className = normaliseClass(student.class_name);

        if (!grouped[className]) {
            grouped[className] = [];
        }

        grouped[className].push(student);
    });

    const classes = sortClasses(Object.keys(grouped));

    classes.forEach(className => {
        const section = document.createElement("section");
        section.className = "class-section";

        const heading = document.createElement("div");
        heading.className = "class-heading";

        const title = document.createElement("h3");
        title.textContent = className;

        const count = document.createElement("span");
        count.className = "class-count";
        count.textContent =
            grouped[className].length + " STUDENT" +
            (grouped[className].length === 1 ? "" : "S");

        heading.append(title, count);

        const wrap = document.createElement("div");
        wrap.className = "table-wrap";

        const table = document.createElement("table");

        const thead = document.createElement("thead");
        const headerRow = document.createElement("tr");

        [
            "Student",
            "Student Number",
            "Email Address",
            "Results",
            "Actions"
        ].forEach(text => {
            const th = document.createElement("th");
            th.textContent = text;
            headerRow.appendChild(th);
        });

        thead.appendChild(headerRow);

        const tbody = document.createElement("tbody");

        grouped[className].sort((a, b) =>
            String(a.student_number).localeCompare(
                String(b.student_number),
                undefined,
                { numeric: true }
            )
        );

        grouped[className].forEach(student => {
            const row = document.createElement("tr");

            makeCell(row, student.full_name, "student-name");
            makeCell(row, student.student_number, "student-number");
            makeCell(row, student.email);

            const resultCell = row.insertCell();
            const resultBadge = document.createElement("span");
            resultBadge.className = "result-badge";
            resultBadge.textContent =
                Number(student.results_count || 0) + " results";
            resultCell.appendChild(resultBadge);

            const actionCell = row.insertCell();
            const actions = document.createElement("div");
            actions.className = "actions";

            const editButton = document.createElement("button");
            editButton.type = "button";
            editButton.className = "edit-button";
            editButton.textContent = "Edit";
            editButton.addEventListener("click", () => editStudent(student));

            const deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.className = "delete-button";
            deleteButton.textContent = "Delete";
            deleteButton.addEventListener(
                "click",
                () => deleteStudent(student)
            );

            actions.append(editButton, deleteButton);
            actionCell.appendChild(actions);

            tbody.appendChild(row);
        });

        table.append(thead, tbody);
        wrap.appendChild(table);
        section.append(heading, wrap);

        studentGroups.appendChild(section);
    });
}

function applyFilters() {
    const number = document.getElementById("searchNumber")
        .value.trim().toLowerCase();

    const selectedClass = document.getElementById("filterClass")
        .value.trim().toLowerCase();

    const filtered = allStudents.filter(student => {
        const studentNumber = String(student.student_number || "")
            .toLowerCase();

        const className = normaliseClass(student.class_name)
            .toLowerCase();

        const numberMatches =
            !number || studentNumber.includes(number);

        const classMatches =
            !selectedClass || className === selectedClass;

        return numberMatches && classMatches;
    });

    renderStudents(filtered);
}

async function loadStudents() {
    studentGroups.innerHTML =
        '<div class="loading">Loading student records...</div>';

    try {
        /*
         * Fetch all records so filtering is limited to
         * Student Number and Class on this page.
         */
        const students = await api("/api/admin/students");

        allStudents = Array.isArray(students) ? students : [];

        document.getElementById("totalStudents").textContent =
            allStudents.length + " STUDENT RECORD" +
            (allStudents.length === 1 ? "" : "S");

        renderSummary(allStudents);
        applyFilters();

    } catch (error) {
        showMessage(error.message, "error");

        studentGroups.innerHTML =
            '<div class="empty-state">Unable to load student records. Please refresh the page.</div>';

        classSummary.replaceChildren();
    }
}

async function deleteStudent(student) {
    const confirmed = confirm(
        "Are you sure you want to delete " + student.full_name +
        "?\n\nTheir academic results and password-reset records may also be deleted. This action cannot be undone."
    );

    if (!confirmed) return;

    try {
        const result = await api(
            "/api/admin/students/" + student.id,
            { method: "DELETE" }
        );

        showMessage(result.message || "Student deleted successfully.");
        await loadStudents();

    } catch (error) {
        showMessage(error.message, "error");
        alert("Delete failed: " + error.message);
    }
}

async function editStudent(student) {
    const full_name = prompt(
        "Student full name:",
        student.full_name
    );

    if (full_name === null) return;

    const student_number = prompt(
        "Student number:",
        student.student_number
    );

    if (student_number === null) return;

    const class_name = prompt(
        "Class (e.g. Form 2C):",
        normaliseClass(student.class_name)
    );

    if (class_name === null) return;

    const email = prompt(
        "Email address:",
        student.email
    );

    if (email === null) return;

    if (!full_name.trim() ||
        !student_number.trim() ||
        !class_name.trim() ||
        !email.trim()) {
        showMessage("All student fields are required.", "error");
        return;
    }

    try {
        const result = await api(
            "/api/admin/students/" + student.id,
            {
                method: "PATCH",
                body: JSON.stringify({
                    full_name: full_name.trim(),
                    student_number: student_number.trim(),
                    class_name: normaliseClass(class_name),
                    email: email.trim()
                })
            }
        );

        showMessage(result.message || "Student updated successfully.");
        await loadStudents();

    } catch (error) {
        showMessage(error.message, "error");
    }
}

document.getElementById("studentForm")
    .addEventListener("submit", async event => {
        event.preventDefault();

        const button = document.getElementById("registerButton");

        button.disabled = true;
        button.textContent = "Registering...";

        const payload = {
            full_name: document.getElementById("full_name")
                .value.trim(),

            student_number: document.getElementById("student_number")
                .value.trim(),

            class_name: document.getElementById("class_name")
                .value,

            email: document.getElementById("email")
                .value.trim(),

            password: document.getElementById("password").value
        };

        try {
            const result = await api("/api/admin/students", {
                method: "POST",
                body: JSON.stringify(payload)
            });

            showMessage(
                result.message || "Student registered successfully."
            );

            event.target.reset();
            await loadStudents();

        } catch (error) {
            showMessage(error.message, "error");

        } finally {
            button.disabled = false;
            button.textContent = "Register Student";
        }
    });

document.getElementById("searchButton")
    .addEventListener("click", applyFilters);

document.getElementById("refreshButton")
    .addEventListener("click", () => {
        document.getElementById("searchNumber").value = "";
        document.getElementById("filterClass").value = "";
        applyFilters();
    });

document.getElementById("searchNumber")
    .addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            applyFilters();
        }
    });

document.getElementById("filterClass")
    .addEventListener("change", applyFilters);

document.getElementById("logoutButton")
    .addEventListener("click", async () => {
        try {
            await api("/api/admin/logout", { method: "POST" });
            location.href = "admin-login.html";
        } catch (error) {
            showMessage(error.message, "error");
        }
    });

(async () => {
    if (await checkAdmin()) {
        await loadStudents();
    } else {
        location.href = "admin-login.html";
    }
})();
