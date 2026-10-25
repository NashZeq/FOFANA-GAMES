# FOFANA GAMES v1.25 QA Raporu

## Bu sürümde
- Worms / Tepe Savaşı'na üçüncü silah eklendi: Kazıcı mermi geniş krater açar, ancak daha düşük hasar verir.
- Normal ve ağır mermiyle arasındaki risk/ödül farkı belirginleştirildi.
- Arazi kraterleri keskin yarım daire yerine kosinüs profilli, daha yumuşak kenarlı bir şekille oluşuyor.
- Kraterin derinliği seçilen silaha göre değişiyor ve arazi yüksekliği güvenli bir alt sınırda tutuluyor.
- Diğer altı oyun bu turda değiştirilmedi.
- Casus Belli dosyalarına dokunulmadı; ona ait testler çalıştırılmadı.

## Test sonuçları
- `python tests/qa-other-games.py`: 56/56 geçti.
- `node tests/monopoly-unit.js`: 13 geçti, 0 başarısız.
- `python tests/browser-smoke-other-games.py`: 50/50 geçti.
- Mobil genişlik testi: Casus Belli dışındaki yedi oyunda yatay taşma bulunmadı.
- Testler güncel ZIP'e paketlendikten sonra yeniden çalıştırılacak.
