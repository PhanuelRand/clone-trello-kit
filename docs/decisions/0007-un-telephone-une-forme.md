# 0007 : Un numéro de téléphone se range sous une seule forme

- Date : 2026-10-14
- Statut : Accepté, par l'Académie

## Le problème

Le Premium d'un tableau se paie par Mobile Money, depuis un numéro de
téléphone. Le même numéro s'écrit de dix façons : `034 12 345 67`,
`0341234567`, `+261 34 12 345 67`, `261-34-12-345-67`. Rangé tel quel, il ne se
compare plus, et un prestataire de paiement le refuse.

## La décision

**Un numéro se range sous la forme internationale, `+261` suivi des neuf
chiffres, sans espace** : `+261341234567`. Le serveur la calcule à
l'inscription et au paiement, quelle que soit la saisie, et refuse un numéro
qu'il ne sait pas ramener à cette forme.

Le parcours accepte les numéros de téléphone mobile de Madagascar, ceux qui
commencent par 032, 033, 034, 037 ou 038. Le numéro est facultatif à
l'inscription, et il n'est jamais montré à un autre membre.

## Ce que ça coûte

Une fonction de plus, testée sur tous les formats qu'on rencontre. Et un
membre qui tape un numéro étranger reçoit un refus.

## Ce qui a été écarté

**Ranger la saisie telle quelle, et nettoyer à l'affichage.** Chaque requête
qui compare deux numéros devrait alors refaire le nettoyage, et une seule
oubliée suffit à laisser passer une erreur.
