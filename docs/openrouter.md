# OpenRouter : clé et modèle

La page utilise OpenRouter directement. Une seule clé suffit. Aucun serveur, aucun tunnel.

## 1. Créer la clé

1. Ouvrir https://openrouter.ai/keys.
2. **Create key**.
3. Copier la clé `sk-or-v1-…`.
4. Ajouter du crédit si nécessaire.

La clé reste dans le navigateur. Elle n'est jamais écrite dans le dépôt.

## 2. Configurer le site

1. Ouvrir https://dev75008.github.io/learn/
2. **Réglages**.
3. Coller la clé.
4. **Tester la connexion** : OpenRouter renvoie le libellé et le crédit restant.
5. **Enregistrer**.

Le modèle utilisé est `openrouter/auto`. OpenRouter choisit un modèle disponible selon ton crédit et les modèles activés.

## 3. Construire une leçon

**Nouveau** → sujet → **Construire la leçon**.

La page fait deux appels :

1. Sondage : 3 à 5 questions.
2. Leçon : plan, pas, vérifications, réparations, pratique.

## Dépannage

- `401` : clé incorrecte ou révoquée. Créer une nouvelle clé.
- `402` : crédit insuffisant. Ajouter du crédit ou choisir un modèle gratuit dans OpenRouter.
- `404` : modèle indisponible. `openrouter/auto` doit normalement éviter ce cas.
- `429` : débit ou quota. Attendre, ou changer de modèle.
- `Failed to fetch` : réseau, bloqueur de publicité, ou CSP. Vérifier que `openrouter.ai` n'est pas bloqué.
- JSON invalide : réessayer. `openrouter/auto` peut router vers un modèle moins discipliné.

## Modèle

`openrouter/auto` est défini dans `assets/openrouter.js` :

```js
export const OPENROUTER_MODEL = "openrouter/auto";
```

Pour forcer un modèle, remplacer cette valeur par un identifiant OpenRouter, puis redéployer. Le modèle doit accepter `response_format: json_object` ou le retry sans ce champ.

## Sécurité

- Ne colle jamais une clé dans un dépôt, un README, une issue ou un chat.
- Si une clé a été exposée, révoque-la immédiatement sur https://openrouter.ai/keys.
- La clé est en `sessionStorage` par défaut ; `localStorage` seulement si « Mémoriser » est coché.
- Les exports de sujets ne contiennent jamais la clé.
