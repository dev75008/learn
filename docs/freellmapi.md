# FreeLLMAPI : installation et branchement

FreeLLMAPI est un routeur auto-hébergé, compatible OpenAI. Cette page l'appelle directement depuis le navigateur. Elle ne contient aucune clé de fournisseur et ne passe par aucun service tiers.

## 1. Lancer FreeLLMAPI

Le plus simple, avec Docker :

```bash
curl -fsSL https://freellmapi.co/install.sh | bash
```

Ou télécharger l'application de bureau depuis les [releases](https://github.com/tashfeenahmed/freellmapi/releases).

Ouvrir ensuite `http://localhost:3001` :

1. **Keys** → ajouter les clés des fournisseurs gratuits que tu utilises.
2. Vérifier la **Fallback Chain**.
3. Copier la **clé unifiée** (`freellmapi-…`) affichée dans l'en-tête de la page Keys.

La clé unifiée est le seul secret dont la page a besoin.

## 2. Autoriser l'origine GitHub Pages

FreeLLMAPI n'accorde pas CORS à une origine arbitraire. Dans son `.env` :

```env
DASHBOARD_ORIGINS=https://dev75008.github.io
```

Pour tester la page en local :

```env
DASHBOARD_ORIGINS=https://dev75008.github.io,http://localhost:8000
```

Redémarrer FreeLLMAPI après modification. L'origine doit être exacte : pas de slash final, pas de chemin.

## 3. Choisir une URL accessible

### Cas A — page servie en local

Page : `http://localhost:8000`. FreeLLMAPI : `http://localhost:3001`.

URL dans **Réglages** : `http://localhost:3001/v1`.

Les deux sont dans l'espace local ; pas de blocage PNA.

### Cas B — page GitHub Pages (HTTPS)

Une page publique HTTPS ne peut pas appeler `http://localhost:3001` de façon fiable. Chrome bloque la requête vers l'espace « loopback » (Private Network Access), même avec CORS.

Il faut une URL **HTTPS publique** vers FreeLLMAPI. Exemple avec Cloudflare Tunnel :

```bash
cloudflared tunnel --url http://localhost:3001
```

La commande affiche une URL du type `https://random-words.trycloudflare.com`.

Dans **Réglages** :

```text
URL de base : https://random-words.trycloudflare.com/v1
Modèle      : auto
Clé         : freellmapi-…
```

Un tunnel public expose FreeLLMAPI. La clé unifiée protège les appels, mais :

- ne partage pas l'URL ;
- arrête le tunnel après usage ;
- préfère un tunnel nommé avec Cloudflare Access, Tailscale Funnel ou un VPS privé pour un usage durable.

Si `ALLOWED_HOSTS` est défini dans FreeLLMAPI, ajoute le hostname du tunnel.

## 4. Vérifier

Dans **Réglages**, **Tester la connexion** appelle `GET /v1/models`. La page affiche le nombre de modèles du catalogue.

Puis **Nouveau → Construire la leçon**. La page fait deux appels :

1. `buildProbeMessages` → questions de sondage.
2. `buildLessonMessages` → plan + pas + vérifications + pratique.

Le premier appel utilise `max_tokens: 2200`, le second `9000`. Le modèle `auto` suit la chaîne FreeLLMAPI ; `auto:smart` privilégie le raisonnement.

## Dépannage

### `401` — clé refusée

- Copier à nouveau la clé unifiée depuis **Keys**.
- Vérifier qu'il n'y a pas d'espace avant/après.
- La clé FreeLLMAPI n'est pas la clé d'un fournisseur.

### `404` — route introuvable

- L'URL doit finir par `/v1`, pas par `/v1/chat/completions`.
- Cas accepté : `.../v1/chat/completions` (l'URL est utilisée telle quelle).

### Erreur réseau / `Failed to fetch`

- FreeLLMAPI tourne-t-il ?
- L'URL est-elle accessible depuis le navigateur ?
- `DASHBOARD_ORIGINS` contient-il exactement l'origine de la page ?
- Depuis GitHub Pages, utilises-tu bien une URL HTTPS publique, pas `localhost` ?

### `429` — quota ou débit

FreeLLMAPI bascule vers un autre fournisseur si une clé est disponible. Sinon, attends la fin de la fenêtre ou ajoute une clé dans le tableau de bord.

### JSON invalide

Le modèle n'a pas respecté le schéma. Réessaie, ou choisis un modèle plus discipliné (`auto:smart`). La page refuse la leçon et n'enregistre rien.

### Le tunnel change d'URL

Les tunnels rapides Cloudflare changent à chaque lancement. Recopie l'URL dans **Réglages**. Pour une URL stable, utilise un tunnel nommé.

## Sécurité

- La clé unifiée est dans `sessionStorage` par défaut ; `localStorage` seulement si tu coches « Mémoriser ».
- Elle n'est jamais incluse dans les exports de sujets.
- Les clés de fournisseurs restent dans la base chiffrée de FreeLLMAPI.
- Un tunnel public doit être protégé par la clé unifiée et arrêté après usage.
- FreeLLMAPI est prévu pour un usage personnel ; les conditions de chaque fournisseur s'appliquent.
