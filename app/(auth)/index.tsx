// app/(auth)/index.tsx
import {
  View,
  StyleSheet,
  Pressable,
  Text,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  Animated,
  Image,
  Modal,
} from "react-native";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLanguage } from "../../lib/i18n";
// Firebase login-funktioner
import {
  auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  db,
} from "../../lib/firebase";
import { collection, getDocs, deleteDoc, doc } from "firebase/firestore";

type AuthMode = "initial" | "login" | "signup";
const REMEMBER_EMAIL_KEY = "remember_email";
const REMEMBER_PASSWORD_KEY = "remember_password";

// Demo konto
const DEMO_EMAIL = "demo@havorredlogbog.dk";
const DEMO_PASSWORD = "Havlog2026";


const THEME = {
  bg: "#121212",
  card: "#1C1C1E",
  cardBorder: "#2C2C2E",
  primary: "#FFFFFF",
  accent: "#F59E0B",
  text: "#FFFFFF",
  textSec: "#A1A1AA",
  inputBg: "#2C2C2E",
  danger: "#FF453A",
  success: "#22C55E",
};

export default function LoginScreen() {
  const router = useRouter();
  const { t, language, setLanguage } = useLanguage();
  const [mode, setMode] = useState<AuthMode>("initial");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Demo konto state
  const [demoModalVisible, setDemoModalVisible] = useState(false);
  const [demoDays, setDemoDays] = useState("7");

  // Animationer
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    // Initial animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  useEffect(() => {
    const loadRememberedEmail = async () => {
      try {
        const saved = await AsyncStorage.getItem(REMEMBER_EMAIL_KEY);
        if (saved) {
          setEmail(saved);
          setRememberMe(true);
        }
        await AsyncStorage.removeItem(REMEMBER_PASSWORD_KEY);
      } catch (err) {
        // console.log("Kunne ikke hente gemt email", err);
      }
    };
    loadRememberedEmail();
  }, []);

  async function handleLogin() {
    if (loading || !email || !password) return;

    const normalizedEmail = email.trim().toLowerCase();

    // Tjek for demo-konto - vis modal i stedet for at logge ind
    if (normalizedEmail === DEMO_EMAIL) {
      if (password !== DEMO_PASSWORD) {
        Alert.alert(t("loginError"), "Forkert adgangskode til demo-konto");
        return;
      }
      setDemoModalVisible(true);
      return;
    }

    setLoading(true);
    setErrorText(null);
    try {
      await signInWithEmailAndPassword(auth, normalizedEmail, password);
      if (rememberMe) {
        await AsyncStorage.setItem(REMEMBER_EMAIL_KEY, normalizedEmail);
      } else {
        await AsyncStorage.removeItem(REMEMBER_EMAIL_KEY);
      }
      await AsyncStorage.removeItem(REMEMBER_PASSWORD_KEY);
      router.replace("/(tabs)");
    } catch (error: any) {
      const msg = error?.message || "Ukendt fejl ved login";
      // console.log("Login fejl:", msg);
      setErrorText(msg);
      Alert.alert(t("loginError"), msg);
    }
    setLoading(false);
  }

  // Slet al demo-data for en frisk start
  async function clearDemoData(userId: string) {
    const collections = ["trips", "catches", "spots"];
    for (const colName of collections) {
      try {
        const colRef = collection(db, "users", userId, colName);
        const snapshot = await getDocs(colRef);
        for (const docSnap of snapshot.docs) {
          await deleteDoc(doc(db, "users", userId, colName, docSnap.id));
        }
      } catch (err) {
        // Ignorer fejl ved sletning
      }
    }
    // Slet også lokale offline-ture
    try {
      await AsyncStorage.removeItem("offline_trips_v2");
    } catch {}
  }

  // Demo login efter accept af vilkår
  async function handleDemoAccept() {
    const days = parseInt(demoDays, 10);
    if (isNaN(days) || days < 1 || days > 7) {
      Alert.alert("Ugyldig periode", "Vælg mellem 1 og 7 dage");
      return;
    }

    setLoading(true);
    setErrorText(null);

    try {
      const userCred = await signInWithEmailAndPassword(auth, DEMO_EMAIL, DEMO_PASSWORD);

      if (userCred.user) {
        // Slet tidligere demo-data for frisk start
        await clearDemoData(userCred.user.uid);
      }

      // Gem demo-periode info
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + days);
      await AsyncStorage.setItem("demo_expiry", expiryDate.toISOString());
      await AsyncStorage.setItem("demo_days", String(days));

      setDemoModalVisible(false);
      router.replace("/(tabs)");
    } catch (error: any) {
      const msg = error?.message || "Ukendt fejl ved demo-login";
      setErrorText(msg);
      setDemoModalVisible(false);
      Alert.alert(t("loginError"), msg);
    }
    setLoading(false);
  }

  async function handleSignUp() {
    if (loading || !email || !password) return;
    setLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      Alert.alert(t("userCreated"), t("userCreatedMsg"));
      setMode("login");
    } catch (error: any) {
      Alert.alert(t("signupError"), error.message);
    }
    setLoading(false);
  }

  function goBack() {
    setEmail("");
    setPassword("");
    setErrorText(null);
    setMode("initial");
  }

  return (
    <View style={styles.container}>
      {/* Gradient baggrund */}
      <LinearGradient
        colors={["#1A1207", "#2D1F0D", "#1A1207"]}
        locations={[0, 0.5, 1]}
        style={StyleSheet.absoluteFill}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <Animated.View
          style={[
            styles.inner,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          <View style={styles.card}>
            {/* Logo */}
            <View style={styles.logoContainer}>
              <Image
                source={require("../../assets/android-icon-foreground.png")}
                style={styles.logo}
                resizeMode="contain"
              />
            </View>

            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.appTitle}>{t("appName")}</Text>
              <Text style={styles.appSubtitle}>{t("loginToContinue")}</Text>
            </View>

            {/* Initial: vælg login/opret */}
            {mode === "initial" && (
              <View style={styles.btnGroup}>
                <Pressable
                  style={({ pressed }) => [
                    styles.btnPrimary,
                    pressed && styles.btnPressed,
                  ]}
                  onPress={() => setMode("login")}
                >
                  <Ionicons name="log-in-outline" size={20} color="#000" />
                  <Text style={styles.btnPrimaryText}>{t("login")}</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.btnSecondary,
                    pressed && styles.btnSecondaryPressed,
                  ]}
                  onPress={() => setMode("signup")}
                >
                  <Ionicons name="person-add-outline" size={20} color={THEME.text} />
                  <Text style={styles.btnSecondaryText}>{t("signup")}</Text>
                </Pressable>
              </View>
            )}

            {/* Login formular */}
            {mode === "login" && (
              <>
                <View style={styles.formHeader}>
                  <View style={styles.formIconCircle}>
                    <Ionicons name="log-in-outline" size={22} color={THEME.accent} />
                  </View>
                  <Text style={styles.formTitle}>{t("login")}</Text>
                </View>

                <View style={styles.inputGroup}>
                  <View style={styles.inputWrapper}>
                    <Ionicons
                      name="mail-outline"
                      size={20}
                      color={THEME.textSec}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder={t("email")}
                      placeholderTextColor={THEME.textSec}
                      value={email}
                      onChangeText={setEmail}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      autoComplete="email"
                    />
                  </View>

                  <View style={styles.inputWrapper}>
                    <Ionicons
                      name="lock-closed-outline"
                      size={20}
                      color={THEME.textSec}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder={t("password")}
                      placeholderTextColor={THEME.textSec}
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoComplete="password"
                    />
                    <Pressable
                      onPress={() => setShowPassword(!showPassword)}
                      style={styles.eyeBtn}
                    >
                      <Ionicons
                        name={showPassword ? "eye-off-outline" : "eye-outline"}
                        size={20}
                        color={THEME.textSec}
                      />
                    </Pressable>
                  </View>
                </View>

                <Pressable
                  style={styles.rememberRow}
                  onPress={() => setRememberMe((prev) => !prev)}
                  disabled={loading}
                >
                  <View
                    style={[styles.checkbox, rememberMe && styles.checkboxChecked]}
                  >
                    {rememberMe && (
                      <Ionicons name="checkmark" size={14} color="#000" />
                    )}
                  </View>
                  <Text style={styles.rememberLabel}>{t("rememberMe")}</Text>
                </Pressable>

                {errorText && (
                  <View style={styles.errorBox}>
                    <Ionicons name="alert-circle" size={18} color={THEME.danger} />
                    <Text style={styles.errorText}>{errorText}</Text>
                  </View>
                )}

                <View style={styles.btnGroup}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.btnPrimary,
                      pressed && styles.btnPressed,
                      loading && styles.btnDisabled,
                    ]}
                    onPress={handleLogin}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="#000" />
                    ) : (
                      <>
                        <Ionicons name="arrow-forward" size={20} color="#000" />
                        <Text style={styles.btnPrimaryText}>{t("login")}</Text>
                      </>
                    )}
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.btnGhost,
                      pressed && styles.btnGhostPressed,
                    ]}
                    onPress={goBack}
                    disabled={loading}
                  >
                    <Ionicons name="chevron-back" size={20} color={THEME.textSec} />
                    <Text style={styles.btnGhostText}>{t("back")}</Text>
                  </Pressable>
                </View>
              </>
            )}

            {/* Signup formular */}
            {mode === "signup" && (
              <>
                <View style={styles.formHeader}>
                  <View style={styles.formIconCircle}>
                    <Ionicons name="person-add-outline" size={22} color={THEME.accent} />
                  </View>
                  <Text style={styles.formTitle}>{t("signup")}</Text>
                </View>

                <View style={styles.inputGroup}>
                  <View style={styles.inputWrapper}>
                    <Ionicons
                      name="mail-outline"
                      size={20}
                      color={THEME.textSec}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder={t("email")}
                      placeholderTextColor={THEME.textSec}
                      value={email}
                      onChangeText={setEmail}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      autoComplete="email"
                    />
                  </View>

                  <View style={styles.inputWrapper}>
                    <Ionicons
                      name="lock-closed-outline"
                      size={20}
                      color={THEME.textSec}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder={t("passwordHint")}
                      placeholderTextColor={THEME.textSec}
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      autoComplete="new-password"
                    />
                    <Pressable
                      onPress={() => setShowPassword(!showPassword)}
                      style={styles.eyeBtn}
                    >
                      <Ionicons
                        name={showPassword ? "eye-off-outline" : "eye-outline"}
                        size={20}
                        color={THEME.textSec}
                      />
                    </Pressable>
                  </View>
                </View>

                <View style={styles.btnGroup}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.btnPrimary,
                      pressed && styles.btnPressed,
                      loading && styles.btnDisabled,
                    ]}
                    onPress={handleSignUp}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator color="#000" />
                    ) : (
                      <>
                        <Ionicons name="person-add" size={20} color="#000" />
                        <Text style={styles.btnPrimaryText}>{t("signup")}</Text>
                      </>
                    )}
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.btnGhost,
                      pressed && styles.btnGhostPressed,
                    ]}
                    onPress={goBack}
                    disabled={loading}
                  >
                    <Ionicons name="chevron-back" size={20} color={THEME.textSec} />
                    <Text style={styles.btnGhostText}>{t("back")}</Text>
                  </Pressable>
                </View>
              </>
            )}

            {/* Sprogvalg / Language selector */}
            <View style={styles.langSection}>
              <View style={styles.langDivider} />
              <View style={styles.langRow}>
                <Pressable
                  style={[styles.langBtn, language === "da" && styles.langBtnActive]}
                  onPress={() => setLanguage("da")}
                >
                  <Text style={[styles.langBtnText, language === "da" && styles.langBtnTextActive]}>
                    Dansk
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.langBtn, language === "en" && styles.langBtnActive]}
                  onPress={() => setLanguage("en")}
                >
                  <Text style={[styles.langBtnText, language === "en" && styles.langBtnTextActive]}>
                    English
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Animated.View>
      </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      {/* Demo-konto modal */}
      <Modal
        visible={demoModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !loading && setDemoModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
            <View style={styles.modalIconCircle}>
              <Ionicons name="fish" size={28} color={THEME.accent} />
            </View>

            <Text style={styles.modalTitle}>Demo-konto</Text>

            <Text style={styles.modalText}>
              Du er ved at logge ind på en demo-konto til test af Havørred Logbog.
            </Text>

            <View style={styles.modalBullets}>
              <Text style={styles.modalBullet}>• Kontoen er til demonstration og test</Text>
              <Text style={styles.modalBullet}>• Al data slettes automatisk når perioden udløber</Text>
              <Text style={styles.modalBullet}>• Du kan selv slette data via Indstillinger</Text>
            </View>

            <Text style={styles.modalLabel}>Vælg testperiode (maks 7 dage):</Text>
            <View style={styles.daysInputWrapper}>
              <TextInput
                style={styles.daysInput}
                value={demoDays}
                onChangeText={(text) => {
                  const num = text.replace(/[^0-9]/g, "");
                  if (num === "" || (parseInt(num, 10) >= 1 && parseInt(num, 10) <= 7)) {
                    setDemoDays(num);
                  }
                }}
                keyboardType="number-pad"
                maxLength={1}
                placeholder="7"
                placeholderTextColor={THEME.textSec}
              />
              <Text style={styles.daysLabel}>dage</Text>
            </View>

            <Text style={styles.modalDisclaimer}>
              Ved at fortsætte accepterer du disse vilkår.
            </Text>

            <View style={styles.modalBtnGroup}>
              <Pressable
                style={({ pressed }) => [
                  styles.modalBtnPrimary,
                  pressed && styles.btnPressed,
                  loading && styles.btnDisabled,
                ]}
                onPress={handleDemoAccept}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <ActivityIndicator color="#000" size="small" />
                    <Text style={styles.modalBtnPrimaryText}>Forbereder demo...</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="#000" />
                    <Text style={styles.modalBtnPrimaryText}>Acceptér & Login</Text>
                  </>
                )}
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.modalBtnGhost,
                  pressed && styles.btnGhostPressed,
                ]}
                onPress={() => setDemoModalVisible(false)}
                disabled={loading}
              >
                <Text style={styles.modalBtnGhostText}>Annuller</Text>
              </Pressable>
            </View>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1A1207",
  },
  keyboardView: {
    flex: 1,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "rgba(28, 28, 30, 0.85)",
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 10,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: -25,
  },
  logo: {
    width: 280,
    height: 180,
  },
  header: {
    marginBottom: 28,
  },
  appTitle: {
    color: THEME.text,
    fontSize: 26,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: 0.3,
  },
  appSubtitle: {
    color: THEME.textSec,
    fontSize: 14,
    textAlign: "center",
    marginTop: 6,
  },
  formHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 20,
  },
  formIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(245, 158, 11, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  formTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: THEME.text,
  },
  inputGroup: {
    gap: 12,
    marginBottom: 16,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    paddingHorizontal: 14,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: THEME.text,
  },
  eyeBtn: {
    padding: 8,
    marginRight: -8,
  },
  rememberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  checkboxChecked: {
    borderColor: THEME.accent,
    backgroundColor: THEME.accent,
  },
  rememberLabel: {
    color: THEME.text,
    fontSize: 14,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255, 69, 58, 0.1)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: THEME.danger,
    fontSize: 13,
    flex: 1,
  },
  btnGroup: {
    gap: 10,
  },
  btnPrimary: {
    backgroundColor: THEME.accent,
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  btnPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  btnDisabled: {
    opacity: 0.7,
  },
  btnPrimaryText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "700",
  },
  btnSecondary: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
  },
  btnSecondaryPressed: {
    opacity: 0.9,
    backgroundColor: "rgba(255, 255, 255, 0.15)",
  },
  btnSecondaryText: {
    color: THEME.text,
    fontSize: 16,
    fontWeight: "600",
  },
  btnGhost: {
    borderRadius: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  btnGhostPressed: {
    opacity: 0.7,
  },
  btnGhostText: {
    color: THEME.textSec,
    fontSize: 15,
    fontWeight: "600",
  },

  // Language selector
  langSection: {
    marginTop: 24,
  },
  langDivider: {
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    marginBottom: 16,
  },
  langRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
  },
  langBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  langBtnActive: {
    backgroundColor: THEME.accent,
  },
  langBtnText: {
    color: THEME.textSec,
    fontSize: 14,
    fontWeight: "600",
  },
  langBtnTextActive: {
    color: "#000",
  },

  // Demo modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: THEME.card,
    borderRadius: 24,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  modalIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(245, 158, 11, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: THEME.text,
    marginBottom: 12,
  },
  modalText: {
    fontSize: 14,
    color: THEME.textSec,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 16,
  },
  modalBullets: {
    alignSelf: "stretch",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  modalBullet: {
    fontSize: 13,
    color: THEME.text,
    lineHeight: 22,
  },
  modalLabel: {
    fontSize: 13,
    color: THEME.textSec,
    marginBottom: 10,
  },
  daysInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 20,
  },
  daysInput: {
    width: 60,
    height: 50,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    fontSize: 24,
    fontWeight: "600",
    color: THEME.text,
    textAlign: "center",
  },
  daysLabel: {
    fontSize: 16,
    color: THEME.text,
  },
  modalDisclaimer: {
    fontSize: 12,
    color: THEME.textSec,
    textAlign: "center",
    marginBottom: 20,
    fontStyle: "italic",
  },
  modalBtnGroup: {
    width: "100%",
    gap: 10,
  },
  modalBtnPrimary: {
    backgroundColor: THEME.accent,
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  modalBtnPrimaryText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "700",
  },
  modalBtnGhost: {
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  modalBtnGhostText: {
    color: THEME.textSec,
    fontSize: 15,
    fontWeight: "600",
  },
});
