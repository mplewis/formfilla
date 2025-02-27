declare module "llm-interface" {
  interface ApiKeyConfig {
    openai?: string;
    [key: string]: string | undefined;
  }

  interface Message {
    model?: string;
    messages: Array<{ role: string; content: string }>;
  }

  interface SendMessageOptions {
    max_tokens?: number;
    [key: string]: any;
  }

  export class LLMInterface {
    static setApiKey(apiKeyConfig: ApiKeyConfig): void;
    static sendMessage(
      provider: string | [string, string],
      message: string | Message,
      options?: SendMessageOptions
    ): Promise<{
      success: boolean;
      recoveryMode: boolean;
      results: string;
      total_time: string;
      request_time: string;
      retries: number;
    }>;
  }
}
