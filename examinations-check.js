
const classes=[];
for(let f=1;f<=4;f++)for(const s of ["A","B","C","D"])classes.push(`Form ${f}${s}`);
for(const name of classes){
 const a=document.createElement("option");a.value=name;a.textContent=name;className.appendChild(a);
 const b=document.createElement("option");b.value=name;b.textContent=name;classFilter.appendChild(b);
}
let examinations=[];

async function api(url,options={}){
 const response=await fetch(url,{credentials:"same-origin",headers:{"Content-Type":"application/json",...(options.headers||{})},...options});
 let data={};try{data=await response.json()}catch(e){}
 if(!response.ok){
  let detail=data.message||"";
  if(response.status===401)detail=detail||"Your admin session has expired. Please sign in again.";
  else if(response.status===403)detail=detail||"You do not have permission to view this page.";
  else if(response.status===404)detail=detail||"The examination API route was not found.";
  else detail=detail||`Server returned error ${response.status}. Check the Termux server log.`;
  throw new Error(detail);
 }
 return data;
}
function message(text,type="success"){
 status.textContent=text;status.className="status "+type;
 window.scrollTo({top:0,behavior:"smooth"});
 setTimeout(()=>status.className="status",5000);
}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function dateText(v){if(!v)return "";return new Date(String(v).slice(0,10)+"T00:00:00").toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}
function timeText(v){if(!v)return "";let [h,m]=String(v).slice(0,5).split(":");h=Number(h);return `${h%12||12}:${m} ${h>=12?"PM":"AM"}`}
function updateStats(){
 const today=new Date();today.setHours(0,0,0,0);
 totalCount.textContent=examinations.length;
 upcomingCount.textContent=examinations.filter(x=>new Date(String(x.exam_date).slice(0,10)+"T00:00:00")>=today).length;
 classCount.textContent=new Set(examinations.map(x=>x.class_name)).size;
}
function renderTable(){
 const container=document.getElementById("classSchedules");
 const q=searchInput.value.toLowerCase().trim();
 const selectedClass=classFilter.value;

 const rows=examinations.filter(x=>
  (!selectedClass||x.class_name===selectedClass)&&
  (
   String(x.subject).toLowerCase().includes(q)||
   String(x.venue).toLowerCase().includes(q)||
   String(x.instructions||"").toLowerCase().includes(q)
  )
 );

 const classOrder=name=>{
  const m=String(name).match(/^Form ([1-4])([A-D])$/);
  return m?(Number(m[1])-1)*4+"ABCD".indexOf(m[2]):999;
 };

 const groups={};
 rows.forEach(x=>{
  if(!groups[x.class_name])groups[x.class_name]=[];
  groups[x.class_name].push(x);
 });

 const names=Object.keys(groups).sort((a,b)=>classOrder(a)-classOrder(b));

 if(!names.length){
  container.innerHTML='<div class="class-empty">No examination schedules found for this selection.</div>';
  return;
 }

 container.innerHTML=names.map(name=>{
  const items=groups[name].sort((a,b)=>
   String(a.exam_date).localeCompare(String(b.exam_date))||
   String(a.start_time).localeCompare(String(b.start_time))
  );

  return `
   <section class="class-section">
    <div class="class-heading">
     <h3>${esc(name)}</h3>
     <span>${items.length} examination${items.length===1?"":"s"}</span>
    </div>
    <div class="class-table-wrap">
     <table class="class-table">
      <thead><tr>
       <th>SUBJECT</th><th>DATE</th><th>TIME</th>
       <th>VENUE</th><th>INSTRUCTIONS</th><th>ACTIONS</th>
      </tr></thead>
      <tbody>
       ${items.map(x=>`
        <tr>
         <td><b>${esc(x.subject)}</b></td>
         <td>${dateText(x.exam_date)}</td>
         <td>${timeText(x.start_time)} – ${timeText(x.end_time)}</td>
         <td>${esc(x.venue)}</td>
         <td>${esc(x.instructions||"—")}</td>
         <td>
          <button class="secondary small" onclick="editExam('${esc(x.id)}')">Edit</button>
          <button class="danger small" onclick="deleteExam('${esc(x.id)}')">Delete</button>
         </td>
        </tr>
       `).join("")}
      </tbody>
     </table>
    </div>
   </section>
  `;
 }).join("");
}

async function loadExaminations(){
 document.getElementById("classSchedules").innerHTML='<div class="class-empty">Loading examination schedules...</div>';
 try{examinations=await api("/api/admin/examinations");updateStats();renderTable()}
 catch(e){document.getElementById("classSchedules").innerHTML=`<div class="class-empty">${esc(e.message)}</div>`;message(e.message,"error")}
}
examForm.addEventListener("submit",async e=>{
 e.preventDefault();
 const id=examId.value;
 const data={class_name:className.value,subject:subject.value.trim(),exam_date:examDate.value,start_time:startTime.value,end_time:endTime.value,venue:venue.value.trim(),instructions:instructions.value.trim()};
 if(data.end_time<=data.start_time){message("End time must be later than start time.","error");return}
 saveButton.disabled=true;saveButton.textContent="Saving...";
 try{
  const result=await api(id?`/api/admin/examinations/${encodeURIComponent(id)}`:"/api/admin/examinations",{method:id?"PATCH":"POST",body:JSON.stringify(data)});
  message(result.message||"Examination saved successfully.");resetForm();await loadExaminations();
 }catch(err){message(err.message,"error")}
 finally{saveButton.disabled=false;saveButton.textContent="Save Examination"}
});
function editExam(id){
 const x=examinations.find(v=>String(v.id)===String(id));if(!x)return;
 examId.value=x.id;className.value=x.class_name;subject.value=x.subject;
 examDate.value=String(x.exam_date).slice(0,10);startTime.value=String(x.start_time).slice(0,5);
 endTime.value=String(x.end_time).slice(0,5);venue.value=x.venue;instructions.value=x.instructions||"";
 formTitle.textContent="Edit Examination";saveButton.textContent="Update Examination";cancelButton.hidden=false;
 document.querySelectorAll(".card")[0].scrollIntoView({behavior:"smooth"});
}
async function deleteExam(id){
 const x=examinations.find(v=>String(v.id)===String(id));if(!x)return;
 if(!confirm(`Delete ${x.subject} for ${x.class_name} on ${dateText(x.exam_date)}?`))return;
 try{const r=await api(`/api/admin/examinations/${encodeURIComponent(id)}`,{method:"DELETE"});message(r.message||"Examination deleted.");await loadExaminations()}
 catch(e){message(e.message,"error")}
}
function resetForm(){examForm.reset();examId.value="";formTitle.textContent="＋ Add Examination";saveButton.textContent="Save Examination";cancelButton.hidden=true}
searchInput.addEventListener("input",renderTable);classFilter.addEventListener("change",renderTable);
loadExaminations();
