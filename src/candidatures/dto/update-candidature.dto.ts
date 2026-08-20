export class UpdateCandidatureDto {
  statut?: 'envoyee' | 'en_attente' | 'entretien' | 'refusee' | 'acceptee';
  date_entretien?: string;
  ressenti_entretien?: 'bien' | 'mitige' | 'difficile';
  issue_entretien?: 'sans_suite' | 'en_attente' | 'proposition';
  notes?: string;
}
