// app/(auth)/_layout.tsx
import { Stack } from 'expo-router';

// Dette er layoutet for din (auth) gruppe.
// Den definerer, at alle skærme i denne mappe (som index.tsx)
// er en del af en Stack-navigator uden en header.
export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }} />
  );
}