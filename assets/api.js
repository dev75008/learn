/**
 * Client minimal pour une API compatible OpenAI, appelée depuis le navigateur.
 *
 * Aucune clé n'est stockée dans le dépôt. La clé saisie reste dans le
 * navigateur et n'est envoyée qu'à l'URL du fournisseur choisi.
 */

export const PRESETS = {
	openrouter: {
		label: "OpenRouter",
		endpoint: "https://openrouter.ai/api/v1",
		model: "openrouter/auto",
		help: "CORS autorisé. Une seule clé donne accès à de nombreux modèles.",
	},
	openai: {
		label: "OpenAI",
		endpoint: "https://api.openai.com/v1",
		model: "gpt-4o-mini",
		help: "Clé OpenAI. Vérifie que les appels navigateur sont autorisés pour ton compte.",
	},
	gemini: {
		label: "Google Gemini",
		endpoint: "https://generativelanguage.googleapis.com/v1beta/openai",
		model: "gemini-2.5-flash",
		help: "Point d'accès compatible OpenAI de Google AI Studio.",
	},
	groq: {
		label: "Groq",
		endpoint: "https://api.groq.com/openai/v1",
		model: "llama-3.3-70b-versatile",
		help: "Rapide et compatible OpenAI.",
	},
	mistral: {
		label: "Mistral",
		endpoint: "https://api.mistral.ai/v1",
		model: "mistral-large-latest",
		help: "Vérifie les modèles disponibles sur ton compte.",
	},
	ollama: {
		label: "Ollama local",
		endpoint: "http://localhost:11434/v1",
		model: "llama3.2",
		help: "Sans clé. Impossible depuis une page GitHub Pages en HTTPS (contenu mixte) ; utile en local.",
	},
	custom: {
		label: "Autre (compatible OpenAI)",
		endpoint: "",
		model: "",
		help: "Toute API exposant POST /chat/completions et autorisant CORS.",
	},
};

export class ApiError extends Error {
	constructor(message, code = "api", detail = "") {
		super(message);
		this.name = "ApiError";
		this.code = code;
		this.detail = detail;
	}
}

function completionsUrl(endpoint) {
	const base = String(endpoint ?? "").trim().replace(/\/+$/, "");
	if (!base) throw new ApiError("URL du fournisseur manquante.", "config");
	return base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
}

function messageText(content) {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.map((part) => (typeof part === "string" ? part : part?.text ?? ""))
			.join("")
			.trim();
	}
	return "";
}

/** Extrait le premier objet JSON d'une réponse, même entourée de texte. */
export function extractJson(text) {
	const raw = String(text ?? "").trim();
	if (!raw) throw new ApiError("Réponse vide du modèle.", "empty");
	const unfenced = raw
		.replace(/^```(?:json)?\s*/i, "")
		.replace(/\s*```$/i, "")
		.trim();
	try {
		return JSON.parse(unfenced);
	} catch {
		// Récupère l'objet le plus large possible.
		const start = unfenced.indexOf("{");
		const end = unfenced.lastIndexOf("}");
		if (start !== -1 && end > start) {
			try {
				return JSON.parse(unfenced.slice(start, end + 1));
			} catch {
				/* tombe dans l'erreur ci-dessous */
			}
		}
		throw new ApiError(
			"Le modèle n'a pas renvoyé du JSON valide. Réessaie, ou choisis un modèle plus discipliné.",
			"bad-json",
			unfenced.slice(0, 500),
		);
	}
}

function httpError(status, body) {
	const detail = String(body ?? "").slice(0, 600);
	const map = {
		400: "Requête refusée par le fournisseur (modèle, format ou paramètres).",
		401: "Clé API refusée (401). Vérifie la clé et le fournisseur.",
		402: "Crédit insuffisant chez le fournisseur (402).",
		403: "Accès refusé (403). La clé n'a pas les droits nécessaires.",
		404: "URL ou modèle introuvable (404). Vérifie l'URL de base et le nom du modèle.",
		408: "Délai dépassé chez le fournisseur (408).",
		413: "Requête trop volumineuse (413).",
		429: "Limite de débit atteinte (429). Attends un instant puis réessaie.",
		500: "Erreur interne du fournisseur (500).",
		502: "Passerelle du fournisseur en erreur (502).",
		503: "Service du fournisseur indisponible (503).",
	};
	return new ApiError(map[status] ?? `Erreur HTTP ${status} du fournisseur.`, `http-${status}`, detail);
}

async function fetchWithTimeout(url, options, timeoutMs) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	const onAbort = () => controller.abort();
	options.signal?.addEventListener("abort", onAbort, { once: true });
	try {
		return await fetch(url, { ...options, signal: controller.signal });
	} catch (error) {
		if (error?.name === "AbortError") {
			throw new ApiError(
				options.signal?.aborted
					? "Génération annulée."
					: "Le fournisseur n'a pas répondu à temps. Réessaie avec un modèle plus rapide.",
				"timeout",
			);
		}
		throw new ApiError(
			"Impossible de joindre le fournisseur. Vérifie l'URL, le réseau, et que le fournisseur autorise les appels depuis un navigateur (CORS).",
			"network",
			String(error?.message ?? error),
		);
	} finally {
		clearTimeout(timer);
		options.signal?.removeEventListener("abort", onAbort);
	}
}

/**
 * Envoie une conversation et retourne l'objet JSON de la réponse.
 * @param {{endpoint:string, model:string, key:string}} config
 * @param {Array<{role:string,content:string}>} messages
 */
export async function requestJson(config, messages, { maxTokens = 7000, signal } = {}) {
	if (!config?.endpoint) throw new ApiError("Configure d'abord le fournisseur et le modèle.", "config");
	if (!config?.model) throw new ApiError("Configure le nom du modèle.", "config");
	const url = completionsUrl(config.endpoint);

	const headers = { "Content-Type": "application/json" };
	if (config.key) headers.Authorization = `Bearer ${config.key}`;
	// En-têtes utiles à OpenRouter ; on ne les envoie qu'à OpenRouter pour ne pas
	// déclencher de préflight CORS inutile chez les autres fournisseurs.
	if (/openrouter\.ai/i.test(url)) {
		headers["HTTP-Referer"] = location.origin;
		headers["X-Title"] = "Base de savoir LearnHarness";
	}

	const body = {
		model: config.model,
		messages,
		temperature: 0.2,
		max_tokens: maxTokens,
		response_format: { type: "json_object" },
	};

	let response = await fetchWithTimeout(
		url,
		{ method: "POST", headers, body: JSON.stringify(body), signal },
		180_000,
	);
	let text = await response.text();

	// Certains fournisseurs/modèles refusent response_format : un seul retry.
	if (!response.ok && (response.status === 400 || response.status === 422) && /response_format|json_object/i.test(text)) {
		const relaxed = { ...body };
		delete relaxed.response_format;
		response = await fetchWithTimeout(
			url,
			{ method: "POST", headers, body: JSON.stringify(relaxed), signal },
			180_000,
		);
		text = await response.text();
	}

	if (!response.ok) throw httpError(response.status, text);

	let data;
	try {
		data = JSON.parse(text);
	} catch {
		throw new ApiError("Réponse HTTP illisible du fournisseur.", "bad-http");
	}
	const content = messageText(data?.choices?.[0]?.message?.content);
	if (!content) {
		const reason = data?.error?.message || data?.choices?.[0]?.finish_reason || "réponse vide";
		throw new ApiError(`Le modèle n'a rien renvoyé (${reason}).`, "empty");
	}
	return extractJson(content);
}
