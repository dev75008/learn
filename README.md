# Base de savoir

Une page statique pour GitHub Pages : tu saisis un sujet, la page prépare un prompt pour **Ox Alpha**, tu colles la réponse, et la leçon se construit selon la méthode de [LearnHarness](https://github.com/amosblomqvist/learnharness). Les sujets restent dans ton navigateur et forment une base consultable.

Aucune clé API. Aucun routeur. Aucun appel réseau vers un modèle depuis la page.

## La méthode en bref

1. **Mesurer.** Un court sondage situe la frontière de ta compréhension sur les dépendances du sujet. Une erreur n'est pas une note : c'est la coordonnée de départ.
2. **Planifier.** Ox Alpha cherche l'arbre minimal de dépendances entre ce que tu tiens déjà et l'objectif. Rien d'inutile, rien de déjà su.
3. **Enseigner.** Chaque étape ajoute **une seule** proposition, dérivée d'une ou plusieurs propositions déjà tenues. Une fondation est énoncée comme vraie, sans réserve. Le pas se termine par une vérification ; une erreur déclenche une réparation avant de continuer.
4. **Pratiquer.** Des exercices séparés demandent de retrouver la connaissance sans qu'elle soit nommée.

Le but n'est pas la récitation : c'est que l'objectif paraisse évidemment vrai, dérivable de la structure.

## Moteur : Ox Alpha, en copier-coller

`oxalpha.com` est un chat gratuit, sans compte. Il n'expose pas d'API publique : son interface utilise un point d'accès interne protégé par CSRF et Turnstile, et ses conditions interdisent les scripts automatiques. La page ne contourne donc rien.

Le flux est explicite :

1. Tu saisis le sujet. La page fabrique le **prompt de sondage**.
2. Tu copies ce prompt dans [oxalpha.com/chat](https://oxalpha.com/chat).
3. Tu copies la réponse JSON d'Ox Alpha et tu la colles dans la page. Elle est validée.
4. Tu réponds au sondage dans la page. La page fabrique le **prompt de leçon**, avec tes réponses.
5. Même opération : copier, coller, valider. Le plan et la leçon s'affichent.

La page ne stocke aucune clé et n'envoie rien à un serveur. Le seul transfert est celui que tu fais toi-même par le presse-papiers.

Pourquoi pas une API : la route publique documentée d'Ox Alpha passe par TokenRa, qui est un **agrégateur/routeur** ; ce n'est pas le chat officiel. Le mode copier-coller est le seul qui reste fidèle à Ox Alpha, gratuit, sans clé et compatible GitHub Pages.

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

`.nojekyll` est présent : GitHub Pages sert les fichiers tels quels. Aucun workflow n'est nécessaire. Si le dépôt est privé, GitHub Pages demande un compte payant.

## Utiliser l'exemple sans Ox Alpha

La base contient une leçon toute faite : **Pourquoi la dérivée de x² vaut 2x**. Elle permet de tester le plan, les pas, les vérifications, la réparation et la pratique sans copier de prompt.

1. Ouvrir **Base**.
2. Ouvrir l'exemple.
3. **Commencer**.
4. Répondre volontairement faux à la première vérification.
5. Lire la réparation, réessayer, puis avancer.

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

Simplifié pour tenir dans une page statique et deux prompts :

- la réparation est écrite à l'avance par Ox Alpha, pas régénérée après ta réponse ;
- le plan n'est pas restructuré en cours de leçon ;
- la pratique n'est pas corrigée automatiquement ;
- le graphe est propre à chaque leçon, pas un graphe global fusionné entre sessions ;
- le sondage et la leçon passent par deux copier-coller, pas par un agent qui enchaîne seul.

Ces limites sont explicites : l'application transporte la méthode d'enseignement, pas l'agent complet.

## Fichiers

- `index.html` — coquille de l'application.
- `favicon.svg` — icône du site.
- `assets/app.js` — vues, état, flux prompt → sondage → prompt → leçon → pratique.
- `assets/schema.js` — validation/normalisation des leçons et du sondage.
- `assets/prompts.js` — prompts adaptés de LearnHarness.
- `assets/parse.js` — extraction du JSON collé.
- `assets/store.js` — stockage local, import/export.
- `assets/markdown.js` — rendu Markdown échappé.
- `assets/app.css` — styles clair/sombre, responsive.
- `data/index.json`, `data/topics/derivee-x-carre.json` — exemple.
- `tests/` — tests du schéma, du rendu, des prompts et des imports.

## Données et vie privée

- Les sujets sont dans `localStorage`. Rien n'est envoyé à un serveur par la page.
- Aucune clé API n'est demandée ni stockée.
- Le sujet et tes notes partent chez Ox Alpha seulement quand **tu** colles le prompt dans son chat.
- Évite de coller des secrets dans le champ « Ce que tu sais déjà » : ce texte fait partie du prompt.
- Les exports JSON ne contiennent que les leçons.

## Licence

AGPL-3.0. La méthode, la structure des prompts et le modèle de données sont adaptés de LearnHarness, également sous AGPL-3.0. Voir [NOTICE.md](NOTICE.md). Si tu publies une version modifiée de ce site, l'AGPL s'applique.
