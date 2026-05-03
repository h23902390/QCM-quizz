# QCM / QROC — Quiz médical

Application web qui transforme un PDF de cours médical corrigé en quiz interactif.

- Détecte automatiquement les bonnes réponses (texte vert) sur les pages QCM
- Mode quiz interactif (QCM et QROC) avec correction immédiate
- Évaluation des QROC par OpenAI quand la comparaison stricte échoue

Tout tourne dans le navigateur : les PDF ne sont jamais envoyés sur un serveur. Seules les réponses QROC sont transmises à l'API OpenAI pour évaluation, et uniquement si tu as renseigné une clé.

## Lancer en local

```bash
npm install
npm run dev
```

Puis ouvre l'URL affichée dans le terminal (par défaut http://localhost:5173).

## Première utilisation

1. Clique sur **⚙ Réglages** en haut à droite
2. Colle ta clé API OpenAI (commence par `sk-...`) — elle est stockée en local dans ton navigateur, jamais envoyée ailleurs
3. Dépose ton PDF sur la page d'accueil

Sans clé OpenAI, l'app fonctionne quand même : seule la correction « tolérante » des QROC est désactivée.

## Build de production

```bash
npm run build
```

Le résultat est généré dans `dist/`.
