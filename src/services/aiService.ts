import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export const AI_MODELS = {
  FLASH: "gemini-3-flash-preview",
  PRO: "gemini-3.1-pro-preview"
};

export interface CachedResponse {
  data: any;
  timestamp: number;
  contextHash?: string;
}

export const getCache = (key: string): CachedResponse | null => {
  const cached = localStorage.getItem(key);
  if (!cached) return null;
  return JSON.parse(cached);
};

export const setCache = (key: string, data: any, contextHash?: string) => {
  localStorage.setItem(key, JSON.stringify({
    data,
    timestamp: Date.now(),
    contextHash
  }));
};

export const isCacheValid = (cached: CachedResponse | null, maxAgeMs: number, contextHash?: string): boolean => {
  if (!cached) return false;
  const isFresh = Date.now() - cached.timestamp < maxAgeMs;
  const isSameContext = !contextHash || cached.contextHash === contextHash;
  return isFresh && isSameContext;
};

export const generateContent = async (params: {
  model?: string;
  contents: string | any;
  config?: any;
}) => {
  const maxRetries = 2;
  let lastError: any = null;

  for (let i = 0; i <= maxRetries; i++) {
    try {
      if (i > 0) {
        console.log(`Retrying AI request (attempt ${i + 1}/${maxRetries + 1})...`);
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, i * 1000));
      }

      const response = await ai.models.generateContent({
        model: params.model || AI_MODELS.FLASH,
        contents: params.contents,
        config: params.config
      });

      if (!response || !response.text) {
        // If we have a response object but text is empty, it might be a tool call or a failed generation
        if (response.candidates && response.candidates[0]?.finishReason === 'SAFETY') {
          throw new Error("AI generation blocked by safety filters. Please try rephrasing.");
        }
        throw new Error("Incomplete response received from AI service");
      }

      return response;
    } catch (error: any) {
      lastError = error;
      console.error(`AI Service Attempt ${i + 1} Error:`, error);
      
      const status = error?.status || error?.error?.status || "";
      const message = error?.message || "";

      // Specific handling for non-retryable errors
      if (status === "INVALID_ARGUMENT" || status === "PERMISSION_DENIED" || status === "UNAUTHENTICATED") {
        break;
      }

      // If we keep getting 500s specifically on tool calls, we should note that
      if (status === "INTERNAL" && params.config?.tools) {
        console.warn("Internal error likely related to AI Tools (Google Search). Attempting retry...");
      }
      
      // If it's the last attempt, we'll rethrow after loop
    }
  }

  // If we reach here, all attempts failed
  const errorMsg = lastError?.message || JSON.stringify(lastError);
  throw new Error(`AI Service persistent failure: ${errorMsg}`);
};
