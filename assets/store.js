/**
 * Persistance locale. Aucune donnée n'est envoyée à un serveur.
 * Aucune clé API n'existe : la génération passe par le copier-coller Ox Alpha.
 */

import { validateLesson } from "./schema.js";

const LIBRARY_KEY = "lh.library.v1";

function parse(value, fallback) {
	try {
		return value ? JSON.parse(value) : fallback;
	} catch {
		return fallback;
	}
}

export function loadLibrary() {
	const raw = parse(localStorage.getItem(LIBRARY_KEY), []);
	if (!Array.isArray(raw)) return [];
	return raw.filter((topic) => {
		if (!topic || typeof topic.id !== "string" || !Array.isArray(topic.steps)) return false;
		return topic.steps.length > 0 && typeof topic.title === "string";
	});
}

export function saveLibrary(topics) {
	try {
		localStorage.setItem(LIBRARY_KEY, JSON.stringify(topics));
	} catch (error) {
		if (error?.name === "QuotaExceededError" || error?.name === "NS_ERROR_DOM_QUOTA_REACHED") {
			throw new Error(
				"Stockage du navigateur plein. Exporte puis supprime un sujet ancien avant de continuer.",
			);
		}
		throw error;
	}
}

export function upsertTopic(topics, lesson) {
	const index = topics.findIndex((topic) => topic.id === lesson.id);
	if (index === -1) return [lesson, ...topics];
	const copy = [...topics];
	copy[index] = lesson;
	return copy;
}

export function removeTopic(topics, id) {
	return topics.filter((topic) => topic.id !== id);
}

export function exportPayload(topics) {
	return JSON.stringify(
		{
			format: "learn-base/1",
			exportedAt: new Date().toISOString(),
			topics,
		},
		null,
		2,
	);
}

export function downloadJson(filename, content) {
	const blob = new Blob([content], { type: "application/json;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	document.body.append(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Importe un export complet ou un tableau de leçons.
 * Chaque leçon est revalidée : un fichier corrompu n'entre pas dans la base.
 */
export function importTopics(text) {
	let payload;
	try {
		payload = JSON.parse(text);
	} catch {
		return { topics: [], errors: ["Le fichier n'est pas du JSON valide."] };
	}
	const candidates = Array.isArray(payload) ? payload : payload?.topics;
	if (!Array.isArray(candidates)) {
		return { topics: [], errors: ["Format inconnu : tableau « topics » attendu."] };
	}
	const topics = [];
	const errors = [];
	for (const [index, candidate] of candidates.entries()) {
		const result = validateLesson(candidate);
		if (!result.ok) {
			errors.push(`Sujet ${index + 1} : ${result.errors.slice(0, 2).join(" ")}`);
			continue;
		}
		const lesson = {
			...result.lesson,
			id: typeof candidate.id === "string" && candidate.id ? candidate.id : `import-${Date.now()}-${index}`,
			createdAt: candidate.createdAt || new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			origin: candidate.origin === "builtin" ? "import" : candidate.origin || "import",
			progress: candidate.progress && typeof candidate.progress === "object" ? candidate.progress : undefined,
		};
		topics.push(lesson);
	}
	return { topics, errors };
}
