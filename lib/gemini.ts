
import { GoogleGenAI } from "@google/genai";

export const GEMINI_API_KEY = "AIzaSyDEFCiAg4VcOvImldhQqMwenPaNlPvgswY";

// FIX: Reverted to hardcoded API key to resolve runtime environment variable issue.
export const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });