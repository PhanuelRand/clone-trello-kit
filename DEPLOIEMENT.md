# Une adresse pour votre interface et votre API

Le projet garde React/Vite et Hono. En démonstration, Hono sert le contenu de
`web/dist` et l'API sur le même port, 3000 par défaut. Aucun serveur Vite ni
Nginx ne reste actif. PostgreSQL tourne dans le même environnement, sur
`127.0.0.1:54329` uniquement. Pour Uber, PostGIS est activé dans les deux bases.

Ce modèle sert à un projet étudiant isolé avec des données fictives. Il ne
change ni les remises GitHub ni les vérifications pédagogiques et n'installe
aucun environnement étudiant dans l'API ou le worker de l'Académie.

## Préparer puis démarrer

Prérequis : Node 24, npm et PostgreSQL avec ses utilitaires (`initdb`, `psql`,
`createdb`, `pg_isready`). Uber exige aussi l'extension PostGIS correspondante.
Sur Debian, l'administrateur de l'environnement peut les installer une fois :

```sh
apt-get update
apt-get install -y postgresql postgresql-contrib postgresql-postgis
```

L'installation système exige des droits administrateur. Ensuite, dans le
dossier du projet, travaillez avec un utilisateur **non root** ayant le droit
d'écrire dans le projet et dans le dossier de données :

```sh
npm ci
npm ci --prefix web
npm run build
LOCAL_DATABASE=1 npm start
```

`npm start` charge `.env` s'il existe. `LOCAL_DATABASE=1` choisit explicitement
la base locale, même si votre ancien `.env` contient une `DATABASE_URL`.
Si les binaires PostgreSQL ne sont pas détectés, définissez `PG_BIN` avec leur
dossier, par exemple `/usr/lib/postgresql/15/bin` sur Debian Bookworm.

Le démarrage initialise la base seulement la première fois, attend qu'elle
réponde, crée deux bases distinctes (`projet` et `verification`), puis lance
les migrations si votre `package.json` déclare une commande `migrate`.
Une migration en échec bloque le démarrage. Airbnb fournit déjà cette commande;
pour les autres parcours, ajoutez-la lorsque vous écrivez vos migrations SQL.
Les rôles applicatifs ne sont pas administrateurs PostgreSQL.

L'API reçoit automatiquement `DATABASE_URL` et `DATABASE_URL_VERIFICATION`.
Ces variables appartiennent au processus démarré; elles ne sont pas exportées
dans les autres terminaux. Pour y lancer une vérification, récupérez la
connexion de la base `verification` dans `.data/connexion.json` sans la publier,
ou utilisez votre configuration locale habituelle. N'utilisez jamais la base
`projet` pour les tests pédagogiques.

Sans `LOCAL_DATABASE=1`, une `DATABASE_URL` existante utilise votre PostgreSQL
externe. Aucun serveur local n'est alors lancé ni arrêté; les migrations
restent exécutées avant l'application.

## Routes et développement

Les routes de l'API restent déclarées comme avant : `/health`, `/search`, etc.
Elles sont aussi accessibles avec le préfixe `/api`, par exemple `/api/health`.
Ne préfixez pas une seconde fois leurs déclarations. Les anciennes routes
restent prioritaires pour conserver les contrats des cours.

Le frontend lit l'adresse de l'API dans `VITE_ADRESSE_API` (fichier
`web/src/api.ts`, module 5). En développement, `npm run dev` lance l'API et
`npm run dev:web` lance Vite; `web/.env.local` garde `http://localhost:3000`, et
le proxy Vite relaie aussi `/api` vers le port 3000 (`API_PROXY_TARGET` dans
l'environnement du processus Vite pour un autre port). Au build, `vite.config.ts`
fixe `VITE_ADRESSE_API` à `/api` : en ligne, l'interface appelle sa propre
adresse, sans CORS ni réécriture. Une valeur définie dans le terminal garde la
main. Les WebSockets s'ouvrent sur la même adresse que la page, sur le chemin
historique sans `/api` (par exemple `wss://votre-application/rides/42/direct`) :
`@hono/node-ws` répond avec l'application de `src/app.ts`. Le cookie de session
voyage avec eux; aucun ticket ni adresse directe n'est nécessaire.

Les rechargements d'une page React servent `index.html`. Les routes `/api`
inconnues, les ressources manquantes et les requêtes JSON restent des 404.
N'utilisez pas pour une page React un chemin déjà réservé par l'API historique.

## Upstash Box

Préparez les dépendances, PostgreSQL/PostGIS et le frontend **avant** de prendre
le snapshot de départ. Utilisez un utilisateur non privilégié pour le démarrage;
si le runtime fourni est root, préparez un utilisateur et les permissions du
workspace lors du provisionnement. Ne lancez pas `initdb` sous root.

Configurez comme commande d'initialisation de la Box :

```sh
LOCAL_DATABASE=1 npm start
```

Exposez uniquement le port HTTP 3000 avec une URL publique. Ne publiez pas le
port PostgreSQL. Au réveil, la commande relance PostgreSQL puis l'application
avec leurs fichiers existants; elle ne réinstalle rien et ne reconstruit rien.
Vérifiez le transport WebSocket/SSE réel sur l'URL Box avant de valider Uber ou
Trello. Leur compatibilité avec le proxy public n'est pas prouvée par ce modèle.

L'intégration SDK de création des Boxes, l'éditeur distant et le raccordement
de Pi ne sont pas inclus. Ce guide prépare le projet exécutable; il ne provisionne
pas de compte ou de service et n'engage aucun coût.

## Image Docker facultative

Le Dockerfile racine remplace l'ancien déploiement API seule par une image qui
contient aussi l'interface compilée et PostgreSQL/PostGIS. Il se lance en
utilisateur `node`. C'est une option pour les hébergeurs acceptant Docker,
indépendante de la disponibilité des images personnalisées dans Box.

```sh
docker build -t projet-etudiant .
docker volume create projet-donnees
docker run --rm --name projet-etudiant -p 3000:3000 \
  --mount source=projet-donnees,target=/app/.data projet-etudiant
```

Le volume nommé neuf hérite des permissions du dossier de l'image. Pour un
montage de dossier hôte, donnez au préalable les droits d'écriture à l'UID 1000.
Ne lancez jamais deux instances sur le même dossier PostgreSQL.

## Données, limites et sauvegardes

`DATA_DIR` choisit le dossier persistant (`.data` par défaut); `LOCAL_PG_PORT`
choisit le port PostgreSQL. Les mots de passe sont générés aléatoirement dans
`connexion.json`, privé et ignoré par Git. Conservez ce fichier avec les données.
Les interruptions normales arrêtent l'application avant PostgreSQL. Après une
interruption brutale, PostgreSQL applique sa récupération habituelle au réveil.

Le stockage persistant n'est pas une sauvegarde. Pour un petit projet de démo :
arrêtez proprement `npm start`, puis sauvegardez **tout** le dossier `.data`
dans un emplacement privé. Une copie du dossier PostgreSQL pendant qu'il écrit
n'est pas une sauvegarde valide. Restaurez avec la même version majeure de
PostgreSQL et les mêmes extensions. Ne supprimez jamais `.data` pour « réparer »
un démarrage; inspectez d'abord l'erreur et restaurez une sauvegarde si nécessaire.

Surveillez le disque : dépendances, journaux, WAL et données se partagent la
capacité de la Box. `max_wal_size=256MB` est une cible de maintenance, pas une
limite disque stricte. Placez les photos/vidéos dans un stockage adapté. Aucune
garantie de capacité pour 4 Go RAM/5 Go disque n'est donnée sans mesure réelle.

## Compatibilité avec les cours existants

Les routes API historiques restent réservées : une page React ne doit pas
réutiliser `/search`, par exemple. Utilisez un chemin distinct pour cette page.
Une migration complète vers `/api` demanderait une révision séparée des contrats
pédagogiques; ce modèle ne la fait pas.

Le proxy Vite simplifie le travail habituel, mais ne remplace pas l’exercice
sur CORS du module 5. Pour l’étudier, appelez directement l’origine de l’API
(par exemple `http://localhost:3000`) depuis le frontend sur `5173`, avec la
configuration CORS que vous implémentez dans le cours. Revenez aux URL `/api`
relatives pour la démonstration sur une seule origine.

Les contextes Docker excluent récursivement les fichiers `.env`, les identifiants
locaux et les sous-dossiers PostgreSQL. Le filtre de publication reconnaît aussi
les dossiers de données personnalisés par leur contenu. Ces exclusions protègent
les emplacements produits par le lanceur; elles ne remplacent pas une revue des
fichiers avant publication.
