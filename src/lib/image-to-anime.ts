import sharp from "sharp";

type AnimeStyle = "cel" | "shoujo" | "shonen" | "chibi" | "fantasy" | "neon";

function styleConfig(style: AnimeStyle) {
  switch (style) {
    case "shoujo":
      return {
        levels: 7,
        saturation: 1.24,
        brightness: 1.08,
        contrast: 1.04,
        edgeThreshold: 66,
        edgeOpacity: 0.34,
        tint: [255, 232, 244] as [number, number, number],
      };
    case "shonen":
      return {
        levels: 6,
        saturation: 1.3,
        brightness: 0.98,
        contrast: 1.15,
        edgeThreshold: 60,
        edgeOpacity: 0.46,
        tint: [255, 238, 220] as [number, number, number],
      };
    case "chibi":
      return {
        levels: 8,
        saturation: 1.18,
        brightness: 1.06,
        contrast: 1.02,
        edgeThreshold: 72,
        edgeOpacity: 0.28,
        tint: [255, 244, 232] as [number, number, number],
      };
    case "fantasy":
      return {
        levels: 9,
        saturation: 1.22,
        brightness: 1.05,
        contrast: 1.06,
        edgeThreshold: 68,
        edgeOpacity: 0.25,
        tint: [225, 240, 255] as [number, number, number],
      };
    case "neon":
      return {
        levels: 6,
        saturation: 1.42,
        brightness: 0.94,
        contrast: 1.18,
        edgeThreshold: 62,
        edgeOpacity: 0.38,
        tint: [215, 235, 255] as [number, number, number],
      };
    default:
      return {
        levels: 7,
        saturation: 1.18,
        brightness: 1.02,
        contrast: 1.08,
        edgeThreshold: 64,
        edgeOpacity: 0.34,
        tint: [255, 245, 230] as [number, number, number],
      };
  }
}

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function quantizeChannel(value: number, levels: number) {
  const step = 255 / Math.max(2, levels - 1);
  return clampByte(Math.round(value / step) * step);
}

function applyPosterize(
  pixels: Uint8Array,
  levels: number,
  tint: readonly [number, number, number],
) {
  for (let index = 0; index < pixels.length; index += 3) {
    const red = quantizeChannel(pixels[index], levels);
    const green = quantizeChannel(pixels[index + 1], levels);
    const blue = quantizeChannel(pixels[index + 2], levels);

    pixels[index] = clampByte(red * 0.86 + tint[0] * 0.14);
    pixels[index + 1] = clampByte(green * 0.86 + tint[1] * 0.14);
    pixels[index + 2] = clampByte(blue * 0.86 + tint[2] * 0.14);
  }
}

function buildEdgeOverlay(
  source: Uint8Array,
  width: number,
  height: number,
  edgeThreshold: number,
  edgeOpacity: number,
) {
  const overlay = new Uint8Array(width * height * 4);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const topLeft = source[(y - 1) * width + (x - 1)];
      const top = source[(y - 1) * width + x];
      const topRight = source[(y - 1) * width + (x + 1)];
      const left = source[y * width + (x - 1)];
      const right = source[y * width + (x + 1)];
      const bottomLeft = source[(y + 1) * width + (x - 1)];
      const bottom = source[(y + 1) * width + x];
      const bottomRight = source[(y + 1) * width + (x + 1)];

      const gradientX =
        -topLeft + topRight - 2 * left + 2 * right - bottomLeft + bottomRight;
      const gradientY =
        topLeft + 2 * top + topRight - bottomLeft - 2 * bottom - bottomRight;
      const strength = Math.sqrt(gradientX * gradientX + gradientY * gradientY);

      if (strength < edgeThreshold) {
        continue;
      }

      const alpha = clampByte(
        Math.min(1, (strength - edgeThreshold) / 128 + edgeOpacity) * 255,
      );
      const pixelIndex = index * 4;
      overlay[pixelIndex] = 24;
      overlay[pixelIndex + 1] = 22;
      overlay[pixelIndex + 2] = 28;
      overlay[pixelIndex + 3] = alpha;
    }
  }

  return overlay;
}

export async function convertImageToAnime(
  buffer: Buffer,
  style: string,
  outputSize = 1024,
): Promise<Buffer> {
  const selectedStyle: AnimeStyle =
    style === "shoujo" ||
    style === "shonen" ||
    style === "chibi" ||
    style === "fantasy" ||
    style === "neon"
      ? style
      : "cel";
  const config = styleConfig(selectedStyle);

  const colorBase = await sharp(buffer)
    .rotate()
    .resize(outputSize, outputSize, {
      fit: "contain",
      background: "white",
      withoutEnlargement: false,
    })
    .flatten({ background: "white" })
    .modulate({
      saturation: config.saturation,
      brightness: config.brightness,
    })
    .linear(config.contrast, -(128 * config.contrast) + 128)
    .median(3)
    .sharpen()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const posterized = new Uint8Array(colorBase.data);
  applyPosterize(posterized, config.levels, config.tint);

  const gray = await sharp(buffer)
    .rotate()
    .resize(outputSize, outputSize, {
      fit: "contain",
      background: "white",
      withoutEnlargement: false,
    })
    .flatten({ background: "white" })
    .grayscale()
    .normalize()
    .blur(0.9)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const edgeOverlay = buildEdgeOverlay(
    gray.data,
    gray.info.width,
    gray.info.height,
    config.edgeThreshold,
    config.edgeOpacity,
  );

  return sharp(Buffer.from(posterized), {
    raw: {
      width: colorBase.info.width,
      height: colorBase.info.height,
      channels: 3,
    },
  })
    .composite([
      {
        input: Buffer.from(edgeOverlay),
        raw: {
          width: colorBase.info.width,
          height: colorBase.info.height,
          channels: 4,
        },
      },
    ])
    .png()
    .toBuffer();
}
