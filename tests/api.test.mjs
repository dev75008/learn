import assert from "node:assert/strict";
import { test } from "node:test";

import { ApiError, extractJson } from "../assets/api.js";

test("extrait un objet JSON entouré de texte", () => {
	const value = extractJson('Voici la leçon :\n{"ok": true, "n": 2}\nFin.');
	assert.deepEqual(value, { ok: true, n: 2 });
});

test("extrait un objet dans un bloc de code", () => {
	const value = extractJson('```json\n{"plan": {"nodes": []}}\n```');
	assert.deepEqual(value, { plan: { nodes: [] } });
});

test("refuse une réponse sans JSON", () => {
	assert.throws(() => extractJson("pas de json ici"), (error) => {
		assert.ok(error instanceof ApiError);
		assert.equal(error.code, "bad-json");
		return true;
	});
});
