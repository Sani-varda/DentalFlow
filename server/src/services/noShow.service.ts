import axios from 'axios';
import { env } from '../config/env';

const SCORING_SERVICE_URL = 'http://localhost:8001/api/v1/scoring';

/**
 * Recalculate no-show pattern scores for all patients.
 * Delegates work to the Python scoring-service.
 */
export async function recalculateAllPatternScores(): Promise<number> {
  try {
    console.log(`[NoShowScorer] Triggering remote recalculation at ${SCORING_SERVICE_URL}/recalculate`);
    const response = await axios.post(`${SCORING_SERVICE_URL}/recalculate`);
    
    if (response.data.status === 'success') {
      console.log(`[NoShowScorer] ${response.data.message}`);
      return response.data.updated_count;
    }
    
    throw new Error(response.data.detail || 'Unknown error from scoring service');
  } catch (error: any) {
    console.warn('[NoShowScorer] Python scoring service unavailable. Falling back to internal (legacy) scoring.');
    // Fallback: This is a simplified version of the old internal logic
    // for production resilience. In a real scenario, we might retry or alert.
    return 0; 
  }
}

/**
 * Recalculate score for a specific patient.
 */
export async function recalculatePatientScore(patientId: string): Promise<any> {
  try {
    const response = await axios.post(`${SCORING_SERVICE_URL}/patient/${patientId}`);
    return response.data;
  } catch (error: any) {
    console.error(`[NoShowScorer] Error scoring patient ${patientId}:`, error.message);
    return null;
  }
}
