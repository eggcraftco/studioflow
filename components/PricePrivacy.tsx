"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const STORAGE_KEY = "studioflow-hide-sensitive-numbers";

type PricePrivacyContextValue = {
  hideNumbers: boolean;
  toggleHideNumbers: () => void;
};

const PricePrivacyContext = createContext<PricePrivacyContextValue>({
  hideNumbers: false,
  toggleHideNumbers: () => undefined
});

export function hiddenMoneyLabel(currency = "£") {
  return `${currency}••••`;
}

export function PricePrivacyProvider({ children }: { children: ReactNode }) {
  const [hideNumbers, setHideNumbers] = useState(false);

  useEffect(() => {
    try {
      setHideNumbers(window.localStorage.getItem(STORAGE_KEY) === "true");
    } catch {
      setHideNumbers(false);
    }
  }, []);

  const value = useMemo<PricePrivacyContextValue>(() => ({
    hideNumbers,
    toggleHideNumbers: () => {
      setHideNumbers(current => {
        const next = !current;
        try {
          window.localStorage.setItem(STORAGE_KEY, String(next));
        } catch {
          // Local storage is only a convenience mirror of the app's AppStorage behavior.
        }
        return next;
      });
    }
  }), [hideNumbers]);

  return <PricePrivacyContext.Provider value={value}>{children}</PricePrivacyContext.Provider>;
}

export function usePricePrivacy() {
  return useContext(PricePrivacyContext);
}

// FIN-01 (21 Oct 2026): a screen subtree for somebody without Financial Info.
// Every usePrivateMoney() below it prints the hidden label whatever the
// toolbar switch says, and useCanSeeCost() is false. The server already zeroes
// the figures; this keeps the screen from presenting those zeros as prices.
const CostVisibilityContext = createContext(true);

export function FinanceHiddenMoney({ children }: { children: ReactNode }) {
  const forced = useMemo<PricePrivacyContextValue>(() => ({ hideNumbers: true, toggleHideNumbers: () => undefined }), []);
  return (
    <CostVisibilityContext.Provider value={false}>
      <PricePrivacyContext.Provider value={forced}>{children}</PricePrivacyContext.Provider>
    </CostVisibilityContext.Provider>
  );
}

export function useCanSeeCost() {
  return useContext(CostVisibilityContext);
}

/**
 * Money formatter that obeys the toolbar's hide-figures switch. Screens used
 * to keep private copies of this formatting, which is why newer areas
 * (inventory, banking) kept showing figures the switch was meant to cover.
 */
export function usePrivateMoney() {
  const { hideNumbers } = usePricePrivacy();
  return useMemo(
    () => (symbol: string, value: number) =>
      hideNumbers
        ? hiddenMoneyLabel(symbol)
        : `${(Number(value) || 0) < 0 ? "−" : ""}${symbol}${Math.abs(Number(value) || 0).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          })}`,
    [hideNumbers]
  );
}
