/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {Curve} from './curve';
import {StrategyType} from './google_ads_client';

/**
 * Configuration for the optimization algorithm.
 */
interface OptimizationConfig {
  initialTarget: number;
  maxTarget: number;
  minTarget: number;
  maxIterations: number;
  learningRate: number;
  tolerance: number;
}
/**
 * Analyzes simulation data and a fitted curve to suggest optimal bidding targets.
 */
export class TargetAnalyzer {
  /**
   * @param curve The fitted Curve object for the profit data.
   */
  constructor(private curve: Curve) {}

  /**
   * Predicts the profit value for a given target using the fitted curve.
   * @param targetValue The target to predict the profit for.
   * @return The predicted profit value, or undefined if prediction is not possible.
   */
  predictValue(targetValue: number | undefined): number | undefined {
    return this.curve.predictValue(targetValue);
  }

  /**
   * Finds the optimal target for maximizing profit using gradient ascent.
   * @param strategyType The bidding strategy type.
   * @return The calculated optimal target value.
   */
  findOptimalTargetForProfitUnconstrained(strategyType: StrategyType): number {
    const {
      initialTarget,
      maxTarget,
      minTarget,
      maxIterations,
      learningRate: initialLearningRate,
      tolerance,
    } = this.getOptimizationConfig(strategyType);

    /**
     * The current target value being optimized. It starts with `initialTarget`
     * from the configuration and is updated in each iteration of the gradient ascent.
     */
    let target = initialTarget;
    /**
     * The current learning rate, which determines the step size in each iteration.
     * It starts with `initialLearningRate` from the configuration and can be
     * dynamically reduced if the optimization overshoots.
     */
    let learningRate = initialLearningRate;
    /**
     * Stores the target value from the previous iteration. Used to detect
     * overshooting and to check for convergence.
     */
    let previousTarget = 0;

    // Use gradient ascent to find the target that maximizes the value from the curve.
    for (let i = 0; i < maxIterations; i++) {
      const gradient = this.curve.calculateGradient(target);

      if (gradient === null) {
        console.error(
          'Gradient could not be calculated. Aborting optimization.'
        );
        return target;
      }

      // The absolute value of the gradient, used to normalize the gradient vector.
      const gradientMagnitude = Math.abs(gradient);
      //The normalized gradient, indicating only the direction of the steepest ascent.
      const normalizedGradient =
        gradientMagnitude > 0 ? gradient / gradientMagnitude : 0;

      // Move the target in the direction of the gradient.
      let newTarget = target + learningRate * normalizedGradient;

      // Ensure the new target stays within the defined min/max bounds.
      newTarget = Math.max(minTarget, Math.min(maxTarget, newTarget));

      // If we overshot and changed direction, reduce the learning rate
      // to allow for finer-grained adjustments.
      if (i > 0 && (newTarget - target) * (target - previousTarget) < 0) {
        learningRate *= 0.1;
      }

      // If the change in target is smaller than the tolerance, it converged.
      if (Math.abs(newTarget - previousTarget) < tolerance) {
        //console.log(`Converged after ${i + 1} iterations.`);
        return newTarget;
      }

      previousTarget = target;
      target = newTarget;
    }

    console.warn(
      `Optimization did not converge after ${maxIterations} iterations.`
    );
    return target;
  }

  /**
   * Suggests a new, conservative target based on the current and optimal targets.
   * The suggestion is a small step towards the optimal target.
   * @param currentTarget The current bidding target.
   * @param optimalTarget The calculated optimal target.
   * @param strategyType The bidding strategy type.
   * @return A suggested new target value.
   */
  suggestNewTarget(
    currentTarget: number,
    optimalTarget: number,
    strategyType: StrategyType
  ): number {
    const {maxTarget} = this.getOptimizationConfig(strategyType);

    // The suggested target should not move for more than 5% of the way towards the optimal
    const maxMovePercentage = 0.05;
    // If the potential profit gain is less than 10%, make an even smaller move
    const profitSensitivity = 0.1;

    const profitTarget = this.predictValue(currentTarget);
    const profitOptimal = this.predictValue(optimalTarget);

    if (profitTarget === undefined || profitOptimal === undefined) {
      console.warn('Could not predict profit for target suggestion.');
      // Fallback to a simple small move of 5% if profit prediction fails.
      const fallbackMovePercentage = 0.05;
      return (
        currentTarget *
        (1 + Math.sign(optimalTarget - currentTarget) * fallbackMovePercentage)
      );
    }

    const targetDifference = optimalTarget - currentTarget;
    const maxTargetMove = Math.abs(targetDifference) * maxMovePercentage;

    const normalizedProfitDifference =
      Math.abs(profitOptimal - profitTarget) /
      Math.max(Math.abs(profitTarget), Math.abs(profitOptimal), 1); // Avoid division by zero

    let targetMove = maxTargetMove;

    // If the expected profit gain is small, make an even smaller move
    if (normalizedProfitDifference < profitSensitivity) {
      targetMove *= normalizedProfitDifference / profitSensitivity;
    }

    const direction = targetDifference > 0 ? 1 : -1;
    const newTarget = currentTarget + direction * targetMove;

    return Math.max(0.1, Math.min(maxTarget, newTarget));
  }

  /**
   * Returns the optimization configuration based on the strategy type.
   *
   * The parameters are tailored to the specific bidding strategy type (TARGET_ROAS or TARGET_CPA)
   * due to their differing scales and typical value ranges.
   *
   * - `initialTarget`: The starting value for the optimization algorithm.
   *   - For `TARGET_ROAS`: A typical starting Return on Ad Spend (e.g., 4.5, meaning 450% return).
   *   - For `TARGET_CPA`: A typical starting Cost Per Acquisition (e.g., 50, representing $50).
   *
   * - `maxTarget`: The maximum allowable value for the target.
   *   - For `TARGET_ROAS`: An upper bound for ROAS (e.g., 500.0), which is a very high but plausible return.
   *   - For `TARGET_CPA`: A very large monetary upper bound (e.g., 2,000,000.0), effectively making it unconstrained for most practical scenarios.
   *
   * - `minTarget`: The minimum allowable value for the target.
   *   - For `TARGET_ROAS`: A lower bound for ROAS (e.g., 1.0), representing the break-even point.
   *   - For `TARGET_CPA`: A minimal monetary value (e.g., 1.0), preventing targets that are effectively zero.
   *
   * - `maxIterations`: The maximum number of steps the algorithm will perform before stopping.
   *   - For `TARGET_ROAS`: Fewer iterations (e.g., 1000) are typically sufficient as ROAS values operate within a smaller numerical range, leading to faster convergence.
   *   - For `TARGET_CPA`: More iterations (e.g., 100,000) are provided because CPA values can span a much larger numerical range, potentially requiring more steps to converge.
   *
   * - `learningRate`: The initial step size used in each iteration of the gradient ascent.
   *   This value determines how aggressively the algorithm adjusts the target in the direction of the gradient.
   *   It is dynamically reduced during the optimization process if overshooting is detected.
   *   Both values are the same by default as the maxIterations parameters are different.
   *   In case we want lower maxIterations for tCPA, we could increase the learning rate.
   *   - For `TARGET_ROAS`: A common step size (e.g., 0.05).
   *   - For `TARGET_CPA`: A common step size (e.g., 0.05).
   *
   * - `tolerance`: A small positive value used to determine convergence. If the absolute
   *   difference between the `newTarget` and `previousTarget` falls below this
   *   tolerance, the algorithm is considered converged. It's the same for both
   *   strategy types by default.
   *
   * @param strategyType The bidding strategy type.
   * @return The configuration for the optimization algorithm.
   */
  private getOptimizationConfig(
    strategyType: StrategyType
  ): OptimizationConfig {
    if (strategyType === StrategyType.TARGET_ROAS) {
      return {
        initialTarget: 4.5,
        maxTarget: 500.0,
        minTarget: 1.0,
        maxIterations: 1000,
        learningRate: 0.05,
        tolerance: 1e-5,
      };
    }
    // else StrategyType.TARGET_CPA
    return {
      initialTarget: 50,
      maxTarget: 2000000.0,
      minTarget: 1.0,
      maxIterations: 100000,
      learningRate: 0.05,
      tolerance: 1e-5,
    };
  }
}
