# CLAUDE.md — Guide de session

> Lis ce fichier en premier à chaque nouvelle session sur ce projet. Il évite les erreurs les plus coûteuses (casser le déploiement Vercel, perdre des données Supabase, refaire du travail déjà fait).

## L'utilisateur

- **Hugo Bette**, étudiant en médecine, **pas développeur**.
- Il ne modifie pas de fichiers à la main. Tu fais tout. Tu commits, tu push.
- Réponses en **français**, ton direct, pas de jargon inutile.
- À la fin d'une tâche, tu dis ce qu'il a à faire (un clic, une commande à coller) — rien d'autre.

## Pile et déploiement

```
src JSX/React  →  npm run build  →  dist/  →  git push  →  Vercel auto-deploy
```

- **Stack** : Vite 8 + React 19 + Tailwind v3 (PAS v4). PostCSS + autoprefixer.
- **Repo GitHub** : https://github.com/h23902390/QCM-quizz (branche `main`)
- **Hébergement** : **Vercel**, branché sur le repo. Tout push sur `main` → redéploiement automatique en ~1 min. Pas de CLI Vercel à utiliser.
- **Backend** : **Supabase** (auth email/password + table `decks` avec RLS). Schéma dans `supabase-schema.sql`.
- **APIs externes** : OpenAI (chat completions, Whisper). La clé est saisie par l'utilisateur dans l'UI, stockée en `localStorage` (et synchronisée sur le user_metadata Supabase quand connecté). **Jamais en dur dans le code.**

### Variables d'environnement

Définies sur Vercel (Project Settings → Environment Variables) **et** en local (`.env.local`, gitignoré) :

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

Si elles manquent, l'app fonctionne en mode local-only (cf. `supabaseEnabled` dans `src/lib/supabase.js`).

## Structure du projet

```
qcm-quiz/
├── src/
│   ├── App.jsx              ← TOUT le UI (~2000 lignes — QCM, ECOS, auth, decks)
│   ├── main.jsx             ← entry point Vite
│   ├── index.css            ← directives Tailwind
│   ├── ecosCases.js         ← métadonnées des cas ECOS intégrés
│   ├── ecosBuiltInRaw.js    ← texte brut extrait des 132 PDF Fac (généré)
│   └── lib/
│       └── supabase.js      ← client + helpers decks/auth
├── ECOS/                    ← PDF Fac (sources des cas ECOS intégrés)
├── scripts/
│   ├── buildEcosFromPdfs.mjs    ← régénère ecosBuiltInRaw.js depuis ECOS/*.pdf
│   └── split120Ecos.mjs         ← split du méga-PDF "120 ECOS"
├── public/                  ← assets servis tels quels (favicon, icons)
├── supabase-schema.sql      ← à coller dans Supabase SQL Editor une seule fois
├── tailwind.config.js
├── postcss.config.js
└── .env.example
```

**Note** : `App.jsx` est gros et monolithique. C'est volontaire — Hugo préfère un seul fichier qu'une jungle d'imports. Ne le splitte pas sans accord explicite.

## Modes de l'application

L'app a aujourd'hui 2 outils :

1. **QCM/QROC** — extrait des questions d'un PDF de cours corrigé (détection couleur verte = bonne réponse), quiz interactif, évaluation IA des QROC, sauvegarde de decks Supabase.
2. **ECOS** — simulation de patient (chat OpenAI), dictée vocale (Whisper), timer, 132 cas Fac intégrés + import de PDF custom.

Ils partagent : auth Supabase, clé API OpenAI, modèle, Réglages.

## Commandes utiles

```bash
npm install              # après pull, si node_modules out of sync
npm run dev              # dev server (port 5173, fallback auto)
npm run build            # vérifie qu'on peut deployer (DOIT passer avant push)
npm run lint             # ESLint

node scripts/buildEcosFromPdfs.mjs   # régénère les cas ECOS intégrés
```

## Workflow standard pour modifier le code

1. **Lire** les fichiers concernés (Read tool).
2. **Modifier** (Edit/Write).
3. **`npm run build`** — si erreur, corriger immédiatement, pas demander.
4. `git add -A && git commit -m "..." && git push` — Vercel redéploie tout seul.
5. Dire à Hugo en 2 lignes : ce qui a changé, ce qu'il a à faire (souvent rien — juste attendre 1 min).

**Auteur git** (à passer en `-c`, le user.name/email global n'est pas configuré) :
```
git -c user.email=hugobettem0@gmail.com -c user.name="Hugo Bette" commit -m "..."
```

## Règles dures

- ❌ **Pas de clé API en dur** dans le code, jamais. Saisie utilisateur, stockée en localStorage / user_metadata.
- ❌ **Pas Tailwind v4**. v3 uniquement (les classes utilitaires de l'app sont du v3).
- ❌ **Pas de `--no-verify`**, pas de force-push sur `main`.
- ❌ Ne pas réécrire des fichiers que Hugo vient de modifier (regarde les system-reminders « modified by user »).
- ✅ Travailler de façon **autonome**. Ne poser de question QUE si vraiment bloqué.
- ✅ `npm run build` passe sans erreur **avant** de commit.
- ✅ Commits descriptifs en français, ASCII (Windows / encoding parfois capricieux).

## Bugs / pièges connus

- **Encoding Git Bash sous Windows** : warnings `LF will be replaced by CRLF` à ignorer.
- **PDF.js depuis CDN** au runtime (pas en bundle), pour limiter la taille du build. Voir `useEffect` au début de App.jsx.
- **localStorage est synchrone** — l'app a été migrée depuis `window.storage` (API claude.ai) vers `localStorage`. Si tu vois des `await` sur du storage local, c'est un résidu à nettoyer.
- **Détection couleur QCM** : seuil bbox + classification 3 catégories (white / black / green / other) — voir `classifyPixel` et `detectGreenOptions` dans App.jsx. Si Hugo dit « ça détecte mal », c'est probablement les seuils à ajuster.
- **Format option** : la regex accepte `A.`, `A)`, `A-`, `A:`, `A/` en majuscules ou minuscules. Voir `findOptionMarkers`.
- **ECOS PDF** : extraction texte robuste, classification du brief patient, timer auto-stop quand temps écoulé. Le texte brut des 132 cas Fac est pré-extrait dans `ecosBuiltInRaw.js`.

## Dépendances clés à NE PAS toucher sans raison

| Lib | Pourquoi |
|---|---|
| react@19 | Hugo l'a accepté tel quel, pas de raison de downgrade |
| vite@8 | idem |
| tailwindcss@3.4.x | v4 casserait toutes les classes |
| @supabase/supabase-js | client backend |
| pdfjs-dist | utilisé seulement par les scripts node, pas par le bundle |

## Déléguer avec des sous-agents

Pour les tâches longues ou parallélisables, utilise l'outil `Agent` (sub-agents) plutôt que tout faire en série. Cela libère ta fenêtre de contexte et permet de faire plusieurs choses en même temps.

### Quand spawn un agent

- **Recherche dans le code** ouverte ou multi-fichiers → `subagent_type: "Explore"` (read-only, rapide). Ex: « trouve tous les endroits qui appellent l'API OpenAI ».
- **Plan d'implémentation** d'une feature non triviale → `subagent_type: "Plan"`. Il rend un plan, tu exécutes.
- **Tâches indépendantes en parallèle** → plusieurs `Agent` en un seul message (pas en série). Ex : « pendant qu'un agent ajoute la feature X, un autre vérifie l'accessibilité de la page Y ».
- **Tâches longues** (build complet, migration de données, scrape de PDF) → `run_in_background: true`. Tu reçois une notification quand ça finit.

### Quand NE PAS spawn

- Lecture d'un fichier précis dont tu connais le chemin → utilise `Read` direct.
- Recherche d'un symbole précis → `Grep` direct.
- Modif évidente et locale → fais-la toi-même, c'est plus rapide.

### Format du prompt envoyé à l'agent

Un agent ne voit RIEN de la conversation en cours. Le prompt doit être autonome :

- Objectif clair (« vérifier que X marche », pas « regarde un peu »)
- Contexte minimal nécessaire (chemins de fichiers, ce qui a déjà été essayé)
- Format de retour attendu (« réponds en moins de 200 mots », « liste les fichiers concernés »)

Exemple type :

> « Audite le fichier `src/App.jsx` pour les références restantes à `window.storage` (l'ancien backend claude.ai qu'on a remplacé par localStorage). Pour chaque occurrence, donne le numéro de ligne et l'extrait. Ne modifie rien. Réponds en liste. »

### Workflow type pour une grosse feature

1. Spawn `Plan` agent → reçoit plan en étapes.
2. Tu valides / ajustes avec Hugo si besoin.
3. Pour chaque étape lourde mais isolée : spawn un agent (général ou spécialisé) avec un prompt complet.
4. Tu intègres / commits / push toi-même.

## TL;DR pour la prochaine session

1. Lire ce fichier.
2. Lire `git log --oneline -10` pour voir où on en est.
3. Si Hugo demande une feature : modifier App.jsx (le plus souvent), `npm run build`, push, lui dire « c'est en ligne dans 1 min ».
4. Si Hugo demande un truc gros et structuré : déléguer à des agents en parallèle.
