/**
 * Application statique « Base de savoir ».
 *
 * Flux : sujet -> prompt de sondage -> Ox Alpha (copier-coller) -> questions
 * -> prompt de leçon -> Ox Alpha -> plan -> pas -> pratique.
 *
 * Aucun appel réseau vers un modèle : la page ne parle qu'à son propre
 * hébergement pour charger les exemples. La méthode vient de LearnHarness
 * (AGPL-3.0), voir NOTICE.md.
 */

import { escapeHtml, renderMarkdown } from "./markdown.js";
import { extractJson, ParseError } from "./parse.js";
import { buildLessonPrompt, buildProbePrompt } from "./prompts.js";
import { planLayers, validateLesson, validateProbe } from "./schema.js";
import {
	downloadJson,
	exportPayload,
	importTopics,
	loadLibrary,
	removeTopic,
	saveLibrary,
	upsertTopic,
} from "./store.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const state = {
	view: "new",
	topics: [],
	builtins: [],
	currentId: null,
	current: null,
	stepIndex: 0,
	check: null,
	draft: null,
	probe: null,
	probeAnswers: null,
	manual: null,
	filter: "",
	importReport: null,
};

const view = $("#view");
const toastEl = $("#toast");
let toastTimer = null;

/* ── Utilitaires ─────────────────────────────────────────────────── */

function toast(message, duration = 3600) {
	toastEl.textContent = message;
	toastEl.classList.add("show");
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => toastEl.classList.remove("show"), duration);
}

function shortDate(iso) {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "";
	return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(date);
}

function statusOf(topic) {
	if (topic.progress?.completedAt) return "terminé";
	if (topic.progress?.startedAt) return "en cours";
	return "nouveau";
}

function filteredTopics() {
	const query = state.filter.trim().toLowerCase();
	if (!query) return state.topics;
	return state.topics.filter((topic) => {
		const haystack = [
			topic.title,
			topic.topic,
			topic.goal,
			topic.summary,
			...(topic.graph?.propositions ?? []).map((p) => `${p.name} ${p.statement}`),
		]
			.join(" ")
			.toLowerCase();
		return haystack.includes(query);
	});
}

function ensureProgress(topic) {
	if (!topic.progress || typeof topic.progress !== "object") topic.progress = {};
	if (!topic.progress.checks || typeof topic.progress.checks !== "object") topic.progress.checks = {};
	if (!Number.isInteger(topic.progress.stepIndex)) topic.progress.stepIndex = 0;
	return topic.progress;
}

function focusMain() {
	requestAnimationFrame(() => {
		const heading = $("#view h1");
		if (heading) {
			heading.setAttribute("tabindex", "-1");
			heading.focus({ preventScroll: true });
		}
	});
}

function setView(name) {
	state.view = name;
	render();
}

/* ── Démarrage ───────────────────────────────────────────────────── */

async function init() {
	purgeLegacySecrets();
	state.topics = loadLibrary();
	wireGlobalEvents();
	await loadBuiltins();
	renderSidebar();
	render();
}

/** Les versions précédentes stockaient une clé et une URL d'API. On les efface. */
function purgeLegacySecrets() {
	try {
		localStorage.removeItem("lh.key.local");
		localStorage.removeItem("lh.config.v1");
		sessionStorage.removeItem("lh.key.session");
	} catch {
		/* stockage indisponible : rien à purger */
	}
}

async function loadBuiltins() {
	try {
		const response = await fetch("data/index.json", { cache: "no-cache" });
		if (!response.ok) throw new Error(`index ${response.status}`);
		const index = await response.json();
		const entries = Array.isArray(index?.topics) ? index.topics : [];
		const loaded = [];
		for (const entry of entries) {
			try {
				const file = await fetch(`data/${entry.file}`, { cache: "no-cache" });
				if (!file.ok) continue;
				const raw = await file.json();
				const result = validateLesson(raw);
				if (!result.ok) {
					console.warn("Exemple ignoré", entry.file, result.errors);
					continue;
				}
				loaded.push({
					...result.lesson,
					id: entry.id,
					title: entry.title || result.lesson.title,
					topic: entry.topic || result.lesson.topic,
					summary: entry.summary || result.lesson.summary,
					level: entry.level || result.lesson.level,
					origin: "builtin",
					createdAt: entry.createdAt || "2026-11-13T00:00:00.000Z",
					updatedAt: entry.updatedAt || "2026-11-13T00:00:00.000Z",
				});
			} catch (error) {
				console.warn("Exemple illisible", entry.file, error);
			}
		}
		state.builtins = loaded;
		let changed = false;
		for (const builtin of loaded) {
			if (!state.topics.some((topic) => topic.id === builtin.id)) {
				state.topics.push(builtin);
				changed = true;
			}
		}
		if (changed) {
			try {
				saveLibrary(state.topics);
			} catch {
				toast("Exemple affiché, mais le stockage local est indisponible.");
			}
		}
	} catch (error) {
		console.warn("Exemples non chargés", error);
	}
}

/* ── Barre latérale ──────────────────────────────────────────────── */

function renderSidebar() {
	const list = $("#topic-list");
	const topics = filteredTopics();
	$("#topic-count").textContent = String(state.topics.length);
	$("#sidebar-empty").hidden = topics.length > 0 || !state.filter;
	if (!topics.length) {
		list.innerHTML = state.filter ? `<li class="empty-note">Aucun sujet ne correspond.</li>` : "";
		return;
	}
	list.innerHTML = topics
		.map(
			(topic) => `
			<li class="${topic.id === state.currentId ? "is-current" : ""}">
				<button type="button" data-action="open-topic" data-id="${escapeHtml(topic.id)}">
					<span class="topic-title">${escapeHtml(topic.title)}</span>
					<span class="topic-meta">
						<span>${escapeHtml(statusOf(topic))}</span>
						${topic.origin === "builtin" ? "<span>exemple</span>" : ""}
					</span>
				</button>
			</li>`,
		)
		.join("");
}

function persistTopics(message) {
	try {
		saveLibrary(state.topics);
		if (message) toast(message);
	} catch (error) {
		toast(error.message || "Impossible d'enregistrer dans le navigateur.");
	}
}

function persistCurrent() {
	if (!state.current) return;
	state.current.updatedAt = new Date().toISOString();
	state.topics = upsertTopic(state.topics, state.current);
	persistTopics();
	renderSidebar();
}

/* ── Navigation et événements ────────────────────────────────────── */

function wireGlobalEvents() {
	$$("[data-go]").forEach((button) => {
		button.addEventListener("click", () => {
			state.currentId = null;
			state.current = null;
			state.check = null;
			setView(button.dataset.go);
		});
	});
	$("#brand").addEventListener("click", (event) => {
		event.preventDefault();
		state.currentId = null;
		state.current = null;
		setView("new");
	});
	$("#search").addEventListener("input", (event) => {
		state.filter = event.target.value;
		renderSidebar();
		if (state.view === "library") renderLibrary();
	});
	$("#topic-list").addEventListener("click", (event) => {
		const button = event.target.closest('button[data-action="open-topic"]');
		if (button?.dataset.id) openTopic(button.dataset.id);
	});

	$("#import-button").addEventListener("click", () => $("#import-file").click());
	$("#import-file").addEventListener("change", onImportFile);
	$("#export-button").addEventListener("click", exportAll);
	$("#restore-button").addEventListener("click", restoreBuiltins);

	view.addEventListener("click", onViewClick);
	view.addEventListener("submit", onViewSubmit);
	view.addEventListener("input", onViewInput);
}

function shortNav() {
	$$("[data-go]").forEach((button) => {
		const active = button.dataset.go === state.view;
		if (active) button.setAttribute("aria-current", "page");
		else button.removeAttribute("aria-current");
	});
}

function onViewClick(event) {
	const target = event.target.closest("[data-action]");
	if (!target) return;
	const action = target.dataset.action;
	const id = target.dataset.id;

	if (action === "open-topic") {
		openTopic(id);
		return;
	}
	if (action === "copy-prompt") {
		copyPrompt();
		return;
	}
	if (action === "back-to-new" || action === "new") {
		state.manual = null;
		state.probe = null;
		state.probeAnswers = null;
		state.currentId = null;
		state.current = null;
		state.check = null;
		setView("new");
		return;
	}
	if (action === "back") {
		state.currentId = null;
		state.current = null;
		setView("library");
		return;
	}
	if (action === "start-lesson" || action === "resume-lesson") {
		startLesson();
		return;
	}
	if (action === "back-plan") {
		state.check = null;
		setView("plan");
		return;
	}
	if (action === "retry-check") {
		state.check = null;
		renderLesson();
		return;
	}
	if (action === "dontknow-check") {
		submitCheckDontKnow();
		return;
	}
	if (action === "next-step") {
		goNextStep();
		return;
	}
	if (action === "finish-lesson") {
		finishLesson();
		return;
	}
	if (action === "review-practice") {
		setView("practice");
		return;
	}
	if (action === "delete-topic") {
		deleteTopic(id);
		return;
	}
	if (action === "export-topic") {
		const topic = state.topics.find((item) => item.id === id);
		if (topic) {
			const safeId = String(id).replace(/[^a-z0-9_-]+/gi, "-");
			downloadJson(`sujet-${safeId}.json`, exportPayload([topic]));
		}
		return;
	}
	if (action === "import") {
		$("#import-file").click();
		return;
	}
	if (action === "export-all") {
		exportAll();
		return;
	}
	if (action === "restore") {
		restoreBuiltins();
		return;
	}
	if (action === "clear-import-report") {
		state.importReport = null;
		renderLibrary();
	}
}

function onViewInput(event) {
	const range = event.target.closest("[data-confidence-out]");
	if (range) {
		const output = document.getElementById(range.dataset.confidenceOut);
		if (output) output.textContent = `${range.value} %`;
	}
}

function onViewSubmit(event) {
	event.preventDefault();
	if (event.target.id === "new-form") submitNewTopic(event.target);
	else if (event.target.id === "probe-form") submitProbe(event.target);
	else if (event.target.id === "check-form") submitCheck(event.target);
	else if (event.target.id === "paste-form") submitPaste(event.target);
}

/* ── Nouveau sujet ───────────────────────────────────────────────── */

function defaultDraft() {
	return { topic: "", goal: "", level: "non précisé", known: "", probe: true };
}

function renderNew() {
	const draft = state.draft ?? defaultDraft();
	view.innerHTML = `
		<div class="view-head">
			<p class="eyebrow">Construire</p>
			<h1>Quel sujet veux-tu tenir ?</h1>
			<p class="lede">Le sujet est sondé, puis construit en un pas de raisonnement à la fois. Chaque pas est vérifié avant le suivant.</p>
		</div>

		<div class="notice-box">
			<strong>Moteur : Ox Alpha, en copier-coller.</strong>
			La page prépare le prompt et valide la réponse. Aucune clé, aucun routeur.
			<a href="https://oxalpha.com/chat" target="_blank" rel="noopener noreferrer">Ouvrir Ox Alpha</a>.
		</div>

		<form id="new-form" class="panel form-grid" novalidate>
			<label class="field">
				<span>Sujet</span>
				<input name="topic" type="text" maxlength="300" required autocomplete="off"
					placeholder="Ex. : pourquoi la dérivée de x² vaut 2x" value="${escapeHtml(draft.topic)}" />
				<span class="hint">Un sujet précis donne une meilleure leçon qu'un thème large.</span>
			</label>

			<div class="field-row">
				<label class="field">
					<span>Objectif (facultatif)</span>
					<input name="goal" type="text" maxlength="600" autocomplete="off"
						placeholder="Ex. : pouvoir l'expliquer sans formule" value="${escapeHtml(draft.goal)}" />
				</label>
				<label class="field">
					<span>Niveau</span>
					<select name="level">
						${["non précisé", "collège", "lycée", "licence", "master / avancé"]
							.map(
								(level) =>
									`<option value="${escapeHtml(level)}" ${level === draft.level ? "selected" : ""}>${escapeHtml(level)}</option>`,
							)
							.join("")}
					</select>
				</label>
			</div>

			<label class="field">
				<span>Ce que tu sais déjà (facultatif)</span>
				<textarea name="known" maxlength="3000"
					placeholder="Ex. : je sais calculer une pente, mais je ne comprends pas les limites.">${escapeHtml(draft.known)}</textarea>
			</label>

			<label class="check">
				<input type="checkbox" name="probe" ${draft.probe ? "checked" : ""} />
				<span>Sonder d'abord (3 à 5 questions). Recommandé : la leçon part de ta vraie frontière, pas d'une hypothèse.</span>
			</label>

			<div class="form-actions">
				<button type="submit" class="primary-button">Préparer le prompt</button>
				<span class="hint">Étape suivante : copier le prompt dans Ox Alpha, puis coller sa réponse.</span>
			</div>
		</form>
	`;
}

function submitNewTopic(form) {
	const data = new FormData(form);
	const draft = {
		topic: String(data.get("topic") ?? "").trim(),
		goal: String(data.get("goal") ?? "").trim(),
		level: String(data.get("level") ?? "non précisé"),
		known: String(data.get("known") ?? "").trim(),
		probe: data.get("probe") === "on",
	};
	state.draft = draft;
	if (!draft.topic) {
		toast("Écris un sujet.");
		return;
	}
	startManual(draft);
}

function startManual(draft) {
	const phase = draft.probe ? "probe" : "lesson";
	state.currentId = null;
	state.current = null;
	state.check = null;
	state.probe = null;
	state.probeAnswers = null;
	state.manual = {
		draft,
		phase,
		prompt: phase === "probe" ? buildProbePrompt(draft) : buildLessonPrompt(draft, null),
		response: "",
		error: [],
	};
	state.view = "prompt";
	render();
}

/* ── Copier le prompt / coller la réponse ────────────────────────── */

async function copyPrompt() {
	const area = $("#prompt-text");
	if (!area) return;
	area.focus();
	area.select();
	try {
		await navigator.clipboard.writeText(area.value);
		toast("Prompt copié. Colle-le dans Ox Alpha.");
	} catch {
		try {
			document.execCommand("copy");
			toast("Prompt copié. Colle-le dans Ox Alpha.");
		} catch {
			toast("Copie refusée par le navigateur. Sélectionne le texte et fais Ctrl+C.");
		}
	}
}

function renderPrompt() {
	const manual = state.manual;
	if (!manual) {
		setView("new");
		return;
	}
	const isProbe = manual.phase === "probe";
	const errors = manual.error ?? [];
	view.innerHTML = `
		<div class="view-head">
			<p class="eyebrow">Ox Alpha · ${isProbe ? "sondage" : "leçon"}</p>
			<h1>${isProbe ? "Sonder avec Ox Alpha" : "Construire la leçon avec Ox Alpha"}</h1>
			<p class="lede">${
				isProbe
					? "Ox Alpha choisit quelques questions pour situer ta frontière. Tu réponds ensuite ici."
					: "Le prompt contient tes réponses au sondage. Ox Alpha produit le plan, les pas, les vérifications et la pratique."
			}</p>
		</div>

		<ol class="guide">
			<li><strong>Copie le prompt.</strong> Le bouton sélectionne tout le texte.</li>
			<li><strong>Ouvre Ox Alpha et colle-le.</strong> Attends la réponse complète : elle peut être longue.</li>
			<li><strong>Copie toute la réponse</strong>, puis colle-la dans le champ ci-dessous. La page extrait le JSON et le valide.</li>
		</ol>

		<div class="panel">
			<label class="field">
				<span>Prompt pour Ox Alpha</span>
				<textarea id="prompt-text" class="prompt-area" readonly rows="14" spellcheck="false">${escapeHtml(manual.prompt)}</textarea>
			</label>
			<div class="form-actions">
				<button type="button" class="primary-button" data-action="copy-prompt">Copier le prompt</button>
				<a class="secondary-button button-link" href="https://oxalpha.com/chat" target="_blank" rel="noopener noreferrer">Ouvrir Ox Alpha</a>
				<span class="hint">Le prompt est long : copie tout, jusqu'à la dernière ligne.</span>
			</div>
		</div>

		<form id="paste-form" class="panel form-grid spaced-top" novalidate>
			<label class="field">
				<span>Réponse d'Ox Alpha</span>
				<textarea name="response" rows="12" spellcheck="false"
					placeholder="Colle ici la réponse complète, JSON compris…">${escapeHtml(manual.response)}</textarea>
				<span class="hint">Le texte autour du JSON est toléré. Une réponse incomplète sera refusée.</span>
			</label>

			${
				errors.length
					? `<div class="error-box">
						<strong>Réponse refusée.</strong>
						<ul>${errors.slice(0, 6).map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>
						<p class="small">Corrige la réponse ou recolle-la en entier.</p>
					</div>`
					: ""
			}

			<div class="form-actions">
				<button type="submit" class="primary-button">Lire la réponse</button>
				<button type="button" class="secondary-button" data-action="back-to-new">Changer de sujet</button>
			</div>
		</form>
	`;
	focusMain();
}

function submitPaste(form) {
	const manual = state.manual;
	if (!manual) return;
	const data = new FormData(form);
	const responseText = String(data.get("response") ?? "").trim();
	manual.response = responseText;
	manual.error = [];
	if (!responseText) {
		manual.error = ["Le champ est vide. Colle la réponse complète d'Ox Alpha."];
		renderPrompt();
		return;
	}

	let raw;
	try {
		raw = extractJson(responseText);
	} catch (error) {
		manual.error = [
			error instanceof ParseError
				? error.message
				: "Impossible de lire la réponse. Colle le texte complet, sans le modifier.",
		];
		renderPrompt();
		return;
	}

	if (manual.phase === "probe") {
		const result = validateProbe(raw);
		if (!result.ok) {
			manual.error = result.errors;
			renderPrompt();
			return;
		}
		state.probe = result.probe;
		state.probeAnswers = null;
		state.view = "probe";
		render();
		return;
	}

	const result = validateLesson(raw);
	if (!result.ok) {
		manual.error = result.errors;
		renderPrompt();
		return;
	}
	if (result.warnings.length) console.info("Avertissements de validation", result.warnings);
	const now = new Date().toISOString();
	const lesson = {
		...result.lesson,
		id: `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
		createdAt: now,
		updatedAt: now,
		origin: "oxalpha-manual",
		model: "ox-alpha",
		level: result.lesson.level || manual.draft.level,
		progress: { stepIndex: 0, checks: {}, startedAt: null, completedAt: null },
	};
	state.topics = upsertTopic(state.topics, lesson);
	persistTopics();
	state.current = lesson;
	state.currentId = lesson.id;
	state.stepIndex = 0;
	state.check = null;
	state.manual = null;
	state.view = "plan";
	render();
	toast("Leçon ajoutée à ta base.");
}

/* ── Sondage ─────────────────────────────────────────────────────── */

function renderProbe() {
	const probe = state.probe;
	if (!probe) {
		setView("new");
		return;
	}
	view.innerHTML = `
		<div class="view-head">
			<p class="eyebrow">Sondage</p>
			<h1>Où s'arrête ta compréhension ?</h1>
			<p class="lede">${escapeHtml(probe.goal)}</p>
			<p class="small muted">Réponds sans chercher à impressionner : une erreur est une information utile. Tu peux répondre « Je ne sais pas ».</p>
		</div>

		<form id="probe-form" class="form-grid" novalidate>
			${probe.questions
				.map(
					(question, index) => `
				<fieldset class="probe-question" data-question-index="${index}">
					${question.strand ? `<span class="strand">${escapeHtml(question.strand)}</span>` : ""}
					<legend>${escapeHtml(question.prompt)}</legend>
					<div class="option-list">
						${question.options
							.map(
								(option, optionIndex) => `
							<label class="option">
								<input type="radio" name="answer-${index}" value="${optionIndex}" />
								<span>${escapeHtml(option)}</span>
							</label>`,
							)
							.join("")}
						<label class="option">
							<input type="radio" name="answer-${index}" value="${question.options.length}" />
							<span>Je ne sais pas.</span>
						</label>
					</div>
					<div class="confidence-row">
						<label for="conf-${index}">Confiance</label>
						<input id="conf-${index}" type="range" min="0" max="100" step="5" value="50"
							name="confidence-${index}" data-confidence-out="conf-out-${index}" />
						<output id="conf-out-${index}" for="conf-${index}">50 %</output>
					</div>
					<label class="thinking-field">
						<span class="sr-only">Ton raisonnement pour la question ${index + 1}</span>
						<textarea name="thinking-${index}" maxlength="1500"
							placeholder="Ton raisonnement, une hésitation, un souvenir… (facultatif)"></textarea>
					</label>
				</fieldset>`,
				)
				.join("")}

			<div class="form-actions">
				<button type="submit" class="primary-button">Préparer le prompt de leçon</button>
				<button type="button" class="secondary-button" data-action="back-to-new">Changer de sujet</button>
			</div>
			<p class="hint">Tu copieras ce prompt dans Ox Alpha, puis tu colleras la leçon JSON.</p>
		</form>
	`;
	shortNav();
	focusMain();
}

function submitProbe(form) {
	const data = new FormData(form);
	const questions = state.probe.questions.map((question, index) => {
		const value = data.get(`answer-${index}`);
		if (value === null) return { missing: true };
		const selected = Number(value);
		const dontKnow = selected === question.options.length;
		return {
			prompt: question.prompt,
			strand: question.strand,
			answer: dontKnow ? "Je ne sais pas" : question.options[selected],
			confidence: Number(data.get(`confidence-${index}`) ?? 50),
			thinking: String(data.get(`thinking-${index}`) ?? "").trim(),
			dontKnow,
		};
	});
	if (questions.some((question) => question.missing)) {
		toast("Réponds à chaque question, ou choisis « Je ne sais pas ».");
		return;
	}
	const probeAnswers = { goal: state.probe.goal, questions };
	state.probeAnswers = probeAnswers;
	const draft = state.manual?.draft ?? state.draft;
	if (!draft) {
		setView("new");
		return;
	}
	state.manual = {
		draft,
		phase: "lesson",
		prompt: buildLessonPrompt(draft, probeAnswers),
		response: "",
		error: [],
	};
	state.view = "prompt";
	render();
}

/* ── Ouverture d'un sujet ────────────────────────────────────────── */

function openTopic(id) {
	const topic = state.topics.find((item) => item.id === id);
	if (!topic) return;
	state.manual = null;
	state.currentId = id;
	state.current = structuredClone(topic);
	state.check = null;
	const progress = ensureProgress(state.current);
	state.stepIndex = Math.min(Math.max(0, progress.stepIndex), Math.max(0, state.current.steps.length - 1));
	if (progress.completedAt) {
		state.view = "plan";
	} else if (progress.startedAt && progress.stepIndex < state.current.steps.length) {
		state.view = "lesson";
	} else {
		state.view = "plan";
	}
	render();
	renderSidebar();
}

function deleteTopic(id) {
	const topic = state.topics.find((item) => item.id === id);
	if (!topic) return;
	if (!window.confirm(`Supprimer définitivement « ${topic.title} » de ce navigateur ?`)) return;
	state.topics = removeTopic(state.topics, id);
	persistTopics("Sujet supprimé.");
	if (state.currentId === id) {
		state.currentId = null;
		state.current = null;
		setView("library");
	} else {
		renderSidebar();
		if (state.view === "library") renderLibrary();
	}
}

/* ── Vue plan ────────────────────────────────────────────────────── */

function renderPlan() {
	const lesson = state.current;
	if (!lesson) {
		setView("library");
		return;
	}
	const layers = planLayers(lesson.plan) ?? [lesson.plan.nodes.map((node) => node.id)];
	const nodeById = new Map(lesson.plan.nodes.map((node) => [node.id, node]));
	const goalNodeId =
		lesson.plan.goalNodeId ??
		(layers.length ? layers.at(-1).find((id) => !(lesson.plan.edges ?? []).some((edge) => edge.from === id)) : null) ??
		layers.at(-1)?.[0];
	const dependencies = new Map();
	for (const edge of lesson.plan.edges ?? []) {
		if (!dependencies.has(edge.to)) dependencies.set(edge.to, []);
		dependencies.get(edge.to).push(edge.from);
	}
	const progress = ensureProgress(lesson);
	const started = Boolean(progress.startedAt);
	const completed = Boolean(progress.completedAt);
	const atEnd = progress.stepIndex >= lesson.steps.length;
	const nextAction = completed || atEnd ? "review-practice" : started ? "resume-lesson" : "start-lesson";
	const nextLabel =
		completed || atEnd
			? "Voir la pratique"
			: started
				? `Reprendre à l'étape ${Math.min(progress.stepIndex + 1, lesson.steps.length)}`
				: "Commencer";

	view.innerHTML = `
		<div class="view-head">
			<p class="eyebrow">Plan${completed ? " · terminé" : started ? " · en cours" : ""}</p>
			<h1>${escapeHtml(lesson.title)}</h1>
			<div class="lede">${renderMarkdown(lesson.goal)}</div>
		</div>

		<div class="plan-summary">
			<div class="goal-label">Approche</div>
			${renderMarkdown(lesson.summary)}
		</div>

		${
			lesson.assumptions?.length
				? `<details class="panel spaced-bottom">
					<summary><strong>Ce qui est supposé déjà tenu</strong></summary>
					<ul>${lesson.assumptions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
				</details>`
				: ""
		}

		<h2>La carte</h2>
		<p class="muted small">Les nœuds sont des repères, pas des chapitres. Les flèches vont de ce qui doit être compris vers ce qui en dépend.</p>
		<div class="plan-map">
			${layers
				.map((layer, index) => {
					const label =
						index === layers.length - 1
							? "Objectif"
							: index === 0
								? "Fondations et point d'entrée"
								: `Dépendances · niveau ${index + 1}`;
					return `<div class="plan-layer">
						<div class="plan-layer-label">${label}</div>
						<div class="plan-layer-nodes">
							${layer
								.map((nodeId) => {
									const node = nodeById.get(nodeId);
									if (!node) return "";
									const requires = dependencies.get(nodeId) ?? [];
									return `<article class="plan-node ${nodeId === goalNodeId ? "is-goal" : ""}">
										<h3>${escapeHtml(node.title)} ${nodeId === goalNodeId ? '<span class="badge goal">objectif</span>' : ""}</h3>
										${node.summary ? `<p>${escapeHtml(node.summary)}</p>` : ""}
										${
											requires.length
												? `<p class="requires">après : ${requires
														.map((id) => escapeHtml(nodeById.get(id)?.title ?? id))
														.join(", ")}</p>`
												: ""
										}
									</article>`;
								})
								.join("")}
						</div>
					</div>`;
				})
				.join("")}
		</div>

		<h2>Les pas</h2>
		<ol class="steps-preview">
			${lesson.steps
				.map(
					(step, index) => `
				<li>
					<span class="num">${index + 1}</span>
					<div>
						<strong>${escapeHtml(step.title)}</strong>
						<span class="badge ${step.kind}">${step.kind === "foundation" ? "fondation" : "dérivation"}</span>
						<div class="statement">${escapeHtml(step.proposition.statement)}</div>
					</div>
				</li>`,
				)
				.join("")}
		</ol>

		<details class="panel spaced-top">
			<summary><strong>Connaissances de cette leçon</strong> · ${lesson.graph.propositions.length} propositions, ${lesson.graph.chains.length} chaînes</summary>
			<ul>
				${lesson.graph.propositions
					.map((proposition) => `<li><strong>${escapeHtml(proposition.name)}</strong> — ${escapeHtml(proposition.statement)}</li>`)
					.join("")}
			</ul>
			${
				lesson.graph.chains.length
					? `<p class="muted small">Chaînes de raisonnement :</p><ul>${lesson.graph.chains
							.map((chain) => {
								const names = chain.premises
									.map((id) => lesson.graph.propositions.find((p) => p.id === id)?.name ?? id)
									.map(escapeHtml)
									.join(" + ");
								const conclusion = lesson.graph.propositions.find((p) => p.id === chain.conclusion)?.name ?? chain.conclusion;
								return `<li>${names} → <strong>${escapeHtml(conclusion)}</strong></li>`;
							})
							.join("")}</ul>`
					: ""
			}
		</details>

		<div class="lesson-actions">
			<button type="button" class="primary-button" data-action="${nextAction}">
				${nextLabel}
			</button>
			<button type="button" class="secondary-button" data-action="back">Retour à la base</button>
		</div>
	`;
	shortNav();
	focusMain();
}

function startLesson() {
	const lesson = state.current;
	if (!lesson) return;
	const progress = ensureProgress(lesson);
	if (!progress.startedAt) progress.startedAt = new Date().toISOString();
	if (state.stepIndex >= lesson.steps.length) {
		progress.stepIndex = lesson.steps.length;
		persistCurrent();
		state.view = "practice";
		render();
		return;
	}
	progress.stepIndex = state.stepIndex;
	persistCurrent();
	state.check = null;
	state.view = "lesson";
	render();
}

/* ── Vue leçon ───────────────────────────────────────────────────── */

function renderLesson() {
	const lesson = state.current;
	if (!lesson) {
		setView("library");
		return;
	}
	const step = lesson.steps[state.stepIndex];
	if (!step) {
		setView("practice");
		return;
	}
	const progress = ensureProgress(lesson);
	const done = new Set(
		Object.entries(progress.checks ?? {})
			.filter(([, value]) => value?.correct)
			.map(([id]) => id),
	);
	const percent = Math.round((state.stepIndex / lesson.steps.length) * 100);
	const savedCheck = progress.checks?.[step.id];
	const check =
		state.check?.stepId === step.id
			? state.check
			: savedCheck?.correct
				? {
						stepId: step.id,
						selected: savedCheck.selected ?? step.check.correctIndex,
						submitted: true,
						correct: true,
						confidence: savedCheck.confidence,
						thinking: savedCheck.thinking,
					}
				: null;
	const isLast = state.stepIndex === lesson.steps.length - 1;

	view.innerHTML = `
		<div class="lesson-shell">
			<div>
				<div class="progress-line">
					<span>Étape ${state.stepIndex + 1} sur ${lesson.steps.length}</span>
					<progress class="progress-track" max="100" value="${percent}" aria-label="Progression">${percent} %</progress>
					<span>${percent} %</span>
				</div>

				<article class="step-card">
					<header class="step-head">
						<h2>${escapeHtml(step.title)}</h2>
						<div class="badges">
							<span class="badge ${step.kind}">${step.kind === "foundation" ? "fondation" : "dérivation"}</span>
							${
								step.proposition.id === lesson.goalPropositionId
									? '<span class="badge goal">objectif</span>'
									: ""
							}
						</div>
					</header>

					<div class="proposition">
						<div class="prop-label">${escapeHtml(step.proposition.name)}</div>
						<p>${escapeHtml(step.proposition.statement)}</p>
					</div>

					<div class="teach">${renderMarkdown(step.teach)}</div>

					<section class="check-block" aria-labelledby="check-title">
						<div class="check-label">Vérification</div>
						<h3 id="check-title">Ce pas a-t-il atterri ?</h3>
						<form id="check-form" data-step-id="${escapeHtml(step.id)}" novalidate>
							<p class="check-question">${escapeHtml(step.check.question)}</p>
							<div class="option-list">
								${step.check.options
									.map(
										(option, index) => `
									<label class="option">
										<input type="radio" name="check-answer" value="${index}"
											${check?.selected === index ? "checked" : ""}
											${check?.submitted ? "disabled" : ""} />
										<span>${escapeHtml(option)}</span>
									</label>`,
									)
									.join("")}
							</div>
							${
								check?.submitted
									? ""
									: `<div class="confidence-row">
										<label for="check-confidence">Confiance</label>
										<input id="check-confidence" type="range" min="0" max="100" step="5" value="${check?.confidence ?? 50}"
											name="check-confidence" data-confidence-out="check-confidence-out" />
										<output id="check-confidence-out" for="check-confidence">${check?.confidence ?? 50} %</output>
									</div>
									<label class="thinking-field">
										<span class="sr-only">Ton raisonnement</span>
										<textarea name="check-thinking" maxlength="1500"
											placeholder="Ton raisonnement (facultatif, conservé dans ce navigateur)">${escapeHtml(check?.thinking ?? "")}</textarea>
									</label>
									<div class="check-actions">
										<button type="submit" class="primary-button">Valider</button>
										<button type="button" class="ghost-button" data-action="dontknow-check">Je ne sais pas</button>
									</div>`
							}
						</form>

						${
							check?.submitted
								? check.correct
									? `<div class="feedback correct" tabindex="-1" id="feedback">
										<h4>Le pas est posé</h4>
										${step.check.explanation ? renderMarkdown(step.check.explanation) : ""}
										<div class="check-actions">
											<button type="button" class="primary-button" data-action="next-step">
												${isLast ? "Passer à la pratique" : "Étape suivante"}
											</button>
										</div>
									</div>`
									: `<div class="feedback incorrect" tabindex="-1" id="feedback">
										<h4>Pas encore. Reprenons ce pas.</h4>
										<div class="repair">${renderMarkdown(step.repair)}</div>
										<div class="check-actions">
											<button type="button" class="primary-button" data-action="retry-check">Réessayer</button>
										</div>
									</div>`
								: ""
						}
					</section>
				</article>

				<div class="lesson-actions">
					<button type="button" class="ghost-button" data-action="back-plan">Revoir le plan</button>
					<span class="muted small">Le plan est la carte. Ici, on avance d'un pas à la fois.</span>
				</div>
			</div>

			<aside class="lesson-side" aria-label="Progression dans la leçon">
				<h2>Le chemin</h2>
				<ol>
					${lesson.steps
						.map((item, index) => {
							const className = done.has(item.id) ? "done" : index === state.stepIndex ? "current" : "";
							return `<li class="${className}">
								<span class="dot">${done.has(item.id) ? "✓" : index + 1}</span>
								<span>${escapeHtml(item.title)}</span>
							</li>`;
						})
						.join("")}
				</ol>
			</aside>
		</div>
	`;
	shortNav();
	if (check?.submitted) {
		requestAnimationFrame(() => $("#feedback")?.focus({ preventScroll: true }));
	} else {
		focusMain();
	}
}

function submitCheck(form) {
	const step = state.current?.steps[state.stepIndex];
	if (!step) return;
	const data = new FormData(form);
	const value = data.get("check-answer");
	if (value === null) {
		toast("Choisis une réponse, ou « Je ne sais pas ».");
		return;
	}
	recordCheck(step, Number(value));
}

function recordCheck(step, selected) {
	const correct = selected === step.check.correctIndex;
	const confidence = Number($("#check-confidence")?.value ?? 50);
	const thinking = String($("#check-thinking")?.value ?? "").trim();
	const progress = ensureProgress(state.current);
	const previous = progress.checks[step.id] ?? {};
	progress.checks[step.id] = {
		...previous,
		correct,
		selected,
		attempts: (previous.attempts ?? 0) + 1,
		confidence,
		thinking,
		answeredAt: new Date().toISOString(),
	};
	progress.stepIndex = state.stepIndex;
	state.check = { stepId: step.id, selected, submitted: true, correct, confidence, thinking };
	persistCurrent();
	renderLesson();
}

function submitCheckDontKnow() {
	const step = state.current?.steps[state.stepIndex];
	if (!step) return;
	const progress = ensureProgress(state.current);
	const previous = progress.checks[step.id] ?? {};
	progress.checks[step.id] = {
		...previous,
		correct: false,
		attempts: (previous.attempts ?? 0) + 1,
		dontKnow: true,
		answeredAt: new Date().toISOString(),
	};
	progress.stepIndex = state.stepIndex;
	state.check = { stepId: step.id, selected: null, submitted: true, correct: false };
	persistCurrent();
	renderLesson();
}

function goNextStep() {
	const lesson = state.current;
	if (!lesson) return;
	const step = lesson.steps[state.stepIndex];
	const progress = ensureProgress(lesson);
	if (step) {
		progress.checks[step.id] = { ...(progress.checks[step.id] ?? {}), correct: true, completedAt: new Date().toISOString() };
	}
	state.stepIndex += 1;
	progress.stepIndex = state.stepIndex;
	persistCurrent();
	state.check = null;
	if (state.stepIndex >= lesson.steps.length) {
		state.view = "practice";
		render();
	} else {
		renderLesson();
	}
}

/* ── Vue pratique ────────────────────────────────────────────────── */

function renderPractice() {
	const lesson = state.current;
	if (!lesson) {
		setView("library");
		return;
	}
	const progress = ensureProgress(lesson);
	const completed = Boolean(progress.completedAt);
	view.innerHTML = `
		<div class="view-head">
			<p class="eyebrow">Pratique</p>
			<h1>Faire venir la connaissance sans qu'on la nomme</h1>
			<p class="lede">Les exercices ne sont pas notés automatiquement : la solution est là pour vérifier ton raisonnement, pas pour le remplacer. Cherche d'abord, puis ouvre les indices.</p>
		</div>

		${
			lesson.practice?.length
				? lesson.practice
						.map(
							(item, index) => `
					<article class="practice-card">
						<header>
							<h2>Exercice ${index + 1}</h2>
							<span class="badge">${escapeHtml(
								item.mode === "composition" ? "composition" : item.mode === "discrimination" ? "discrimination" : "rappel",
							)}</span>
						</header>
						<div class="statement">${renderMarkdown(item.statement)}</div>
						${
							item.hints.length
								? `<details>
									<summary>Indices (${item.hints.length})</summary>
									<ol class="hint-list">${item.hints.map((hint) => `<li>${renderMarkdown(hint)}</li>`).join("")}</ol>
								</details>`
								: ""
						}
						<details>
							<summary>Voir la solution</summary>
							<div class="solution">${renderMarkdown(item.solution)}</div>
						</details>
					</article>`,
						)
						.join("")
				: `<div class="notice-box">Cette leçon n'a pas d'exercice. Tu peux la marquer comme terminée.</div>`
		}

		<div class="lesson-actions">
			<button type="button" class="primary-button" data-action="finish-lesson">
				${completed ? "Leçon terminée" : "Marquer la leçon comme terminée"}
			</button>
			<button type="button" class="secondary-button" data-action="back-plan">Retour au plan</button>
		</div>
	`;
	shortNav();
	focusMain();
}

function finishLesson() {
	const lesson = state.current;
	if (!lesson) return;
	const progress = ensureProgress(lesson);
	progress.completedAt = new Date().toISOString();
	progress.stepIndex = lesson.steps.length;
	persistCurrent("Leçon terminée. Elle reste dans ta base.");
	state.view = "plan";
	render();
}

/* ── Vue bibliothèque ────────────────────────────────────────────── */

function renderLibrary() {
	const topics = filteredTopics();
	const report = state.importReport;
	view.innerHTML = `
		<div class="view-head">
			<p class="eyebrow">Base de savoir</p>
			<h1>${state.topics.length} sujet${state.topics.length > 1 ? "s" : ""} construit${state.topics.length > 1 ? "s" : ""}</h1>
			<p class="lede">Chaque sujet est une leçon complète : plan, pas de raisonnement, vérifications et exercices. Tout est conservé dans ce navigateur.</p>
		</div>

		${
			report
				? `<div class="${report.errors.length ? "error-box" : "notice-box"}">
					${report.errors.length ? `<strong>${report.errors.length} problème(s) d'import.</strong>` : "Import terminé."}
					${report.errors.length ? `<ul>${report.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>` : ""}
					<p class="small">${report.count} sujet(s) importé(s).</p>
					<button type="button" class="link-button" data-action="clear-import-report">Masquer</button>
				</div>`
				: ""
		}

		<div class="library-tools">
			<label class="search-field library-search-field">
				<span class="sr-only">Filtrer la base</span>
				<input type="search" id="library-search" placeholder="Filtrer par titre, objectif ou proposition…" value="${escapeHtml(state.filter)}" />
			</label>
			<button type="button" class="secondary-button" data-action="new">Nouveau sujet</button>
			<button type="button" class="secondary-button" data-action="import">Importer</button>
			<button type="button" class="secondary-button" data-action="export-all">Exporter</button>
			<button type="button" class="secondary-button" data-action="restore">Exemples</button>
		</div>

		${
			topics.length
				? `<div class="library-grid">
					${topics
						.map(
							(topic) => `
						<article class="library-card">
							<h2>${escapeHtml(topic.title)}</h2>
							<div class="meta">
								<span>${escapeHtml(statusOf(topic))}</span>
								${topic.level ? `<span>${escapeHtml(topic.level)}</span>` : ""}
								<span>${shortDate(topic.updatedAt ?? topic.createdAt)}</span>
								${topic.origin === "builtin" ? "<span>exemple</span>" : ""}
							</div>
							<p>${escapeHtml(topic.summary || topic.goal)}</p>
							<div class="card-actions">
								<button type="button" class="secondary-button" data-action="open-topic" data-id="${escapeHtml(topic.id)}">Ouvrir</button>
								<button type="button" class="link-button" data-action="export-topic" data-id="${escapeHtml(topic.id)}">Exporter</button>
								<button type="button" class="link-button" data-action="delete-topic" data-id="${escapeHtml(topic.id)}">Supprimer</button>
							</div>
						</article>`,
						)
						.join("")}
				</div>`
				: `<p class="search-empty">${state.filter ? "Aucun sujet ne correspond à ce filtre." : "La base est vide. Construis un premier sujet."}</p>`
		}
	`;
	const librarySearch = $("#library-search");
	if (librarySearch) {
		librarySearch.addEventListener("input", (event) => {
			state.filter = event.target.value;
			$("#search").value = state.filter;
			renderSidebar();
			renderLibrary();
			const next = $("#library-search");
			if (next) {
				next.focus();
				next.setSelectionRange(next.value.length, next.value.length);
			}
		});
	}
	shortNav();
}

/* ── Import / export ─────────────────────────────────────────────── */

function exportAll() {
	if (!state.topics.length) {
		toast("La base est vide.");
		return;
	}
	const date = new Date().toISOString().slice(0, 10);
	downloadJson(`base-savoir-${date}.json`, exportPayload(state.topics));
}

function onImportFile(event) {
	const file = event.target.files?.[0];
	event.target.value = "";
	if (!file) return;
	const reader = new FileReader();
	reader.onload = () => {
		const { topics, errors } = importTopics(String(reader.result ?? ""));
		if (!topics.length) {
			state.importReport = { count: 0, errors: errors.length ? errors : ["Aucun sujet valide."] };
			setView("library");
			return;
		}
		for (const topic of topics) {
			state.topics = upsertTopic(state.topics, topic);
		}
		persistTopics();
		state.importReport = { count: topics.length, errors };
		renderSidebar();
		setView("library");
		toast(`${topics.length} sujet(s) importé(s).`);
	};
	reader.onerror = () => toast("Impossible de lire le fichier.");
	reader.readAsText(file);
}

function restoreBuiltins() {
	let added = 0;
	for (const builtin of state.builtins) {
		if (!state.topics.some((topic) => topic.id === builtin.id)) {
			state.topics.push(structuredClone(builtin));
			added += 1;
		}
	}
	if (added) {
		persistTopics();
		renderSidebar();
		toast(`${added} exemple(s) restauré(s).`);
	} else {
		toast("Les exemples sont déjà dans la base.");
	}
	if (state.view === "library") renderLibrary();
}

/* ── Rendu ───────────────────────────────────────────────────────── */

function render() {
	switch (state.view) {
		case "prompt":
			renderPrompt();
			break;
		case "probe":
			renderProbe();
			break;
		case "plan":
			renderPlan();
			break;
		case "lesson":
			renderLesson();
			break;
		case "practice":
			renderPractice();
			break;
		case "library":
			renderLibrary();
			break;
		case "new":
			renderNew();
			break;
		default:
			renderNew();
	}
	shortNav();
}

init();
