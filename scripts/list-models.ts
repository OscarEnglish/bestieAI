import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || "";
const ai = new GoogleGenAI({ apiKey });

async function main() {
  try {
    const list = await ai.models.list();
    console.log("AVAILABLE MODELS:");
    for await (const m of list) {
      if (m.name?.includes("gemini")) {
        console.log(" -", m.name);
      }
    }
  } catch (err: any) {
    console.error("LIST ERROR:", err?.message || err);
  }
}

main();
