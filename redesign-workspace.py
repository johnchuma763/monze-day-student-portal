from pathlib import Path
import re

p = Path("student-assignments.html")
s = p.read_text()

# Replace the old formula, calculation, answer and drawing interface.
start = s.rfind('<div class="field">', 0, s.index('for="formulaText"'))
end = s.rfind('<div class="field">', 0, s.index('for="submissionFile"'))

if start < 0 or end <= start:
    raise SystemExit("Could not locate the workspace HTML sections. No changes made.")

new_html = r'''
<div class="workspace-intro">
 <p>Choose the workspace that matches your assignment. Your work is saved automatically.</p>
 <div class="mode-switch">
  <button type="button" class="mode-card active" id="calculationModeBtn" onclick="setWorkspaceMode('calculation')">
   <span>∑</span><strong>Calculation Mode</strong><small>Mathematics, Physics, Chemistry and numerical work</small>
  </button>
  <button type="button" class="mode-card" id="writingModeBtn" onclick="setWorkspaceMode('writing')">
   <span>✍</span><strong>Writing Mode</strong><small>English, Biology, History, Geography, essays and reports</small>
  </button>
 </div>
</div>

<section id="calculationPanel" class="workspace-panel">
 <div class="workspace-heading">
  <span>∑</span><div><h3>Calculation Workspace</h3><p>Formulas, symbols and step-by-step working.</p></div>
 </div>

 <div class="suggestion-box">
  <strong>📚 Subject & topic suggestions</strong>
  <p id="subjectSuggestion">Suggestions will be selected using your assignment subject and topic.</p>
  <div id="formulaSuggestions" class="suggestion-list"></div>
  <div id="diagramSuggestion" class="diagram-suggestion"></div>
 </div>

 <div class="field">
  <label for="formulaText">MATHEMATICAL FORMULA / EQUATION</label>
  <textarea id="formulaText" class="formula-input" rows="3" maxlength="20000"
   placeholder="Enter your formula or equation here..."
   style="width:100%;padding:14px;border:1px solid #dce3ed;border-radius:10px;font:inherit;resize:vertical"></textarea>
  <div class="formula-toolbar" id="formulaToolbar">
   <button type="button" class="formula-symbol" data-symbol="{">{ }</button>
   <button type="button" class="formula-symbol" data-symbol=" < ">&lt;</button>
   <button type="button" class="formula-symbol" data-symbol=" > ">&gt;</button>
   <button type="button" class="formula-symbol" data-symbol=" = ">=</button>
   <button type="button" class="formula-symbol" data-symbol=" ∈ ">∈</button>
   <button type="button" class="formula-symbol" data-symbol=" ∉ ">∉</button>
   <button type="button" class="formula-symbol" data-symbol=" ⊂ ">⊂</button>
   <button type="button" class="formula-symbol" data-symbol=" ∪ ">∪</button>
   <button type="button" class="formula-symbol" data-symbol=" ∩ ">∩</button>
   <button type="button" class="formula-symbol" data-symbol=" × ">×</button>
   <button type="button" class="formula-symbol" data-symbol=" ÷ ">÷</button>
   <button type="button" class="formula-symbol" data-symbol=" ± ">±</button>
   <button type="button" class="formula-symbol" data-symbol=" √()">√</button>
   <button type="button" class="formula-symbol" data-symbol=" π ">π</button>
   <button type="button" class="formula-symbol" data-symbol=" ² ">x²</button>
   <button type="button" class="formula-symbol" data-symbol=" ³ ">x³</button>
   <button type="button" class="formula-symbol" data-symbol=" ≤ ">≤</button>
   <button type="button" class="formula-symbol" data-symbol=" ≥ ">≥</button>
   <button type="button" class="formula-symbol" data-symbol=" ≠ ">≠</button>
   <button type="button" class="formula-symbol" data-symbol=" → ">→</button>
   <button type="button" class="formula-symbol" data-symbol=" ∞ ">∞</button>
   <button type="button" class="formula-symbol" data-symbol=" € ">€</button>
  </div>
  <div class="formula-preview" id="formulaPreview">Your formula will appear here.</div>
 </div>

 <div class="field">
  <label for="calculationText">STEP-BY-STEP WORKING</label>
  <textarea id="calculationText" rows="10" maxlength="50000"
   placeholder="1. Write the information given&#10;2. Choose the correct formula&#10;3. Substitute the values&#10;4. Show each calculation step&#10;5. Write your final answer..."
   style="width:100%;min-height:220px;padding:14px;border:1px solid #ccd3df;border-radius:10px;font:inherit;resize:vertical;line-height:1.8"></textarea>
 </div>
</section>

<section id="writingPanel" class="workspace-panel" style="display:none">
 <div class="workspace-heading">
  <span>✍</span><div><h3>Writing Workspace</h3><p>Write essays, reports, explanations and extended answers.</p></div>
 </div>
 <div class="writing-tips">
  <strong>Writing guide</strong>
  <p>Organise your work clearly. Use an introduction, well-developed paragraphs and a conclusion where appropriate.</p>
 </div>
 <div class="field">
  <label for="answerText">YOUR WRITTEN ANSWER</label>
  <textarea id="answerText" rows="16" maxlength="50000"
   placeholder="Start writing your answer here..."
   style="width:100%;min-height:360px;padding:17px;border:1px solid #ccd3df;border-radius:10px;font:inherit;resize:vertical;line-height:1.9"></textarea>
  <small id="wordCount">0 words</small>
 </div>
</section>
'''

s = s[:start] + new_html + "\n" + s[end:]

# Remove the old canvas implementation.
a = s.find('const drawingUndo =')
b = s.find('function updateFormulaPreview()', a)
if a < 0 or b < 0:
    raise SystemExit("Could not locate old drawing JavaScript.")
s = s[:a] + 'let activeWorkspaceMode = "calculation";\n' + s[b:]

# Remove drawing fields from saved drafts.
s = re.sub(
 r'function workspaceData\(\)\s*\{.*?\n\s*\}',
 '''function workspaceData() {
 return {
  answer_text:document.getElementById("answerText").value,
  calculation_text:document.getElementById("calculationText").value,
  formula_text:document.getElementById("formulaText").value,
  workspace_mode:activeWorkspaceMode
 };
}''',
 s, count=1, flags=re.S
)

# Add mode switching and subject-based suggestions.
anchor = 'function queueDraftAutosave()'
pos = s.find(anchor)
if pos < 0:
    raise SystemExit("Could not locate autosave function.")

mode_js = r'''
function setWorkspaceMode(mode) {
 activeWorkspaceMode = mode === "writing" ? "writing" : "calculation";
 const calc = document.getElementById("calculationPanel");
 const writing = document.getElementById("writingPanel");
 calc.style.display = activeWorkspaceMode === "calculation" ? "block" : "none";
 writing.style.display = activeWorkspaceMode === "writing" ? "block" : "none";
 document.getElementById("calculationModeBtn").classList.toggle("active",activeWorkspaceMode==="calculation");
 document.getElementById("writingModeBtn").classList.toggle("active",activeWorkspaceMode==="writing");
 queueDraftAutosave();
}

function loadSubjectSuggestions(assignment) {
 const subject = String(assignment?.subject_name || assignment?.subject || "").toLowerCase();
 const topic = String((assignment?.title || "") + " " + (assignment?.instructions || "")).toLowerCase();
 const label = assignment?.subject_name || assignment?.subject || "your subject";
 document.getElementById("subjectSuggestion").textContent =
  "Detected subject: " + label + ". Suggestions are based on the assignment title and instructions.";

 let items = [];
 let diagram = "";

 if (/math/.test(subject)) {
  items = [
   ["Algebra: a + b = c","a + b = c"],
   ["Linear equation: ax + b = c","ax + b = c"],
   ["Quadratic formula","x = (-b ± √(b² - 4ac)) / 2a"],
   ["Difference of squares","a² - b² = (a - b)(a + b)"],
   ["Area of a triangle","A = ½ × base × height"],
   ["Area of a circle","A = πr²"],
   ["Pythagoras","a² + b² = c²"],
   ["Percentage","Percentage = (part / whole) × 100"]
  ];
  if (/set|venn/.test(topic)) diagram = "Set diagram guide: A ∪ B means everything in A or B. A ∩ B means elements shared by both sets.";
  else if (/triangle|geometry|pythag/.test(topic)) diagram = "Triangle guide: label the three sides a, b and c. For a right-angled triangle, a² + b² = c².";
  else if (/graph|coordinate|linear/.test(topic)) diagram = "Graph guide: draw horizontal x-axis and vertical y-axis. Plot each ordered pair (x, y).";
  else if (/algebra|equation|factor/.test(topic)) diagram = "Algebra guide: show each operation on a new line and keep both sides of an equation balanced.";
 } else if (/physics/.test(subject)) {
  items = [
   ["Speed","speed = distance / time"],
   ["Acceleration","a = (v - u) / t"],
   ["Force","F = m × a"],
   ["Weight","W = m × g"],
   ["Density","density = mass / volume"],
   ["Ohm's law","V = I × R"],
   ["Electrical power","P = V × I"],
   ["Work done","W = F × d"]
  ];
  if (/electric|circuit|current|voltage/.test(topic)) diagram = "Circuit guide: identify the power source, connecting wires and components. Label current (I), voltage (V) and resistance (R).";
  else if (/force|motion|speed|velocity/.test(topic)) diagram = "Motion guide: draw the direction of movement with an arrow. Label distance, time and velocity where relevant.";
  else if (/light|ray|reflection/.test(topic)) diagram = "Ray diagram guide: show the incident ray, normal line and reflected ray with clear labels.";
 } else if (/chem/.test(subject)) {
  items = [
   ["Moles","n = mass / molar mass"],
   ["Concentration","c = n / V"],
   ["Density","density = mass / volume"],
   ["Relative molecular mass","Mr = sum of relative atomic masses"],
   ["pH","pH = -log₁₀[H⁺]"],
   ["Percentage composition","% = (mass of element / total mass) × 100"]
  ];
  if (/atom|electron|proton|neutron/.test(topic)) diagram = "Atomic structure guide: show a labelled nucleus and electron shells. Place protons and neutrons in the nucleus.";
  else if (/bond/.test(topic)) diagram = "Bonding guide: use labelled dots or crosses to show the outer-shell electrons involved.";
  else if (/reaction|equation/.test(topic)) diagram = "Reaction guide: write reactants on the left and products on the right, separated by an arrow. Balance each element.";
 } else {
  items = [
   ["Ratio","a : b"],
   ["Percentage","(part / whole) × 100"],
   ["Average","sum of values / number of values"],
   ["Unit conversion","write the original value and conversion factor"]
  ];
  diagram = "Organise information using labelled tables, flow diagrams or clearly named parts where appropriate.";
 }

 const list = document.getElementById("formulaSuggestions");
 list.innerHTML = items.map((item,i) =>
  `<button type="button" class="suggestion-chip" data-suggestion="${i}"><strong>${esc(item[0])}</strong><span>${esc(item[1])}</span></button>`
 ).join("");
 list.querySelectorAll("[data-suggestion]").forEach(button => {
  button.addEventListener("click", () => {
   const item = items[Number(button.dataset.suggestion)];
   const input = document.getElementById("formulaText");
   input.setRangeText(item[1],input.selectionStart,input.selectionEnd,"end");
   input.focus();updateFormulaPreview();queueDraftAutosave();
  });
 });
 document.getElementById("diagramSuggestion").textContent = diagram;
}

'''
s = s[:pos] + mode_js + s[pos:]

# Replace openSubmit and remove canvas restoration.
a = s.find('async function openSubmit(')
b = s.find('document.getElementById("assignmentList").addEventListener', a)
if a < 0 or b < 0:
    raise SystemExit("Could not locate openSubmit function.")
s = s[:a] + r'''async function openSubmit(id, title) {
 const assignment=assignments.find(a=>String(a.id)===String(id));
 clearTimeout(autosaveTimer);
 isRestoringWorkspace=true;
 activeWorkspaceId=id;
 document.getElementById("assignmentId").value=id;
 document.getElementById("assignmentTitle").textContent=title;
 document.getElementById("submissionFile").value="";
 document.getElementById("answerText").value=assignment?.answer_text||"";
 document.getElementById("calculationText").value=assignment?.calculation_text||"";
 document.getElementById("formulaText").value=assignment?.formula_text||"";
 updateFormulaPreview();
 document.getElementById("assignmentQuestion").textContent=assignment?.instructions||"No question provided.";
 loadSubjectSuggestions(assignment);
 const subject = String(assignment?.subject_name || assignment?.subject || "").toLowerCase();
 const mode = /math|physics|chem/.test(subject) ? "calculation" : "writing";
 setWorkspaceMode(mode);
 document.getElementById("notice").className="notice";
 document.getElementById("notice").textContent="";
 document.getElementById("submitModal").classList.add("show");
 isRestoringWorkspace=false;
}

''' + s[b:]

# Remove drawing values and submission fields.
s = re.sub(r'\s*const calculationDrawing = drawingValue\("calculation"\);', '', s)
s = re.sub(r'\s*const answerDrawing = drawingValue\("answer"\);', '', s)
s = s.replace(
 'if (!answer.trim() && !calculation.trim() && !formula.trim() && !calculationDrawing && !answerDrawing && !file) {',
 'if (!(activeWorkspaceMode === "writing" ? answer.trim() : (calculation.trim() || formula.trim())) && !file) {'
)
s = s.replace(
 '"Add written work, a formula, a drawing or attach a file before submitting."',
 '"Add your work in the selected workspace or attach a file before submitting."'
)
s = re.sub(r'\s*form\.append\("calculation_drawing", calculationDrawing\);', '', s)
s = re.sub(r'\s*form\.append\("answer_drawing", answerDrawing\);', '', s)
s = s.replace('form.append("formula_text", formula);', 'form.append("formula_text", formula);\n form.append("workspace_mode", activeWorkspaceMode);')

# Remove canvas initialization.
s = s.replace('setupDrawing("calculation");', '')
s = s.replace('setupDrawing("answer");', '')

# Word count and mode-aware autosave listeners.
s = s.replace(
 '["answerText","calculationText","formulaText"].forEach(id=>{',
 '''document.getElementById("answerText").addEventListener("input",()=>{
 const words=document.getElementById("answerText").value.trim().split(/\\s+/).filter(Boolean).length;
 document.getElementById("wordCount").textContent=words+" words";
 queueDraftAutosave();
});
["answerText","calculationText","formulaText"].forEach(id=>{'''
)

# Add a polished responsive style block.
style = r'''
<style>
.workspace-intro,.workspace-panel{background:#fff;border:1px solid #e2e8f0;border-radius:15px;padding:18px;margin:16px 0}
.workspace-intro>p{color:#64748b;margin:0 0 14px}
.mode-switch{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.mode-card{border:1px solid #dce3ed;background:#f8fafc;border-radius:12px;padding:16px;text-align:left;cursor:pointer;color:#102b50;display:grid;gap:6px}
.mode-card>span{font-size:25px;color:#b58a28}.mode-card strong{font-size:15px}.mode-card small{color:#64748b;line-height:1.5}
.mode-card.active{border:2px solid #d9ad45;background:#fffaf0;box-shadow:0 3px 12px #102b5012}
.workspace-heading{display:flex;align-items:center;gap:12px;border-bottom:1px solid #e8edf3;padding-bottom:13px;margin-bottom:16px}
.workspace-heading>span{background:#102b50;color:#fff;border-radius:11px;padding:12px;font-size:22px}
.workspace-heading h3{margin:0;color:#102b50}.workspace-heading p{margin:4px 0 0;color:#64748b;font-size:13px}
.suggestion-box,.writing-tips{background:#f4f7fb;border-left:4px solid #d9ad45;border-radius:9px;padding:14px;margin:14px 0}
.suggestion-box p,.writing-tips p{color:#64748b;margin:6px 0}
.suggestion-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}
.suggestion-chip{background:#fff;border:1px solid #dce3ed;border-radius:8px;padding:10px;text-align:left;display:grid;gap:5px;cursor:pointer;color:#102b50}
.suggestion-chip span{font-size:12px;color:#64748b;overflow-wrap:anywhere}
.suggestion-chip:hover{border-color:#d9ad45}
.diagram-suggestion{margin-top:12px;padding:11px;background:#fff;border-radius:8px;color:#334155;font-size:13px;line-height:1.6}
.workspace-panel .field{margin:18px 0}
.workspace-panel .field label{display:block;font-weight:700;color:#102b50;margin-bottom:9px}
#formulaToolbar{display:flex;flex-wrap:wrap;gap:7px;margin:10px 0}
#formulaToolbar button{border:1px solid #dce3ed;background:#f8fafc;border-radius:7px;padding:8px 11px;color:#102b50;cursor:pointer}
#formulaToolbar button:hover{background:#fff5d9;border-color:#d9ad45}
#wordCount{display:block;text-align:right;color:#64748b;margin-top:7px}
@media(max-width:600px){.mode-switch,.suggestion-list{grid-template-columns:1fr}.workspace-intro,.workspace-panel{padding:13px}.mode-card{padding:13px}}
</style>
'''
if '</head>' in s and 'workspace-intro{' not in s:
    s = s.replace('</head>', style + '\n</head>', 1)

p.write_text(s)
print("SUCCESS: Calculation/Writing workspace installed; drawing canvases removed.")
