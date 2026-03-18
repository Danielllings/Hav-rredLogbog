/**
 * usePurchases Hook - React hook for RevenueCat subscription state
 * Provides easy access to subscription status and purchase functions
 */

import { useState, useEffect, useCallback } from "react";
import {
  CustomerInfo,
  PurchasesOffering,
  PurchasesPackage,
} from "react-native-purchases";
import {
  checkProAccess,
  getCustomerInfo,
  getOfferings,
  purchasePackage,
  restorePurchases,
  addCustomerInfoListener,
  PRO_ENTITLEMENT_ID,
} from "../lib/purchases";

interface UsePurchasesState {
  isPro: boolean;
  isLoading: boolean;
  customerInfo: CustomerInfo | null;
  offerings: PurchasesOffering | null;
  error: string | null;
}

interface UsePurchasesActions {
  purchase: (pkg: PurchasesPackage) => Promise<boolean>;
  restore: () => Promise<boolean>;
  refresh: () => Promise<void>;
}

export function usePurchases(): UsePurchasesState & UsePurchasesActions {
  const [isPro, setIsPro] = useState(DEV_MODE_PRO);
  const [isLoading, setIsLoading] = useState(!DEV_MODE_PRO);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offerings, setOfferings] = useState<PurchasesOffering | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load initial data
  const loadData = useCallback(async () => {
    // Skip RevenueCat in dev mode
    if (DEV_MODE_PRO) {
      setIsPro(true);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [proAccess, info, currentOfferings] = await Promise.all([
        checkProAccess(),
        getCustomerInfo(),
        getOfferings(),
      ]);

      setIsPro(proAccess);
      setCustomerInfo(info);
      setOfferings(currentOfferings);
    } catch (err: any) {
      console.error("[usePurchases] Failed to load data:", err);
      setError(err.message || "Failed to load subscription data");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initialize and listen for updates
  useEffect(() => {
    loadData();

    // Skip listener in dev mode
    if (DEV_MODE_PRO) return;

    // Listen for customer info updates (e.g., subscription renewed)
    const unsubscribe = addCustomerInfoListener((info) => {
      setCustomerInfo(info);
      setIsPro(info.entitlements.active[PRO_ENTITLEMENT_ID] !== undefined);
    });

    return unsubscribe;
  }, [loadData]);

  // Purchase a package
  const purchase = useCallback(async (pkg: PurchasesPackage): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await purchasePackage(pkg);

      if (result.success && result.customerInfo) {
        setCustomerInfo(result.customerInfo);
        setIsPro(result.customerInfo.entitlements.active[PRO_ENTITLEMENT_ID] !== undefined);
        return true;
      }

      return false;
    } catch (err: any) {
      console.error("[usePurchases] Purchase failed:", err);
      setError(err.message || "Purchase failed");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Restore purchases
  const restore = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await restorePurchases();

      if (result.success && result.customerInfo) {
        setCustomerInfo(result.customerInfo);
        setIsPro(result.isPro);
        return result.isPro;
      }

      return false;
    } catch (err: any) {
      console.error("[usePurchases] Restore failed:", err);
      setError(err.message || "Restore failed");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Manual refresh
  const refresh = useCallback(async () => {
    await loadData();
  }, [loadData]);

  return {
    isPro,
    isLoading,
    customerInfo,
    offerings,
    error,
    purchase,
    restore,
    refresh,
  };
}

/**
 * DEV MODE: Set to true to bypass Pro check in Expo Go
 * Remember to set back to false before production build!
 */
const DEV_MODE_PRO = __DEV__ && false; // ← Skift til true for at teste som Pro

/**
 * Simple hook to just check Pro status
 */
export function useIsPro(): { isPro: boolean; isLoading: boolean } {
  const [isPro, setIsPro] = useState(DEV_MODE_PRO);
  const [isLoading, setIsLoading] = useState(!DEV_MODE_PRO);

  useEffect(() => {
    // Skip RevenueCat check in dev mode
    if (DEV_MODE_PRO) {
      setIsPro(true);
      setIsLoading(false);
      return;
    }

    checkProAccess()
      .then(setIsPro)
      .catch(() => setIsPro(false))
      .finally(() => setIsLoading(false));

    const unsubscribe = addCustomerInfoListener((info) => {
      setIsPro(info.entitlements.active[PRO_ENTITLEMENT_ID] !== undefined);
    });

    return unsubscribe;
  }, []);

  return { isPro, isLoading };
}
