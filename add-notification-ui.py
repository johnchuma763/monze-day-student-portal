from pathlib import Path

files = ["student-dashboard.html", "teacher-dashboard.html"]

css = """
/* NOTIFICATION CENTRE */
.notification-wrap {
    position: relative;
    margin-left: auto;
    margin-right: 14px;
}
.notification-bell {
    position: relative;
    border: 1px solid #e5e9f0;
    background: white;
    color: #102b50;
    border-radius: 10px;
    padding: 10px 13px;
    font-size: 21px;
    cursor: pointer;
}
.notification-bell:hover { background: #f5f7fb; }
.notification-badge {
    position: absolute;
    top: -7px;
    right: -7px;
    background: #d9ad45;
    color: #102b50;
    border-radius: 20px;
    min-width: 19px;
    height: 19px;
    padding: 0 4px;
    font-size: 11px;
    font-weight: bold;
    display: none;
    align-items: center;
    justify-content: center;
}
.notification-panel {
    display: none;
    position: absolute;
    right: 0;
    top: 48px;
    width: min(360px, calc(100vw - 30px));
    max-height: 430px;
    overflow-y: auto;
    background: white;
    border: 1px solid #e5e9f0;
    border-radius: 13px;
    box-shadow: 0 12px 35px #102b5025;
    z-index: 100;
    color: #102b50;
}
.notification-panel.open { display: block; }
.notification-heading {
    padding: 15px;
    border-bottom: 1px solid #edf0f5;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
}
.notification-heading h3 { margin: 0; font-size: 16px; }
.notification-heading button {
    border: 0;
    background: #102b50;
    color: white;
    padding: 7px 10px;
    border-radius: 7px;
    cursor: pointer;
    font-size: 11px;
}
.notification-item {
    padding: 13px 15px;
    border-bottom: 1px solid #edf0f5;
}
.notification-item.unread { background: #fff9e9; }
.notification-item h4 { margin: 0 0 6px; font-size: 14px; }
.notification-item p {
    margin: 0 0 8px;
    color: #536174;
    font-size: 13px;
    line-height: 1.5;
}
.notification-item small { color: #778397; font-size: 11px; }
.notification-item button {
    display: block;
    margin-top: 8px;
    border: 0;
    background: transparent;
    color: #9a741b;
    font-weight: bold;
    cursor: pointer;
    padding: 0;
}
.notification-empty {
    padding: 25px 15px;
    text-align: center;
    color: #778397;
    font-size: 13px;
}
@media(max-width:500px) {
    .notification-wrap { margin-right: 8px; }
    .notification-panel { position: fixed; top: 70px; right: 10px; }
}
"""

markup = """
<div class="notification-wrap">
    <button class="notification-bell" id="notificationBell"
        type="button" aria-label="Notifications"
        aria-expanded="false" onclick="toggleNotifications()">
        🔔
        <span class="notification-badge" id="notificationBadge">0</span>
    </button>
    <div class="notification-panel" id="notificationPanel">
        <div class="notification-heading">
            <h3>Notifications</h3>
            <button type="button" onclick="markAllNotificationsRead()">
                Mark all read
            </button>
        </div>
        <div id="notificationList">
            <div class="notification-empty">Loading notifications...</div>
        </div>
    </div>
</div>
"""

javascript = """
/* NOTIFICATION CENTRE */
async function loadNotificationCount() {
    try {
        const response = await fetch("/api/notifications/unread-count");
        if (response.status === 401) return;
        if (!response.ok) throw new Error("Unable to load notification count");
        const data = await response.json();
        const badge = document.getElementById("notificationBadge");
        const count = Number(data.unreadCount || 0);
        badge.textContent = count > 99 ? "99+" : count;
        badge.style.display = count > 0 ? "flex" : "none";
    } catch (error) {
        console.error("Notification count:", error);
    }
}

function toggleNotifications() {
    const panel = document.getElementById("notificationPanel");
    const bell = document.getElementById("notificationBell");
    const isOpen = panel.classList.toggle("open");
    bell.setAttribute("aria-expanded", String(isOpen));
    if (isOpen) loadNotifications();
}

async function loadNotifications() {
    const list = document.getElementById("notificationList");
    list.textContent = "Loading notifications...";

    try {
        const response = await fetch("/api/notifications");
        if (response.status === 401) {
            window.location.href = window.location.pathname.includes("teacher")
                ? "teacher-login.html" : "student-login.html";
            return;
        }
        if (!response.ok) throw new Error("Unable to load notifications");

        const notifications = await response.json();
        list.replaceChildren();

        if (!notifications.length) {
            const empty = document.createElement("div");
            empty.className = "notification-empty";
            empty.textContent = "You're all caught up. No notifications yet.";
            list.appendChild(empty);
            return;
        }

        notifications.forEach(item => {
            const card = document.createElement("article");
            card.className = "notification-item" + (item.read_at ? "" : " unread");

            const title = document.createElement("h4");
            title.textContent = item.title;

            const message = document.createElement("p");
            message.textContent = item.message;

            const date = document.createElement("small");
            date.textContent = item.created_at
                ? new Date(item.created_at).toLocaleString()
                : "Date unavailable";

            card.append(title, message, date);

            if (!item.read_at) {
                const button = document.createElement("button");
                button.type = "button";
                button.textContent = "Mark as read";
                button.addEventListener("click", () =>
                    markNotificationRead(item.id)
                );
                card.appendChild(button);
            }

            list.appendChild(card);
        });
    } catch (error) {
        list.textContent = "Unable to load notifications. Please try again.";
        console.error(error);
    }
}

async function markNotificationRead(id) {
    try {
        const response = await fetch("/api/notifications/" + encodeURIComponent(id) + "/read", {
            method: "PATCH"
        });
        if (!response.ok) throw new Error("Unable to mark notification as read");
        await loadNotifications();
        await loadNotificationCount();
    } catch (error) {
        alert(error.message);
    }
}

async function markAllNotificationsRead() {
    try {
        const response = await fetch("/api/notifications/read-all", {
            method: "PATCH"
        });
        if (!response.ok) throw new Error("Unable to mark notifications as read");
        await loadNotifications();
        await loadNotificationCount();
    } catch (error) {
        alert(error.message);
    }
}

loadNotificationCount();
setInterval(loadNotificationCount, 30000);
"""

for filename in files:
    path = Path(filename)
    html = path.read_text()

    if 'id="notificationBell"' in html:
        print(filename + ": notification UI already exists; skipped.")
        continue

    if "</style>" not in html or "</script>" not in html:
        raise SystemExit(filename + ": required style/script section not found.")

    html = html.replace("</style>", css + "\n</style>", 1)

    if filename == "student-dashboard.html":
        anchor = '<button class="logout" onclick="logout()">Logout</button>'
        if anchor not in html:
            raise SystemExit("Student header button not found.")
        html = html.replace(anchor, markup + "\n" + anchor, 1)
    else:
        anchor = "</header>"
        if anchor not in html:
            raise SystemExit("Teacher header not found.")
        html = html.replace(anchor, markup + "\n" + anchor, 1)

    html = html.rsplit("</script>", 1)[0] + javascript + "\n</script>" + html.rsplit("</script>", 1)[1]

    path.write_text(html)
    print(filename + ": notification UI added successfully.")

