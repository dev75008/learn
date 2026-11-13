/**
 * Client OpenRouter.
 *
 * OpenRouter est une API hébergée, compatible OpenAI :
 *   POST https://openrouter.ai/api/v1/chat/completions
 *   Authorization: Bearer sk-or-v1-…
 *
 * La page ne contient aucune clé. La clé saisie dans Réglages reste dans le
 * navigateur et n'est envoyée qu'à OpenRouter.
 */

import { extractJson, ParseError } from "./parse.js";

export const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1";
export const OPENROUTER_MODEL = "openrouter/auto";

export class OpenRouterError extends Error {
	constructor(message, code = "api", detail = "") {
		super(message);
		this.name = "OpenRouterError";
		this.code = code;
		this.detail = detail;
	}
}

function trimBase(endpoint) {
	return String(endpoint ?? OPENROUTER_ENDPOINT).trim().replace(/\/+$/, "");
}

export function chatCompletionsUrl(endpoint = OPENROUTER_ENDPOINT) {
	const base = trimBase(endpoint);
	if (!base) throw new OpenRouterError("URL OpenRouter manquante.", "config");
	return base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
}

function keyUrl(endpoint = OPENROUTER_ENDPOINT) {
	return `${trimBase(endpoint).replace(/\/chat\/completions$/, "")}/key`;
}

function messageText(content) {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content.map((part) => (typeof part === "string" ? part : part?.text ?? "")).join("").trim();
	}
	return "";
}

function errorDetail(body) {
	if (!body) return "";
	try {
		const parsed = typeof body === "string" ? JSON.parse(body) : body;
		return String(parsed?.error?.message ?? parsed?.message ?? parsed?.error ?? "").slice(0, 600);
	} catch {
		return String(body).slice(0, 600);
	}
}

function httpError(status, body) {
	const detail = errorDetail(body);
	const base = {
		400: "OpenRouter a refusé la requête (400). Vérifie le modèle et les paramètres.",
		401: "Clé OpenRouter refusée (401). Crée une nouvelle clé sur openrouter.ai/keys.",
		402: "Crédit OpenRouter insuffisant (402). Ajoute du crédit ou choisis un modèle gratuit.",
		403: "Accès refusé par OpenRouter (403). Vérifie la clé et le modèle.",
		404: "Modèle ou route introuvable (404). Vérifie le nom du modèle.",
		408: "OpenRouter a dépassé le délai (408).",
		413: "Requête trop volumineuse (413).",
		422: "Requête rejetée par le fournisseur (422).",
		429: "Débit ou quota OpenRouter atteint (429). Attends un instant ou change de modèle.",
		500: "Erreur interne OpenRouter (500).",
		502: "Un fournisseur en amont a échoué (502).",
		503: "OpenRouter est indisponible (503).",
		504: "Délai dépassé chez le fournisseur (504).",
	};
	return new OpenRouterError(base[status] ?? `Erreur HTTP ${status} d'OpenRouter.`, `http-${status}`, detail);
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
			throw new OpenRouterError(
				options.signal?.aborted
					? "Génération annulée."
					: "OpenRouter n'a pas répondu à temps. Réessaie.",
				"timeout",
			);
		}
		throw new OpenRouterError(
			"OpenRouter est injoignable. Vérifie le réseau, la clé et que le navigateur autorise l'appel (CORS).",
			"network",
			String(error?.message ?? error),
		);
	} finally {
		clearTimeout(timer);
		options.signal?.removeEventListener("abort", onAbort);
	}
}

function headersFor(config) {
	const headers = {
		"Content-Type": "application/json",
		Authorization: `Bearer ${config.key}`,
	};
	const origin = globalThis.location?.origin;
	if (origin) {
		headers["HTTP-Referer"] = origin;
		headers["X-Title"] = "Base de savoir";
	}
	return headers;
}

/**
 * Envoie un chat et retourne l'objet JSON validé par le schéma appelant.
 * @param {{key:string,model?:string,endpoint?:string}} config
 * @param {Array<{role:string,content:string}>} messages
 */
export async function requestJson(config, messages, { maxTokens = 8000, signal } = {}) {
	if (!config?.key) throw new OpenRouterError("Clé OpenRouter manquante.", "config");
	const url = chatCompletionsUrl(config.endpoint);
	const model = config.model || OPENROUTER_MODEL;

	const body = {
		model,
		messages,
		temperature: 0.2,
		max_tokens: maxTokens,
		response_format: { type: "json_object" },
	};
	const headers = headersFor(config);

	let response = await fetchWithTimeout(url, { method: "POST", headers, body: JSON.stringify(body), signal }, 180_000);
	let text = await response.text();

	if (!response.ok && (response.status === 400 || response.status === 422) && /response_format|json_object|json_schema/i.test(text)) {
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
		throw new OpenRouterError("Réponse HTTP illisible d'OpenRouter.", "bad-http");
	}
	const content = messageText(data?.choices?.[0]?.message?.content);
	if (!content) {
		const reason = data?.error?.message || data?.choices?.[0]?.finish_reason || "réponse vide";
		throw new OpenRouterError(`Le modèle n'a rien renvoyé (${reason}).`, "empty");
	}
	try {
		return extractJson(content);
	} catch (error) {
		if (error instanceof ParseError) {
			throw new OpenRouterError(
				"Le modèle n'a pas renvoyé un JSON valide. Réessaie, ou choisis un modèle plus discipliné.",
				"bad-json",
				content.slice(0, 500),
			);
		}
		throw error;
	}
}

/** Vérifie la clé sans consommer de génération. */
export async function testConnection(config, { signal } = {}) {
	if (!config?.key) throw new OpenRouterError("Clé OpenRouter manquante.", "config");
	const response = await fetchWithTimeout(
		keyUrl(config.endpoint),
		{ method: "GET", headers: headersFor(config), signal },
		20_000,
	);
	const text = await response.text();
	if (!response.ok) throw httpError(response.status, text);
	let data;
	try {
		data = JSON.parse(text);
	} catch {
		throw new OpenRouterError("Réponse /key illisible.", "bad-http");
	}
	const key = data?.data ?? {};
	return {
		ok: true,
		label: typeof key.label === "string" ? key.label : "",
		usage: typeof key.usage === "number" ? key.usage : null,
		limit: typeof key.limit === "number" ? key.limit : null,
		freeTier: key.is_free_tier === true,
	};
}
