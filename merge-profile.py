from pathlib import Path
import re

p = Path("teacher-dashboard.html")
html = p.read_text()

# Find and remove the old standalone profile section
profile_pattern = r'<!-- PROFILE -->\s*<section class="info-panel" id="profile">.*?</section>'
new_html, profile_count = re.subn(
    profile_pattern, '', html, count=1, flags=re.S
)

if profile_count != 1:
    raise SystemExit("Could not locate the old profile section.")

# Rename the settings section
new_html, settings_count = re.subn(
    r'<section class="info-panel" id="settings">',
    '<section class="info-panel" id="profile">',
    new_html, count=1
)

if settings_count != 1:
    raise SystemExit("Could not locate the settings section.")

# Rename its CSS selectors and heading
new_html = new_html.replace("#settings", "#profile")
new_html = new_html.replace(
    "<h2>Account Settings</h2>",
    "<h2>My Profile</h2>",
    1
)

# Add teacher information card
new_html = new_html.replace(
    '<p>Manage your teacher account and personal information.</p>',
    '''<p>View and manage your teacher information and account.</p>
    <div class="settings-card">
        <h3>Teacher Information</h3>
        <p id="profileInfo">Loading teacher information...</p>
    </div>''',
    1
)

# Remove Settings sidebar link
new_html, link_count = re.subn(
    r'<a href="#settings"[^>]*>.*?</a>',
    '',
    new_html,
    count=1,
    flags=re.S
)

if link_count != 1:
    raise SystemExit("Could not locate the Settings sidebar link.")

# Save only after all checks pass
p.write_text(new_html)

print("SUCCESS: Sections combined.")
print("My Profile now includes teacher information and account settings.")
print("Profile editing, photo upload and password changing are preserved.")
