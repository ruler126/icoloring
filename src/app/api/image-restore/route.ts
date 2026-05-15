import { randomUUID } from "node:crypto";

import { generateImageRestoreWithCustomProvider } from "@/lib/ai";
import {
  getOutputSizeByQuality,
  type CustomAiSettings,
} from "@/lib/coloring";
import { addHistoryItemBestEffort, saveGeneratedFile } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const uploadedFile = formData.get("file");
    const style = String(formData.get("style") || "archive");
    const providerRaw = formData.get("provider");

    if (!(uploadedFile instanceof File)) {
      return Response.json({ error: "请先上传一张老照片。" }, { status: 400 });
    }

    const providerSettings = parseProviderSettings(providerRaw);

    if (providerSettings?.imageProviderMode !== "custom") {
      return Response.json(
        { error: "请先切换到自定义 AI 修复模式。" },
        { status: 400 },
      );
    }

    const prompt = uploadedFile.name || "已上传老照片";
    const buffer = Buffer.from(await uploadedFile.arrayBuffer());
    const outputSize = getOutputSizeByQuality(providerSettings.outputQuality);
    const image = await generateImageRestoreWithCustomProvider(
      buffer,
      uploadedFile.type || "image/png",
      style,
      providerSettings,
    );
    const id = randomUUID();
    const fileName = `${id}.png`;

    await saveGeneratedFile(fileName, image);
    await addHistoryItemBestEffort({
      id,
      mode: "restore",
      prompt,
      style,
      createdAt: new Date().toISOString(),
      fileName,
      mimeType: "image/png",
      width: outputSize,
      height: outputSize,
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
          error instanceof Error
            ? error.message
            : "老照片修复失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}

function parseProviderSettings(value: FormDataEntryValue | null): CustomAiSettings | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<CustomAiSettings>;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return {
      providerMode: parsed.providerMode === "custom" ? "custom" : "free",
      imageProviderMode:
        parsed.imageProviderMode === "custom" ? "custom" : "local",
      outputQuality:
        parsed.outputQuality === "hd1080" || parsed.outputQuality === "ultra2048"
          ? parsed.outputQuality
          : "standard",
      baseUrl: typeof parsed.baseUrl === "string" ? parsed.baseUrl : "",
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      model: typeof parsed.model === "string" ? parsed.model : "",
      allowFallback: false,
    };
  } catch {
    return null;
  }
}
