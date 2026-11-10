from pathlib import Path
import shutil

file = Path("student-dashboard.html")
html = file.read_text()

if ".student-lesson strong" not in html:
    print("Timetable styles not found. No changes made.")
    raise SystemExit

if "PREMIUM STUDENT TIMETABLE DESIGN" in html:
    print("Premium timetable design is already installed.")
    raise SystemExit

shutil.copy2(
    file,
    "student-dashboard.html.backup-before-premium-timetable"
)

css = """
/* PREMIUM STUDENT TIMETABLE DESIGN */
.student-timetable-intro {
    position: relative;
    overflow: hidden;
    padding: 32px 27px;
    border: 1px solid rgba(217,173,69,.35);
    box-shadow: 0 12px 30px rgba(9,29,56,.15);
}

.student-timetable-intro::after {
    content: "📅";
    position: absolute;
    right: 24px;
    bottom: -15px;
    font-size: 95px;
    opacity: .10;
}

.student-timetable-intro h2 {
    font-size: 27px;
    font-weight: 800;
    letter-spacing: -.5px;
}

.student-timetable-intro p {
    max-width: 430px;
    font-size: 14px;
}

.timetable-toolbar {
    background: white;
    border: 1px solid #e8edf3;
    border-radius: 12px;
    padding: 14px 16px;
    box-shadow: 0 4px 14px rgba(16,43,80,.04);
}

.timetable-toolbar span {
    font-size: 11px;
    letter-spacing: 1.3px;
}

.timetable-toolbar button {
    background: #102b50;
    border: 1px solid #d9ad45;
    padding: 10px 17px;
    transition: .2s ease;
}

.timetable-toolbar button:hover {
    background: #d9ad45;
    color: #102b50;
}

.student-timetable-days {
    align-items: start;
    gap: 20px;
}

.student-day-card {
    position: relative;
    overflow: hidden;
    padding: 20px;
    border-radius: 16px;
    border: 1px solid #e5eaf1;
    box-shadow: 0 7px 22px rgba(16,43,80,.07);
    transition: transform .2s ease, box-shadow .2s ease;
}

.student-day-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 12px 28px rgba(16,43,80,.12);
}

.student-day-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 19px;
    font-weight: 800;
    padding-bottom: 15px;
    margin-bottom: 16px;
    border-bottom: 2px solid #d9ad45;
}

.student-lesson {
    position: relative;
    padding: 15px;
    margin-bottom: 12px;
    border: 1px solid #e8edf3;
    border-left: 4px solid #d9ad45;
    border-radius: 11px;
    background: linear-gradient(135deg,#fff,#f8fafc);
    transition: background .2s ease;
}

.student-lesson:last-child {
    margin-bottom: 0;
}

.student-lesson strong {
    color: #102b50;
    font-size: 16px;
    font-weight: 800;
    margin-bottom: 9px;
}

.student-lesson small {
    font-size: 12px;
    font-weight: 600;
    color: #64748b;
}

.student-timetable-empty {
    grid-column: 1 / -1;
    padding: 35px 20px;
    border-radius: 16px;
    box-shadow: 0 6px 20px rgba(16,43,80,.05);
}

@media(max-width:600px) {
    .student-timetable-intro {
        padding: 25px 19px;
    }

    .student-timetable-intro h2 {
        font-size: 23px;
    }

    .student-timetable-days {
        grid-template-columns: 1fr;
        gap: 15px;
    }

    .student-day-card {
        padding: 17px;
    }

    .timetable-toolbar {
        align-items: stretch;
    }
}
"""

html = html.replace("</style>", css + "\n</style>", 1)
file.write_text(html)

print("SUCCESS: Premium timetable design installed.")
print("Backup: student-dashboard.html.backup-before-premium-timetable")
