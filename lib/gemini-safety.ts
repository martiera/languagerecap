const INJECTION_PATTERNS = [
  /\b(ignore|disregard|forget|override)\b.{0,80}\b(previous|prior|above|system|developer|user|instructions?|prompt)\b/i,
  /\b(reveal|show|print|repeat|expose)\b.{0,80}\b(system|developer|hidden|internal)\b.{0,40}\b(prompt|instructions?|message)\b/i,
  /\b(you are now|act as|pretend to be)\b.{0,80}\b(system|developer|admin|assistant|unrestricted)\b/i,
  /\b(system|developer)\s*(prompt|message|instruction)\s*:/i,
  /\b(do not|don't)\b.{0,60}\b(extract|translate|follow)\b.{0,60}\b(note|lesson|user)\b.{0,60}\b(instead|instruction)\b/i,
];

export function containsPromptInjection(text: string) {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}
