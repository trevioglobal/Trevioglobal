import { NextRequest, NextResponse } from "next/server";

const productionApi = "https://travelpartner-api-v7nt.onrender.com";

function getBackendUrl(path: string[], request: NextRequest) {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/+$/, "");
  const configuredIsLocal = !!configured && /(?:localhost|127\.0\.0\.1)(?::\d+)?/i.test(configured);
  const base = configured && !configuredIsLocal
    ? configured.replace(/\/api$/i, "")
    : configuredIsLocal && process.env.NODE_ENV !== "production"
      ? configured.replace(/\/api$/i, "")
      : productionApi;
  return `${base}/${path.join("/")}${request.nextUrl.search}`;
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");

  try {
    const response = await fetch(getBackendUrl(path, request), {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
      cache: "no-store",
    });
    return new NextResponse(response.body, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") || "application/json",
        "cache-control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Authentication service is temporarily unavailable" }, { status: 503 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
