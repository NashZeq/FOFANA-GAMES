# Worms QA Raporu v1.37

## Değişiklikler
- Çevrimiçi atış parametreleri istemciden alınır; mermi simülasyonu, çarpışma, hasar, patlama yarıçapı, krater ve tur geçişi sunucuda hesaplanır.
- İstemci yalnızca başlangıç tahtasını bir kez sunabilir. Sonraki oyun durumları sunucu tarafından üretilir.
- `worms:fire` ve `worms:pass` olayları oda üyeliği ve aktif tur üzerinden doğrulanır.
- Oyun sonu sunucudaki can değerlerine göre belirlenir.

## Testler
- Worms oyun motoru testleri: 13/13 geçti.
- Statik oyun kalite kontrolleri ve tüm sunucu testleri için kök QA raporundaki sonuçlara bakın.
- Gerçek telefonlar arasında canlı Socket.IO testi bu ortamda yapılmadı; bu nedenle canlı ağ sonucu iddia edilmiyor.
