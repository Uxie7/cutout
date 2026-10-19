const MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function isSupportedImage(file) {
  return MIME_TYPES.has(file.type);
}

export async function processImage(file, options) {
  const sourceUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(sourceUrl);
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Your browser could not prepare this image.");
    }

    context.drawImage(image, 0, 0);

    if (options.addWatermark && options.watermarkText.trim()) {
      drawWatermark(context, canvas.width, canvas.height, options);
    }

    const blob = await canvasToBlob(canvas);

    return {
      id: createId(),
      filename: file.name,
      blob,
      createdAt: new Date().toISOString(),
      type: blob.type,
    };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("This image could not be opened."));
    image.src = source;
  });
}

function drawWatermark(context, width, height, options) {
  const shortSide = Math.min(width, height);
  const fontSize = Math.max(16, Math.round(shortSide * 0.055 * options.watermarkScale));
  const padding = Math.max(14, Math.round(shortSide * 0.035));

  context.save();
  context.globalAlpha = options.watermarkOpacity;
  context.font = `700 ${fontSize}px Inter, "Segoe UI", Arial, sans-serif`;
  context.textBaseline = "middle";
  context.fillStyle = "#ffffff";
  context.shadowColor = "rgba(0, 0, 0, 0.6)";
  context.shadowBlur = Math.max(3, Math.round(fontSize * 0.16));
  context.shadowOffsetX = 1;
  context.shadowOffsetY = 2;

  const textWidth = context.measureText(options.watermarkText).width;
  const x = options.watermarkPosition.endsWith("right")
    ? width - padding - textWidth
    : options.watermarkPosition === "center"
      ? (width - textWidth) / 2
      : padding;
  const y = options.watermarkPosition.startsWith("top")
    ? padding + fontSize / 2
    : options.watermarkPosition === "center"
      ? height / 2
      : height - padding - fontSize / 2;

  context.fillText(options.watermarkText, x, y, Math.max(1, width - padding * 2));
  context.restore();
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Your browser could not export the processed image."));
      }
    }, "image/png");
  });
}

function createId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `image-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
