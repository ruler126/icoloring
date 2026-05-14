import { randomUUID } from "node:crypto";

import { generateTextImage } from "@/lib/ai";
import {
  ecommerceDirectionPresets,
  getOutputSizeByQuality,
  type CustomAiSettings,
  type EcommerceDirection,
} from "@/lib/coloring";
import { addHistoryItemBestEffort, saveGeneratedFile } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      prompt?: string;
      style?: string;
      provider?: CustomAiSettings;
      ecommerceDirection?: EcommerceDirection;
    };

    const prompt = body.prompt?.trim();
    const style = body.style?.trim() || "illustration";

    if (!prompt) {
      return Response.json({ error: "请输入提示词。" }, { status: 400 });
    }

    const ecommerceDirection = resolveEcommerceDirection(body.ecommerceDirection);
    const image = await generateTextImage(prompt, style, body.provider, {
      ecommerceDirection,
    });
    const outputSize = getOutputSizeByQuality(body.provider?.outputQuality);
    const id = randomUUID();
    const fileName = `${id}.png`;

    await saveGeneratedFile(fileName, image);
    await addHistoryItemBestEffort({
      id,
      mode: "art",
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
        error: error instanceof Error ? error.message : "文生图失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}

function resolveEcommerceDirection(value: unknown): EcommerceDirection | undefined {
  return ecommerceDirectionPresets.some((item) => item.id === value)
    ? (value as EcommerceDirection)
    : undefined;
}
