import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== Bestie AI Database Verification ===");
  const users = await prisma.user.findMany();
  console.log(`Users count: ${users.length}`);
  console.log("User details:", users);

  const personas = await prisma.persona.findMany();
  console.log(`Personas count: ${personas.length}`);
  console.log("Persona details:", personas);

  const relationships = await prisma.relationshipState.findMany({
    include: {
      user: true,
      persona: true,
      boundaries: true,
      messages: true,
    },
  });
  console.log(`Relationships count: ${relationships.length}`);
  console.log("Relationship state:", JSON.stringify(relationships, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
