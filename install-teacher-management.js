const fs = require("fs");

const serverFile = "server-postgres.js";
const pageFile = "admin-teachers.html";
const marker = "// ADMINISTRATOR ACADEMIC RESULTS";

if (!fs.existsSync(serverFile) || !fs.existsSync(pageFile)) {
    console.error("Required project files were not found. Run this from the project folder.");
    process.exit(1);
}

let server = fs.readFileSync(serverFile, "utf8");

if (server.includes("ENHANCED TEACHER MANAGEMENT")) {
    console.log("Enhanced teacher API routes already exist. Skipping duplicate installation.");
} else {
    const position = server.indexOf(marker);

    if (position === -1) {
        console.error("Could not find the academic results section. No backend changes made.");
        process.exit(1);
    }

    fs.copyFileSync(serverFile, serverFile + ".backup-teacher-management");

    const routes = `
// =====================================
// ENHANCED TEACHER MANAGEMENT
// =====================================

// EDIT TEACHER SUBJECTS AND CLASS ASSIGNMENTS
app.patch("/api/admin/teachers/:id", requireAdmin, async (req, res) => {
    const id = req.params.id;
    const { subjects, classes, is_class_teacher, assigned_class } = req.body;

    if (!/^[1-9]\\d*$/.test(id)) {
        return res.status(400).json({ message: "Invalid teacher ID." });
    }

    if (typeof subjects !== "string" || typeof classes !== "string" ||
        !["yes", "no"].includes(is_class_teacher)) {
        return res.status(400).json({ message: "Please provide valid teacher details." });
    }

    const assigned = String(assigned_class || "").replace(/\\s+/g, "").toUpperCase();

    if (is_class_teacher === "yes" && !/^FORM[1-4][A-D]$/.test(assigned)) {
        return res.status(400).json({ message: "Select a valid class teacher assignment, such as Form 2C." });
    }

    try {
        const result = await pool.query(
            \`UPDATE teachers
             SET subjects = $1, classes = $2, is_class_teacher = $3, assigned_class = $4
             WHERE id = $5
             RETURNING id, full_name, email, subjects, classes, is_class_teacher,
                       assigned_class, approved, photo_url, created_at\`,
            [subjects.trim(), classes.trim(), is_class_teacher === "yes" ? 1 : 0,
             is_class_teacher === "yes" ? assigned : "", id]
        );

        if (!result.rows.length) return res.status(404).json({ message: "Teacher not found." });

        res.json({ message: "Teacher details updated successfully.", teacher: result.rows[0] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Unable to update teacher details." });
    }
});

// REJECT / WITHDRAW APPROVAL
app.patch("/api/admin/teachers/:id/reject", requireAdmin, async (req, res) => {
    const id = req.params.id;
    if (!/^[1-9]\\d*$/.test(id)) return res.status(400).json({ message: "Invalid teacher ID." });

    try {
        const result = await pool.query(
            "UPDATE teachers SET approved = 0 WHERE id = $1 RETURNING id",
            [id]
        );
        if (!result.rows.length) return res.status(404).json({ message: "Teacher not found." });
        res.json({ message: "Teacher approval withdrawn. The account is now unapproved." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Unable to update teacher approval." });
    }
});

// DELETE TEACHER
app.delete("/api/admin/teachers/:id", requireAdmin, async (req, res) => {
    const id = req.params.id;
    if (!/^[1-9]\\d*$/.test(id)) return res.status(400).json({ message: "Invalid teacher ID." });

    try {
        const result = await pool.query(
            "DELETE FROM teachers WHERE id = $1 RETURNING id",
            [id]
        );
        if (!result.rows.length) return res.status(404).json({ message: "Teacher not found." });
        res.json({ message: "Teacher account deleted successfully." });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Unable to delete teacher. Related records may prevent deletion." });
    }
});

`;

    server = server.slice(0, position) + routes + server.slice(position);
    fs.writeFileSync(serverFile, server);
    console.log("Teacher management API routes installed.");
}

fs.copyFileSync(pageFile, pageFile + ".backup-before-professional-upgrade");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Teacher Administration | Monze Day Secondary School</title>
<style>
:root{--navy:#102b50;--dark:#091d38;--gold:#d9ad45;--bg:#f3f6fb;--ink:#26364b;--muted:#718096;--line:#e5eaf1}
*{box-sizing:border-box}
body{margin:0;font-family:Arial,sans-serif;background:var(--bg);color:var(--ink)}
.topbar{height:75px;position:fixed;z-index:20;inset:0 0 auto;background:var(--navy);border-top:5px solid var(--gold);display:flex;align-items:center;padding:0 22px;color:white}
.brand{display:flex;align-items:center;gap:12px}.logo{width:42px;height:42px;border-radius:9px;background:var(--gold);color:var(--navy);display:grid;place-items:center;font-weight:bold}
.brand h2{font-size:15px;margin:0;color:white}.brand p{font-size:10px;letter-spacing:2px;color:#d9e3f0;margin:5px 0 0}
.menu-button{display:none;background:none;border:0;color:white;font-size:27px}
.sidebar{position:fixed;top:75px;bottom:0;left:0;width:245px;background:var(--navy);padding:23px 14px;z-index:15}
.sidebar-title{font-size:11px;letter-spacing:2px;color:var(--gold);font-weight:bold;padding:8px 12px 18px}
.sidebar a{display:block;color:#e0e8f2;text-decoration:none;padding:13px;border-radius:7px;margin-bottom:5px;font-size:14px}
.sidebar a:hover,.sidebar a.active{background:#1b4778;border-left:4px solid var(--gold)}
.logout{width:100%;margin-top:25px;padding:12px;background:transparent;color:white;border:1px solid #ffffff55;border-radius:7px;font-weight:bold}
main{margin:100px 0 30px 245px;padding:0 28px;max-width:1500px}
.heading{display:flex;justify-content:space-between;align-items:center;gap:15px;flex-wrap:wrap;margin-bottom:22px}
h1,h2,h3{color:var(--navy)}h1{margin:0;font-size:26px}.sub{color:var(--muted);margin:7px 0 0;font-size:14px}
.btn{border:0;border-radius:7px;padding:10px 13px;font-weight:bold;cursor:pointer}
.gold{background:var(--gold);color:var(--dark)}.blue{background:var(--navy);color:white}.green{background:#18794e;color:white}.red{background:#a83232;color:white}.light{background:#edf2f8;color:var(--navy)}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px}
.stat,.panel{background:white;border-radius:12px;padding:19px;box-shadow:0 4px 15px #102b5010}
.stat span{color:var(--muted);font-size:13px}.stat strong{display:block;font-size:27px;color:var(--navy);margin-top:8px}
.panel{margin-bottom:20px}.panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:16px}.panel h2{font-size:18px;margin:0}
.controls{display:flex;gap:9px;flex-wrap:wrap}.controls input,.controls select{min-width:170px}
input,select{padding:11px;border:1px solid #d6deea;border-radius:7px;background:white;color:var(--ink);font-size:14px}
.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;min-width:850px}th,td{text-align:left;padding:13px 11px;border-bottom:1px solid var(--line);font-size:13px}th{background:#f1f4f8;color:var(--navy)}
.person{display:flex;align-items:center;gap:10px;min-width:160px}.avatar{width:38px;height:38px;border-radius:50%;object-fit:cover;background:#e8edf4;display:grid;place-items:center;color:var(--navy);font-weight:bold}
.badge{display:inline-block;padding:5px 9px;border-radius:20px;font-size:11px;font-weight:bold}.approved{background:#e5f5ec;color:#18794e}.pending{background:#fff3d8;color:#946200}
.actions{display:flex;gap:6px;flex-wrap:wrap}.actions button{padding:7px 9px;font-size:12px}
#status{padding:11px;border-radius:7px;background:#edf2f8;color:var(--navy);font-size:13px;margin:0 0 15px}
.empty{text-align:center;color:var(--muted);padding:30px}
.modal{display:none;position:fixed;inset:0;background:#07182dcc;z-index:40;align-items:center;justify-content:center;padding:16px}.modal.show{display:flex}
.dialog{width:min(560px,100%);max-height:90vh;overflow:auto;background:white;border-radius:13px;padding:23px}
.dialog h2{margin:0 0 18px}.field{margin:13px 0}.field label{display:block;font-size:12px;font-weight:bold;color:var(--navy);margin-bottom:6px}.field input,.field select{width:100%}
.profile{display:flex;align-items:center;gap:15px;margin-bottom:18px}.profile img{width:75px;height:75px;border-radius:50%;object-fit:cover;background:#edf2f8}.profile .avatar{width:75px;height:75px;font-size:24px}
.dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:20px;flex-wrap:wrap}
footer{text-align:center;padding:20px;color:var(--muted);font-size:12px;margin-left:245px}
.overlay{display:none}
@media(max-width:800px){.menu-button{display:block}.topbar{padding:0 12px}.brand h2{font-size:12px}.sidebar{left:-260px;transition:left .2s}.sidebar.open{left:0}.overlay.show{display:block;position:fixed;inset:75px 0 0;background:#0008;z-index:14}main{margin:95px 0 25px;padding:0 13px}footer{margin-left:0}.stats{grid-template-columns:repeat(2,1fr)}h1{font-size:22px}}
</style>
</head>
<body>
<header class="topbar">
 <div class="brand">
  <button class="menu-button" onclick="openMenu()" aria-label="Open menu">☰</button>
  <div class="logo">MD</div>
  <div><h2>MONZE DAY SECONDARY SCHOOL</h2><p>ADMINISTRATOR PORTAL</p></div>
 </div>
</header>
<div class="overlay" id="overlay" onclick="closeMenu()"></div>
<nav class="sidebar" id="sidebar">
 <div class="sidebar-title">ADMINISTRATOR MENU</div>
 <a href="admin-dashboard.html">🏠 Dashboard</a>
 <a href="admin-students.html">👨‍🎓 Manage Students</a>
 <a class="active" href="admin-teachers.html">👨‍🏫 Manage Teachers</a>
 <a href="admin-create-account.html">➕ Create Account</a>
 <a href="admin-academic-results.html">📊 Academic Results</a>
 <a href="admin-attendance.html">📅 Attendance Records</a>
 <button class="logout" id="logoutButton">Logout</button>
</nav>
<main>
 <div class="heading">
  <div><h1>Teacher Administration</h1><p class="sub">Manage teacher profiles, subjects, class responsibilities and account approvals.</p></div>
  <button class="btn gold" onclick="loadTeachers()">↻ Refresh list</button>
 </div>
 <section class="stats">
  <div class="stat"><span>Total teachers</span><strong id="total">0</strong></div>
  <div class="stat"><span>Approved</span><strong id="approvedCount">0</strong></div>
  <div class="stat"><span>Pending review</span><strong id="pendingCount">0</strong></div>
  <div class="stat"><span>Class teachers</span><strong id="classCount">0</strong></div>
 </section>
 <section class="panel">
  <div class="panel-head"><h2>Teacher Directory</h2>
   <div class="controls">
    <input id="search" type="search" placeholder="Search name or email..." oninput="renderTeachers()">
    <select id="filter" onchange="renderTeachers()"><option value="">All statuses</option><option value="1">Approved</option><option value="0">Pending</option></select>
   </div>
  </div>
  <p id="status" role="status">Loading teacher accounts...</p>
  <div class="table-wrap"><table>
   <thead><tr><th>Teacher</th><th>Email</th><th>Subjects</th><th>Teaching classes</th><th>Class responsibility</th><th>Status</th><th>Actions</th></tr></thead>
   <tbody id="teacherTable"><tr><td colspan="7" class="empty">Loading...</td></tr></tbody>
  </table></div>
 </section>
</main>
<footer>© 2026 Monze Day Secondary School · Knowledge • Discipline • Excellence</footer>

<div class="modal" id="editModal">
 <div class="dialog">
  <h2>Edit teacher assignment</h2>
  <form id="editForm">
   <input type="hidden" id="editId">
   <div class="field"><label for="editSubjects">Subjects (comma separated)</label><input id="editSubjects" required></div>
   <div class="field"><label for="editClasses">Teaching classes (comma separated)</label><input id="editClasses" required></div>
   <div class="field"><label for="editIsClass">Class teacher?</label><select id="editIsClass"><option value="no">No</option><option value="yes">Yes</option></select></div>
   <div class="field"><label for="editAssigned">Responsible class (e.g. Form 2C)</label><input id="editAssigned" placeholder="Form 2C"></div>
   <div class="dialog-actions"><button type="button" class="btn light" onclick="closeModal('editModal')">Cancel</button><button class="btn gold">Save changes</button></div>
  </form>
 </div>
</div>

<div class="modal" id="profileModal">
 <div class="dialog">
  <h2>Teacher profile</h2><div id="profileContent"></div>
  <div class="dialog-actions"><button class="btn blue" onclick="closeModal('profileModal')">Close</button></div>
 </div>
</div>

<script>
let teachers = [];
const $ = id => document.getElementById(id);
function openMenu(){ $("sidebar").classList.add("open"); $("overlay").classList.add("show"); }
function closeMenu(){ $("sidebar").classList.remove("open"); $("overlay").classList.remove("show"); }
function closeModal(id){ $(id).classList.remove("show"); }
function message(text){ $("status").textContent = text; }
function approved(t){ return Number(t.approved) === 1 || t.approved === true; }
function classTeacher(t){ return Number(t.is_class_teacher) === 1 || t.is_class_teacher === true || t.is_class_teacher === "t"; }
function esc(value){ return String(value ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }

async function api(url, options={}) {
 const response = await fetch(url,{credentials:"same-origin",...options,
  headers:{"Content-Type":"application/json",...(options.headers||{})}});
 let data={}; try{data=await response.json();}catch{}
 if(response.status===401){location.href="admin-login.html";throw new Error("Administrator login required.");}
 if(!response.ok) throw new Error(data.message || "Request failed.");
 return data;
}
async function checkAdmin(){await api("/api/admin/me");}

async function loadTeachers(){
 message("Loading teacher accounts...");
 try{
  teachers=await api("/api/admin/teachers");
  if(!Array.isArray(teachers)) throw new Error("Unexpected teacher list response.");
  $("total").textContent=teachers.length;
  $("approvedCount").textContent=teachers.filter(approved).length;
  $("pendingCount").textContent=teachers.filter(t=>!approved(t)).length;
  $("classCount").textContent=teachers.filter(classTeacher).length;
  renderTeachers(); message("Teacher list loaded successfully.");
 }catch(error){message(error.message);$("teacherTable").innerHTML='<tr><td colspan="7" class="empty">Unable to load teacher accounts.</td></tr>';}
}
function renderTeachers(){
 const term=$("search").value.trim().toLowerCase(), filter=$("filter").value;
 const list=teachers.filter(t=>(!filter || String(Number(approved(t)))===filter) &&
  (String(t.full_name||"").toLowerCase().includes(term)||String(t.email||"").toLowerCase().includes(term)));
 const body=$("teacherTable");body.replaceChildren();
 if(!list.length){body.innerHTML='<tr><td colspan="7" class="empty">No matching teacher accounts.</td></tr>';return;}
 list.forEach(t=>{
  const tr=document.createElement("tr");
  const initials=String(t.full_name||"T").split(/\\s+/).map(x=>x[0]).slice(0,2).join("").toUpperCase();
  const photo=t.photo_url ? '<img class="avatar" src="'+esc(t.photo_url)+'" alt="">' : '<span class="avatar">'+esc(initials)+'</span>';
  const status=approved(t)?'<span class="badge approved">Approved</span>':'<span class="badge pending">Pending</span>';
  const responsibility=classTeacher(t)?esc(t.assigned_class||"Class not assigned"):"—";
  tr.innerHTML='<td><div class="person">'+photo+'<strong>'+esc(t.full_name)+'</strong></div></td>'+
   '<td>'+esc(t.email)+'</td><td>'+esc(t.subjects||"Not specified")+'</td>'+
   '<td>'+esc(t.classes||"Not specified")+'</td><td>'+responsibility+'</td><td>'+status+'</td><td><div class="actions">'+
   '<button class="btn light" data-action="profile">Profile</button>'+
   '<button class="btn blue" data-action="edit">Edit</button>'+
   (approved(t)?'<button class="btn red" data-action="reject">Reject</button>':'<button class="btn green" data-action="approve">Approve</button>')+
   '<button class="btn red" data-action="delete">Delete</button></div></td>';
  tr.querySelectorAll("button").forEach(button=>button.addEventListener("click",()=>{
   const action=button.dataset.action;
   if(action==="profile") viewProfile(t);
   if(action==="edit") editTeacher(t);
   if(action==="approve") approveTeacher(t);
   if(action==="reject") rejectTeacher(t);
   if(action==="delete") deleteTeacher(t);
  }));
  body.appendChild(tr);
 });
}
function editTeacher(t){
 $("editId").value=t.id;$("editSubjects").value=t.subjects||"";$("editClasses").value=t.classes||"";
 $("editIsClass").value=classTeacher(t)?"yes":"no";$("editAssigned").value=t.assigned_class||"";
 $("editModal").classList.add("show");
}
$("editForm").addEventListener("submit",async event=>{
 event.preventDefault();
 const id=$("editId").value;
 const payload={subjects:$("editSubjects").value,classes:$("editClasses").value,
  is_class_teacher:$("editIsClass").value,assigned_class:$("editAssigned").value};
 try{const result=await api("/api/admin/teachers/"+encodeURIComponent(id),{method:"PATCH",body:JSON.stringify(payload)});
  closeModal("editModal");message(result.message||"Teacher updated.");await loadTeachers();
 }catch(error){message(error.message);}
});
function viewProfile(t){
 const initial=String(t.full_name||"T").split(/\\s+/).map(x=>x[0]).slice(0,2).join("").toUpperCase();
 const photo=t.photo_url?'<img src="'+esc(t.photo_url)+'" alt="Teacher photo">':'<span class="avatar">'+esc(initial)+'</span>';
 $("profileContent").innerHTML='<div class="profile">'+photo+'<div><h3>'+esc(t.full_name)+'</h3><p>'+esc(t.email)+'</p></div></div>'+
 '<p><b>Subjects:</b> '+esc(t.subjects||"Not specified")+'</p>'+
 '<p><b>Teaching classes:</b> '+esc(t.classes||"Not specified")+'</p>'+
 '<p><b>Class teacher:</b> '+(classTeacher(t)?"Yes":"No")+'</p>'+
 '<p><b>Responsible class:</b> '+esc(t.assigned_class||"Not assigned")+'</p>'+
 '<p><b>Account status:</b> '+(approved(t)?"Approved":"Pending")+'</p>'+
 '<p><b>Registered:</b> '+esc(t.created_at||"Not available")+'</p>';
 $("profileModal").classList.add("show");
}
async function approveTeacher(t){
 if(!confirm("Approve "+t.full_name+"'s teacher account?"))return;
 try{const result=await api("/api/admin/teachers/"+t.id+"/approve",{method:"PATCH",body:"{}"});message(result.message);await loadTeachers();}
 catch(error){message(error.message);}
}
async function rejectTeacher(t){
 if(!confirm("Withdraw approval for "+t.full_name+"? This will make the account unapproved."))return;
 try{const result=await api("/api/admin/teachers/"+t.id+"/reject",{method:"PATCH",body:"{}"});message(result.message);await loadTeachers();}
 catch(error){message(error.message);}
}
async function deleteTeacher(t){
 if(!confirm("Permanently delete the teacher account for "+t.full_name+"? This cannot be undone."))return;
 if(!confirm("Confirm permanent deletion of "+t.full_name+"?"))return;
 try{const result=await api("/api/admin/teachers/"+t.id,{method:"DELETE"});message(result.message);await loadTeachers();}
 catch(error){message(error.message);}
}
$("logoutButton").addEventListener("click",async()=>{
 try{await api("/api/admin/logout",{method:"POST",body:"{}"});location.href="admin-login.html";}
 catch(error){message(error.message);}
});
async function startPage(){try{await checkAdmin();await loadTeachers();}catch(error){message(error.message);}}
startPage();
</script>
</body>
</html>`;

fs.writeFileSync(pageFile, html);
console.log("Professional admin-teachers.html created.");
console.log("Backups saved. Existing database records were not changed.");
