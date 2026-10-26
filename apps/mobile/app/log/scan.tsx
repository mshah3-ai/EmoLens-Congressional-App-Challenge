/**
 * Barcode scanner for foods (SPEC 10.4). The camera image is only used to read the barcode and is never saved.
 * The number is looked up in Open Food Facts; if it isn't found, the parent can type the food's name instead.
 */
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Camera } from 'lucide-react-native';
import { lookupBarcode } from '../../src/integrations/food';
import { useFoodPick } from '../../src/store/foodPick';
import { Button } from '../../src/ui/Button';
import { Card } from '../../src/ui/Card';
import { Input } from '../../src/ui/Field';
import { EmptyState } from '../../src/ui/bits';
import { Sheet } from '../../src/ui/layout';
import { T } from '../../src/ui/Text';
import { radius, space } from '../../src/ui/theme';

export default function ScanSheet() {
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<'scanning' | 'looking' | 'not_found' | 'error'>('scanning');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const busy = useRef(false);
  const put = useFoodPick((s) => s.put);

  const onScanned = async (data: string) => {
    if (busy.current) return;
    busy.current = true;
    setCode(data); setPhase('looking');
    try {
      const food = await lookupBarcode(data);
      if (food) { put(food); router.back(); return; }
      setPhase('not_found');
    } catch {
      setPhase('error');
    }
  };

  if (!permission) return <Sheet title={t('scan.title')}><View /></Sheet>;
  if (!permission.granted) {
    return (
      <Sheet title={t('scan.title')}>
        <Card><EmptyState icon={Camera} title={t('scan.permissionTitle')} body={t('scan.permissionBody')}
          action={<Button small label={t('scan.allow')} onPress={() => void requestPermission()} />} /></Card>
      </Sheet>
    );
  }
  return (
    <Sheet title={t('scan.title')}>
      {phase === 'scanning' || phase === 'looking' ? (
        <View style={styles.cameraWrap}>
          <CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
            onBarcodeScanned={phase === 'scanning' ? (r) => void onScanned(r.data) : undefined} />
        </View>
      ) : null}
      <T variant="callout" color="muted" center>{phase === 'looking' ? t('scan.looking') : t('scan.hint')}</T>
      {phase === 'not_found' || phase === 'error' ? (
        <Card style={{ gap: space.md }}>
          <T variant="headline">{phase === 'error' ? t('scan.offline') : t('scan.notFound')}</T>
          <Input label={t('scan.typeName')} placeholder={t('scan.typeName')} value={name} onChangeText={setName} autoFocus />
          <Button label={t('common.add')} disabled={!name.trim()} onPress={() => { put({ name: name.trim(), source: 'custom', code, tags: [] }); router.back(); }} />
          <Button variant="ghost" label={t('scan.again')} onPress={() => { busy.current = false; setPhase('scanning'); }} />
        </Card>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  cameraWrap: { aspectRatio: 1, borderRadius: radius.card, overflow: 'hidden', backgroundColor: '#000' },
});
