# Base de savoir

Une page statique pour GitHub Pages : tu saisis un sujet, l'application le sonde, le planifie et le présente comme une leçon — un pas de raisonnement à la fois, chaque pas vérifié. Les sujets construits restent dans le navigateur et forment une base consultable.

La méthode est adaptée de [LearnHarness](https://github.com/amosblomqvist/learnharness) (AGPL-3.0). Voir [NOTICE.md](NOTICE.md) et [docs/methode.md](docs/methode.md).

## La méthode en bref

1. **Mesurer.** Un court sondage situe la frontière de ta compréhension sur les dépendances du sujet. Une erreur n'est pas une note : c'est la coordonnée de départ.
2. **Planifier.** Le modèle cherche l'arbre minimal de dépendances entre ce que tu tiens déjà et l'objectif. Rien d'inutile, rien de déjà su.
3. **Enseigner.** Chaque étape ajoute **une seule** proposition, dérivée d'une ou plusieurs propositions déjà tenues. Une fondation est énoncée comme vraie, sans réserve. Le pas se termine par une vérification ; une erreur déclenche une réparation avant de continuer.
4. **Pratiquer.** Des exercices séparés demandent de retrouver la connaissance sans qu'elle soit nommée.

Le but n'est pas la récitation : c'est que l'objectif paraisse évidemment vrai, dérivable de la structure.

## Choix technique

Le site est **100 % statique** (HTML, CSS, modules JavaScript, aucun build). Pour l'IA, il appelle directement une API compatible OpenAI depuis le navigateur, avec **ta clé** :

- pas de serveur à héberger, pas de secret dans le dépôt ;
- la clé reste en `sessionStorage` (onglet) par défaut, ou en `localStorage` si tu coches « Mémoriser » ;
- les sujets sont en `localStorage`, exportables et importables en JSON ;
- un exemple de leçon est fourni dans `data/`, donc la base est consultable sans clé.

C'est l'approche la plus simple compatible GitHub Pages. Elle suppose que le fournisseur autorise CORS ; OpenRouter et Groq le font. Un appel OpenAI direct depuis un navigateur peut être refusé selon le compte.

## Lancer en local

Un simple serveur statique suffit (les modules ES ne fonctionnent pas en `file://`) :

```bash
cd learn
python -m http.server 8000
# ou : npx --yes serve .
```

Ouvrir `http://localhost:8000/`.

Tests :

```bash
npm test
```

## Activer GitHub Pages

1. Pousser ces fichiers sur la branche `main` de `dev75008/learn`.
2. Dans le dépôt : **Settings → Pages**.
3. **Build and deployment → Source** : `Deploy from a branch`.
4. **Branch** : `main`, dossier `/ (root)`, puis **Save**.
5. Attendre le déploiement, puis ouvrir `https://dev75008.github.io/learn/`.

`.nojekyll` est présent : GitHub Pages sert les fichiers tels quels. Aucun workflow n'est nécessaire.

## Configurer le modèle

1. Ouvrir le site → **Réglages**.
2. Choisir un fournisseur. OpenRouter est le preset par défaut (`https://openrouter.ai/api/v1`, modèle `openrouter/auto`).
3. Coller la clé API, puis **Enregistrer**.
4. Construire un sujet. En cas d'erreur 401 : clé ou fournisseur. En cas d'erreur réseau/CORS : essayer OpenRouter ou Groq.

La clé n'est jamais incluse dans un export, ni dans `data/`, ni dans le dépôt. Ne colle pas de secret dans le champ « Ce que tu sais déjà » : ce texte part au fournisseur.

## Ajouter un sujet à la base livrée

1. Créer `data/topics/mon-sujet.json` au format d'une leçon (voir `data/topics/derivee-x-carre.json`).
2. L'ajouter à `data/index.json`.
3. Vérifier : `npm test` valide l'exemple, et la page le charge au démarrage.

Le format d'une leçon est décrit dans [docs/methode.md](docs/methode.md). Un fichier invalide est ignoré avec un message dans la console, jamais affiché à moitié.

## Ce qui est fidèle, ce qui est simplifié

Fidèle à LearnHarness :

- deux états (compréhension actuelle, objectif), plan en arbre de dépendances ;
- une proposition par étape, fondation ou dérivation, pas de méta-narration ;
- une vérification par étape, réparation avant de continuer ;
- graphe de propositions et chaînes de raisonnement ;
- pratique séparée, sans nommer la cible.

Simplifié pour tenir dans deux appels et un site statique :

- la réparation est écrite à l'avance par le modèle, pas régénérée après ta réponse ;
- le plan n'est pas restructuré en cours de leçon ;
- la pratique n'est pas corrigée automatiquement ;
- le graphe est propre à chaque leçon, pas un graphe global fusionné entre sessions.

Ces limites sont explicites : l'application ne prétend pas remplacer l'agent complet, elle en transporte la méthode d'enseignement.

## Fichiers

- `index.html` — coquille de l'application.
- `assets/app.js` — vues, état, flux sondage → plan → pas → pratique.
- `assets/schema.js` — validation/normalisation des leçons et du sondage.
- `assets/prompts.js` — prompts adaptés de LearnHarness.
- `assets/api.js` — client OpenAI-compatible, gestion des erreurs et du JSON.
- `assets/store.js` — stockage local, import/export, clé.
- `assets/markdown.js` — rendu Markdown échappé.
- `assets/app.css` — styles clair/sombre, responsive.
- `data/index.json`, `data/topics/derivee-x-carre.json` — exemple.
- `tests/` — tests du schéma, du rendu et des prompts.

## Licence

AGPL-3.0. La méthode, la structure des prompts et le modèle de données sont adaptés de LearnHarness, également sous AGPL-3.0. Si tu publies une version modifiée de ce site, l'AGPL s'applique.
