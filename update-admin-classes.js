const fs = require("fs");

const file = "admin-students.html";
let html = fs.readFileSync(file, "utf8");

const oldOptions = `                        <option>Form 1</option>
                        <option>Form 2</option>
                        <option>Form 3</option>
                        <option>Form 4</option>`;

const newOptions = Array.from({ length: 4 }, (_, i) =>
    ["A", "B", "C", "D"].map(letter =>
        `                        <option value="Form ${i + 1}${letter}">Form ${i + 1}${letter}</option>`
    ).join("\n")
).join("\n");

if (!html.includes(oldOptions)) {
    console.log("Old class options not found. No changes made.");
    process.exit(1);
}

fs.copyFileSync(file, file + ".before-16-classes");
html = html.replace(oldOptions, newOptions);
fs.writeFileSync(file, html);

console.log("Admin class dropdown updated with all 16 classes.");
