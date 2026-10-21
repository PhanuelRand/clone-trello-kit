# 0008 : Chaque carte porte une version

- Date : 2026-10-14
- Statut : Accepté, par l'Académie

## Le problème

Deux membres ouvrent le même tableau. Le premier glisse une carte dans « En
cours ». Le second, qui ne l'a pas vu, glisse la même carte dans « Terminé »
une seconde plus tard, depuis l'écran qu'il a chargé avant. Sans précaution, le
second écrase le premier sans le savoir, et personne ne sait quel déplacement
compte.

## La décision

**Chaque carte porte une version, un entier qui commence à 1** et augmente de 1
à chaque modification : titre, description, échéance, déplacement, statut.

Une demande de déplacement envoie la version que le membre a sous les yeux. Si
la carte a changé depuis, sa version ne correspond plus, et le serveur répond
**409** avec la version actuelle de la carte. L'interface montre alors la carte
à sa nouvelle place, et le membre décide de nouveau.

## Ce que ça coûte

L'interface doit garder la version de chaque carte affichée, et traiter le 409
au lieu de l'ignorer.

## Ce qui a été écarté

**Le dernier qui écrit gagne.** C'est le comportement par défaut d'une base de
données, et c'est exactement le problème.

**Verrouiller une carte pendant qu'un membre la regarde.** Un membre qui ferme
son ordinateur sans fermer la carte la bloque pour toute l'équipe.
