const fs = require("fs");

const serverFile = "server-postgres.js";
const loginFile = "admin-login.html";
const dashboardFile = "admin-dashboard.html";

for (const file of [serverFile, loginFile, dashboardFile]) {
    if (!fs.existsSync(file)) {
        throw new Error("Missing file: " + file);
    }
}

let server = fs.readFileSync(serverFile, "utf8");
let login = fs.readFileSync(loginFile, "utf8");
let dashboard = fs.readFileSync(dashboardFile, "utf8");

if (server.includes("/api/admin/register") ||
    fs.existsSync("admin-register.html")) {
    throw new Error("Registration system may already be installed. No files changed.");
}

const marker = "// ADMINISTRATOR ACCOUNT REQUESTS";

if (!server.includes(marker)) {
    throw new Error("Could not find backend insertion point.");
}

if (!login.includes('href="admin-account-request.html"')) {
    throw new Error("Could not find administrator registration link.");
}

if (!dashboard.includes("</main>") ||
    !dashboard.includes("startDashboard();")) {
    throw new Error("Could not find dashboard insertion points.");
}

const routes = `
// =====================================
// ADMINISTRATOR REGISTRATION
// =====================================

app.get("/api/admin-registration/status", async (req, res) => {
    try {
        const result = await pool.query(
            "SELECT COUNT(*)::int AS total FROM admins"
        );

        res.json({
            registrationOpen: result.rows[0].total === 0
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Unable to check registration status."
        });
    }
});

app.post("/api/admin/register", async (req, res) => {
    const fullName = String(req.body.fullName || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const setupCode = String(req.body.setupCode || "");

    if (!fullName || !email || !password || !setupCode) {
        return res.status(400).json({
            message: "Please complete all fields."
        });
    }

    if (fullName.length > 120 ||
        email.length > 254 ||
        !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
        return res.status(400).json({
            message: "Please enter valid account details."
        });
    }

    if (password.length < 12 || password.length > 128) {
        return res.status(400).json({
            message: "Password must contain between 12 and 128 characters."
        });
    }

    const expectedCode = process.env.ADMIN_SETUP_CODE;

    if (!expectedCode ||
        setupCode.length !== expectedCode.length ||
        !crypto.timingSafeEqual(
            Buffer.from(setupCode),
            Buffer.from(expectedCode)
        )) {
        return res.status(403).json({
            message: "Invalid administrator setup code."
        });
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        await client.query(
            "SELECT pg_advisory_xact_lock(738291, 1)"
        );

        const count = await client.query(
            "SELECT COUNT(*)::int AS total FROM admins"
        );

        if (count.rows[0].total !== 0) {
            await client.query("ROLLBACK");
            return res.status(409).json({
                message: "An administrator account already exists."
            });
        }

        const existing = await client.query(\`
            SELECT email FROM students WHERE LOWER(email) = $1
            UNION ALL
            SELECT email FROM teachers WHERE LOWER(email) = $1
            UNION ALL
            SELECT email FROM accountants WHERE LOWER(email) = $1
            LIMIT 1
        \`, [email]);

        if (existing.rows.length) {
            await client.query("ROLLBACK");
            return res.status(409).json({
                message: "This email is already used by another account."
            });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        const result = await client.query(
            \`INSERT INTO admins (full_name, email, password)
             VALUES ($1, $2, $3)
             RETURNING id, full_name, email\`,
            [fullName, email, hashedPassword]
        );

        await client.query("COMMIT");

        const admin = result.rows[0];

        req.session.regenerate((error) => {
            if (error) {
                console.error(error);
                return res.status(500).json({
                    message: "Account created, but automatic login failed. Please sign in."
                });
            }

            req.session.adminId = admin.id;

            req.session.save((saveError) => {
                if (saveError) {
                    console.error(saveError);
                    return res.status(500).json({
                        message: "Account created, but automatic login failed. Please sign in."
                    });
                }

                res.status(201).json({
                    message: "Administrator account created successfully.",
                    redirect: "admin-dashboard.html"
                });
            });
        });
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        console.error(error);

        res.status(500).json({
            message: "Administrator registration failed."
        });
    } finally {
        client.release();
    }
});

// Delete only the currently signed-in administrator.
// Other school records are not deleted.

app.delete("/api/admin/delete-account", requireAdmin, async (req, res) => {
    const password = String(req.body.password || "");
    const confirmation = String(req.body.confirmation || "");

    if (!password || confirmation !== "DELETE") {
        return res.status(400).json({
            message: "Enter your password and type DELETE to confirm."
        });
    }

    try {
        const result = await pool.query(
            "SELECT password FROM admins WHERE id = $1",
            [req.session.adminId]
        );

        if (!result.rows[0] ||
            !(await bcrypt.compare(password, result.rows[0].password))) {
            return res.status(401).json({
                message: "Incorrect administrator password."
            });
        }

        await pool.query(
            "DELETE FROM admins WHERE id = $1",
            [req.session.adminId]
        );

        req.session.destroy((error) => {
            if (error) {
                console.error(error);
                return res.status(500).json({
                    message: "Account deleted. Please close this browser session."
                });
            }

            res.clearCookie("connect.sid");
            res.json({
                message: "Administrator account deleted.",
                redirect: "admin-register.html"
            });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: "Unable to delete administrator account."
        });
    }
});

`;

server = server.replace(marker, routes + "\n" + marker);

login = login.replace(
    'href="admin-account-request.html"',
    'href="admin-register.html"'
);

login = login.replace(
    "Request an Administrator Account",
    "Register as Administrator"
);

const accountSection = `
<section class="card">
    <h2>Administrator Account</h2>
    <p>Signed in as <strong id="accountAdminName">Administrator</strong>.</p>
    <p>Deleting your administrator account does not delete students,
       teachers, academic results or announcements.</p>

    <label for="deleteAdminPassword">Confirm your password</label>
    <input id="deleteAdminPassword" type="password"
           autocomplete="current-password"
           style="display:block;width:100%;max-width:400px;padding:12px;margin:10px 0;">

    <label for="deleteAdminConfirmation">Type DELETE to confirm</label>
    <input id="deleteAdminConfirmation" type="text"
           style="display:block;width:100%;max-width:400px;padding:12px;margin:10px 0;">

    <button type="button" onclick="deleteMyAdminAccount()"
            style="background:#a83232;color:white;border:0;padding:12px 18px;border-radius:6px;cursor:pointer;">
        Delete My Administrator Account
    </button>

    <p id="deleteAdminMessage" role="status"></p>
</section>
`;

dashboard = dashboard.replace(
    "</main>",
    accountSection + "\n</main>"
);

dashboard = dashboard.replace(
    'document.getElementById("adminName").textContent = admin.full_name;',
    'document.getElementById("adminName").textContent = admin.full_name;\n        document.getElementById("accountAdminName").textContent = admin.full_name;'
);

const deleteFunction = `
async function deleteMyAdminAccount() {
    const password = document.getElementById("deleteAdminPassword").value;
    const confirmation = document.getElementById("deleteAdminConfirmation").value;
    const message = document.getElementById("deleteAdminMessage");

    if (!password || confirmation !== "DELETE") {
        message.textContent = "Enter your password and type DELETE.";
        return;
    }

    if (!confirm("Are you sure you want to delete your administrator account?")) {
        return;
    }

    message.textContent = "Deleting account...";

    try {
        const response = await fetch("/api/admin/delete-account", {
            method: "DELETE",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({password, confirmation})
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || "Unable to delete account.");
        }

        alert(result.message);
        location.href = result.redirect;
    } catch (error) {
        message.textContent = error.message;
    }
}

`;

dashboard = dashboard.replace(
    "startDashboard();",
    deleteFunction + "\nstartDashboard();"
);

const registerPage = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Administrator Registration | Monze Day Secondary School</title>
<style>
*{box-sizing:border-box}
body{margin:0;font-family:Arial,sans-serif;background:#f3f6fb;color:#26364b;min-height:100vh;display:grid;place-items:center;padding:20px}
.card{background:white;width:100%;max-width:460px;padding:32px;border-radius:14px;box-shadow:0 8px 30px #102b5018;border-top:5px solid #c9a34a}
h1{color:#102b50;margin-top:0}
p{color:#718096;line-height:1.5}
label{display:block;margin-top:16px;font-weight:bold;color:#26364b}
input{width:100%;padding:13px;margin-top:7px;border:1px solid #ccd5e0;border-radius:7px;font-size:15px}
button{width:100%;margin-top:22px;padding:14px;background:#102b50;color:white;border:0;border-radius:7px;font-weight:bold;font-size:16px;cursor:pointer}
button:disabled{opacity:.5}
a{display:block;text-align:center;margin-top:20px;color:#102b50;text-decoration:none}
#message{margin-top:16px}
</style>
</head>
<body>
<main class="card">
<h1>Administrator Registration</h1>
<p>Create the school's administrator account. Only one administrator account can exist at a time.</p>
<p id="availability">Checking registration availability...</p>

<form id="registerForm">
<label for="fullName">Full Name</label>
<input id="fullName" maxlength="120" required autocomplete="name">

<label for="email">Email Address</label>
<input id="email" type="email" maxlength="254" required autocomplete="email">

<label for="password">Password</label>
<input id="password" type="password" minlength="12" maxlength="128" required autocomplete="new-password">

<label for="confirmPassword">Confirm Password</label>
<input id="confirmPassword" type="password" minlength="12" maxlength="128" required autocomplete="new-password">

<label for="setupCode">Private Administrator Setup Code</label>
<input id="setupCode" type="password" required autocomplete="off">

<button id="submitButton" type="submit" disabled>Create Administrator Account</button>
</form>

<p id="message" role="status"></p>
<a href="admin-login.html">Back to Administrator Login</a>
</main>

<script>
const form = document.getElementById("registerForm");
const button = document.getElementById("submitButton");
const message = document.getElementById("message");

async function checkAvailability() {
    try {
        const response = await fetch("/api/admin-registration/status");
        const result = await response.json();

        if (!response.ok) throw new Error("Unable to check registration.");

        if (result.registrationOpen) {
            document.getElementById("availability").textContent =
                "Registration is available.";
            button.disabled = false;
        } else {
            document.getElementById("availability").textContent =
                "Registration is closed because an administrator account already exists.";
            message.textContent = "Contact the school through its authorized account recovery process.";
        }
    } catch (error) {
        document.getElementById("availability").textContent = error.message;
    }
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    if (password !== confirmPassword) {
        message.textContent = "Passwords do not match.";
        return;
    }

    button.disabled = true;
    message.textContent = "Creating administrator account...";

    try {
        const response = await fetch("/api/admin/register", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                fullName: document.getElementById("fullName").value,
                email: document.getElementById("email").value,
                password,
                setupCode: document.getElementById("setupCode").value
            })
        });

        const result = await response.json();

        if (!response.ok) throw new Error(result.message || "Registration failed.");

        message.textContent = result.message;
        location.href = result.redirect;
    } catch (error) {
        message.textContent = error.message;
        button.disabled = false;
    }
});

checkAvailability();
</script>
</body>
</html>
`;

fs.writeFileSync(serverFile, server);
fs.writeFileSync(loginFile, login);
fs.writeFileSync(dashboardFile, dashboard);
fs.writeFileSync("admin-register.html", registerPage);

console.log("Administrator registration system installed.");
console.log("Existing administrator account was NOT deleted.");
console.log("Existing school records were NOT deleted.");
