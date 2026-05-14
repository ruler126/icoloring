import { loadSharp } from "@/lib/sharp-loader";

type ImageStyle = "clean" | "cartoon" | "sketch";

function styleConfig(style: ImageStyle) {
  if (style === "sketch") {
    return {
      blurSigma: 1.1,
      edgeThreshold: 96,
      minNeighbors: 1,
      expandPasses: 0,
    };
  }

  if (style === "cartoon") {
    return {
      blurSigma: 1.9,
      edgeThreshold: 114,
      minNeighbors: 2,
      expandPasses: 2,
    };
  }

  return {
    blurSigma: 1.5,
    edgeThreshold: 104,
    minNeighbors: 2,
    expandPasses: 1,
  };
}

function getIndex(x: number, y: number, width: number) {
  return y * width + x;
}

function countBlackNeighbors(
  pixels: Uint8Array,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  let count = 0;

  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      if (offsetX === 0 && offsetY === 0) {
        continue;
      }

      const nextX = x + offsetX;
      const nextY = y + offsetY;

      if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) {
        continue;
      }

      if (pixels[getIndex(nextX, nextY, width)] === 0) {
        count += 1;
      }
    }
  }

  return count;
}

function buildSobelLineart(
  source: Uint8Array,
  width: number,
  height: number,
  style: ImageStyle,
) {
  const config = styleConfig(style);
  const magnitude = new Float32Array(width * height);
  const binary = new Uint8Array(width * height);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const topLeft = source[getIndex(x - 1, y - 1, width)];
      const top = source[getIndex(x, y - 1, width)];
      const topRight = source[getIndex(x + 1, y - 1, width)];
      const left = source[getIndex(x - 1, y, width)];
      const right = source[getIndex(x + 1, y, width)];
      const bottomLeft = source[getIndex(x - 1, y + 1, width)];
      const bottom = source[getIndex(x, y + 1, width)];
      const bottomRight = source[getIndex(x + 1, y + 1, width)];

      const gradientX =
        -topLeft + topRight - 2 * left + 2 * right - bottomLeft + bottomRight;
      const gradientY =
        topLeft + 2 * top + topRight - bottomLeft - 2 * bottom - bottomRight;
      const edgeStrength = Math.sqrt(
        gradientX * gradientX + gradientY * gradientY,
      );
      const index = getIndex(x, y, width);
      magnitude[index] = edgeStrength;
      binary[index] = edgeStrength >= config.edgeThreshold ? 0 : 255;
    }
  }

  const cleaned = new Uint8Array(binary);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = getIndex(x, y, width);
      if (binary[index] !== 0) {
        continue;
      }

      const blackNeighbors = countBlackNeighbors(binary, x, y, width, height);
      if (blackNeighbors < config.minNeighbors) {
        cleaned[index] = 255;
      }
    }
  }

  let expanded = cleaned;
  for (let pass = 0; pass < config.expandPasses; pass += 1) {
    const next = new Uint8Array(expanded);

    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = getIndex(x, y, width);
        if (expanded[index] === 0) {
          continue;
        }

        const blackNeighbors = countBlackNeighbors(
          expanded,
          x,
          y,
          width,
          height,
        );
        if (
          blackNeighbors >= 3 &&
          magnitude[index] >= config.edgeThreshold * 0.58
        ) {
          next[index] = 0;
        }
      }
    }

    expanded = next;
  }

  return Buffer.from(expanded);
}

export async function convertImageToLineart(
  buffer: Buffer,
  style: string,
  outputSize = 1536,
): Promise<Buffer> {
  const sharp = await loadSharp();
  const selectedStyle: ImageStyle =
    style === "cartoon" || style === "sketch" ? style : "clean";
  const config = styleConfig(selectedStyle);

  const normalized = await sharp(buffer)
    .rotate()
    .resize(outputSize, outputSize, {
      fit: "contain",
      background: "white",
      withoutEnlargement: false,
    })
    .flatten({ background: "white" })
    .grayscale()
    .normalize()
    .blur(config.blurSigma)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = buildSobelLineart(
    normalized.data,
    normalized.info.width,
    normalized.info.height,
    selectedStyle,
  );

  return sharp(pixels, {
    raw: {
      width: normalized.info.width,
      height: normalized.info.height,
      channels: 1,
    },
  })
    .png()
    .toBuffer();
}
