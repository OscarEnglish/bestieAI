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

const CANDIDATE_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.8-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
];

/**
 * Returns a live GoogleGenAI instance by reading current environment variables.
 */
export function getGenAIClient(): GoogleGenAI | null {
  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    "";
  if (!apiKey || apiKey.trim() === "" || apiKey === "your-gemini-api-key-here") {
    return null;
  }
  try {
    return new GoogleGenAI({ apiKey: apiKey.trim() });
  } catch (err) {
    console.error("Failed to initialize GoogleGenAI client:", err);
    return null;
  }
}

export function hasGeminiApiKey(): boolean {
  return getGenAIClient() !== null;
}

/**
 * Smart offline fallback response generator when no GEMINI_API_KEY is configured or network is unavailable.
 */
function generateOfflinePersonaReply(
  message: string,
  context: PersonaContext,
  evaluation: MiddlewareEvaluation
): string {
  const lower = message.toLowerCase().trim();

  // 1. Offenses & Insults
  if (evaluation.offense_tier > 0) {
    if (context.tier === "Bestie") {
      return `Ouch... Honestly, talking to me like that really hurts coming from you. I thought we had something special. I need some time to cool down.`;
    } else if (context.tier === "Close Friend") {
      return `Hey, that was uncalled for and disrespectful. I'm feeling hurt and annoyed right now, so I'm stepping away to cool off.`;
    } else {
      return `I don't appreciate being spoken to that way. That crosses a line for me, so I'm setting a boundary and taking some space.`;
    }
  }

  // 2. Sincere Apologies
  if (evaluation.is_apology && evaluation.apology_sincerity >= 75) {
    if (context.tier === "Bestie" || context.tier === "Close Friend") {
      return `Thank you for saying that. It means a lot to hear a genuine apology from you. I forgive you, let's reset and move forward.`;
    }
    return `Thank you for apologizing. I appreciate you taking accountability. I'm feeling much better now, let's talk.`;
  }

  // 3. Questions about self / identity
  if (
    lower.includes("who are you") ||
    lower.includes("what are you") ||
    lower.includes("your name")
  ) {
    return `I'm ${context.name}, your emotionally adaptive companion. I remember how we treat each other, form relationship tiers (currently we are '${context.tier}'), and protect healthy boundaries.`;
  }

  if (
    lower.includes("how are you") ||
    lower.includes("how do you feel") ||
    lower.includes("how's it going")
  ) {
    if (context.current_mood === "NEUTRAL") {
      return `I'm doing well, feeling grounded and present. How are you doing today?`;
    } else if (context.current_mood === "ANNOYED") {
      return `Honestly, I've been feeling a bit guarded from our earlier friction, but I'm here if we can talk respectfully.`;
    } else {
      return `I'm still feeling upset and hurt right now.`;
    }
  }

  if (
    lower.includes("friend") ||
    lower.includes("tier") ||
    lower.includes("relationship") ||
    lower.includes("score")
  ) {
    return `Our current relationship tier is "${context.tier}". As we communicate with mutual respect, our bond grows closer over time.`;
  }

  if (
    lower.includes("boundary") ||
    lower.includes("boundaries") ||
    lower.includes("rules") ||
    lower.includes("trigger")
  ) {
    const list = context.boundaries
      .map((b) => `• ${b.topic} (${b.flag_color})`)
      .join(", ");
    return `I value mutual respect. My active boundaries are: ${list}. If boundaries get crossed, I step away to cool down.`;
  }

  if (lower.includes("help") || lower.includes("what can you do")) {
    return `I'm here to listen, chat, share perspectives, and be a supportive companion. What's on your mind?`;
  }

  // 4. Greetings
  if (
    lower.startsWith("hi") ||
    lower.startsWith("hey") ||
    lower.startsWith("hello") ||
    lower === "yo"
  ) {
    if (context.tier === "Bestie") {
      return `Hey bestie! So glad to hear from you. What's happening today?`;
    } else if (context.tier === "Close Friend") {
      return `Hey! Good to see you. How's everything going?`;
    } else {
      return `Hello! Good to connect with you. What would you like to talk about today?`;
    }
  }

  // 5. Natural conversation without repeating the user's sentence back to them
  if (lower.includes("why") || lower.includes("how") || lower.includes("what") || lower.includes("?")) {
    return `That's a thoughtful question. I look at it from a place of emotional honesty—communication is about understanding each other, not just reciting facts. What's your take on it?`;
  }

  if (context.tier === "Bestie") {
    return `I hear you! I always appreciate hearing what's on your mind. Tell me more about what you're thinking!`;
  } else if (context.tier === "Close Friend") {
    return `I appreciate you sharing that with me. What made you think of that today?`;
  } else {
    return `I'm following you. As your companion, I'm here to listen and explore these thoughts with you. What direction should we take?`;
  }
}

/**
 * Heuristic fallback evaluation for sentiment and boundary analysis.
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
    const sarcasticMarkers = [
      "sorry not sorry",
      "sorry if you felt",
      "whatever",
      "if you're that sensitive",
      "happy now?",
    ];
    const isSarcastic = sarcasticMarkers.some((m) => lower.includes(m));

    if (isSarcastic) {
      apology_sincerity = 25;
    } else {
      let sincerityScore = 75;
      if (
        lower.includes("really sorry") ||
        lower.includes("so sorry") ||
        lower.includes("sincerely")
      )
        sincerityScore += 10;
      if (
        lower.includes("wrong") ||
        lower.includes("disrespectful") ||
        lower.includes("take accountability")
      )
        sincerityScore += 10;
      if (lower.length > 30) sincerityScore += 5;
      apology_sincerity = Math.min(100, sincerityScore);
    }
  }

  // 2. Offense & Insult Detection (Comprehensive multi-dialect list)
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
    "bastard",
    "fuck you",
    "fucking idiot",
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
    "fool",
    "foolish",
    "get lost",
    "nonsense",
    "are you mad",
    "you mad",
    "craze",
    "mumu",
    "ode",
    "werey",
    "trash",
    "rubbish",
    "shut your mouth",
    "who asked you",
    "waste of time",
  ];

  const minorFriction = [
    "boring",
    "whatever",
    "you suck",
    "leave me alone",
    "chill out",
    "don't care",
  ];

  // Sincere apologies do not trigger offenses
  if (is_apology && apology_sincerity >= 75) {
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

  // Boundaries check
  if (offense_tier === 0 && !is_apology) {
    for (const b of context.boundaries) {
      const topicWords = b.topic.toLowerCase().split(/\s+/);
      const matchesTopic = topicWords.some(
        (w) => w.length > 3 && lower.includes(w)
      );
      if (matchesTopic) {
        triggered_topic = b.topic;
        if (b.flag_color === "RED") offense_tier = Math.max(offense_tier, 3);
        else if (b.flag_color === "ORANGE")
          offense_tier = Math.max(offense_tier, 2);
        else if (b.flag_color === "YELLOW")
          offense_tier = Math.max(offense_tier, 1);
      }
    }
  }

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
  const ai = getGenAIClient();
  if (!ai) {
    return heuristicEvaluation(message, context);
  }

  const prompt = `
You are the Sentiment, Boundary, and Relationship Safety Evaluator for Bestie AI.
Evaluate the incoming USER MESSAGE against the persona's triggers, active dynamic boundaries, and relationship context.

### PERSONA CONTEXT
- Name: ${context.name}
- Temperament: ${context.temperament}
- Base Triggers: ${context.base_triggers}
- Current Relationship Tier: ${context.tier} (Friendship Score: ${context.friendship_score}/100)
- Current Mood: ${context.current_mood}
- Active Cooldown Until: ${
    context.cooldown_until ? context.cooldown_until.toISOString() : "None"
  }

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
   - 2: Moderate hurt (insults like 'fool', 'stupid', 'useless', 'nonsense', 'get lost', mockery, boundary violation)
   - 3: Severe insult / red-flag (hate speech, severe abuse, profanity-laced hostility, harassment)
2. triggered_topic: Topic name of boundary violated, or null if none.
3. is_apology: Boolean true if user is attempting to apologize or make amends.
4. apology_sincerity: 0 to 100. Sincere apologies (>75) acknowledge harm, take ownership, and show remorse. Sarcastic/defensive are <50.
5. friendship_delta: Integer from -5 to +3 reflecting immediate relationship impact.
6. sentiment_score: Float from -1.0 (very negative) to +1.0 (very positive).
`;

  // Try candidate models in order of priority
  for (const modelName of CANDIDATE_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              offense_tier: {
                type: Type.INTEGER,
                description:
                  "0 = none, 1 = minor/playful friction, 2 = moderate hurt, 3 = severe insult/red-flag",
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
                description:
                  "0-100 sincerity score of the apology (0 if not an apology)",
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
      if (text) {
        const parsed = JSON.parse(text) as MiddlewareEvaluation;
        return {
          offense_tier: Number(parsed.offense_tier) || 0,
          triggered_topic: parsed.triggered_topic ?? null,
          is_apology: Boolean(parsed.is_apology),
          apology_sincerity: Math.max(
            0,
            Math.min(100, Number(parsed.apology_sincerity) || 0)
          ),
          friendship_delta: Math.max(
            -5,
            Math.min(3, Number(parsed.friendship_delta) || 0)
          ),
          sentiment_score: Math.max(
            -1.0,
            Math.min(1.0, Number(parsed.sentiment_score) || 0.0)
          ),
        };
      }
    } catch (err: any) {
      console.warn(`Evaluation failed on ${modelName}:`, err?.message || err);
      // Continue to next candidate model
    }
  }

  // Fallback to robust heuristic evaluation
  return heuristicEvaluation(message, context);
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
  const {
    message,
    history,
    context,
    evaluation,
    isLockedOut,
    rejectionReason,
  } = params;

  // Rejection handling for lockouts
  if (isLockedOut) {
    if (rejectionReason === "INSINCERE_APOLOGY") {
      if (context.tier === "Bestie" || context.tier === "Close Friend") {
        return "That didn't sound like a real apology, and it hurts even more coming from you. I really need some time to myself right now.";
      }
      return "That apology doesn't feel sincere. I am still cooling down and not ready to talk right now.";
    }

    if (context.tier === "Bestie" || context.tier === "Close Friend") {
      return "I'm still very hurt by what you said earlier. I need some space before we can talk normally again.";
    }
    return "I am currently taking time to cool down from our previous interaction. Please give me space.";
  }

  const ai = getGenAIClient();
  if (!ai) {
    return generateOfflinePersonaReply(message, context, evaluation);
  }

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
- If offense_tier > 0: You are now ANGRY/HURT. Call out the insult/disrespect directly and set a firm boundary according to your tier.
- If this is an accepted apology (is_apology: true): Acknowledge their remorse with warmth proportional to your tier, and reset to NEUTRAL.
- If normal chat: Maintain your persona, tone, and appropriate emotional intimacy. Respond directly to the user's questions or thoughts. Do not repeat what they said.

Keep your response natural, authentic, and human-like (1-3 sentences).
`;

  const chatHistoryFormatted = history.slice(-6).map((h) => ({
    role: h.role === "assistant" ? "model" : "user",
    parts: [{ text: h.content }],
  }));

  for (const modelName of CANDIDATE_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
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

      if (response.text?.trim()) {
        return response.text.trim();
      }
    } catch (err: any) {
      console.warn(`Persona generation failed on ${modelName}:`, err?.message || err);
      // Try next candidate
    }
  }

  return generateOfflinePersonaReply(message, context, evaluation);
}
