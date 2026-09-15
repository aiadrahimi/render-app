import { FaceLandmarker, FilesetResolver, DrawingUtils } from "@mediapipe/tasks-vision";

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm";

async function createWithDelegate(vision, numFaces, delegate) {
  return FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate,
    },
    runningMode: "VIDEO",
    numFaces,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  });
}

export async function createFaceLandmarker(numFaces = 4) {
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  try {
    return await createWithDelegate(vision, numFaces, "GPU");
  } catch {
    return createWithDelegate(vision, numFaces, "CPU");
  }
}

export function mirrorLandmarks(landmarksList) {
  return landmarksList.map((landmarks) =>
    landmarks.map((point) => ({ ...point, x: 1 - point.x, y: point.y, z: point.z }))
  );
}

export function boundsFromLandmarks(landmarks, width, height, padding = 0.18) {
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;

  for (const point of landmarks) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  const padX = (maxX - minX) * padding;
  const padY = (maxY - minY) * padding;
  return {
    x: (minX - padX) * width,
    y: (minY - padY) * height,
    width: (maxX - minX + padX * 2) * width,
    height: (maxY - minY + padY * 2) * height,
  };
}

export function drawFaceMesh(ctx, landmarksList) {
  const drawingUtils = new DrawingUtils(ctx);
  for (const landmarks of landmarksList) {
    drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_TESSELATION, {
      color: "rgba(226, 163, 107, 0.28)",
      lineWidth: 0.6,
    });
    drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_CONTOURS, {
      color: "rgba(243, 236, 227, 0.85)",
      lineWidth: 1.2,
    });
    drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_FACE_OVAL, {
      color: "#8fce9a",
      lineWidth: 1.6,
    });
  }
}
