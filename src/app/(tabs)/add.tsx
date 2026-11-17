import { Redirect } from 'expo-router';

/**
 * Ortadaki "+" sekmesinin yer tutucusu. Düğme bu ekrana hiç gitmez
 * (bkz. (tabs)/_layout.tsx — tabBarButton bir alt sayfa açar); yine de
 * bir derin bağlantıyla gelinirse Kitaplığım'a yönlendirilir.
 */
export default function AddPlaceholder() {
  return <Redirect href="/library" />;
}
