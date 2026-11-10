
const accountType = document.getElementById("accountType");
const studentFields = document.getElementById("studentFields");
const teacherFields = document.getElementById("teacherFields");
const studentNumber = document.getElementById("studentNumber");
const className = document.getElementById("className");
const subjects = document.getElementById("subjects");

const form = document.getElementById("accountForm");
const message = document.getElementById("message");
const createButton = document.getElementById("createButton");

let administratorVerified = false;

accountType.addEventListener("change", function () {
    const type = this.value;

    studentFields.classList.toggle("hidden", type !== "student");
    teacherFields.classList.toggle("hidden", type !== "teacher");

    studentNumber.required = type === "student";
    className.required = type === "student";
    subjects.required = false;
});

async function checkAdmin() {
    try {
        const response = await fetch("/api/admin/me", {
            credentials: "same-origin"
        });

        if (!response.ok) {
            location.replace("admin-login.html");
            return false;
        }

        administratorVerified = true;
        return true;

    } catch (error) {
        message.textContent = "Unable to verify administrator session.";
        message.className = "error";
        return false;
    }
}

form.addEventListener("submit", async function (event) {
    event.preventDefault();

    message.textContent = "";
    message.className = "";

    if (!administratorVerified) {
        message.textContent = "Administrator verification is required.";
        message.className = "error";
        return;
    }

    const type = accountType.value;
    const password = document.getElementById("password").value;
    const confirmPassword =
        document.getElementById("confirmPassword").value;

    if (password !== confirmPassword) {
        message.textContent = "Passwords do not match.";
        message.className = "error";
        return;
    }

    if (password.length < 10) {
        message.textContent =
            "Password must contain at least 10 characters.";
        message.className = "error";
        return;
    }

    if (type === "teacher" && !subjects.value.trim()) {
        message.textContent = "Please enter the teacher's subjects.";
        message.className = "error";
        return;
    }

    const accountData = {
        accountType: type,
        fullName: document.getElementById("fullName").value.trim(),
        email: document.getElementById("email").value.trim(),
        password: password
    };

    if (type === "student") {
        accountData.studentNumber = studentNumber.value.trim();
        accountData.className = className.value;
    }

    if (type === "teacher") {
        accountData.subjects = subjects.value.trim();
    }

    createButton.disabled = true;
    createButton.textContent = "Creating Account...";

    try {
        const response = await fetch("/api/admin/create-account", {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(accountData)
        });

        const result = await response.json();

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                administratorVerified = false;
                message.textContent =
                    "Your administrator session has expired. Please sign in again.";
            } else {
                message.textContent =
                    result.message || "Unable to create account.";
            }

            message.className = "error";
            return;
        }

        message.textContent = result.message;
        message.className = "success";

        form.reset();
        studentFields.classList.add("hidden");
        teacherFields.classList.add("hidden");
        studentNumber.required = false;
        className.required = false;
        subjects.required = false;

    } catch (error) {
        message.textContent =
            "Connection error. Please check that the server is running.";
        message.className = "error";

    } finally {
        createButton.disabled = false;
        createButton.textContent = "Create Account";
    }
});

checkAdmin();
