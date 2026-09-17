import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Button, Input, IconButton } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

export default function SignupScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!email || !password) {
      Alert.alert('Missing fields', 'Please enter email and password.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Weak password', 'Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    setLoading(false);

    if (error) {
      Alert.alert('Signup failed', error.message);
      return;
    }

    // After signup, go to onboarding
    router.replace('/(onboarding)/dramas');
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <IconButton
            name="arrow-back"
            onPress={() => router.back()}
            style={styles.back}
          />

          <Text variant="h1" style={styles.title}>
            Join Hallyu
          </Text>
          <Text variant="body" color={colors.textSecondary} style={styles.subtitle}>
            Create your account and start sharing the dramas that own your heart.
          </Text>

          <View style={styles.form}>
            <Input
              label="Email"
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
            <Input
              label="Password"
              placeholder="At least 6 characters"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
            />

            <Button
              title="Create account"
              onPress={handleSignup}
              loading={loading}
              fullWidth
              size="lg"
              style={{ marginTop: spacing.md }}
            />
          </View>

          <Text variant="captionSmall" color={colors.textTertiary} style={styles.legal}>
            By continuing you agree to our Terms and Privacy Policy.
          </Text>

          <View style={styles.footer}>
            <Text variant="callout" color={colors.textSecondary}>
              Already have an account?{' '}
            </Text>
            <Text
              variant="callout"
              color={colors.accent}
              onPress={() => router.push('/(auth)/login')}
            >
              Sign in
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing['2xl'],
    paddingBottom: spacing['4xl'],
  },
  back: {
    marginTop: spacing.md,
    marginBottom: spacing['2xl'],
    alignSelf: 'flex-start',
  },
  title: {
    marginBottom: spacing.sm,
  },
  subtitle: {
    marginBottom: spacing['3xl'],
  },
  form: {
    marginBottom: spacing.xl,
  },
  legal: {
    textAlign: 'center',
    marginBottom: spacing['2xl'],
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 'auto',
  },
});
