import { basename, extname } from "node:path";

import sharp from "sharp";

import { readGeneratedFile } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getMimeType(fileName: string) {
  const extension = extname(fileName).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".svg") return "image/svg+xml";
  return "image/png";
}

function parseDownloadSize(value: string | null) {
  if (value === "2048") {
    return 2048;
  }

  if (value === "1024") {
    return 1024;
  }

  return null;
}

export async function GET(
  request: Request,
  context: RouteContext<"/api/files/[name]">,
) {
  try {
    const { name } = await context.params;
    const safeName = basename(name);
    const url = new URL(request.url);
    const requestedSize = parseDownloadSize(url.searchParams.get("size"));
    const originalData = await readGeneratedFile(safeName);
    const data = requestedSize
      ? await sharp(originalData)
          .resize({
            width: requestedSize,
            height: requestedSize,
            fit: "contain",
            background: "white",
            withoutEnlargement: false,
            kernel: sharp.kernel.lanczos3,
          })
          .png()
          .toBuffer()
      : originalData;
    const headers = new Headers({
      "Content-Type": requestedSize ? "image/png" : getMimeType(safeName),
      "Cache-Control": "no-store",
    });

    if (url.searchParams.get("download") === "1") {
      headers.set("Content-Disposition", `attachment; filename="${safeName}"`);
    }

    const body = new Uint8Array(data);
    return new Response(body, { headers });
  } catch {
    return Response.json({ error: "文件不存在。" }, { status: 404 });
  }
}
