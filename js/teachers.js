const teachersGrid = document.getElementById("teachers-grid");

async function loadTeachers() {
    try {
        const response = await fetch("/api/public/teachers");

        if (!response.ok) {
            throw new Error("Unable to load teachers.");
        }

        const teachers = await response.json();
        teachersGrid.replaceChildren();

        if (teachers.length === 0) {
            teachersGrid.textContent =
                "Teacher profiles will appear here when approved by the school administrator.";
            teachersGrid.className = "teachers-grid";
            teachersGrid.firstElementChild?.classList.add("teachers-message");
            return;
        }

        teachers.forEach(teacher => {
            const card = document.createElement("article");
            card.className = "teacher-card";

            const initials = (teacher.full_name || "Teacher")
                .trim()
                .split(/\s+/)
                .slice(0, 2)
                .map(word => word.charAt(0).toUpperCase())
                .join("");

            if (teacher.photo_url) {
                const photo = document.createElement("img");
                photo.className = "teacher-photo";
                photo.alt = "Photograph of " + teacher.full_name;
                photo.src = teacher.photo_url;
                photo.onerror = () => {
                    const fallback = document.createElement("div");
                    fallback.className = "teacher-initials";
                    fallback.textContent = initials;
                    photo.replaceWith(fallback);
                };
                card.appendChild(photo);
            } else {
                const fallback = document.createElement("div");
                fallback.className = "teacher-initials";
                fallback.textContent = initials;
                card.appendChild(fallback);
            }

            const name = document.createElement("h3");
            name.textContent = teacher.full_name;
            card.appendChild(name);

            function addDetail(label, value) {
                const detail = document.createElement("p");
                detail.className = "teacher-detail";
                detail.textContent = label + ": " + (value || "Not provided");
                card.appendChild(detail);
            }

            addDetail("Subjects", teacher.subjects);
            addDetail("Classes", teacher.classes);

            if (teacher.is_class_teacher) {
                const badge = document.createElement("span");
                badge.className = "teacher-badge";
                badge.textContent =
                    "Class Teacher · " + (teacher.assigned_class || "Class not assigned");
                card.appendChild(badge);
            }

            teachersGrid.appendChild(card);
        });

    } catch (error) {
        teachersGrid.textContent =
            "Teacher information is temporarily unavailable.";
    }
}

loadTeachers();
