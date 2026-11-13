import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { exportPayload, importTopics } from "../assets/store.js";

const demo = JSON.parse(
	readFileSync(new URL("../data/topics/derivee-x-carre.json", import.meta.url), "utf8"),
);

test("l'export ne contient aucune clé", () => {
	const payload = exportPayload([{ ...demo, id: "t1" }]);
	assert.equal(payload.includes("apiKey"), false);
	assert.equal(payload.includes("Authorization"), false);
	const parsed = JSON.parse(payload);
	assert.equal(parsed.format, "learn-base/1");
	assert.equal(parsed.topics.length, 1);
});

test("un import valide est revalidé et reçoit un identifiant", () => {
	const { topics, errors } = importTopics(JSON.stringify({ topics: [{ ...demo, id: "imported" }] }));
	assert.deepEqual(errors, []);
	assert.equal(topics.length, 1);
	assert.equal(topics[0].id, "imported");
	assert.equal(topics[0].steps.length, 5);
});

test("un import invalide est refusé avec un message", () => {
	const broken = structuredClone(demo);
	broken.steps[0].repair = "";
	const { topics, errors } = importTopics(JSON.stringify([{ ...broken, id: "broken" }]));
	assert.equal(topics.length, 0);
	assert.equal(errors.length, 1);
	assert.match(errors[0], /réparation/i);
});

test("un fichier non JSON est refusé", () => {
	const { topics, errors } = importTopics("pas du json");
	assert.equal(topics.length, 0);
	assert.match(errors[0], /JSON valide/i);
});
