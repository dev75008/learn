# Attribution et licence

Ce projet adapte la méthode d'enseignement, la structure des prompts et le modèle de données de **LearnHarness** :

- Source : https://github.com/amosblomqvist/learnharness
- Commit de référence : `cb25c8e49b85eed9e78315584731cad73a0118a6` (2026-11-12)
- Licence : GNU Affero General Public License v3.0 (`LICENSE`)

Fichiers adaptés :

- `assets/prompts.js` — compression de `src/agent/system-prompt.md`, `src/agent/prompts/prober/10-probe-doctrine.md`, `src/agent/prompts/teacher/10-planning.md` et `src/agent/prompts/teacher/20-teaching.md`.
- `assets/schema.js` — modèle de plan (`src/core/contracts/plan.ts`), de sondage (`src/core/contracts/probe.ts`) et d'exercice (`src/core/practice-problems.ts`), réduit à un format JSON autonome.
- `docs/methode.md` — synthèse de `docs/teaching-methodology.md`.

Les prompts ne sont pas des copies : ils sont réécrits pour un modèle sans outils, avec deux appels (sondage, puis leçon). Le texte de la méthode, l'ordre des phases et les invariants (un pas de raisonnement, une vérification par pas, réparation avant de continuer, arbre minimal) viennent de LearnHarness.

Le présent site est distribué sous AGPL-3.0. Il n'est pas affilié à LearnHarness.
