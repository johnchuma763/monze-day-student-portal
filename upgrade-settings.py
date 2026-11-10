from pathlib import Path

file = Path("teacher-dashboard.html")
html = file.read_text()

start = html.find("<!-- SETTINGS -->")
if start == -1:
    raise SystemExit("Settings section not found. No changes made.")

style_start = html.find("<style>", start)
style_end = html.find("</style>", style_start)

if style_start == -1 or style_end == -1:
    raise SystemExit("Settings style block not found. No changes made.")

new_css = """
<style>
#settings {
    padding: 28px;
}

#settings > h2 {
    color: #102b50;
    font-size: 27px;
    margin-bottom: 8px;
}

#settings > p {
    color: #64748b;
    margin-bottom: 25px;
}

.settings-card {
    background: #ffffff;
    padding: 26px;
    margin: 22px 0;
    border-radius: 16px;
    border: 1px solid #e5eaf1;
    box-shadow: 0 5px 18px rgba(16, 43, 80, 0.06);
}

.settings-card h3 {
    color: #102b50;
    font-size: 19px;
    margin: 0 0 18px;
}

.settings-card label {
    display: block;
    margin-top: 17px;
    margin-bottom: 7px;
    font-weight: 600;
    font-size: 14px;
    color: #334155;
}

.settings-card input,
.settings-card select {
    width: 100%;
    min-height: 46px;
    padding: 12px 14px;
    border: 1px solid #cbd5e1;
    border-radius: 9px;
    background: #f8fafc;
    color: #1e293b;
    font-size: 15px;
    box-sizing: border-box;
    outline: none;
    transition: border-color .2s, box-shadow .2s;
}

.settings-card input:focus,
.settings-card select:focus {
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, .12);
    background: #ffffff;
}

.settings-card input[type="file"] {
    background: #f8fafc;
    padding: 9px;
}

.settings-card button {
    background: #102b50;
    color: #ffffff;
    border: none;
    padding: 13px 22px;
    margin-top: 20px;
    border-radius: 9px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background .2s, transform .2s;
}

.settings-card button:hover {
    background: #c49a35;
    transform: translateY(-1px);
}

.settings-message {
    margin-top: 13px;
    font-size: 14px;
    font-weight: 600;
}

#teacherPhotoPreview {
    width: 120px;
    height: 120px;
    border-radius: 50%;
    object-fit: cover;
    border: 4px solid #c49a35;
    background: #eef2f7;
    display: block;
    margin-bottom: 16px;
}

#settings form {
    max-width: 650px;
}

#settings .settings-card:first-of-type {
    border-top: 4px solid #c49a35;
}

@media (max-width: 600px) {
    #settings {
        padding: 16px;
    }

    .settings-card {
        padding: 19px;
        margin: 16px 0;
    }

    #settings > h2 {
        font-size: 23px;
    }

    .settings-card button {
        width: 100%;
    }
}
</style>
"""

html = html[:style_start] + new_css + html[style_end + len("</style>"):]
file.write_text(html)

print("Settings design upgraded successfully.")
print("Existing forms and JavaScript functions were preserved.")
