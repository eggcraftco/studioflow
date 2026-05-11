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
