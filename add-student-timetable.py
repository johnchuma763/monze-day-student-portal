from pathlib import Path
import shutil

file = Path("student-dashboard.html")
html = file.read_text()

if 'id="student-timetable"' in html:
    print("Student timetable section already exists. No changes made.")
    raise SystemExit

required = [
    '<button class="nav-item" onclick="showTab(\'subjects\',this)">',
    '<section class="page" id="attendance">',
    'function showTab(id,button){',
    'async function loadProfile(){',
    '</style>'
]

for item in required:
    if item not in html:
        print("Could not find:", item)
        print("No changes made.")
        raise SystemExit

shutil.copy2(file, "student-dashboard.html.backup-before-timetable")

# Add navigation button
html = html.replace(
    '<button class="nav-item" onclick="showTab(\'attendance\',this)">',
    '<button class="nav-item" onclick="showTab(\'student-timetable\',this)">📅 My Timetable</button>\n'
    '<button class="nav-item" onclick="showTab(\'attendance\',this)">',
    1
)

# Add timetable section
section = """
<section class="page" id="student-timetable">
    <div class="student-timetable-intro">
        <h2>📅 My Timetable</h2>
        <p>View your weekly lesson schedule, subjects and class periods.</p>
    </div>

    <div class="timetable-toolbar">
        <span>WEEKLY CLASS SCHEDULE</span>
        <button type="button" onclick="loadStudentTimetable()">↻ Refresh</button>
    </div>

    <div id="studentTimetableList" class="student-timetable-days">
        <p class="status">Loading your timetable...</p>
    </div>
</section>

"""

html = html.replace(
    '<section class="page" id="attendance">',
    section + '<section class="page" id="attendance">',
    1
)

# Add timetable styling
styles = """
/* STUDENT TIMETABLE */
.student-timetable-intro {
    background: linear-gradient(120deg,#102b50,#091d38);
    color: white;
    padding: 27px;
    border-radius: 16px;
    margin-bottom: 22px;
}
.student-timetable-intro h2 {
    margin: 0 0 9px;
    font-size: 25px;
}
.student-timetable-intro p {
    margin: 0;
    color: #dce6f2;
    line-height: 1.6;
}
.timetable-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 18px;
    flex-wrap: wrap;
}
.timetable-toolbar span {
    color: #102b50;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 1px;
}
.timetable-toolbar button {
    background: #102b50;
    color: white;
    border: 0;
    padding: 10px 16px;
    border-radius: 8px;
    font-weight: 700;
}
.student-timetable-days {
    display: grid;
    grid-template-columns: repeat(auto-fit,minmax(250px,1fr));
    gap: 17px;
}
.student-day-card {
    background: white;
    border: 1px solid #e4eaf1;
    border-radius: 14px;
    padding: 18px;
    box-shadow: 0 5px 18px rgba(16,43,80,.06);
}
.student-day-heading {
    color: #102b50;
    font-size: 18px;
    font-weight: 800;
    padding-bottom: 13px;
    border-bottom: 2px solid #d9ad45;
    margin-bottom: 13px;
}
.student-lesson {
    border: 1px solid #edf0f4;
    border-left: 4px solid #d9ad45;
    border-radius: 9px;
    padding: 12px;
    margin-bottom: 11px;
    background: #fafbfd;
}
.student-lesson strong {
    display: block;
    color: #102b50;
    font-size: 15px;
    margin-bottom: 7px;
}
.student-lesson small {
    color: #64748b;
    display: block;
    line-height: 1.6;
}
.student-timetable-empty {
    background: white;
    border-radius: 12px;
    padding: 25px;
    color: #64748b;
    text-align: center;
    border: 1px solid #e4eaf1;
}
"""

html = html.replace("</style>", styles + "\n</style>", 1)

# Connect timetable loading to tab switching
html = html.replace(
    'if(id === "attendance") loadStudentAttendance();',
    'if(id === "attendance") loadStudentAttendance();\n'
    'if(id === "student-timetable") loadStudentTimetable();',
    1
)

# Add timetable loading function
function_code = """
async function loadStudentTimetable() {
    const list = document.getElementById("studentTimetableList");
    if (!list) return;

    list.textContent = "Loading your timetable...";

    try {
        const response = await fetch("/api/student/timetable");

        if (response.status === 401) {
            window.location.href = "student-login.html";
            return;
        }

        const data = await response.json();

        if (response.status === 403 && data.mustChangePassword) {
            window.location.href = "student-change-password.html";
            return;
        }

        if (!response.ok) {
            throw new Error(data.message || "Unable to load timetable.");
        }

        if (!Array.isArray(data) || data.length === 0) {
            list.innerHTML =
                '<div class="student-timetable-empty">' +
                '<h3>📅 No timetable available</h3>' +
                '<p>Your class timetable has not been published yet. Please check again later.</p>' +
                '</div>';
            return;
        }

        const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
        list.replaceChildren();

        days.forEach(day => {
            const lessons = data.filter(item => item.day_of_week === day)
                .sort((a, b) => Number(a.period_number) - Number(b.period_number));

            if (lessons.length === 0) return;

            const card = document.createElement("article");
            card.className = "student-day-card";

            const heading = document.createElement("div");
            heading.className = "student-day-heading";
            heading.textContent = day;

            card.appendChild(heading);

            lessons.forEach(lesson => {
                const item = document.createElement("div");
                item.className = "student-lesson";

                const subject = document.createElement("strong");
                subject.textContent = lesson.subject || "Subject";

                const period = document.createElement("small");
                period.textContent = "Period " + lesson.period_number;

                const time = document.createElement("small");
                time.textContent =
                    (lesson.start_time || "--:--") + " – " +
                    (lesson.end_time || "--:--");

                item.append(subject, period, time);
                card.appendChild(item);
            });

            list.appendChild(card);
        });

    } catch (error) {
        list.textContent = error.message;
        console.error("Student timetable:", error);
    }
}

"""

html = html.replace(
    "async function loadProfile(){",
    function_code + "async function loadProfile(){",
    1
)

file.write_text(html)
print("SUCCESS: Student timetable added.")
print("Backup: student-dashboard.html.backup-before-timetable")
