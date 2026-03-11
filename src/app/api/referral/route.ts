import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

// Generiert einen eindeutigen Referral-Code: KILN-XXXX
function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Ohne I/O/0/1 für Lesbarkeit
  let code = "";
  const bytes = crypto.randomBytes(4);
  for (let i = 0; i < 4; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return `KILN-${code}`;
}

// GET: Lade Referral-Daten des Users
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // User laden oder erstellen
    let user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    // Referral-Code generieren falls noch keiner existiert
    if (!user.referralCode) {
      let code = generateReferralCode();
      // Kollisions-Check
      let attempts = 0;
      while (attempts < 5) {
        const existing = await prisma.user.findUnique({ where: { referralCode: code } });
        if (!existing) break;
        code = generateReferralCode();
        attempts++;
      }
      user = await prisma.user.update({
        where: { id: userId },
        data: { referralCode: code },
      });
    }

    // Referral-Statistiken
    const referredUsers = await prisma.user.count({
      where: { referredBy: userId },
    });

    const credits = await prisma.referralCredit.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    const creditsEarned = credits.filter((c) => c.type.startsWith("UPGRADE_")).length;

    return Response.json({
      referralCode: user.referralCode,
      referredUsers,
      creditsEarned,
      credits,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// POST: Referral-Code anwenden (nach Sign-up aufgerufen)
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { referralCode } = await request.json();
    if (!referralCode || typeof referralCode !== "string") {
      return Response.json({ error: "Referral code required" }, { status: 400 });
    }

    const code = referralCode.trim().toUpperCase();

    // User laden
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    // Bereits referred?
    if (user.referredBy) {
      return Response.json({ error: "Already referred" }, { status: 400 });
    }

    // Referrer finden
    const referrer = await prisma.user.findUnique({ where: { referralCode: code } });
    if (!referrer) {
      return Response.json({ error: "Invalid referral code" }, { status: 404 });
    }

    // Sich selbst referren verhindern
    if (referrer.id === userId) {
      return Response.json({ error: "Cannot refer yourself" }, { status: 400 });
    }

    // Referral speichern
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { referredBy: referrer.id },
      }),
      prisma.referralCredit.create({
        data: {
          userId: referrer.id,
          referredUserId: userId,
          referredEmail: user.email,
          type: "SIGNUP",
        },
      }),
    ]);

    return Response.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return Response.json({ error: message }, { status: 500 });
  }
}
