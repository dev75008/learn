/**
 * Client FreeLLMAPI.
 *
 * FreeLLMAPI est un routeur auto-hébergé, compatible OpenAI :
 *   POST {base}/v1/chat/completions
 *   Authorization: Bearer freellmapi-…
 *
 * La page ne contient aucune clé. L'URL et la clé unifiée sont saisies dans
 * Réglages et restent dans le navigateur.
 */

import { extractJson, ParseError } from "./parse.js";

export const DEFAULT_ENDPOINT = "http://localhost:3001/v1";
export const DEFAULT_MODEL = "auto";

export class FreeLlmError extends Error {
	constructor(message, code = "api", detail = "") {
		super(message);
		this.name = "FreeLlmError";
		this.code = code;
		this.detail = detail;
	}
}

function trimBase(endpoint) {
	return String(endpoint ?? "").trim().replace(/\/+$/, "");
}

export function chatCompletionsUrl(endpoint) {
	const base = trimBase(endpoint);
	if (!base) throw new FreeLlmError("URL FreeLLMAPI manquante.", "config");
	if (base.endsWith("/chat/completions")) return base;
	return `${base}/chat/completions`;
}

function modelsUrl(endpoint) {
	const base = trimBase(endpoint).replace(/\/chat\/completions$/, "");
	if (!base) throw new FreeLlmError("URL FreeLLMAPI manquante.", "config");
	return `${base}/models`;
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
		400: "FreeLLMAPI a refusé la requête (400). Vérifie le modèle et les paramètres.",
		401: "Clé unifiée FreeLLMAPI refusée (401). Copie la clé depuis le tableau de bord.",
		403: "Accès refusé (403). Vérifie la clé et DASHBOARD_ORIGINS dans FreeLLMAPI.",
		404: "URL ou route introuvable (404). L'URL doit finir par /v1.",
		408: "FreeLLMAPI a dépassé le délai (408).",
		413: "Requête trop volumineuse (413).",
		422: "Requête rejetée par le fournisseur (422).",
		429: "Quota ou débit atteint (429). FreeLLMAPI va basculer si une autre clé est disponible.",
		500: "Erreur interne FreeLLMAPI (500).",
		502: "Un fournisseur en amont a échoué (502).",
		503: "FreeLLMAPI est indisponible (503).",
		504: "Délai dépassé chez le fournisseur (504).",
	};
	return new FreeLlmError(base[status] ?? `Erreur HTTP ${status} de FreeLLMAPI.`, `http-${status}`, detail);
}

function networkError(error) {
	return new FreeLlmError(
		"FreeLLMAPI est injoignable. Vérifie qu'il tourne, l'URL, CORS et le tunnel. " +
			"Depuis GitHub Pages, Chrome bloque les appels vers localhost (PNA) : utilise une URL HTTPS publique.",
		"network",
		String(error?.message ?? error),
	);
}

async function fetchWithTimeout(url, options, timeoutMs) {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	const onAbort = () => controller.abort();
	options.signal?.addEventListener("abort", onAbort, { once: true });
	try {
		const response = await fetch(url, { ...options, signal: controller.signal });
		return response;
	} catch (error) {
		if (error?.name === "AbortError") {
			throw new FreeLlmError(
				options.signal?.aborted
					? "Génération annulée."
					: "FreeLLMAPI n'a pas répondu à temps. Vérifie le tunnel et réessaie.",
				"timeout",
			);
		}
		throw networkError(error);
	} finally {
		clearTimeout(timer);
		options.signal?.removeEventListener("abort", onAbort);
	}
}

function headersFor(config) {
	const headers = { "Content-Type": "application/json" };
	if (config.key) headers.Authorization = `Bearer ${config.key}`;
	return headers;
}

/**
 * Envoie un chat et retourne l'objet JSON validé par le schéma appelant.
 * @param {{endpoint:string,model:string,key:string}} config
 * @param {Array<{role:string,content:string}>} messages
 */
export async function requestJson(config, messages, { maxTokens = 8000, signal } = {}) {
	const url = chatCompletionsUrl(config?.endpoint);
	if (!config?.model) throw new FreeLlmError("Modèle FreeLLMAPI manquant.", "config");
	if (!config?.key) throw new FreeLlmError("Clé unifiée FreeLLMAPI manquante.", "config");

	const body = {
		model: config.model,
		messages,
		temperature: 0.2,
		max_tokens: maxTokens,
		response_format: { type: "json_object" },
	};
	const headers = headersFor(config);

	let response = await fetchWithTimeout(url, { method: "POST", headers, body: JSON.stringify(body), signal }, 180_000);
	let text = await response.text();

	// Certains modèles amont refusent response_format : un seul retry sans ce champ.
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
		throw new FreeLlmError("Réponse HTTP illisible de FreeLLMAPI.", "bad-http");
	}
	const content = messageText(data?.choices?.[0]?.message?.content);
	if (!content) {
		const reason = data?.error?.message || data?.choices?.[0]?.finish_reason || "réponse vide";
		throw new FreeLlmError(`Le modèle n'a rien renvoyé (${reason}).`, "empty");
	}
	try {
		return extractJson(content);
	} catch (error) {
		if (error instanceof ParseError) {
			throw new FreeLlmError(
				"Le modèle n'a pas renvoyé un JSON valide. Réessaie, ou choisis un modèle plus discipliné (auto:smart).",
				"bad-json",
				content.slice(0, 500),
			);
		}
		throw error;
	}
}

/** Vérifie l'URL et la clé sans consommer de génération. */
export async function testConnection(config, { signal } = {}) {
	const url = modelsUrl(config?.endpoint);
	if (!config?.key) throw new FreeLlmError("Clé unifiée FreeLLMAPI manquante.", "config");
	const response = await fetchWithTimeout(
		url,
		{ method: "GET", headers: { Authorization: `Bearer ${config.key}` }, signal },
		20_000,
	);
	const text = await response.text();
	if (!response.ok) throw httpError(response.status, text);
	let data;
	try {
		data = JSON.parse(text);
	} catch {
		throw new FreeLlmError("Réponse /v1/models illisible.", "bad-http");
	}
	const count = Array.isArray(data?.data) ? data.data.length : null;
	return { ok: true, count };
}
