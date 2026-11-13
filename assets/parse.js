/**
 * Lecture de la réponse JSON copiée depuis Ox Alpha.
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
	if (!raw) throw new ParseError("Le champ est vide. Colle la réponse complète d'Ox Alpha.", "empty");
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
			"Le texte collé ne contient pas un objet JSON valide. Copie la réponse complète d'Ox Alpha, sans la modifier.",
			"bad-json",
			unfenced.slice(0, 500),
		);
	}
}
