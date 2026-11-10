const fs = require("node:fs");

const file = "admin-dashboard.html";
let html = fs.readFileSync(file, "utf8");

if (html.includes('id="adminProfile"')) {
    console.log("Admin profile section already exists. No changes made.");
    process.exit(0);
}

const sidebarAnchor = `
    <button class="logout" id="logoutButton">Logout</button>`;

const profileLink = `
    <a href="#adminProfile" onclick="showAdminProfile(this)">
        👤 My Profile
    </a>
`;

const accountAnchor = `<section class="card">
    <h2>Administrator Account</h2>`;

const profileSection = `
<section class="card" id="adminProfile">
    <h2>My Profile</h2>

    <div style="display:flex;align-items:center;gap:22px;flex-wrap:wrap;">
        <img id="adminProfilePhoto"
             src=""
             alt="Administrator profile picture"
             style="width:125px;height:125px;border-radius:50%;object-fit:cover;background:#edf2f8;border:4px solid #c9a34a;">

        <div>
            <h3 id="profileAdminName">Administrator</h3>
            <p id="profileAdminEmail">Loading email...</p>
            <p id="profileAdminCreated"></p>

            <input type="file" id="adminPhotoInput"
                   accept="image/jpeg,image/png,image/webp"
                   style="display:none"
                   onchange="uploadAdminPhoto(this.files[0])">

            <button type="button"
                    onclick="document.getElementById('adminPhotoInput').click()"
                    style="background:#102b50;color:white;border:0;padding:12px 18px;border-radius:6px;cursor:pointer;">
                Change Profile Picture
            </button>

            <p style="color:#718096;font-size:13px;">
                JPG, PNG or WEBP. Maximum size: 2 MB.
            </p>
            <p id="adminPhotoMessage" role="status"></p>
        </div>
    </div>
</section>
`;

if (!html.includes(sidebarAnchor)) {
    console.error("Could not find the sidebar logout button. No changes made.");
    process.exit(1);
}

if (!html.includes(accountAnchor)) {
    console.error("Could not find the administrator account section. No changes made.");
    process.exit(1);
}

if (!html.includes('async function checkAdmin()')) {
    console.error("Could not find checkAdmin(). No changes made.");
    process.exit(1);
}

fs.copyFileSync(file, file + ".backup-admin-profile");

html = html.replace(sidebarAnchor, profileLink + sidebarAnchor);
html = html.replace(accountAnchor, profileSection + "\n" + accountAnchor);

html = html.replace(
    'document.getElementById("accountAdminName").textContent = admin.full_name;',
    `document.getElementById("accountAdminName").textContent = admin.full_name;
        document.getElementById("profileAdminName").textContent = admin.full_name;
        document.getElementById("profileAdminEmail").textContent = admin.email;
        document.getElementById("profileAdminCreated").textContent =
            admin.created_at ? "Account created: " +
            new Date(admin.created_at).toLocaleDateString() : "";

        const profileImage = document.getElementById("adminProfilePhoto");
        if (admin.photo_url) {
            profileImage.src = admin.photo_url + "?t=" + Date.now();
        } else {
            profileImage.src = "data:image/svg+xml," +
                encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="125" height="125"><rect width="100%" height="100%" fill="#edf2f8"/><text x="50%" y="55%" text-anchor="middle" font-size="48" fill="#102b50">👤</text></svg>');
        }`
);

const jsAnchor = 'async function checkAdmin(){';

const newFunctions = `
function showAdminProfile(link) {
    document.querySelectorAll(".sidebar a").forEach(a => {
        a.classList.remove("active");
    });
    link.classList.add("active");
    closeMenu();

    document.getElementById("adminProfile").scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

async function uploadAdminPhoto(file) {
    const message = document.getElementById("adminPhotoMessage");

    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    if (!allowedTypes.includes(file.type)) {
        message.textContent = "Choose a JPG, PNG or WEBP image.";
        return;
    }

    if (file.size > 2 * 1024 * 1024) {
        message.textContent = "The image must not exceed 2 MB.";
        return;
    }

    message.textContent = "Uploading profile picture...";

    const formData = new FormData();
    formData.append("photo", file);

    try {
        const response = await fetch("/api/admin/photo", {
            method: "POST",
            body: formData
        });

        const responseText = await response.text();
        let result;

        try {
            result = JSON.parse(responseText);
        } catch {
            throw new Error("Unexpected server response. Check the server terminal.");
        }

        if (!response.ok) {
            throw new Error(result.message || "Photo upload failed.");
        }

        document.getElementById("adminProfilePhoto").src =
            result.photo_url + "?t=" + Date.now();

        message.textContent = result.message;
    } catch (error) {
        message.textContent = error.message;
    } finally {
        document.getElementById("adminPhotoInput").value = "";
    }
}

`;

html = html.replace(jsAnchor, newFunctions + jsAnchor);

fs.writeFileSync(file, html);

console.log("Admin dashboard profile section added.");
console.log("Backup created: admin-dashboard.html.backup-admin-profile");
