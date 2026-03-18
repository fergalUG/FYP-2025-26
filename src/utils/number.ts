export const roundTo = (value: number, fractionDigits: number): number => {
  return Number(value.toFixed(fractionDigits));
};
