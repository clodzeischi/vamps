export const money = (n: number) => (n < 0 ? "−$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");

export const signed = (n: number, digits = 0) => (n > 0 ? "+" : n < 0 ? "−" : "±") + Math.abs(n).toFixed(digits);

const SUPPORT_WORDS: Record<number, string> = {
  5: "Devoted", 4: "Loyal", 3: "Friendly", 2: "Cooperative", 1: "Tolerant", 0: "Indifferent",
  [-1]: "Wary", [-2]: "Suspicious", [-3]: "Hostile", [-4]: "In thrall", [-5]: "Owned",
};
export const supportWord = (support: number) => SUPPORT_WORDS[Math.max(-5, Math.min(5, Math.round(support)))]!;

export const supportTone = (support: number) => (support >= 0.5 ? "good" : support > -1.5 ? "warn" : "bad");
