# La méthode, et comment elle est implémentée

Ce document sépare ce qui relève de la **méthode** (la logique d'enseignement de LearnHarness) de ce qui relève de la **mise en forme** (le format JSON, les composants, les appels API). Il sert à vérifier la fidélité de l'implémentation.

## 1. Ce que dit la méthode

Source principale : `docs/teaching-methodology.md` de LearnHarness, complété par les prompts `prober/10-probe-doctrine.md`, `teacher/10-planning.md` et `teacher/20-teaching.md`.

- **Deux états.** Une leçon relie la compréhension actuelle (ce que l'apprenant tient pour évident) à un objectif concret. Le sondage mesure la frontière : ce qui est tenu, ce qui ne l'est pas, les misconceptions.
- **Le critère est l'évidence, pas le rappel.** L'objectif doit finir par paraître évidemment vrai, dérivable de la structure. Un fait récité mais non connecté est mémorisé, donc fragile.
- **Le savoir est un graphe.** Propositions (faits) et chaînes (prémisses qui impliquent ensemble une conclusion). Les connexions sont elles-mêmes des faits.
- **Un pas de raisonnement à la fois.** Chaque pas part de ce qui est déjà tenu et ajoute une seule inférence. Une fondation est un fait non dérivable, énoncé sans réserve ; une dérivation s'appuie sur des prémisses.
- **Arbre minimal.** Ne pas réenseigner ce qui est su, ne pas enseigner hors du chemin. Le plan est cherché, pas deviné.
- **Une vérification par pas.** Le pas qui n'a pas atterri est détecté immédiatement, localement, et réparé avant toute construction dessus.
- **Présentation au service de l'absorption.** La forme est choisie par pas. Pas de méta-narration, pas de chapitres « nœud 3 », pas de récapitulation de la structure. Le raisonnement porte la connexion.
- **La pratique est séparée.** Elle exerce le rappel et l'application sans nommer la connaissance cible.

## 2. Ce qui est mise en forme

| Élément | Choix ici | Pourquoi |
| --- | --- | --- |
| Format d'échange | JSON strict, validé | Un site statique n'a pas d'outils pour corriger un modèle ; le schéma refuse une leçon cassée. |
| Phases | 2 appels : sondage, puis leçon | Le sondage doit précéder le plan pour que la leçon parte des réponses. Chaque appel reste autoportant. |
| Transport | FreeLLMAPI, OpenAI-compatible | Un seul endpoint auto-hébergé, une clé unifiée, plusieurs fournisseurs gratuits. |
| Plan | Nœuds + arêtes `requires`, rendu par niveaux | Fidèle au graphe de dépendances, sans dépendance Mermaid. |
| Étapes | `premises` + `proposition` + `teach` + `check` + `repair` | Un pas = un fait + une vérification + une réparation. |
| Graphe | `graph.propositions`, `graph.chains` | Reprend la structure propositions/chaînes de LearnHarness. |
| Stockage | `localStorage`, export/import JSON | Compatible GitHub Pages, aucune infrastructure. |
| Clé API | Clé unifiée FreeLLMAPI, navigateur seulement | Le dépôt ne contient aucun secret. |

## 3. Schéma d'une leçon

```json
{
  "topic": "sujet court",
  "title": "titre",
  "goal": "objectif",
  "summary": "approche",
  "level": "niveau",
  "assumptions": ["déjà tenu"],
  "goalPropositionId": "p-final",
  "plan": {
    "nodes": [{ "id": "slug", "title": "repère", "summary": "phrase" }],
    "edges": [{ "from": "slug", "to": "slug" }],
    "goalNodeId": "slug"
  },
  "steps": [
    {
      "id": "s1",
      "title": "titre du pas",
      "kind": "foundation",
      "nodeId": "slug",
      "premises": [],
      "proposition": { "id": "p1", "name": "nom", "statement": "fait" },
      "teach": "Markdown",
      "check": {
        "question": "question",
        "options": ["A", "B", "C"],
        "correctIndex": 0,
        "explanation": "pourquoi"
      },
      "repair": "Markdown, autre angle"
    }
  ],
  "practice": [
    {
      "id": "ex1",
      "statement": "problème",
      "mode": "recall",
      "targets": ["p1"],
      "hints": ["indice"],
      "solution": "solution"
    }
  ],
  "graph": {
    "propositions": [{ "id": "p1", "name": "nom", "statement": "fait" }],
    "chains": [{ "premises": ["p1"], "conclusion": "p2" }]
  }
}
```

Invariants vérifiés par `assets/schema.js` :

- plan acyclique, identifiants uniques, arêtes valides ;
- étapes uniques, `nodeId` existant, une proposition par étape ;
- vérification avec au moins deux options et un `correctIndex` valide ;
- réparation non vide ;
- prémisses résolues vers des propositions connues ;
- objectif pointant vers une proposition connue.

## 4. Flux dans la page

1. **Sujet** : sujet, objectif, niveau, notes, option de sondage.
2. **Sondage** (`buildProbeMessages`) : appel `POST /v1/chat/completions` à FreeLLMAPI. Le modèle produit 3 à 5 questions, une par dépendance.
3. **Réponses** : l'apprenant répond, indique sa confiance et son raisonnement.
4. **Leçon** (`buildLessonMessages`) : second appel, avec les réponses injectées. Le modèle produit plan + pas + vérifications + réparations + exercices + graphe.
5. **Plan** : approche, carte par niveaux, liste des pas, connaissances.
6. **Pas** : proposition, enseignement, vérification. Bonne réponse → pas suivant. Mauvaise réponse ou « je ne sais pas » → réparation, puis nouvel essai. Aucun pas suivant n'est ouvert sans vérification correcte.
7. **Pratique** : indices et solution à la demande, auto-évaluation.
8. **Base** : les leçons sont enregistrées dans `localStorage`, cherchables, exportables.

## 5. Limites assumées

- FreeLLMAPI doit tourner et être joignable (CORS ; tunnel HTTPS depuis GitHub Pages).
- La réparation est pré-écrite, pas adaptée à la réponse précise.
- Le plan n'est pas réécrit pendant la leçon.
- La pratique n'est pas corrigée par le modèle.
- Chaque leçon a son graphe ; il n'y a pas de fusion globale entre leçons.
- Le modèle peut se tromper. La page ne vérifie pas les faits ; elle vérifie la structure.
- Les offres gratuites ont des quotas et des conditions propres à chaque fournisseur.

Ces limites sont le prix d'un hébergement statique et d'un routeur auto-hébergé. Le cœur de la méthode — mesure, arbre minimal, un pas vérifié à la fois, réparation avant de continuer — est conservé.
