# RenderCara

Aplicación local para **sacar fotos de personas**, **detectar la cara en el dispositivo** y **guardar la imagen ya procesada**. Nada se sube a un servidor: MediaPipe ubica el rostro y OpenCV aplica un desenfoque gaussiano antes de que la foto quede disponible.

## Qué hace

- Cámara en vivo o carga de una imagen existente
- Detección de hasta 8 caras humanas con MediaPipe Face Landmarker (478 puntos)
- Render de la malla facial sobre la vista previa
- Desenfoque en tiempo real en el preview (canvas)
- Al guardar, OpenCV.js aplica `GaussianBlur` con máscara elíptica sobre cada rostro
- Galería persistente en el navegador (IndexedDB), con descarga individual o masiva
- El original nítido no se guarda: solo queda la versión ya anonimizada

## Cómo ejecutarla

Necesitás Node.js 18 o superior.

```bash
npm install
npm run dev
```

Abrí `http://127.0.0.1:5173` y concedé permiso a la cámara.

## Stack

| Capa | Librería |
| --- | --- |
| Detección y malla de cara | MediaPipe Tasks Vision (`FaceLandmarker`) |
| Desenfoque | OpenCV.js (`GaussianBlur` + máscara elíptica) |
| Reserva si OpenCV no carga | `canvas` con `filter: blur()` |
| Interfaz | Vite + HTML/CSS/JS |

Todo corre en el navegador. No hay backend ni API externa de imágenes.
