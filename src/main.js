import {
  boundsFromLandmarks,
  createFaceLandmarker,
  drawFaceMesh,
  mirrorLandmarks,
} from "./face.js";
import { blurFaceRegions, canvasClipBlur, loadOpenCv } from "./blur.js";
import { clearShots, deleteShot, downloadBlob, listShots, saveShot } from "./gallery.js";

const video = document.querySelector("#camera");
const canvas = document.querySelector("#frame");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const emptyState = document.querySelector("#empty-state");
const fileInput = document.querySelector("#file-input");

const ui = {
  btnCamera: document.querySelector("#btn-camera"),
  btnShot: document.querySelector("#btn-shot"),
  btnExport: document.querySelector("#btn-export"),
  btnClear: document.querySelector("#btn-clear"),
  toggleBlur: document.querySelector("#toggle-blur"),
  toggleMesh: document.querySelector("#toggle-mesh"),
  blurRange: document.querySelector("#blur-range"),
  blurValue: document.querySelector("#blur-value"),
  maxFaces: document.querySelector("#max-faces"),
  gallery: document.querySelector("#gallery"),
  galleryCount: document.querySelector("#gallery-count"),
  engineLabel: document.querySelector("#engine-label"),
  cameraLabel: document.querySelector("#camera-label"),
  facesLabel: document.querySelector("#faces-label"),
  statusEngine: document.querySelector("#status-engine"),
  statusCamera: document.querySelector("#status-camera"),
  statusFaces: document.querySelector("#status-faces"),
  hudFps: document.querySelector("#hud-fps"),
  hudSize: document.querySelector("#hud-size"),
  hudBlur: document.querySelector("#hud-blur"),
};

const state = {
  landmarker: null,
  opencv: null,
  stream: null,
  running: false,
  lastVideoTime: -1,
  lastTs: 0,
  faces: [],
  lastDetections: { faceLandmarks: [] },
  fps: 0,
};

function setDot(el, value) {
  el.dataset.state = value;
}

function canvasToBlob(target, type = "image/jpeg", quality = 0.92) {
  return new Promise((resolve) => target.toBlob(resolve, type, quality));
}

function syncCanvasSize(source) {
  const width = source.videoWidth || source.naturalWidth || source.width;
  const height = source.videoHeight || source.naturalHeight || source.height;
  if (!width || !height) return false;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    ui.hudSize.textContent = `${width}×${height}`;
  }
  return true;
}

function drawMirrored(source) {
  ctx.save();
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function applyFaceBlur(faces, intensity) {
  if (!faces.length) return;
  canvasClipBlur(ctx, faces, intensity);
}

function processFrame(source, detections, options = {}) {
  const { mirror = false } = options;
  const intensity = Number(ui.blurRange.value);
  const landmarks = detections?.faceLandmarks || [];
  const drawnLandmarks = mirror ? mirrorLandmarks(landmarks) : landmarks;

  if (mirror) drawMirrored(source);
  else ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

  const faces = drawnLandmarks.map((points) =>
    boundsFromLandmarks(points, canvas.width, canvas.height)
  );
  state.faces = faces;
  state.lastDetections = detections || { faceLandmarks: [] };
  ui.facesLabel.textContent = String(faces.length);
  setDot(ui.statusFaces, faces.length ? "live" : "idle");

  if (ui.toggleBlur.checked) applyFaceBlur(faces, intensity);
  if (ui.toggleMesh.checked && drawnLandmarks.length) drawFaceMesh(ctx, drawnLandmarks);
}

async function detectStill(image) {
  if (!state.landmarker) return { faceLandmarks: [] };
  const wasRunning = state.running;
  state.running = false;
  await state.landmarker.setOptions({ runningMode: "IMAGE" });
  const result = state.landmarker.detect(image);
  await state.landmarker.setOptions({ runningMode: "VIDEO" });
  state.lastVideoTime = -1;
  if (wasRunning) {
    state.running = true;
    loop();
  }
  return result;
}

function loop() {
  if (!state.running) return;
  const now = performance.now();

  if (video.readyState >= 2 && syncCanvasSize(video) && video.currentTime !== state.lastVideoTime) {
    const detections = state.landmarker.detectForVideo(video, now);
    processFrame(video, detections, { mirror: true });
    state.lastVideoTime = video.currentTime;
    if (state.lastTs) {
      const inst = 1000 / (now - state.lastTs);
      state.fps = state.fps * 0.85 + inst * 0.15;
      ui.hudFps.textContent = `${Math.round(state.fps)} fps`;
    }
    state.lastTs = now;
  }

  requestAnimationFrame(loop);
}

async function startCamera() {
  if (state.stream) {
    stopCamera();
    return;
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  state.stream = stream;
  video.srcObject = stream;
  await video.play();
  emptyState.classList.add("is-hidden");
  state.running = true;
  state.lastVideoTime = -1;
  ui.btnCamera.textContent = "Apagar cámara";
  ui.btnShot.disabled = false;
  ui.cameraLabel.textContent = "en vivo";
  setDot(ui.statusCamera, "live");
  loop();
}

function stopCamera() {
  state.running = false;
  state.stream?.getTracks().forEach((track) => track.stop());
  state.stream = null;
  video.srcObject = null;
  ui.btnCamera.textContent = "Encender cámara";
  ui.btnShot.disabled = true;
  ui.cameraLabel.textContent = "apagada";
  setDot(ui.statusCamera, "idle");
  if (!ui.gallery.children.length) emptyState.classList.remove("is-hidden");
}

function renderSaveCanvas(source, detections, mirror) {
  const saveCanvas = document.createElement("canvas");
  saveCanvas.width = canvas.width;
  saveCanvas.height = canvas.height;
  const saveCtx = saveCanvas.getContext("2d", { willReadFrequently: true });
  const intensity = Number(ui.blurRange.value);

  if (mirror) {
    saveCtx.translate(saveCanvas.width, 0);
    saveCtx.scale(-1, 1);
    saveCtx.drawImage(source, 0, 0, saveCanvas.width, saveCanvas.height);
    saveCtx.setTransform(1, 0, 0, 1, 0, 0);
  } else {
    saveCtx.drawImage(source, 0, 0, saveCanvas.width, saveCanvas.height);
  }

  const landmarks = detections?.faceLandmarks || [];
  const drawnLandmarks = mirror ? mirrorLandmarks(landmarks) : landmarks;
  const faces = drawnLandmarks.map((points) =>
    boundsFromLandmarks(points, saveCanvas.width, saveCanvas.height)
  );

  if (ui.toggleBlur.checked && faces.length) {
    if (state.opencv) blurFaceRegions(state.opencv, saveCanvas, faces, intensity);
    else canvasClipBlur(saveCtx, faces, intensity);
  }

  return { saveCanvas, faces };
}

async function captureShot(source, detections, mirror, sourceLabel = "camara") {
  const { saveCanvas, faces } = renderSaveCanvas(source, detections, mirror);
  const blob = await canvasToBlob(saveCanvas);
  if (!blob) return;
  const shot = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    faces: faces.length,
    engine: state.opencv ? "mediapipe+opencv" : "mediapipe+canvas",
    source: sourceLabel,
    blob,
  };
  await saveShot(shot);
  await renderGallery();
}

async function processUploadedFile(file) {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  await image.decode();
  emptyState.classList.add("is-hidden");
  syncCanvasSize(image);
  const detections = await detectStill(image);
  processFrame(image, detections, { mirror: false });
  await captureShot(image, detections, false, "archivo");
  URL.revokeObjectURL(url);
}

function shotCard(shot) {
  const url = URL.createObjectURL(shot.blob);
  const button = document.createElement("button");
  button.className = "shot";
  button.type = "button";
  button.innerHTML = `
    <img alt="Foto procesada ${new Date(shot.createdAt).toLocaleString("es")}" src="${url}" />
    <span class="shot-meta">${shot.faces} cara${shot.faces === 1 ? "" : "s"} · ${shot.engine}</span>
  `;
  button.addEventListener("click", () => openLightbox(shot, url));
  return button;
}

function openLightbox(shot, url) {
  const overlay = document.createElement("div");
  overlay.className = "lightbox";
  overlay.innerHTML = `
    <div>
      <img alt="Vista ampliada" src="${url}" />
      <div class="lightbox-actions">
        <button class="btn shutter" type="button" data-act="download">Descargar</button>
        <button class="btn danger-ghost" type="button" data-act="delete">Eliminar</button>
        <button class="btn ghost" type="button" data-act="close">Cerrar</button>
      </div>
    </div>
  `;
  overlay.addEventListener("click", async (event) => {
    const act = event.target.dataset?.act;
    if (!act && event.target !== overlay) return;
    if (act === "download") {
      downloadBlob(shot.blob, `rendercara-${shot.id.slice(0, 8)}.jpg`);
      return;
    }
    if (act === "delete") {
      await deleteShot(shot.id);
      await renderGallery();
    }
    overlay.remove();
  });
  document.body.appendChild(overlay);
}

async function renderGallery() {
  const shots = await listShots();
  ui.gallery.replaceChildren();
  ui.galleryCount.textContent = `${shots.length} foto${shots.length === 1 ? "" : "s"}`;
  ui.btnExport.disabled = shots.length === 0;
  ui.btnClear.disabled = shots.length === 0;

  if (!shots.length) {
    const empty = document.createElement("div");
    empty.className = "gallery-empty";
    empty.textContent = "Todavía no hay fotos listas.";
    ui.gallery.append(empty);
    return;
  }

  for (const shot of shots) ui.gallery.append(shotCard(shot));
}

async function downloadAll() {
  const shots = await listShots();
  shots.forEach((shot, index) => {
    downloadBlob(shot.blob, `rendercara-${String(index + 1).padStart(2, "0")}.jpg`);
  });
}

async function boot() {
  ui.blurValue.textContent = ui.blurRange.value;
  ui.hudBlur.textContent = `desenfoque ${ui.blurRange.value}`;
  await renderGallery();

  try {
    state.landmarker = await createFaceLandmarker(Number(ui.maxFaces.value));
    setDot(ui.statusEngine, "ready");
    ui.engineLabel.textContent = "MediaPipe listo";
  } catch (error) {
    setDot(ui.statusEngine, "error");
    ui.engineLabel.textContent = "sin MediaPipe";
    console.error(error);
    return;
  }

  loadOpenCv()
    .then((cv) => {
      state.opencv = cv;
      ui.engineLabel.textContent = "MediaPipe + OpenCV";
    })
    .catch(() => {
      ui.engineLabel.textContent = "MediaPipe (canvas)";
    });

  ui.btnCamera.addEventListener("click", async () => {
    try {
      await startCamera();
    } catch (error) {
      ui.cameraLabel.textContent = "sin permiso";
      setDot(ui.statusCamera, "error");
      console.error(error);
    }
  });

  ui.btnShot.addEventListener("click", () =>
    captureShot(video, state.lastDetections, true, "camara")
  );
  ui.btnExport.addEventListener("click", downloadAll);
  ui.btnClear.addEventListener("click", async () => {
    await clearShots();
    await renderGallery();
  });
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (file) await processUploadedFile(file);
    fileInput.value = "";
  });
  ui.blurRange.addEventListener("input", () => {
    ui.blurValue.textContent = ui.blurRange.value;
    ui.hudBlur.textContent = `desenfoque ${ui.blurRange.value}`;
  });
  ui.maxFaces.addEventListener("change", async () => {
    if (!state.landmarker) return;
    await state.landmarker.setOptions({ numFaces: Number(ui.maxFaces.value) });
  });
}

boot();
