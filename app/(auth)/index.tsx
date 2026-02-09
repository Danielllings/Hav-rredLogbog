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
  Dimensions,
} from "react-native";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useLanguage } from "../../lib/i18n";
// Firebase login-funktioner
import {
  auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "../../lib/firebase";

type AuthMode = "initial" | "login" | "signup";
const REMEMBER_EMAIL_KEY = "remember_email";
const REMEMBER_PASSWORD_KEY = "remember_password";

const { width } = Dimensions.get("window");

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
  const { t } = useLanguage();
  const [mode, setMode] = useState<AuthMode>("initial");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Animationer
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const logoScale = useRef(new Animated.Value(0.8)).current;
  const waveAnim = useRef(new Animated.Value(0)).current;

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
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    // Wave animation loop
    Animated.loop(
      Animated.sequence([
        Animated.timing(waveAnim, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.timing(waveAnim, {
          toValue: 0,
          duration: 3000,
          useNativeDriver: true,
        }),
      ])
    ).start();
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
        console.log("Kunne ikke hente gemt email", err);
      }
    };
    loadRememberedEmail();
  }, []);

  async function handleLogin() {
    if (loading || !email || !password) return;
    setLoading(true);
    setErrorText(null);
    try {
      const normalizedEmail = email.trim();
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
      console.log("Login fejl:", msg);
      setErrorText(msg);
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

  const waveTranslate = waveAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 15],
  });

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      {/* Background decoration */}
      <View style={styles.bgDecoration}>
        <Animated.View
          style={[
            styles.wave,
            styles.wave1,
            { transform: [{ translateY: waveTranslate }] },
          ]}
        />
        <Animated.View
          style={[
            styles.wave,
            styles.wave2,
            {
              transform: [
                {
                  translateY: waveAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [8, -8],
                  }),
                },
              ],
            },
          ]}
        />
      </View>

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
          {/* Logo */}
          <Animated.View
            style={[styles.logoContainer, { transform: [{ scale: logoScale }] }]}
          >
            <View style={styles.logoCircle}>
              <Ionicons name="fish" size={40} color={THEME.accent} />
            </View>
          </Animated.View>

          <View style={styles.card}>
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
          </View>
        </Animated.View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.bg,
  },
  bgDecoration: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  wave: {
    position: "absolute",
    width: width * 2.5,
    height: 300,
    borderRadius: 150,
    opacity: 0.04,
  },
  wave1: {
    backgroundColor: THEME.accent,
    bottom: -150,
    left: -width * 0.5,
  },
  wave2: {
    backgroundColor: THEME.accent,
    bottom: -200,
    left: -width * 0.3,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  logoContainer: {
    marginBottom: 24,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    borderWidth: 2,
    borderColor: "rgba(245, 158, 11, 0.3)",
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: THEME.card,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
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
    backgroundColor: "rgba(245, 158, 11, 0.15)",
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
    backgroundColor: THEME.inputBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
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
    borderColor: THEME.cardBorder,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: THEME.inputBg,
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
    backgroundColor: THEME.primary,
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
    backgroundColor: THEME.inputBg,
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  btnSecondaryPressed: {
    opacity: 0.9,
    backgroundColor: THEME.cardBorder,
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
});
