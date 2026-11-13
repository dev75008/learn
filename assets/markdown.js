/**
 * Rendu Markdown minimal et sûr.
 * Tout le texte est échappé AVANT l'ajout des balises : le contenu du modèle
 * ne peut pas injecter de HTML ni d'attribut. Pas de liens cliquables, pas
 * d'images distantes, pas de HTML brut.
 */

export function escapeHtml(value) {
	return String(value ?? "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function inline(source) {
	const codes = [];
	let text = source.replace(/`([^`\n]+)`/g, (_, code) => {
		const token = `\u0000${codes.length}\u0000`;
		codes.push(`<code>${code}</code>`);
		return token;
	});
	text = text.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
	text = text.replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>");
	text = text.replace(/\u0000(\d+)\u0000/g, (_, index) => codes[Number(index)] ?? "");
	return text;
}

export function renderMarkdown(source) {
	const escaped = escapeHtml(source ?? "").replaceAll("\r\n", "\n");
	const lines = escaped.split("\n");
	const html = [];
	let paragraph = [];
	let list = null;
	let code = null;
	let codeLines = [];

	const flushParagraph = () => {
		if (paragraph.length) {
			html.push(`<p>${inline(paragraph.join(" "))}</p>`);
			paragraph = [];
		}
	};
	const closeList = () => {
		if (list) {
			html.push(`</${list}>`);
			list = null;
		}
	};
	const flush = () => {
		flushParagraph();
		closeList();
	};

	for (const line of lines) {
		if (code !== null) {
			if (line.trim().startsWith("```")) {
				html.push(`<pre><code>${codeLines.join("\n")}</code></pre>`);
				code = null;
				codeLines = [];
			} else {
				codeLines.push(line);
			}
			continue;
		}
		if (line.trim().startsWith("```")) {
			flush();
			code = line.trim().slice(3).trim();
			codeLines = [];
			continue;
		}
		if (!line.trim()) {
			flush();
			continue;
		}
		const heading = line.match(/^(#{1,4})\s+(.*)$/);
		if (heading) {
			flush();
			const level = Math.min(4, Math.max(2, heading[1].length + 1));
			html.push(`<h${level}>${inline(heading[2].trim())}</h${level}>`);
			continue;
		}
		const unordered = line.match(/^\s*[-*]\s+(.*)$/);
		if (unordered) {
			flushParagraph();
			if (list !== "ul") {
				closeList();
				list = "ul";
				html.push("<ul>");
			}
			html.push(`<li>${inline(unordered[1])}</li>`);
			continue;
		}
		const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
		if (ordered) {
			flushParagraph();
			if (list !== "ol") {
				closeList();
				list = "ol";
				html.push("<ol>");
			}
			html.push(`<li>${inline(ordered[1])}</li>`);
			continue;
		}
		const quote = line.match(/^>\s?(.*)$/);
		if (quote) {
			flush();
			html.push(`<blockquote>${inline(quote[1])}</blockquote>`);
			continue;
		}
		paragraph.push(line.trim());
	}
	if (code !== null) {
		html.push(`<pre><code>${codeLines.join("\n")}</code></pre>`);
	}
	flush();
	return html.join("\n");
}

export function stripMarkdown(source) {
	return String(source ?? "")
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/[#>*_`]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}
