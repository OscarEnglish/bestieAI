import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const { apiKey } = await req.json();

    if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
      return NextResponse.json(
        { error: "A valid Gemini API key is required." },
        { status: 400 }
      );
    }

    const trimmedKey = apiKey.trim();

    // Set in runtime environment
    process.env.GEMINI_API_KEY = trimmedKey;

    // Update .env file on disk
    const envPath = path.join(process.cwd(), ".env");
    let envContent = "";
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, "utf-8");
    }

    if (envContent.includes("GEMINI_API_KEY=")) {
      envContent = envContent.replace(
        /GEMINI_API_KEY=.*/g,
        `GEMINI_API_KEY="${trimmedKey}"`
      );
    } else {
      envContent += `\nGEMINI_API_KEY="${trimmedKey}"\n`;
    }

    fs.writeFileSync(envPath, envContent, "utf-8");

    return NextResponse.json({
      success: true,
      message: "Gemini API key saved successfully and live for gemini-2.5-flash!",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to save API key" },
      { status: 500 }
    );
  }
}
