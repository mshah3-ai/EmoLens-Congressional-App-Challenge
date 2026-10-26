/**
 * The database encryption key (SPEC 3.1): 32 random bytes made on first launch, stored in the phone's
 * Keychain (iOS) / Keystore (Android) through expo-secure-store. It never leaves the device.
 */
import { getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const KEY_NAME = 'emolens.db.key.v1';
const DEVICE_ID_NAME = 'emolens.device.id.v1';

const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

const storeOptions: SecureStore.SecureStoreOptions = {
  // Readable after the first unlock since boot, so background tasks (Phase 4) can open the database.
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export async function getOrCreateDbKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY_NAME, storeOptions);
  if (existing) return existing;
  const key = toHex(getRandomBytes(32));
  await SecureStore.setItemAsync(KEY_NAME, key, storeOptions);
  return key;
}

/** A random id for this install; stored in every synced row's device_id column. */
export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_NAME, storeOptions);
  if (existing) return existing;
  const id = toHex(getRandomBytes(16));
  await SecureStore.setItemAsync(DEVICE_ID_NAME, id, storeOptions);
  return id;
}

export async function deleteKeys(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_NAME, storeOptions);
  await SecureStore.deleteItemAsync(DEVICE_ID_NAME, storeOptions);
}
