# FOFANA GAMES · Casus Belli + Tabu

Bu paket ana siteyi, Casus Belli'yi ve çevrim içi Tabu oyununu içerir. Go-Kart pakete dahil değildir.

## Yayınlama

Bu proje yalnızca statik HTML olarak yüklenirse çevrim içi oyunlar çalışmaz. Socket.IO kullanan Node.js sunucusu da internette çalışıyor olmalıdır.

### Render ile
1. ZIP'i bilgisayarına çıkar.
2. İçeriği GitHub deposuna yükle.
3. Render'da **New Web Service** oluşturup depoyu bağla.
4. Build Command: `npm install --prefix server --omit=dev --no-audit --no-fund`
5. Start Command: `node server/index.js`
6. Health Check Path: `/health`
7. Yayınlanan ana adresi aç.

### Kendi Node.js sunucunda
Proje ana klasöründe:
```bash
cd server
npm install --omit=dev
npm start
```
Sunucu varsayılan olarak 3000 portunda çalışır ve sağlayıcının `PORT` değişkenini kullanır.

## Oyunlar

### Casus Belli
- Üç sabit çevrim içi oda: CB0001, CB0002, CB0003.
- Her odada iki oyuncu bulunur.

### Tabu
- Bir oyuncu oda oluşturur ve altı karakterli kod alır.
- Diğer oyuncular kendi telefonlarından bu kodla katılır.
- En fazla 12 oyuncu, iki takım.
- Her oyuncu kendi takımını seçip hazır olur.
- Oda sahibi süre, pas hakkı ve hedef skoru belirleyerek oyunu başlatır.
- Sırası gelen anlatıcı turu başlatır. Kelime kartı anlatıcıya ve karşı takım denetçilerine gösterilir; tahmin eden takımın ekranında gizlenir.
- Doğru, Tabu ve Pas işlemleri sunucuda doğrulanır; tur süresi sunucu tarafından yönetilir.
- Maç bitince oda sahibi lobiyi sıfırlayıp aynı grupla yeniden oynayabilir.

## Dosyalar
- `index.html`: Ana sayfa.
- `games/casus-belli/`: Casus Belli istemcisi ve varlıkları.
- `games/tabu/`: Yüklenen Tabu arayüzünün çevrim içi hale getirilmiş sürümü.
- `server/`: Casus Belli ve Tabu sunucu kodları ile kelime kartı havuzu.
- `css/`: Ana sayfa stilleri.
