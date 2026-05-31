const NAS_ROOT =
  "\\\\10.10.72.128\\성형외과공유폴더\\★사진정리☆\\★2026년 사진★\\문석호 교수님 사진";

const form = document.querySelector("#patientForm");
const fields = {
  patientName: document.querySelector("#patientName"),
  patientId: document.querySelector("#patientId"),
  operationName: document.querySelector("#operationName"),
  diagnosisInput: document.querySelector("#diagnosisInput"),
  operationDateInput: document.querySelector("#operationDateInput"),
  photoInput: document.querySelector("#photoInput"),
  opDayToggle: document.querySelector("#opDayToggle"),
};

const baseFolder = document.querySelector("#baseFolder");
const planRows = document.querySelector("#planRows");
const saveMessage = document.querySelector("#saveMessage");
const resultList = document.querySelector("#resultList");
const fileDrop = document.querySelector(".file-drop");
const selectedFilesBox = document.querySelector("#selectedFiles");
const diagnosisList = document.querySelector("#diagnosisList");
const operationDateList = document.querySelector("#operationDateList");
let selectedSurgeon = "J";
let selectedFiles = [];
let diagnoses = [];
let operationDates = [];

const demoRecords = [
  {
    name: "홍O동",
    id: "12345678",
    diagnosis: "Scar revision",
    operation: "Z-plasty",
    surgeon: "J",
    date: "2026-05-29",
  },
  {
    name: "김O수",
    id: "87654321",
    diagnosis: "Facial laceration",
    operation: "Debridement",
    surgeon: "Consult",
    date: "2026-06-02",
  },
];

function cleanPart(value, fallback) {
  return (value || fallback).trim().replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "_");
}

function maskName(name) {
  const cleanName = (name || "환자명").trim();
  if (cleanName.length <= 1) return cleanName;
  if (cleanName.length === 2) return `${cleanName[0]}O`;
  return `${cleanName[0]}${"O".repeat(cleanName.length - 2)}${cleanName[cleanName.length - 1]}`;
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getFileDate(file) {
  return formatDate(new Date(file.lastModified || Date.now()));
}

function getExtension(fileName) {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : ".jpg";
}

function getFileKey(file) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getParentFolderName() {
  const patient = cleanPart(fields.patientName.value, "환자명");
  const id = cleanPart(fields.patientId.value, "등록번호");
  const diagnosis = cleanPart(getDiagnoses().join("+"), "진단명");
  const operation = cleanPart(fields.operationName.value, "수술명");
  return `${patient}_${id}_${diagnosis}_${operation}_${selectedSurgeon}`;
}

function uniqueValues(values) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function getDiagnoses() {
  return uniqueValues([...diagnoses, fields.diagnosisInput.value]);
}

function getOperationDates() {
  return uniqueValues([...operationDates, fields.operationDateInput.value]).sort();
}

function renderChipList(container, values, type, emptyText) {
  if (!values.length) {
    container.innerHTML = `<p>${emptyText}</p>`;
    return;
  }

  container.innerHTML = values
    .map(
      (value, index) => `
        <span class="chip">
          <span>${escapeHtml(value)}</span>
          <button class="remove-chip" type="button" data-type="${type}" data-index="${index}" aria-label="${escapeHtml(value)} 삭제">×</button>
        </span>
      `
    )
    .join("");
}

function renderDynamicFields() {
  renderChipList(diagnosisList, diagnoses, "diagnosis", "추가된 진단명이 없습니다.");
  renderChipList(operationDateList, operationDates, "operationDate", "추가된 수술일이 없습니다.");
}

function addDiagnosis() {
  const value = fields.diagnosisInput.value.trim();
  if (!value) return;
  diagnoses = uniqueValues([...diagnoses, value]);
  fields.diagnosisInput.value = "";
  renderDynamicFields();
  updatePlan();
}

function addOperationDate() {
  const value = fields.operationDateInput.value;
  if (!value) return;
  operationDates = uniqueValues([...operationDates, value]).sort();
  fields.operationDateInput.value = "";
  renderDynamicFields();
  updatePlan();
}

function renderSelectedFiles() {
  if (!selectedFiles.length) {
    selectedFilesBox.innerHTML = `
      <div class="file-count">선택된 사진 0개</div>
      <p>사진을 여러 번 나눠 선택해도 목록에 계속 추가됩니다.</p>
    `;
    return;
  }

  selectedFilesBox.innerHTML = `
    <div class="file-count">선택된 사진 ${selectedFiles.length}개</div>
    <ul class="file-list">
      ${selectedFiles
        .map((record, index) => {
          const status =
            record.status === "reading"
              ? "촬영일 확인 중"
              : record.captureDate
                ? `촬영일: ${record.captureDate}`
                : "촬영일 정보 없음";

          return `
            <li>
              <span>
                ${escapeHtml(record.file.name)}
                <small>${escapeHtml(status)}</small>
              </span>
              <button class="remove-file" type="button" data-index="${index}" aria-label="${escapeHtml(record.file.name)} 제거">×</button>
            </li>
          `;
        })
        .join("")}
    </ul>
  `;
}

async function readCaptureDate(file) {
  if (!file.type.includes("jpeg") && !file.name.toLowerCase().match(/\.(jpg|jpeg)$/)) {
    return null;
  }

  const buffer = await file.arrayBuffer();
  return parseExifCaptureDate(buffer);
}

function readAscii(view, start, length) {
  let text = "";
  for (let index = 0; index < length; index += 1) {
    const code = view.getUint8(start + index);
    if (code === 0) break;
    text += String.fromCharCode(code);
  }
  return text;
}

function parseExifDateValue(value) {
  const match = value.match(/^(\d{4}):(\d{2}):(\d{2})/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function parseExifCaptureDate(buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) return null;

  let offset = 2;
  while (offset + 4 < view.byteLength) {
    if (view.getUint8(offset) !== 0xff) break;

    const marker = view.getUint8(offset + 1);
    const size = view.getUint16(offset + 2, false);
    const dataStart = offset + 4;

    if (marker === 0xe1 && readAscii(view, dataStart, 6) === "Exif") {
      return parseTiffDate(view, dataStart + 6);
    }

    offset += 2 + size;
  }

  return null;
}

function parseTiffDate(view, tiffStart) {
  const endian = readAscii(view, tiffStart, 2);
  const littleEndian = endian === "II";
  if (!littleEndian && endian !== "MM") return null;

  const readUint16 = (position) => view.getUint16(position, littleEndian);
  const readUint32 = (position) => view.getUint32(position, littleEndian);
  const firstIfdOffset = readUint32(tiffStart + 4);

  function readAsciiTag(entryOffset) {
    const count = readUint32(entryOffset + 4);
    const valueOffset = count <= 4 ? entryOffset + 8 : tiffStart + readUint32(entryOffset + 8);
    if (valueOffset < 0 || valueOffset + count > view.byteLength) return null;
    return readAscii(view, valueOffset, count);
  }

  function scanIfd(ifdOffset, wantedTag) {
    if (ifdOffset <= 0 || ifdOffset + 2 > view.byteLength) return null;
    const entryCount = readUint16(ifdOffset);

    for (let index = 0; index < entryCount; index += 1) {
      const entryOffset = ifdOffset + 2 + index * 12;
      if (entryOffset + 12 > view.byteLength) return null;

      const tag = readUint16(entryOffset);
      const type = readUint16(entryOffset + 2);
      if (tag === wantedTag && type === 2) {
        return readAsciiTag(entryOffset);
      }
    }

    return null;
  }

  function findExifIfdOffset(ifdOffset) {
    if (ifdOffset <= 0 || ifdOffset + 2 > view.byteLength) return null;
    const entryCount = readUint16(ifdOffset);

    for (let index = 0; index < entryCount; index += 1) {
      const entryOffset = ifdOffset + 2 + index * 12;
      if (entryOffset + 12 > view.byteLength) return null;

      const tag = readUint16(entryOffset);
      if (tag === 0x8769) {
        return tiffStart + readUint32(entryOffset + 8);
      }
    }

    return null;
  }

  const firstIfd = tiffStart + firstIfdOffset;
  const exifIfd = findExifIfdOffset(firstIfd);
  const dateTimeOriginal = exifIfd ? scanIfd(exifIfd, 0x9003) : null;
  const fallbackDateTime = scanIfd(firstIfd, 0x0132);

  return parseExifDateValue(dateTimeOriginal || fallbackDateTime || "");
}

function addFiles(files) {
  const imageFiles = files.filter((file) => file.type.startsWith("image/"));
  const knownFiles = new Set(
    selectedFiles.map((record) => record.key)
  );
  const addedRecords = [];

  imageFiles.forEach((file) => {
    const key = getFileKey(file);
    if (!knownFiles.has(key)) {
      const record = {
        file,
        key,
        captureDate: null,
        status: "reading",
      };
      selectedFiles.push(record);
      addedRecords.push(record);
      knownFiles.add(key);
    }
  });

  if (files.length && !imageFiles.length) {
    saveMessage.textContent = "이미지 파일만 추가할 수 있습니다.";
  } else if (imageFiles.length) {
    saveMessage.textContent = `${imageFiles.length}개 사진이 목록에 추가되었습니다.`;
  }

  renderSelectedFiles();
  updatePlan();

  addedRecords.forEach(async (record) => {
    record.captureDate = await readCaptureDate(record.file);
    record.status = record.captureDate ? "ready" : "missing";
    renderSelectedFiles();
    updatePlan();
  });
}

function updatePlan() {
  const parentFolderName = getParentFolderName();
  baseFolder.textContent = `${NAS_ROOT}\\${parentFolderName}`;

  const records = selectedFiles;
  if (!records.length) {
    planRows.innerHTML =
      '<tr><td colspan="3" class="empty-state">사진을 선택하면 저장 계획이 표시됩니다.</td></tr>';
    return;
  }

  const opDayDates = getOperationDates();
  const maskedName = cleanPart(maskName(fields.patientName.value), "환자명");
  const patientId = cleanPart(fields.patientId.value, "등록번호");
  const grouped = new Map();

  records
    .map((record) => ({ record, date: record.captureDate || "촬영일 확인 필요" }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.record.file.name.localeCompare(b.record.file.name))
    .forEach((item) => {
      const list = grouped.get(item.date) || [];
      list.push(item.record);
      grouped.set(item.date, list);
    });

  const rows = [];
  grouped.forEach((dateRecords, date) => {
    const hasCaptureDate = date !== "촬영일 확인 필요";
    const isOpDay = hasCaptureDate && (fields.opDayToggle.checked || opDayDates.includes(date));
    const folderName = isOpDay ? `${date} (Op day)` : date;
    const fileDate = hasCaptureDate ? date : "촬영일확인필요";

    dateRecords.forEach((record, index) => {
      const newName = `${maskedName}_${patientId}_${fileDate}-${index + 1}${getExtension(record.file.name)}`;
      rows.push(`
        <tr>
          <td><code>${folderName}</code></td>
          <td><code>${newName}</code></td>
          <td>${escapeHtml(record.file.name)}</td>
        </tr>
      `);
    });
  });

  planRows.innerHTML = rows.join("");
}

function renderSearchResults(query = "") {
  const normalizedQuery = query.trim().toLowerCase();
  const records = demoRecords.filter((record) =>
    Object.values(record).join(" ").toLowerCase().includes(normalizedQuery)
  );

  resultList.innerHTML = records
    .map((record) => {
      const folder = `${NAS_ROOT}\\${record.name}_${record.id}_${record.diagnosis}_${record.operation}_${record.surgeon}`;
      return `
        <button class="result-item" type="button">
          <strong>${record.name} · ${record.id}</strong>
          <span>${record.diagnosis} / ${record.operation} / ${record.surgeon} / ${record.date}</span>
          <span>${folder}</span>
        </button>
      `;
    })
    .join("");

  if (!records.length) {
    resultList.innerHTML = '<p class="empty-state">검색 결과가 없습니다.</p>';
  }
}

document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab-button").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("active"));
    button.classList.add("active");
    document.querySelector(`#${button.dataset.tab}Panel`).classList.add("active");
  });
});

document.querySelectorAll(".surgeon-option").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".surgeon-option").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    selectedSurgeon = button.dataset.surgeon;
    updatePlan();
  });
});

Object.values(fields).forEach((field) => {
  if (field === fields.photoInput) return;
  field.addEventListener("input", updatePlan);
  field.addEventListener("change", updatePlan);
});

document.querySelector("#addDiagnosis").addEventListener("click", addDiagnosis);
document.querySelector("#addOperationDate").addEventListener("click", addOperationDate);

fields.diagnosisInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    addDiagnosis();
  }
});

fields.operationDateInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    addOperationDate();
  }
});

document.addEventListener("click", (event) => {
  const removeButton = event.target.closest(".remove-chip");
  if (!removeButton) return;

  const index = Number(removeButton.dataset.index);
  if (removeButton.dataset.type === "diagnosis") {
    diagnoses.splice(index, 1);
  }
  if (removeButton.dataset.type === "operationDate") {
    operationDates.splice(index, 1);
  }
  renderDynamicFields();
  updatePlan();
});

fields.photoInput.addEventListener("change", () => {
  addFiles(Array.from(fields.photoInput.files || []));
  fields.photoInput.value = "";
});

selectedFilesBox.addEventListener("click", (event) => {
  const removeButton = event.target.closest(".remove-file");
  if (!removeButton) return;

  selectedFiles.splice(Number(removeButton.dataset.index), 1);
  renderSelectedFiles();
  updatePlan();
});

["dragenter", "dragover"].forEach((eventName) => {
  fileDrop.addEventListener(eventName, (event) => {
    event.preventDefault();
    fileDrop.classList.add("drag-over");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  fileDrop.addEventListener(eventName, (event) => {
    event.preventDefault();
    fileDrop.classList.remove("drag-over");
  });
});

fileDrop.addEventListener("drop", (event) => {
  addFiles(Array.from(event.dataTransfer.files || []));
});

document.querySelector("#loadSample").addEventListener("click", () => {
  fields.patientName.value = "홍길동";
  fields.patientId.value = "12345678";
  fields.operationName.value = "Z-plasty";
  fields.diagnosisInput.value = "";
  fields.operationDateInput.value = "";
  diagnoses = ["Scar revision", "Hypertrophic scar"];
  operationDates = ["2026-05-29", "2026-06-02"];
  renderDynamicFields();
  saveMessage.textContent = "예시 정보가 입력되었습니다. 사진 파일을 선택하면 미리보기가 완성됩니다.";
  updatePlan();
});

document.querySelector("#savePlan").addEventListener("click", () => {
  saveMessage.textContent =
    "저장 계획이 확인되었습니다. 실제 파일 복사 기능은 다음 개발 단계에서 NAS 연결과 함께 구현합니다.";
});

form.addEventListener("reset", () => {
  window.setTimeout(() => {
    selectedFiles = [];
    diagnoses = [];
    operationDates = [];
    selectedSurgeon = "J";
    document.querySelectorAll(".surgeon-option").forEach((item) => {
      item.classList.toggle("active", item.dataset.surgeon === "J");
    });
    saveMessage.textContent = "실제 NAS 저장은 다음 개발 단계에서 연결합니다.";
    renderDynamicFields();
    renderSelectedFiles();
    updatePlan();
  }, 0);
});

document.querySelector("#searchButton").addEventListener("click", () => {
  renderSearchResults(document.querySelector("#searchInput").value);
});

document.querySelector("#searchInput").addEventListener("input", (event) => {
  renderSearchResults(event.target.value);
});

renderSearchResults();
renderDynamicFields();
renderSelectedFiles();
updatePlan();
