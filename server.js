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
// GENİŞLETİLMİŞ İŞKEMBEDEN SALLAMA SORU HAVUZU
// ==========================================
const iskembedenData = {
    // 1. MOD: Ünlü Yaşları (Türkiye & Dünya)
    celebrity: [
        { title: "Tarkan", hint: "Megastar", actual: 54, img: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80" },
        { title: "Cristiano Ronaldo", hint: "Portekizli Futbol Efsanesi", actual: 41, img: "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=600&q=80" },
        { title: "Acun Ilıcalı", hint: "Televizyoncu ve Kulüp Sahibi", actual: 57, img: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80" },
        { title: "Hadise", hint: "Pop Şarkıcısı", actual: 41, img: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=600&q=80" },
        { title: "Elon Musk", hint: "Tesla & SpaceX Kurucusu", actual: 55, img: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80" },
        { title: "Cem Yılmaz", hint: "Komedyen ve Sinemacı", actual: 53, img: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=600&q=80" },
        { title: "Taylor Swift", hint: "Dünyaca Ünlü Pop İkonu", actual: 36, img: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=600&q=80" },
        { title: "Lionel Messi", hint: "Arjantinli Dünya Şampiyonu", actual: 39, img: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=600&q=80" },
        { title: "Morgan Freeman", hint: "Efsanevi Aktör", actual: 89, img: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=600&q=80" },
        { title: "Kıvanç Tatlıtuğ", hint: "Oyuncu", actual: 43, img: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=600&q=80" },
        { title: "Kenan İmirzalıoğlu", hint: "Aktör ve Sunucu", actual: 52, img: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80" },
        { title: "Şener Şen", hint: "Yeşilçam Efsanesi", actual: 84, img: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=600&q=80" },
        { title: "Haluk Bilginer", hint: "Emmy Ödüllü Aktör", actual: 72, img: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80" },
        { title: "Sezen Aksu", hint: "Minik Serçe", actual: 72, img: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=600&q=80" },
        { title: "Ajda Pekkan", hint: "Süperstar", actual: 80, img: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80" },
        { title: "Bülent Ersoy", hint: "Diva", actual: 74, img: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=600&q=80" },
        { title: "Arda Güler", hint: "Real Madrid Yıldızı", actual: 21, img: "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=600&q=80" },
        { title: "Kylian Mbappé", hint: "Fransız Süperstar", actual: 27, img: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80" },
        { title: "Erling Haaland", hint: "Norveçli Gol Makinesi", actual: 26, img: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=600&q=80" },
        { title: "Leonardo DiCaprio", hint: "Oscar Ödüllü Aktör", actual: 51, img: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80" },
        { title: "Brad Pitt", hint: "Hollywood Yıldızı", actual: 62, img: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80" },
        { title: "Tom Cruise", hint: "Görevimiz Tehlike Yıldızı", actual: 64, img: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=600&q=80" },
        { title: "Keanu Reeves", hint: "John Wick / Matrix", actual: 62, img: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=600&q=80" },
        { title: "Beyoncé", hint: "Dünya Pop Yıldızı", actual: 45, img: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80" },
        { title: "Shakira", hint: "Latin Müziğin Kraliçesi", actual: 49, img: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=600&q=80" },
        { title: "Eminem", hint: "Rap Tanrısı", actual: 54, img: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80" },
        { title: "Dwayne Johnson (The Rock)", hint: "Aktör & Güreşçi", actual: 54, img: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80" },
        { title: "Serenay Sarıkaya", hint: "Dizi ve Sinema Oyuncusu", actual: 34, img: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=600&q=80" },
        { title: "Hande Erçel", hint: "Oyuncu", actual: 32, img: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=600&q=80" },
        { title: "Çağatay Ulusoy", hint: "Oyuncu", actual: 36, img: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=600&q=80" },
        { title: "Murat Boz", hint: "Pop Şarkıcısı & Jüri", actual: 46, img: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80" },
        { title: "İbrahim Tatlıses", hint: "İmparator", actual: 74, img: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=600&q=80" },
        { title: "Fatih Terim", hint: "İmparator / Teknik Direktör", actual: 73, img: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=600&q=80" },
        { title: "Zendaya", hint: "Genç Kuşak Hollywood Yıldızı", actual: 30, img: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=600&q=80" }
    ],

    // 2. MOD: Pazar, Market, Ev Eşyası & Takı Fiyatları (TL)
    market: [
        { title: "Çeyrek Altın (Yeni Tarihli)", hint: "Kuyumcu Satış Fiyatı (TL)", actual: 5400, img: "https://images.unsplash.com/photo-1610375461246-83df859d849d?auto=format&fit=crop&w=600&q=80" },
        { title: "Gram Altın (24 Ayar)", hint: "Kapalıçarşı Güncel Gram Fiyatı (TL)", actual: 3300, img: "https://images.unsplash.com/photo-1610375461246-83df859d849d?auto=format&fit=crop&w=600&q=80" },
        { title: "Cumhuriyet / Tam Altın", hint: "Kuyumcu Satış Fiyatı (TL)", actual: 21500, img: "https://images.unsplash.com/photo-1610375461246-83df859d849d?auto=format&fit=crop&w=600&q=80" },
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
        { title: "Dana Kıyma 1 kg (Kasap)", hint: "Güncel Kasap Kilogram Fiyatı (TL)", actual: 480, img: "https://images.unsplash.com/photo-1603048588665-791ca8aea617?auto=format&fit=crop&w=600&q=80" },
        { title: "Taze Kaşar Peyniri 1 kg", hint: "Market Blok Kaşar Fiyatı (TL)", actual: 320, img: "https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d?auto=format&fit=crop&w=600&q=80" },
        { title: "Zeytinyağı 5L Teneke (Natürel Sızma)", hint: "Ege Sızma Zeytinyağı Tenekesi (TL)", actual: 1650, img: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=600&q=80" },
        { title: "Philips Airfryer XXL Fritöz", hint: "Sıcak Hava Fritözü (TL)", actual: 6500, img: "https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=600&q=80" },
        { title: "De'Longhi Tam Otomatik Kahve Makinesi", hint: "Çekirdek Öğütücülü Espresso (TL)", actual: 17500, img: "https://images.unsplash.com/photo-1517668808822-9ebb02f2a0e6?auto=format&fit=crop&w=600&q=80" },
        { title: "LG 65 inç 4K OLED Akıllı TV", hint: "OLED Panel Televizyon (TL)", actual: 65000, img: "https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?auto=format&fit=crop&w=600&q=80" },
        { title: "Sony WH-1000XM5 Bluetooth Kulaklık", hint: "Gürültü Engelleyici Kulaklık (TL)", actual: 14500, img: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80" },
        { title: "Rolex Submariner Date Saat", hint: "Lüks Çelik Saat 2. El/Piyasa (TL)", actual: 520000, img: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=600&q=80" },
        { title: "Casio G-Shock Klasik Saat", hint: "Dayanıklı Spor Saat (TL)", actual: 3800, img: "https://images.unsplash.com/photo-1524805444758-089113d48a6d?auto=format&fit=crop&w=600&q=80" },
        { title: "Ray-Ban Classic Wayfarer Gözlük", hint: "Orijinal Polarize Güneş Gözlüğü (TL)", actual: 5200, img: "https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=600&q=80" },
        { title: "Nike Air Force 1 '07 Spor Ayakkabı", hint: "Orijinal Sneaker Fiyatı (TL)", actual: 4400, img: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?auto=format&fit=crop&w=600&q=80" },
        { title: "Tuvalet Kağıdı 32'li Rulo (3 Katlı)", hint: "Market Paket Fiyatı (TL)", actual: 275, img: "https://images.unsplash.com/photo-1584556812952-905ffd0c611a?auto=format&fit=crop&w=600&q=80" },
        { title: "Bulaşık Makinesi Tableti (80'li Kutu)", hint: "Market Temizlik Ürünü (TL)", actual: 460, img: "https://images.unsplash.com/photo-1585670270638-74dd01404617?auto=format&fit=crop&w=600&q=80" },
        { title: "1 Kilo Fıstıklı Antep Baklavası", hint: "Kaliteli Pastane Kilo Fiyatı (TL)", actual: 950, img: "https://images.unsplash.com/photo-1598214886806-c87b84b7078b?auto=format&fit=crop&w=600&q=80" },
        { title: "Starbucks Grande White Chocolate Mocha", hint: "Kahve Zinciri Fiyatı (TL)", actual: 135, img: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=600&q=80" },
        { title: "MacBook Air 13 inç M3 256GB", hint: "Apple Laptop Satış Fiyatı (TL)", actual: 48999, img: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=600&q=80" },
        { title: "Bosch Çamaşır Makinesi 9 kg", hint: "1200 Devir A Enerji (TL)", actual: 24500, img: "https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?auto=format&fit=crop&w=600&q=80" },
        { title: "Hakiki Trabzon Yayla Tereyağı 1 kg", hint: "Köy Ürünü Kilogram Fiyatı (TL)", actual: 390, img: "https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?auto=format&fit=crop&w=600&q=80" }
    ],

    // 3. MOD: Türkiye 2. El Araba Piyasası (Ortalama Piyasa Değeri TL)
    car: [
        { title: "2016 Fiat Egea 1.3 Multijet Easy (160.000 KM)", hint: "Temiz / Değişensiz 2. El Değeri (TL)", actual: 560000, img: "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=600&q=80" },
        { title: "2017 VW Passat 1.6 TDI Comfortline (140.000 KM)", hint: "Otomatik / Hatasız Piyasa Değeri (TL)", actual: 1350000, img: "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?auto=format&fit=crop&w=600&q=80" },
        { title: "2013 Renault Clio 1.5 dCi Icon (180.000 KM)", hint: "Manuel Dizel 2. El Değeri (TL)", actual: 520000, img: "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=600&q=80" },
        { title: "2020 Honda Civic 1.6 i-DTEC Elegance (85.000 KM)", hint: "Otomatik Sedan Piyasa Değeri (TL)", actual: 1220000, img: "https://images.unsplash.com/photo-1590362891991-f776e747a588?auto=format&fit=crop&w=600&q=80" },
        { title: "1998 Tofaş Şahin 1.6 S (Orijinal / LPG)", hint: "Diri Koleksiyonluk Piyasa Değeri (TL)", actual: 215000, img: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=600&q=80" },
        { title: "2021 Dacia Duster 1.0 TCe Comfort (60.000 KM)", hint: "Manuel Benzinli SUV (TL)", actual: 820000, img: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=600&q=80" },
        { title: "2015 BMW 320i ED 1.6 M Sport (130.000 KM)", hint: "Orijinal M Paket Sedan (TL)", actual: 1480000, img: "https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&w=600&q=80" },
        { title: "2014 VW Golf 1.6 TDI Highline (170.000 KM)", hint: "Dolu Paket Hatchback (TL)", actual: 870000, img: "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?auto=format&fit=crop&w=600&q=80" },
        { title: "2022 Toyota Corolla 1.5 Vision Otomatik (40.000 KM)", hint: "Kazasız Aile Sedanı (TL)", actual: 1050000, img: "https://images.unsplash.com/photo-1590362891991-f776e747a588?auto=format&fit=crop&w=600&q=80" },
        { title: "2018 Peugeot 3008 1.5 BlueHDi Allure (110.000 KM)", hint: "Cam Tavanlı Fransız SUV (TL)", actual: 1420000, img: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=600&q=80" },
        { title: "2015 Mercedes C200d AMG (160.000 KM)", hint: "Dizel Otomatik Lüks Sedan (TL)", actual: 1650000, img: "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&w=600&q=80" },
        { title: "2012 Ford Focus 1.6 TDCi Titanium (210.000 KM)", hint: "Dizel Manuel Hatchback (TL)", actual: 580000, img: "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=600&q=80" },
        { title: "2023 Hyundai i20 1.4 MPI Jump Otomatik (25.000 KM)", hint: "Şehir İçi B Segment (TL)", actual: 890000, img: "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=600&q=80" },
        { title: "2011 Opel Astra 1.3 CDTI Enjoy (220.000 KM)", hint: "Ekonomik Dizel Hatchback (TL)", actual: 440000, img: "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?auto=format&fit=crop&w=600&q=80" },
        { title: "2020 Skoda Octavia 1.5 e-TEC Premium (70.000 KM)", hint: "Geniş Bagaj Hibrit Sedan (TL)", actual: 1380000, img: "https://images.unsplash.com/photo-1590362891991-f776e747a588?auto=format&fit=crop&w=600&q=80" },
        { title: "2017 Seat Leon 1.6 TDI Style (130.000 KM)", hint: "Dizel Otomatik Spor Hatchback (TL)", actual: 830000, img: "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=600&q=80" },
        { title: "2019 Nissan Qashqai 1.3 DIG-T Tekna (90.000 KM)", hint: "Benzinli Otomatik C-SUV (TL)", actual: 1150000, img: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=600&q=80" },
        { title: "2008 Honda Civic 1.6 i-VTEC Elegance (240.000 KM)", hint: "FD6 Kasa Efsane VTEC (TL)", actual: 490000, img: "https://images.unsplash.com/photo-1590362891991-f776e747a588?auto=format&fit=crop&w=600&q=80" },
        { title: "2016 Audi A3 Sedan 1.6 TDI Ambition (150.000 KM)", hint: "S-Tronic Premium Sedan (TL)", actual: 1180000, img: "https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?auto=format&fit=crop&w=600&q=80" },
        { title: "2004 VW Bora 1.6 Pacific (260.000 KM)", hint: "Temiz Manuel Aile Arabası (TL)", actual: 360000, img: "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?auto=format&fit=crop&w=600&q=80" },
        { title: "2022 Kia Sportage 1.6 T-GDI Elegance (35.000 KM)", hint: "Yeni Kasa Benzinli SUV (TL)", actual: 1620000, img: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=600&q=80" },
        { title: "2015 Volvo S60 2.0 D4 Advance (180.000 KM)", hint: "Güvenlik Odaklı Dizel Sedan (TL)", actual: 1100000, img: "https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&w=600&q=80" },
        { title: "1994 Renault Toros 1.4 SW", hint: "Köy/Bağ Klasiği Orijinal Kasa (TL)", actual: 165000, img: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=600&q=80" },
        { title: "2018 Fiat Doblo Combi 1.6 Multijet Premio (150.000 KM)", hint: "En Dolu Paket Enişte Arabası (TL)", actual: 580000, img: "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?auto=format&fit=crop&w=600&q=80" },
        { title: "2023 Chery Omoda 5 Excellent (20.000 KM)", hint: "Dolu Paket Çinli SUV (TL)", actual: 1320000, img: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=600&q=80" },
        { title: "2019 VW Polo 1.0 TSI Comfortline (75.000 KM)", hint: "Benzinli Otomatik Şehir Arabası (TL)", actual: 860000, img: "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?auto=format&fit=crop&w=600&q=80" },
        { title: "2021 Cupra Formentor 1.5 TSI VZ-Line (45.000 KM)", hint: "Sportif Crossover (TL)", actual: 1780000, img: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=600&q=80" },
        { title: "2017 BMW 520i 1.6 Executive M Sport (120.000 KM)", hint: "Makam Arabası G30 Kasa (TL)", actual: 2450000, img: "https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&w=600&q=80" },
        { title: "2016 Range Rover Evoque 2.0 TD4 HSE (140.000 KM)", hint: "Premium Şık SUV (TL)", actual: 1850000, img: "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=600&q=80" },
        { title: "2010 Ford Fiesta 1.4 TDCi Titanium (230.000 KM)", hint: "Dizel Ekonomik Hatchback (TL)", actual: 390000, img: "https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=600&q=80" }
    ]
};

let players = [];
let currentGame = null;
const playerColors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#e84393', '#00cec9', '#fdcb6e'];

// İŞKEMBEDEN SALLAMA STATE
let guessState = {
    active: false,
    mode: 'celebrity',
    currentQuestionIndex: 0,
    questions: [],
    timer: null,
    timeLeft: 15,
    guesses: {},
    totalScores: {},
    maxQuestions: 5
};

io.on('connection', (socket) => {
    socket.on('joinLobby', (name) => {
        if (players.length >= 10) return socket.emit('errorMsg', 'Lobi dolu! (Maks 10)');
        players.push({
            id: socket.id,
            name,
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
        guessState.active = false;
        players.forEach(p => p.ready = false);
        io.emit('gameSelected', 'lobby');
        io.emit('updateLobby', { players, currentGame });
    });

    // ==========================================
    // 🧠 İŞKEMBEDEN SALLAMA MOTORU
    // ==========================================
    socket.on('startGuessGame', (selectedSubMode) => {
        if (players.length < 1) return socket.emit('errorMsg', 'En az 1 oyuncu olmalı!');
        if (!players.every(p => p.ready)) return socket.emit('errorMsg', 'Herkes HAZIR olmalı!');

        const subMode = selectedSubMode || 'celebrity';
        const pool = iskembedenData[subMode] || iskembedenData.celebrity;

        guessState = {
            active: true,
            mode: subMode,
            currentQuestionIndex: 0,
            questions: shuffleArray(pool).slice(0, 5), // Devasa havuzdan rastgele 5 soru
            timer: null,
            timeLeft: 15,
            guesses: {},
            totalScores: {},
            maxQuestions: 5
        };

        players.forEach(p => { guessState.totalScores[p.id] = 0; });
        startGuessRound();
    });

    function startGuessRound() {
        guessState.guesses = {};
        guessState.timeLeft = 15;
        const q = guessState.questions[guessState.currentQuestionIndex];

        io.emit('guessRoundStarted', {
            mode: guessState.mode,
            questionIndex: guessState.currentQuestionIndex + 1,
            maxQuestions: guessState.maxQuestions,
            question: {
                title: q.title,
                hint: q.hint,
                img: q.img
            },
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
                    // Yaş Modu: Fark 120 puan düşürür
                    accuracyScore = Math.max(0, 1000 - (diff * 120));
                } else {
                    // Fiyat ve Araba Modu: Yüzdelik Sapma
                    const ratio = diff / actual;
                    accuracyScore = ratio > 1 ? 0 : Math.round(1000 * (1 - ratio));
                }

                // Hız Çarpanı Formülü
                const speedMult = 0.5 + (0.5 * (userGuess.timeLeft / 15));
                score = Math.round(accuracyScore * speedMult);

                userGuess.scoreGained = score;
                guessState.totalScores[p.id] = (guessState.totalScores[p.id] || 0) + score;
            }

            roundResults.push({
                name: p.name,
                guess: userGuess ? userGuess.value : 'Tahmin Yok',
                scoreGained: score,
                totalScore: guessState.totalScores[p.id] || 0
            });
        });

        roundResults.sort((a, b) => b.totalScore - a.totalScore);

        io.emit('guessRoundEnded', {
            actual: actual,
            unit: guessState.mode === 'celebrity' ? 'Yaş' : 'TL',
            results: roundResults
        });

        setTimeout(() => {
            if (!guessState.active) return;
            guessState.currentQuestionIndex++;
            if (guessState.currentQuestionIndex < guessState.maxQuestions) {
                startGuessRound();
            } else {
                guessState.active = false;
                io.emit('guessGameOver', { finalLeaderboard: roundResults });
            }
        }, 6000);
    }

    socket.on('disconnect', () => {
        players = players.filter(p => p.id !== socket.id);
        delete guessState.totalScores[socket.id];
        delete guessState.guesses[socket.id];
        io.emit('updateLobby', { players, currentGame });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda aktif!`);
});