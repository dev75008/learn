import assert from "node:assert/strict";
import { test } from "node:test";

import { buildLessonMessages, buildProbeMessages } from "../assets/prompts.js";

const input = {
	topic: "Dérivée de x²",
	goal: "Comprendre la limite",
	level: "lycée",
	known: "Je sais calculer une pente.",
};

test("le prompt de sondage contient le sujet et interdit l'enseignement", () => {
	const messages = buildProbeMessages(input);
	assert.equal(messages.length, 2);
	assert.match(messages[0].content, /Le sondage n'enseigne rien/);
	assert.match(messages[1].content, /Dérivée de x²/);
	assert.match(messages[1].content, /Je sais calculer une pente/);
});

test("le prompt de leçon transmet les réponses du sondage", () => {
	const messages = buildLessonMessages(input, {
		goal: "Comprendre la limite",
		questions: [
			{
				prompt: "Que vaut la pente ?",
				strand: "pente",
				answer: "2",
				confidence: 40,
				thinking: "Je ne suis pas sûr.",
				dontKnow: false,
			},
		],
	});
	const prompt = messages.map((message) => message.content).join("\n");
	assert.match(prompt, /Que vaut la pente/);
	assert.match(prompt, /confiance : 40%/);
	assert.match(prompt, /UN pas de raisonnement/);
	assert.match(prompt, /"steps"/);
});

test("le prompt de leçon fonctionne sans sondage", () => {
	const messages = buildLessonMessages(input, null);
	assert.match(messages[1].content, /Aucun sondage/);
});
