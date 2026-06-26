import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  applySyncResults,
  clearSynced,
  enqueue,
  pendingItems,
  type QueuedStamp,
  type StampKind,
} from '@zeitvault/domain';
import { fetchToday, syncStamps, type Session, type TodayResponse } from './src/api';
import { useAuth } from './src/auth';
import { QUEUE_STORAGE_KEY } from './src/config';

function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const r = Math.floor(Math.random() * 16);
    const v = char === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const STATE_LABEL: Record<TodayResponse['status']['state'], string> = {
  out: 'Ausgestempelt',
  in: 'Eingestempelt',
  break: 'In Pause',
};

function formatMinutes(total: number): string {
  return `${Math.floor(total / 60)} h ${String(Math.round(total % 60)).padStart(2, '0')} min`;
}

/** Biometrisches Entsperren (best effort); ohne verfügbare Hardware übersprungen. */
function useBiometricGate(): boolean {
  const [unlocked, setUnlocked] = useState(false);
  useEffect(() => {
    void (async () => {
      try {
        const has = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        if (!has || !enrolled) {
          setUnlocked(true);
          return;
        }
        const res = await LocalAuthentication.authenticateAsync({
          promptMessage: 'ZeitVault entsperren',
        });
        setUnlocked(res.success);
      } catch {
        setUnlocked(true);
      }
    })();
  }, []);
  return unlocked;
}

function MainScreen({ session, employeeId }: { session: Session; employeeId: string }) {
  const [queue, setQueue] = useState<QueuedStamp[]>([]);
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(QUEUE_STORAGE_KEY)
      .then((raw) => {
        if (raw) setQueue(JSON.parse(raw) as QueuedStamp[]);
      })
      .catch(() => undefined);
  }, []);

  const refreshToday = useCallback(() => {
    fetchToday(session, employeeId)
      .then(setToday)
      .catch(() => setToday(null));
  }, [session, employeeId]);

  useEffect(refreshToday, [refreshToday]);

  const persist = useCallback(async (next: QueuedStamp[]) => {
    setQueue(next);
    await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(next));
  }, []);

  const stamp = useCallback(
    (kind: StampKind) => {
      const next = enqueue(queue, {
        clientEventId: uuidv4(),
        kind,
        occurredAt: new Date().toISOString(),
      });
      void persist(next);
    },
    [queue, persist],
  );

  const sync = useCallback(async () => {
    const pending = pendingItems(queue);
    if (pending.length === 0) return;
    setBusy(true);
    try {
      await syncStamps(
        session,
        employeeId,
        pending.map((p) => ({ clientEventId: p.clientEventId, kind: p.kind, occurredAt: p.occurredAt })),
      );
      const results = pending.map((p) => ({ clientEventId: p.clientEventId, ok: true }));
      await persist(clearSynced(applySyncResults(queue, results)));
      refreshToday();
    } catch {
      const results = pending.map((p) => ({ clientEventId: p.clientEventId, ok: false }));
      await persist(applySyncResults(queue, results));
      Alert.alert('Offline', 'Synchronisierung später erneut versuchen.');
    } finally {
      setBusy(false);
    }
  }, [queue, persist, session, employeeId, refreshToday]);

  const pendingCount = pendingItems(queue).length;

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <Text style={styles.title}>ZeitVault</Text>
      <Text style={styles.subtitle}>
        {today ? STATE_LABEL[today.status.state] : 'Lädt …'} · {pendingCount} ausstehend
      </Text>
      {today && (
        <Text style={styles.meta}>
          Arbeit {formatMinutes(today.status.workedMinutes)} · Pause{' '}
          {formatMinutes(today.status.breakMinutes)}
        </Text>
      )}
      {today?.findings.map((f, i) => (
        <Text key={`${f.code}-${i}`} style={f.severity === 'violation' ? styles.violation : styles.warning}>
          {f.severity === 'violation' ? 'Verstoß' : 'Warnung'}: {f.message}
        </Text>
      ))}

      <View style={styles.row}>
        <Pressable style={[styles.button, styles.primary]} onPress={() => stamp('clock_in')}>
          <Text style={styles.buttonText}>Kommen</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.danger]} onPress={() => stamp('clock_out')}>
          <Text style={styles.buttonText}>Gehen</Text>
        </Pressable>
      </View>
      <View style={styles.row}>
        <Pressable style={[styles.button, styles.secondary]} onPress={() => stamp('break_start')}>
          <Text style={styles.buttonText}>Pause beginnen</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.secondary]} onPress={() => stamp('break_end')}>
          <Text style={styles.buttonText}>Pause beenden</Text>
        </Pressable>
      </View>

      <Pressable
        style={[styles.button, styles.sync, busy && styles.disabled]}
        disabled={busy}
        onPress={() => void sync()}
      >
        <Text style={styles.buttonText}>Synchronisieren</Text>
      </Pressable>

      <FlatList
        style={styles.list}
        data={queue}
        keyExtractor={(item) => item.clientEventId}
        renderItem={({ item }) => (
          <Text style={styles.item}>
            {item.kind} · {new Date(item.occurredAt).toLocaleTimeString('de-DE')} · {item.status}
          </Text>
        )}
      />
    </View>
  );
}

export default function App() {
  const unlocked = useBiometricGate();
  const { status, session, employeeId, login } = useAuth();

  if (!unlocked || status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Text style={styles.meta}>Wird geladen …</Text>
      </View>
    );
  }

  if (status === 'unauthenticated' || !session || !employeeId) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>ZeitVault</Text>
        <Text style={styles.subtitle}>Bitte über den Unternehmens-Login anmelden.</Text>
        <Pressable style={[styles.button, styles.primary]} onPress={login}>
          <Text style={styles.buttonText}>Anmelden</Text>
        </Pressable>
      </View>
    );
  }

  return <MainScreen session={session} employeeId={employeeId} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 64, backgroundColor: '#f8fafc' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  title: { fontSize: 28, fontWeight: '700', color: '#0f172a' },
  subtitle: { fontSize: 14, color: '#475569', marginBottom: 12 },
  meta: { fontSize: 13, color: '#475569' },
  warning: { fontSize: 13, color: '#b45309', marginTop: 4 },
  violation: { fontSize: 13, color: '#b91c1c', marginTop: 4 },
  row: { flexDirection: 'row', gap: 12, marginBottom: 12, marginTop: 12 },
  button: { flex: 1, borderRadius: 10, paddingVertical: 18, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  primary: { backgroundColor: '#0f172a' },
  danger: { backgroundColor: '#dc2626' },
  secondary: { backgroundColor: '#475569' },
  sync: { backgroundColor: '#2563eb', marginTop: 12 },
  disabled: { opacity: 0.5 },
  list: { marginTop: 24 },
  item: { fontSize: 13, color: '#334155', paddingVertical: 6 },
});
