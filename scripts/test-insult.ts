import { evaluateMessageWithGemini, PersonaContext } from "../src/lib/gemini";

const fakeContext: PersonaContext = {
  name: "AI-1",
  temperament: "Empathetic, reflective, attentive to emotional cues, and maintains healthy boundaries.",
  base_triggers: "[]",
  current_mood: "NEUTRAL",
  tier: "Casual Friend",
  friendship_score: 50,
  offense_tier: 0,
  cooldown_until: null,
  boundaries: [
    { topic: "Verbal Disrespect", flag_color: "RED" }
  ],
};

async function test() {
  const msg1 = "who ask this one all this nonsense... are you mad this fool";
  const eval1 = await evaluateMessageWithGemini(msg1, fakeContext);
  console.log("MSG 1:", msg1);
  console.log("EVAL 1:", eval1);

  const msg2 = "get lost fool";
  const eval2 = await evaluateMessageWithGemini(msg2, fakeContext);
  console.log("MSG 2:", msg2);
  console.log("EVAL 2:", eval2);
}

test();
