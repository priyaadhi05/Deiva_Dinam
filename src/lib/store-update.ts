import AsyncStorage from '@react-native-async-storage/async-storage';
import * as InAppUpdates from 'expo-in-app-updates';
import { Platform } from 'react-native';

// Tells people already on an older Play Store version that a newer one is
// out, using Google Play's own in-app update dialog: "Update" downloads it in
// the background and the app restarts into the new version once it's ready.
// Android only - the app isn't on the App Store yet, and there's no store to
// check in development builds.
const DECLINED_KEY = 'deiva-dinam:store-update-declined';

// Someone who taps "No thanks" isn't asked again about that same version
// for a few days, so the dialog doesn't greet them on every launch.
const ASK_AGAIN_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

type Declined = { storeVersion: string; at: number };

async function recentlyDeclined(storeVersion: string): Promise<boolean> {
  const raw = await AsyncStorage.getItem(DECLINED_KEY);
  if (raw === null) return false;
  try {
    const declined: Declined = JSON.parse(raw);
    return declined.storeVersion === storeVersion && Date.now() - declined.at < ASK_AGAIN_AFTER_MS;
  } catch {
    return false;
  }
}

// Checks Play once per launch. Every failure (no Play Store on the phone,
// installed outside Play, offline) is ignored - this must never get in the
// way of opening the app.
export async function promptForStoreUpdate(): Promise<void> {
  if (__DEV__ || Platform.OS !== 'android') return;

  try {
    const result = await InAppUpdates.checkForUpdate();
    if (!result.updateAvailable || !result.flexibleAllowed) return;
    if (await recentlyDeclined(result.storeVersion)) return;

    const removeListener = InAppUpdates.addUpdateListener('updateCancelled', () => {
      removeListener();
      const declined: Declined = { storeVersion: result.storeVersion, at: Date.now() };
      AsyncStorage.setItem(DECLINED_KEY, JSON.stringify(declined)).catch(() => {});
    });

    // false = a flexible update: the person keeps using the app while it
    // downloads, rather than being blocked on a full-screen update.
    const started = await InAppUpdates.startUpdate(false);
    if (!started) removeListener();
  } catch (err) {
    console.warn('checking for a Play Store update failed', err);
  }
}
