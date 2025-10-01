import {StrategyType} from './google_ads_client';
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

/**
 * Represents a curve fitted to a set of data points.
 * Uses the Nelder-Mead algorithm for optimization.
 */
export class Curve {
  readonly strategyType: StrategyType;
  readonly metricName: string;

  private readonly maxIterations: number;
  private readonly tolerance: number;

  // Curve parameters (a, b, c)
  private a: number | null = null;
  private b: number | null = null;
  private c: number | null = null;

  private rSquared: number | null = null;

  /**
   * @param strategyType The bidding strategy type (TARGET_ROAS or TARGET_CPA).
   * @param data An array of [x, y] data points.
   * @param initialParams The initial guess for the curve parameters [a, b, c].
   * @param metricName The name of the metric this curve represents.
   * @param maxIterations The maximum number of iterations for the fitting algorithm.
   * @param tolerance The convergence tolerance for the fitting algorithm.
   */
  constructor(
    strategyType: StrategyType,
    data: Array<[number, number]>,
    initialParams: number[],
    metricName: string,
    maxIterations = 1000,
    tolerance = 1e-6
  ) {
    this.strategyType = strategyType;
    this.metricName = metricName;
    this.maxIterations = maxIterations;
    this.tolerance = tolerance;

    if (data && data.length >= 3) {
      this.fit(data, initialParams);
    } else {
      console.error(
        `Data for metric '${metricName}' is empty or has fewer than 3 points. Curve cannot be fitted.`
      );
    }
  }

  /**
   * Fits the curve to the provided data using the Nelder-Mead algorithm.
   * @param data An array of [x, y] data points.
   * @param initialParams The initial guess for the curve parameters [a, b, c].
   */
  private fit(data: Array<[number, number]>, initialParams: number[]): void {
    const n = initialParams.length;
    const simplex = this.initializeSimplex(initialParams);
    let iterations = 0;

    while (iterations < this.maxIterations) {
      simplex.sort(
        (a, b) => this.calculateLoss(data, a) - this.calculateLoss(data, b)
      );

      const best = simplex[0];
      const worst = simplex[n];
      const secondWorst = simplex[n - 1];
      const centroid = this.calculateCentroid(simplex, n);

      // Reflection
      const reflected = this.reflect(centroid, worst, 1);
      const lossReflected = this.calculateLoss(data, reflected);
      const lossWorst = this.calculateLoss(data, worst);
      const lossBest = this.calculateLoss(data, best);
      const lossSecondWorst = this.calculateLoss(data, secondWorst);

      if (lossReflected < lossBest) {
        // Expansion
        const expanded = this.reflect(centroid, worst, 2);
        const lossExpanded = this.calculateLoss(data, expanded);
        const lossReflected = this.calculateLoss(data, reflected);
        simplex[n] = lossExpanded < lossReflected ? expanded : reflected;
      } else if (lossReflected < lossSecondWorst) {
        simplex[n] = reflected;
      } else {
        // Contraction
        const contractionFactor = 0.5;
        let contracted;
        if (lossReflected < lossWorst) {
          contracted = this.reflect(centroid, worst, contractionFactor);
        } else {
          contracted = this.reflect(centroid, worst, -contractionFactor);
        }
        const lossContracted = this.calculateLoss(data, contracted);
        if (lossContracted < lossWorst) {
          simplex[n] = contracted;
        } else {
          // Shrink
          this.shrink(simplex, best);
        }
      }

      if (this.checkConvergence(simplex, this.tolerance, data)) {
        break;
      }
      iterations++;
    }

    [this.a, this.b, this.c] = simplex[0];
    this.rSquared = this.calculateRSquared(data);
  }

  /**
   * Predicts a value for a given target based on the fitted curve.
   * @param target The target value (e.g., tROAS or tCPA).
   * @return The predicted value, or undefined if the model is not fitted.
   */
  predictValue(target: number | undefined): number | undefined {
    if (
      target === undefined ||
      this.a === null ||
      this.b === null ||
      this.c === null
    ) {
      return undefined;
    }

    if (this.strategyType === StrategyType.TARGET_ROAS) {
      return this.predictValuePower(target);
    } else {
      return this.predictValuePolynomial(target);
    }
  }

  /**
   * Calculates the gradient (derivative) of the curve at a specific target point.
   * @param target The target value (e.g., tROAS or tCPA).
   * @return The gradient at the target point, or null if the model is not fitted.
   */
  calculateGradient(target: number): number | null {
    if (this.a === null || this.b === null || this.c === null) {
      return null;
    }

    if (this.strategyType === StrategyType.TARGET_ROAS) {
      // Derivative of y = exp(a + b*ln(x) + c*ln(x)^2) is y * (b/x + 2*c*ln(x)/x)
      const predictedValue = this.predictValue(target);
      if (predictedValue === undefined) {
        return null;
      }
      return (
        predictedValue *
        (this.b / target + (2 * this.c * Math.log(target)) / target)
      );
    } else {
      // Derivative of y = a*x^2 + b*x + c is 2*a*x + b
      return 2 * this.a * target + this.b;
    }
  }

  /**
   * Predicts the y-value for a given x-value using the power function model.
   * The power function model is y = exp(a + b*ln(x) + c*ln(x)^2).
   * This is typically used for TARGET_ROAS strategies.
   * @param troas The tROAS value (x-value) to predict for.
   * @return The predicted y-value.
   */
  private predictValuePower(troas: number): number {
    // y = exp(a + b*ln(x) + c*ln(x)^2)
    const logTroas = Math.log(troas);
    return Math.exp(this.a! + this.b! * logTroas + this.c! * logTroas ** 2);
  }

  /**
   * Predicts the y-value for a given x-value using the polynomial model.
   * The polynomial model is y = a*x^2 + b*x + c.
   * This is typically used for TARGET_CPA strategies.
   * @param tcpa The tCPA value (x-value) to predict for.
   * @return The predicted y-value.
   */
  private predictValuePolynomial(tcpa: number): number {
    // y = a*x^2 + b*x + c
    return this.a! * tcpa ** 2 + this.b! * tcpa + this.c!;
  }

  /**
   * Calculates the R-squared value, a statistical measure of how well the
   * regression predictions approximate the real data points.
   * @param data The original data points used for fitting.
   * @return The R-squared value, a number between 0 and 1.
   */
  private calculateRSquared(data: Array<[number, number]>): number {
    const yValues = data.map(item => item[1]);
    const meanY = yValues.reduce((sum, y) => sum + y, 0) / yValues.length;
    let totalSumOfSquares = 0;
    let residualSumOfSquares = 0;

    for (const [x, y] of data) {
      const prediction = this.predictValue(x);
      if (prediction === undefined) continue;
      totalSumOfSquares += (y - meanY) ** 2;
      residualSumOfSquares += (y - prediction) ** 2;
    }

    if (totalSumOfSquares === 0) {
      return 1; // Perfect fit if all y values are the same
    }

    return 1 - residualSumOfSquares / totalSumOfSquares;
  }

  /**
   * Returns the R-squared value of the fitted curve.
   * @return The R-squared value, or null if the model is not fitted.
   */
  getRSquared(): number | null {
    return this.rSquared;
  }

  /**
   * Calculates the loss (error) for a given set of parameters.
   * @param data The data points to calculate the loss against.
   * @param params The curve parameters to use for the calculation.
   * @return The calculated loss value (RMSE).
   */
  private calculateLoss(
    data: Array<[number, number]>,
    params: number[]
  ): number {
    if (this.strategyType === StrategyType.TARGET_ROAS) {
      return this.calculateLossPower(data, params);
    } else {
      return this.calculateLossPolynomial(data, params);
    }
  }

  /**
   * Calculates the loss (Root Mean Squared Error) for the power function model.
   * The power function model is y = exp(a + b*ln(x) + c*ln(x)^2).
   * @param data The data points to calculate the loss against.
   * @param params The curve parameters [a, b, c] to use for the calculation.
   * @return The calculated loss value (RMSE).
   */
  private calculateLossPower(
    data: Array<[number, number]>,
    params: number[]
  ): number {
    const [a, b, c] = params;
    let totalErrorSquared = 0;
    for (const [x, y] of data) {
      const logX = Math.log(x);
      const prediction = Math.exp(a + b * logX + c * logX ** 2);
      totalErrorSquared += (y - prediction) ** 2;
    }
    return Math.sqrt(totalErrorSquared / data.length); // RMSE
  }

  /**
   * Calculates the loss (Root Mean Squared Error) for the polynomial model.
   * The polynomial model is y = a*x^2 + b*x + c.
   * @param data The data points to calculate the loss against.
   * @param params The curve parameters [a, b, c] to use for the calculation.
   * @return The calculated loss value (RMSE).
   */
  private calculateLossPolynomial(
    data: Array<[number, number]>,
    params: number[]
  ): number {
    const [a, b, c] = params;
    let totalErrorSquared = 0;
    for (const [x, y] of data) {
      const prediction = a * x ** 2 + b * x + c;
      const error = y - prediction;
      totalErrorSquared += error ** 2;
    }
    return Math.sqrt(totalErrorSquared / data.length); // RMSE
  }

  /**
   * Creates the initial simplex for the Nelder-Mead algorithm by taking the
   * initial parameters and creating n additional points, each with one
   * parameter perturbed by a small factor.
   * @param initialParams The initial guess for the curve parameters.
   * @return An array of n+1 points, where n is the number of parameters.
   */
  private initializeSimplex(initialParams: number[]): number[][] {
    const dimensions = initialParams.length;
    const simplex = [initialParams];
    const perturbationFactor = 1.05;

    for (let i = 0; i < dimensions; i++) {
      const point = initialParams.slice();
      point[i] *= perturbationFactor;
      simplex.push(point);
    }
    return simplex;
  }

  /**
   * Calculates the centroid of the best n points in the simplex.
   * The centroid is the geometric center, excluding the worst point.
   * @param simplex The simplex, an array of n+1 points.
   * @param dimensions The number of parameters (dimensions) for each point.
   * @return The centroid point.
   */
  private calculateCentroid(simplex: number[][], dimensions: number): number[] {
    const centroid = new Array(dimensions).fill(0);
    // Sum the coordinates of the n-best points (all but the worst).
    for (let i = 0; i < dimensions; i++) {
      for (let j = 0; j < dimensions; j++) {
        centroid[j] += simplex[i][j]; // simplex[i] is the i-th best point.
      }
    }
    // Average the coordinates to find the center.
    return centroid.map(coordinate => coordinate / dimensions);
  }

  /**
   * Reflects a point through the centroid by a given factor.
   * @param centroid The centroid of the simplex.
   * @param point The point to reflect.
   * @param factor The reflection factor (e.g., 1 for reflection, 2 for expansion).
   * @return The new, reflected point.
   */
  private reflect(
    centroid: number[],
    point: number[],
    factor: number
  ): number[] {
    return centroid.map((c, i) => c + factor * (c - point[i]));
  }

  /**
   * Shrinks the simplex towards the best point.
   * @param simplex The simplex to shrink.
   * @param best The best point in the simplex.
   */
  private shrink(simplex: number[][], best: number[]): void {
    const shrinkFactor = 0.5;
    for (let i = 1; i < simplex.length; i++) {
      simplex[i] = best.map((b, j) => b + shrinkFactor * (simplex[i][j] - b));
    }
  }

  private checkConvergence(
    simplex: number[][],
    tolerance: number,
    data: Array<[number, number]>
  ): boolean {
    // The simplex is sorted by loss, so simplex[0] is the best point.
    const bestLoss = this.calculateLoss(data, simplex[0]);
    let maxLossDifference = 0;

    for (let i = 1; i < simplex.length; i++) {
      const currentLoss = this.calculateLoss(data, simplex[i]);
      const difference = Math.abs(currentLoss - bestLoss);
      if (difference > maxLossDifference) {
        maxLossDifference = difference;
      }
    }

    // The algorithm has converged if the difference in loss between the best
    // and worst points is less than the tolerance.
    return maxLossDifference < tolerance;
  }
}
