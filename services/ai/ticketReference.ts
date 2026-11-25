/** Só vincula por referência explícita, nunca por inferência do modelo ou por um número solto. */
export function referencedTicketNumber(question: string): string | undefined {
  const matches = [...question.matchAll(/(?:\bticket\s*(?:n[º°o.]?\s*)?[#:]?\s*|#)(\d{1,20})\b/gi)].map(match => match[1]!);
  const numbers = [...new Set(matches)];
  if (numbers.length > 1) throw new Error('Informe um ticket por pergunta para manter os contextos separados.');
  return numbers[0];
}
