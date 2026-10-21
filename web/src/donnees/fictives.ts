/**
 * Des données fictives, pour construire vos écrans avant que l'API existe.
 *
 * Au module 3, vos pages lisent ce fichier. Dans les modules suivants, chaque
 * page le remplace par un appel à votre API, une page à la fois. Quand plus
 * aucun écran ne l'importe, supprimez-le.
 *
 * Les membres, leurs tableaux et leurs cartes sont inventés.
 */

/** Les rôles d'un membre sur un tableau (décision 0001). */
export type Role = 'ADMIN' | 'MEMBER' | 'OBSERVER'

export const nomsDesRoles: Record<Role, string> = {
  ADMIN: 'Administrateur',
  MEMBER: 'Membre',
  OBSERVER: 'Observateur',
}

/** Les six étiquettes du parcours, par leur couleur. */
export type Etiquette = 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED' | 'PURPLE' | 'BLUE'

export const nomsDesEtiquettes: Record<Etiquette, string> = {
  GREEN: 'Vert',
  YELLOW: 'Jaune',
  ORANGE: 'Orange',
  RED: 'Rouge',
  PURPLE: 'Violet',
  BLUE: 'Bleu',
}

/** Un membre, tel qu'un tableau le montre : un nom, jamais de courriel ni de téléphone. */
export type MembreFictif = {
  id: string
  nom: string
  role: Role
}

export type CarteFictive = {
  id: string
  titre: string
  description: string
  statut: 'OPEN' | 'DONE'
  echeance: string | null // 'AAAA-MM-JJ', un jour entier à Madagascar (décision 0006)
  etiquettes: Etiquette[]
  affectes: string[] // des identifiants de membres
  commentaires: number
  piecesJointes: number
}

export type ListeFictive = {
  id: string
  titre: string
  cartes: CarteFictive[]
}

export type TableauFictif = {
  id: string
  titre: string
  monRole: Role
  premium: boolean // payé au module 11
  membres: MembreFictif[]
  listes: ListeFictive[]
}

export const tableauxFictifs: TableauFictif[] = [
  {
    id: 't1',
    titre: 'Mariage de Mialy et Tojo',
    monRole: 'ADMIN',
    premium: false,
    membres: [
      { id: 'm1', nom: 'Mialy', role: 'ADMIN' },
      { id: 'm2', nom: 'Tojo', role: 'ADMIN' },
      { id: 'm3', nom: 'Fara', role: 'MEMBER' },
      { id: 'm4', nom: 'Hery', role: 'OBSERVER' },
    ],
    listes: [
      {
        id: 'l1',
        titre: 'À faire',
        cartes: [
          {
            id: 'c1',
            titre: 'Réserver la salle des fêtes',
            description: 'Salle de 150 places à Ivandry. Demander le devis avec le traiteur.',
            statut: 'OPEN',
            echeance: '2026-11-05',
            etiquettes: ['RED'],
            affectes: ['m1'],
            commentaires: 3,
            piecesJointes: 1,
          },
          {
            id: 'c2',
            titre: 'Envoyer les faire-part',
            description: 'Cent vingt invités. La liste est dans la pièce jointe.',
            statut: 'OPEN',
            echeance: '2026-11-20',
            etiquettes: ['BLUE'],
            affectes: ['m2', 'm3'],
            commentaires: 0,
            piecesJointes: 1,
          },
          {
            id: 'c3',
            titre: 'Choisir la musique du bal',
            description: '',
            statut: 'OPEN',
            echeance: null,
            etiquettes: [],
            affectes: [],
            commentaires: 1,
            piecesJointes: 0,
          },
        ],
      },
      {
        id: 'l2',
        titre: 'En cours',
        cartes: [
          {
            id: 'c4',
            titre: 'Goûter les menus du traiteur',
            description: 'Rendez-vous samedi à 11 h. Trois menus à comparer.',
            statut: 'OPEN',
            echeance: '2026-10-18',
            etiquettes: ['ORANGE', 'GREEN'],
            affectes: ['m1', 'm2'],
            commentaires: 5,
            piecesJointes: 2,
          },
        ],
      },
      {
        id: 'l3',
        titre: 'Terminé',
        cartes: [
          {
            id: 'c5',
            titre: 'Fixer la date à la mairie',
            description: 'Samedi 12 décembre, 10 h, mairie d’Antananarivo.',
            statut: 'DONE',
            echeance: '2026-10-01',
            etiquettes: ['GREEN'],
            affectes: ['m2'],
            commentaires: 2,
            piecesJointes: 0,
          },
        ],
      },
    ],
  },
  {
    id: 't2',
    titre: 'Coopérative de vanille, récolte 2026',
    monRole: 'MEMBER',
    premium: true,
    membres: [
      { id: 'm5', nom: 'Rado', role: 'ADMIN' },
      { id: 'm1', nom: 'Mialy', role: 'MEMBER' },
      { id: 'm6', nom: 'Voahangy', role: 'MEMBER' },
    ],
    listes: [
      {
        id: 'l4',
        titre: 'À faire',
        cartes: [
          {
            id: 'c6',
            titre: 'Peser la récolte de Sambava',
            description: 'Noter le poids par producteur dans le cahier partagé.',
            statut: 'OPEN',
            echeance: '2026-10-16',
            etiquettes: ['YELLOW'],
            affectes: ['m1', 'm6'],
            commentaires: 0,
            piecesJointes: 0,
          },
        ],
      },
      { id: 'l5', titre: 'En cours', cartes: [] },
      { id: 'l6', titre: 'Terminé', cartes: [] },
    ],
  },
  {
    id: 't3',
    titre: 'Association des parents d’élèves',
    monRole: 'OBSERVER',
    premium: false,
    membres: [
      { id: 'm7', nom: 'Fanja', role: 'ADMIN' },
      { id: 'm1', nom: 'Mialy', role: 'OBSERVER' },
    ],
    listes: [
      { id: 'l7', titre: 'À faire', cartes: [] },
      { id: 'l8', titre: 'En cours', cartes: [] },
      { id: 'l9', titre: 'Terminé', cartes: [] },
    ],
  },
]

/** Le nom d'un membre, pour l'afficher à partir de son identifiant. */
export function nomDuMembre(tableau: TableauFictif, id: string): string {
  return tableau.membres.find((membre) => membre.id === id)?.nom ?? 'Ancien membre'
}

/** Les invitations en attente du premier tableau, pour l'écran des membres. */
export const invitationsFictives: { id: string; courriel: string; role: Role }[] = [
  { id: 'i1', courriel: 'andry@example.org', role: 'MEMBER' },
]

/** Les commentaires de la première carte, les plus anciens d'abord. */
export const commentairesFictifs: { id: string; auteur: string; texte: string; ecritLe: string }[] = [
  {
    id: 'k1',
    auteur: 'Tojo',
    texte: 'J’ai appelé la salle : elle est libre le 12 décembre.',
    ecritLe: '2026-10-12T07:30:00.000Z',
  },
  {
    id: 'k2',
    auteur: 'Mialy',
    texte: 'Parfait. Je passe signer le contrat jeudi.',
    ecritLe: '2026-10-12T08:05:00.000Z',
  },
  {
    id: 'k3',
    auteur: 'Fara',
    texte: 'Pensez à demander s’il y a un parking.',
    ecritLe: '2026-10-12T09:40:00.000Z',
  },
]
