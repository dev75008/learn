# Base de savoir

Une page statique pour GitHub Pages : tu saisis un sujet, la page le sonde, le planifie et le présente comme une leçon — un pas de raisonnement à la fois, chaque pas vérifié. Les sujets restent dans le navigateur et forment une base consultable.

Méthode adaptée de [LearnHarness](https://github.com/amosblomqvist/learnharness). Moteur IA : [FreeLLMAPI](https://github.com/tashfeenahmed/freellmapi), auto-hébergé.

## La méthode en bref

1. **Mesurer.** Un court sondage situe la frontière de ta compréhension sur les dépendances du sujet. Une erreur n'est pas une note : c'est la coordonnée de départ.
2. **Planifier.** Le modèle cherche l'arbre minimal de dépendances entre ce que tu tiens déjà et l'objectif. Rien d'inutile, rien de déjà su.
3. **Enseigner.** Chaque étape ajoute **une seule** proposition, dérivée d'une ou plusieurs propositions déjà tenues. Une fondation est énoncée comme vraie, sans réserve. Le pas se termine par une vérification ; une erreur déclenche une réparation avant de continuer.
4. **Pratiquer.** Des exercices séparés demandent de retrouver la connaissance sans qu'elle soit nommée.

Le but n'est pas la récitation : c'est que l'objectif paraisse évidemment vrai, dérivable de la structure.

## Moteur : FreeLLMAPI

La page appelle directement une instance FreeLLMAPI, compatible OpenAI :

```text
POST https://ton-instance/v1/chat/completions
Authorization: Bearer freellmapi-…
model: auto
```

FreeLLMAPI est un routeur local qui agrège les offres gratuites de plusieurs fournisseurs. Il faut donc :

1. Installer et lancer FreeLLMAPI.
2. Ajouter tes clés de fournisseurs dans son tableau de bord.
3. Récupérer sa **clé unifiée** (`freellmapi-…`).
4. Renseigner l'URL et la clé dans **Réglages** sur cette page.

La page ne contient aucune clé et n'appelle aucun autre service. Le seul appel réseau vers un modèle va à ton instance FreeLLMAPI.

### Point bloquant : GitHub Pages → localhost

Une page servie en HTTPS sur GitHub Pages ne peut pas appeler `http://localhost:3001` de façon fiable : Chrome bloque les requêtes d'un site public vers l'espace local (Private Network Access).

Deux solutions :

- **Recommandé : tunnel HTTPS.** Expose FreeLLMAPI avec un tunnel (Cloudflare Tunnel, ngrok, Tailscale Funnel, VPS avec Caddy). L'URL devient `https://….example/v1`, et le problème disparaît.
- **Test local.** Sers la page en `http://localhost:8000` : l'appel direct vers `http://localhost:3001/v1` reste dans le même espace local.

### Configuration FreeLLMAPI

Dans le `.env` de FreeLLMAPI, autorise l'origine GitHub Pages :

```env
DASHBOARD_ORIGINS=https://dev75008.github.io
```

Puis redémarre FreeLLMAPI. Pour un test local, ajoute aussi :

```env
DASHBOARD_ORIGINS=https://dev75008.github.io,http://localhost:8000
```

Exemple de tunnel Cloudflare :

```bash
cloudflared tunnel --url http://localhost:3001
```

Copie l'URL `https://….trycloudflare.com`, ajoute `/v1`, et mets-la dans **Réglages**.

Un tunnel public expose FreeLLMAPI : la clé unifiée protège l'accès, mais ne partage pas l'URL et arrête le tunnel après usage.

## Lancer en local

```bash
cd learn
python -m http.server 8000
```

Ouvrir `http://localhost:8000/`.

Dans FreeLLMAPI, `DASHBOARD_ORIGINS=http://localhost:8000`. Dans la page : URL `http://localhost:3001/v1`, modèle `auto`, clé unifiée.

Tests :

```bash
npm test
```

## Activer GitHub Pages

Le dépôt est déjà publié sur `main`. Pour redéployer après une modification :

```bash
git push
```

GitHub Pages se déclenche sur `main`. Vérifier **Settings → Pages** : source `Deploy from a branch`, branche `main`, dossier `/ (root)`.

URL : `https://dev75008.github.io/learn/`.

`.nojekyll` est présent. Aucun workflow n'est nécessaire.

## Utiliser

1. Ouvrir **Réglages**.
2. Renseigner l'URL FreeLLMAPI, le modèle (`auto` ou `auto:smart`) et la clé unifiée.
3. **Tester la connexion** : le nombre de modèles du catalogue s'affiche.
4. **Enregistrer**.
5. **Nouveau** → sujet → **Construire la leçon**.

La page gère les deux phases : sondage, puis leçon. Le plan s'affiche avant le premier pas. Chaque vérification doit être correcte avant de passer au pas suivant. Une erreur affiche la réparation.

La leçon d'exemple **Pourquoi la dérivée de x² vaut 2x** fonctionne sans FreeLLMAPI.

## Stockage et sécurité

- Clé unifiée : `sessionStorage` par défaut, `localStorage` si « Mémoriser » est coché. Jamais dans le dépôt, jamais dans les exports.
- Sujets : `localStorage`, export/import JSON.
- FreeLLMAPI : tes clés de fournisseurs restent dans sa base SQLite chiffrée, pas dans cette page.
- Ne commit pas le `.env` de FreeLLMAPI.
- Un tunnel public doit être arrêté après usage.

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
- `assets/freellmapi.js` — client FreeLLMAPI, erreurs, test de connexion.
- `assets/schema.js` — validation/normalisation des leçons et du sondage.
- `assets/prompts.js` — prompts adaptés de LearnHarness.
- `assets/parse.js` — extraction du JSON de réponse.
- `assets/store.js` — stockage local, clé, import/export.
- `assets/markdown.js` — rendu Markdown échappé.
- `assets/app.css` — styles clair/sombre, responsive.
- `data/index.json`, `data/topics/derivee-x-carre.json` — exemple.
- `docs/freellmapi.md` — installation et dépannage.
- `tests/` — schéma, prompts, client FreeLLMAPI, imports.

## Licence

AGPL-3.0. La méthode, la structure des prompts et le modèle de données sont adaptés de LearnHarness, également sous AGPL-3.0. Voir [NOTICE.md](NOTICE.md).

FreeLLMAPI est un projet distinct, sous licence MIT ; cette page n'est pas affiliée à FreeLLMAPI.
