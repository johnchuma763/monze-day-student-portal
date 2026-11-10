const fs = require("fs");

const file = "admin-dashboard.html";
let html = fs.readFileSync(file, "utf8");

const marker = '<a href="admin-academic-results.html"';

if (html.includes('href="admin-subjects.html"')) {
    console.log("Manage Subjects link already exists.");
} else if (html.includes(marker)) {
    html = html.replace(marker, `
    <a href="admin-subjects.html" onclick="closeMenu()">
        📚 Manage Subjects
    </a>

    ${marker}`);
    fs.writeFileSync(file, html);
    console.log("Manage Subjects added to Admin Dashboard.");
} else {
    console.log("Could not find the Academic Results menu link.");
    process.exit(1);
}
