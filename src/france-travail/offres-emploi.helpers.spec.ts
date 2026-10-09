import {
  keywordsFromMetier,
  searchPlanFromRome,
  mergeOffres,
  OffreSummary,
  toOffreDetail,
  toOffreSummary,
  websiteSearchUrl,
} from './offres-emploi.helpers';

describe('keywordsFromMetier', () => {
  it('drops the feminine duplicate and generic job words', () => {
    expect(keywordsFromMetier('Ingénieur / Ingénieure sécurité web')).toBe(
      'sécurité,web',
    );
  });

  it('keeps a single specific word', () => {
    expect(keywordsFromMetier('Développeur / Développeuse web')).toBe(
      'développeur,web',
    );
    expect(keywordsFromMetier('Aide-soignant / Aide-soignante')).toBe(
      'aide,soignant',
    );
  });

  it('returns null when only generic words remain', () => {
    expect(keywordsFromMetier('Responsable')).toBeNull();
  });
});

describe('toOffreSummary / toOffreDetail', () => {
  const raw = {
    id: '214PMHV',
    intitule: 'Responsable applicatif (H/F)',
    description: 'x'.repeat(300),
    dateCreation: '2026-09-30T10:00:00.000Z',
    entreprise: { nom: 'AN DOUR' },
    lieuTravail: { libelle: '29 - MORLAIX' },
    typeContrat: 'CDI',
    typeContratLibelle: 'Contrat à durée indéterminée',
    origineOffre: { origine: '2' },
    competences: [{ libelle: 'Gérer un projet' }, {}],
  };

  it('normalises the list card', () => {
    const offre = toOffreSummary(raw);
    expect(offre.entreprise).toBe('AN DOUR');
    expect(offre.typeContrat).toBe('Contrat à durée indéterminée');
    expect(offre.extrait.length).toBeLessThanOrEqual(220);
    expect(offre.origine).toBe('partenaire');
    expect(offre.url).toBe(
      'https://candidat.francetravail.fr/offres/recherche/detail/214PMHV',
    );
  });

  it('keeps the full description and skips empty labels in detail', () => {
    const offre = toOffreDetail(raw);
    expect(offre.description).toHaveLength(300);
    expect(offre.competences).toEqual(['Gérer un projet']);
  });
});

describe('mergeOffres', () => {
  const offre = (id: string, date: string, intitule = 'Poste') =>
    ({ id, dateCreation: date, intitule }) as OffreSummary;

  it('dedupes by id and sorts newest first among equals', () => {
    const merged = mergeOffres([
      {
        offres: [offre('a', '2026-09-01'), offre('b', '2026-09-03')],
        weight: 1,
      },
      { offres: [offre('c', '2026-09-02')], weight: 1 },
    ]);
    expect(merged.map((o) => o.id)).toEqual(['b', 'c', 'a']);
  });

  it('ranks offers found by several searches and title matches first', () => {
    const merged = mergeOffres(
      [
        { offres: [offre('old', '2026-09-01', 'Aide à domicile')], weight: 1 },
        {
          offres: [
            offre('match', '2026-08-01', 'Aide-soignant DE'),
            offre('twice', '2026-08-02', 'Infirmier'),
          ],
          weight: 1,
        },
        { offres: [offre('twice', '2026-08-02', 'Infirmier')], weight: 3 },
      ],
      ['soignant'],
    );
    expect(merged.map((o) => o.id)).toEqual(['twice', 'match', 'old']);
  });
});

describe('searchPlanFromRome', () => {
  const rome = {
    appellations: [
      {
        code: '38833',
        libelle: 'Ingénieur / Ingénieure sécurité web',
        romeParent: 'M1802',
      },
      { code: '11111', libelle: 'Autre métier', romeParent: 'M9999' },
    ],
    domaineProfessionnel: { code: 'M18' },
  };

  it('uses the matching appellation, its parent code and the domain', () => {
    expect(
      searchPlanFromRome('M1833', 'Ingénieur / Ingénieure sécurité web', rome),
    ).toEqual({
      appellations: ['38833'],
      codesRome: ['M1833', 'M1802'],
      motCle: 'sécurité',
      domaine: 'M18',
    });
  });

  it('still searches by code without stored ROME data', () => {
    expect(
      searchPlanFromRome('J1501', 'Aide-soignant / Aide-soignante', null),
    ).toEqual({
      appellations: [],
      codesRome: ['J1501'],
      motCle: 'soignant',
      domaine: null,
    });
  });
});

describe('websiteSearchUrl', () => {
  it('encodes keywords and a département', () => {
    expect(
      websiteSearchUrl('sécurité,web', { type: 'departement', code: '75' }),
    ).toBe(
      'https://candidat.francetravail.fr/offres/recherche?motsCles=s%C3%A9curit%C3%A9+web&lieux=75D',
    );
  });
});
