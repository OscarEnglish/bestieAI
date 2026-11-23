import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processChatMessage } from "@/lib/state-machine";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, userId, personaId } = body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json(
        { error: "A valid 'message' string is required." },
        { status: 400 }
      );
    }

    const result = await processChatMessage({
      prisma,
      userId,
      personaId,
      message: message.trim(),
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error("Error in /api/chat handler:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const userId = searchParams.get("userId");
    const personaId = searchParams.get("personaId");

    const user = userId
      ? await prisma.user.findUnique({ where: { id: userId } })
      : await prisma.user.findFirst();

    const persona = personaId
      ? await prisma.persona.findUnique({ where: { id: personaId } })
      : await prisma.persona.findFirst({ where: { name: "AI-1" } });

    if (!user || !persona) {
      return NextResponse.json(
        { message: "Chat engine ready. No active user or persona found." },
        { status: 200 }
      );
    }

    const relationship = await prisma.relationshipState.findUnique({
      where: {
        userId_personaId: {
          userId: user.id,
          personaId: persona.id,
        },
      },
      include: {
        boundaries: true,
        messages: {
          orderBy: { timestamp: "desc" },
          take: 10,
        },
      },
    });

    return NextResponse.json({
      status: "ready",
      user: { id: user.id, name: user.name },
      persona: { id: persona.id, name: persona.name },
      relationship,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
