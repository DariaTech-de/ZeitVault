import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  applySyncResults,
  clearSynced,
  enqueue,
  pendingItems,
  type QueuedStamp,
  type StampKind,
} from '@zeitvault/domain';

// Im Emulator: Android -> 10.0.2.2, iOS-Simulator -> localhost. Produktion: HTTPS.
const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://10.0.2.2:3000';
const TENANT_ID = process.env.EXPO_PUBLIC_TENANT_ID ?? 'default';
const USER_ID = process.env.EXPO_PUBLIC_USER_ID ?? '00000000-0000-0000-0000-000000000001';
const EMPLOYEE_ID = process.env.EXPO_PUBLIC_EMPLOYEE_ID ?? '00000000-0000-0000-0000-000000000001';
const STORAGE_KEY = 'zeitvault.queue';

function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const r = Math.floor(Math.random() * 16);
    const v = char === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function App() {
  const [queue, setQueue] = useState<QueuedStamp[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setQueue(JSON.parse(raw) as QueuedStamp[]);
      })
      .catch(() => undefined);
  }, []);

  const persist = useCallback(async (next: QueuedStamp[]) => {
    setQueue(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
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
      const res = await fetch(`${API_BASE}/api/stamp/sync`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-tenant-id': TENANT_ID,
          'x-user-id': USER_ID,
          'x-roles': 'employee',
        },
        body: JSON.stringify({
          employeeId: EMPLOYEE_ID,
          items: pending.map((p) => ({
            clientEventId: p.clientEventId,
            kind: p.kind,
            occurredAt: p.occurredAt,
          })),
        }),
      });
      const ok = res.ok;
      const results = pending.map((p) => ({ clientEventId: p.clientEventId, ok }));
      await persist(clearSynced(applySyncResults(queue, results)));
      if (!ok) Alert.alert('Sync fehlgeschlagen', `HTTP ${res.status}`);
    } catch {
      const results = pending.map((p) => ({ clientEventId: p.clientEventId, ok: false }));
      await persist(applySyncResults(queue, results));
      Alert.alert('Offline', 'Synchronisierung später erneut versuchen.');
    } finally {
      setBusy(false);
    }
  }, [queue, persist]);

  const pendingCount = pendingItems(queue).length;

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <Text style={styles.title}>ZeitVault</Text>
      <Text style={styles.subtitle}>Offline-Erfassung · {pendingCount} ausstehend</Text>

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

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 64, backgroundColor: '#f8fafc' },
  title: { fontSize: 28, fontWeight: '700', color: '#0f172a' },
  subtitle: { fontSize: 14, color: '#475569', marginBottom: 24 },
  row: { flexDirection: 'row', gap: 12, marginBottom: 12 },
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
