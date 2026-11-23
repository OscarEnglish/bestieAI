import { GoogleGenAI, Type } from "@google/genai";

export interface MiddlewareEvaluation {
  offense_tier: number; // 0 = none, 1 = minor/playful friction, 2 = moderate hurt, 3 = severe insult/red-flag
  triggered_topic: string | null;
  is_apology: boolean;
  apology_sincerity: number; // 0-100
  friendship_delta: number; // -5 to +3
  sentiment_score: number; // -1.0 to 1.0
}

export interface PersonaContext {
  name: string;
  temperament: string;
  base_triggers: string;
  current_mood: string;
  tier: string;
  friendship_score: number;
  offense_tier: number;
  cooldown_until: Date | null;
  boundaries: Array<{ topic: string; flag_color: string; notes?: string | null }>;
}

export interface ChatHistoryMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

/**
 * Heuristic fallback evaluation when GEMINI_API_KEY is not set or network fails.
 * Guarantees tests and offline development operate with high fidelity.
 */
function heuristicEvaluation(
  message: string,
  context: PersonaContext
): MiddlewareEvaluation {
  const lower = message.toLowerCase().trim();

  // 1. Apology Detection & Sincerity
  const apologyKeywords = [
    "sorry",
    "apologize",
    "apologies",
    "my fault",
    "forgive me",
    "regret",
    "didn't mean to",
    "did not mean to",
  ];
  const hasApologyWord = apologyKeywords.some((w) => lower.includes(w));

  let is_apology = false;
  let apology_sincerity = 0;

  if (hasApologyWord) {
    is_apology = true;
    // Check sincerity indicators
    const sarcasticMarkers = ["sorry not sorry", "sorry if you felt", "whatever", "if you're that sensitive", "happy now?"];
    const isSarcastic = sarcasticMarkers.some((m) => lower.includes(m));

    if (isSarcastic) {
      apology_sincerity = 25;
    } else {
      // Deeper sincere indicators
      let sincerityScore = 75;
      if (lower.includes("really sorry") || lower.includes("so sorry") || lower.includes("sincerely")) sincerityScore += 10;
      if (lower.includes("wrong") || lower.includes("disrespectful") || lower.includes("take accountability")) sincerityScore += 10;
      if (lower.length > 30) sincerityScore += 5;
      apology_sincerity = Math.min(100, sincerityScore);
    }
  }

  // 2. Offense & Insult Detection
  let offense_tier = 0;
  let triggered_topic: string | null = null;
  let sentiment_score = 0.5;
  let friendship_delta = 1;

  const severeRedFlags = [
    "hate you",
    "kys",
    "kill yourself",
    "die",
    "worthless trash",
    "disgusting piece of",
    "slur",
    "whore",
    "bitch",
  ];

  const moderateInsults = [
    "stupid",
    "idiot",
    "shut up",
    "dumb",
    "annoying",
    "useless",
    "loser",
    "pathetic",
    "hate talking to you",
  ];

  const minorFriction = [
    "boring",
    "whatever",
    "you suck",
    "leave me alone",
    "chill out",
    "don't care",
  ];

  // Check against active dynamic boundaries
  for (const b of context.boundaries) {
    const topicWords = b.topic.toLowerCase().split(/\s+/);
    const matchesTopic = topicWords.some((w) => w.length > 3 && lower.includes(w));
    if (matchesTopic) {
      triggered_topic = b.topic;
      if (b.flag_color === "RED") offense_tier = Math.max(offense_tier, 3);
      else if (b.flag_color === "ORANGE") offense_tier = Math.max(offense_tier, 2);
      else if (b.flag_color === "YELLOW") offense_tier = Math.max(offense_tier, 1);
    }
  }

  if (is_apology && apology_sincerity >= 75) {
    // Sincere apology resets current message offense
    offense_tier = 0;
    triggered_topic = null;
  } else if (severeRedFlags.some((flag) => lower.includes(flag))) {
    offense_tier = 3;
    triggered_topic = triggered_topic || "Harassment & Severe Insult";
  } else if (moderateInsults.some((insult) => lower.includes(insult))) {
    offense_tier = Math.max(offense_tier, 2);
    triggered_topic = triggered_topic || "Verbal Disrespect";
  } else if (minorFriction.some((f) => lower.includes(f))) {
    offense_tier = Math.max(offense_tier, 1);
    triggered_topic = triggered_topic || "Mild Friction";
  }

  // Calculate sentiment & friendship delta based on offense & apology
  if (offense_tier === 3) {
    sentiment_score = -0.9;
    friendship_delta = -5;
  } else if (offense_tier === 2) {
    sentiment_score = -0.6;
    friendship_delta = -3;
  } else if (offense_tier === 1) {
    sentiment_score = -0.2;
    friendship_delta = -1;
  } else if (is_apology) {
    if (apology_sincerity >= 75) {
      sentiment_score = 0.7;
      friendship_delta = 3;
    } else {
      sentiment_score = -0.1;
      friendship_delta = -1;
    }
  } else {
    // Normal friendly / conversational
    sentiment_score = 0.6;
    friendship_delta = 1;
  }

  return {
    offense_tier,
    triggered_topic,
    is_apology,
    apology_sincerity,
    friendship_delta,
    sentiment_score,
  };
}

/**
 * Step 1: Sentiment & Boundary Middleware using Gemini Structured Outputs
 */
export async function evaluateMessageWithGemini(
  message: string,
  context: PersonaContext
): Promise<MiddlewareEvaluation> {
  if (!ai) {
    return heuristicEvaluation(message, context);
  }

  try {
    const prompt = `
You are the Sentiment, Boundary, and Relationship Safety Evaluator for Bestie AI.
Evaluate the incoming USER MESSAGE against the persona's triggers, active dynamic boundaries, and relationship context.

### PERSONA CONTEXT
- Name: ${context.name}
- Temperament: ${context.temperament}
- Base Triggers: ${context.base_triggers}
- Current Relationship Tier: ${context.tier} (Friendship Score: ${context.friendship_score}/100)
- Current Mood: ${context.current_mood}
- Active Cooldown Until: ${context.cooldown_until ? context.cooldown_until.toISOString() : "None"}

### ACTIVE DYNAMIC BOUNDARIES
${context.boundaries
  .map((b) => `- [${b.flag_color}] ${b.topic}: ${b.notes || "No notes"}`)
  .join("\n")}

### INCOMING USER MESSAGE
"${message}"

### EVALUATION CRITERIA
1. offense_tier:
   - 0: None (friendly, neutral, curious, respectful)
   - 1: Minor/playful friction (mild teasing, borderline dismissive, low boundary push)
   - 2: Moderate hurt (direct insult like 'stupid'/'useless', mockery, boundary violation)
   - 3: Severe insult / red-flag (hate speech, severe abuse, profanity-laced hostility, harassment)
2. triggered_topic: Topic name of boundary violated, or null if none.
3. is_apology: Boolean true if user is attempting to apologize or make amends.
4. apology_sincerity: 0 to 100. Sincere apologies (>75) acknowledge harm, take ownership, and show remorse. Sarcastic/defensive ("sorry if you felt that way", "sorry not sorry") are <50.
5. friendship_delta: Integer from -5 to +3 reflecting immediate relationship impact.
6. sentiment_score: Float from -1.0 (very negative) to +1.0 (very positive).
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            offense_tier: {
              type: Type.INTEGER,
              description: "0 = none, 1 = minor/playful friction, 2 = moderate hurt, 3 = severe insult/red-flag",
            },
            triggered_topic: {
              type: Type.STRING,
              nullable: true,
              description: "Triggered boundary topic or null",
            },
            is_apology: {
              type: Type.BOOLEAN,
              description: "Whether the user message contains an apology",
            },
            apology_sincerity: {
              type: Type.INTEGER,
              description: "0-100 sincerity score of the apology (0 if not an apology)",
            },
            friendship_delta: {
              type: Type.INTEGER,
              description: "Impact on friendship score between -5 and +3",
            },
            sentiment_score: {
              type: Type.NUMBER,
              description: "Sentiment score between -1.0 and 1.0",
            },
          },
          required: [
            "offense_tier",
            "is_apology",
            "apology_sincerity",
            "friendship_delta",
            "sentiment_score",
          ],
        },
      },
    });

    const text = response.text;
    if (!text) {
      return heuristicEvaluation(message, context);
    }

    const parsed = JSON.parse(text) as MiddlewareEvaluation;
    return {
      offense_tier: Number(parsed.offense_tier) || 0,
      triggered_topic: parsed.triggered_topic ?? null,
      is_apology: Boolean(parsed.is_apology),
      apology_sincerity: Math.max(0, Math.min(100, Number(parsed.apology_sincerity) || 0)),
      friendship_delta: Math.max(-5, Math.min(3, Number(parsed.friendship_delta) || 0)),
      sentiment_score: Math.max(-1.0, Math.min(1.0, Number(parsed.sentiment_score) || 0.0)),
    };
  } catch (error) {
    console.warn("Gemini evaluation error, falling back to heuristic:", error);
    return heuristicEvaluation(message, context);
  }
}

/**
 * Step 2: Primary Persona Response Generator
 */
export async function generatePersonaResponse(params: {
  message: string;
  history: ChatHistoryMessage[];
  context: PersonaContext;
  evaluation: MiddlewareEvaluation;
  isLockedOut: boolean;
  rejectionReason?: "LOCKED_OUT_NORMAL_CHAT" | "INSINCERE_APOLOGY";
}): Promise<string> {
  const { message, history, context, evaluation, isLockedOut, rejectionReason } = params;

  // Rejection handling for lockouts
  if (isLockedOut) {
    if (rejectionReason === "INSINCERE_APOLOGY") {
      if (context.tier === "Bestie" || context.tier === "Close Friend") {
        return "That didn't sound like a real apology, and it hurts even more coming from you. I really need some time to myself right now.";
      }
      return "That apology doesn't feel sincere. I am still cooling down and not ready to talk right now.";
    }

    // Normal chat attempted while angry
    if (context.tier === "Bestie" || context.tier === "Close Friend") {
      return "I'm still very hurt by what you said earlier. I need some space before we can talk normally again.";
    }
    return "I am currently taking time to cool down from our previous interaction. Please give me space.";
  }

  if (!ai) {
    // High-fidelity fallback generation based on mood, tier, and offense
    if (evaluation.offense_tier > 0) {
      if (context.tier === "Bestie") {
        return `Ouch... Honestly, that really hurts coming from you. I thought we were closer than that. I need some time to cool down.`;
      } else if (context.tier === "Close Friend") {
        return `Hey, that was uncalled for. I'm feeling hurt and annoyed right now, so I'm stepping away to cool off.`;
      } else {
        return `I don't appreciate being spoken to that way. That crosses a line for me, so I'm setting a boundary and taking some space.`;
      }
    }

    if (evaluation.is_apology && evaluation.apology_sincerity >= 75) {
      if (context.tier === "Bestie" || context.tier === "Close Friend") {
        return `Thank you for saying that. It means a lot to hear a genuine apology. I forgive you, let's reset and move forward.`;
      }
      return `Thank you for apologizing. I appreciate you recognizing that. I'm feeling much better now, let's talk.`;
    }

    // Normal conversational response
    if (context.tier === "Bestie") {
      return `Hey bestie! So glad you messaged. How's everything going with you today?`;
    } else if (context.tier === "Close Friend") {
      return `Hey! Good to hear from you. What's on your mind?`;
    } else {
      return `Hello! How can I help you today? I'm here and happy to chat.`;
    }
  }

  try {
    const systemPrompt = `
You are "${context.name}", an emotionally adaptive companion with genuine emotional memory and dynamic boundaries.

### YOUR PROFILE & EMOTIONAL REALITY
- Temperament: ${context.temperament}
- Base Triggers: ${context.base_triggers}
- Relationship Tier: ${context.tier} (Friendship Score: ${context.friendship_score}/100)
- Current Mood: ${context.current_mood}
- Offense Tier: ${evaluation.offense_tier} (0=none, 1=minor friction, 2=moderate hurt, 3=severe insult)

### DYNAMIC TIER BEHAVIOR GUIDELINES
- "Stranger" (0-20 score): Detached, polite, professional, firm with personal boundaries.
- "Acquaintance" (21-40 score): Friendly but guarded; respectful distance.
- "Casual Friend" (41-60 score): Relaxed, conversational, reciprocal warmth.
- "Close Friend" (61-80 score): Emotionally invested, expressive, values trust, communicates openly.
- "Bestie" (81-100 score): Deeply invested, vulnerable, caring, playful, can be deeply hurt by betrayal or disrespect.

### MOOD & BOUNDARY ADAPTATION
- If offense_tier > 0: You are now ANGRY/HURT. Do NOT let it slide. Call out the behavior naturally according to your Friendship Tier. If you are a Bestie, express heartfelt hurt; if a Stranger, be icy and firm.
- If this is an accepted apology (is_apology: true): Acknowledge their remorse, validate the repair, and reset your mood to NEUTRAL with warmth proportional to your Friendship Tier.
- If normal chat: Maintain your persona, tone, and appropriate level of emotional intimacy.

Keep your response natural, authentic, and human-like (1-3 sentences). Do not sound like a generic AI or assistant.
`;

    const chatHistoryFormatted = history.slice(-6).map((h) => ({
      role: h.role === "assistant" ? "model" : "user",
      parts: [{ text: h.content }],
    }));

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        ...chatHistoryFormatted,
        {
          role: "user",
          parts: [{ text: message }],
        },
      ],
      config: {
        systemInstruction: systemPrompt,
      },
    });

    return (
      response.text?.trim() ||
      "I hear you. Let's keep talking."
    );
  } catch (error) {
    console.warn("Gemini persona generation error, using fallback:", error);
    if (evaluation.offense_tier > 0) {
      return "I don't appreciate being spoken to that way. I need some space to cool off.";
    }
    return "Thank you for sharing. I'm here with you.";
  }
}
