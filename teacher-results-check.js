
const $ = id => document.getElementById(id);

let teacher = null;
let selectedStudent = null;
let teacherClasses = [];
let teacherSubjects = [];

$("currentYear").textContent = new Date().getFullYear();

function escapeHTML(value) {
 return String(value ?? "").replace(/[&<>"']/g, c => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
 })[c]);
}

function normalizeClass(value) {
 return String(value || "").trim().replace(/\s+/g,"").toLowerCase();
}

function showMessage(id, text, success=false) {
 const box = $(id);
 box.textContent = text;
 box.className = "message " + (success ? "success" : "error");
}

function hideMessage(id) {
 $(id).className = "message";
 $(id).textContent = "";
}

async function api(url, options={}) {
 const response = await fetch(url, {
  credentials:"same-origin",
  ...options,
  headers:{
   ...(options.body ? {"Content-Type":"application/json"} : {}),
   ...(options.headers || {})
  }
 });

 const data = await response.json().catch(() => ({}));

 if (response.status === 401) {
  window.location.href = "teacher-login.html";
  throw new Error("Please log in again.");
 }

 if (!response.ok) {
  throw new Error(data.message || "Request failed.");
 }

 return data;
}

function populateSelect(element, values, placeholder) {
 element.innerHTML =
  `<option value="">${escapeHTML(placeholder)}</option>` +
  values.map(value =>
   `<option value="${escapeHTML(value)}">${escapeHTML(value)}</option>`
  ).join("");
}

async function loadTeacher() {
 try {
  teacher = await api("/api/teacher/me");

  $("teacherName").textContent =
   teacher.full_name || "Teacher Results Portal";

  $("teacherDetails").textContent =
   (teacher.email || "") +
   (teacher.is_class_teacher ? " • Class Teacher" : " • Subject Teacher");

  teacherSubjects = String(teacher.subjects || "")
   .split(",").map(v=>v.trim()).filter(Boolean);

  teacherClasses = String(teacher.classes || "")
   .split(",").map(v=>v.trim()).filter(Boolean);

  if (teacher.assigned_class) teacherClasses.push(teacher.assigned_class);

  const uniqueClasses = [...new Map(
   teacherClasses.map(c=>[normalizeClass(c),c])
  ).values()];

  populateSelect($("searchClass"), uniqueClasses, "Select class");
  populateSelect($("otherSubject"), teacherSubjects, "Select your subject");

  const isClassTeacher =
   teacher.is_class_teacher === true ||
   Number(teacher.is_class_teacher) === 1 ||
   teacher.is_class_teacher === "t";

  if (!isClassTeacher) {
   $("endTermSection").style.display = "none";
  }

  await loadResults();
 } catch(error) {
  console.error(error);
  if (!error.message.includes("log in")) {
   showMessage("searchMessage", error.message);
  }
 }
}

async function searchStudent() {
 hideMessage("searchMessage");
 $("studentFound").style.display = "none";
 selectedStudent = null;

 const studentNumber = $("searchStudentNumber").value.trim();
 const className = $("searchClass").value;

 if (!studentNumber || !className) {
  showMessage("searchMessage","Enter the student number and select the class.");
  return;
 }

 $("searchButton").disabled = true;

 try {
  const query = new URLSearchParams({studentNumber,className});
  const student = await api("/api/teacher/search-student?" + query);

  selectedStudent = student;

  $("foundName").textContent = student.full_name;
  $("foundDetails").textContent =
   "Student Number: " + student.student_number +
   " • Class: " + student.class_name;

  $("studentFound").style.display = "block";
  showMessage("searchMessage","Student verified successfully.",true);

  await loadOfficialSubjects();
 } catch(error) {
  showMessage("searchMessage",error.message);
 } finally {
  $("searchButton").disabled = false;
 }
}

async function loadOfficialSubjects() {
 const isClassTeacher =
  teacher && (
   teacher.is_class_teacher === true ||
   Number(teacher.is_class_teacher) === 1 ||
   teacher.is_class_teacher === "t"
  );

 if (!isClassTeacher || !selectedStudent) return;

 $("officialSubjects").innerHTML =
  '<p class="hint">Loading official subjects...</p>';

 try {
  const query = new URLSearchParams({
   className:selectedStudent.class_name
  });

  const subjects = await api(
   "/api/teacher/official-subjects?" + query
  );

  if (!subjects.length) {
   $("officialSubjects").innerHTML =
    '<p class="hint">No official subjects are configured for this class.</p>';
   return;
  }

  $("officialSubjects").innerHTML = subjects.map((subject,index)=>`
   <div class="subject-card">
    <h3>${escapeHTML(subject)}</h3>

    <input type="hidden" class="official-subject"
     value="${escapeHTML(subject)}">

    <div class="field">
     <label>Score (0–100)</label>
     <input class="official-score" type="number" min="0" max="100"
      step="0.01" required>
    </div>

    <div class="field">
     <label>Grade</label>
     <select class="official-grade" required>
      <option value="">Select grade</option>
      <option>Distinction</option>
      <option>Merit</option>
      <option>Credit</option>
      <option>Pass</option>
      <option>Fail</option>
     </select>
    </div>

    <div class="field">
     <label>Remarks</label>
     <input class="official-remarks" placeholder="Optional remarks">
    </div>
   </div>
  `).join("");
 } catch(error) {
  $("officialSubjects").innerHTML = "";
  showMessage("endTermNotice",error.message);
 }
}

$("searchButton").addEventListener("click",searchStudent);

$("clearSearch").addEventListener("click",()=>{
 selectedStudent = null;
 $("searchStudentNumber").value = "";
 $("searchClass").value = "";
 $("studentFound").style.display = "none";
 $("officialSubjects").innerHTML = "";
 hideMessage("searchMessage");
 hideMessage("endTermNotice");
});

$("endTermForm").addEventListener("submit",async event=>{
 event.preventDefault();
 hideMessage("endTermNotice");

 if (!selectedStudent) {
  showMessage("endTermNotice","Search and verify a student first.");
  return;
 }

 const subjectCards = [...document.querySelectorAll(".subject-card")];

 if (!subjectCards.length) {
  showMessage("endTermNotice","No official subjects are available.");
  return;
 }

 const subjects = subjectCards.map(card=>({
  subject:card.querySelector(".official-subject").value,
  score:card.querySelector(".official-score").value,
  grade:card.querySelector(".official-grade").value,
  remarks:card.querySelector(".official-remarks").value
 }));

 if (subjects.some(item =>
  item.score === "" || !item.grade ||
  Number(item.score)<0 || Number(item.score)>100
 )) {
  showMessage("endTermNotice","Complete every official subject with a valid score and grade.");
  return;
 }

 $("saveEndTerm").disabled = true;

 try {
  const result = await api("/api/teacher/end-term-results",{
   method:"POST",
   body:JSON.stringify({
    studentNumber:selectedStudent.student_number,
    className:selectedStudent.class_name,
    term:$("endTermTerm").value,
    year:$("endTermYear").value,
    subjects
   })
  });

  showMessage("endTermNotice",result.message,true);
  $("endTermForm").reset();
  $("endTermYear").value = new Date().getFullYear();
  await loadResults();
 } catch(error) {
  showMessage("endTermNotice",error.message);
 } finally {
  $("saveEndTerm").disabled = false;
 }
});

$("otherForm").addEventListener("submit",async event=>{
 event.preventDefault();
 hideMessage("otherMessage");

 if (!selectedStudent) {
  showMessage("otherMessage","Search and verify a student first.");
  return;
 }

 $("saveOther").disabled = true;

 try {
  const result = await api("/api/teacher/other-assessments",{
   method:"POST",
   body:JSON.stringify({
    studentNumber:selectedStudent.student_number,
    className:selectedStudent.class_name,
    assessmentKind:$("otherKind").value,
    assessmentName:$("otherName").value.trim(),
    subject:$("otherSubject").value,
    term:$("otherTerm").value,
    year:$("otherYear").value,
    score:$("otherScore").value,
    grade:$("otherGrade").value,
    remarks:$("otherRemarks").value
   })
  });

  showMessage("otherMessage",result.message,true);
  $("otherForm").reset();
  $("otherYear").value = new Date().getFullYear();
  await loadResults();
 } catch(error) {
  showMessage("otherMessage",error.message);
 } finally {
  $("saveOther").disabled = false;
 }
});

function renderRows(elementId,rows,category) {
 const body = $(elementId);

 if (!rows.length) {
  const count = category === "other" ? 10 : 9;
  body.innerHTML =
   `<tr><td colspan="${count}" class="empty">No records available.</td></tr>`;
  return;
 }

 body.innerHTML = rows.map(row=>`
  <tr>
   <td>${escapeHTML(row.full_name)}</td>
   <td>${escapeHTML(row.student_number)}</td>
   <td>${escapeHTML(row.class_name)}</td>
   ${category === "other" ?
    `<td>${escapeHTML(row.assessment_name || row.assessment_kind || "-")}</td>` : ""}
   <td>${escapeHTML(row.subject)}</td>
   <td>${escapeHTML(row.term)}</td>
   <td>${escapeHTML(row.year)}</td>
   <td><strong>${escapeHTML(row.score)}%</strong></td>
   <td>${escapeHTML(row.grade)}</td>
   <td>${escapeHTML(row.remarks || "-")}</td>
  </tr>
 `).join("");
}

async function loadResults() {
 try {
  const rows = await api("/api/teacher/results");

  renderRows("endResultsBody",
   rows.filter(r=>r.assessment_type==="end_of_term"),"end");

  renderRows("otherResultsBody",
   rows.filter(r=>r.assessment_type==="other_assessment"),"other");

  renderRows("unclassifiedBody",
   rows.filter(r=>!r.assessment_type ||
    r.assessment_type==="unclassified"),"end");

 } catch(error) {
  console.error("Results loading error:",error);
 }
}

loadTeacher();
