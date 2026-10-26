/**
 * Is this phone connected to the internet? (expo-network). Asked only after a cloud request failed, to tell "no
 * internet on the phone" apart from "the server or the AI is down" (BUGS #31). Unknown answers count as online, so a
 * wrong guess never blocks anything.
 */
import * as Network from 'expo-network';

export async function deviceOffline(): Promise<boolean> {
  try {
    const s = await Network.getNetworkStateAsync();
    return s.isConnected === false || s.isInternetReachable === false;
  } catch {
    return false;
  }
}
