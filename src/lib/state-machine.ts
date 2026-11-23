import { Mood, PrismaClient } from "@prisma/client";
import {
  evaluateMessageWithGemini,
  generatePersonaResponse,
  MiddlewareEvaluation,
  PersonaContext,
  ChatHistoryMessage,
} from "./gemini";

export function calculateTier(score: number): string {
  if (score <= 20) return "Stranger";
  if (score <= 40) return "Acquaintance";
  if (score <= 60) return "Casual Friend";
  if (score <= 80) return "Close Friend";
  return "Bestie";
}

export function getCooldownDurationMs(offenseTier: number): number {
  switch (offenseTier) {
    case 1:
      return 15 * 60 * 1000; // 15 mins
    case 2:
      return 60 * 60 * 1000; // 1 hour
    case 3:
      return 120 * 60 * 1000; // 2 hours
    default:
      return 0;
  }
}

export interface ProcessChatParams {
  prisma: PrismaClient;
  userId?: string;
  personaId?: string;
  message: string;
}

export interface ProcessChatResult {
  reply: string;
  relationship: {
    id: string;
    userId: string;
    personaId: string;
    friendship_score: number;
    tier: string;
    current_mood: Mood;
    cooldown_until: Date | null;
    offense_tier: number;
  };
  evaluation: MiddlewareEvaluation;
  is_locked: boolean;
}

export async function processChatMessage({
  prisma,
  userId,
  personaId,
  message,
}: ProcessChatParams): Promise<ProcessChatResult> {
  const trimmedMessage = message.trim();
  if (!trimmedMessage) {
    throw new Error("Message cannot be empty");
  }

  // 1. Resolve User
  let user = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;
  if (!user) {
    user = await prisma.user.findFirst();
  }
  if (!user) {
    user = await prisma.user.create({
      data: {
        name: "Test User",
        email: "testuser@bestie.ai",
      },
    });
  }

  // 2. Resolve Persona
  let persona = personaId
    ? await prisma.persona.findUnique({ where: { id: personaId } })
    : null;
  if (!persona) {
    persona = await prisma.persona.findFirst({ where: { name: "AI-1" } });
  }
  if (!persona) {
    persona = await prisma.persona.findFirst();
  }
  if (!persona) {
    persona = await prisma.persona.create({
      data: {
        name: "AI-1",
        temperament:
          "Empathetic, reflective, attentive to emotional cues, and maintains healthy boundaries.",
        base_triggers: JSON.stringify([
          { trigger: "Disrespectful language or insult", severity: "HIGH", default_flag: "RED" },
          { trigger: "Coercive or manipulative demands", severity: "HIGH", default_flag: "ORANGE" },
          { trigger: "Dismissive sarcasm", severity: "MEDIUM", default_flag: "YELLOW" },
        ]),
      },
    });
  }

  // 3. Resolve RelationshipState
  let relationship = await prisma.relationshipState.findUnique({
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

  if (!relationship) {
    relationship = await prisma.relationshipState.create({
      data: {
        userId: user.id,
        personaId: persona.id,
        friendship_score: 50,
        tier: "Acquaintance",
        current_mood: Mood.NEUTRAL,
        offense_tier: 0,
        cooldown_until: null,
      },
      include: {
        boundaries: true,
        messages: {
          orderBy: { timestamp: "desc" },
          take: 10,
        },
      },
    });
  }

  const now = new Date();

  // Check if actively locked out
  const isCurrentlyLocked =
    relationship.current_mood === Mood.ANGRY &&
    relationship.cooldown_until !== null &&
    new Date(relationship.cooldown_until) > now;

  // Build persona context for evaluation & generator
  const personaContext: PersonaContext = {
    name: persona.name,
    temperament: persona.temperament,
    base_triggers: persona.base_triggers,
    current_mood: relationship.current_mood,
    tier: relationship.tier,
    friendship_score: relationship.friendship_score,
    offense_tier: relationship.offense_tier,
    cooldown_until: relationship.cooldown_until,
    boundaries: relationship.boundaries.map((b) => ({
      topic: b.topic,
      flag_color: b.flag_color,
      notes: b.notes,
    })),
  };

  const history: ChatHistoryMessage[] = (relationship.messages || [])
    .slice()
    .reverse()
    .map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    }));

  // Step 1: Sentiment & Boundary Middleware Evaluation
  const evaluation = await evaluateMessageWithGemini(trimmedMessage, personaContext);

  let nextMood: Mood = relationship.current_mood;
  let nextCooldownUntil: Date | null = relationship.cooldown_until;
  let nextOffenseTier: number = relationship.offense_tier;
  let nextFriendshipScore: number = relationship.friendship_score;
  let aiReply = "";
  let finalIsLocked = isCurrentlyLocked;

  // Step 2: State Machine Logic
  if (isCurrentlyLocked) {
    // Branch A: Active lockout
    if (evaluation.is_apology && evaluation.apology_sincerity >= 75) {
      // Sincere apology accepted
      if (relationship.offense_tier === 3) {
        // Tier 3: Cut remaining cooldown in half & reset mood to NEUTRAL
        const remaining = new Date(relationship.cooldown_until!).getTime() - now.getTime();
        const halvedRemaining = Math.max(0, Math.floor(remaining / 2));
        nextCooldownUntil = new Date(now.getTime() + halvedRemaining);
        nextMood = Mood.NEUTRAL;
        finalIsLocked = false;
      } else {
        // Tier 1 / 2: Unlock immediately
        nextCooldownUntil = null;
        nextMood = Mood.NEUTRAL;
        nextOffenseTier = 0;
        finalIsLocked = false;
      }

      nextFriendshipScore = Math.max(0, Math.min(100, relationship.friendship_score + evaluation.friendship_delta));
      personaContext.current_mood = nextMood;
      personaContext.friendship_score = nextFriendshipScore;
      personaContext.tier = calculateTier(nextFriendshipScore);

      aiReply = await generatePersonaResponse({
        message: trimmedMessage,
        history,
        context: personaContext,
        evaluation,
        isLockedOut: false,
      });
    } else {
      // Reject apology or reject normal message
      const isInsincere = evaluation.is_apology && evaluation.apology_sincerity < 75;
      if (isInsincere) {
        nextFriendshipScore = Math.max(0, Math.min(100, relationship.friendship_score + evaluation.friendship_delta));
      }

      finalIsLocked = true;
      aiReply = await generatePersonaResponse({
        message: trimmedMessage,
        history,
        context: personaContext,
        evaluation,
        isLockedOut: true,
        rejectionReason: isInsincere ? "INSINCERE_APOLOGY" : "LOCKED_OUT_NORMAL_CHAT",
      });
    }
  } else {
    // Branch B: Not locked out
    // If cooldown has expired from a previous incident, clear it
    if (
      relationship.current_mood === Mood.ANGRY &&
      relationship.cooldown_until !== null &&
      new Date(relationship.cooldown_until) <= now
    ) {
      nextMood = Mood.NEUTRAL;
      nextCooldownUntil = null;
      nextOffenseTier = 0;
    }

    if (evaluation.offense_tier > 0) {
      // Trigger Anger & Cooldown
      nextMood = Mood.ANGRY;
      nextOffenseTier = evaluation.offense_tier;
      const cooldownMs = getCooldownDurationMs(evaluation.offense_tier);
      nextCooldownUntil = new Date(now.getTime() + cooldownMs);
      finalIsLocked = true;
    } else {
      // Normal friendly or neutral message
      nextMood = Mood.NEUTRAL;
    }

    // Update friendship score & recalculate tier
    nextFriendshipScore = Math.max(0, Math.min(100, relationship.friendship_score + evaluation.friendship_delta));
    const nextTier = calculateTier(nextFriendshipScore);

    personaContext.current_mood = nextMood;
    personaContext.offense_tier = nextOffenseTier;
    personaContext.friendship_score = nextFriendshipScore;
    personaContext.tier = nextTier;

    aiReply = await generatePersonaResponse({
      message: trimmedMessage,
      history,
      context: personaContext,
      evaluation,
      isLockedOut: false,
    });
  }

  const nextTier = calculateTier(nextFriendshipScore);

  // 4. Save both messages to SQLite
  await prisma.message.create({
    data: {
      relationshipStateId: relationship.id,
      userId: user.id,
      personaId: persona.id,
      role: "user",
      content: trimmedMessage,
      sentiment_score: evaluation.sentiment_score,
      timestamp: now,
    },
  });

  await prisma.message.create({
    data: {
      relationshipStateId: relationship.id,
      userId: user.id,
      personaId: persona.id,
      role: "assistant",
      content: aiReply,
      sentiment_score: evaluation.is_apology ? 0.8 : evaluation.offense_tier > 0 ? -0.7 : 0.6,
      timestamp: new Date(now.getTime() + 100),
    },
  });

  // 5. Update RelationshipState in SQLite
  const updatedRelationship = await prisma.relationshipState.update({
    where: { id: relationship.id },
    data: {
      friendship_score: nextFriendshipScore,
      tier: nextTier,
      current_mood: nextMood,
      cooldown_until: nextCooldownUntil,
      offense_tier: nextOffenseTier,
    },
  });

  return {
    reply: aiReply,
    relationship: {
      id: updatedRelationship.id,
      userId: updatedRelationship.userId,
      personaId: updatedRelationship.personaId,
      friendship_score: updatedRelationship.friendship_score,
      tier: updatedRelationship.tier,
      current_mood: updatedRelationship.current_mood,
      cooldown_until: updatedRelationship.cooldown_until,
      offense_tier: updatedRelationship.offense_tier,
    },
    evaluation,
    is_locked: finalIsLocked,
  };
}
