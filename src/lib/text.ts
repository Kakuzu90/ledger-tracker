/** Two-character label for a list tile: "Transport" → "Tr", "Car loan" → "CL". */
export function abbreviate(name: string): string {
  const words = name.trim().split(/\s+/)
  if (words.length > 1) {
    return `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}`.toUpperCase()
  }
  const word = words[0] ?? ''
  return `${(word[0] ?? '').toUpperCase()}${(word[1] ?? '').toLowerCase()}`
}

/** "Juan Dela Cruz" → "Juan". Used wherever a message addresses someone. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name
}

/**
 * Lowercases the first letter so a note reads inside a sentence: "Concert
 * tickets" → "concert tickets". Left alone when it starts with an acronym or
 * a proper noun that is already capitalised oddly ("BDO", "iPhone").
 */
export function sentenceCase(text: string): string {
  const [first = '', second = ''] = [text[0] ?? '', text[1] ?? '']
  if (first !== first.toUpperCase()) return text
  if (second !== '' && second === second.toUpperCase() && /[A-Za-z]/.test(second)) return text
  return first.toLowerCase() + text.slice(1)
}
