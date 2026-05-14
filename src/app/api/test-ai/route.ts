import { testCustomProviderConnection } from "@/lib/ai";
import type { CustomAiSettings } from "@/lib/coloring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      provider?: CustomAiSettings;
    };

    const provider = body.provider;

    if (!provider || !isCustomProviderEnabled(provider)) {
      return Response.json(
        { error: "请先切换到自定义 AI 服务模式。" },
        { status: 400 },
      );
    }

    const result = await testCustomProviderConnection(provider);
    return Response.json(result);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "连通测试失败，请稍后重试。",
      },
      { status: 500 },
    );
  }
}

function isCustomProviderEnabled(provider: CustomAiSettings) {
  return (
    provider.providerMode === "custom" || provider.imageProviderMode === "custom"
  );
}
