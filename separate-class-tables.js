const fs = require("fs");
const file = "admin-subjects.html";
let html = fs.readFileSync(file, "utf8");

if (html.includes('id="classTables"')) {
    console.log("Separate class tables are already installed.");
    process.exit(0);
}

const oldSection = `<section class="card">
<h3>All Registered Class Subjects</h3>
<p>Classes are arranged in ascending order, from Form 1A to Form 4D.</p>
<div class="table-wrap">
<table>
<thead><tr><th>#</th><th>Form</th><th>Class</th><th>Subject</th><th>Actions</th></tr></thead>
<tbody id="subjectsTable"><tr><td colspan="5">Loading subjects...</td></tr></tbody>
</table>
</div>
</section>`;

if (!html.includes(oldSection)) {
    console.log("Could not find the existing subjects table section.");
    process.exit(1);
}

html = html.replace(oldSection, `<section class="card">
<h3>Registered Class Subjects</h3>
<p>Each class has its own subject table, arranged from Form 1A to Form 4D.</p>
<div id="classTables">
<p>Loading class tables...</p>
</div>
</section>`);

const start = html.indexOf("async function loadSubjects(){");
const end = html.indexOf("async function editSubject(", start);

if (start < 0 || end < 0) {
    console.log("Could not locate the subject-loading function.");
    process.exit(1);
}

const newFunction = `async function loadSubjects(){
 const container=document.getElementById("classTables");
 container.innerHTML="<p>Loading class tables...</p>";

 try{
  const subjects=await api("/api/admin/class-subjects");
  subjects.sort((a,b)=>Number(a.form_number)-Number(b.form_number)||
   a.class_letter.localeCompare(b.class_letter)||
   a.subject_name.localeCompare(b.subject_name));

  container.innerHTML="";

  for(let form=1;form<=4;form++){
   for(const letter of ["A","B","C","D"]){
    const className="Form "+form+letter;
    const group=subjects.filter(s=>
     Number(s.form_number)===form && s.class_letter.trim()===letter
    );

    const card=document.createElement("div");
    card.className="card";

    const heading=document.createElement("h3");
    heading.textContent=className;
    card.appendChild(heading);

    const wrap=document.createElement("div");
    wrap.className="table-wrap";

    const table=document.createElement("table");
    const thead=document.createElement("thead");
    thead.innerHTML="<tr><th>#</th><th>Subject</th><th>Actions</th></tr>";
    table.appendChild(thead);

    const tbody=document.createElement("tbody");

    if(!group.length){
     const row=document.createElement("tr");
     const cell=document.createElement("td");
     cell.colSpan=3;
     cell.textContent="No subjects registered for "+className+".";
     row.appendChild(cell);
     tbody.appendChild(row);
    }else{
     group.forEach((subject,index)=>{
      const row=document.createElement("tr");

      [index+1,subject.subject_name].forEach(value=>{
       const cell=document.createElement("td");
       cell.textContent=value;
       row.appendChild(cell);
      });

      const actions=document.createElement("td");
      const edit=document.createElement("button");
      edit.className="gold";
      edit.textContent="Edit";
      edit.onclick=()=>editSubject(subject);

      const remove=document.createElement("button");
      remove.className="danger";
      remove.textContent="Delete";
      remove.onclick=()=>deleteSubject(subject.id);

      actions.append(edit,remove);
      row.appendChild(actions);
      tbody.appendChild(row);
     });
    }

    table.appendChild(tbody);
    wrap.appendChild(table);
    card.appendChild(wrap);
    container.appendChild(card);
   }
  }
 }catch(error){
  container.innerHTML="<p>Unable to load class tables.</p>";
  showMessage(error.message,false);
 }
}

`;

html = html.slice(0,start)+newFunction+html.slice(end);
fs.writeFileSync(file,html);
console.log("Separate tables for all 16 classes installed successfully.");
