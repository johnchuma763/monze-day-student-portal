const fs = require("fs");

const routesFile = "attendance-routes.js";
const dashboardFile = "teacher-dashboard.html";

let routes = fs.readFileSync(routesFile, "utf8");
let dashboard = fs.readFileSync(dashboardFile, "utf8");

if (routes.includes("/api/teacher/attendance/history")) {
    console.log("Attendance History API already exists.");
} else {
    const marker = '    // STUDENT: View personal attendance history and summary.';

    const newRoutes = `
    // TEACHER: View attendance sessions recorded by this teacher.
    app.get("/api/teacher/attendance/history", requireTeacher, async (req, res) => {
        try {
            const result = await pool.query(
                \`SELECT s.id, s.class_name, s.attendance_date,
                        COUNT(r.id)::int AS total_students,
                        COUNT(r.id) FILTER (WHERE r.status = 'Present')::int AS present,
                        COUNT(r.id) FILTER (WHERE r.status = 'Absent')::int AS absent,
                        COUNT(r.id) FILTER (WHERE r.status = 'Late')::int AS late
                 FROM attendance_sessions s
                 LEFT JOIN attendance_records r ON r.session_id = s.id
                 WHERE s.teacher_id = $1
                 GROUP BY s.id
                 ORDER BY s.attendance_date DESC, s.class_name\`,
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

            if (!/^[1-9]\\\\d*$/.test(id)) {
                return res.status(400).json({ message: "Invalid attendance record." });
            }

            const session = await pool.query(
                \`SELECT id, class_name, attendance_date
                 FROM attendance_sessions
                 WHERE id = $1 AND teacher_id = $2\`,
                [id, req.session.teacherId]
            );

            if (!session.rows.length) {
                return res.status(404).json({
                    message: "Attendance record not found."
                });
            }

            const records = await pool.query(
                \`SELECT st.student_number, st.full_name, r.status, r.marked_at
                 FROM attendance_records r
                 JOIN students st ON st.id = r.student_id
                 WHERE r.session_id = $1
                 ORDER BY st.full_name\`,
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

`;

    if (!routes.includes(marker)) {
        console.error("Could not find the attendance route insertion point. No changes made.");
        process.exit(1);
    }

    fs.writeFileSync(
        routesFile,
        routes.replace(marker, newRoutes + marker)
    );

    console.log("Teacher Attendance History API installed.");
}

if (!dashboard.includes('href="teacher-attendance-history.html"')) {
    const marker = '<a href="teacher-attendance.html">';

    if (!dashboard.includes(marker)) {
        console.error("Could not find the teacher attendance menu. API was installed, but menu was not changed.");
        process.exit(1);
    }

    dashboard = dashboard.replace(
        marker,
        '<a href="teacher-attendance-history.html">\\n        📋 Attendance History\\n    </a>\\n    ' + marker
    );

    fs.writeFileSync(dashboardFile, dashboard);
    console.log("Attendance History menu added.");
} else {
    console.log("Attendance History menu already exists.");
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Attendance History | Monze Day Secondary School</title>
<style>
:root{--navy:#102b50;--dark:#091d38;--gold:#d9ad45;--bg:#f3f6fa}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);font-family:Arial,sans-serif;color:#243247}
header{background:var(--navy);color:white;padding:23px 18px;border-bottom:4px solid var(--gold)}
header h2{margin:0 0 7px;font-size:21px}
header p{margin:0;color:#e8d9ad;font-size:13px}
main{max-width:1100px;margin:25px auto;padding:0 14px}
.card{background:white;border-radius:12px;padding:20px;margin-bottom:18px;box-shadow:0 3px 15px #102b5010}
h3{color:var(--navy);margin-top:0}
.filters{display:flex;gap:10px;flex-wrap:wrap}
input,select{padding:12px;border:1px solid #ccd5e0;border-radius:7px;min-width:150px;flex:1}
button{border:0;border-radius:7px;padding:10px 14px;background:var(--navy);color:white;cursor:pointer}
button.gold{background:var(--gold);color:#17263a}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.stat{background:#f5f7fa;border-left:4px solid var(--gold);padding:14px;border-radius:8px}
.stat strong{display:block;font-size:23px;color:var(--navy);margin-top:6px}
.table-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse;min-width:650px}
th,td{text-align:left;padding:13px;border-bottom:1px solid #e6ebf1;font-size:13px}
th{background:#f3f6fa;color:var(--navy)}
.badge{padding:5px 9px;border-radius:20px;font-weight:bold;font-size:12px}
.Present{background:#d9f5e5;color:#137344}
.Absent{background:#ffe0e0;color:#a32222}
.Late{background:#fff0c9;color:#8b5a00}
#status{font-size:13px;color:#58677a;margin-top:12px}
#details{display:none}
@media(max-width:600px){.stats{grid-template-columns:repeat(2,1fr)}header h2{font-size:18px}.card{padding:14px}}
</style>
</head>
<body>
<header>
<h2>MONZE DAY SECONDARY SCHOOL</h2>
<p>TEACHER PORTAL · ATTENDANCE HISTORY</p>
</header>
<main>
<div class="card">
<h3>Attendance History</h3>
<p>Review attendance records you have previously submitted.</p>
<div class="filters">
<select id="classFilter"><option value="">All my classes</option></select>
<input type="date" id="dateFilter">
<button class="gold" onclick="loadHistory()">Filter</button>
<button onclick="resetFilters()">Reset</button>
</div>
<p id="status">Loading attendance history...</p>
</div>

<div class="card">
<h3>Attendance Summary</h3>
<div class="stats">
<div class="stat">Total sessions<strong id="total">0</strong></div>
<div class="stat">Present<strong id="present">0</strong></div>
<div class="stat">Absent<strong id="absent">0</strong></div>
<div class="stat">Late<strong id="late">0</strong></div>
</div>
</div>

<div class="card">
<h3>Recorded Sessions</h3>
<div class="table-wrap">
<table>
<thead><tr><th>Date</th><th>Class</th><th>Students</th><th>Present</th><th>Absent</th><th>Late</th><th>Details</th></tr></thead>
<tbody id="sessions"><tr><td colspan="7">Loading...</td></tr></tbody>
</table>
</div>
</div>

<div class="card" id="details">
<h3 id="detailTitle">Attendance Details</h3>
<div class="table-wrap">
<table>
<thead><tr><th>Student number</th><th>Student name</th><th>Status</th><th>Marked at</th></tr></thead>
<tbody id="detailRows"></tbody>
</table>
</div>
<button onclick="document.getElementById('details').style.display='none'">Close details</button>
</div>

<p><a href="teacher-dashboard.html">← Back to Teacher Dashboard</a></p>
</main>

<script>
const $ = id => document.getElementById(id);
let allSessions = [];

async function api(url) {
    const response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
        location.href = "teacher-login.html";
        throw new Error("Please sign in again.");
    }
    if (!response.ok) throw new Error(data.message || "Request failed.");
    return data;
}

function dateText(value) {
    return String(value).slice(0, 10);
}

async function loadHistory() {
    $("status").textContent = "Loading attendance history...";
    try {
        const data = await api("/api/teacher/attendance/history");
        allSessions = data.sessions || [];

        const classes = [...new Set(allSessions.map(s => s.class_name))];
        const selected = $("classFilter").value;
        $("classFilter").innerHTML = '<option value="">All my classes</option>' +
            classes.map(c => '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>').join("");
        $("classFilter").value = selected;

        renderSessions();
        $("status").textContent = allSessions.length
            ? "Attendance history loaded successfully."
            : "You have not recorded any attendance sessions yet.";
    } catch (error) {
        $("status").textContent = error.message;
        $("sessions").innerHTML = '<tr><td colspan="7">Unable to load attendance history.</td></tr>';
    }
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
        "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
}

function renderSessions() {
    const cls = $("classFilter").value;
    const date = $("dateFilter").value;
    const rows = allSessions.filter(s =>
        (!cls || s.class_name === cls) &&
        (!date || dateText(s.attendance_date) === date)
    );

    $("total").textContent = rows.length;
    $("present").textContent = rows.reduce((n,s) => n + Number(s.present), 0);
    $("absent").textContent = rows.reduce((n,s) => n + Number(s.absent), 0);
    $("late").textContent = rows.reduce((n,s) => n + Number(s.late), 0);

    $("sessions").innerHTML = rows.length ? rows.map(s => \`
        <tr>
            <td>\${escapeHtml(dateText(s.attendance_date))}</td>
            <td>\${escapeHtml(s.class_name)}</td>
            <td>\${s.total_students}</td>
            <td>\${s.present}</td>
            <td>\${s.absent}</td>
            <td>\${s.late}</td>
            <td><button onclick="viewDetails('\${s.id}')">View</button></td>
        </tr>\`).join("") :
        '<tr><td colspan="7">No matching attendance sessions found.</td></tr>';
}

async function viewDetails(id) {
    $("details").style.display = "block";
    $("detailTitle").textContent = "Loading attendance details...";
    $("detailRows").innerHTML = "";
    try {
        const data = await api("/api/teacher/attendance/history/" + encodeURIComponent(id));
        $("detailTitle").textContent =
            data.session.class_name + " · " + dateText(data.session.attendance_date);

        $("detailRows").innerHTML = data.records.length ? data.records.map(r => \`
            <tr>
                <td>\${escapeHtml(r.student_number)}</td>
                <td>\${escapeHtml(r.full_name)}</td>
                <td><span class="badge \${escapeHtml(r.status)}">\${escapeHtml(r.status)}</span></td>
                <td>\${escapeHtml(r.marked_at ? new Date(r.marked_at).toLocaleTimeString() : "—")}</td>
            </tr>\`).join("") :
            '<tr><td colspan="4">No student records found.</td></tr>';
        $("details").scrollIntoView({behavior:"smooth"});
    } catch (error) {
        $("detailTitle").textContent = error.message;
    }
}

function resetFilters() {
    $("classFilter").value = "";
    $("dateFilter").value = "";
    renderSessions();
}

$("classFilter").addEventListener("change", renderSessions);
$("dateFilter").addEventListener("change", renderSessions);

loadHistory();
</script>
</body>
</html>`;

fs.writeFileSync("teacher-attendance-history.html", html);
console.log("Professional Teacher Attendance History page created.");
console.log("Existing attendance records and database were not changed.");
