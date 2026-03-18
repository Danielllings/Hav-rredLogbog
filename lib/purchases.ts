/**
 * RevenueCat Integration - Havørred Logbog Pro
 * Handles subscriptions, entitlements, and customer management
 */

import { Platform } from "react-native";
import Purchases, {
  PurchasesOffering,
  PurchasesPackage,
  CustomerInfo,
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
} from "react-native-purchases";

// RevenueCat API Key (Production)
const REVENUECAT_API_KEY = "appl_eMkcExAdXMPYVSzjgarDfZdHWNg";

// Entitlement identifier (set this up in RevenueCat dashboard)
export const PRO_ENTITLEMENT_ID = "HavørredLogbog Pro";

// Product identifiers (set these up in App Store Connect / Google Play Console)
export const PRODUCT_IDS = {
  monthly: "havoerred_pro_monthly",
  yearly: "havoerred_pro_yearly",
  lifetime: "havoerred_pro_lifetime",
} as const;

let isConfigured = false;

/**
 * Initialize RevenueCat SDK
 * Call this once at app startup (e.g., in _layout.tsx)
 */
export async function configurePurchases(userId?: string): Promise<void> {
  if (isConfigured) return;

  try {
    // Enable debug logs in development
    if (__DEV__) {
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    }

    // Configure with API key
    Purchases.configure({
      apiKey: REVENUECAT_API_KEY,
      appUserID: userId || undefined, // Let RevenueCat generate anonymous ID if not provided
    });

    isConfigured = true;
    console.log("[RevenueCat] Configured successfully");
  } catch (error) {
    console.error("[RevenueCat] Configuration failed:", error);
    throw error;
  }
}

/**
 * Set user ID after authentication
 * Links purchases to your Firebase user
 */
export async function loginUser(userId: string): Promise<CustomerInfo> {
  try {
    const { customerInfo } = await Purchases.logIn(userId);
    console.log("[RevenueCat] User logged in:", userId);
    return customerInfo;
  } catch (error) {
    console.error("[RevenueCat] Login failed:", error);
    throw error;
  }
}

/**
 * Logout user (when signing out of app)
 */
export async function logoutUser(): Promise<CustomerInfo> {
  try {
    const customerInfo = await Purchases.logOut();
    console.log("[RevenueCat] User logged out");
    return customerInfo;
  } catch (error) {
    console.error("[RevenueCat] Logout failed:", error);
    throw error;
  }
}

/**
 * Check if user has Pro entitlement
 */
export async function checkProAccess(): Promise<boolean> {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    const isPro = customerInfo.entitlements.active[PRO_ENTITLEMENT_ID] !== undefined;
    return isPro;
  } catch (error) {
    console.error("[RevenueCat] Failed to check pro access:", error);
    return false;
  }
}

/**
 * Get current customer info
 */
export async function getCustomerInfo(): Promise<CustomerInfo> {
  try {
    return await Purchases.getCustomerInfo();
  } catch (error) {
    console.error("[RevenueCat] Failed to get customer info:", error);
    throw error;
  }
}

/**
 * Get available subscription offerings
 */
export async function getOfferings(): Promise<PurchasesOffering | null> {
  try {
    const offerings = await Purchases.getOfferings();

    if (offerings.current !== null) {
      return offerings.current;
    }

    console.warn("[RevenueCat] No current offering found");
    return null;
  } catch (error) {
    console.error("[RevenueCat] Failed to get offerings:", error);
    throw error;
  }
}

/**
 * Purchase a subscription package
 */
export async function purchasePackage(
  pkg: PurchasesPackage
): Promise<{ success: boolean; customerInfo?: CustomerInfo; cancelled?: boolean }> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);

    // Check if purchase granted Pro access
    const isPro = customerInfo.entitlements.active[PRO_ENTITLEMENT_ID] !== undefined;

    console.log("[RevenueCat] Purchase completed, Pro access:", isPro);
    return { success: true, customerInfo };
  } catch (error: any) {
    if (error.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) {
      console.log("[RevenueCat] Purchase cancelled by user");
      return { success: false, cancelled: true };
    }

    console.error("[RevenueCat] Purchase failed:", error);
    throw error;
  }
}

/**
 * Restore previous purchases
 */
export async function restorePurchases(): Promise<{
  success: boolean;
  customerInfo?: CustomerInfo;
  isPro: boolean;
}> {
  try {
    const customerInfo = await Purchases.restorePurchases();
    const isPro = customerInfo.entitlements.active[PRO_ENTITLEMENT_ID] !== undefined;

    console.log("[RevenueCat] Purchases restored, Pro access:", isPro);
    return { success: true, customerInfo, isPro };
  } catch (error) {
    console.error("[RevenueCat] Restore failed:", error);
    throw error;
  }
}

/**
 * Get subscription management URL (for Customer Center)
 */
export async function getManagementURL(): Promise<string | null> {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return customerInfo.managementURL;
  } catch (error) {
    console.error("[RevenueCat] Failed to get management URL:", error);
    return null;
  }
}

/**
 * Format price for display
 */
export function formatPackagePrice(pkg: PurchasesPackage): string {
  return pkg.product.priceString;
}

/**
 * Get package duration label
 */
export function getPackageDurationLabel(pkg: PurchasesPackage, language: string = "da"): string {
  const labels: Record<string, Record<string, string>> = {
    da: {
      "$rc_monthly": "Månedligt",
      "$rc_annual": "Årligt",
      "$rc_lifetime": "Livstid",
    },
    en: {
      "$rc_monthly": "Monthly",
      "$rc_annual": "Yearly",
      "$rc_lifetime": "Lifetime",
    },
  };

  return labels[language]?.[pkg.packageType] || pkg.packageType;
}

/**
 * Calculate savings percentage for yearly vs monthly
 */
export function calculateYearlySavings(
  monthlyPkg: PurchasesPackage,
  yearlyPkg: PurchasesPackage
): number {
  const monthlyPrice = monthlyPkg.product.price;
  const yearlyPrice = yearlyPkg.product.price;
  const yearlyAsMonthly = yearlyPrice / 12;

  const savings = ((monthlyPrice - yearlyAsMonthly) / monthlyPrice) * 100;
  return Math.round(savings);
}

/**
 * Listen for customer info updates
 */
export function addCustomerInfoListener(
  listener: (customerInfo: CustomerInfo) => void
): () => void {
  Purchases.addCustomerInfoUpdateListener(listener);

  return () => {
    Purchases.removeCustomerInfoUpdateListener(listener);
  };
}

/**
 * Error message helper
 */
export function getPurchaseErrorMessage(error: any, language: string = "da"): string {
  const messages: Record<string, Record<number, string>> = {
    da: {
      [PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR]: "Køb annulleret",
      [PURCHASES_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR]: "Køb ikke tilladt på denne enhed",
      [PURCHASES_ERROR_CODE.PURCHASE_INVALID_ERROR]: "Ugyldigt køb",
      [PURCHASES_ERROR_CODE.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR]: "Produkt ikke tilgængeligt",
      [PURCHASES_ERROR_CODE.NETWORK_ERROR]: "Netværksfejl - prøv igen",
      [PURCHASES_ERROR_CODE.RECEIPT_ALREADY_IN_USE_ERROR]: "Denne kvittering er allerede brugt",
      [PURCHASES_ERROR_CODE.INVALID_CREDENTIALS_ERROR]: "Ugyldige legitimationsoplysninger",
      [PURCHASES_ERROR_CODE.UNEXPECTED_BACKEND_RESPONSE_ERROR]: "Serverfejl - prøv igen senere",
    },
    en: {
      [PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR]: "Purchase cancelled",
      [PURCHASES_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR]: "Purchase not allowed on this device",
      [PURCHASES_ERROR_CODE.PURCHASE_INVALID_ERROR]: "Invalid purchase",
      [PURCHASES_ERROR_CODE.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR]: "Product not available",
      [PURCHASES_ERROR_CODE.NETWORK_ERROR]: "Network error - try again",
      [PURCHASES_ERROR_CODE.RECEIPT_ALREADY_IN_USE_ERROR]: "This receipt is already in use",
      [PURCHASES_ERROR_CODE.INVALID_CREDENTIALS_ERROR]: "Invalid credentials",
      [PURCHASES_ERROR_CODE.UNEXPECTED_BACKEND_RESPONSE_ERROR]: "Server error - try again later",
    },
  };

  const lang = language === "da" ? "da" : "en";
  return messages[lang][error.code] || (language === "da" ? "Der opstod en fejl" : "An error occurred");
}
