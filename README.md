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

## Comptes & sauvegarde (Supabase)

L'app supporte des comptes pour conserver tes decks de QCM et tes questions favorites entre tes appareils.

### 1. Créer le projet Supabase

1. [supabase.com](https://supabase.com) → New project (gratuit)
2. SQL Editor → New query → copie-colle le contenu de `supabase-schema.sql` → Run
3. Project Settings → API → copie `Project URL` et `anon public key`

### 2. Variables d'environnement

Crée un fichier `.env.local` à la racine (basé sur `.env.example`) :

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

Sur Vercel : Project Settings → Environment Variables, ajoute les deux mêmes variables et redéploie.

### 3. Utilisation

- **Connexion** dans le header → crée un compte (email + mot de passe)
- Ta clé API OpenAI est synchronisée sur ton compte
- Après extraction d'un PDF, clique **Sauvegarder ce deck**
- Marque les questions importantes en favori avec l'étoile ★
- **Mes decks** liste tes decks ; **★ Quiz sur mes favoris** te ré-interroge sur toutes les questions favorites, tous decks confondus

L'app reste utilisable sans Supabase configuré (mode local-only).

## Build de production

```bash
npm run build
```

Le résultat est généré dans `dist/`.
