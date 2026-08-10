const questionPrefixes = /^(can you|could you|would you|will you|what|why|when|where|who|how|is |are |do |does |did |should |tell me|explain|please)/i;

export function isLikelyQuestion(text: string): boolean {
  const normalized = text.trim();
  return normalized.length >= 12 && (normalized.endsWith("?") || questionPrefixes.test(normalized));
}
