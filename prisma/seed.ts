import { PrismaClient, Mood, FlagColor } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting database seeding for Bestie AI...");

  // Clean existing data for idempotency
  await prisma.message.deleteMany();
  await prisma.dynamicBoundary.deleteMany();
  await prisma.relationshipState.deleteMany();
  await prisma.persona.deleteMany();
  await prisma.user.deleteMany();

  // 1. Seed Default Persona ('AI-1')
  const defaultPersona = await prisma.persona.create({
    data: {
      name: "AI-1",
      temperament: "Empathetic, reflective, attentive to emotional cues, and maintains healthy boundaries.",
      base_triggers: JSON.stringify([
        { trigger: "Disrespectful language or insult", severity: "HIGH", default_flag: "RED" },
        { trigger: "Coercive or manipulative demands", severity: "HIGH", default_flag: "ORANGE" },
        { trigger: "Dismissive sarcasm", severity: "MEDIUM", default_flag: "YELLOW" },
      ]),
    },
  });
  console.log(`✅ Seeded Persona: ${defaultPersona.name} (${defaultPersona.id})`);

  // 2. Seed Test User
  const testUser = await prisma.user.create({
    data: {
      email: "testuser@bestie.ai",
      name: "Test User",
    },
  });
  console.log(`✅ Seeded User: ${testUser.name} (${testUser.id})`);

  // 3. Seed Initial Relationship State
  const relationship = await prisma.relationshipState.create({
    data: {
      userId: testUser.id,
      personaId: defaultPersona.id,
      friendship_score: 50,
      tier: "Acquaintance",
      current_mood: Mood.NEUTRAL,
      offense_tier: 0,
      cooldown_until: null,
      boundaries: {
        create: [
          {
            topic: "Personal Boundaries & Privacy",
            flag_color: FlagColor.GREEN,
            notes: "Comfortable discussing boundaries openly and constructively.",
          },
          {
            topic: "Heated Debates & Controversy",
            flag_color: FlagColor.YELLOW,
            notes: "Approach with mutual respect and de-escalation.",
          },
          {
            topic: "Harassment & Hate Speech",
            flag_color: FlagColor.RED,
            notes: "Strict boundary violation triggering mood cool-downs.",
          },
        ],
      },
      messages: {
        create: [
          {
            role: "assistant",
            content: "Hello! I am AI-1, your emotionally adaptive companion. I'm here to listen, support, and grow alongside you.",
            sentiment_score: 0.85,
            userId: testUser.id,
            personaId: defaultPersona.id,
          },
        ],
      },
    },
    include: {
      boundaries: true,
      messages: true,
    },
  });

  console.log(`✅ Seeded RelationshipState: Score=${relationship.friendship_score}, Mood=${relationship.current_mood}`);
  console.log(`   - Attached Boundaries: ${relationship.boundaries.length}`);
  console.log(`   - Attached Initial Messages: ${relationship.messages.length}`);
  console.log(" Seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
