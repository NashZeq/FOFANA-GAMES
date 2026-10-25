# Worms: Tepe Savaşı v1.36

- İki oyunculu Socket.IO oda oluşturma/katılma ve oda sahibinin maçı başlatması.
- Tur sonu arazi, can, aktif oyuncu ve rüzgâr senkronizasyonu.
- Sunucu tarafında oda üyeliği, tur sırası ve oyun durumu sınır kontrolleri.
- `server/test/worms-engine.test.js` içinde oda, oyuncu sınırı, başlangıç yetkisi, sıra denetimi, snapshot doğrulama ve bağlantı kopma testleri.
- Sınır: atış fiziği ve hasar istemcide; rakip cihaz tur sonu durumunu alır, atış animasyonunu eşzamanlı izlemez. Gerçek telefon testi yapılmadı.
