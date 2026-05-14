import { randomUUID } from "node:crypto";

import { generateTextColoringPage } from "@/lib/ai";
import { getOutputSizeByQuality, type CustomAiSettings } from "@/lib/coloring";
import { addHistoryItemBestEffort, saveGeneratedFile } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      prompt?: string;
      style?: string;
      provider?: CustomAiSettings;
    };

    const prompt = body.prompt?.trim();
    const style = body.style?.trim() || "kids";

    if (!prompt) {
      return Response.json({ error: "请输入提示词。" }, { status: 400 });
    }

    const image = await generateTextColoringPage(prompt, style, body.provider);
    const outputSize = getOutputSizeByQuality(body.provider?.outputQuality);
    const id = randomUUID();
    const fileName = `${id}.png`;

    await saveGeneratedFile(fileName, image);
    await addHistoryItemBestEffort({
      id,
      mode: "text",
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
          error instanceof Error ? error.message : "生成失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}
