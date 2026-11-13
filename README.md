# Base de savoir

Une page statique pour GitHub Pages : tu saisis un sujet, la page le sonde, le planifie et le présente comme une leçon — un pas de raisonnement à la fois, chaque pas vérifié. Les sujets restent dans le navigateur et forment une base consultable.

Méthode adaptée de [LearnHarness](https://github.com/amosblomqvist/learnharness). Moteur : [OpenRouter](https://openrouter.ai), avec une clé API.

## La méthode en bref

1. **Mesurer.** Un court sondage situe la frontière de ta compréhension sur les dépendances du sujet. Une erreur n'est pas une note : c'est la coordonnée de départ.
2. **Planifier.** Le modèle cherche l'arbre minimal de dépendances entre ce que tu tiens déjà et l'objectif. Rien d'inutile, rien de déjà su.
3. **Enseigner.** Chaque étape ajoute **une seule** proposition, dérivée d'une ou plusieurs propositions déjà tenues. Une fondation est énoncée comme vraie, sans réserve. Le pas se termine par une vérification ; une erreur déclenche une réparation avant de continuer.
4. **Pratiquer.** Des exercices séparés demandent de retrouver la connaissance sans qu'elle soit nommée.

Le but n'est pas la récitation : c'est que l'objectif paraisse évidemment vrai, dérivable de la structure.

## Moteur : OpenRouter

Une seule clé API. Aucun serveur à lancer, aucun tunnel.

```text
POST https://openrouter.ai/api/v1/chat/completions
Authorization: Bearer sk-or-v1-…
model: openrouter/auto
```

La page appelle OpenRouter directement depuis le navigateur. La clé n'est jamais écrite dans le dépôt. Elle est stockée en `sessionStorage` par défaut, ou `localStorage` si tu coches « Mémoriser ».

### Créer la clé

1. https://openrouter.ai/keys
2. **Create key**
3. Copier `sk-or-v1-…`
4. Ajouter du crédit si nécessaire.

**Si une clé a été collée dans un chat, un dépôt ou une issue : révoque-la immédiatement et crée-en une nouvelle.**

### Configurer le site

1. Ouvrir https://dev75008.github.io/learn/
2. **Réglages**
3. Coller la clé
4. **Tester la connexion**
5. **Enregistrer**

Le modèle est `openrouter/auto`. Il est défini dans `assets/openrouter.js` :

```js
export const OPENROUTER_MODEL = "openrouter/auto";
```

Pour forcer un modèle, remplacer cette valeur, puis redéployer.

## Utiliser

1. **Nouveau**.
2. Écrire un sujet.
3. **Construire la leçon**.
4. Le sondage s'affiche ; répondre.
5. Le plan s'affiche.
6. **Commencer**.
7. Chaque vérification doit être correcte avant le pas suivant. Une erreur affiche la réparation.
8. La pratique termine la leçon.

La leçon d'exemple **Pourquoi la dérivée de x² vaut 2x** fonctionne sans clé.

## Lancer en local

```bash
cd learn
python -m http.server 8000
```

Ouvrir `http://localhost:8000/`.

Tests :

```bash
npm test
```

## GitHub Pages

Le dépôt est publié sur `main`. Après une modification :

```bash
git push
```

Vérifier **Settings → Pages** : `Deploy from a branch`, branche `main`, dossier `/ (root)`.

URL : https://dev75008.github.io/learn/

`.nojekyll` est présent. Aucun workflow n'est nécessaire.

## Ce qui est fidèle, ce qui est simplifié

Fidèle à LearnHarness :

- deux états (compréhension actuelle, objectif), plan en arbre de dépendances ;
- une proposition par étape, fondation ou dérivation, pas de méta-narration ;
- une vérification par étape, réparation avant de continuer ;
- graphe de propositions et chaînes de raisonnement ;
- pratique séparée, sans nommer la cible.

Simplifié pour tenir dans une page statique et deux appels :

- la réparation est écrite à l'avance par le modèle, pas régénérée après ta réponse ;
- le plan n'est pas restructuré en cours de leçon ;
- la pratique n'est pas corrigée automatiquement ;
- le graphe est propre à chaque leçon, pas un graphe global fusionné entre sessions.

## Fichiers

- `index.html` — coquille de l'application.
- `favicon.svg` — icône.
- `assets/app.js` — vues, état, flux sondage → leçon → pratique.
- `assets/openrouter.js` — client OpenRouter, erreurs, test de clé.
- `assets/schema.js` — validation/normalisation des leçons et du sondage.
- `assets/prompts.js` — prompts adaptés de LearnHarness.
- `assets/parse.js` — extraction du JSON de réponse.
- `assets/store.js` — stockage local, clé, import/export.
- `assets/markdown.js` — rendu Markdown échappé.
- `assets/app.css` — styles clair/sombre, responsive.
- `data/index.json`, `data/topics/derivee-x-carre.json` — exemple.
- `docs/openrouter.md` — clé, modèle, dépannage.
- `tests/` — schéma, prompts, client OpenRouter, imports.

## Licence

AGPL-3.0. La méthode, la structure des prompts et le modèle de données sont adaptés de LearnHarness, également sous AGPL-3.0. Voir [NOTICE.md](NOTICE.md).

OpenRouter est un service distinct ; cette page n'est pas affiliée à OpenRouter.
