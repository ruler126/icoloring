import { readHistory, type HistoryItem } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let history: HistoryItem[];

  try {
    history = await readHistory();
  } catch (error) {
    console.warn(
      `[iColoring] history read skipped | ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    history = [];
  }

  return Response.json(
    history.map((item) => ({
      ...item,
      imageUrl: `/api/files/${item.fileName}`,
      downloadUrl: `/api/files/${item.fileName}?download=1&size=1024`,
    })),
  );
}
