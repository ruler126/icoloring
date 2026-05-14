import { readHistory } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const history = await readHistory();

  return Response.json(
    history.map((item) => ({
      ...item,
      imageUrl: `/api/files/${item.fileName}`,
      downloadUrl: `/api/files/${item.fileName}?download=1&size=1024`,
    })),
  );
}
