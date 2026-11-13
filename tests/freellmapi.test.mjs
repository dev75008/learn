import assert from "node:assert/strict";
import { test } from "node:test";

import {
	FreeLlmError,
	chatCompletionsUrl,
	requestJson,
	testConnection,
} from "../assets/freellmapi.js";

const config = {
	endpoint: "http://localhost:3001/v1",
	model: "auto",
	key: "freellmapi-test",
};

function mockFetch(handler) {
	const original = globalThis.fetch;
	globalThis.fetch = handler;
	return () => {
		globalThis.fetch = original;
	};
}

test("l'URL de chat est construite depuis /v1", () => {
	assert.equal(chatCompletionsUrl("http://localhost:3001/v1"), "http://localhost:3001/v1/chat/completions");
	assert.equal(
		chatCompletionsUrl("https://x.trycloudflare.com/v1/chat/completions"),
		"https://x.trycloudflare.com/v1/chat/completions",
	);
});

test("requestJson envoie la clé, le modèle et lit le JSON", async () => {
	let seen;
	const restore = mockFetch(async (url, init) => {
		seen = { url, init };
		return new Response(
			JSON.stringify({ choices: [{ message: { content: '```json\n{"ok": true}\n```' } }] }),
			{ status: 200, headers: { "Content-Type": "application/json" } },
		);
	});
	try {
		const data = await requestJson(config, [{ role: "user", content: "salut" }]);
		assert.deepEqual(data, { ok: true });
		assert.equal(seen.url, "http://localhost:3001/v1/chat/completions");
		assert.equal(seen.init.headers.Authorization, "Bearer freellmapi-test");
		const body = JSON.parse(seen.init.body);
		assert.equal(body.model, "auto");
		assert.equal(body.response_format.type, "json_object");
		assert.equal(body.messages[0].content, "salut");
	} finally {
		restore();
	}
});

test("une clé refusée devient une FreeLlmError lisible", async () => {
	const restore = mockFetch(
		async () =>
			new Response(JSON.stringify({ error: { message: "invalid key" } }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			}),
	);
	try {
		await assert.rejects(requestJson(config, [{ role: "user", content: "x" }]), (error) => {
			assert.ok(error instanceof FreeLlmError);
			assert.equal(error.code, "http-401");
			assert.match(error.message, /401/);
			return true;
		});
	} finally {
		restore();
	}
});

test("response_format est retiré après un refus du fournisseur", async () => {
	let calls = 0;
	const restore = mockFetch(async (url, init) => {
		calls += 1;
		if (calls === 1) {
			return new Response(
				JSON.stringify({ error: { message: "response_format is not supported" } }),
				{ status: 400, headers: { "Content-Type": "application/json" } },
			);
		}
		const body = JSON.parse(init.body);
		assert.equal("response_format" in body, false);
		return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok": 1}' } }] }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	});
	try {
		const data = await requestJson(config, [{ role: "user", content: "x" }]);
		assert.deepEqual(data, { ok: 1 });
		assert.equal(calls, 2);
	} finally {
		restore();
	}
});

test("testConnection interroge /v1/models avec la clé", async () => {
	let seen;
	const restore = mockFetch(async (url, init) => {
		seen = { url, init };
		return new Response(JSON.stringify({ data: [{ id: "auto" }, { id: "gemini" }] }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	});
	try {
		const result = await testConnection(config);
		assert.equal(result.ok, true);
		assert.equal(result.count, 2);
		assert.equal(seen.url, "http://localhost:3001/v1/models");
		assert.equal(seen.init.headers.Authorization, "Bearer freellmapi-test");
	} finally {
		restore();
	}
});
