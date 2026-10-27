import { performance } from 'node:perf_hooks';

const targetUrl = process.env.TARGET_URL;
const total = Number(process.env.TOTAL_REQUESTS ?? 500);
const concurrency = Number(process.env.CONCURRENCY ?? 25);
const p95Target = Number(process.env.P95_TARGET_MS ?? 500);
const errorRateTarget = Number(process.env.ERROR_RATE_TARGET ?? 0.01);

if (!targetUrl) throw new Error('TARGET_URL is required.');
if (!Number.isInteger(total) || total < 1)
  throw new Error('TOTAL_REQUESTS must be a positive integer.');
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > total) {
  throw new Error('CONCURRENCY must be between 1 and TOTAL_REQUESTS.');
}

const durations = [];
let errors = 0;
let nextRequest = 0;

async function worker() {
  while (true) {
    const index = nextRequest;
    nextRequest += 1;
    if (index >= total) return;
    const startedAt = performance.now();
    try {
      const response = await fetch(targetUrl, {
        cache: 'no-store',
        headers: { accept: 'application/json' },
      });
      if (!response.ok) errors += 1;
      await response.arrayBuffer();
    } catch {
      errors += 1;
    } finally {
      durations.push(performance.now() - startedAt);
    }
  }
}

const suiteStartedAt = performance.now();
await Promise.all(Array.from({ length: concurrency }, () => worker()));
const elapsedMs = performance.now() - suiteStartedAt;
durations.sort((left, right) => left - right);
const percentileIndex = Math.max(0, Math.ceil(durations.length * 0.95) - 1);
const p95Ms = durations[percentileIndex] ?? Number.POSITIVE_INFINITY;
const errorRate = errors / total;

const result = {
  targetUrl,
  totalRequests: total,
  concurrency,
  requestsPerSecond: Number((total / (elapsedMs / 1000)).toFixed(2)),
  p95Ms: Number(p95Ms.toFixed(2)),
  errors,
  errorRate: Number(errorRate.toFixed(4)),
  passed: p95Ms <= p95Target && errorRate < errorRateTarget,
  thresholds: { p95TargetMs: p95Target, errorRateTarget },
};

console.log(JSON.stringify(result, null, 2));
if (!result.passed) process.exitCode = 1;
