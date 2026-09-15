export function loadOpenCv() {
  if (window.__opencvPromise) return window.__opencvPromise;

  window.__opencvPromise = new Promise((resolve, reject) => {
    if (window.cv?.Mat) {
      resolve(window.cv);
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.src = "https://docs.opencv.org/4.10.0/opencv.js";
    script.onerror = () => reject(new Error("No se pudo cargar OpenCV.js"));
    script.onload = () => {
      if (window.cv?.Mat) {
        resolve(window.cv);
        return;
      }
      window.cv.onRuntimeInitialized = () => resolve(window.cv);
    };
    document.head.appendChild(script);
  });

  return window.__opencvPromise;
}

function clampRect(x, y, w, h, cols, rows) {
  const left = Math.max(0, Math.floor(x));
  const top = Math.max(0, Math.floor(y));
  const width = Math.max(1, Math.min(cols - left, Math.floor(w)));
  const height = Math.max(1, Math.min(rows - top, Math.floor(h)));
  return { left, top, width, height };
}

function oddKernel(intensity, faceWidth) {
  const scaled = Math.round((intensity / 51) * Math.max(21, faceWidth * 0.5));
  const kernel = Math.max(3, scaled | 1);
  return kernel % 2 === 0 ? kernel + 1 : kernel;
}

export function blurFaceRegions(cv, canvas, faces, intensity) {
  if (!cv?.Mat || !faces.length) return false;

  const src = cv.imread(canvas);
  try {
    for (const face of faces) {
      const box = clampRect(face.x, face.y, face.width, face.height, src.cols, src.rows);
      if (box.width < 10 || box.height < 10) continue;

      const rect = new cv.Rect(box.left, box.top, box.width, box.height);
      const roi = src.roi(rect);
      const blurred = new cv.Mat();
      const kernel = oddKernel(intensity, box.width);
      cv.GaussianBlur(roi, blurred, new cv.Size(kernel, kernel), 0, 0, cv.BORDER_DEFAULT);

      const mask = cv.Mat.zeros(box.height, box.width, cv.CV_8UC1);
      cv.ellipse(
        mask,
        new cv.Point(Math.floor(box.width / 2), Math.floor(box.height / 2)),
        new cv.Size(Math.floor(box.width * 0.48), Math.floor(box.height * 0.52)),
        0,
        0,
        360,
        new cv.Scalar(255),
        -1
      );
      blurred.copyTo(roi, mask);

      roi.delete();
      blurred.delete();
      mask.delete();
    }

    cv.imshow(canvas, src);
    return true;
  } finally {
    src.delete();
  }
}

const scratch = document.createElement("canvas");

export function canvasClipBlur(ctx, faces, intensity) {
  scratch.width = ctx.canvas.width;
  scratch.height = ctx.canvas.height;
  scratch.getContext("2d").drawImage(ctx.canvas, 0, 0);

  const radius = Math.max(4, Math.round(intensity * 0.7));
  for (const face of faces) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(
      face.x + face.width / 2,
      face.y + face.height / 2,
      face.width * 0.48,
      face.height * 0.52,
      0,
      0,
      Math.PI * 2
    );
    ctx.closePath();
    ctx.clip();
    ctx.filter = `blur(${radius}px)`;
    ctx.drawImage(scratch, 0, 0);
    ctx.restore();
  }
}
