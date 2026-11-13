/**
 * Schéma et validation des données de leçon.
 *
 * Adapté du modèle de données de LearnHarness (AGPL-3.0) :
 * https://github.com/amosblomqvist/learnharness
 * - plan : arbre de dépendances (nœuds + arêtes « requires »)
 * - steps : un pas de raisonnement = une proposition nouvelle + une vérification
 * - graph : propositions et chaînes de raisonnement (prémisses jointes -> conclusion)
 *
 * Le validateur normalise les petites omissions du modèle et refuse ce qui
 * casserait l'affichage ou la méthode (cycle, vérification sans bonne réponse,
 * étape sans réparation, etc.). Aucun code ne doit dépendre d'un modèle
 * parfaitement obéissant.
 */

export const LESSON_VERSION = 1;
export const MAX_STEPS = 12;

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function text(value, max = 4000) {
	return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function stringList(value, maxItems = 12, maxLength = 300) {
	if (!Array.isArray(value)) return [];
	return value
		.map((item) => {
			if (typeof item === "string") return item.trim().slice(0, maxLength);
			if (isObj(item)) return text(item.label ?? item.text ?? item.name ?? item.statement, maxLength);
			return "";
		})
		.filter(Boolean)
		.slice(0, maxItems);
}

function optionText(option) {
	if (typeof option === "string") return option.trim().slice(0, 500);
	if (isObj(option)) return text(option.text ?? option.label ?? option.value ?? option.answer, 500);
	return "";
}

/** Identifiant lisible, sans accents, utilisable dans une URL ou un fichier. */
export function slugify(value) {
	return String(value ?? "")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
}

function fail(errors, message) {
	errors.push(message);
}

function normalizeQuestion(raw, index, errors) {
	if (!isObj(raw)) {
		fail(errors, `Question ${index + 1} : objet attendu.`);
		return null;
	}
	const prompt = text(raw.prompt ?? raw.question ?? raw.text, 1000);
	const options = Array.isArray(raw.options) ? raw.options.map(optionText).filter(Boolean).slice(0, 6) : [];
	if (!prompt) fail(errors, `Question ${index + 1} : énoncé manquant.`);
	if (options.length < 2) fail(errors, `Question ${index + 1} : au moins deux options sont nécessaires.`);
	if (!prompt || options.length < 2) return null;
	return {
		id: text(raw.id, 80) || `q${index + 1}`,
		strand: text(raw.strand, 200),
		prompt,
		options,
	};
}

/** Valide la sortie de la phase de sondage. */
export function validateProbe(input) {
	const errors = [];
	const warnings = [];
	if (!isObj(input)) {
		return { ok: false, errors: ["La réponse du modèle n'est pas un objet JSON."], probe: null, warnings };
	}
	const goal = text(input.goal ?? input.goalRestatement, 800);
	if (!goal) fail(errors, "Le sondage doit reformuler l'objectif.");

	let strands = stringList(input.strands, 8, 240);
	const rawQuestions = Array.isArray(input.questions) ? input.questions : [];
	const questions = rawQuestions
		.slice(0, 6)
		.map((q, i) => normalizeQuestion(q, i, errors))
		.filter(Boolean);

	if (questions.length < 1) fail(errors, "Le sondage doit contenir au moins une question.");
	if (!strands.length && questions.length) {
		strands = [...new Set(questions.map((q) => q.strand).filter(Boolean))];
		warnings.push("Liste des dépendances reconstruite depuis les questions.");
	}

	const ids = new Set();
	for (const question of questions) {
		if (ids.has(question.id)) {
			question.id = `${question.id}-${ids.size + 1}`;
			warnings.push(`Identifiant de question dupliqué renommé : ${question.id}.`);
		}
		ids.add(question.id);
	}

	return {
		ok: errors.length === 0,
		errors,
		warnings,
		probe: errors.length
			? null
			: {
					goal,
					strands,
					questions,
				},
	};
}

/**
 * Profondeur topologique des nœuds du plan.
 * Retourne null si le graphe contient un cycle.
 */
export function planLayers(plan) {
	const nodes = plan?.nodes ?? [];
	const edges = plan?.edges ?? [];
	const ids = new Set(nodes.map((n) => n.id));
	const indegree = new Map(nodes.map((n) => [n.id, 0]));
	const next = new Map(nodes.map((n) => [n.id, []]));
	for (const edge of edges) {
		if (!ids.has(edge.from) || !ids.has(edge.to)) continue;
		indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
		next.get(edge.from).push(edge.to);
	}
	const layers = [];
	let frontier = nodes.filter((n) => indegree.get(n.id) === 0).map((n) => n.id);
	const visited = new Set();
	while (frontier.length) {
		layers.push([...frontier]);
		const following = [];
		for (const id of frontier) {
			visited.add(id);
			for (const to of next.get(id) ?? []) {
				indegree.set(to, indegree.get(to) - 1);
				if (indegree.get(to) === 0) following.push(to);
			}
		}
		frontier = following;
	}
	if (visited.size !== nodes.length) return null;
	return layers;
}

function normalizePlan(raw, errors, warnings) {
	const source = isObj(raw) ? raw : {};
	const rawNodes = Array.isArray(source.nodes) ? source.nodes : [];
	const nodes = [];
	const ids = new Set();
	for (const [index, item] of rawNodes.entries()) {
		if (!isObj(item)) {
			fail(errors, `Plan, nœud ${index + 1} : objet attendu.`);
			continue;
		}
		const id = slugify(item.id ?? item.slug ?? item.title);
		const title = text(item.title ?? item.label ?? item.name, 180);
		if (!id) {
			fail(errors, `Plan, nœud ${index + 1} : identifiant manquant.`);
			continue;
		}
		if (ids.has(id)) {
			fail(errors, `Plan : identifiant dupliqué « ${id} ».`);
			continue;
		}
		if (!title) {
			fail(errors, `Plan, nœud « ${id} » : titre manquant.`);
			continue;
		}
		ids.add(id);
		nodes.push({ id, title, summary: text(item.summary, 500) });
	}
	if (nodes.length < 1) fail(errors, "Le plan doit contenir au moins un nœud.");

	const rawEdges = Array.isArray(source.edges) ? source.edges : [];
	const edges = [];
	const seenEdges = new Set();
	for (const item of rawEdges) {
		const from = slugify(Array.isArray(item) ? item[0] : item?.from);
		const to = slugify(Array.isArray(item) ? item[1] : item?.to);
		if (!from || !to) {
			warnings.push("Arête de plan ignorée : extrémité manquante.");
			continue;
		}
		if (from === to) {
			fail(errors, `Plan : l'arête ${from} -> ${to} est une boucle.`);
			continue;
		}
		if (!ids.has(from) || !ids.has(to)) {
			warnings.push(`Arête de plan ignorée : nœud inconnu (${from} -> ${to}).`);
			continue;
		}
		const key = `${from}->${to}`;
		if (seenEdges.has(key)) continue;
		seenEdges.add(key);
		edges.push({ from, to });
	}

	const plan = { nodes, edges };
	if (!planLayers(plan)) fail(errors, "Le plan contient un cycle de dépendances.");
	const goalNodeId = slugify(source.goalNodeId);
	if (goalNodeId && !ids.has(goalNodeId)) {
		warnings.push("Nœud objectif du plan inconnu : ignoré.");
	}
	if (goalNodeId && ids.has(goalNodeId)) plan.goalNodeId = goalNodeId;
	return plan;
}

function normalizeCheck(raw, stepIndex, errors) {
	const source = isObj(raw) ? raw : {};
	const question = text(source.question ?? source.prompt, 1000);
	const options = Array.isArray(source.options) ? source.options.map(optionText).filter(Boolean).slice(0, 6) : [];
	const explanation = text(source.explanation ?? source.why, 2000);
	if (!question) fail(errors, `Étape ${stepIndex + 1} : vérification sans énoncé.`);
	if (options.length < 2) fail(errors, `Étape ${stepIndex + 1} : la vérification a besoin d'au moins deux options.`);
	let correctIndex =
		source.correctIndex === undefined || source.correctIndex === null || source.correctIndex === ""
			? Number.NaN
			: Number(source.correctIndex);
	if (!Number.isInteger(correctIndex)) {
		const answer = text(source.correctAnswer ?? source.answer, 500);
		correctIndex = options.findIndex((option) => option === answer);
	}
	if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
		fail(errors, `Étape ${stepIndex + 1} : correctIndex invalide.`);
		correctIndex = 0;
	}
	return { question, options, correctIndex, explanation };
}

function normalizePractice(raw, errors) {
	const source = isObj(raw) ? raw : {};
	const statement = text(source.statement ?? source.problem, 2000);
	const solution = text(source.solution ?? source.modelSolution, 4000);
	if (!statement) fail(errors, "Exercice : énoncé manquant.");
	if (!solution) fail(errors, "Exercice : solution manquante.");
	if (!statement || !solution) return null;
	const mode = ["recall", "discrimination", "composition"].includes(source.mode) ? source.mode : "recall";
	return {
		id: text(source.id, 80) || `practice-${Date.now()}`,
		statement,
		mode,
		targets: stringList(source.targets ?? source.target, 8, 120),
		hints: stringList(source.hints, 5, 600),
		solution,
	};
}

/** Valide et normalise une leçon complète. */
export function validateLesson(input) {
	const errors = [];
	const warnings = [];
	if (!isObj(input)) {
		return { ok: false, errors: ["La réponse du modèle n'est pas un objet JSON."], lesson: null, warnings };
	}

	const topic = text(input.topic ?? input.title, 300);
	const title = text(input.title ?? input.topic, 300);
	const goal = text(input.goal, 1000);
	if (!topic) fail(errors, "Sujet manquant.");
	if (!title) fail(errors, "Titre manquant.");
	if (!goal) fail(errors, "Objectif manquant.");

	const plan = normalizePlan(input.plan, errors, warnings);

	const rawSteps = Array.isArray(input.steps) ? input.steps : [];
	if (!rawSteps.length) fail(errors, "La leçon doit contenir au moins une étape.");
	if (rawSteps.length > MAX_STEPS) fail(errors, `Trop d'étapes (${rawSteps.length}, maximum ${MAX_STEPS}).`);

	const propositions = new Map();
	const steps = [];
	const stepIds = new Set();
	const planIds = new Set(plan.nodes.map((n) => n.id));

	const addProposition = (raw, context) => {
		const source = isObj(raw) ? raw : {};
		const id = text(source.id, 80);
		const name = text(source.name, 160);
		const statement = text(source.statement, 1200);
		if (!id || !name || !statement) {
			fail(errors, `${context} : proposition incomplète (id, name, statement requis).`);
			return null;
		}
		const existing = propositions.get(id);
		if (existing) {
			if (existing.statement !== statement) {
				warnings.push(`Proposition « ${id} » redéfinie : la première version est conservée.`);
			}
			return existing;
		}
		const proposition = { id, name, statement };
		propositions.set(id, proposition);
		return proposition;
	};

	for (const [index, raw] of rawSteps.entries()) {
		if (!isObj(raw)) {
			fail(errors, `Étape ${index + 1} : objet attendu.`);
			continue;
		}
		const id = text(raw.id, 80) || `step-${index + 1}`;
		if (stepIds.has(id)) {
			fail(errors, `Étape : identifiant dupliqué « ${id} ».`);
			continue;
		}
		stepIds.add(id);
		const proposition = addProposition(raw.proposition, `Étape ${index + 1}`);
		const nodeId = slugify(raw.nodeId ?? raw.node);
		if (!nodeId || !planIds.has(nodeId)) {
			fail(errors, `Étape ${index + 1} : nodeId absent du plan (${nodeId || "vide"}).`);
		}
		const teach = text(raw.teach ?? raw.explanation ?? raw.content, 9000);
		if (!teach) fail(errors, `Étape ${index + 1} : texte d'enseignement manquant.`);
		const repair = text(raw.repair, 5000);
		if (!repair) fail(errors, `Étape ${index + 1} : réparation manquante.`);
		const check = normalizeCheck(raw.check, index, errors);
		let kind = raw.kind === "foundation" ? "foundation" : "derivation";
		const rawPremises = stringList(raw.premises, 8, 80);
		const premises = rawPremises.filter((premise) => premise !== proposition?.id);
		if (!rawPremises.length) kind = "foundation";
		else if (kind === "foundation") kind = "derivation";
		if (!proposition || !teach || !repair) continue;
		steps.push({
			id,
			title: text(raw.title ?? proposition.name, 200),
			kind,
			nodeId,
			premises,
			proposition,
			teach,
			check,
			repair,
		});
	}

	if (steps.length !== rawSteps.length) {
		fail(errors, "Certaines étapes sont inutilisables : la leçon est refusée.");
	}

	// Graphe fourni par le modèle : on le fusionne avec les propositions des étapes.
	const graphSource = isObj(input.graph) ? input.graph : {};
	const graphProps = Array.isArray(graphSource.propositions) ? graphSource.propositions : [];
	for (const [index, raw] of graphProps.entries()) {
		addProposition(raw, `Graphe, proposition ${index + 1}`);
	}

	// Une prémisse peut référencer une proposition déclarée seulement dans le
	// graphe : la validation finale a lieu après la fusion.
	for (const [index, step] of steps.entries()) {
		const kept = step.premises.filter((premise) => propositions.has(premise) && premise !== step.proposition.id);
		if (kept.length !== step.premises.length) {
			warnings.push(`Étape ${index + 1} : prémisse non résolue retirée.`);
		}
		step.premises = kept;
		if (step.kind === "derivation" && !kept.length) {
			warnings.push(`Étape ${index + 1} : dérivation sans prémisse, traitée comme fondation.`);
			step.kind = "foundation";
		}
	}

	const rawChains = Array.isArray(graphSource.chains) ? graphSource.chains : [];
	const chains = [];
	for (const [index, raw] of rawChains.entries()) {
		const source = isObj(raw) ? raw : {};
		const premises = stringList(source.premises, 8, 80);
		const conclusion = text(source.conclusion, 80);
		if (!premises.length || !conclusion) {
			warnings.push(`Chaîne ${index + 1} ignorée : prémisses ou conclusion manquantes.`);
			continue;
		}
		if (!propositions.has(conclusion) || premises.some((p) => !propositions.has(p))) {
			warnings.push(`Chaîne ${index + 1} ignorée : proposition inconnue.`);
			continue;
		}
		chains.push({
			id: text(source.id, 80) || `chain-${index + 1}`,
			premises,
			conclusion,
		});
	}

	const rawPractice = Array.isArray(input.practice) ? input.practice : [];
	const practice = [];
	for (const raw of rawPractice.slice(0, 6)) {
		const item = normalizePractice(raw, errors);
		if (item) practice.push(item);
	}

	let goalPropositionId = text(input.goalPropositionId, 80);
	if (goalPropositionId && !propositions.has(goalPropositionId)) {
		warnings.push("Proposition objectif inconnue : dernière proposition utilisée.");
		goalPropositionId = "";
	}
	if (!goalPropositionId && steps.length) goalPropositionId = steps.at(-1).proposition.id;

	const assumptions = stringList(input.assumptions, 10, 400);
	const summary = text(input.summary, 1200) || goal;

	if (errors.length) {
		return { ok: false, errors, lesson: null, warnings };
	}

	const lesson = {
		schemaVersion: LESSON_VERSION,
		topic,
		title,
		goal,
		summary,
		level: text(input.level, 80),
		assumptions,
		goalPropositionId,
		plan,
		steps,
		practice,
		graph: { propositions: [...propositions.values()], chains },
	};

	return { ok: true, errors: [], lesson, warnings };
}
