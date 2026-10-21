# 0002 : L'ordre des cartes est une position à virgule

- Date : 2026-10-14
- Statut : Accepté, par l'Académie

## Le problème

Les cartes d'une liste ont un ordre, que les membres changent sans arrêt en les
glissant. Si l'ordre est un rang, 1, 2, 3, 4, glisser la dernière carte en
haut oblige à renuméroter toutes les autres : une écriture par carte, à chaque
déplacement, et autant de chances de se marcher dessus quand deux membres
déplacent en même temps.

## La décision

**Chaque carte porte une position, un nombre à virgule.** La liste se lit en
triant par position croissante. La colonne est de type `double precision`.

- Une carte ajoutée en bas d'une liste prend la position de la dernière, plus
  65 536. La première carte d'une liste vide prend 65 536.
- Une carte glissée entre deux autres prend la moitié de la somme de leurs
  positions : entre 65 536 et 131 072, elle prend 98 304.
- Une carte glissée tout en haut prend la moitié de la position de la première.

Un seul déplacement n'écrit donc qu'**une seule ligne**.

À force de glisser des cartes au même endroit, l'écart entre deux positions
devient trop petit pour être coupé en deux : un nombre à virgule n'a pas une
précision infinie. Quand le milieu calculé n'est plus strictement entre ses deux
voisins, on **renumérote la liste** : 65 536, 131 072, 196 608… puis on
recalcule.

Les listes d'un tableau suivent la même règle.

## Ce que ça coûte

Un calcul de plus à chaque déplacement, et une renumérotation, rare, à prévoir
et à tester.

## Ce qui a été écarté

**Un rang entier, renuméroté à chaque déplacement.** Simple à lire, mais chaque
déplacement réécrit toute la liste.

**Une chaîne de caractères triée par ordre alphabétique**, la méthode de
plusieurs grands outils. Elle repousse le moment de renuméroter, mais son calcul
est difficile à lire pour qui débute.
