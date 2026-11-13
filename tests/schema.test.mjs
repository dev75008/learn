import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { planLayers, slugify, validateLesson, validateProbe } from "../assets/schema.js";

const demo = JSON.parse(
	readFileSync(new URL("../data/topics/derivee-x-carre.json", import.meta.url), "utf8"),
);

test("la leçon d'exemple est valide et son plan est acyclique", () => {
	const result = validateLesson(demo);
	assert.equal(result.ok, true, result.errors.join(" | "));
	assert.equal(result.lesson.steps.length, 5);
	assert.equal(result.lesson.graph.propositions.length, 5);
	const layers = planLayers(result.lesson.plan);
	assert.deepEqual(layers, [
		["pente-droite", "developpement"],
		["pente-instantanee"],
		["taux-variation"],
		["derivee-2x"],
	]);
});

test("un cycle de dépendances est refusé", () => {
	const broken = structuredClone(demo);
	broken.plan.edges.push({ from: "derivee-2x", to: "pente-droite" });
	const result = validateLesson(broken);
	assert.equal(result.ok, false);
	assert.match(result.errors.join(" "), /cycle/i);
});

test("une étape sans réparation est refusée", () => {
	const broken = structuredClone(demo);
	broken.steps[0].repair = "";
	const result = validateLesson(broken);
	assert.equal(result.ok, false);
	assert.match(result.errors.join(" "), /réparation/i);
});

test("une vérification sans bonne réponse est refusée", () => {
	const broken = structuredClone(demo);
	broken.steps[0].check.correctIndex = 9;
	const result = validateLesson(broken);
	assert.equal(result.ok, false);
	assert.match(result.errors.join(" "), /correctIndex/i);
});

test("correctAnswer textuel est converti en index", () => {
	const variant = structuredClone(demo);
	delete variant.steps[0].check.correctIndex;
	variant.steps[0].check.correctAnswer = "2";
	const result = validateLesson(variant);
	assert.equal(result.ok, true, result.errors.join(" | "));
	assert.equal(result.lesson.steps[0].check.correctIndex, 0);
});

test("les identifiants du plan sont normalisés en slugs", () => {
	const variant = structuredClone(demo);
	variant.plan.nodes[0].id = "Pente Droite";
	for (const edge of variant.plan.edges) {
		if (edge.from === "pente-droite") edge.from = "Pente Droite";
	}
	variant.steps[0].nodeId = "Pente Droite";
	const result = validateLesson(variant);
	assert.equal(result.ok, true, result.errors.join(" | "));
	assert.ok(result.lesson.plan.nodes.some((node) => node.id === "pente-droite"));
});

test("un sondage valide est normalisé", () => {
	const result = validateProbe({
		goal: "Comprendre les limites",
		strands: ["pente"],
		questions: [
			{ id: "q1", strand: "pente", prompt: "Pente de (0;0) à (2;4) ?", options: ["1", "2", "4"] },
		],
	});
	assert.equal(result.ok, true, result.errors.join(" | "));
	assert.equal(result.probe.questions[0].options.length, 3);
});

test("un sondage sans question est refusé", () => {
	const result = validateProbe({ goal: "x", strands: ["x"], questions: [] });
	assert.equal(result.ok, false);
	assert.match(result.errors.join(" "), /au moins une question/i);
});

test("slugify retire accents et ponctuation", () => {
	assert.equal(slugify("Dérivée de x², intuitivement !"), "derivee-de-x-intuitivement");
});
