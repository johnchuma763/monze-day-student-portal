from pathlib import Path

file = Path("teacher-dashboard.html")
html = file.read_text()

old = '''        document.getElementById("profileInfo").textContent =
            teacher.full_name + " | " + teacher.email;'''

new = '''        const profileInfo = document.getElementById("profileInfo");

        profileInfo.style.whiteSpace = "pre-line";
        profileInfo.textContent = [
            "Full Name: " + (teacher.full_name || "Not provided"),
            "Email: " + (teacher.email || "Not provided"),
            "Subjects: " + (teacher.subjects || "Not provided"),
            "Classes: " + (teacher.classes || "Not provided"),
            "Class Teacher: " + (teacher.is_class_teacher ? "Yes" : "No"),
            "Assigned Class: " + (teacher.assigned_class || "Not assigned"),
            "Account Created: " + (
                teacher.created_at
                    ? new Date(teacher.created_at).toLocaleDateString()
                    : "Not available"
            )
        ].join("\\\\n");'''

if old not in html:
    raise SystemExit("Could not find the original profile code. No changes made.")

html = html.replace(old, new, 1)
file.write_text(html)

print("Teacher profile upgraded successfully.")
