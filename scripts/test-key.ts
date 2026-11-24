import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || "";
console.log("Testing API Key with gemini-3.8-flash...");

const ai = new GoogleGenAI({ apiKey });

async function main() {
  try {
    const res = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: "Say hi in 3 words",
    });
    console.log("SUCCESS WITH gemini-3.8-flash:", res.text);
  } catch (err: any) {
    console.error("ERROR:", err?.message || err);
  }
}

main();
