# FOFANA GAMES v1.22 QA raporu

## Bu sürümdeki değişiklikler
- Worms: Kırmızı takımın atış yönü düzeltildi; artık mermi yatay eksende sola ilerliyor.
- Worms: Açı, güç ve rüzgâra göre noktalı yörünge önizlemesi eklendi.
- Worms: Mermi uçuşu ve patlama sırasında açı/güç/silah kontrolleri kilitleniyor.
- Worms: Mermi fiziği ve yörünge önizlemesi aynı yerçekimi değerini kullanıyor.
- Casus Belli üzerinde hiçbir değişiklik veya test yapılmadı.

## Kontroller
- `tests/qa-other-games.py`: yedi diğer oyunun statik kontrolleri ve Worms regresyon kontrolleri.
- `tests/browser-smoke-other-games.py`: Chromium ile diğer yedi oyunun temel akışları, Worms'ta iki takımın atış sırası ve 390px mobil genişlik kontrolü.
- `tests/monopoly-unit.js`: Monopoly birim testleri.
- ZIP bütünlüğü ve çıkarılmış paket üzerinde yeniden test.

## Sınırlar
Worms hâlâ yerel, sıra tabanlı bir prototiptir. Ağ üzerinden çok oyunculu oda, gelişmiş silah çeşitleri ve uzun süreli otomatik maç simülasyonları bu sürümün kapsamına dahil değildir.
