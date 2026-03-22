// Server-side voice processing service
// Uses OpenAI Whisper API for speech-to-text (when OPENAI_API_KEY is set)
// Falls back to returning raw audio for client-side Web Speech API processing

interface STTResult {
  text: string | null;
  source: "whisper" | "browser";
  message?: string;
}

interface TTSResult {
  audio: Buffer | null;
  source: "elevenlabs" | "browser";
  contentType?: string;
  message?: string;
}

class VoiceService {
  private readonly DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel

  /**
   * Prüft ob serverseitige Speech-to-Text Verarbeitung verfügbar ist
   */
  isServerSTTAvailable(): boolean {
    return !!process.env.OPENAI_API_KEY;
  }

  /**
   * Prüft ob serverseitige Text-to-Speech Verarbeitung verfügbar ist
   */
  isServerTTSAvailable(): boolean {
    return !!process.env.ELEVENLABS_API_KEY;
  }

  /**
   * Konvertiert Audio zu Text via OpenAI Whisper API oder Fallback auf Browser
   */
  async speechToText(audioBuffer: Buffer, mimeType: string): Promise<STTResult> {
    if (!this.isServerSTTAvailable()) {
      return {
        text: null,
        source: "browser",
        message: "Use client-side Web Speech API",
      };
    }

    try {
      const formData = new FormData();

      // Dateiendung aus MIME-Type ableiten
      const extension = mimeType.split("/")[1] || "webm";
      const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
      formData.append("file", blob, `audio.${extension}`);
      formData.append("model", "whisper-1");
      formData.append("language", "de");

      const response = await fetch(
        "https://api.openai.com/v1/audio/transcriptions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Whisper API Fehler: ${response.status} — ${error}`);
      }

      const data = await response.json();

      return {
        text: data.text,
        source: "whisper",
      };
    } catch (error) {
      console.error("[VoiceService] Speech-to-Text Fehler:", error);
      throw error;
    }
  }

  /**
   * Konvertiert Text zu Audio via ElevenLabs API oder Fallback auf Browser
   */
  async textToSpeech(text: string): Promise<TTSResult> {
    if (!this.isServerTTSAvailable()) {
      return {
        audio: null,
        source: "browser",
        message: "Use client-side SpeechSynthesis",
      };
    }

    try {
      const voiceId = this.DEFAULT_VOICE_ID;

      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "xi-api-key": process.env.ELEVENLABS_API_KEY!,
          },
          body: JSON.stringify({
            text,
            model_id: "eleven_multilingual_v2",
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
            },
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`ElevenLabs API Fehler: ${response.status} — ${error}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const audio = Buffer.from(arrayBuffer);

      return {
        audio,
        source: "elevenlabs",
        contentType: "audio/mpeg",
      };
    } catch (error) {
      console.error("[VoiceService] Text-to-Speech Fehler:", error);
      throw error;
    }
  }
}

export const voiceService = new VoiceService();
