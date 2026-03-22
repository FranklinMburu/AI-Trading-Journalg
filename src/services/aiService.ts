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
  try {
    const response = await ai.models.generateContent({
      model: params.model || AI_MODELS.FLASH,
      contents: params.contents,
      config: params.config
    });
    return response;
  } catch (error) {
    console.error("AI Service Error:", error);
    throw error;
  }
};
