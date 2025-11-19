import { AGENT_HOST } from "@/lib/ws";

export async function POST(req: Request) {
  const url = new URL(req.url);
  const activity = (url.searchParams.get("activity") || "").trim();

  if (!activity) {
    return Response.json({ status: "invalid" }, { status: 400 });
  }

  const target = `https://${AGENT_HOST}/v1/check_activity_validity?activity=${encodeURIComponent(
    activity
  )}`;

  try {
    const res = await fetch(target, { method: "POST" });
    if (!res.ok) {
      return Response.json({ status: "invalid" }, { status: res.status });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    return Response.json(data, { status: 200 });
  } catch {
    return Response.json({ status: "invalid" }, { status: 502 });
  }
}


