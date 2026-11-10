from pathlib import Path
import shutil

file = Path("student-dashboard.html")
html = file.read_text()

start = html.find("async function loadStudentTimetable() {")
end = html.find("async function loadProfile(){", start)

if start == -1 or end == -1:
    print("Could not find timetable function. No changes made.")
    raise SystemExit

if "PROFESSIONAL WEEKLY TIMETABLE" in html:
    print("Professional timetable is already installed.")
    raise SystemExit

shutil.copy2(file, "student-dashboard.html.backup-before-weekly-table")

new_function = r'''
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
                '<h3>No timetable available</h3>' +
                '<p>Your class timetable has not been published yet.</p>' +
                '</div>';
            return;
        }

        const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

        const periods = [...new Set(
            data.map(item => Number(item.period_number))
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

        periods.forEach(periodNumber => {
            const row = document.createElement("tr");

            const periodCell = document.createElement("td");
            periodCell.className = "period-number-cell";
            periodCell.textContent = "Period " + periodNumber;
            row.appendChild(periodCell);

            days.forEach(day => {
                const cell = document.createElement("td");
                cell.className = "weekly-lesson-cell";

                const lesson = data.find(item =>
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
        });

        table.appendChild(tbody);
        wrapper.appendChild(table);

        list.replaceChildren(wrapper);

    } catch (error) {
        list.textContent = error.message;
        console.error("Student timetable:", error);
    }
}

'''

html = html[:start] + new_function + html[end:]

css = r"""
/* PROFESSIONAL WEEKLY TIMETABLE */
.weekly-table-wrapper {
    width: 100%;
    overflow-x: auto;
    background: #fff;
    border: 1px solid #e2e8f0;
    border-radius: 15px;
    box-shadow: 0 8px 25px rgba(16,43,80,.07);
    -webkit-overflow-scrolling: touch;
}

.professional-weekly-table {
    width: 100%;
    min-width: 760px;
    border-collapse: separate;
    border-spacing: 0;
    text-align: center;
}

.professional-weekly-table th {
    background: #102b50;
    color: #fff;
    padding: 17px 12px;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: .7px;
    border-right: 1px solid rgba(255,255,255,.12);
    border-bottom: 3px solid #d9ad45;
}

.professional-weekly-table th:first-child {
    border-radius: 14px 0 0 0;
    min-width: 105px;
}

.professional-weekly-table th:last-child {
    border-radius: 0 14px 0 0;
}

.professional-weekly-table td {
    padding: 15px 10px;
    border-right: 1px solid #edf0f4;
    border-bottom: 1px solid #edf0f4;
    min-width: 125px;
    vertical-align: middle;
}

.professional-weekly-table tbody tr:last-child td {
    border-bottom: 0;
}

.professional-weekly-table td:last-child,
.professional-weekly-table th:last-child {
    border-right: 0;
}

.period-number-cell {
    background: #f1f5f9;
    color: #102b50;
    font-weight: 800;
    font-size: 12px;
    white-space: nowrap;
}

.weekly-lesson-cell {
    background: #fff;
    transition: background .2s ease;
}

.weekly-lesson-cell:hover {
    background: #fffaf0;
}

.weekly-subject {
    display: block;
    color: #102b50;
    font-size: 14px;
    font-weight: 800;
    margin-bottom: 7px;
}

.weekly-time {
    display: inline-block;
    color: #64748b;
    background: #f1f5f9;
    padding: 5px 8px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
}

.empty-lesson {
    color: #cbd5e1;
    background: #fafbfd;
    font-size: 18px;
}

@media(max-width:600px) {
    .weekly-table-wrapper {
        border-radius: 11px;
    }

    .professional-weekly-table th {
        padding: 14px 10px;
    }

    .professional-weekly-table td {
        padding: 13px 9px;
    }
}
"""

html = html.replace("</style>", css + "\n</style>", 1)

file.write_text(html)

print("SUCCESS: Professional weekly timetable installed.")
print("Backup: student-dashboard.html.backup-before-weekly-table")
