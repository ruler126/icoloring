import { randomUUID } from "node:crypto";

import { addHistoryItemBestEffort, saveGeneratedFile } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseMode(value: FormDataEntryValue | null) {
  return value === "anime" ? "anime" : "image";
}

function parsePositiveInteger(value: FormDataEntryValue | null, fallback: number) {
  if (typeof value !== "string") {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return Response.json({ error: "请先生成一张图片。" }, { status: 400 });
    }

    const id = randomUUID();
    const fileName = `${id}.png`;
    const mode = parseMode(formData.get("mode"));
    const promptValue = formData.get("prompt");
    const styleValue = formData.get("style");
    const prompt =
      typeof promptValue === "string" && promptValue.trim()
        ? promptValue.trim()
        : "已上传图片";
    const style =
      typeof styleValue === "string" && styleValue.trim()
        ? styleValue.trim()
        : mode === "anime"
          ? "cel"
          : "clean";
    const width = parsePositiveInteger(formData.get("width"), 1024);
    const height = parsePositiveInteger(formData.get("height"), width);
    const buffer = Buffer.from(await file.arrayBuffer());

    await saveGeneratedFile(fileName, buffer);
    await addHistoryItemBestEffort({
      id,
      mode,
      prompt,
      style,
      createdAt: new Date().toISOString(),
      fileName,
      mimeType: "image/png",
      width,
      height,
    });

    return Response.json({
      id,
      prompt,
      style,
      imageUrl: `/api/files/${fileName}`,
      downloadUrl: `/api/files/${fileName}?download=1&size=1024`,
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "图片保存失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
