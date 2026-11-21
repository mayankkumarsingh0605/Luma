import { GroqProvider } from "./groqProvider.js";

export class AIService {
  private groqProvider: GroqProvider;

  constructor() {
    this.groqProvider = new GroqProvider();
  }

  /**
   * Generates an AI assistant response for a given user message.
   * Encapsulates the provider layer so providers can be swapped or extended.
   */
  async generateResponse(message: string): Promise<string> {
    if (!message || typeof message !== "string" || !message.trim()) {
      throw new Error("Invalid input: message must be a non-empty string.");
    }

    return await this.groqProvider.generateText(message.trim());
  }
}

// Export a singleton instance for use across server routes
export const aiService = new AIService();
