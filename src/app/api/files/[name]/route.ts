import { basename, extname } from "node:path";

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

export async function GET(
  request: Request,
  context: RouteContext<"/api/files/[name]">,
) {
  try {
    const { name } = await context.params;
    const safeName = basename(name);
    const url = new URL(request.url);
    const originalData = await readGeneratedFile(safeName);
    const data = originalData;
    const headers = new Headers({
      "Content-Type": getMimeType(safeName),
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
