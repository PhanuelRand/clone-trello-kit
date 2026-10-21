# 0006 : Un instant se range en UTC, une journée se compte à Madagascar

- Date : 2026-10-14
- Statut : Accepté, par l'Académie

## Le problème

Une carte a une échéance : « à rendre le 15 juillet ». Elle est en retard à
partir du 16. Mais à partir de quand, le 16 ? Le serveur peut tourner en Europe
ou aux États-Unis, et l'heure de son horloge n'est pas celle de Madagascar. Une
carte qui passerait en retard à minuit UTC le ferait à 3 heures du matin à
Antananarivo, et un rappel « pour demain » envoyé à 23 h UTC parlerait déjà du
surlendemain.

## La décision

**Une échéance est une date, sans heure**, rangée dans une colonne de type
`date`. Elle désigne un jour entier.

**Un instant se range dans une colonne `timestamptz`**, qui garde un point
précis dans le temps, quel que soit le fuseau du serveur. Le moment où une
carte est créée, terminée ou commentée est un instant.

**Une journée se compte à l'heure de Madagascar**, le fuseau
`Indian/Antananarivo`, soit UTC+3, sans heure d'été. Minuit à Madagascar, c'est
21 h 00 UTC.

- Une carte due le 15 juillet est « due aujourd'hui » le 15 juillet, heure de
  Madagascar, et en retard à partir du 16 juillet, 0 h 00 à Madagascar,
  c'est-à-dire le 15 juillet à 21 h 00 UTC.
- Une semaine commence le lundi, à minuit, heure de Madagascar.

L'instant présent est passé en paramètre au lieu d'être lu sur l'horloge, pour
que minuit se vérifie sans attendre minuit.

## Ce que ça coûte

Il faut convertir avant de comparer, et ne jamais découper une date avec
`toISOString()`, qui donne la date en UTC : la veille, entre minuit et 3 heures
du matin à Madagascar.

## Ce qui a été écarté

**Une échéance à l'heure près, rangée en `timestamptz`.** Elle est plus
précise, mais une équipe dit « pour vendredi », pas « pour vendredi 17 h 00 », et
une heure arbitraire ferait passer en retard une tâche rendue le soir même.
