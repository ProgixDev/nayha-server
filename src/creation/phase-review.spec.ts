import {
  buildReview,
  currentReview,
  phaseFingerprint,
  reviewAllowsNextPhase,
  ruleIssues,
} from './phase-review';

const solidJourney = () => ({
  situation: {
    currentStatus: 'salariee',
    weeklyHours: 20,
    monthlyIncomeGoal: 1200,
    safeStartBudget: 2000,
    launchMode: 'gradualTest',
    isConfirmed: true,
  },
  activite: {
    ideaDescription: 'Repas maison pour les seniors de mon quartier',
    activityFamilies: ['service'],
    isRegulated: false,
    isConfirmed: true,
  },
  marche: {
    customerProblem: 'Les seniors mangent seuls et mal',
    testMethod: 'entretiens',
    targetTestCount: 3,
    competitors: [{ name: 'Portage mairie' }],
    feedbacks: [
      { isPromising: true },
      { isPromising: true },
      { isPromising: false },
    ],
    isConfirmed: true,
  },
});

describe('ruleIssues', () => {
  it('finds nothing to say on a coherent, tested project', () => {
    expect(ruleIssues('valider', solidJourney())).toEqual([]);
  });

  it('flags an income goal out of reach of the time available', () => {
    const journey = solidJourney();
    journey.situation.weeklyHours = 8;
    journey.situation.monthlyIncomeGoal = 3000;

    const issues = ruleIssues('valider', journey);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ step: 1, severity: 'important' });
  });

  it('flags an idea nobody was asked about', () => {
    const journey = solidJourney();
    journey.marche.feedbacks = [];

    expect(ruleIssues('valider', journey).map((issue) => issue.step)).toEqual([
      3,
    ]);
  });

  it('flags mostly negative feedback', () => {
    const journey = solidJourney();
    journey.marche.feedbacks = [
      { isPromising: false },
      { isPromising: false },
      { isPromising: false },
      { isPromising: true },
    ];

    expect(ruleIssues('valider', journey)[0].title).toContain(
      'peu encourageants',
    );
  });

  it('flags a product activity with nothing to invest', () => {
    const journey = solidJourney();
    journey.situation.safeStartBudget = 0;
    journey.activite.activityFamilies = ['produit'];

    expect(ruleIssues('valider', journey)[0].step).toBe(2);
  });
});

describe('buildReview', () => {
  it('never lets the AI hide what the rules found', () => {
    const journey = solidJourney();
    journey.marche.feedbacks = [];
    journey.situation.weeklyHours = 5;
    journey.situation.monthlyIncomeGoal = 3000;

    const review = buildReview(
      'valider',
      journey,
      ruleIssues('valider', journey),
      {
        verdict: 'go',
        summary: 'Tout va bien',
      },
    );

    expect(review.verdict).toBe('adjust');
    expect(review.issues).toHaveLength(2);
  });

  it('keeps the AI verdict when it is stricter', () => {
    const journey = solidJourney();
    const review = buildReview('valider', journey, [], {
      verdict: 'rethink',
      issues: [
        {
          severity: 'blocking',
          step: 2,
          title: 'Diplôme obligatoire',
          problem: 'Cette activité demande un diplôme.',
          suggestion: 'Vérifie les conditions.',
        },
        { severity: 'weird', step: 9, title: 'Sans problème' },
      ],
    });

    expect(review.verdict).toBe('rethink');
    expect(review.issues).toHaveLength(1);
    expect(reviewAllowsNextPhase(review)).toBe(false);
    expect(
      reviewAllowsNextPhase({ ...review, acknowledgedAt: '2026-11-05' }),
    ).toBe(true);
  });

  it('still reviews from the rules when the AI is unavailable', () => {
    const review = buildReview('valider', solidJourney(), [], null);

    expect(review.verdict).toBe('go');
    expect(review.summary).not.toBe('');
    expect(reviewAllowsNextPhase(review)).toBe(true);
  });
});

describe('currentReview', () => {
  it('drops a review once the answers change, not when only confirmed', () => {
    const journey = solidJourney();
    const review = buildReview('valider', journey, [], null);

    const reconfirmed = {
      ...journey,
      marche: { ...journey.marche, isConfirmed: false },
    };
    expect(currentReview('valider', reconfirmed, review)).toBe(review);

    const changed = {
      ...journey,
      activite: { ...journey.activite, ideaDescription: 'Autre idée' },
    };
    expect(currentReview('valider', changed, review)).toBeNull();
  });

  it('ignores key order', () => {
    const journey = solidJourney();
    const reordered = {
      ...journey,
      situation: Object.fromEntries(
        Object.entries(journey.situation).reverse(),
      ),
    };

    expect(phaseFingerprint('valider', reordered)).toBe(
      phaseFingerprint('valider', journey),
    );
  });
});

const builtJourney = () => ({
  ...solidJourney(),
  offre: {
    offerTitle: 'Panier repas de la semaine',
    proposedPrice: 60,
    monthlyCapacityUnits: 40,
    timePerDeliveryHours: 1.5,
    socialLevyRate: 0.123,
    fixedMonthlyCosts: 100,
    variableCostModel: 'ratioOfRevenue',
    variableCostValue: 0.3,
    targetMonthlyNetIncome: 1200,
    initialCashReserve: 2000,
    initialStartupInvestment: 500,
    isConfirmed: true,
  },
  statut: {
    chosenFramework: 'microEntreprise',
    hasChosenFramework: true,
    isConfirmed: true,
  },
});

describe('phase 2 rules', () => {
  it('finds nothing to say on a viable offer', () => {
    expect(ruleIssues('construire', builtJourney())).toEqual([]);
  });

  it('blocks an offer where each sale loses money', () => {
    const journey = builtJourney();
    journey.offre.variableCostValue = 0.95;

    const issues = ruleIssues('construire', journey);

    expect(issues[0]).toMatchObject({ severity: 'blocking', step: 4 });
  });

  it('flags an income goal the offer does not reach', () => {
    const journey = builtJourney();
    journey.offre.monthlyCapacityUnits = 10;

    const issues = ruleIssues('construire', journey);

    expect(issues.map((i) => i.title)).toContain(
      'Ton revenu visé n’est pas atteint',
    );
  });

  it('flags more work than the hours available', () => {
    const journey = builtJourney();
    journey.offre.timePerDeliveryHours = 4;

    expect(ruleIssues('construire', journey)[0].title).toContain(
      'plus de temps',
    );
  });

  it('flags savings that run out on a slow start', () => {
    const journey = builtJourney();
    journey.offre.initialCashReserve = 0;
    journey.offre.initialStartupInvestment = 3000;

    expect(ruleIssues('construire', journey)[0].title).toContain('épargne');
  });

  it('flags a micro-entreprise above its ceiling', () => {
    const journey = builtJourney();
    journey.offre.socialLevyRate = 0.212;
    journey.offre.proposedPrice = 900;
    journey.offre.timePerDeliveryHours = 0.1;

    const issues = ruleIssues('construire', journey);

    expect(issues.map((i) => i.step)).toContain(5);
  });

  it('points AI issues at phase 2 steps', () => {
    const review = buildReview('construire', builtJourney(), [], {
      verdict: 'go',
      issues: [{ step: 1, title: 'Prix', problem: 'Prix élevé.' }],
    });

    expect(review.issues[0].step).toBe(5);
  });

  it('goes stale when a phase 1 answer changes', () => {
    const journey = builtJourney();
    const review = buildReview('construire', journey, [], null);
    const changed = {
      ...journey,
      situation: { ...journey.situation, weeklyHours: 10 },
    };

    expect(currentReview('construire', changed, review)).toBeNull();
  });
});

const launchedJourney = () => ({
  ...builtJourney(),
  demarches: {
    alreadyCreated: false,
    items: [
      {
        title: 'Déclarer ta micro-entreprise',
        obligation: 'obligatoire',
        isCompleted: true,
      },
      {
        title: 'Ouvrir un compte dédié',
        obligation: 'recommandee',
        isCompleted: false,
      },
    ],
    isConfirmed: true,
  },
  contacts: {
    weeklyActionLimit: 3,
    actions: [{ title: 'Prévenir mon entourage', timeframe: '30 jours' }],
    announcementMessage:
      'Je lance mes paniers repas maison pour les seniors du quartier !',
    isConfirmed: true,
  },
});

describe('phase 3 rules', () => {
  it('finds nothing to say on a ready launch', () => {
    expect(ruleIssues('lancer', launchedJourney())).toEqual([]);
  });

  it('lists mandatory paperwork still to do', () => {
    const journey = launchedJourney();
    journey.demarches.items[0].isCompleted = false;

    const [issue] = ruleIssues('lancer', journey);

    expect(issue).toMatchObject({ step: 6, severity: 'important' });
    expect(issue.problem).toContain('Déclarer ta micro-entreprise');
  });

  it('skips paperwork for an activity that already exists', () => {
    const journey = launchedJourney();
    journey.demarches.items[0].isCompleted = false;
    journey.demarches.alreadyCreated = true;

    expect(ruleIssues('lancer', journey)).toEqual([]);
  });

  it('flags a launch with no customer actions', () => {
    const journey = launchedJourney();
    journey.contacts.actions = [];

    expect(ruleIssues('lancer', journey)[0].step).toBe(7);
  });

  it('is not stale when only weekly results are added', () => {
    const journey = launchedJourney();
    const review = buildReview('lancer', journey, [], null);

    expect(
      currentReview(
        'lancer',
        { ...journey, suivi: { checkIns: [] } } as typeof journey,
        review,
      ),
    ).toBe(review);
  });
});
