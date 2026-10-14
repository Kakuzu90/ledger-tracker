/** Two-character label for a list tile: "Transport" → "Tr", "Car loan" → "CL". */
export function abbreviate(name: string): string {
  const words = name.trim().split(/\s+/)
  if (words.length > 1) {
    return `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}`.toUpperCase()
  }
  const word = words[0] ?? ''
  return `${(word[0] ?? '').toUpperCase()}${(word[1] ?? '').toLowerCase()}`
}
