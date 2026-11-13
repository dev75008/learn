import assert from "node:assert/strict";
import { test } from "node:test";

import { escapeHtml, renderMarkdown, stripMarkdown } from "../assets/markdown.js";

test("le HTML du modèle est échappé", () => {
	const output = renderMarkdown('<script>alert("x")</script>');
	assert.ok(!output.includes("<script>"));
	assert.ok(output.includes("&lt;script&gt;"));
});

test("gras, code et listes sont rendus sans HTML brut", () => {
	const output = renderMarkdown("Un **fait** avec `a < b`.\n\n- premier\n- second");
	assert.ok(output.includes("<strong>fait</strong>"));
	assert.ok(output.includes("<code>a &lt; b</code>"));
	assert.ok(output.includes("<ul>"));
	assert.equal((output.match(/<li>/g) ?? []).length, 2);
});

test("une balise avec attribut ne peut pas injecter d'attribut", () => {
	const output = renderMarkdown('<img src=x onerror="alert(1)">');
	assert.ok(!output.includes("<img"));
	assert.ok(!output.includes('onerror="'));
});

test("stripMarkdown retire le balisage simple", () => {
	assert.equal(stripMarkdown("## Titre\n\nUn **fait**."), "Titre Un fait.");
});
