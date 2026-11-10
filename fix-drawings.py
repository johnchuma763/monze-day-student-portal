from pathlib import Path
import re

p = Path("student-assignments.html")
s = p.read_text()

calc_board = """
<div class="drawing-board">
 <strong>✏️ Calculation Diagram</strong>
 <canvas id="calculationDrawingCanvas" width="1000" height="260"></canvas>
 <div class="drawing-actions">
  <button type="button" onclick="undoDrawing('calculationDrawingCanvas')">↶ Undo</button>
  <button type="button" onclick="clearDrawing('calculationDrawingCanvas')">Clear</button>
 </div>
 <small class="drawing-help">Draw diagrams, graphs and mathematical working here.</small>
</div>
"""

answer_board = """
<div class="drawing-board">
 <strong>✏️ Answer Diagram</strong>
 <canvas id="answerDrawingCanvas" width="1000" height="260"></canvas>
 <div class="drawing-actions">
  <button type="button" onclick="undoDrawing('answerDrawingCanvas')">↶ Undo</button>
  <button type="button" onclick="clearDrawing('answerDrawingCanvas')">Clear</button>
 </div>
 <small class="drawing-help">Draw and label diagrams for your written answers.</small>
</div>
"""

pattern = r'(</textarea>\s*</div>)(\s*</section>\s*<section id="writingPanel")'
s, n = re.subn(pattern, lambda m: m.group(1) + calc_board + m.group(2), s, count=1)
assert n == 1, "Calculation workspace location not found"

pattern = r'(<small id="wordCount">0 words</small>\s*</div>)(\s*</section>)'
s, n = re.subn(pattern, lambda m: m.group(1) + answer_board + m.group(2), s, count=1)
assert n == 1, "Writing workspace location not found"

drawing_js = r'''
const drawingUndoStacks = {};

function initDrawingBoard(id) {
 const canvas = document.getElementById(id);
 if (!canvas || canvas.dataset.ready) return;

 canvas.dataset.ready = "1";
 canvas.dataset.hasDrawing = "false";
 drawingUndoStacks[id] = [];

 const ctx = canvas.getContext("2d");
 ctx.lineWidth = 4;
 ctx.lineCap = "round";
 ctx.lineJoin = "round";
 ctx.strokeStyle = "#102b50";

 let drawing = false;

 function point(e) {
  const r = canvas.getBoundingClientRect();
  return {
   x: (e.clientX-r.left)*canvas.width/r.width,
   y: (e.clientY-r.top)*canvas.height/r.height
  };
 }

 canvas.addEventListener("pointerdown", e => {
  e.preventDefault();
  drawingUndoStacks[id].push({
   data: canvas.toDataURL(),
   has: canvas.dataset.hasDrawing === "true"
  });
  if (drawingUndoStacks[id].length > 20)
   drawingUndoStacks[id].shift();

  drawing = true;
  canvas.setPointerCapture(e.pointerId);
  const p = point(e);
  ctx.beginPath();
  ctx.moveTo(p.x,p.y);
 });

 canvas.addEventListener("pointermove", e => {
  if (!drawing) return;
  e.preventDefault();
  const p = point(e);
  ctx.lineTo(p.x,p.y);
  ctx.stroke();
  canvas.dataset.hasDrawing = "true";
 });

 function finish() {
  if (!drawing) return;
  drawing = false;
  queueDraftAutosave();
 }

 canvas.addEventListener("pointerup", finish);
 canvas.addEventListener("pointercancel", finish);
 canvas.addEventListener("pointerleave", finish);
}

function getDrawingData(id) {
 const canvas = document.getElementById(id);
 return canvas && canvas.dataset.hasDrawing === "true"
  ? canvas.toDataURL("image/png")
  : "";
}

function restoreDrawingCanvases(assignment) {
 ["calculationDrawingCanvas","answerDrawingCanvas"].forEach(id => {
  const canvas = document.getElementById(id);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0,0,canvas.width,canvas.height);
  canvas.dataset.hasDrawing = "false";
  drawingUndoStacks[id] = [];

  const key = id === "calculationDrawingCanvas"
   ? "calculation_drawing" : "answer_drawing";

  if (assignment?.[key]) {
   const img = new Image();
   img.onload = () => {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
    canvas.dataset.hasDrawing = "true";
   };
   img.src = assignment[key];
  }
 });
}

function undoDrawing(id) {
 const canvas = document.getElementById(id);
 const stack = drawingUndoStacks[id] || [];
 if (!stack.length) return;

 const previous = stack.pop();
 const img = new Image();

 img.onload = () => {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(img,0,0,canvas.width,canvas.height);
  canvas.dataset.hasDrawing = String(previous.has);
  queueDraftAutosave();
 };

 img.src = previous.data;
}

function clearDrawing(id) {
 const canvas = document.getElementById(id);
 const stack = drawingUndoStacks[id] || [];

 stack.push({
  data: canvas.toDataURL(),
  has: canvas.dataset.hasDrawing === "true"
 });

 const ctx = canvas.getContext("2d");
 ctx.clearRect(0,0,canvas.width,canvas.height);
 canvas.dataset.hasDrawing = "false";
 queueDraftAutosave();
}

document.addEventListener("DOMContentLoaded", () => {
 initDrawingBoard("calculationDrawingCanvas");
 initDrawingBoard("answerDrawingCanvas");
});
'''

marker = "function workspaceData() {"
assert marker in s and "function initDrawingBoard" not in s
s = s.replace(marker, drawing_js + "\n" + marker, 1)

s = s.replace(
 'formula_text: document.getElementById("formulaText").value,',
 'formula_text: document.getElementById("formulaText").value,\n'
 '    calculation_drawing: getDrawingData("calculationDrawingCanvas"),\n'
 '    answer_drawing: getDrawingData("answerDrawingCanvas"),',
 1
)

marker = ' updateFormulaPreview();\n document.getElementById("assignmentQuestion")'
assert marker in s
s = s.replace(
 marker,
 ' updateFormulaPreview(); restoreDrawingCanvases(assignment); '
 'document.getElementById("assignmentQuestion")',
 1
)

marker = ' form.append("formula_text", formula);'
assert marker in s
s = s.replace(
 marker,
 marker + '\n'
 ' form.append("calculation_drawing", getDrawingData("calculationDrawingCanvas"));\n'
 ' form.append("answer_drawing", getDrawingData("answerDrawingCanvas"));',
 1
)

p.write_text(s)
print("SUCCESS: Both drawing boards, undo, clear, autosave, restoration and submission added.")
