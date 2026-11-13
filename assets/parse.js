/**
 * Lecture du JSON renvoyé par le modèle.
 * Le modèle peut entourer l'objet de texte ou de balises Markdown : on
 * récupère l'objet le plus large possible, puis le schéma valide le contenu.
 */

export class ParseError extends Error {
	constructor(message, code = "bad-json", detail = "") {
		super(message);
		this.name = "ParseError";
		this.code = code;
		this.detail = detail;
	}
}

export function extractJson(text) {
	const raw = String(text ?? "").trim();
	if (!raw) throw new ParseError("La réponse du modèle est vide.", "empty");
	const unfenced = raw
		.replace(/^```(?:json)?\s*/i, "")
		.replace(/\s*```$/i, "")
		.trim();
	try {
		return JSON.parse(unfenced);
	} catch {
		const start = unfenced.indexOf("{");
		const end = unfenced.lastIndexOf("}");
		if (start !== -1 && end > start) {
			try {
				return JSON.parse(unfenced.slice(start, end + 1));
			} catch {
				/* tombe dans l'erreur ci-dessous */
			}
		}
		throw new ParseError(
			"Le modèle n'a pas renvoyé un objet JSON valide. Réessaie.",
			"bad-json",
			unfenced.slice(0, 500),
		);
	}
}
