# 0001 : Un tableau est privé à ses membres

- Date : 2026-10-14
- Statut : Accepté, par l'Académie

## Le problème

Un tableau contient le travail d'une équipe : les tâches d'une association,
les livraisons d'une coopérative, les préparatifs d'un mariage. Certains
contiennent des noms, des montants, des dates de rendez-vous. Il faut décider
qui le voit, et ce que voit quelqu'un qui n'en fait pas partie.

## La décision

**Un tableau n'est visible que par ses membres.** Chaque membre y a un rôle :

| Rôle | Ce qu'il peut faire |
| --- | --- |
| `ADMIN`, administrateur | tout, y compris inviter un administrateur, changer les rôles, retirer un membre, payer le Premium |
| `MEMBER`, membre | lire, commenter, créer, modifier et déplacer les cartes et les listes, inviter un membre ou un observateur |
| `OBSERVER`, observateur | lire et commenter, rien d'autre |

**Quelqu'un qui n'est pas membre reçoit 404, pas 403.** Un 403 dirait « ce
tableau existe, mais il n'est pas pour vous » : c'est déjà une information. Un
404 ne dit rien. Un membre qui n'a pas le droit d'une action, lui, reçoit 403 :
il sait déjà que le tableau existe.

Un tableau garde toujours **au moins un administrateur**.

Un tableau montre le **nom** de ses membres, jamais leur adresse électronique
ni leur numéro de téléphone.

## Ce que ça coûte

Chaque route qui touche un tableau, une liste, une carte ou un commentaire doit
retrouver le tableau concerné et le rôle du membre connecté avant de répondre.
Une requête de plus, à chaque fois.

## Ce qui a été écarté

**Des tableaux publics, lisibles par tous.** Trello le permet. Mais un tableau
rendu public par erreur expose tout le travail d'une équipe, et le parcours n'a
pas besoin de cette fonction pour enseigner quoi que ce soit.

**Un 403 pour tout le monde.** Plus simple à écrire, mais il confirme
l'existence d'un tableau à n'importe qui qui devine son identifiant.
