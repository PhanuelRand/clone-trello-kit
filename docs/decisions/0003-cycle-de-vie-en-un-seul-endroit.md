# 0003 : Un seul endroit décide des passages

- Date : 2026-10-14
- Statut : Accepté, par l'Académie

## Le problème

Une carte traverse plusieurs situations : ouverte, terminée, archivée,
supprimée. Si plusieurs fichiers se permettent de changer cette situation,
chacun applique sa propre lecture des règles.

On voit alors une carte supprimée qui revient sur un tableau, ou une carte
archivée qui compte encore dans les retards, sans pouvoir dire quel fichier en
est la cause.

## La décision

**Les passages autorisés sont décrits dans un seul objet, et une seule méthode
les applique.** Elle lève une erreur quand le passage demandé n'est pas permis.
Aucun autre code ne modifie le statut d'une carte.

| Depuis | Vers |
| --- | --- |
| `OPEN`, ouverte | `DONE`, `ARCHIVED` |
| `DONE`, terminée | `OPEN`, `ARCHIVED` |
| `ARCHIVED`, archivée | `OPEN`, `DELETED` |
| `DELETED`, supprimée | aucun |

On ne supprime qu'une carte archivée : c'est la seconde chance d'un membre qui
s'est trompé. Une carte restaurée depuis les archives revient ouverte. Une carte
supprimée l'est définitivement.

## Ce que ça coûte

Un détour : un service qui veut terminer une carte ne peut pas écrire le
nouveau statut directement, il doit passer par cette méthode.

## Ce qui a été écarté

**Un `if` à chaque endroit qui change l'état.** C'est plus rapide à écrire les
trois premières fois. Au dixième, plus personne ne sait quelles règles
s'appliquent réellement, et les corriger demande de toutes les retrouver.
