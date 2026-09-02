#!/usr/bin/env ts-node
/**
 * Script d'import du CSV CertifInfo vers Supabase.
 *
 * Usage:
 *   cd server
 *   CSV_PATH=/Users/macbook/Downloads/opendata-certifinfo-01092026.csv \
 *   SUPABASE_URL=... \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx ts-node --project tsconfig.json src/scripts/import-certifinfo.ts
 *
 * Le fichier CSV est encode en Windows-1252 (cp1252), separe par ";".
 * On le convertit en UTF-8 avant parsing.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

// --------------------------------------------------------------------------
// Config
// --------------------------------------------------------------------------
const CSV_PATH =
  process.env.CSV_PATH ||
  path.join(__dirname, '../../../..', 'opendata-certifinfo-01092026.csv');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    'Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.',
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const BATCH_SIZE = 500;

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

/**
 * Decode a Windows-1252 buffer to a UTF-8 string.
 * Node.js has native support for 'latin1' which covers windows-1252 perfectly
 * for the characters used in French text (accented chars are in the same positions).
 */
function decodeWin1252(buffer: Buffer): string {
  // latin1 is 1:1 with the byte values, then we re-encode via TextDecoder
  // using the windows-1252 mapping
  const decoder = new TextDecoder('windows-1252');
  return decoder.decode(buffer);
}

/** Parse a DD/MM/YYYY date string to ISO YYYY-MM-DD or null. */
function parseDate(val: string): string | null {
  if (!val || !val.trim()) return null;
  const parts = val.trim().split('/');
  if (parts.length !== 3) return null;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

/** Parse a numeric string to an integer, or null. */
function parseIntOrNull(val: string): number | null {
  const n = parseInt(val?.trim() || '', 10);
  return isNaN(n) ? null : n;
}

/** Parse a numeric string to a smallint (0 default). */
function parseSmallint(val: string): number {
  const n = parseInt(val?.trim() || '0', 10);
  return isNaN(n) ? 0 : n;
}

/**
 * Parse a raw CSV line respecting semicolon delimiter.
 * Simple split is sufficient here since there are no quoted fields
 * containing semicolons in this dataset.
 */
function parseRow(line: string, headers: string[]): Record<string, string> {
  const values = line.split(';');
  const row: Record<string, string> = {};
  for (let i = 0; i < headers.length; i++) {
    row[headers[i]] = values[i]?.trim() ?? '';
  }
  return row;
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------
async function main() {
  console.log(`\nLecture du fichier: ${CSV_PATH}`);
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`Fichier introuvable: ${CSV_PATH}`);
    process.exit(1);
  }

  const buffer = fs.readFileSync(CSV_PATH);
  const content = decodeWin1252(buffer);
  const lines = content.split('\n').filter((l) => l.trim());

  if (lines.length < 2) {
    console.error('CSV vide ou invalide.');
    process.exit(1);
  }

  const headers = lines[0].split(';').map((h) => h.trim());
  console.log(`En-tetes: ${headers.join(', ')}`);
  console.log(`Lignes de donnees: ${lines.length - 1}`);

  const rows: Record<string, any>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const raw = parseRow(lines[i], headers);

    // Regrouper Code_Rome_1 a Code_Rome_5 en tableau, en deduplicant
    const codeRomes: string[] = [];
    for (let r = 1; r <= 5; r++) {
      const code = raw[`Code_Rome_${r}`]?.trim();
      if (code && !codeRomes.includes(code)) codeRomes.push(code);
    }

    const idRaw = parseIntOrNull(raw['Code_Diplome']);
    if (!idRaw) continue; // Ignorer les lignes sans ID valide

    rows.push({
      id: idRaw,
      libelle_diplome: raw['Libelle_Diplome'] || '',
      libelle_type_diplome: raw['Libelle_Type_Diplome'] || null,
      code_type_diplome: raw['code_type_diplome'] || null,
      niveau_europeen: parseIntOrNull(raw['Code_Niveau_Europeen']),
      code_rncp: raw['Code_RNCP'] || null,
      code_rs: raw['Code_RS'] || null,
      code_formacode: raw['Code_FormaCode'] || null,
      libelle_formacode: raw['Libelle_FormaCode'] || null,
      code_nsf: raw['Code_Nsf'] || null,
      code_scolarite: raw['Code_Scolarit'] || null,
      code_ideo2: raw['codeIdeo2'] || null,
      code_romes: codeRomes,
      certificateur: raw['certificateur'] || raw['valideur'] || null,
      valideur: raw['valideur'] || null,
      etat_libelle: raw['Etat_Libelle'] || 'Publie',
      accessibilite_fi: parseSmallint(raw['accessibilite_fi']),
      accessibilite_ca: parseSmallint(raw['accessibilite_ca']),
      accessibilite_fc: parseSmallint(raw['accessibilite_fc']),
      accessibilite_cp: parseSmallint(raw['accessibilite_cp']),
      accessibilite_vae: parseSmallint(raw['accessibilite_vae']),
      accessibilite_ind: parseSmallint(raw['accessibilite_ind']),
      annee_premiere_session: parseIntOrNull(raw['Annee_Premiere_Session']),
      annee_derniere_session: parseIntOrNull(raw['Annee_Derniere_Session']),
      code_ancien_diplome: raw['Code_Ancien_Diplome'] || null,
      code_ancien_rncp: raw['Code_Ancien_RNCP'] || null,
      date_maj: parseDate(raw['Date_MaJ']),
    });
  }

  console.log(`\n${rows.length} certifications a importer...\n`);

  let imported = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('certifications')
      .upsert(batch, { onConflict: 'id' });

    if (error) {
      console.error(`  [Batch ${i}-${i + batch.length}] Erreur:`, error.message);
      errors++;
    } else {
      imported += batch.length;
      process.stdout.write(
        `  Progres: ${imported}/${rows.length} (${Math.round((imported / rows.length) * 100)}%)\r`,
      );
    }
  }

  console.log(`\n\nImport termine.`);
  console.log(`  Succes: ${imported} lignes`);
  if (errors > 0) console.error(`  Erreurs: ${errors} batches`);
}

main().catch((err) => {
  console.error('Erreur fatale:', err);
  process.exit(1);
});
