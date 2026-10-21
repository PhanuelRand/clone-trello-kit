# Votre outil de travail en équipe

Ce dépôt est le vôtre. Vous y construisez, module après module, un outil de
travail en équipe à la manière de Trello : une équipe range ses tâches sur un
tableau, en listes et en cartes, invite ses membres, glisse les cartes à mesure
que le travail avance, et voit les changements des autres en direct. À la fin,
l'outil est en ligne et vous pouvez en donner l'adresse à une association, une
coopérative ou une petite entreprise.

Le cours de chaque module est sur le portail de l'Académie. Ce fichier vous
sert à vous repérer dans le dépôt.

## Par où commencer

Suivez le module 1 sur le portail. En résumé :

1. Installez les dépendances, à la racine du dépôt :

   ```bash
   npm install
   ```

2. Ouvrez `src/academie/module-1.ts` et remplacez le texte du gabarit par vos
   réponses.
3. Rédigez votre spécification dans `docs/specification.md`.
4. Lancez la vérification du module 1 :

   ```bash
   npm run academie 1
   ```

5. Enregistrez votre travail et envoyez-le sur GitHub. La même vérification
   tourne alors dans l'onglet **Actions** de votre dépôt.

## Ce que contient votre dépôt

| Chemin | Rôle |
| --- | --- |
| `src/` | Votre serveur (l'API), écrit avec Hono. Les routes vont dans `src/app.ts` |
| `src/academie/` | Vos fichiers traducteurs, un par module : ils disent aux vérifications où trouver votre code |
| `web/` | Votre interface, en React, avec des composants prêts à l'emploi |
| `migrations/` | Vos fichiers SQL, qui créent les tables de votre base (à partir du module 2) |
| `docs/` | Votre spécification, et les décisions de votre projet |
| `academie/` | Les vérifications de l'Académie. **Ne les modifiez jamais** |
| `AGENTS.md` | Les règles que doit suivre votre assistant IA dans ce dépôt |

## Les commandes

À lancer depuis la racine du dépôt.

| Commande | Ce qu'elle fait |
| --- | --- |
| `npm run academie N` | Lance les vérifications jusqu'au module N. Remplacez N par un numéro |
| `npm run academie N -- --seul` | Relance la seule suite du module N, pour relire un échec. Ne valide pas le module |
| `npm run typecheck` | Vérifie les types de votre serveur. Les vérifications ne le font pas : lancez-le avant chaque envoi |
| `npm run migrate` | Crée ou met à jour les tables de votre base (à partir du module 2) |
| `npm run dev` | Démarre votre serveur sur http://localhost:3000 |
| `npm run web:install` | Installe l'interface (une fois, à partir du module 3) |
| `npm run dev:web` | Démarre votre interface sur http://localhost:5173 |
| `npm test` | Lance vos propres tests, ceux de `src/` (module 14) |

Le serveur et l'interface sont deux applications distinctes. Pour travailler sur
les deux, ouvrez deux terminaux : `npm run dev` dans le premier,
`npm run dev:web` dans le second.

## Les réglages de votre machine

À partir du module 2, votre serveur a besoin de l'adresse de votre base. Copiez
`.env.example` en `.env`, puis remplissez-le. Le fichier `.env` reste sur votre
ordinateur : il n'est jamais envoyé sur GitHub.

`DATABASE_URL_VERIFICATION` désigne une seconde base, où `npm run academie`
crée ses tableaux et ses cartes d'essai. Votre application, sur `DATABASE_URL`,
reste ainsi propre.

## Quand une vérification échoue

Lisez le message : il dit ce qui manque, en français. Corrigez votre code, puis
relancez `npm run academie N`.

Pour ne relancer que la suite du module en cours, écrivez
`npm run academie N -- --seul`. Ne lancez jamais `npx vitest` directement sur
`academie/checks/` : sans le lanceur, `.env` n'est pas lu, et les données
d'essai iraient dans la base de votre application au lieu de la base des
vérifications.

Ne modifiez jamais les fichiers de `academie/`. Votre travail serait peut-être
juste, mais votre remise partirait en relecture par un mentor, ce qui la
ralentit.

## Les modules 16, 17 et 18

Les automatisations et le tableau de bord sont réservés au palier Platine. Le
module 18, l'extra visuel, est vendu à part. Si vous ne les avez pas choisis,
leurs vérifications restent rouges dans l'onglet Actions : c'est normal, elles
ne concernent pas votre parcours.

## Déploiement sur une seule adresse

Une fois en ligne (module 15), un seul service sert l'interface React compilée et
l'API Hono, sur une seule adresse. `npm run build` construit l'interface,
`npm start` applique les migrations puis démarre le serveur. Il peut aussi
démarrer un PostgreSQL local. Voir [DEPLOIEMENT.md](./DEPLOIEMENT.md).
