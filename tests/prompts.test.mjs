import assert from "node:assert/strict";
import { test } from "node:test";

import { buildLessonPrompt, buildProbePrompt } from "../assets/prompts.js";

const input = {
	topic: "Dérivée de x²",
	goal: "Comprendre la limite",
	level: "lycée",
	known: "Je sais calculer une pente.",
};

test("le prompt de sondage contient le sujet et interdit l'enseignement", () => {
	const prompt = buildProbePrompt(input);
	assert.match(prompt, /Le sondage n'enseigne rien/);
	assert.match(prompt, /Dérivée de x²/);
	assert.match(prompt, /Je sais calculer une pente/);
	assert.match(prompt, /uniquement avec l'objet JSON/);
});

test("le prompt de leçon transmet les réponses du sondage", () => {
	const prompt = buildLessonPrompt(input, {
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
	assert.match(prompt, /Que vaut la pente/);
	assert.match(prompt, /confiance : 40%/);
	assert.match(prompt, /UN pas de raisonnement/);
	assert.match(prompt, /"steps"/);
});

test("le prompt de leçon fonctionne sans sondage", () => {
	const prompt = buildLessonPrompt(input, null);
	assert.match(prompt, /Aucun sondage/);
});

test("aucun prompt ne contient de clé ou d'URL d'API", () => {
	for (const prompt of [buildProbePrompt(input), buildLessonPrompt(input, null)]) {
		assert.equal(prompt.includes("Authorization"), false);
		assert.equal(prompt.includes("Bearer"), false);
		assert.equal(prompt.includes("openrouter"), false);
	}
});
