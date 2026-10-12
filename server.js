const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ==========================================
// 140+ DEV İŞKEMBEDEN SALLAMA SORU HAVUZU
// ==========================================
const iskembedenData = {
    // 1. MOD: Ünlü Yaşları (50 Adet - Gerçek Wikimedia Fotoğrafları)
    celebrity: [
        { title: "Tarkan", hint: "Megastar", actual: 54, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Tarkan_2011.jpg/640px-Tarkan_2011.jpg" },
        { title: "Cristiano Ronaldo", hint: "Portekizli Futbol Efsanesi", actual: 41, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/Cristiano_Ronaldo_playing_for_Al_Nassr_FC_against_Persepolis%2C_September_2023_%28cropped%29.jpg/640px-Cristiano_Ronaldo_playing_for_Al_Nassr_FC_against_Persepolis%2C_September_2023_%28cropped%29.jpg" },
        { title: "Lionel Messi", hint: "Arjantinli Dünya Şampiyonu", actual: 39, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/Lionel-Messi-Argentina-2022-FIFA-World-Cup_%28cropped%29.jpg/640px-Lionel-Messi-Argentina-2022-FIFA-World-Cup_%28cropped%29.jpg" },
        { title: "Acun Ilıcalı", hint: "Televizyoncu ve Kulüp Sahibi", actual: 57, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Acun_Ilicali_2019.jpg/640px-Acun_Ilicali_2019.jpg" },
        { title: "Cem Yılmaz", hint: "Komedyen ve Sinemacı", actual: 53, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Cem_Y%C4%B1lmaz_2013.jpg/640px-Cem_Y%C4%B1lmaz_2013.jpg" },
        { title: "Ata Demirer", hint: "Komedyen ve Oyuncu", actual: 54, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Ata_Demirer.jpg/640px-Ata_Demirer.jpg" },
        { title: "Kıvanç Tatlıtuğ", hint: "Oyuncu", actual: 43, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/K%C4%B1van%C3%A7_Tatl%C4%B1tu%C4%9F_2013.jpg/640px-K%C4%B1van%C3%A7_Tatl%C4%B1tu%C4%9F_2013.jpg" },
        { title: "Şener Şen", hint: "Yeşilçam Efsanesi", actual: 84, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/%C5%9Eener_%C5%9Een.jpg/640px-%C5%9Eener_%C5%9Een.jpg" },
        { title: "Haluk Bilginer", hint: "Emmy Ödüllü Aktör", actual: 72, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Haluk_Bilginer_2019.jpg/640px-Haluk_Bilginer_2019.jpg" },
        { title: "Hadise", hint: "Pop Şarkıcısı", actual: 41, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Hadise_2014.jpg/640px-Hadise_2014.jpg" },
        { title: "İlber Ortaylı", hint: "Tarihçi & Yazar", actual: 79, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/%C4%B0lber_Ortayl%C4%B1_2015.jpg/640px-%C4%B0lber_Ortayl%C4%B1_2015.jpg" },
        { title: "Celal Şengör", hint: "Jeolog & Bilim İnsanı", actual: 71, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/A._M._Cel%C3%A2l_%C5%9Eeng%C3%B6r_2022.jpg/640px-A._M._Cel%C3%A2l_%C5%9Eeng%C3%B6r_2022.jpg" },
        { title: "Arda Güler", hint: "Real Madrid Yıldızı", actual: 21, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Arda_G%C3%Bcler_2023.jpg/640px-Arda_G%C3%Bcler_2023.jpg" },
        { title: "Elon Musk", hint: "Tesla & SpaceX Kurucusu", actual: 55, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Elon_Musk_Colorado_2022_%28cropped2%29.jpg/640px-Elon_Musk_Colorado_2022_%28cropped2%29.jpg" },
        { title: "Leonardo DiCaprio", hint: "Oscar Ödüllü Aktör", actual: 51, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Leonardo_DiCaprio_2014.jpg/640px-Leonardo_DiCaprio_2014.jpg" },
        { title: "Brad Pitt", hint: "Hollywood Yıldızı", actual: 62, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Brad_Pitt_2019_by_Glenn_Francis.jpg/640px-Brad_Pitt_2019_by_Glenn_Francis.jpg" },
        { title: "Tom Cruise", hint: "Görevimiz Tehlike Yıldızı", actual: 64, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/33/Tom_Cruise_by_Gage_Skidmore_2.jpg/640px-Tom_Cruise_by_Gage_Skidmore_2.jpg" },
        { title: "Keanu Reeves", hint: "Matrix & John Wick", actual: 62, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Spike_TV%27s_Guys_Choice_Awards_-_Keanu_Reeves_%28cropped%29.jpg/640px-Spike_TV%27s_Guys_Choice_Awards_-_Keanu_Reeves_%28cropped%29.jpg" },
        { title: "Morgan Freeman", hint: "Efsanevi Aktör", actual: 89, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Morgan_Freeman_Deauville_2018.jpg/640px-Morgan_Freeman_Deauville_2018.jpg" },
        { title: "Taylor Swift", hint: "Pop İkonu", actual: 36, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/Taylor_Swift_at_the_2023_MTV_Video_Music_Awards_3.png/640px-Taylor_Swift_at_the_2023_MTV_Video_Music_Awards_3.png" },
        { title: "Yılmaz Erdoğan", hint: "Yönetmen, Yazar & Aktör", actual: 58, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Yilmaz_Erdogan_2014.jpg/640px-Yilmaz_Erdogan_2014.jpg" },
        { title: "Beyazıt Öztürk", hint: "Talk-Show Sunucusu", actual: 57, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/34/Beyaz%C4%B1t_%C3%96zt%C3%BCrk_2015.jpg/640px-Beyaz%C4%B1t_%C3%96zt%C3%BCrk_2015.jpg" },
        { title: "Fatih Terim", hint: "Teknik Direktör", actual: 73, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Fatih_Terim_2018.jpg/640px-Fatih_Terim_2018.jpg" },
        { title: "İbrahim Tatlıses", hint: "İmparator", actual: 74, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Ibrahim_Tatlises_2008.jpg/640px-Ibrahim_Tatlises_2008.jpg" },
        { title: "Sezen Aksu", hint: "Minik Serçe", actual: 72, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/ca/Sezen_Aksu_2008.jpg/640px-Sezen_Aksu_2008.jpg" },
        { title: "Ajda Pekkan", hint: "Süperstar", actual: 80, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Ajda_Pekkan_2011.jpg/640px-Ajda_Pekkan_2011.jpg" },
        { title: "Teoman", hint: "Rock Sanatçısı", actual: 58, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Teoman_2011.jpg/640px-Teoman_2011.jpg" },
        { title: "Murat Boz", hint: "Pop Şarkıcısı & Jüri", actual: 46, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/Murat_Boz_2016.jpg/640px-Murat_Boz_2016.jpg" },
        { title: "Eminem", hint: "Rap Müzik Efsanesi", actual: 54, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Eminem_-_Concert_for_Valor_in_Washington%2C_D.C._Nov._11%2C_2014_%282%29_%28cropped%29.jpg/640px-Eminem_-_Concert_for_Valor_in_Washington%2C_D.C._Nov._11%2C_2014_%282%29_%28cropped%29.jpg" },
        { title: "Dwayne Johnson", hint: "The Rock / Aktör", actual: 54, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Dwayne_%22The_Rock%22_Johnson_Visits_the_Pentagon_%2841%29_%28cropped%29.jpg/640px-Dwayne_%22The_Rock%22_Johnson_Visits_the_Pentagon_%2841%29_%28cropped%29.jpg" },
        { title: "Kylian Mbappé", hint: "Fransız Yıldız", actual: 27, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/2019-07-17_SG_Dynamo_Dresden_vs._Paris_Saint-Germain_by_Sandro_Halank%E2%80%93129_%28cropped%29.jpg/640px-2019-07-17_SG_Dynamo_Dresden_vs._Paris_Saint-Germain_by_Sandro_Halank%E2%80%93129_%28cropped%29.jpg" },
        { title: "Erling Haaland", hint: "Norveçli Golcü", actual: 26, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/Erling_Haaland_2023_%28cropped%29.jpg/640px-Erling_Haaland_2023_%28cropped%29.jpg" },
        { title: "Kenan İmirzalıoğlu", hint: "Aktör ve Sunucu", actual: 52, img: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80" },
        { title: "Serenay Sarıkaya", hint: "Dizi ve Film Oyuncusu", actual: 34, img: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=600&q=80" },
        { title: "Hande Erçel", hint: "Oyuncu", actual: 32, img: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=600&q=80" },
        { title: "Çağatay Ulusoy", hint: "Oyuncu", actual: 36, img: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=600&q=80" },
        { title: "Barış Arduç", hint: "Dizi Oyuncusu", actual: 39, img: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80" },
        { title: "Cansu Dere", hint: "Dizi Oyuncusu", actual: 46, img: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=600&q=80" },
        { title: "Demet Akalın", hint: "Pop Şarkıcısı", actual: 54, img: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80" },
        { title: "Ali Koç", hint: "İş İnsanı & Kulüp Başkanı", actual: 59, img: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=600&q=80" },
        { title: "Nusret Gökçe", hint: "Salt Bae / Şef", actual: 43, img: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=600&q=80" },
        { title: "CZN Burak", hint: "Restorancı & Şef", actual: 32, img: "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=600&q=80" },
        { title: "Okan Bayülgen", hint: "Televizyoncu", actual: 62, img: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=600&q=80" },
        { title: "Seda Sayan", hint: "Sunucu ve Şarkıcı", actual: 63, img: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=600&q=80" },
        { title: "Sibel Can", hint: "Şarkıcı", actual: 56, img: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80" },
        { title: "Hayko Cepkin", hint: "Rock & Metal Müzisyeni", actual: 48, img: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80" },
        { title: "Zendaya", hint: "Hollywood Yıldızı", actual: 30, img: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=600&q=80" },
        { title: "Kenan Doğulu", hint: "Pop Müzisyeni", actual: 52, img: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80" },
        { title: "Sertab Erener", hint: "Eurovision Şampiyonu", actual: 62, img: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=600&q=80" },
        { title: "Mazhar Alanson", hint: "MFÖ Efsanesi", actual: 76, img: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=600&q=80" }
    ],

    // 2. MOD: Pazar, Market, Ev Eşyası & Takı Fiyatları (48 Adet - TL)
    market: [
        { title: "Çeyrek Altın (Yeni Tarihli)", hint: "Kuyumcu Satış Fiyatı (TL)", actual: 5400, img: "https://images.unsplash.com/photo-1610375461246-83df859d849d?auto=format&fit=crop&w=600&q=80" },
        { title: "Gram Altın (24 Ayar)", hint: "Kapalıçarşı Güncel Gram Fiyatı (TL)", actual: 3300, img: "https://images.unsplash.com/photo-1610375461246-83df859d849d?auto=format&fit=crop&w=600&q=80" },
        { title: "Cumhuriyet / Tam Altın", hint: "Kuyumcu Satış Fiyatı (TL)", actual: 21500, img: "https://images.unsplash.com/photo-1610375461246-83df859d849d?auto=format&fit=crop&w=600&q=80" },
        { title: "22 Ayar Burma Bilezik (20 Gram)", hint: "Kuyumcu İşçilikli Bilezik (TL)", actual: 65000, img: "https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=600&q=80" },
        { title: "Nutella Kakaolu Fındık Kreması 750g", hint: "Süpermarket Raf Fiyatı (TL)", actual: 195, img: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=80" },
        { title: "Dyson V15 Şarjlı Dikey Süpürge", hint: "Orijinal Satış Fiyatı (TL)", actual: 29999, img: "https://images.unsplash.com/photo-1558317374-067fb5f30001?auto=format&fit=crop&w=600&q=80" },
        { title: "PlayStation 5 Slim 1TB", hint: "Konsol Satış Fiyatı (TL)", actual: 26500, img: "https://images.unsplash.com/photo-1606813907291-d86efa9b94db?auto=format&fit=crop&w=600&q=80" },
        { title: "1 Koli Yumurta (30'lu L Boy)", hint: "Market Raf Fiyatı (TL)", actual: 165, img: "https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?auto=format&fit=crop&w=600&q=80" },
        { title: "AirPods Pro (2. Nesil USB-C)", hint: "Apple Mağaza Fiyatı (TL)", actual: 10499, img: "https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?auto=format&fit=crop&w=600&q=80" },
        { title: "Stanley Klasik Vakumlu Termos 1.4L", hint: "Outdoor Ekipman Fiyatı (TL)", actual: 2450, img: "https://images.unsplash.com/photo-1517256064527-09c73fc73e38?auto=format&fit=crop&w=600&q=80" },
        { title: "Pırlanta Tektaş Yüzük (0.30 Karat)", hint: "Kuyumcu Liste Fiyatı (TL)", actual: 34500, img: "https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&w=600&q=80" },
        { title: "iPhone 16 Pro 128GB", hint: "Resmi Türkiye Fiyatı (TL)", actual: 82999, img: "https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?auto=format&fit=crop&w=600&q=80" },
        { title: "Samsung Galaxy S24 Ultra 256GB", hint: "Amiral Gemisi Telefon (TL)", actual: 68500, img: "https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?auto=format&fit=crop&w=600&q=80" },
        { title: "Çaykur Rize Turist Çayı 1 kg", hint: "Süpermarket Fiyatı (TL)", actual: 190, img: "https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=600&q=80" },
        { title: "Dana Kıyma 1 kg (Kasap)", hint: "Kasap Kilogram Fiyatı (TL)", actual: 480, img: "https://images.unsplash.com/photo-1603048588665-791ca8aea617?auto=format&fit=crop&w=600&q=80" },
        { title: "Taze Kaşar Peyniri 1 kg", hint: "Market Blok Kaşar (TL)", actual: 320, img: "https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?auto=format&fit=crop&w=600&q=80" },
        { title: "Zeytinyağı 5L Teneke (Natürel Sızma)", hint: "Ege Sızma Zeytinyağı Tenekesi (TL)", actual: 1650, img: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=600&q=80" },
        { title: "Philips Airfryer XXL Fritöz", hint: "Sıcak Hava Fritözü (TL)", actual: 6500, img: "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=600&q=80" },
        { title: "De'Longhi Espresso Makinesi", hint: "Tam Otomatik Kahve Makinesi (TL)", actual: 17500, img: "https://images.unsplash.com/photo-1517668808822-9ebb02f2a0e6?auto=format&fit=crop&w=600&q=80" },
        { title: "LG 65 inç 4K OLED TV", hint: "OLED Panel Akıllı TV (TL)", actual: 65000, img: "https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?auto=format&fit=crop&w=600&q=80" },
        { title: "Sony WH-1000XM5 Kulaklık", hint: "Kablosuz ANC Kulaklık (TL)", actual: 14500, img: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80" },
        { title: "Rolex Submariner Date", hint: "Lüks Saat Piyasa Değeri (TL)", actual: 520000, img: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=600&q=80" },
        { title: "Ray-Ban Classic Wayfarer Gözlük", hint: "Polarize Güneş Gözlüğü (TL)", actual: 5200, img: "https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=600&q=80" },
        { title: "Nike Air Force 1 '07", hint: "Orijinal Beyaz Sneaker (TL)", actual: 4400, img: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?auto=format&fit=crop&w=600&q=80" },
        { title: "1 Kilo Fıstıklı Antep Baklavası", hint: "Pastane Kilo Fiyatı (TL)", actual: 950, img: "https://images.unsplash.com/photo-1598214886806-c87b84b7078b?auto=format&fit=crop&w=600&q=80" },
        { title: "Roborock S8 Pro Ultra Robot Süpürge", hint: "İstasyonlu Akıllı Süpürge (TL)", actual: 44000, img: "https://images.unsplash.com/photo-1558317374-067fb5f30001?auto=format&fit=crop&w=600&q=80" },
        { title: "MacBook Air 13 inç M3", hint: "Apple Laptop Fiyatı (TL)", actual: 48999, img: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=600&q=80" },
        { title: "Pazar Fiyatı: 1 Kilo Domates", hint: "Semt Pazarı Kilo Fiyatı (TL)", actual: 45, img: "https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?auto=format&fit=crop&w=600&q=80" },
        { title: "Pazar Fiyatı: 1 Kilo Sivri Biber", hint: "Semt Pazarı Kilo Fiyatı (TL)", actual: 70, img: "https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?auto=format&fit=crop&w=600&q=80" },
        { title: "1 Porsiyon İskender Kebap", hint: "Restoran Menü Fiyatı (TL)", actual: 380, img: "https://images.unsplash.com/photo-1603048588665-791ca8aea617?auto=format&fit=crop&w=600&q=80" },
        { title: "Hakiki Trabzon Yayla Tereyağı 1 kg", hint: "Köy Ürünü Kilo Fiyatı (TL)", actual: 390, img: "https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?auto=format&fit=crop&w=600&q=80" },
        { title: "Tadım Kavrulmuş Fındık İçi 180g", hint: "Paket Çerez Fiyatı (TL)", actual: 145, img: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=80" },
        { title: "Sütaş Süzme Peynir 1 kg", hint: "Market Kahvaltılık Ürün (TL)", actual: 210, img: "https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?auto=format&fit=crop&w=600&q=80" },
        { title: "Pınar Klasik Kangal Sucuk 450g", hint: "Dana Sucuk Paket Fiyatı (TL)", actual: 420, img: "https://images.unsplash.com/photo-1603048588665-791ca8aea617?auto=format&fit=crop&w=600&q=80" },
        { title: "KitchenAid Artisan Stand Mikser 4.8L", hint: "Hamur Yoğurma Makinesi (TL)", actual: 28000, img: "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=600&q=80" },
        { title: "Thermomix TM6 Akıllı Pişirici", hint: "Mutfak Robotu (TL)", actual: 58000, img: "https://images.unsplash.com/photo-1517668808822-9ebb02f2a0e6?auto=format&fit=crop&w=600&q=80" },
        { title: "The North Face Nuptse Mont", hint: "Kaz Tüyü Kışlık Mont (TL)", actual: 16000, img: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?auto=format&fit=crop&w=600&q=80" },
        { title: "Nintendo Switch OLED Konsol", hint: "Taşınabilir El Konsolu (TL)", actual: 16500, img: "https://images.unsplash.com/photo-1606813907291-d86efa9b94db?auto=format&fit=crop&w=600&q=80" },
        { title: "iPad Air M2 11 inç 128GB", hint: "Apple Tablet Liste Fiyatı (TL)", actual: 26500, img: "https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?auto=format&fit=crop&w=600&q=80" },
        { title: "Apple Watch Ultra 2 Titanyum", hint: "Akıllı Saat Fiyatı (TL)", actual: 42000, img: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=600&q=80" },
        { title: "Marshall Stanmore III Hoparlör", hint: "Bluetooth Hoparlör (TL)", actual: 18500, img: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80" },
        { title: "Pazar Fiyatı: 1 Kilo Taze Fasulye", hint: "Semt Pazarı Kilo Fiyatı (TL)", actual: 90, img: "https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?auto=format&fit=crop&w=600&q=80" },
        { title: "Büyük Boy Karışık Pizza", hint: "Popüler Restoran Fiyatı (TL)", actual: 340, img: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=80" },
        { title: "1 Kilo Etsiz Çiğ Köfte Paketi", hint: "Lavaş ve Garnitürlü Set (TL)", actual: 320, img: "https://images.unsplash.com/photo-1603048588665-791ca8aea617?auto=format&fit=crop&w=600&q=80" },
        { title: "Tuvalet Kağıdı 32'li Rulo (3 Katlı)", hint: "Market Paket Fiyatı (TL)", actual: 275, img: "https://images.unsplash.com/photo-1584556812952-905ffd0c611a?auto=format&fit=crop&w=600&q=80" },
        { title: "Bulaşık Makinesi Tableti (80'li)", hint: "Market Temizlik Ürünü (TL)", actual: 460, img: "https://images.unsplash.com/photo-1585670270638-74dd01404617?auto=format&fit=crop&w=600&q=80" },
        { title: "Bosch Çamaşır Makinesi 9 kg", hint: "A Enerji Sınıfı Beyaz Eşya (TL)", actual: 24500, img: "https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?auto=format&fit=crop&w=600&q=80" },
        { title: "Casio G-Shock Klasik Saat", hint: "Dayanıklı Spor Saat (TL)", actual: 3800, img: "https://images.unsplash.com/photo-1524805444758-089113d48a6d?auto=format&fit=crop&w=600&q=80" }
    ],

    // 3. MOD: Türkiye 2. El Araba Piyasası (47 Adet - Ortalama Piyasa Değeri TL)
    car: [
        { title: "2016 Fiat Egea 1.3 Multijet Easy (160.000 KM)", hint: "Temiz / Değişensiz 2. El Değeri (TL)", actual: 560000, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Fiat_Tipo_2016.jpg/640px-Fiat_Tipo_2016.jpg" },
        { title: "2017 VW Passat 1.6 TDI Comfortline (140.000 KM)", hint: "Otomatik / Hatasız Piyasa Değeri (TL)", actual: 1350000, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Volkswagen_Passat_B8_Limousine_Highline_2.0_TDI_BMT.jpg/640px-Volkswagen_Passat_B8_Limousine_Highline_2.0_TDI_BMT.jpg" },
        { title: "2013 Renault Clio 1.5 dCi Icon (180.000 KM)", hint: "Manuel Dizel 2. El Değeri (TL)", actual: 520000, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/Renault_Clio_IV_Phase_I_front.JPG/640px-Renault_Clio_IV_Phase_I_front.JPG" },
        { title: "2020 Honda Civic 1.6 i-DTEC Elegance (85.000 KM)", hint: "Otomatik Sedan Piyasa Değeri (TL)", actual: 1220000, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/Honda_Civic_eighth_generation_sedan.jpg/640px-Honda_Civic_eighth_generation_sedan.jpg" },
        { title: "1998 Tofaş Şahin 1.6 S (Orijinal / LPG)", hint: "Diri Koleksiyonluk Piyasa Değeri (TL)", actual: 215000, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Tofas_Sahin.jpg/640px-Tofas_Sahin.jpg" },
        { title: "2021 Dacia Duster 1.0 TCe Comfort (60.000 KM)", hint: "Manuel Benzinli SUV (TL)", actual: 820000, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Dacia_Duster_II_Genf_2018.jpg/640px-Dacia_Duster_II_Genf_2018.jpg" },
        { title: "2015 BMW 320i ED 1.6 M Sport (130.000 KM)", hint: "Orijinal M Paket Sedan (TL)", actual: 1480000, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/BMW_320i_%28F30%2C_Facelift%29_%E2%80%93_Frontansicht%2C_28._August_2016%2C_D%C3%BCsseldorf.jpg/640px-BMW_320i_%28F30%2C_Facelift%29_%E2%80%93_Frontansicht%2C_28._August_2016%2C_D%C3%BCsseldorf.jpg" },
        { title: "2014 VW Golf 1.6 TDI Highline (170.000 KM)", hint: "Dolu Paket Hatchback (TL)", actual: 870000, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/VW_Golf_VII_2.0_TDI_Highline_%E2%80%93_Frontansicht%2C_25._Mai_2013%2C_D%C3%BCsseldorf.jpg/640px-VW_Golf_VII_2.0_TDI_Highline_%E2%80%93_Frontansicht%2C_25._Mai_2013%2C_D%C3%BCsseldorf.jpg" },
        { title: "2022 Toyota Corolla 1.5 Vision Otomatik (40.000 KM)", hint: "Kazasız Aile Sedanı (TL)", actual: 1050000, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/2019_Toyota_Corolla_Icon_Tech_HEV_CVT_1.8_Front.jpg/640px-2019_Toyota_Corolla_Icon_Tech_HEV_CVT_1.8_Front.jpg" },
        { title: "2018 Peugeot 3008 1.5 BlueHDi Allure (110.000 KM)", hint: "Cam Tavanlı Fransız SUV (TL)", actual: 1420000, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Peugeot_3008_II_GT-Line_1.6_BlueHDi_120_EAT6_front.jpg/640px-Peugeot_3008_II_GT-Line_1.6_BlueHDi_120_EAT6_front.jpg" },
        { title: "2015 Mercedes C200d AMG (160.000 KM)", hint: "Dizel Otomatik Lüks Sedan (TL)", actual: 1650000, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/Mercedes-Benz_W205_Front.JPG/640px-Mercedes-Benz_W205_Front.JPG" },
        { title: "1994 Renault Toros 1.4 SW", hint: "Köy/Bağ Klasiği Orijinal Kasa (TL)", actual: 165000, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Renault_12_Toros_Sedan.jpg/640px-Renault_12_Toros_Sedan.jpg" },
        { title: "2018 Fiat Doblo 1.6 Multijet Premio (150.000 KM)", hint: "En Dolu Paket Enişte Arabası (TL)", actual: 580000, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Fiat_Dobl%C3%B2_Facelift_%282015%29_1.6_Multijet_Lounge_front.jpg/640px-Fiat_Dobl%C3%B2_Facelift_%282015%29_1.6_Multijet_Lounge_front.jpg" },
        { title: "2021 Togg T10X V2 Uzun Menzil (30.000 KM)", hint: "Yerli Elektrikli C-SUV (TL)", actual: 1550000, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1f/Togg_T10X_front.jpg/640px-Togg_T10X_front.jpg" },
        { title: "2023 Tesla Model Y RWD (25.000 KM)", hint: "Elektrikli Cam Tavan SUV (TL)", actual: 1790000, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/2021_Tesla_Model_Y_Long_Range_AWD_front.jpg/640px-2021_Tesla_Model_Y_Long_Range_AWD_front.jpg" },
        { title: "2018 Renault Megane 1.5 dCi Icon (120.000 KM)", hint: "Otomatik Dizel C Segment (TL)", actual: 920000, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/Renault_M%C3%A9gane_IV_front.jpg/640px-Renault_M%C3%A9gane_IV_front.jpg" },
        { title: "1993 Tofaş Kartal SLX 1.6 (LPG)", hint: "Geniş Bagaj Klasik Yerli (TL)", actual: 195000, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/Tofas_Kartal.jpg/640px-Tofas_Kartal.jpg" },
        { title: "2011 VW Caddy 1.6 TDI Maxi (240.000 KM)", hint: "Uzun Şasi Aile & Ticari (TL)", actual: 520000, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Volkswagen_Caddy_2K_facelift_front.JPG/640px-Volkswagen_Caddy_2K_facelift_front.JPG" },
        { title: "2017 BMW 520i 1.6 M Sport (120.000 KM)", hint: "Makam Arabası G30 Kasa (TL)", actual: 2450000, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/43/BMW_G30_Sedan_front.jpg/640px-BMW_G30_Sedan_front.jpg" },
        { title: "2017 Seat Leon 1.6 TDI Style (130.000 KM)", hint: "Dizel Otomatik Hatchback (TL)", actual: 830000, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/SEAT_Leon_5F_front.JPG/640px-SEAT_Leon_5F_front.JPG" },
        { title: "2015 Ford Tourneo Courier Titanium (190.000 KM)", hint: "Dolu Paket Aile Ticari (TL)", actual: 540000, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Ford_Tourneo_Courier_1.6_TDCi_Titanium_%E2%80%93_Frontansicht%2C_12._Juli_2014%2C_D%C3%BCsseldorf.jpg/640px-Ford_Tourneo_Courier_1.6_TDCi_Titanium_%E2%80%93_Frontansicht%2C_12._Juli_2014%2C_D%C3%BCsseldorf.jpg" },
        { title: "2016 Audi A3 Sedan 1.6 TDI (150.000 KM)", hint: "S-Tronic Premium Sedan (TL)", actual: 1180000, img: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Audi_A3_Sedan_1.8_TFSI_%288V%29_%E2%80%93_Frontansicht%2C_8._Juni_2014%2C_D%C3%BCsseldorf.jpg/640px-Audi_A3_Sedan_1.8_TFSI_%288V%29_%E2%80%93_Frontansicht%2C_8._Juni_2014%2C_D%C3%BCsseldorf.jpg" },
        { title: "2012 Ford Focus 1.6 TDCi Titanium (210.000 KM)", hint: "Dizel Manuel Hatchback (TL)", actual: 580000, img: "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=600&q=80" },
        { title: "2023 Hyundai i20 1.4 MPI Jump (25.000 KM)", hint: "Otomatik B Segment (TL)", actual: 890000, img: "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=600&q=80" },
        { title: "2011 Opel Astra 1.3 CDTI Enjoy (220.000 KM)", hint: "Ekonomik Dizel Hatchback (TL)", actual: 440000, img: "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?auto=format&fit=crop&w=600&q=80" },
        { title: "2020 Skoda Octavia 1.5 e-TEC (70.000 KM)", hint: "Geniş Bagaj Hibrit Sedan (TL)", actual: 1380000, img: "https://images.unsplash.com/photo-1590362891991-f776e747a588?auto=format&fit=crop&w=600&q=80" },
        { title: "2019 Nissan Qashqai 1.3 DIG-T (90.000 KM)", hint: "Benzinli Otomatik C-SUV (TL)", actual: 1150000, img: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=600&q=80" },
        { title: "2008 Honda Civic 1.6 i-VTEC (240.000 KM)", hint: "FD6 Kasa Japon Efsanesi (TL)", actual: 490000, img: "https://images.unsplash.com/photo-1590362891991-f776e747a588?auto=format&fit=crop&w=600&q=80" },
        { title: "2004 VW Bora 1.6 Pacific (260.000 KM)", hint: "Temiz Manuel Sedan (TL)", actual: 360000, img: "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?auto=format&fit=crop&w=600&q=80" },
        { title: "2022 Kia Sportage 1.6 T-GDI (35.000 KM)", hint: "Yeni Kasa Benzinli SUV (TL)", actual: 1620000, img: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=600&q=80" },
        { title: "2015 Volvo S60 2.0 D4 Advance (180.000 KM)", hint: "Güvenlik Odaklı Dizel Sedan (TL)", actual: 1100000, img: "https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&w=600&q=80" },
        { title: "2023 Chery Omoda 5 Excellent (20.000 KM)", hint: "Dolu Paket Çinli SUV (TL)", actual: 1320000, img: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=600&q=80" },
        { title: "2019 VW Polo 1.0 TSI (75.000 KM)", hint: "Benzinli Otomatik Şehir Arabası (TL)", actual: 860000, img: "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?auto=format&fit=crop&w=600&q=80" },
        { title: "2021 Cupra Formentor 1.5 TSI (45.000 KM)", hint: "Sportif Crossover (TL)", actual: 1780000, img: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=600&q=80" },
        { title: "2016 Range Rover Evoque 2.0 TD4 (140.000 KM)", hint: "Premium Şık SUV (TL)", actual: 1850000, img: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=600&q=80" },
        { title: "2010 Ford Fiesta 1.4 TDCi (230.000 KM)", hint: "Dizel Ekonomik Hatchback (TL)", actual: 390000, img: "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=600&q=80" },
        { title: "2016 VW Tiguan 2.0 TDI 4Motion (150.000 KM)", hint: "4 Çeker Dolu Paket SUV (TL)", actual: 1480000, img: "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?auto=format&fit=crop&w=600&q=80" },
        { title: "2020 BMW 118i M Sport (60.000 KM)", hint: "Ön Çeker Yeni Kasa 1 Serisi (TL)", actual: 1650000, img: "https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&w=600&q=80" },
        { title: "2015 Mercedes E180 W212 (140.000 KM)", hint: "Makyajlı Efsane Kasa Sedan (TL)", actual: 1850000, img: "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&w=600&q=80" },
        { title: "2017 Audi A4 2.0 TDI (130.000 KM)", hint: "S-Tronic Lüks Aile Sedanı (TL)", actual: 1750000, img: "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&w=600&q=80" },
        { title: "2022 Hyundai Tucson 1.6 T-GDI (45.000 KM)", hint: "Yeni Tasarım Benzinli SUV (TL)", actual: 1580000, img: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=600&q=80" },
        { title: "2013 Opel Corsa 1.3 CDTI (190.000 KM)", hint: "Az Yakan Şehir Arabası (TL)", actual: 430000, img: "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?auto=format&fit=crop&w=600&q=80" },
        { title: "2006 Ford Mondeo 2.0 TDCi Ghia (280.000 KM)", hint: "Geniş D Segment Konfor (TL)", actual: 340000, img: "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=600&q=80" },
        { title: "2001 VW Transporter T4 2.5 TDI (340.000 KM)", hint: "5 Silindir Efsane Minibüs (TL)", actual: 420000, img: "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?auto=format&fit=crop&w=600&q=80" },
        { title: "2019 Toyota C-HR 1.8 Hybrid (80.000 KM)", hint: "Fütüristik Hibrit Crossover (TL)", actual: 1180000, img: "https://images.unsplash.com/photo-1590362891991-f776e747a588?auto=format&fit=crop&w=600&q=80" },
        { title: "2016 Skoda Superb 1.6 TDI (160.000 KM)", hint: "Makam Konforu Sedan (TL)", actual: 1280000, img: "https://images.unsplash.com/photo-1590362891991-f776e747a588?auto=format&fit=crop&w=600&q=80" },
        { title: "2014 Mini Cooper 1.5 136 HP (110.000 KM)", hint: "İkonik İngiliz Hatchback (TL)", actual: 880000, img: "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=600&q=80" }
    ]
};

// ==========================================
// AYNI GÜN TEKRAR ETMEYEN SORU HAFIZASI
// ==========================================
const usedQuestionMemory = {
    celebrity: new Set(),
    market: new Set(),
    car: new Set()
};

// GENEL OYUN DURUMLARI (STATES)
let players = [];
let currentGame = null;
const playerColors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#e84393', '#00cec9', '#fdcb6e'];

let guessState = {
    active: false,
    mode: 'celebrity',
    currentQuestionIndex: 0,
    questions: [],
    timer: null,
    timeLeft: 15,
    guesses: {},
    totalScores: {},
    readyForNextRound: {},
    maxQuestions: 5
};

let monoState = {
    active: false,
    board: [],
    players: [],
    turnIndex: 0,
    dice: [1, 1],
    doubleRollCount: 0,
    waitingForDecision: false,
    waitingForDoblo: false,
    log: []
};

let raceState = {
    active: false,
    cars: {},
    items: [],
    itemBoxes: [
        { id: 1, x: 380, y: 640, active: true, respawnTimer: 0 },
        { id: 2, x: 1060, y: 380, active: true, respawnTimer: 0 },
        { id: 3, x: 620, y: 160, active: true, respawnTimer: 0 },
        { id: 4, x: 160, y: 340, active: true, respawnTimer: 0 },
        { id: 5, x: 580, y: 320, active: true, respawnTimer: 0 }
    ],
    loopInterval: null,
    totalLaps: 3,
    winner: null
};

// SOKET VE OYUN BAĞLANTILARI
io.on('connection', (socket) => {
    socket.on('joinLobby', (name) => {
        if (players.length >= 10) return socket.emit('errorMsg', 'Lobi dolu! (Maks 10 kişi)');
        players.push({
            id: socket.id,
            name: name,
            team: 'red',
            ready: false,
            color: playerColors[players.length % playerColors.length]
        });
        io.emit('updateLobby', { players, currentGame });
    });

    socket.on('selectGame', (gameType) => {
        currentGame = gameType;
        players.forEach(p => p.ready = false);
        io.emit('gameSelected', gameType);
        io.emit('updateLobbyStatuses', { players, gameType });
    });

    socket.on('toggleGeneralReady', () => {
        const p = players.find(x => x.id === socket.id);
        if (p) {
            p.ready = !p.ready;
            io.emit('updateLobbyStatuses', { players, gameType: currentGame });
        }
    });

    socket.on('backToLobby', () => {
        currentGame = null;
        if (guessState.timer) clearInterval(guessState.timer);
        if (raceState.loopInterval) clearInterval(raceState.loopInterval);
        guessState.active = false;
        raceState.active = false;
        players.forEach(p => p.ready = false);
        io.emit('gameSelected', 'lobby');
        io.emit('updateLobby', { players, currentGame });
    });

    // ==========================================
    // 🧠 İŞKEMBEDEN SALLAMA: HAFIZA VE TUR SEÇİMİ
    // ==========================================
    socket.on('startGuessGame', (data) => {
        if (players.length < 1) return socket.emit('errorMsg', 'En az 1 oyuncu olmalı!');
        if (!players.every(p => p.ready)) return socket.emit('errorMsg', 'Oyunu başlatmak için herkes HAZIR olmalı!');

        // Gelen veriyi çöz (Nesne veya düz metin)
        let subMode = 'celebrity';
        let requestedRounds = 5;

        if (typeof data === 'object' && data !== null) {
            subMode = data.mode || 'celebrity';
            requestedRounds = parseInt(data.rounds) || 5;
        } else if (typeof data === 'string') {
            subMode = data;
        }

        const fullPool = iskembedenData[subMode] || iskembedenData.celebrity;
        
        // 1. Daha önce sorulmamış soruları filtrele
        let availablePool = fullPool.filter(q => !usedQuestionMemory[subMode].has(q.title));

        // 2. Eğer havuzdaki sorular tükendiyse hafızayı temizle ve baştan başla
        if (availablePool.length < requestedRounds) {
            usedQuestionMemory[subMode].clear();
            availablePool = [...fullPool];
        }

        // 3. Rastgele karıştır ve istenen tur sayısı kadar seç
        const chosenQuestions = shuffleArray(availablePool).slice(0, requestedRounds);

        // 4. Seçilen soruları hafızaya ekle (o gün bir daha gelmesin)
        chosenQuestions.forEach(q => usedQuestionMemory[subMode].add(q.title));

        guessState = {
            active: true,
            mode: subMode,
            currentQuestionIndex: 0,
            questions: chosenQuestions,
            timer: null,
            timeLeft: 15,
            guesses: {},
            totalScores: {},
            readyForNextRound: {},
            maxQuestions: requestedRounds
        };

        players.forEach(p => { guessState.totalScores[p.id] = 0; });
        startGuessRound();
    });

    function startGuessRound() {
        guessState.guesses = {};
        guessState.readyForNextRound = {};
        guessState.timeLeft = 15;
        const q = guessState.questions[guessState.currentQuestionIndex];

        io.emit('guessRoundStarted', {
            mode: guessState.mode,
            questionIndex: guessState.currentQuestionIndex + 1,
            maxQuestions: guessState.maxQuestions,
            question: { title: q.title, hint: q.hint, img: q.img },
            timeLeft: guessState.timeLeft
        });

        if (guessState.timer) clearInterval(guessState.timer);
        guessState.timer = setInterval(() => {
            guessState.timeLeft--;
            io.emit('guessTimerTick', guessState.timeLeft);
            if (guessState.timeLeft <= 0) {
                clearInterval(guessState.timer);
                endGuessRound();
            }
        }, 1000);
    }

    socket.on('submitGuess', (val) => {
        if (!guessState.active || guessState.guesses[socket.id]) return;
        const num = parseFloat(val);
        if (isNaN(num)) return;

        guessState.guesses[socket.id] = {
            value: num,
            timeLeft: guessState.timeLeft,
            scoreGained: 0
        };

        socket.emit('guessLockedNotice');

        if (Object.keys(guessState.guesses).length === players.length) {
            clearInterval(guessState.timer);
            endGuessRound();
        }
    });

    function endGuessRound() {
        const q = guessState.questions[guessState.currentQuestionIndex];
        const actual = q.actual;
        const roundResults = [];

        players.forEach(p => {
            const userGuess = guessState.guesses[p.id];
            let score = 0;

            if (userGuess) {
                const diff = Math.abs(userGuess.value - actual);
                let accuracyScore = 0;

                if (guessState.mode === 'celebrity') {
                    accuracyScore = Math.max(0, 1000 - (diff * 120));
                } else {
                    const ratio = diff / actual;
                    accuracyScore = ratio > 1 ? 0 : Math.round(1000 * (1 - ratio));
                }

                // Hız Çarpanı: erken cevaplayan daha fazla puan alır
                const speedMult = 0.5 + (0.5 * (userGuess.timeLeft / 15));
                score = Math.round(accuracyScore * speedMult);

                userGuess.scoreGained = score;
                guessState.totalScores[p.id] = (guessState.totalScores[p.id] || 0) + score;
            }

            roundResults.push({
                id: p.id,
                name: p.name,
                guess: userGuess ? userGuess.value : 'Tahmin Yok',
                scoreGained: score,
                totalScore: guessState.totalScores[p.id] || 0
            });
        });

        roundResults.sort((a, b) => b.totalScore - a.totalScore);
        guessState.readyForNextRound = {};

        io.emit('guessRoundEnded', {
            actual: actual,
            unit: guessState.mode === 'celebrity' ? 'Yaş' : 'TL',
            results: roundResults,
            isLastQuestion: (guessState.currentQuestionIndex + 1 >= guessState.maxQuestions),
            readyStatus: players.map(p => ({ id: p.id, name: p.name, ready: false }))
        });
    }

    // Tur arası hazır sistemi
    socket.on('guessNextRoundReadyToggle', () => {
        if (!guessState.active) return;
        guessState.readyForNextRound[socket.id] = true;

        const readyList = players.map(p => ({
            id: p.id,
            name: p.name,
            ready: !!guessState.readyForNextRound[p.id]
        }));

        io.emit('guessNextRoundReadyUpdate', readyList);

        const allReady = players.every(p => guessState.readyForNextRound[p.id]);
        if (allReady) {
            guessState.currentQuestionIndex++;
            if (guessState.currentQuestionIndex < guessState.maxQuestions) {
                startGuessRound();
            } else {
                guessState.active = false;
                const finalLeaderboard = players.map(p => ({
                    name: p.name,
                    totalScore: guessState.totalScores[p.id] || 0
                })).sort((a, b) => b.totalScore - a.totalScore);

                io.emit('guessGameOver', { finalLeaderboard });
            }
        }
    });

    // --- ARABA YARIŞI ÇIKIŞ / BAĞLANTI TEMİZLİĞİ ---
    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
        delete guessState.totalScores[socket.id];
        delete guessState.guesses[socket.id];
        delete raceState.cars[socket.id];
        io.emit('updateLobby', { players, currentGame });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda aktif!`);
});