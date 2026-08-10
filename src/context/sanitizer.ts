const secretPatterns = [
  /\b(?:sk|rk|AIza)[A-Za-z0-9_-]{16,}\b/g,
  /(?:(?:api[_-]?key|token|password|secret)\s*[:=]\s*)[^\s,;]+/gi,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/g,
  /authorization:\s*bearer\s+[^\s]+/gi,
];

export function redactSecrets(value: string): string {
  return secretPatterns.reduce((result, pattern) => result.replace(pattern, "[REDACTED]"), value);
}
