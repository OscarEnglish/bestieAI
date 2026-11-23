import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Mood } from "@prisma/client";

export async function POST(req: NextRequest) {
  try {
    const user = await prisma.user.findFirst();
    const persona = await prisma.persona.findFirst({ where: { name: "AI-1" } });

    if (!user || !persona) {
      return NextResponse.json(
        { error: "Seed data missing. No user or persona found." },
        { status: 404 }
      );
    }

    const relationship = await prisma.relationshipState.findUnique({
      where: {
        userId_personaId: {
          userId: user.id,
          personaId: persona.id,
        },
      },
    });

    if (!relationship) {
      return NextResponse.json(
        { error: "RelationshipState not found." },
        { status: 404 }
      );
    }

    const updated = await prisma.relationshipState.update({
      where: { id: relationship.id },
      data: {
        current_mood: Mood.NEUTRAL,
        cooldown_until: null,
        offense_tier: 0,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Dev Reset successful: Mood set to NEUTRAL, cooldown cleared.",
      relationship: updated,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to reset dev state" },
      { status: 500 }
    );
  }
}
