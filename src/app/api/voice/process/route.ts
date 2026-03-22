import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS, PlanType } from "@/lib/stripe";
import { voiceService } from "@/lib/voice/voice-service";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } });
    const limits = PLAN_LIMITS[(user?.plan || "FREE") as PlanType];

    if (!limits.voiceInterface) {
      return NextResponse.json({ error: "Voice interface is not available on your plan" }, { status: 403 });
    }

    const formData = await req.formData();
    const mode = (formData.get("mode") as string) || "stt";

    if (mode === "stt") {
      const audio = formData.get("audio") as Blob;
      if (!audio) {
        return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
      }

      const audioBuffer = Buffer.from(await audio.arrayBuffer());
      const result = await voiceService.speechToText(audioBuffer, audio.type || "audio/webm");

      return NextResponse.json({ text: result.text, source: result.source });
    } else if (mode === "tts") {
      const text = formData.get("text") as string;
      if (!text) {
        return NextResponse.json({ error: "Text is required for TTS mode" }, { status: 400 });
      }

      const result = await voiceService.textToSpeech(text);

      if (result.audio) {
        return new NextResponse(new Uint8Array(result.audio), {
          headers: {
            "Content-Type": result.contentType || "audio/mpeg",
            "Content-Length": result.audio.length.toString(),
          },
        });
      }

      // Fallback to browser TTS
      return NextResponse.json({ source: "browser", message: result.message });
    } else {
      return NextResponse.json({ error: "Invalid mode. Use 'stt' or 'tts'" }, { status: 400 });
    }
  } catch (error) {
    console.error("Voice processing error:", error);
    return NextResponse.json({ error: "Failed to process voice request" }, { status: 500 });
  }
}
