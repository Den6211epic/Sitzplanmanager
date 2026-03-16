const students = [];
const tags = [];
let roomConfig = { rows: 3, tablesPerRow: 4 };
let lastSeating = null;
const renamingIds = new Set();

// Custom layout state
let customTables = []; // [{id, x, y, rotation, seats:2}]
let selectedCustomTableId = null;
let selectedCustomTableIds = new Set();
let blockedSeats = new Set();
let rubberBand = null;
let isDraggingGroup = false;
let dragGroupOffsets = [];
let dragState = null;
let canvasHovered = false;
let canvasMouseX = 500;
let canvasMouseY = 300;
let pendingTablePlacement = null;
let clipboard_tables = [];
let scannerLineFraction = 0.5;
let isDraggingScanner = false;

const CUSTOM_CANVAS_W = 1000;
const CUSTOM_CANVAS_H = 600;
const TABLE_W = 130;   // double-seat table width
const TABLE_H = 70;
const SINGLE_W = 70;   // single-seat table width  
const SINGLE_H = 70;
let SNAP_GRID = 10;  // snapping grid size in canvas px — can be changed via slider

const el = (id) => document.getElementById(id);

const tagColorPalette = [
  "#fee2e2", "#ffedd5", "#dcfce7", "#e0f2fe",
  "#f5d0fe", "#f9a8d4", "#fed7aa", "#bfdbfe", "#bbf7d0", "#a5f3fc"
];

function randomTagColor() {
  return tagColorPalette[Math.floor(Math.random() * tagColorPalette.length)];
}
function getTagById(id) { return tags.find((t) => t.id === id); }

function updateCounts() {
  el("student-count-label").textContent = students.length + " Schüler";
  el("tag-count-label").textContent = tags.length + " Tags";
}

function updateHash() {
  const b64 = exportStateToHash();
  history.replaceState(null, "", "#?" + b64);
}

/* === Theme === */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  el("theme-toggle-btn").textContent = theme === "dark" ? "☀️" : "🌙";
}
(function initTheme() {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(prefersDark ? "dark" : "light");
})();

/* === Layout type switching === */
function getLayoutType() {
  return el("layout-type-select").value;
}

function updateLayoutUI() {
  const type = getLayoutType();
  // Legacy hidden divs (kept for JS compatibility)
  el("config-linear").style.display = "none";
  el("config-custom").style.display = "none";
  // Toolbar control groups
  const lt = el("config-linear-toolbar");
  const ct = el("config-custom-toolbar");
  const ch = el("config-custom-hint");
  if (lt) lt.style.display = type === "linear" ? "flex" : "none";
  if (ct) ct.style.display = type === "custom" ? "flex" : "none";
  if (ch) ch.style.display = type === "custom" ? "" : "none";
  if (type === "custom") {
    const snap = el('toggle-snapping');
    const wrap = el('snap-grid-label-wrap');
    if(wrap && snap) wrap.style.opacity = snap.checked ? '1' : '0.4';
    renderCustomCanvas();
  }
}

el("layout-type-select").addEventListener("change", () => {
  updateLayoutUI();
  if (getLayoutType() !== "custom" && students.length) generate();
});

/* === State Export / Import === */
function exportStateToHash() {
  const snapEl = el("toggle-snapping");
  const scanLinEl = el("toggle-scanner-line");
  const scanLinCustEl = el("toggle-scanner-line-custom");
  const hideLinEl = el("toggle-hide-tags-linear");
  const hideCustEl = el("toggle-hide-tags-custom");
  const state = {
    students, tags, roomConfig,
    seating: lastSeating,
    layoutType: getLayoutType(),
    customTables,
    blockedSeats: [...blockedSeats],
    scannerLineFraction,
    snappingOn: snapEl ? snapEl.checked : true,
    snapGrid: SNAP_GRID,
    scannerLineVisible: scanLinEl ? scanLinEl.checked : true,
    scannerLineVisibleCustom: scanLinCustEl ? scanLinCustEl.checked : true,
    hideTagsLinear: hideLinEl ? hideLinEl.checked : false,
    hideTagsCustom: hideCustEl ? hideCustEl.checked : false,
  };
  const json = JSON.stringify(state);
  return btoa(unescape(encodeURIComponent(json)));
}

function importStateFromHash(b64) {
  try {
    const json = decodeURIComponent(escape(atob(b64)));
    const state = JSON.parse(json);
    students.length = 0;
    (state.students || []).forEach((s) => students.push(s));
    tags.length = 0;
    (state.tags || []).forEach((t) => tags.push(t));
    if (state.roomConfig) {
      roomConfig.rows = state.roomConfig.rows || 3;
      roomConfig.tablesPerRow = state.roomConfig.tablesPerRow || 4;
      el("rows-input").value = roomConfig.rows;
      el("tables-input").value = roomConfig.tablesPerRow;
    }
    if (state.layoutType) {
      el("layout-type-select").value = state.layoutType;
    }
    if (state.customTables) {
      customTables = state.customTables;
    }
    if (state.blockedSeats) blockedSeats = new Set(state.blockedSeats);
    if (typeof state.scannerLineFraction === 'number') scannerLineFraction = state.scannerLineFraction;
    if (typeof state.snappingOn === 'boolean') { const s=el('toggle-snapping'); if(s) s.checked=state.snappingOn; }
    if (typeof state.snapGrid === 'number') {
      SNAP_GRID = state.snapGrid;
      const si=el('snap-grid-input'); if(si) si.value=SNAP_GRID;
      const sv=el('snap-grid-value'); if(sv) sv.textContent=SNAP_GRID;
    }
    if (typeof state.scannerLineVisible === 'boolean') { const s=el('toggle-scanner-line'); if(s) s.checked=state.scannerLineVisible; }
    if (typeof state.scannerLineVisibleCustom === 'boolean') { const s=el('toggle-scanner-line-custom'); if(s) s.checked=state.scannerLineVisibleCustom; }
    if (typeof state.hideTagsLinear === 'boolean') { const s=el('toggle-hide-tags-linear'); if(s) s.checked=state.hideTagsLinear; }
    if (typeof state.hideTagsCustom === 'boolean') { const s=el('toggle-hide-tags-custom'); if(s) s.checked=state.hideTagsCustom; }
    renderTags();
    renderStudents();
    updateCounts();
    updateLayoutUI();
    if (state.seating) renderSeating(state.seating);
  } catch (e) {
    console.error("Fehler beim Laden:", e);
  }
}

(function checkHash() {
  const hash = window.location.hash;
  if (hash.startsWith("#?")) {
    importStateFromHash(hash.slice(2));
  } else {
    generate();
  }
})();

/* === Schüler === */
function addStudent() {
  const input = el("student-name-input");
  const name = input.value.trim();
  const errorEl = el("student-error");
  errorEl.textContent = "";
  if (!name) return;
  if (students.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
    errorEl.textContent = "Diesen Vornamen gibt es bereits."; return;
  }
  students.push({ id: crypto.randomUUID(), name, tagIds: [] });
  input.value = "";
  renderStudents(); updateCounts(); updateHash();
}

function deleteStudent(id) {
  const idx = students.findIndex((s) => s.id === id);
  if (idx >= 0) {
    students.splice(idx, 1);
    renamingIds.delete(id);
    updateCounts(); renderStudents();
    if (lastSeating) renderSeating(lastSeating);
    updateHash();
  }
}

/* === Tags === */
function addTag() {
  const input = el("tag-name-input");
  const name = input.value.trim();
  const errorEl = el("tag-error");
  errorEl.textContent = "";
  if (!name) { errorEl.textContent = "Tag-Name darf nicht leer sein."; return; }
  if (tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
    errorEl.textContent = "Diesen Tag gibt es bereits."; return;
  }
  const colorInput = el("tag-color-input");
  const raw = colorInput.value;
  const color = (raw && raw !== "#000000") ? raw : randomTagColor();
  const properties = {
    beforeLine: el("prop-beforeLine").checked,
    behindLine: el("prop-behindLine").checked,
    frontOnly: false,
    cantShareTable: el("prop-cantShareTable").checked,
    mustWindow: el("prop-mustWindow").checked,
    mustDoor: el("prop-mustDoor").checked,
    backOnly: false,
    middleOnly: false
  };
  tags.push({ id: crypto.randomUUID(), name, color, hidden: false, properties });
  input.value = "";
  ["prop-beforeLine","prop-behindLine","prop-cantShareTable","prop-mustWindow","prop-mustDoor"]
    .forEach((id) => { el(id).checked = false; });
  colorInput.value = randomTagColor();
  renderTags(); renderStudents(); updateCounts(); updateHash();
}

function removeTag(tagId) {
  const idx = tags.findIndex((t) => t.id === tagId);
  if (idx >= 0) {
    tags.splice(idx, 1);
    students.forEach((s) => { s.tagIds = s.tagIds.filter((id) => id !== tagId); });
    renderTags(); renderStudents(); updateCounts(); updateHash();
  }
}

function toggleTagHidden(tagId) {
  const tag = getTagById(tagId);
  if (tag) { tag.hidden = !tag.hidden; renderTags(); renderStudents(); updateHash(); }
}

/* === Render Tags === */
function renderTags() {
  const list = el("tag-list");
  const search = el("tag-search-input").value.trim().toLowerCase();
  list.innerHTML = "";
  tags.filter((t) => !search || t.name.toLowerCase().includes(search)).forEach((tag) => {
    const div = document.createElement("div");
    div.className = "list-item";
    div.innerHTML = `
      <span class="pill-tag${tag.hidden ? " hidden-tag" : ""}"
            style="background:${tag.color}"
            data-tag-id="${tag.id}">
        <span class="tag-color-dot" style="background:${tag.color}"></span>
        ${tag.name}
      </span>
      <div class="list-item-actions">
        <button class="btn-outline" style="font-size:0.7rem;padding:2px 7px;" data-hide>
          ${tag.hidden ? "Einblenden" : "Ausblenden"}
        </button>
        <button class="btn-outline" style="font-size:0.7rem;padding:2px 7px;" data-del>✕</button>
      </div>`;
    div.querySelector("[data-hide]").addEventListener("click", () => toggleTagHidden(tag.id));
    div.querySelector("[data-del]").addEventListener("click", () => removeTag(tag.id));
    list.appendChild(div);
  });
}

function getHideTagsChecked() {
  const type = getLayoutType();
  const id = type === 'custom' ? 'toggle-hide-tags-custom' : 'toggle-hide-tags-linear';
  const el2 = el(id);
  return el2 ? el2.checked : false;
}

/* === Render Students === */
function renderStudents() {
  const list = el("student-list");
  const search = el("student-search-input").value.trim().toLowerCase();
  const hideAllTags = getHideTagsChecked();
  list.innerHTML = "";
  students
    .filter((s) => !search || s.name.toLowerCase().includes(search))
    .forEach((student) => {
      const div = document.createElement("div");
      div.className = "list-item student-item";
      const isRenaming = renamingIds.has(student.id);
      const visibleTags = tags.filter((t) => !hideAllTags || !t.hidden);
      const unassigned = visibleTags.filter((t) => !student.tagIds.includes(t.id));

      div.innerHTML = `
        <div class="list-item-name${isRenaming ? " rename-mode" : ""}">
          ${isRenaming
            ? `<input class="rename-field" type="text" value="${student.name}" data-rename-input /><button class="btn-primary" style="font-size:0.7rem;padding:2px 7px;" data-save>✓</button>`
            : `<span>${student.name}</span>`}
          <div class="list-item-actions" style="margin-left:auto;">
            ${!isRenaming ? `<button class="btn-outline" style="font-size:0.7rem;padding:2px 7px;" data-rename>✏️</button>` : ""}
            <button class="btn-outline" style="font-size:0.7rem;padding:2px 7px;" data-delete>✕</button>
            ${!isRenaming && unassigned.length ? `<select class="btn-outline tag-select" data-tag-assign style="max-width:90px;">
              <option value="">＋ Tag</option>
              ${unassigned.map((t) => `<option value="${t.id}">${t.name}</option>`).join("")}
            </select>` : ""}
          </div>
        </div>
        <div class="list-item-tags">
          ${student.tagIds.map((tid) => {
            const t = getTagById(tid);
            if (!t || (hideAllTags && t.hidden)) return "";
            return `<span class="pill-tag" style="background:${t.color}" data-student-id="${student.id}" data-tag-id="${tid}">
              <span class="tag-color-dot" style="background:${t.color}"></span>${t.name} ✕</span>`;
          }).join("")}
        </div>`;

      if (isRenaming) {
        div.querySelector("[data-save]").addEventListener("click", () => {
          const newName = div.querySelector("[data-rename-input]").value.trim();
          if (newName) { student.name = newName; }
          renamingIds.delete(student.id);
          renderStudents(); updateHash();
        });
        div.querySelector("[data-rename-input]").addEventListener("keydown", (e) => {
          if (e.key === "Enter") div.querySelector("[data-save]").click();
        });
      } else {
        div.querySelector("[data-rename]").addEventListener("click", () => {
          renamingIds.add(student.id); renderStudents();
        });
      }
      div.querySelector("[data-delete]").addEventListener("click", () => deleteStudent(student.id));

      const tagAssign = div.querySelector("[data-tag-assign]");
      if (tagAssign) {
        tagAssign.addEventListener("change", () => {
          const tid = tagAssign.value;
          if (tid && !student.tagIds.includes(tid)) {
            student.tagIds.push(tid);
            renderStudents(); updateHash();
          }
        });
      }

      div.querySelectorAll(".pill-tag").forEach((span) => {
        span.addEventListener("click", () => {
          const s = students.find((st) => st.id === span.getAttribute("data-student-id"));
          if (!s) return;
          s.tagIds = s.tagIds.filter((id) => id !== span.getAttribute("data-tag-id"));
          renderStudents(); updateHash();
        });
      });

      list.appendChild(div);
    });
}

['toggle-hide-tags-linear', 'toggle-hide-tags-custom'].forEach(id => {
  const elem = el(id);
  if (elem) elem.addEventListener("change", () => {
    renderStudents();
    if (lastSeating) {
      const t = getLayoutType();
      if (t === 'linear') renderSeating(lastSeating);
      else if (t === 'custom') renderCustomCanvas();
    }
  });
});

/* === Sitzlogik === */
function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateSeats(rows, tablesPerRow) {
  const seats = [];
  for (let r = 0; r < rows; r++)
    for (let t = 0; t < tablesPerRow; t++)
      for (let s = 0; s < 2; s++)
        seats.push({ row: r, tableIndex: t, seatIndex: s });
  return seats;
}

function tableIdOfSeat(seat) { return seat.row + "-" + seat.tableIndex; }

function violatesConstraints(student, seat, assignment) {
  const studentTags = student.tagIds.map(getTagById).filter(Boolean);
  const p = (key) => studentTags.some(t => t.properties && t.properties[key]);
  const props = {
    beforeLine: p('beforeLine'), behindLine: p('behindLine'),
    frontOnly: p('frontOnly'), backOnly: p('backOnly'), middleOnly: p('middleOnly'),
    cantShareTable: p('cantShareTable'), mustWindow: p('mustWindow'), mustDoor: p('mustDoor')
  };
  // Scanner line constraints.
  // "vor Linie" (beforeLine) = seats CLOSER to the front (Pult), i.e. row < splitRow / y < scannerY
  // "hinter Linie" (behindLine) = seats FURTHER from the front, i.e. row >= splitRow / y >= scannerY
  if (props.beforeLine || props.behindLine) {
    if (getLayoutType() === 'custom' && seat.segment === 'custom') {
      const tb = customTables[seat.tableIndex];
      if (tb) {
        const sl = scannerLineFraction * CUSTOM_CANVAS_H;
        // "vor Linie": table must be strictly above the line (y < sl)
        // "hinter Linie": table must be at or below the line (y >= sl) — includes tables that touch the line
        if (props.beforeLine  && tb.y >= sl) return true;
        if (props.behindLine  && tb.y <  sl) return true;
      }
    } else {
      const totalRows = roomConfig.rows;
      const splitRow = Math.round(scannerLineFraction * totalRows);
      // "vor Linie": rows strictly before splitRow (row < splitRow)
      // "hinter Linie": rows at or after splitRow-1 — i.e. the row the line sits on is also allowed
      if (props.beforeLine  && seat.row >= splitRow) return true;
      if (props.behindLine  && seat.row <  splitRow - 1) return true;
    }
  }
  if (props.frontOnly && seat.row > 1) return true;
  if (props.backOnly && seat.row !== roomConfig.rows - 1) return true;
  if (props.middleOnly) {
    if (seat.tableIndex === 0 || seat.tableIndex === roomConfig.tablesPerRow - 1) return true;
  }
  if (props.mustWindow) {
    const isOuterTable = seat.tableIndex === 0 || seat.tableIndex === roomConfig.tablesPerRow - 1;
    if (!isOuterTable) return true;
  }
  if (props.mustDoor) {
    if (!(seat.row === roomConfig.rows - 1 && seat.tableIndex === 0)) return true;
  }
  if (props.cantShareTable) {
    const table = tableIdOfSeat(seat);
    for (const otherId in assignment) {
      const otherSeat = assignment[otherId];
      if (!otherSeat) continue;
      if (tableIdOfSeat(otherSeat) === table) {
        const other = students.find((s) => s.id === otherId);
        if (!other) continue;
        if (other.tagIds.map(getTagById).filter(Boolean).some(t => t.properties && t.properties.cantShareTable)) return true;
      }
    }
  }
  return false;
}

function computeAssignment(seatList) {
  const allSeats = seatList || generateSeats(roomConfig.rows, roomConfig.tablesPerRow);
  const seats = shuffleArray(allSeats);
  const shuffledStudents = shuffleArray(students);
  const assignment = {};
  const usedSeats = new Set();
  const unplaced = [];

  function seatKey(seat) { return seat.row + "-" + seat.tableIndex + "-" + seat.seatIndex; }

  function backtrack(i) {
    if (i >= shuffledStudents.length) return true;
    const student = shuffledStudents[i];
    let placed = false;
    for (const seat of seats) {
      const key = seatKey(seat);
      if (usedSeats.has(key)) continue;
      if (blockedSeats.has(key)) continue;
      if (violatesConstraints(student, seat, assignment)) continue;
      assignment[student.id] = seat;
      usedSeats.add(key);
      placed = true;
      if (backtrack(i + 1)) return true;
      usedSeats.delete(key);
      assignment[student.id] = null;
    }
    if (!placed) { unplaced.push(student); return backtrack(i + 1); }
    return false;
  }
  backtrack(0);

  const freeSeats = shuffleArray(allSeats.filter((seat) => !usedSeats.has(seatKey(seat))));
  let idx = 0;
  unplaced.forEach((s) => { assignment[s.id] = idx < freeSeats.length ? freeSeats[idx++] : null; });

  return {
    assignment,
    satisfied: Object.values(assignment).every((v) => v !== null) && unplaced.length === 0
  };
}


/* === Scanner Line DOM overlay (Linear + U-Shape) === */
function attachDOMScannerLine(container) {
  container.style.position = 'relative';
  const old = container.querySelector('.scanner-line-dom');
  if (old) old.remove();
  const line = document.createElement('div');
  line.className = 'scanner-line-dom';
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  // In light mode use a much darker teal so the line is visible against the light background
  const col = isDark ? '115,222,249' : '0,100,120';
  // Give the line a real pixel height (14px) centered on the dashed stroke so
  // pointer-events work reliably. The dashed line sits at the vertical midpoint.
  line.style.cssText = [
    'position:absolute', 'left:0', 'right:0',
    'height:14px',           // real hit area
    'margin-top:-7px',       // center on the fractional position
    'border:none',
    'background:repeating-linear-gradient(90deg,transparent,transparent 8px,rgba('+col+',0.75) 8px,rgba('+col+',0.75) 16px) center/auto 2px no-repeat',
    'cursor:grab', 'z-index:20', 'pointer-events:all',
    'top:calc('+((scannerLineFraction*100).toFixed(2))+'%)'
  ].join(';');
  const mkLabel = (text, isAbove) => {
    const s = document.createElement('span');
    s.textContent = text;
    s.style.cssText = 'position:absolute;right:14px;font-size:10px;color:rgba('+col+',0.9);font-family:system-ui;white-space:nowrap;pointer-events:none;user-select:none;'+(isAbove?'bottom:5px':'top:5px');
    return s;
  };
  line.appendChild(mkLabel('▲ vor Linie', true));
  line.appendChild(mkLabel('▼ hinter Linie', false));
  let dragging = false;
  let grabOffsetY = 0; // px offset from line center at grab moment
  line.addEventListener('pointerdown', e => {
    e.preventDefault();
    dragging = true;
    line.style.cursor = 'grabbing';
    line.setPointerCapture(e.pointerId);
    // Record offset from line center so no teleport on first move
    // Use offsetHeight (layout height) and scrollTop for correct abs Y
    const rect = container.getBoundingClientRect();
    const lineAbsY = rect.top + scannerLineFraction * container.offsetHeight - container.scrollTop;
    grabOffsetY = e.clientY - lineAbsY;
  });
  line.addEventListener('pointermove', e => {
    if (!dragging) return;
    const rect = container.getBoundingClientRect();
    // Subtract the grab offset; use offsetHeight and scrollTop consistently
    scannerLineFraction = Math.max(0.02, Math.min(0.98, (e.clientY - grabOffsetY - rect.top + container.scrollTop) / container.offsetHeight));
    line.style.top = 'calc('+((scannerLineFraction*100).toFixed(2))+'%)';
  });
  line.addEventListener('pointerup', () => { dragging = false; line.style.cursor = 'grab'; updateHash(); });
  container.appendChild(line);
}

/* =========================================================
   PULT – einzelner Tisch vorne
   ========================================================= */
function renderPult(container) {
  const pultRow = document.createElement("div");
  pultRow.className = "table-row pult-row";
  pultRow.style.cssText = "justify-content:center;margin-bottom:8px;";

  const wrapper = document.createElement("div");
  wrapper.style.cssText = "display:flex;flex-direction:column;align-items:center;";

  const tableDiv = document.createElement("div");
  tableDiv.className = "table pult-table";
  tableDiv.style.cssText = "width:120px;min-width:120px;height:50px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.9rem;letter-spacing:0.06em;";
  tableDiv.textContent = "Pult";

  wrapper.appendChild(tableDiv);
  pultRow.appendChild(wrapper);
  container.appendChild(pultRow);
}

/* =========================================================
   LINEAR – Render
   ========================================================= */
function renderSeating(result) {
  lastSeating = result;
  const container = el("tables-container");
  container.innerHTML = "";
  const { assignment, satisfied } = result;
  const { rows, tablesPerRow } = roomConfig;
  const hideAllTags = getHideTagsChecked();
  const seatMap = new Map();
  const unplacedStudents = [];

  students.forEach((s) => {
    const seat = assignment[s.id];
    if (!seat) { unplacedStudents.push(s); return; }
    seatMap.set(seat.row + "-" + seat.tableIndex + "-" + seat.seatIndex,
      { student: s, tags: s.tagIds.map(getTagById).filter(Boolean) });
  });

  renderPult(container);

  for (let r = 0; r < rows; r++) {
    const rowDiv = document.createElement("div");
    // center-aligned so pult is always centered above
    rowDiv.className = "table-row";
    rowDiv.style.cssText = "justify-content:center;";
    for (let t = 0; t < tablesPerRow; t++) {
      const seat0 = seatMap.get(r + "-" + t + "-0");
      const seat1 = seatMap.get(r + "-" + t + "-1");
      const allEmpty = !seat0 && !seat1
        && !blockedSeats.has(r + "-" + t + "-0")
        && !blockedSeats.has(r + "-" + t + "-1");
      const tableDiv = document.createElement("div");
      tableDiv.className = "table table-small" + (allEmpty ? " table-empty" : "");
      for (let sIndex = 0; sIndex < 2; sIndex++) {
        const key = r + "-" + t + "-" + sIndex;
        const data = seatMap.get(key);
        const cell = buildSeatCell(sIndex === 0 ? "L" : "R", data, hideAllTags, r + "-" + t + "-" + sIndex);
        tableDiv.appendChild(cell);
      }
      rowDiv.appendChild(tableDiv);
    }
    container.appendChild(rowDiv);
  }

  const showLine = el('toggle-scanner-line') ? el('toggle-scanner-line').checked : true;
  if (showLine) attachDOMScannerLine(container);
  updateStatus(satisfied, unplacedStudents);
  updateHash();
}

function buildSeatCell(label, data, hideAllTags, seatKey) {
  const isBlocked = seatKey ? blockedSeats.has(seatKey) : false;
  const cell = document.createElement('div');
  cell.className = 'seat-cell' + (isBlocked ? ' seat-blocked' : '');
  if (isBlocked) {
    const icon = document.createElement('div');
    icon.className = 'seat-blocked-icon'; icon.textContent = '❌';
    cell.appendChild(icon);
  } else {
    if (data) {
      const sDiv = document.createElement('div');
      sDiv.className = 'seat-student'; sDiv.textContent = data.student.name;
      cell.appendChild(sDiv);
      if (!hideAllTags) {
        const td = document.createElement('div'); td.className = 'seat-tags';
        data.tags.forEach(tObj => {
          if (tObj.hidden) return;
          const sp = document.createElement('span');
          sp.className = 'badge';
          sp.style.background = tObj.color || 'rgba(127,29,29,0.7)';
          sp.style.color = '#111'; sp.textContent = tObj.name;
          td.appendChild(sp);
        });
        cell.appendChild(td);
      }
    } else {
      const e2 = document.createElement('div');
      e2.className = 'hint seat-empty-label'; e2.textContent = 'Leer'; cell.appendChild(e2);
      cell.classList.add('seat-empty');
    }
  }
  if (seatKey) {
    cell.title = isBlocked ? 'Rechtsklick: Sperre aufheben' : 'Rechtsklick: Sitz sperren';
    cell.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (blockedSeats.has(seatKey)) blockedSeats.delete(seatKey);
      else blockedSeats.add(seatKey);
      updateHash();
      // Re-render with SAME assignment – no reshuffling
      if (lastSeating) {
        const t = getLayoutType();
        if (t === 'linear') renderSeating(lastSeating);
      }
    });
  }
  return cell;
}

function updateStatus(satisfied, unplacedStudents) {
  const status = el("status-label");
  if (students.length === 0) {
    status.textContent = "Keine Schüler vorhanden.";
  } else if (unplacedStudents && unplacedStudents.length > 0) {
    status.textContent = "Nicht genug Plätze für: " + unplacedStudents.map((s) => s.name).join(", ");
  } else if (satisfied) {
    status.textContent = "Alle Constraints konnten erfüllt werden.";
  } else {
    status.textContent = "Constraints teils verletzt, bestmögliche Zuordnung.";
  }
}

/* U-Shape removed */

function renderCustomCanvas() {
  const container = el("tables-container");
  container.innerHTML = "";

  // Pult zuerst, dann Canvas
  renderPult(container);

  const wrapper = document.createElement("div");
  wrapper.id = "custom-canvas-wrapper";
  // overflow:visible so tables dragged to the edge remain fully visible without creating dead space
  wrapper.style.cssText = "overflow:visible;border:1.5px solid var(--table-border);border-radius:10px;background:var(--table-bg);max-width:100%;display:block;margin:0 auto;";
  const canvas = document.createElement("canvas");
  canvas.id = "custom-canvas";
  // Canvas exactly matches the logical room size — no padding tricks
  canvas.width = CUSTOM_CANVAS_W;
  canvas.height = CUSTOM_CANVAS_H;
  canvas.style.cssText = "cursor:default;max-width:100%;height:auto;display:block;touch-action:none;position:relative;overflow:visible;";
  wrapper.appendChild(canvas);
  container.appendChild(wrapper);

  drawCustomCanvas();
  attachCustomCanvasEvents(canvas);
}

function drawCustomCanvas() {
  const canvas=el('custom-canvas'); if(!canvas) return;
  const ctx=canvas.getContext('2d');
  const isDark=document.documentElement.getAttribute('data-theme')==='dark';
  ctx.clearRect(0,0,canvas.width,canvas.height);
  // Room border (dashed outline)
  ctx.strokeStyle=isDark?'rgba(81,177,164,0.35)':'rgba(8,117,190,0.3)';
  ctx.lineWidth=1;ctx.setLineDash([4,4]);
  ctx.strokeRect(0,0,CUSTOM_CANVAS_W,CUSTOM_CANVAS_H);
  ctx.setLineDash([]);
  // Dot grid — matches SNAP_GRID spacing
  ctx.fillStyle=isDark?'rgba(255,255,255,0.06)':'rgba(0,0,0,0.07)';
  for(let gx=SNAP_GRID;gx<CUSTOM_CANVAS_W;gx+=SNAP_GRID)
    for(let gy=SNAP_GRID;gy<CUSTOM_CANVAS_H;gy+=SNAP_GRID){ctx.beginPath();ctx.arc(gx,gy,1,0,Math.PI*2);ctx.fill();}

  // Helper: draw the dashed scanner line at current scannerLineFraction
  const showScanLine = el('toggle-scanner-line-custom') ? el('toggle-scanner-line-custom').checked : true;
  const sc=isDark?'115,222,249':'0,90,110';
  function drawScannerLine(alpha){
    const ly=scannerLineFraction*CUSTOM_CANVAS_H;
    const grad=ctx.createLinearGradient(0,0,CUSTOM_CANVAS_W,0);
    grad.addColorStop(0,   'rgba('+sc+',0)');
    grad.addColorStop(0.08,'rgba('+sc+','+alpha*0.9+')');
    grad.addColorStop(0.5, 'rgba('+sc+','+alpha+')');
    grad.addColorStop(0.92,'rgba('+sc+','+alpha*0.9+')');
    grad.addColorStop(1,   'rgba('+sc+',0)');
    ctx.save();
    ctx.strokeStyle=grad;ctx.lineWidth=2.5;ctx.setLineDash([8,5]);
    ctx.beginPath();ctx.moveTo(0,ly);ctx.lineTo(CUSTOM_CANVAS_W,ly);ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Draw a faint version of the line BELOW tables (only if visible)
  if(showScanLine) drawScannerLine(0.3);

  // Tables drawn here so they appear above the faint underlay
  customTables.forEach(t=>drawCustomTable(ctx,t,isDark));

  // Now draw the full-brightness line ON TOP of tables so it's always visible
  const ly=scannerLineFraction*CUSTOM_CANVAS_H;
  if(showScanLine){
    drawScannerLine(1.0);
    // Drag handle circle at right edge (drawn after tables, always on top)
    ctx.beginPath();ctx.arc(CUSTOM_CANVAS_W-18,ly,8,0,Math.PI*2);
    ctx.fillStyle='rgba('+sc+',0.9)';ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,0.7)';ctx.lineWidth=1.5;ctx.stroke();
    // Labels
    ctx.font='11px system-ui,sans-serif';ctx.textAlign='left';
    ctx.fillStyle='rgba('+sc+',0.85)';
    ctx.textBaseline='bottom';ctx.fillText('▲ vor Linie',8,ly-4);
    ctx.textBaseline='top';ctx.fillText('▼ hinter Linie',8,ly+4);
  }

  // Pending ghost table (always topmost)
  if(pendingTablePlacement){
    const pt=pendingTablePlacement;
    const pw=pt.type==='single'?SINGLE_W:TABLE_W;
    const ph=TABLE_H;
    ctx.save();ctx.translate(pt.x,pt.y);
    ctx.globalAlpha=0.72;
    roundRect(ctx,-pw/2,-ph/2,pw,ph,10);
    ctx.fillStyle=isDark?'rgba(3,16,18,0.97)':'rgba(128,223,203,0.5)';ctx.fill();
    ctx.strokeStyle=isDark?'#73def9':'#08abb8';ctx.lineWidth=2.5;ctx.setLineDash([6,3]);ctx.stroke();ctx.setLineDash([]);
    ctx.globalAlpha=1;ctx.font='11px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillStyle=isDark?'rgba(194,234,255,0.8)':'rgba(0,0,0,0.55)';
    ctx.fillText('Klicken zum Platzieren',0,0);
    ctx.restore();
  }
  // Rubber band selection (topmost)
  if(rubberBand){
    const rx=Math.min(rubberBand.startX,rubberBand.endX),ry=Math.min(rubberBand.startY,rubberBand.endY);
    const rw=Math.abs(rubberBand.endX-rubberBand.startX),rh=Math.abs(rubberBand.endY-rubberBand.startY);
    ctx.save();
    ctx.strokeStyle=isDark?'rgba(115,222,249,0.9)':'rgba(8,171,184,0.9)';
    ctx.fillStyle=isDark?'rgba(115,222,249,0.08)':'rgba(8,171,184,0.08)';
    ctx.lineWidth=1.5;ctx.setLineDash([5,3]);
    ctx.strokeRect(rx,ry,rw,rh);ctx.fillRect(rx,ry,rw,rh);
    ctx.setLineDash([]);ctx.restore();
  }
}

function drawCustomTable(ctx,t,isDark){
  const isSel=selectedCustomTableIds.has(t.id);
  const isSingle=t.type==='single';
  const w=isSingle?SINGLE_W:TABLE_W, h=TABLE_H, hw=w/2, hh=h/2;
  ctx.save();ctx.translate(t.x,t.y);ctx.rotate(t.rotation*Math.PI/180);
  ctx.shadowColor='rgba(0,0,0,0.5)';ctx.shadowBlur=isSel?18:8;
  ctx.beginPath();roundRect(ctx,-hw,-hh,w,h,10);
  ctx.fillStyle=isDark?'rgba(3,16,18,0.97)':'rgba(128,223,203,0.5)';ctx.fill();
  ctx.strokeStyle=isSel?(isDark?'#73def9':'#08abb8'):(isDark?'rgba(81,177,164,0.9)':'rgba(8,117,190,0.8)');
  ctx.lineWidth=isSel?2.5:1.5;ctx.stroke();ctx.shadowBlur=0;

  const maxSeats=isSingle?1:2;
  if(!isSingle){
    // divider line
    ctx.beginPath();ctx.moveTo(0,-hh+8);ctx.lineTo(0,hh-8);
    ctx.strokeStyle=isDark?'rgba(148,163,184,0.3)':'rgba(0,0,0,0.15)';
    ctx.lineWidth=1;ctx.stroke();
  }
  ctx.textAlign='center';ctx.textBaseline='middle';
  const sd=t.seats||[null,null];
  for(let s=0;s<maxSeats;s++){
    const sx=isSingle?0:(s===0?-hw/2:hw/2);
    const bKey='c-'+t.id+'-'+s;
    if(blockedSeats.has(bKey)){
      ctx.font='20px sans-serif';ctx.fillText('❌',sx,4);
    } else {
      const nm=sd[s]?sd[s].name:'';
      const tc=sd[s]?sd[s].tagColors:[];
      const isEmpty=!nm;
      // Draw labels removed (unnecessary)
      ctx.font='10px system-ui,sans-serif';
      // Red background tint for empty seats
      if(isEmpty){
        ctx.save();
        ctx.globalAlpha=0.18;
        ctx.fillStyle='rgba(255,80,80,1)';
        const ew=isSingle?w-6:hw-4;
        ctx.fillRect(sx-ew/2,-hh+4,ew,h-8);
        ctx.globalAlpha=1;
        ctx.restore();
        ctx.fillStyle=isDark?'rgba(255,120,120,0.9)':'rgba(180,40,40,0.8)';
        ctx.font='600 11px system-ui,sans-serif';
        ctx.fillText('Leer',sx,0);
      } else {
        // Draw name upright (counter-rotate to undo table rotation)
        ctx.save();
        ctx.translate(sx, 0);
        ctx.rotate(-t.rotation * Math.PI / 180);
        ctx.fillStyle=isDark?'#f2fefe':'#000';ctx.font='600 11px system-ui,sans-serif';
        ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillText(nm,0,0);
        ctx.restore();
        if(tc&&tc.length){
          const dr=4,tw=tc.length*(dr*2+2);
          tc.forEach((c,i)=>{ctx.beginPath();ctx.arc(sx-tw/2+i*(dr*2+2)+dr,22,dr,0,Math.PI*2);ctx.fillStyle=c;ctx.fill();});
        }
      }
    }
  }
  if(isSel){ctx.fillStyle=isDark?'rgba(115,222,249,0.7)':'rgba(8,171,184,0.7)';
    ctx.font='10px system-ui';ctx.fillText('← →  drehen',0,hh+14);}
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function hitTestCustomTable(mx, my) {
  for (let i = customTables.length - 1; i >= 0; i--) {
    const t = customTables[i];
    const tw = t.type === 'single' ? SINGLE_W : TABLE_W;
    const dx = mx - t.x, dy = my - t.y;
    const rad = (-t.rotation * Math.PI) / 180;
    const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
    if (Math.abs(lx) <= tw / 2 && Math.abs(ly) <= TABLE_H / 2) return t;
  }
  return null;
}

function snapVal(v){ 
  const snap = el('toggle-snapping') ? el('toggle-snapping').checked : true;
  return snap ? Math.round(v/SNAP_GRID)*SNAP_GRID : v; 
}

function attachCustomCanvasEvents(canvas){
  function gP(e){
    const r=canvas.getBoundingClientRect();
    const sx=canvas.width/r.width,sy=canvas.height/r.height;
    const cx=e.touches?e.touches[0].clientX:e.clientX;
    const cy=e.touches?e.touches[0].clientY:e.clientY;
    return{x:(cx-r.left)*sx, y:(cy-r.top)*sy};
  }
  canvas.addEventListener('mouseenter',()=>{canvasHovered=true;});
  canvas.addEventListener('mouseleave',()=>{canvasHovered=false;});
  canvas.addEventListener('pointermove',e=>{
    const{x,y}=gP(e);
    canvasMouseX=x; canvasMouseY=y;
    if(pendingTablePlacement){
      pendingTablePlacement.x=snapVal(x); pendingTablePlacement.y=snapVal(y);
      drawCustomCanvas(); return;
    }
    if(isDraggingScanner){
      scannerLineFraction=Math.max(0.01,Math.min(0.99,y/CUSTOM_CANVAS_H));
      drawCustomCanvas(); return;
    }
    if(isDraggingGroup&&dragGroupOffsets.length){
      const snap = el('toggle-snapping') ? el('toggle-snapping').checked : true;
      // Snap the first (lead) table, then move all others by the same delta
      const lead = dragGroupOffsets[0];
      const rawX = x - lead.offX, rawY = y - lead.offY;
      const snappedX = snap ? Math.round(rawX/SNAP_GRID)*SNAP_GRID : rawX;
      const snappedY = snap ? Math.round(rawY/SNAP_GRID)*SNAP_GRID : rawY;
      const dxSnap = snappedX - rawX, dySnap = snappedY - rawY;
      dragGroupOffsets.forEach(({id,offX,offY})=>{
        const t=customTables.find(tb=>tb.id===id);
        if(t){t.x=(x-offX)+dxSnap;t.y=(y-offY)+dySnap;}
      });drawCustomCanvas();
    }else if(rubberBand){rubberBand.endX=x;rubberBand.endY=y;drawCustomCanvas();}
    const showLine = el('toggle-scanner-line-custom') ? el('toggle-scanner-line-custom').checked : true;
    const nearLine=showLine&&!isDraggingGroup&&Math.abs(y-scannerLineFraction*CUSTOM_CANVAS_H)<12;
    if(nearLine)canvas.style.cursor='grab';
    else if(!isDraggingGroup&&!rubberBand)canvas.style.cursor=pendingTablePlacement?'crosshair':'default';
  });
  canvas.addEventListener('pointerdown',e=>{
    const{x,y}=gP(e);
    if(pendingTablePlacement){
      const pt=pendingTablePlacement;
      const t={
        id:pt.id, x:snapVal(pt.x), y:snapVal(pt.y),
        rotation:pt.rotation,
        type:pt.type||'double',
        seats:pt.type==='single'?[null]:[null,null]
      };
      customTables.push(t);
      pendingTablePlacement=null;
      canvas.style.cursor='default';
      renderCustomCanvas(); updateHash(); return;
    }
    // Scanner line drag — only if line is visible
    const showLineDown = el('toggle-scanner-line-custom') ? el('toggle-scanner-line-custom').checked : true;
    const nearLine=showLineDown&&Math.abs(y-scannerLineFraction*CUSTOM_CANVAS_H)<12;
    const hit=hitTestCustomTable(x,y);
    if(nearLine&&!hit){
      isDraggingScanner=true;
      canvas.style.cursor='grabbing';
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    if(hit){
      if(e.ctrlKey||e.metaKey){
        e.preventDefault();
        const toDup=selectedCustomTableIds.has(hit.id)?[...selectedCustomTableIds]:[hit.id];
        const originals=toDup.map(id=>customTables.find(t=>t.id===id)).filter(Boolean);
        // Preserve type when duplicating
        const copies=originals.map(t=>({...t,id:crypto.randomUUID(),seats:t.type==='single'?[null]:[null,null]}));
        copies.forEach(c=>customTables.push(c));
        selectedCustomTableIds.clear();
        copies.forEach(c=>selectedCustomTableIds.add(c.id));
        isDraggingGroup=true;
        dragGroupOffsets=copies.map((nc,i)=>({id:nc.id,offX:x-originals[i].x,offY:y-originals[i].y}));
        canvas.setPointerCapture(e.pointerId);
      }else if(e.shiftKey){
        if(selectedCustomTableIds.has(hit.id))selectedCustomTableIds.delete(hit.id);
        else selectedCustomTableIds.add(hit.id);
      }else{
        if(!selectedCustomTableIds.has(hit.id)){selectedCustomTableIds.clear();selectedCustomTableIds.add(hit.id);}
        isDraggingGroup=true;
        dragGroupOffsets=[...selectedCustomTableIds].map(id=>{
          const t=customTables.find(tb=>tb.id===id);
          return{id,offX:x-t.x,offY:y-t.y};
        });
        canvas.setPointerCapture(e.pointerId);
      }
    }else{
      if(!e.shiftKey)selectedCustomTableIds.clear();
      rubberBand={startX:x,startY:y,endX:x,endY:y};
      canvas.setPointerCapture(e.pointerId);
    }
    drawCustomCanvas();
  });
  canvas.addEventListener('pointerup',()=>{
    if(isDraggingScanner){
      isDraggingScanner=false;
      canvas.style.cursor='default';
      drawCustomCanvas(); updateHash(); return;
    }
    if(rubberBand){
      const rx=Math.min(rubberBand.startX,rubberBand.endX),ry=Math.min(rubberBand.startY,rubberBand.endY);
      const rw=Math.abs(rubberBand.endX-rubberBand.startX),rh=Math.abs(rubberBand.endY-rubberBand.startY);
      if(rw>4||rh>4)customTables.forEach(t=>{
        const tw=t.type==='single'?SINGLE_W:TABLE_W;
        if(t.x-tw/2<rx+rw&&t.x+tw/2>rx&&t.y-TABLE_H/2<ry+rh&&t.y+TABLE_H/2>ry)
          selectedCustomTableIds.add(t.id);
      });
      rubberBand=null;
    }
    isDraggingGroup=false;dragGroupOffsets=[];drawCustomCanvas();updateHash();
  });
  canvas.addEventListener('contextmenu',e=>{
    e.preventDefault();
    const{x,y}=gP(e);const hit=hitTestCustomTable(x,y);
    if(!hit)return;
    const dx=x-hit.x,dy=y-hit.y;
    const rad=(-hit.rotation*Math.PI)/180;
    const lx=dx*Math.cos(rad)-dy*Math.sin(rad);
    const si=lx<0?0:1;
    const bKey='c-'+hit.id+'-'+si;
    if(blockedSeats.has(bKey))blockedSeats.delete(bKey);
    else blockedSeats.add(bKey);
    drawCustomCanvas();updateHash();
  });
}
function rotateGroup(delta){
  const sel=customTables.filter(t=>selectedCustomTableIds.has(t.id));
  if(!sel.length)return;
  if(sel.length===1){sel[0].rotation=(sel[0].rotation+delta+360)%360;return;}
  const cx=sel.reduce((s,t)=>s+t.x,0)/sel.length;
  const cy=sel.reduce((s,t)=>s+t.y,0)/sel.length;
  const rad=delta*Math.PI/180,cos=Math.cos(rad),sin=Math.sin(rad);
  sel.forEach(t=>{
    const dx=t.x-cx,dy=t.y-cy;
    t.x=cx+dx*cos-dy*sin;t.y=cy+dx*sin+dy*cos;
    t.rotation=(t.rotation+delta+360)%360;
  });
}

window.addEventListener('keydown',e=>{
  if(getLayoutType()!=='custom')return;
  if(!canvasHovered)return;
  if(e.key==='Escape'&&pendingTablePlacement){
    pendingTablePlacement=null;
    const cv=el('custom-canvas');if(cv)cv.style.cursor='default';
    drawCustomCanvas();return;
  }
  if(selectedCustomTableIds.size&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){
    e.preventDefault();rotateGroup(e.key==='ArrowLeft'?-15:15);drawCustomCanvas();updateHash();return;
  }
  if((e.key==='Delete'||e.key==='Backspace')&&selectedCustomTableIds.size){
    e.preventDefault();
    customTables=customTables.filter(t=>!selectedCustomTableIds.has(t.id));
    selectedCustomTableIds.clear();drawCustomCanvas();updateHash();return;
  }
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'){
    e.preventDefault();customTables.forEach(t=>selectedCustomTableIds.add(t.id));drawCustomCanvas();return;
  }
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'&&selectedCustomTableIds.size){
    e.preventDefault();
    const orig=customTables.filter(t=>selectedCustomTableIds.has(t.id));
    const newIds=new Set();
    orig.forEach(t=>{const nc={...t,id:crypto.randomUUID(),x:t.x+10,y:t.y+10,seats:[null,null]};customTables.push(nc);newIds.add(nc.id);});
    selectedCustomTableIds.clear();newIds.forEach(id=>selectedCustomTableIds.add(id));
    drawCustomCanvas();updateHash();return;
  }
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='c'&&selectedCustomTableIds.size){
    e.preventDefault();
    clipboard_tables=customTables.filter(t=>selectedCustomTableIds.has(t.id)).map(t=>({...t,seats:[null,null]}));
    return;
  }
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='v'&&clipboard_tables.length){
    e.preventDefault();
    const cx2=clipboard_tables.reduce((s,t)=>s+t.x,0)/clipboard_tables.length;
    const cy2=clipboard_tables.reduce((s,t)=>s+t.y,0)/clipboard_tables.length;
    const newIds=new Set();
    clipboard_tables.forEach(t=>{const nc={...t,id:crypto.randomUUID(),x:canvasMouseX+(t.x-cx2),y:canvasMouseY+(t.y-cy2),seats:[null,null]};customTables.push(nc);newIds.add(nc.id);});
    selectedCustomTableIds.clear();newIds.forEach(id=>selectedCustomTableIds.add(id));
    drawCustomCanvas();updateHash();return;
  }
});

function addCustomTable(type) {
  // type: 'single' or 'double'
  if(getLayoutType()!=='custom')return;
  const sx = snapVal(canvasMouseX), sy = snapVal(canvasMouseY);
  pendingTablePlacement={
    id:crypto.randomUUID(), x:sx, y:sy,
    rotation:0,
    type: type || 'double',
    seats: type==='single'?[null]:[null,null]
  };
  const canvas=el('custom-canvas');
  if(canvas)canvas.style.cursor='crosshair';
  drawCustomCanvas();
}

function clearCustomTables() {
  customTables = [];
  selectedCustomTableIds.clear();
  renderCustomCanvas();
  updateHash();
}

// When a table is placed via click, preserve type from pendingTablePlacement
// (the pointerdown handler inside attachCustomCanvasEvents already handles this)

el("custom-add-single-btn").addEventListener("click", () => addCustomTable('single'));
el("custom-add-double-btn").addEventListener("click", () => addCustomTable('double'));

document.addEventListener('pointerdown',e=>{
  if(!pendingTablePlacement)return;
  const canvas=el('custom-canvas');if(!canvas)return;
  const rect=canvas.getBoundingClientRect();
  const inside=e.clientX>=rect.left&&e.clientX<=rect.right&&e.clientY>=rect.top&&e.clientY<=rect.bottom;
  if(!inside){
    e.preventDefault();e.stopPropagation();
    const w=el('custom-canvas-wrapper')||canvas;
    w.style.outline='3px solid rgba(255,80,80,0.9)';
    setTimeout(()=>{w.style.outline='';},500);
  }
},true);

{ const _cb = el("custom-clear-btn"); if (_cb) _cb.addEventListener("click", clearCustomTables); }

// Scanner line toggle listeners — redraw/re-render on change
const scanToggleLinear = el('toggle-scanner-line');
if(scanToggleLinear) scanToggleLinear.addEventListener('change', () => {
  if(lastSeating && getLayoutType()==='linear') renderSeating(lastSeating);
});
const scanToggleCustom = el('toggle-scanner-line-custom');
if(scanToggleCustom) scanToggleCustom.addEventListener('change', () => {
  if(getLayoutType()==='custom') drawCustomCanvas();
  updateHash();
});
const snapToggle = el('toggle-snapping');
if(snapToggle) snapToggle.addEventListener('change', () => {
  const wrap = el('snap-grid-label-wrap');
  if(wrap) wrap.style.opacity = snapToggle.checked ? '1' : '0.4';
  drawCustomCanvas();
  updateHash();
});
const snapGridInput = el('snap-grid-input');
const snapGridValue = el('snap-grid-value');
if(snapGridInput) {
  snapGridInput.addEventListener('input', () => {
    SNAP_GRID = parseInt(snapGridInput.value, 10) || 10;
    if(snapGridValue) snapGridValue.textContent = SNAP_GRID;
    drawCustomCanvas();
    updateHash();
  });
}

/* === generate() dispatcher === */
function generate() {
  const type = getLayoutType();

  if (type === "linear") {
    const rows = parseInt(el("rows-input").value, 10) || 1;
    const tablesPerRow = parseInt(el("tables-input").value, 10) || 1;
    roomConfig.rows = Math.max(1, Math.min(10, rows));
    roomConfig.tablesPerRow = Math.max(1, Math.min(20, tablesPerRow));
    if (students.length === 0) {
      el("status-label").textContent = "Bitte erst Schüler anlegen.";
      el("tables-container").innerHTML = "";
      lastSeating = null; return;
    }
    renderSeating(computeAssignment());

  } else if (type === "custom") {
    if (customTables.length === 0) {
      el("status-label").textContent = "Bitte erst Tische hinzufügen.";
      renderCustomCanvas(); return;
    }
    if (students.length === 0) {
      el("status-label").textContent = "Bitte erst Schüler anlegen.";
      renderCustomCanvas(); return;
    }
    const seats = [];
    customTables.forEach((tb, ti) => {
      const maxSeats = tb.type === 'single' ? 1 : 2;
      for (let s = 0; s < maxSeats; s++) {
        if (blockedSeats.has("c-" + tb.id + "-" + s)) continue;
        seats.push({ row: 0, tableIndex: ti, seatIndex: s, segment: "custom" });
      }
    });
    const result = computeAssignment(seats);
    const hideAllTags = getHideTagsChecked();
    customTables.forEach((tb) => { tb.seats = tb.type === 'single' ? [null] : [null, null]; });
    students.forEach((s) => {
      const seat = result.assignment[s.id];
      if (seat && seat.segment === "custom") {
        const tb = customTables[seat.tableIndex];
        if (tb) {
          tb.seats[seat.seatIndex] = {
            name: s.name,
            tagColors: hideAllTags ? [] : s.tagIds.map(getTagById).filter(Boolean).filter(t => !t.hidden).map(t => t.color)
          };
        }
      }
    });
    const unplaced = students.filter((s) => !result.assignment[s.id]);
    lastSeating = result;
    renderCustomCanvas();
    updateStatus(result.satisfied, unplaced);
    updateHash();
  }
}

/* === PDF Export (auto-save, no print dialog) === */
async function exportPDF() {
  const type = getLayoutType();
  // Dynamically load jsPDF from CDN if not already loaded
  if (!window.jspdf) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  const { jsPDF } = window.jspdf;

  if (type === 'custom') {
    // --- Custom: render canvas without scanner line / tags, fit to page ---
    const canvas = el('custom-canvas');
    if (!canvas) { alert('Kein Sitzplan vorhanden.'); return; }

    // Draw a clean version of the canvas without scanner line or tag dots
    const offscreen = document.createElement('canvas');
    offscreen.width = CUSTOM_CANVAS_W;
    offscreen.height = CUSTOM_CANVAS_H;
    const ctx = offscreen.getContext('2d');
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    // White background for PDF
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CUSTOM_CANVAS_W, CUSTOM_CANVAS_H);

    // Draw tables (clean version: no tag dots, no red empty highlight)
    customTables.forEach(t => drawTableForPDF(ctx, t));

    // Add Pult label centred at top
    ctx.font = 'bold 22px system-ui,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#333';
    ctx.fillText('Pult', CUSTOM_CANVAS_W / 2, 8);

    const imgData = offscreen.toDataURL('image/png');
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const aw = pw - margin * 2, ah = ph - margin * 2;
    // Scale to fit
    const scale = Math.min(aw / CUSTOM_CANVAS_W, ah / CUSTOM_CANVAS_H);
    const imgW = CUSTOM_CANVAS_W * scale, imgH = CUSTOM_CANVAS_H * scale;
    const ox = margin + (aw - imgW) / 2, oy = margin + (ah - imgH) / 2;
    pdf.addImage(imgData, 'PNG', ox, oy, imgW, imgH);
    pdf.save('sitzplan.pdf');

  } else {
    // --- Linear: render table grid without tags, centred, fit to page ---
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    const margin = 10;

    const { rows, tablesPerRow } = roomConfig;
    // Cell sizing: fit all tables + pult row into page
    const totalRows = rows + 1; // +1 for pult
    const cellW = Math.min(40, (pw - margin * 2) / tablesPerRow);
    const cellH = Math.min(18, (ph - margin * 2) / totalRows);
    const totalW = tablesPerRow * cellW;
    const totalH = totalRows * cellH;
    const startX = (pw - totalW) / 2;
    const startY = margin + 4;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);

    // Pult row
    const pultW = Math.min(30, cellW);
    const pultX = (pw - pultW) / 2;
    pdf.setDrawColor(100); pdf.setLineWidth(0.4);
    pdf.rect(pultX, startY, pultW, cellH - 2);
    pdf.setFillColor(220, 220, 220); pdf.rect(pultX, startY, pultW, cellH - 2, 'FD');
    pdf.setTextColor(50);
    pdf.text('Pult', pultX + pultW / 2, startY + cellH / 2, { align: 'center', baseline: 'middle' });

    // Build seat map
    const seatMap = new Map();
    if (lastSeating) {
      students.forEach(s => {
        const seat = lastSeating.assignment[s.id];
        if (seat) seatMap.set(seat.row + '-' + seat.tableIndex + '-' + seat.seatIndex, s.name);
      });
    }

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    for (let r = 0; r < rows; r++) {
      for (let t = 0; t < tablesPerRow; t++) {
        const x = startX + t * cellW;
        const y = startY + (r + 1) * cellH;
        const nameL = seatMap.get(r + '-' + t + '-0') || '';
        const nameR = seatMap.get(r + '-' + t + '-1') || '';
        const isEmpty = !nameL && !nameR;
        // Always use the same fill in PDF — no red empty-table highlight
        pdf.setFillColor(245, 245, 245);
        pdf.setDrawColor(120);
        pdf.setLineWidth(0.3);
        pdf.rect(x, y, cellW - 1, cellH - 2, 'FD');
        // Divider
        pdf.setDrawColor(180);
        pdf.line(x + cellW / 2 - 0.5, y + 1, x + cellW / 2 - 0.5, y + cellH - 3);
        pdf.setTextColor(40);
        pdf.setFontSize(6.5);
        pdf.text(nameL || 'Leer', x + cellW / 4, y + cellH / 2 - 1, { align: 'center', baseline: 'middle' });
        pdf.text(nameR || 'Leer', x + 3 * cellW / 4 - 0.5, y + cellH / 2 - 1, { align: 'center', baseline: 'middle' });
      }
    }
    pdf.save('sitzplan.pdf');
  }
}

// Clean table draw for PDF: no tag dots, no red empty, white bg
function drawTableForPDF(ctx, t) {
  const isSingle = t.type === 'single';
  const w = isSingle ? SINGLE_W : TABLE_W, h = TABLE_H, hw = w/2, hh = h/2;
  ctx.save();
  ctx.translate(t.x, t.y); ctx.rotate(t.rotation * Math.PI / 180);
  // Table box
  ctx.beginPath(); roundRect(ctx, -hw, -hh, w, h, 8);
  ctx.fillStyle = '#e8f4f8'; ctx.fill();
  ctx.strokeStyle = '#4a9bb0'; ctx.lineWidth = 1.5; ctx.stroke();
  // Divider
  if (!isSingle) {
    ctx.beginPath(); ctx.moveTo(0, -hh+6); ctx.lineTo(0, hh-6);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 0.8; ctx.stroke();
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const maxSeats = isSingle ? 1 : 2;
  const sd = t.seats || [];
  for (let s = 0; s < maxSeats; s++) {
    const sx = isSingle ? 0 : (s === 0 ? -hw/2 : hw/2);
    const nm = sd[s] ? sd[s].name : '';
    ctx.fillStyle = '#111';
    ctx.font = nm ? 'bold 11px system-ui' : '10px system-ui';
    ctx.fillText(nm || 'Leer', sx, 0);
  }
  ctx.restore();
}

el("save-pdf-btn").addEventListener("click", exportPDF);

/* === Core Events === */
el("add-student-btn").addEventListener("click", addStudent);
el("student-name-input").addEventListener("keydown", (e) => { if (e.key === "Enter") addStudent(); });
el("add-tag-btn").addEventListener("click", addTag);
el("tag-name-input").addEventListener("keydown", (e) => { if (e.key === "Enter") addTag(); });
el("random-color-btn").addEventListener("click", () => { el("tag-color-input").value = randomTagColor(); });
document.querySelectorAll("#generate-btn").forEach(btn => btn.addEventListener("click", generate));

const rowsInput = el("rows-input");
const tablesInput = el("tables-input");
const rowsValue = el("rows-value");
const tablesValue = el("tables-value");

rowsInput.addEventListener("input", () => {
  roomConfig.rows = parseInt(rowsInput.value, 10) || 1;
  if (rowsValue) rowsValue.textContent = roomConfig.rows;
  if (students.length) generate();
});
tablesInput.addEventListener("input", () => {
  roomConfig.tablesPerRow = parseInt(tablesInput.value, 10) || 1;
  if (tablesValue) tablesValue.textContent = roomConfig.tablesPerRow;
  if (students.length) generate();
});

el("student-search-input").addEventListener("input", renderStudents);
el("tag-search-input").addEventListener("input", renderTags);
el("theme-toggle-btn").addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  applyTheme(current === "dark" ? "light" : "dark");
  if (getLayoutType() === "custom") drawCustomCanvas();
});

el("tag-color-input").value = randomTagColor();
updateCounts();
updateLayoutUI();
