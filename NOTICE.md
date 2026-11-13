# Attribution et licence

Ce projet adapte la méthode d'enseignement, la structure des prompts et le modèle de données de **LearnHarness** :

- Source : https://github.com/amosblomqvist/learnharness
- Commit de référence : `cb25c8e49b85eed9e78315584731cad73a0118a6` (2026-11-12)
- Licence : GNU Affero General Public License v3.0 (`LICENSE`)

Fichiers adaptés :

- `assets/prompts.js` — compression de `src/agent/system-prompt.md`, `src/agent/prompts/prober/10-probe-doctrine.md`, `src/agent/prompts/teacher/10-planning.md` et `src/agent/prompts/teacher/20-teaching.md`.
- `assets/schema.js` — modèle de plan (`src/core/contracts/plan.ts`), de sondage (`src/core/contracts/probe.ts`) et d'exercice (`src/core/practice-problems.ts`), réduit à un format JSON autonome.
- `docs/methode.md` — synthèse de `docs/teaching-methodology.md`.

Les prompts ne sont pas des copies : ils sont réécrits pour un modèle sans outils et pour un transport manuel (copier-coller). Le texte de la méthode, l'ordre des phases et les invariants (un pas de raisonnement, une vérification par pas, réparation avant de continuer, arbre minimal) viennent de LearnHarness.

## Ox Alpha

Le moteur est le chat **Ox Alpha** (`https://oxalpha.com/chat`), utilisé par copier-coller. Ce projet n'est pas affilié à Ox Alpha. Il n'utilise ni API officielle — il n'y en a pas de publique — ni point d'accès interne, ni contournement de CSRF/Turnstile.

Le présent site est distribué sous AGPL-3.0. Il n'est pas affilié à LearnHarness.
