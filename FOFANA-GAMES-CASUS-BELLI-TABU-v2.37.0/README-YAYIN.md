# FOFANA GAMES · Casus Belli + Tabu

Paket içeriği: Ana sayfa, Casus Belli ve Tabu. Go-Kart dahil değildir.

## Lobi kuralı

Her oyunun kendine ait yalnızca bir ortak lobisi vardır:
- Casus Belli: `CASUS01` ortak lobisi, aynı anda 2 oyuncu.
- Tabu: `TABU01` ortak lobisi, en fazla 12 oyuncu.
- Oyuncular oda oluşturmaz, oda kodu üretmez veya girmez. Oyunun sayfasına girip ortak lobiye katılır.

## Yayına alma (Render)

1. ZIP'i bilgisayarına çıkar.
2. Dosyaları bir GitHub deposuna yükle.
3. Render'da **New + → Web Service** seçip depoyu bağla.
4. Build Command: `npm install --prefix server --omit=dev --no-audit --no-fund`
5. Start Command: `node server/index.js`
6. Health Check Path: `/health`
7. Deploy tamamlanınca Render'ın verdiği `https://...onrender.com` adresini aç.

Bu proje Socket.IO kullandığı için yalnızca statik site olarak yüklenemez. Node.js sunucusu çalışmalıdır.

## Nasıl test edilir?

### Önce sunucunun çalıştığını kontrol et
Yayın adresinin sonuna `/health` ekle. Örneğin:
`https://SENIN-SITE-ADRESIN.onrender.com/health`

Yanıtta `ok: true` görünmeli.

### Tabu testi
1. İlk telefonda veya bilgisayarda ana siteyi aç, Tabu'ya gir.
2. Bir oyuncu adı yazıp **Tabu lobisine katıl** düğmesine bas.
3. İkinci telefonda aynı siteyi açıp farklı bir adla aynı ortak lobiye katıl.
4. İki oyuncudan biri A, diğeri B takımını seçsin.
5. İkisi de hazır olsun. Oda sahibi oyunu başlatsın.
6. Anlatıcı turu başlatsın; doğru, Tabu ve Pas düğmelerini deneyin. Diğer telefonda skor ve tur değişimini kontrol edin.

### Casus Belli testi
1. İki ayrı cihazdan Casus Belli'yi açın.
2. Farklı komutan adlarıyla **Casus Belli ortak lobisine katıl** düğmesine basın.
3. İki oyuncu farklı krallıkları seçip hazır olsun.
4. Maçı başlatıp kart çekme, kart oynama ve tur ilerlemesini iki ekranda kontrol edin.

## Yerel test (bilgisayarında)
Node.js 18 veya üstü kurulu olmalı:
```bash
cd server
npm install
npm test
npm start
```
Ardından `http://localhost:3000` adresini aç. İkinci cihazdan denemek için aynı Wi-Fi ağında bilgisayarının yerel IP adresini kullan: `http://BILGISAYARIN-IP:3000`.

## Test notu
Otomatik oyun motoru ve tek-lobi politika testleri `npm test` ile çalışır. Gerçek iki cihazlı Socket.IO testi ayrıca yapılmalıdır.
