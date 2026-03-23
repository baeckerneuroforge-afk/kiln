import { NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

// GET /api/unsubscribe/weekly-report?userId=xxx&token=xxx — One-click Unsubscribe
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("userId");
  const token = request.nextUrl.searchParams.get("token");

  if (!userId || !token) {
    return new Response("Missing parameters", { status: 400 });
  }

  // Verify HMAC token
  const expectedToken = createHmac("sha256", process.env.UNSUBSCRIBE_SECRET || "kiln-unsub-default")
    .update(userId)
    .digest("hex");

  const tokenBuffer = Buffer.from(token, "hex");
  const expectedBuffer = Buffer.from(expectedToken, "hex");

  if (tokenBuffer.length !== expectedBuffer.length || !timingSafeEqual(tokenBuffer, expectedBuffer)) {
    return new Response("Invalid or expired link", { status: 403 });
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { weeklyReportEnabled: false },
    });

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Unsubscribed</title></head>
<body style="margin:0;padding:0;background:#0C0A09;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh">
  <div style="text-align:center;padding:40px">
    <div style="display:inline-block;width:48px;height:48px;border-radius:10px;background:linear-gradient(135deg,#F97316,#DC2626);line-height:48px;text-align:center;font-family:serif;font-size:24px;font-weight:700;color:#fff;margin-bottom:16px">K</div>
    <h1 style="font-family:serif;font-size:24px;color:#F5F5F5;margin:0 0 8px">Unsubscribed</h1>
    <p style="color:#A3A3A3;font-size:14px;margin:0 0 24px">You won&rsquo;t receive weekly KB reports anymore.</p>
    <p style="color:#737373;font-size:12px">You can re-enable this in <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://kilnbase.com"}/dashboard/settings" style="color:#F97316">Settings</a>.</p>
  </div>
</body>
</html>`;

    return new Response(html, {
      headers: { "Content-Type": "text/html" },
    });
  } catch {
    return new Response("User not found", { status: 404 });
  }
}
