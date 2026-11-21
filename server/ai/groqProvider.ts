import Groq from "groq-sdk";
import dotenv from "dotenv";

export class GroqProvider {
  private getApiKey(): string | undefined {
    // Reload .env so changes in .env are picked up immediately without restarting the dev server
    dotenv.config({ override: true });
    let key = process.env.GROQ_API_KEY;
    if (key) {
      key = key.trim().replace(/^["']|["']$/g, "");
    }
    return key;
  }

  /**
   * Generates a text response for the given user message using the Groq API.
   */
  async generateText(message: string): Promise<string> {
    const apiKey = this.getApiKey();

    if (!apiKey || apiKey === "your_groq_api_key_here") {
      throw new Error("GROQ_API_KEY is not set or is using placeholder value in .env.");
    }

    const modelName = process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b";
    const groq = new Groq({ apiKey });

    try {
      const completion = await groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: "You are Luma, a helpful, friendly, and concise personal AI assistant.",
          },
          {
            role: "user",
            content: message,
          },
        ],
        model: modelName,
      });

      const responseText = completion.choices[0]?.message?.content;

      if (!responseText) {
        throw new Error("Received empty response from Groq API.");
      }

      return responseText;
    } catch (error: unknown) {
      console.error("[GroqProvider Error]:", error);
      throw error;
    }
  }
}
