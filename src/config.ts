/**
 * Uygulama genelindeki tek-nokta ayarlar. Uygulamanın adı henüz kesin
 * değil — değiştirmek için sadece APP_NAME'i (ve app.json'daki "name"i)
 * güncellemek yeterli.
 */
export const APP_NAME = 'EighteenEleven';

/**
 * Laravel API adresi. Telefonun bilgisayara ulaşabilmesi için
 * `php artisan serve --host 0.0.0.0 --port 8000` ile başlatıp burada
 * bilgisayarın yerel ağ IP'sini kullanın. Ayarlar ekranından da
 * değiştirilebilir (kalıcı olarak saklanır).
 */
export const DEFAULT_API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://192.168.1.10:8000/api';
