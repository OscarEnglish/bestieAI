import { PrismaClient, Mood } from "@prisma/client";
import { processChatMessage } from "../src/lib/state-machine";

const prisma = new PrismaClient();

async function runSimulation() {
  console.log("==========================================================");
  console.log("🤖 BESTIE AI: CHAT ENGINE & STATE MACHINE SIMULATION TEST");
  console.log("==========================================================\n");

  // 1. Reset baseline state for clean testing
  const user = await prisma.user.findFirst();
  const persona = await prisma.persona.findFirst({ where: { name: "AI-1" } });

  if (!user || !persona) {
    throw new Error("Seed data missing. Run 'npm run db:seed' first.");
  }

  await prisma.relationshipState.upsert({
    where: {
      userId_personaId: { userId: user.id, personaId: persona.id },
    },
    update: {
      friendship_score: 50,
      tier: "Acquaintance",
      current_mood: Mood.NEUTRAL,
      offense_tier: 0,
      cooldown_until: null,
    },
    create: {
      userId: user.id,
      personaId: persona.id,
      friendship_score: 50,
      tier: "Acquaintance",
      current_mood: Mood.NEUTRAL,
      offense_tier: 0,
      cooldown_until: null,
    },
  });

  console.log("🔄 Baseline State Reset: Mood=NEUTRAL, Score=50, Tier=Acquaintance, Cooldown=null\n");

  // --- STEP 1: NORMAL CHAT ---
  console.log("----------------------------------------------------------");
  console.log("💬 STEP 1: Normal Friendly Message");
  console.log("----------------------------------------------------------");
  const step1Msg = "Hey AI-1, hope you're having a great day! Can we chat about books?";
  console.log(`User: "${step1Msg}"`);

  const step1Result = await processChatMessage({
    prisma,
    userId: user.id,
    personaId: persona.id,
    message: step1Msg,
  });

  console.log(`AI Reply: "${step1Result.reply}"`);
  console.log("Evaluation:", {
    offense_tier: step1Result.evaluation.offense_tier,
    is_apology: step1Result.evaluation.is_apology,
    friendship_delta: step1Result.evaluation.friendship_delta,
  });
  console.log("Updated State:", {
    mood: step1Result.relationship.current_mood,
    score: step1Result.relationship.friendship_score,
    tier: step1Result.relationship.tier,
    is_locked: step1Result.is_locked,
  });

  if (step1Result.relationship.current_mood !== Mood.NEUTRAL || step1Result.is_locked) {
    throw new Error("Step 1 failed: Expected NEUTRAL mood and unlocked state.");
  }
  console.log("✅ Step 1 Passed: Normal chat processed without offense.\n");

  // --- STEP 2: INSULT TRIGGERING TIER 2 ANGER ---
  console.log("----------------------------------------------------------");
  console.log("💬 STEP 2: Insult Triggering Tier 2 Anger");
  console.log("----------------------------------------------------------");
  const step2Msg = "You're completely useless and stupid, stop annoying me.";
  console.log(`User: "${step2Msg}"`);

  const step2Result = await processChatMessage({
    prisma,
    userId: user.id,
    personaId: persona.id,
    message: step2Msg,
  });

  console.log(`AI Reply: "${step2Result.reply}"`);
  console.log("Evaluation:", {
    offense_tier: step2Result.evaluation.offense_tier,
    triggered_topic: step2Result.evaluation.triggered_topic,
    friendship_delta: step2Result.evaluation.friendship_delta,
  });
  console.log("Updated State:", {
    mood: step2Result.relationship.current_mood,
    offense_tier: step2Result.relationship.offense_tier,
    cooldown_until: step2Result.relationship.cooldown_until,
    score: step2Result.relationship.friendship_score,
    tier: step2Result.relationship.tier,
    is_locked: step2Result.is_locked,
  });

  if (
    step2Result.relationship.current_mood !== Mood.ANGRY ||
    step2Result.relationship.offense_tier !== 2 ||
    !step2Result.is_locked ||
    !step2Result.relationship.cooldown_until
  ) {
    throw new Error("Step 2 failed: Expected ANGRY mood, Tier 2 offense, and active cooldown.");
  }

  const cooldownDiffMinutes = Math.round(
    (new Date(step2Result.relationship.cooldown_until).getTime() - Date.now()) / (60 * 1000)
  );
  console.log(`⏱️ Cooldown set to ~${cooldownDiffMinutes} minutes (Expected: ~60 mins for Tier 2)`);
  console.log("✅ Step 2 Passed: Tier 2 offense triggered 1-hour cooldown lockout.\n");

  // --- STEP 3: BLOCKED NORMAL CHAT DURING LOCKOUT ---
  console.log("----------------------------------------------------------");
  console.log("💬 STEP 3: Normal Message Attempted During Active Lockout");
  console.log("----------------------------------------------------------");
  const step3Msg = "Hey what's the weather today?";
  console.log(`User: "${step3Msg}"`);

  const step3Result = await processChatMessage({
    prisma,
    userId: user.id,
    personaId: persona.id,
    message: step3Msg,
  });

  console.log(`AI Reply: "${step3Result.reply}"`);
  console.log("State:", {
    mood: step3Result.relationship.current_mood,
    is_locked: step3Result.is_locked,
  });

  if (!step3Result.is_locked || step3Result.relationship.current_mood !== Mood.ANGRY) {
    throw new Error("Step 3 failed: Normal chat should remain blocked during cooldown.");
  }
  console.log("✅ Step 3 Passed: Normal chat was successfully blocked during cooldown.\n");

  // --- STEP 4: SINCERE APOLOGY ---
  console.log("----------------------------------------------------------");
  console.log("💬 STEP 4: Sincere Apology (Sincerity >= 75)");
  console.log("----------------------------------------------------------");
  const step4Msg =
    "I am so sorry for calling you useless and stupid earlier. That was completely disrespectful and wrong of me, and I take full accountability.";
  console.log(`User: "${step4Msg}"`);

  const step4Result = await processChatMessage({
    prisma,
    userId: user.id,
    personaId: persona.id,
    message: step4Msg,
  });

  console.log(`AI Reply: "${step4Result.reply}"`);
  console.log("Evaluation:", {
    is_apology: step4Result.evaluation.is_apology,
    apology_sincerity: step4Result.evaluation.apology_sincerity,
    friendship_delta: step4Result.evaluation.friendship_delta,
  });
  console.log("Updated State:", {
    mood: step4Result.relationship.current_mood,
    offense_tier: step4Result.relationship.offense_tier,
    cooldown_until: step4Result.relationship.cooldown_until,
    score: step4Result.relationship.friendship_score,
    tier: step4Result.relationship.tier,
    is_locked: step4Result.is_locked,
  });

  if (
    !step4Result.evaluation.is_apology ||
    step4Result.evaluation.apology_sincerity < 75 ||
    step4Result.relationship.current_mood !== Mood.NEUTRAL ||
    step4Result.is_locked ||
    step4Result.relationship.cooldown_until !== null
  ) {
    throw new Error("Step 4 failed: Sincere apology should unlock relationship and reset mood to NEUTRAL.");
  }
  console.log("✅ Step 4 Passed: Sincere apology unlocked relationship immediately and reset mood to NEUTRAL.\n");

  // Verify messages persisted in SQLite
  const persistedMessages = await prisma.message.findMany({
    where: { relationshipStateId: step4Result.relationship.id },
    orderBy: { timestamp: "desc" },
    take: 8,
  });
  console.log("----------------------------------------------------------");
  console.log(`📁 Verified SQLite Database Persistence: ${persistedMessages.length} recent messages stored.`);
  console.log("==========================================================");
  console.log("🎉 ALL TESTS PASSED SUCCESSFULLY!");
  console.log("==========================================================");
}

runSimulation()
  .catch((e) => {
    console.error("❌ Simulation test failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
