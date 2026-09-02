-- ============================================================================
-- Migration: Referentiel CertifInfo / RNCP
-- Source: opendata.certifinfo.net (CSV du 01/09/2026)
-- Objectif: Requetes instantanees par code ROME (ex: J1502)
--           et jointure avec les tables ROME 4.0 existantes.
-- ============================================================================

-- Extension trigram pour la recherche textuelle
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS public.certifications (
    -- CertifInfo primary key
    id BIGINT PRIMARY KEY,              -- Code_Diplome

    -- Identite du diplome
    libelle_diplome      TEXT        NOT NULL,
    libelle_type_diplome TEXT,
    code_type_diplome    VARCHAR(10),

    -- Niveau europeen: 3=CAP, 4=Bac, 5=BTS/DUT, 6=Licence, 7=Master, 8=Doctorat
    niveau_europeen      SMALLINT,

    -- Referentiels officiels
    code_rncp            VARCHAR(20),  -- ex: '40692' -> jointure avec rome_metiers
    code_rs              VARCHAR(20),  -- Repertoire Specifique
    code_formacode       VARCHAR(10),
    libelle_formacode    TEXT,
    code_nsf             VARCHAR(10),
    code_scolarite       TEXT,
    code_ideo2           VARCHAR(20),

    -- Codes ROME regroupes en tableau PostgreSQL (Code_Rome_1 a Code_Rome_5)
    -- Index GIN pour requetes O(log n): 'J1502' = ANY(code_romes)
    code_romes           VARCHAR(5)[]  NOT NULL DEFAULT '{}',

    -- Acteurs
    certificateur        TEXT,
    valideur             TEXT,
    etat_libelle         TEXT DEFAULT 'Publie',

    -- Modalites d acces: 0=non, 1=oui, 2=sous conditions
    accessibilite_fi     SMALLINT DEFAULT 0,  -- Formation Initiale
    accessibilite_ca     SMALLINT DEFAULT 0,  -- Contrat d Apprentissage
    accessibilite_fc     SMALLINT DEFAULT 0,  -- Formation Continue
    accessibilite_cp     SMALLINT DEFAULT 0,  -- Contrat de Professionnalisation
    accessibilite_vae    SMALLINT DEFAULT 0,  -- Validation des Acquis de l Experience
    accessibilite_ind    SMALLINT DEFAULT 0,  -- Candidature Individuelle

    -- Historique
    annee_premiere_session INT,
    annee_derniere_session INT,
    code_ancien_diplome    TEXT,
    code_ancien_rncp       TEXT,

    date_maj   DATE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- INDEX
-- ============================================================================

-- 1. Recherche par code ROME (requete: 'J1502' = ANY(code_romes) ou @>)
CREATE INDEX IF NOT EXISTS idx_certifications_code_romes
    ON public.certifications USING GIN (code_romes);

-- 2. Jointure avec rome_metiers via code_rncp
CREATE INDEX IF NOT EXISTS idx_certifications_code_rncp
    ON public.certifications (code_rncp)
    WHERE code_rncp IS NOT NULL;

-- 3. Jointure Repertoire Specifique
CREATE INDEX IF NOT EXISTS idx_certifications_code_rs
    ON public.certifications (code_rs)
    WHERE code_rs IS NOT NULL;

-- 4. Filtre / tri par niveau d etudes
CREATE INDEX IF NOT EXISTS idx_certifications_niveau
    ON public.certifications (niveau_europeen);

-- 5. Autocompletion / recherche textuelle sur le libelle
CREATE INDEX IF NOT EXISTS idx_certifications_libelle_trgm
    ON public.certifications USING GIN (libelle_diplome gin_trgm_ops);

-- ============================================================================
-- ROW LEVEL SECURITY (meme pattern que rome_metiers et candidatures)
-- ============================================================================
ALTER TABLE public.certifications ENABLE ROW LEVEL SECURITY;

-- Lecture publique pour utilisateurs authentifies et anonymes
DROP POLICY IF EXISTS "Public read access on certifications" ON public.certifications;
CREATE POLICY "Public read access on certifications" ON public.certifications
    FOR SELECT USING (true);

-- Ecriture reservee au service_role (import script + upsert NestJS)
DROP POLICY IF EXISTS "Service role write on certifications" ON public.certifications;
CREATE POLICY "Service role write on certifications" ON public.certifications
    FOR ALL USING (auth.role() = 'service_role');
