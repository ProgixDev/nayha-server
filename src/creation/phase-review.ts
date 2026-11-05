import { createHash } from 'crypto';

/**
 * End-of-phase review ("Bilan"): fixed rules catch the risks a formula can
 * see (time vs income, budget, missing market evidence), the AI adds what
 * needs reading (vague idea, regulation, legal or safety risk). Both are
 * merged into one review stored in the journey.
 */

type Section = Record<string, unknown> | null | undefined;
type JourneyStepName =
  | 'situation'
  | 'activite'
  | 'marche'
  | 'offre'
  | 'statut'
  | 'demarches'
  | 'contacts';
export type JourneyAnswers = { [K in JourneyStepName]?: Section };

const journeyOrder: JourneyStepName[] = [
  'situation',
  'activite',
  'marche',
  'offre',
  'statut',
  'demarches',
  'contacts',
];
const stepNumber = (step: JourneyStepName) => journeyOrder.indexOf(step) + 1;

export const reviewPhases = ['valider', 'construire', 'lancer'] as const;
export type ReviewPhase = (typeof reviewPhases)[number];

/** Steps each review covers: they must be confirmed before reviewing. */
export const reviewPhaseSteps: Record<ReviewPhase, JourneyStepName[]> = {
  valider: ['situation', 'activite', 'marche'],
  construire: ['offre', 'statut'],
  lancer: ['demarches', 'contacts'],
};

/**
 * Answers a review was written from: changing one makes it stale. A later
 * phase also depends on the earlier ones (its figures reuse them).
 */
const reviewFingerprintSteps: Record<ReviewPhase, JourneyStepName[]> = {
  valider: ['situation', 'activite', 'marche'],
  construire: ['situation', 'activite', 'marche', 'offre', 'statut'],
  lancer: journeyOrder,
};

/** First step of the phase after each reviewed one, opened by the review. */
export const reviewOpensStep: Partial<Record<ReviewPhase, JourneyStepName>> = {
  valider: 'offre',
  construire: 'demarches',
};

export const reviewVerdicts = ['go', 'adjust', 'rethink'] as const;
export type ReviewVerdict = (typeof reviewVerdicts)[number];

export const issueSeverities = ['blocking', 'important', 'minor'] as const;
export type IssueSeverity = (typeof issueSeverities)[number];

export interface ReviewIssue {
  severity: IssueSeverity;
  /** Journey step (1 to 7) where the person can fix it. */
  step: number;
  title: string;
  problem: string;
  suggestion: string;
}

export interface PhaseReview {
  verdict: ReviewVerdict;
  summary: string;
  strengths: string[];
  issues: ReviewIssue[];
  questions: string[];
  generatedAt: string;
  acknowledgedAt: string | null;
  /** Fingerprint of the answers the review was written from. */
  basedOn: string;
}

/** Sorts object keys so the same answers always give the same fingerprint. */
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, stable((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

export function phaseFingerprint(
  phase: ReviewPhase,
  journey: JourneyAnswers,
): string {
  const answers = reviewFingerprintSteps[phase].map((step) => {
    const section = journey[step];
    if (!section) return null;
    const copy = { ...section };
    delete copy.isConfirmed;
    return stable(copy);
  });
  return createHash('sha256').update(JSON.stringify(answers)).digest('hex');
}

const num = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const euros = (value: number) =>
  `${Math.round(value).toLocaleString('fr-FR')} €`;

/** Share of worked time that is actually paid (prospecting, admin, travel). */
const billableShare = 0.6;
/** Rough social contributions of a micro-entreprise selling services. */
const contributionRate = 0.22;
const weeksPerMonth = 4.33;

/** Risks that simple arithmetic on the answers can show. */
export function ruleIssues(
  phase: ReviewPhase,
  journey: JourneyAnswers,
): ReviewIssue[] {
  switch (phase) {
    case 'valider':
      return positioningIssues(journey);
    case 'construire':
      return businessModelIssues(journey);
    case 'lancer':
      return launchIssues(journey);
  }
}

/** Phase 1: does the idea fit the person, and is there a real need? */
function positioningIssues(journey: JourneyAnswers): ReviewIssue[] {
  const situation = journey.situation ?? {};
  const activite = journey.activite ?? {};
  const marche = journey.marche ?? {};
  const issues: ReviewIssue[] = [];

  const hours = num(situation.weeklyHours);
  const incomeGoal = num(situation.monthlyIncomeGoal);
  if (hours && incomeGoal && hours > 0 && incomeGoal > 0) {
    const paidHours = hours * weeksPerMonth * billableShare;
    const hourlyRate = incomeGoal / (1 - contributionRate) / paidHours;
    if (hourlyRate > 60) {
      issues.push({
        severity: 'important',
        step: 1,
        title: 'Ton objectif de revenu demande un tarif élevé',
        problem: `Pour te verser ${euros(incomeGoal)} par mois avec ${hours} h par semaine, il faudrait facturer environ ${euros(hourlyRate)} par heure payée : une partie de ton temps part en prospection et en administratif.`,
        suggestion:
          'Augmente ton temps disponible, vise un revenu plus progressif pour la première année, ou choisis une activité où ce tarif est courant.',
      });
    }
  }

  const neededBy =
    typeof situation.incomeNeededBy === 'string'
      ? Date.parse(situation.incomeNeededBy)
      : NaN;
  const monthsLeft = Number.isNaN(neededBy)
    ? null
    : (neededBy - Date.now()) / (30 * 24 * 3600 * 1000);
  const feedbacks = Array.isArray(marche.feedbacks) ? marche.feedbacks : [];
  if (monthsLeft !== null && monthsLeft < 3) {
    issues.push({
      severity: 'important',
      step: 1,
      title: 'Tu as besoin de revenus très vite',
      problem:
        'Une nouvelle activité met souvent plusieurs mois à rapporter un revenu régulier. Ton délai laisse peu de marge.',
      suggestion:
        'Prévois un revenu de sécurité en parallèle (emploi, missions, droits France Travail) pendant le démarrage.',
    });
  }

  const budget = num(situation.safeStartBudget);
  const families = Array.isArray(activite.activityFamilies)
    ? activite.activityFamilies.map(String)
    : [];
  const needsEquipment = families.some((family) =>
    ['produit', 'artisanat', 'commerceLocal'].includes(family),
  );
  if (budget === 0 && needsEquipment) {
    issues.push({
      severity: 'important',
      step: 2,
      title: 'Ton activité demande souvent un premier investissement',
      problem:
        'Les activités de produit, d’artisanat ou de commerce demandent en général du matériel ou du stock, et tu as indiqué ne rien pouvoir investir pour l’instant.',
      suggestion:
        'Liste ce qu’il te faut vraiment pour tes premières ventes, et cherche à démarrer petit : précommandes, prêt de matériel, dépôt-vente.',
    });
  }

  if (activite.isRegulated === true) {
    issues.push({
      severity: 'important',
      step: 2,
      title: 'Ton activité est réglementée',
      problem:
        typeof activite.regulatoryNote === 'string' &&
        activite.regulatoryNote.trim()
          ? `Tu as noté : « ${activite.regulatoryNote.trim().slice(0, 200)} ».`
          : 'Une activité réglementée peut demander un diplôme, une carte professionnelle ou une assurance particulière.',
      suggestion:
        'Vérifie dès maintenant les conditions d’exercice auprès de la source officielle de ton métier, avant d’investir du temps ou de l’argent.',
    });
  }

  const promising = feedbacks.filter(
    (feedback) =>
      feedback !== null &&
      typeof feedback === 'object' &&
      (feedback as Record<string, unknown>).isPromising === true,
  ).length;
  if (feedbacks.length === 0) {
    issues.push({
      severity: 'important',
      step: 3,
      title: 'Ton idée n’a pas encore été testée',
      problem:
        'Tu n’as encore noté aucun échange avec de futurs clients. Sans leur avis, le besoin reste une supposition.',
      suggestion:
        'Parle à 3 personnes concernées avant de construire ton offre : 15 minutes chacune suffisent.',
    });
  } else if (feedbacks.length >= 3 && promising * 3 < feedbacks.length) {
    issues.push({
      severity: 'important',
      step: 3,
      title: 'Les retours sont peu encourageants',
      problem: `Seulement ${promising} échange${promising > 1 ? 's' : ''} sur ${feedbacks.length} ${promising > 1 ? 'montrent' : 'montre'} un vrai intérêt.`,
      suggestion:
        'Relis les objections : faut-il changer de public, de problème ou de façon de proposer ton activité ?',
    });
  } else {
    const target = num(marche.targetTestCount);
    if (target && feedbacks.length < target) {
      issues.push({
        severity: 'minor',
        step: 3,
        title: 'Ton test n’est pas terminé',
        problem: `Tu as noté ${feedbacks.length} échange${feedbacks.length > 1 ? 's' : ''} sur les ${target} prévus.`,
        suggestion:
          'Tu peux avancer, mais continue tes échanges : ils t’aideront à fixer ton prix à l’étape suivante.',
      });
    }
  }

  if (marche.marketDecision === 'otherIdea') {
    issues.push({
      severity: 'important',
      step: 2,
      title: 'Tu envisages toi-même une autre idée',
      problem:
        'À la fin de ton test, tu as indiqué vouloir explorer une autre piste.',
      suggestion:
        'Reviens à l’étape 2 pour formuler cette nouvelle piste : ton point de départ est déjà posé.',
    });
  }

  const competitors = Array.isArray(marche.competitors)
    ? marche.competitors
    : [];
  if (competitors.length === 0) {
    issues.push({
      severity: 'minor',
      step: 3,
      title: 'Aucune solution existante repérée',
      problem:
        'Tes futurs clients font déjà quelque chose aujourd’hui pour ce problème, même eux-mêmes.',
      suggestion:
        'Note 1 ou 2 solutions existantes et leur prix : ce sera ton repère à l’étape de l’offre.',
    });
  }

  return issues;
}

/** Micro-entreprise turnover ceilings (indicative, to check on Urssaf). */
const microCeilingServices = 83_600;
const microCeilingSales = 203_100;
/** Contribution rate under which the offer is mostly product sales. */
const salesRateLimit = 0.17;

/**
 * The step 4 estimate, with the same formulas the app shows: sales at full
 * capacity, then a slow start (half the sales, paid 30 days late).
 */
export function offerFigures(journey: JourneyAnswers) {
  const offre = journey.offre ?? {};
  const price = num(offre.proposedPrice) ?? 0;
  const capacity = num(offre.monthlyCapacityUnits) ?? 0;
  const levy = num(offre.socialLevyRate) ?? 0.22;
  const fixed = num(offre.fixedMonthlyCosts) ?? 0;
  const variable = num(offre.variableCostValue) ?? 0;
  const perUnit = offre.variableCostModel === 'perUnit';
  const unitVariable = perUnit ? variable : price * variable;

  const revenue = price * capacity;
  const netIncome = revenue - revenue * levy - fixed - unitVariable * capacity;
  const unitMargin = price - price * levy - unitVariable;
  const hoursNeeded =
    (capacity * (num(offre.timePerDeliveryHours) ?? 0)) / weeksPerMonth;

  const slowVolume = Math.max(1, Math.round(capacity * 0.5));
  const outflows = fixed + slowVolume * unitVariable;
  const receipts = price * slowVolume * (1 - levy);
  const month1 =
    (num(offre.initialCashReserve) ?? 0) -
    (num(offre.initialStartupInvestment) ?? 0) -
    outflows +
    receipts * 0.4;
  const month2 = month1 - outflows + receipts * 0.9;
  const month3 = month2 - outflows + receipts;

  return {
    price,
    capacity,
    levy,
    revenue,
    netIncome,
    unitMargin,
    hoursNeeded,
    yearlyRevenue: revenue * 12,
    lowestCashSlowStart: Math.min(month1, month2, month3),
  };
}

/** Phase 2: can the offer pay the person, in the chosen framework? */
function businessModelIssues(journey: JourneyAnswers): ReviewIssue[] {
  const situation = journey.situation ?? {};
  const offre = journey.offre ?? {};
  const statut = journey.statut ?? {};
  const figures = offerFigures(journey);
  const issues: ReviewIssue[] = [];

  if (figures.price > 0 && figures.unitMargin <= 0) {
    issues.push({
      severity: 'blocking',
      step: 4,
      title: 'Chaque vente te coûte de l’argent',
      problem: `À ${euros(figures.price)}, une fois les cotisations et les coûts de chaque vente payés, il ne te reste rien.`,
      suggestion:
        'Augmente ton prix ou réduis ce que te coûte chaque vente avant d’aller plus loin.',
    });
  } else {
    const goal = num(offre.targetMonthlyNetIncome);
    if (goal && goal > 0 && figures.netIncome < goal) {
      issues.push({
        severity: figures.netIncome <= 0 ? 'blocking' : 'important',
        step: 4,
        title:
          figures.netIncome <= 0
            ? 'Ton activité ne dégage pas de revenu'
            : 'Ton revenu visé n’est pas atteint',
        problem: `Avec ${figures.capacity} vente${figures.capacity > 1 ? 's' : ''} par mois à ${euros(figures.price)}, il te resterait environ ${euros(figures.netIncome)} par mois, pour ${euros(goal)} visés.`,
        suggestion:
          'Revois ton prix, le nombre de ventes que tu peux faire, ou tes frais. Un objectif plus progressif la première année est aussi une option.',
      });
    }
  }

  const hours = num(situation.weeklyHours);
  if (hours && figures.hoursNeeded > hours) {
    issues.push({
      severity: 'important',
      step: 4,
      title: 'Ton offre demande plus de temps que tu n’en as',
      problem: `Tes ventes prévues demandent environ ${Math.round(figures.hoursNeeded)} h par semaine, pour ${hours} h disponibles. Et il faut encore du temps pour trouver tes clients.`,
      suggestion:
        'Réduis le temps passé par vente (format collectif, en ligne, pack) ou augmente ton prix pour vendre moins.',
    });
  }

  if (figures.lowestCashSlowStart < 0) {
    issues.push({
      severity: 'important',
      step: 4,
      title: 'Ton épargne pourrait manquer au démarrage',
      problem: `Si tes ventes démarrent lentement, il pourrait te manquer environ ${euros(-figures.lowestCashSlowStart)} pendant les 3 premiers mois.`,
      suggestion:
        'Réduis l’investissement de départ, garde un revenu en parallèle, ou regarde le prêt d’honneur et l’ARCE à l’étape 5.',
    });
  }

  if (
    offre.fixedMonthlyCosts == null &&
    offre.isFixedCostsConfirmedZero !== true
  ) {
    issues.push({
      severity: 'minor',
      step: 4,
      title: 'Tes frais fixes ne sont pas renseignés',
      problem:
        'Assurance, téléphone, outils, local : même petits, ils pèsent sur ton revenu chaque mois.',
      suggestion:
        'Liste-les, même approximativement, pour que tes chiffres soient fiables.',
    });
  }

  const framework = statut.chosenFramework;
  if (statut.hasChosenFramework === false) {
    issues.push({
      severity: 'minor',
      step: 5,
      title: 'Ton cadre n’est pas encore choisi',
      problem:
        'Tes démarches dépendent de ta façon de te lancer : micro-entreprise, couveuse, portage ou société.',
      suggestion:
        'Prends rendez-vous avec un conseiller (BGE, CCI, Chambre des métiers) pour trancher avant tes démarches.',
    });
  } else if (framework === 'microEntreprise') {
    const ceiling =
      figures.levy < salesRateLimit ? microCeilingSales : microCeilingServices;
    if (figures.yearlyRevenue > ceiling) {
      issues.push({
        severity: 'important',
        step: 5,
        title: 'Tu dépasserais le plafond de la micro-entreprise',
        problem: `Ton chiffre d’affaires prévu (environ ${euros(figures.yearlyRevenue)} par an) dépasse le plafond de ${euros(ceiling)}.`,
        suggestion:
          'Regarde l’option société, ou vérifie le plafond actuel sur le site de l’Urssaf.',
      });
    }
  } else if (
    framework === 'societeUnipersonnelle' &&
    figures.yearlyRevenue > 0 &&
    figures.yearlyRevenue < 20_000
  ) {
    issues.push({
      severity: 'minor',
      step: 5,
      title: 'Une société coûte cher pour ce chiffre d’affaires',
      problem: `Avec environ ${euros(figures.yearlyRevenue)} par an, les frais d’une société (comptable, annonce légale, banque) pèseront lourd.`,
      suggestion:
        'Compare avec la micro-entreprise ou une couveuse pour démarrer, quitte à passer en société plus tard.',
    });
  }

  return issues;
}

const asItems = (value: unknown) =>
  (Array.isArray(value) ? value : []).filter(
    (item): item is Record<string, unknown> =>
      item !== null && typeof item === 'object',
  );

/** Phase 3: is everything ready to sell legally, and to find customers? */
function launchIssues(journey: JourneyAnswers): ReviewIssue[] {
  const demarches = journey.demarches ?? {};
  const contacts = journey.contacts ?? {};
  const issues: ReviewIssue[] = [];

  if (demarches.alreadyCreated !== true) {
    const missing = asItems(demarches.items).filter(
      (item) => item.obligation === 'obligatoire' && item.isCompleted !== true,
    );
    if (missing.length > 0) {
      const titles = missing
        .slice(0, 3)
        .map((item) => text(item.title, 80))
        .filter(Boolean)
        .join(' ; ');
      issues.push({
        severity: 'important',
        step: 6,
        title: `${missing.length} démarche${missing.length > 1 ? 's' : ''} obligatoire${missing.length > 1 ? 's' : ''} à faire avant de vendre`,
        problem: `Il te reste : ${titles}${missing.length > 3 ? '…' : ''}. Tant qu’elles ne sont pas faites, tu ne peux pas facturer en règle.`,
        suggestion:
          'Bloque un créneau cette semaine pour la première, et coche-la dans ta liste une fois faite.',
      });
    }
  }

  const actions = asItems(contacts.actions);
  if (actions.length === 0) {
    issues.push({
      severity: 'important',
      step: 7,
      title: 'Aucune action prévue pour trouver tes clients',
      problem:
        'Sans actions concrètes et datées, les premiers clients arrivent rarement d’eux-mêmes.',
      suggestion:
        'Choisis 3 actions simples pour tes 30 premiers jours : prévenir ton entourage, recontacter les personnes rencontrées, un partenaire local.',
    });
  } else if (
    !actions.some((action) => text(action.timeframe, 20).startsWith('30'))
  ) {
    issues.push({
      severity: 'minor',
      step: 7,
      title: 'Rien de prévu pour ton premier mois',
      problem:
        'Toutes tes actions sont prévues à 60 ou 90 jours : le premier mois est le plus important pour démarrer.',
      suggestion: 'Avance au moins une action dans les 30 premiers jours.',
    });
  }

  const weekly = num(contacts.weeklyActionLimit);
  if (weekly !== null && weekly < 1) {
    issues.push({
      severity: 'minor',
      step: 7,
      title: 'Pas de rythme d’actions choisi',
      problem:
        'Un petit rythme régulier compte plus qu’un gros effort ponctuel.',
      suggestion: 'Vise au moins 2 actions par semaine, même courtes.',
    });
  }

  if (!text(contacts.announcementMessage, 10)) {
    issues.push({
      severity: 'minor',
      step: 7,
      title: 'Ton message d’annonce n’est pas prêt',
      problem:
        'Prévenir ton entourage est souvent la source des tout premiers clients.',
      suggestion:
        'Prépare un message court qui dit ce que tu proposes, à qui, et comment te contacter.',
    });
  }

  return issues;
}

const verdictRank: Record<ReviewVerdict, number> = {
  go: 0,
  adjust: 1,
  rethink: 2,
};
const severityRank: Record<IssueSeverity, number> = {
  blocking: 0,
  important: 1,
  minor: 2,
};

/** The verdict the issues alone justify, whatever the AI said. */
export function verdictFloor(issues: ReviewIssue[]): ReviewVerdict {
  const important = issues.filter((i) => i.severity === 'important').length;
  if (issues.some((i) => i.severity === 'blocking') || important >= 2) {
    return 'adjust';
  }
  return 'go';
}

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

/** Keeps only well-formed AI issues, on steps this phase covers. */
export function sanitizeAiIssues(value: unknown, steps: number[]) {
  return (Array.isArray(value) ? value : [])
    .map((raw): ReviewIssue | null => {
      const item =
        raw !== null && typeof raw === 'object'
          ? (raw as Record<string, unknown>)
          : {};
      const severity = issueSeverities.includes(item.severity as IssueSeverity)
        ? (item.severity as IssueSeverity)
        : 'minor';
      const step = Number(item.step);
      const issue = {
        severity,
        step: steps.includes(step) ? step : steps[steps.length - 1],
        title: text(item.title, 90),
        problem: text(item.problem, 320),
        suggestion: text(item.suggestion, 320),
      };
      return issue.title && issue.problem ? issue : null;
    })
    .filter((issue): issue is ReviewIssue => issue !== null)
    .slice(0, 5);
}

export function buildReview(
  phase: ReviewPhase,
  journey: JourneyAnswers,
  rules: ReviewIssue[],
  ai: Record<string, unknown> | null,
): PhaseReview {
  const steps = reviewPhaseSteps[phase].map(stepNumber);
  const issues = [...rules, ...sanitizeAiIssues(ai?.issues, steps)]
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
    .slice(0, 7);

  const floor = verdictFloor(issues);
  const aiVerdict = reviewVerdicts.includes(ai?.verdict as ReviewVerdict)
    ? (ai!.verdict as ReviewVerdict)
    : floor;
  const verdict =
    verdictRank[aiVerdict] >= verdictRank[floor] ? aiVerdict : floor;

  const strings = (value: unknown, max: number, count: number) =>
    (Array.isArray(value) ? value : [])
      .map((item) => text(item, max))
      .filter(Boolean)
      .slice(0, count);

  const fallbackSummary: Record<ReviewVerdict, string> = {
    go: 'Ton projet tient la route pour passer à la suite.',
    adjust:
      'Ton projet a de vraies bases, mais quelques points sont à revoir avant de construire ton offre.',
    rethink:
      'Des points importants remettent en question ce projet tel qu’il est. Prends le temps de les regarder avant d’aller plus loin.',
  };

  return {
    verdict,
    summary: text(ai?.summary, 400) || fallbackSummary[verdict],
    strengths: strings(ai?.strengths, 200, 3),
    issues,
    questions: strings(ai?.questions, 200, 3),
    generatedAt: new Date().toISOString(),
    acknowledgedAt: null,
    basedOn: phaseFingerprint(phase, journey),
  };
}

/** A stored review, if it still matches the current answers. */
export function currentReview(
  phase: ReviewPhase,
  journey: JourneyAnswers,
  stored: unknown,
): PhaseReview | null {
  if (stored === null || typeof stored !== 'object') return null;
  const review = stored as PhaseReview;
  return review.basedOn === phaseFingerprint(phase, journey) ? review : null;
}

/** The person must say they read it before going on despite the review. */
export function reviewNeedsAcknowledgement(review: PhaseReview): boolean {
  return (
    review.verdict === 'rethink' ||
    review.issues.some((i) => i.severity === 'blocking')
  );
}

/** Moving past the phase needs a review, acknowledged when it is serious. */
export function reviewAllowsNextPhase(review: PhaseReview | null): boolean {
  if (!review) return false;
  return !reviewNeedsAcknowledgement(review) || review.acknowledgedAt !== null;
}
