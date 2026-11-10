from pathlib import Path
import re
import shutil

routes = Path("timetable-routes.js")
dashboard = Path("student-dashboard.html")

# Backups
shutil.copy2(routes, "timetable-routes.js.backup-before-student-break")
shutil.copy2(dashboard, "student-dashboard.html.backup-before-break-row")

# Update student timetable API
text = routes.read_text()

pattern = r'''    app\.get\("/api/student/timetable", requireStudent, async \(req, res\) => \{.*?\n    \}\);'''

replacement = r'''    app.get("/api/student/timetable", requireStudent, async (req, res) => {
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
    });'''

text, count = re.subn(pattern, replacement, text, count=1, flags=re.S)

if count != 1:
    raise SystemExit("Could not safely find the student timetable API route. No changes saved.")

routes.write_text(text)

# Replace student timetable frontend function
html = dashboard.read_text()

pattern = r'async function loadStudentTimetable\(\) \{.*?\n\}\s*(?=async function loadProfile\(\))'

replacement = r'''async function loadStudentTimetable() {
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

        const lessons = Array.isArray(data.lessons) ? data.lessons : [];
        const settings = data.settings || null;

        if (lessons.length === 0 && !settings) {
            list.innerHTML =
                '<div class="student-timetable-empty">' +
                '<h3>No timetable available</h3>' +
                '<p>Your class timetable has not been published yet.</p>' +
                '</div>';
            return;
        }

        const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

        const periods = [...new Set(
            lessons.map(item => Number(item.period_number))
        )].sort((a, b) => a - b);

        const wrapper = document.createElement("div");
        wrapper.className = "weekly-table-wrapper";

        const table = document.createElement("table");
        table.className = "professional-weekly-table";

        const thead = document.createElement("thead");
        const headerRow = document.createElement("tr");

        const periodHeader = document.createElement("th");
        periodHeader.textContent = "PERIOD";
        headerRow.appendChild(periodHeader);

        days.forEach(day => {
            const th = document.createElement("th");
            th.textContent = day.toUpperCase();
            headerRow.appendChild(th);
        });

        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement("tbody");

        let breakAdded = false;

        function addBreakRow() {
            if (breakAdded || !settings ||
                !settings.break_start || !settings.break_end) {
                return;
            }

            const row = document.createElement("tr");
            row.className = "break-time-row";

            const label = document.createElement("td");
            label.className = "break-time-label";
            label.textContent = "☕ BREAK TIME";
            row.appendChild(label);

            days.forEach(() => {
                const cell = document.createElement("td");
                cell.className = "break-time-cell";

                const title = document.createElement("strong");
                title.textContent = "BREAK";

                const time = document.createElement("span");
                time.textContent =
                    settings.break_start + " – " + settings.break_end;

                cell.append(title, time);
                row.appendChild(cell);
            });

            tbody.appendChild(row);
            breakAdded = true;
        }

        periods.forEach(periodNumber => {
            const row = document.createElement("tr");

            const periodCell = document.createElement("td");
            periodCell.className = "period-number-cell";
            periodCell.textContent = "Period " + periodNumber;
            row.appendChild(periodCell);

            days.forEach(day => {
                const cell = document.createElement("td");
                cell.className = "weekly-lesson-cell";

                const lesson = lessons.find(item =>
                    item.day_of_week === day &&
                    Number(item.period_number) === periodNumber
                );

                if (lesson) {
                    const subject = document.createElement("strong");
                    subject.className = "weekly-subject";
                    subject.textContent = lesson.subject || "Subject";

                    const time = document.createElement("span");
                    time.className = "weekly-time";
                    time.textContent =
                        (lesson.start_time || "--:--") + " – " +
                        (lesson.end_time || "--:--");

                    cell.append(subject, time);
                } else {
                    cell.classList.add("empty-lesson");
                    cell.textContent = "—";
                }

                row.appendChild(cell);
            });

            tbody.appendChild(row);

            const periodLessons = lessons.filter(item =>
                Number(item.period_number) === periodNumber
            );

            const latestEnd = periodLessons
                .map(item => item.end_time)
                .filter(Boolean)
                .sort()
                .pop();

            if (
                latestEnd &&
                settings &&
                settings.break_start &&
                latestEnd >= settings.break_start
            ) {
                addBreakRow();
            }
        });

        // Show the break even when there are no lessons yet.
        addBreakRow();

        table.appendChild(tbody);
        wrapper.appendChild(table);
        list.replaceChildren(wrapper);

    } catch (error) {
        list.textContent = error.message;
        console.error("Student timetable:", error);
    }
}'''

html, count = re.subn(pattern, replacement, html, count=1, flags=re.S)

if count != 1:
    raise SystemExit("Could not safely find the student timetable function. Restore from backup if needed.")

# Add break row styling
style = r'''
.break-time-row td {
    background: #fff8e6 !important;
    border-top: 2px solid #d9ad45 !important;
    border-bottom: 2px solid #d9ad45 !important;
    text-align: center;
    padding: 15px 10px !important;
}

.break-time-label {
    color: #102b50 !important;
    font-weight: 800;
    letter-spacing: .5px;
    white-space: nowrap;
}

.break-time-cell strong {
    display: block;
    color: #102b50;
    font-size: 13px;
    margin-bottom: 5px;
}

.break-time-cell span {
    display: block;
    color: #80621d;
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
}
'''

if "</style>" in html and ".break-time-row" not in html:
    html = html.replace("</style>", style + "\n</style>", 1)

dashboard.write_text(html)

print("Student break-time update completed successfully.")
print("Backups created for both files.")
