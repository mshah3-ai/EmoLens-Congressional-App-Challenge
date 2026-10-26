/** Small dense linear algebra for symmetric positive-definite matrices (d <= ~40). */

export type Matrix = number[][];

export const zeros = (n: number, m = n): Matrix => Array.from({ length: n }, () => new Array<number>(m).fill(0));
export const identity = (n: number): Matrix => { const I = zeros(n); for (let i = 0; i < n; i++) I[i][i] = 1; return I; };
export const dot = (a: number[], b: number[]): number => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
export function matVec(A: Matrix, x: number[]): number[] { return A.map((row) => dot(row, x)); }
export function matMul(A: Matrix, B: Matrix): Matrix {
  const n = A.length, m = B[0].length, k = B.length;
  const C = zeros(n, m);
  for (let i = 0; i < n; i++) for (let p = 0; p < k; p++) { const a = A[i][p]; if (a !== 0) for (let j = 0; j < m; j++) C[i][j] += a * B[p][j]; }
  return C;
}
/** x^T A x */
export const quadForm = (A: Matrix, x: number[]): number => dot(x, matVec(A, x));

/** Cholesky factor L (lower triangular, A = L L^T), or null if a pivot is not positive. */
export function cholesky(A: Matrix): Matrix | null {
  const n = A.length;
  const L = zeros(n);
  for (let j = 0; j < n; j++) {
    let s = A[j][j];
    for (let k = 0; k < j; k++) s -= L[j][k] * L[j][k];
    if (!(s > 0) || !Number.isFinite(s)) return null;
    const ljj = Math.sqrt(s);
    L[j][j] = ljj;
    for (let i = j + 1; i < n; i++) {
      let t = A[i][j];
      for (let k = 0; k < j; k++) t -= L[i][k] * L[j][k];
      L[i][j] = t / ljj;
    }
  }
  return L;
}

/** Cholesky with jitter eps*I for eps = 0, 1e-9, 1e-8, ..., 1e-3 (spec 13.4). */
export function choleskyJitter(A: Matrix): { L: Matrix; jitter: number } | null {
  const plain = cholesky(A);
  if (plain) return { L: plain, jitter: 0 };
  for (let e = -9; e <= -3; e++) {
    const eps = Math.pow(10, e);
    const B = A.map((row, i) => row.map((v, j) => (i === j ? v + eps : v)));
    const L = cholesky(B);
    if (L) return { L, jitter: eps };
  }
  return null;
}

/** Solve (L L^T) x = b. */
export function cholSolve(L: Matrix, b: number[]): number[] {
  const n = L.length;
  const y = new Array<number>(n);
  for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i][k] * y[k]; y[i] = s / L[i][i]; }
  const x = new Array<number>(n);
  for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k]; x[i] = s / L[i][i]; }
  return x;
}

/** A^{-1} from the Cholesky factor of A (symmetrized). */
export function cholInverse(L: Matrix): Matrix {
  const n = L.length;
  const inv = zeros(n);
  for (let j = 0; j < n; j++) {
    const e = new Array<number>(n).fill(0);
    e[j] = 1;
    const col = cholSolve(L, e);
    for (let i = 0; i < n; i++) inv[i][j] = col[i];
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) { const v = (inv[i][j] + inv[j][i]) / 2; inv[i][j] = v; inv[j][i] = v; }
  return inv;
}

/** log|A| = 2 * sum(log diag(L)). */
export function cholLogDet(L: Matrix): number { let s = 0; for (let i = 0; i < L.length; i++) s += Math.log(L[i][i]); return 2 * s; }
