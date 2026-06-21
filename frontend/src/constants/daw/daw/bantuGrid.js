/**
 * Moteur de calcul de la Grille Rythmique Bantu (RIBA DAW)
 * Calcule les positions asymétriques pour l'Asiko, le Makossa et le Bikutsi.
 * Assure une parité mathématique stricte avec le moteur de quantification backend.
 */

// Définition des structures de pas asymétriques traditionnelles (poids relatifs)
const BANTU_PATTERNS = {
  // Asiko : Rythme cyclique basé sur la sagesse des anciens
  asiko_wisdom: [1.0, 0.85, 1.15, 1.0],
  
  // Makossa : Pulsation syncopée des racines urbaines
  makossa_roots: [1.0, 1.2, 0.8, 1.0],
  
  // Bikutsi 4/4 : Énergie brute à pulsation binaire droite-asymétrique
  bikutsi_44: [0.9, 1.1, 0.95, 1.05],
  
  // Bikutsi 6/8 : Balancement ternaire traditionnel
  bikutsi_68: [1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
  
  // Bikutsi 12/24 : Grille dense polyrythmique d'Afrique Centrale
  bikutsi_1224: [1.0, 0.9, 1.1, 1.0, 0.95, 1.05, 1.0, 0.9, 1.1, 1.0, 0.95, 1.05]
};

/**
 * Calcule le tableau de positions temporelles (en secondes ou battements)
 * @param {string} style - Le style de rythme choisi (ex: 'makossa_roots')
 * @param {number} density - Le nombre de divisions de la grille
 * @param {number} bars - Le nombre de mesures totales à générer
 * @returns {Array<number>} Tableau des positions quantifiées
 */
export function computeBantuGrid(style, density = 16, bars = 4) {
  const positions = [];
  const pattern = BANTU_PATTERNS[style] || [1.0, 1.0, 1.0, 1.0];
  const patternLen = pattern.length;

  // Calcul du facteur multiplicateur pour coller à la densité demandée
  const totalSteps = density * bars;
  
  let currentPos = 0.0;
  positions.push(currentPos);

  for (let i = 0; i < totalSteps - 1; i++) {
    // Récupération du poids asymétrique selon le pas actuel du pattern
    const weight = pattern[i % patternLen];
    
    // Avancée temporelle modifiée par le poids de la tradition orale
    const stepSize = (1.0 / (density / 4)) * weight;
    currentPos += stepSize;
    
    // Arrondi de précision à 4 décimales pour garantir la parité avec Python (abs_tol=1e-4)
    positions.push(Math.round(currentPos * 10000) / 10000);
  }

  return positions;
}
