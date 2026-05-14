import { randomUUID } from "node:crypto";

import { generateImageColoringPageWithCustomProvider } from "@/lib/ai";
import {
  getOutputSizeByQuality,
  type CustomAiSettings,
} from "@/lib/coloring";
import { convertImageToLineart } from "@/lib/image-to-lineart";
import { addHistoryItem, saveGeneratedFile } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const uploadedFile = formData.get("file");
    const style = String(formData.get("style") || "clean");
    const providerRaw = formData.get("provider");

    if (!(uploadedFile instanceof File)) {
      return Response.json({ error: "请先上传一张图片。" }, { status: 400 });
    }

    const prompt = uploadedFile.name || "已上传图片";
    const buffer = Buffer.from(await uploadedFile.arrayBuffer());
    const providerSettings = parseProviderSettings(providerRaw);
    const useCustomProvider = providerSettings?.imageProviderMode === "custom";
    const outputSize = getOutputSizeByQuality(providerSettings?.outputQuality);
    let image: Buffer;

    if (useCustomProvider) {
      try {
        image = await generateImageColoringPageWithCustomProvider(
          buffer,
          uploadedFile.type || "image/png",
          style,
          providerSettings,
        );
      } catch (error) {
        if (!providerSettings?.allowFallback) {
          throw error;
        }
        image = await convertImageToLineart(buffer, style, outputSize);
      }
    } else {
      image = await convertImageToLineart(buffer, style, outputSize);
    }
    const id = randomUUID();
    const fileName = `${id}.png`;

    await saveGeneratedFile(fileName, image);
    await addHistoryItem({
      id,
      mode: "image",
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
          error instanceof Error ? error.message : "图片处理失败，请稍后重试。",
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
      allowFallback: Boolean(parsed.allowFallback),
    };
  } catch {
    return null;
  }
}
