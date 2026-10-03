/**
 * HS / GTİP suggestion from a taxonomy leaf, group or free-text title.
 * Codes are 6-digit (HS) where the classification is stable, 4-digit otherwise.
 * Confidence: 0.9 leaf-level, 0.5 group fallback, 0.6 keyword.
 */
export interface HsSuggestion {
  hs: string;
  label: string;
  confidence: number;
  source: "leaf" | "keyword" | "group" | "user";
}

export interface HsSuggestInput {
  leafKey?: string;
  groupKey?: string;
  title?: string;
  /** User corrections remembered by the app: leaf key or title → code. */
  overrides?: Record<string, string>;
}

/** Leaf key → [code, label]. Keys are the taxonomy slugs (packages/adapters/src/mock/taxonomy.ts). */
export const HS_BY_LEAF: Record<string, [string, string]> = {
  "kablosuz-kulaklik": ["851830", "Kulaklık"], "kulak-ustu-kulaklik": ["851830", "Kulaklık"], "oyuncu-kulakligi": ["851830", "Kulaklık"], "kulaklik": ["851830", "Kulaklık"],
  "akilli-saat": ["851762", "Akıllı saat (iletişim cihazı)"], "akilli-bileklik": ["851762", "Akıllı bileklik"], "powerbank": ["850760", "Lityum-iyon akümülatör"],
  "bluetooth-hoparlor": ["851821", "Hoparlör"], "hoparlor": ["851821", "Hoparlör"], "sarj-adaptoru": ["850440", "Statik konvertör (şarj cihazı)"], "sarj-kablosu": ["854442", "Konektörlü kablo"],
  "kablosuz-sarj": ["850440", "Şarj cihazı"], "webcam": ["852589", "Kamera"], "mekanik-klavye": ["847160", "Klavye"], "kablosuz-mouse": ["847160", "Mouse"],
  "mikrofon": ["851810", "Mikrofon"], "tablet-kilifi": ["420292", "Kılıf"], "telefon-kilifi": ["392690", "Plastik kılıf"], "kilif": ["392690", "Plastik kılıf"],
  "ekran-koruyucu": ["700719", "Temperli cam"], "telefon-tutucu": ["392690", "Plastik tutucu"], "akilli-priz": ["853669", "Priz"], "ip-kamera": ["852589", "Kamera"],
  "drone": ["880622", "İnsansız hava aracı"], "aksiyon-kamerasi": ["852589", "Kamera"], "e-kitap-okuyucu": ["847130", "Taşınabilir veri işlem makinesi"], "usb-bellek": ["852351", "Yarı iletken bellek"],
  "tasinabilir-ssd": ["852351", "SSD"], "telefon": ["851713", "Akıllı telefon"], "tablet": ["847130", "Tablet"], "laptop": ["847130", "Dizüstü bilgisayar"], "monitor": ["852852", "Monitör"],
  "televizyon": ["852872", "Televizyon"], "pil": ["850680", "Pil"], "sarjli-pil": ["850750", "Şarjlı pil"], "ampul": ["853950", "LED ampul"], "uzatma-kablosu": ["854442", "Uzatma kablosu"],
  "laptop-standi": ["732690", "Metal stand"], "monitor-kolu": ["732690", "Metal kol"], "usb-hub": ["851762", "Hub"], "laptop-cantasi": ["420212", "Çanta"], "sogutucu-altlik": ["841459", "Fan"],
  "mouse-pad": ["392690", "Mouse pad"], "yazici-kartusu": ["844399", "Kartuş"], "etiket-makinesi": ["847290", "Etiket makinesi"], "barkod-okuyucu": ["847190", "Barkod okuyucu"], "mini-pc": ["847150", "Bilgisayar"],
  "grafik-tablet": ["847160", "Grafik tablet"], "ag-kablosu": ["854449", "Kablo"], "wi-fi-router": ["851762", "Router"], "kesintisiz-guc-kaynagi": ["850440", "UPS"], "projeksiyon-cihazi": ["852862", "Projektör"],
  "termos": ["961700", "Termos"], "su-sisesi": ["392410", "Plastik şişe"], "yapismaz-tava": ["761510", "Alüminyum tava"], "tencere-seti": ["732393", "Çelik tencere"], "bicak-seti": ["821192", "Bıçak"],
  "hava-nemlendirici": ["850980", "Ev aleti"], "aroma-difuzoru": ["850980", "Ev aleti"], "led-serit": ["940540", "LED aydınlatma"], "masa-lambasi": ["940520", "Masa lambası"], "gece-lambasi": ["940520", "Lamba"],
  "akilli-ampul": ["853950", "LED ampul"], "duvar-saati": ["910521", "Duvar saati"], "yastik": ["940490", "Yastık"], "nevresim-takimi": ["630221", "Nevresim"], "battaniye": ["630140", "Battaniye"],
  "perde": ["630392", "Perde"], "hali": ["570330", "Halı"], "banyo-paspasi": ["570242", "Paspas"], "dus-basligi": ["848180", "Duş başlığı"], "havlu": ["630260", "Havlu"],
  "camasir-sepeti": ["392490", "Plastik ev eşyası"], "aski": ["392490", "Askı"], "paspas": ["960390", "Paspas"], "cop-kovasi": ["392490", "Çöp kovası"], "mum": ["340600", "Mum"], "vazo": ["701390", "Vazo"],
  "airfryer": ["851660", "Fritöz"], "blender": ["850940", "Blender"], "kahve-makinesi": ["851671", "Kahve makinesi"], "elektrikli-kettle": ["851610", "Su ısıtıcı"], "tost-makinesi": ["851672", "Tost makinesi"],
  "mikser": ["850940", "Mikser"], "mutfak-tartisi": ["842310", "Terazi"], "vakum-makinesi": ["842230", "Paketleme makinesi"], "buz-makinesi": ["841810", "Soğutucu"], "pirinc-pisirici": ["851660", "Pişirici"],
  "ekmek-yapma-makinesi": ["851660", "Ekmek makinesi"], "elektrikli-izgara": ["851660", "Izgara"], "sut-kopurtucu": ["850940", "Köpürtücü"], "su-aritma": ["842121", "Su filtresi"], "mikrodalga": ["851650", "Mikrodalga"],
  "el-supurgesi": ["850811", "Elektrik süpürgesi"], "robot-supurge": ["850811", "Robot süpürge"], "kablosuz-supurge": ["850811", "Dikey süpürge"], "buharli-utu": ["851640", "Ütü"], "vantilator": ["841451", "Vantilatör"],
  "isitici": ["851629", "Isıtıcı"], "hava-temizleyici": ["842139", "Hava temizleyici"], "nem-alici": ["847982", "Nem alıcı"], "dikis-makinesi": ["845220", "Dikiş makinesi"], "sac-kurutma-makinesi": ["851631", "Saç kurutma"],
  "elektrikli-battaniye": ["630110", "Elektrikli battaniye"],
  "elbise": ["620443", "Elbise"], "bluz": ["620640", "Bluz"], "kadin-t-shirt": ["610910", "T-shirt"], "etek": ["620452", "Etek"], "kadin-pantolon": ["620462", "Pantolon"], "kadin-jean": ["620462", "Jean"],
  "kadin-mont": ["620293", "Mont"], "kadin-sweatshirt": ["611030", "Sweatshirt"], "hirka": ["611030", "Hırka"], "kazak": ["611030", "Kazak"], "tayt": ["610462", "Tayt"], "sort": ["620463", "Şort"],
  "tulum": ["620443", "Tulum"], "pijama": ["610831", "Pijama"], "ic-camasiri": ["610821", "İç çamaşırı"], "mayo": ["611241", "Mayo"], "spor-sutyeni": ["621210", "Sütyen"], "abiye": ["620443", "Elbise"],
  "trenckot": ["620293", "Trençkot"], "yelek": ["621139", "Yelek"], "erkek-t-shirt": ["610910", "T-shirt"], "polo-yaka": ["610510", "Polo"], "gomlek": ["620520", "Gömlek"], "erkek-jean": ["620342", "Jean"],
  "chino-pantolon": ["620342", "Pantolon"], "erkek-mont": ["620193", "Mont"], "erkek-sweatshirt": ["611030", "Sweatshirt"], "erkek-kazak": ["611030", "Kazak"], "esofman": ["621133", "Eşofman"], "erkek-sort": ["620343", "Şort"],
  "takim-elbise": ["620311", "Takım elbise"], "boxer": ["610711", "Boxer"], "deri-ceket": ["420310", "Deri giyim"], "cocuk-t-shirt": ["610910", "T-shirt"], "cocuk-mont": ["620193", "Çocuk mont"],
  "spor-ayakkabi": ["640411", "Spor ayakkabı"], "kosu-ayakkabisi": ["640411", "Koşu ayakkabısı"], "sneaker": ["640419", "Sneaker"], "bot": ["640299", "Bot"], "cizme": ["640192", "Çizme"],
  "topuklu-ayakkabi": ["640399", "Ayakkabı"], "babet": ["640399", "Ayakkabı"], "sandalet": ["640299", "Sandalet"], "terlik": ["640220", "Terlik"], "loafer": ["640399", "Ayakkabı"],
  "klasik-erkek-ayakkabi": ["640399", "Deri ayakkabı"], "yuruyus-botu": ["640319", "Bot"], "futbol-ayakkabisi": ["640219", "Futbol ayakkabısı"], "cocuk-ayakkabisi": ["640299", "Çocuk ayakkabısı"],
  "ev-terligi": ["640220", "Terlik"], "yagmur-botu": ["640192", "Yağmur botu"], "is-guvenligi-ayakkabisi": ["640340", "İş ayakkabısı"], "ayakkabi-tabanligi": ["640610", "Tabanlık"], "ayakkabi-bagcigi": ["560790", "Bağcık"],
  "sirt-cantasi": ["420292", "Sırt çantası"], "valiz": ["420212", "Valiz"], "cuzdan": ["420231", "Cüzdan"], "capraz-canta": ["420222", "Çanta"], "tote-canta": ["420222", "Çanta"], "bel-cantasi": ["420292", "Bel çantası"],
  "omuz-cantasi": ["420222", "Çanta"], "evrak-cantasi": ["420212", "Evrak çantası"], "spor-cantasi": ["420292", "Spor çantası"], "makyaj-cantasi": ["420292", "Makyaj çantası"], "kartlik": ["420231", "Kartlık"],
  "okul-cantasi": ["420292", "Okul çantası"], "canta": ["420222", "Çanta"],
  "gunes-gozlugu": ["900410", "Güneş gözlüğü"], "gozluk-cercevesi": ["900311", "Gözlük çerçevesi"], "mavi-isik-gozlugu": ["900490", "Gözlük"], "kol-saati": ["910211", "Kol saati"], "saat": ["910211", "Kol saati"],
  "saat-kordonu": ["911390", "Saat kordonu"], "kolye": ["711719", "İmitasyon takı"], "bileklik": ["711719", "İmitasyon takı"], "kupe": ["711719", "İmitasyon takı"], "yuzuk": ["711719", "İmitasyon takı"],
  "kemer": ["420330", "Kemer"], "sapka": ["650500", "Şapka"], "bere": ["650500", "Bere"], "atki": ["621420", "Atkı"], "eldiven": ["611610", "Eldiven"], "kravat": ["621520", "Kravat"], "semsiye": ["660199", "Şemsiye"],
  "yuz-serumu": ["330499", "Cilt bakım"], "nemlendirici-krem": ["330499", "Cilt bakım"], "gunes-kremi": ["330499", "Güneş kremi"], "yuz-maskesi": ["330499", "Yüz maskesi"], "temizleme-jeli": ["330499", "Temizleyici"],
  "makyaj-fircasi": ["960330", "Fırça"], "fondoten": ["330491", "Pudra/fondöten"], "ruj": ["330410", "Ruj"], "maskara": ["330420", "Göz makyajı"], "far-paleti": ["330420", "Göz makyajı"], "oje": ["330430", "Oje"],
  "parfum": ["330300", "Parfüm"], "sac-duzlestirici": ["851632", "Saç düzleştirici"], "sac-masasi": ["851632", "Saç maşası"], "sac-kesme-makinesi": ["851020", "Saç kesme makinesi"], "tiras-makinesi": ["851010", "Tıraş makinesi"],
  "epilasyon-cihazi": ["851030", "Epilasyon cihazı"], "elektrikli-dis-fircasi": ["850980", "Elektrikli diş fırçası"], "masaj-tabancasi": ["901910", "Masaj cihazı"], "sampuan": ["330510", "Şampuan"],
  "tansiyon-aleti": ["901890", "Tansiyon aleti"], "ates-olcer": ["902519", "Termometre"], "pulse-oksimetre": ["901819", "Oksimetre"], "akilli-tarti": ["842310", "Tartı"], "masaj-yastigi": ["901910", "Masaj cihazı"],
  "boyun-masaj-aleti": ["901910", "Masaj cihazı"], "ortopedik-yastik": ["940490", "Yastık"], "dizlik": ["902110", "Ortopedik destek"], "maske": ["630790", "Maske"], "nebulizator": ["901920", "Nebulizatör"],
  "yoga-mati": ["950691", "Spor malzemesi"], "dambil": ["950691", "Spor malzemesi"], "direnc-bandi": ["950691", "Spor malzemesi"], "atlama-ipi": ["950691", "Spor malzemesi"], "kettlebell": ["950691", "Spor malzemesi"],
  "kosu-bandi": ["950691", "Koşu bandı"], "kondisyon-bisikleti": ["950691", "Kondisyon bisikleti"], "kamp-cadiri": ["630622", "Çadır"], "uyku-tulumu": ["940430", "Uyku tulumu"], "kamp-sandalyesi": ["940179", "Sandalye"],
  "kafa-lambasi": ["851310", "Fener"], "durbun": ["900510", "Dürbün"], "olta-takimi": ["950720", "Olta"], "bisiklet-kaski": ["650610", "Kask"], "scooter": ["871160", "Elektrikli scooter"], "kaykay": ["950699", "Kaykay"],
  "paten": ["950670", "Paten"], "yuzucu-gozlugu": ["900490", "Yüzücü gözlüğü"], "futbol-topu": ["950662", "Top"], "basketbol-topu": ["950662", "Top"], "raket": ["950651", "Raket"],
  "motosiklet-kaski": ["650610", "Koruyucu kask"], "kask": ["650610", "Koruyucu kask"], "motosiklet-eldiveni": ["621600", "Eldiven"], "motosiklet-montu": ["621133", "Mont"], "motosiklet-telefon-tutucu": ["871410", "Motosiklet aksamı"],
  "motosiklet-cantasi": ["420292", "Çanta"], "motosiklet-kilidi": ["830110", "Kilit"], "egzoz": ["871410", "Motosiklet aksamı"], "fren-balatasi": ["871410", "Motosiklet aksamı"], "motosiklet-akusu": ["850710", "Akü"],
  "elektrikli-scooter": ["871160", "Elektrikli scooter"], "elektrikli-bisiklet": ["871160", "Elektrikli bisiklet"], "bisiklet-lastigi": ["401150", "Bisiklet lastiği"], "bisiklet-selesi": ["871495", "Sele"], "bisiklet-pompasi": ["841420", "Pompa"],
  "arac-kamerasi": ["852589", "Kamera"], "arac-telefon-tutucu": ["392690", "Tutucu"], "arac-supurgesi": ["850811", "Süpürge"], "oto-koltuk-kilifi": ["870829", "Oto aksamı"], "aku-takviye": ["850760", "Akü"],
  "lastik-pompasi": ["841480", "Kompresör"], "guneslik": ["870829", "Güneşlik"], "arac-sarj-cihazi": ["850440", "Şarj cihazı"], "led-far-ampulu": ["851220", "Far"], "oto-paspasi": ["870829", "Oto paspas"],
  "direksiyon-kilifi": ["870894", "Direksiyon aksamı"], "fren-diski": ["870830", "Fren"], "yag-filtresi": ["842123", "Yağ filtresi"], "hava-filtresi": ["842131", "Hava filtresi"], "buji": ["851110", "Buji"],
  "silecek": ["851240", "Silecek"], "amortisor": ["870880", "Amortisör"], "far": ["851220", "Far"], "stop-lambasi": ["851220", "Lamba"], "tampon": ["870810", "Tampon"], "jant": ["870870", "Jant"], "lastik": ["401110", "Lastik"],
  "oto-teyp": ["852729", "Oto teyp"], "obd-tarayici": ["903180", "Ölçü cihazı"], "park-sensoru": ["851230", "Sensör"], "geri-gorus-kamerasi": ["852589", "Kamera"],
  "sarjli-matkap": ["846721", "Matkap"], "alet-seti": ["820600", "Alet seti"], "serit-metre": ["901780", "Şerit metre"], "lazer-hizalayici": ["901580", "Lazer hizalayıcı"], "elektrikli-tornavida": ["846729", "Tornavida"],
  "silikon-tabancasi": ["820559", "El aleti"], "multimetre": ["903031", "Multimetre"], "el-feneri": ["851310", "Fener"], "anahtar-seti": ["820412", "Anahtar"], "merdiven": ["761610", "Merdiven"], "avuc-taslama": ["846729", "Taşlama"],
  "kaynak-makinesi": ["851531", "Kaynak makinesi"], "basincli-yikama": ["842420", "Yıkama makinesi"], "hava-kompresoru": ["841440", "Kompresör"], "kilit": ["830140", "Kilit"], "akilli-kilit": ["830140", "Akıllı kilit"],
  "vida-seti": ["731815", "Vida"], "musluk": ["848180", "Musluk"], "is-eldiveni": ["611610", "Eldiven"], "guvenlik-gozlugu": ["900490", "Gözlük"], "alet-cantasi": ["420292", "Çanta"], "lehim-makinesi": ["851511", "Lehim"],
  "bahce-hortumu": ["391732", "Hortum"], "saksi": ["392490", "Saksı"], "bahce-makasi": ["820150", "Makas"], "tohum": ["120991", "Tohum"], "cim-bicme-makinesi": ["843311", "Çim biçme"], "bahce-lambasi": ["940540", "Lamba"],
  "hamak": ["560811", "Hamak"], "mangal": ["732111", "Mangal"], "havuz": ["950699", "Havuz"],
  "yapi-bloklari": ["950300", "Oyuncak"], "uzaktan-kumandali-araba": ["950300", "Oyuncak"], "pelus-oyuncak": ["950300", "Oyuncak"], "puzzle": ["950300", "Oyuncak"], "slime": ["950300", "Oyuncak"], "ucurtma": ["950300", "Oyuncak"],
  "kutu-oyunu": ["950490", "Kutu oyunu"], "oyuncak-bebek": ["950300", "Oyuncak"], "egitici-oyuncak": ["950300", "Oyuncak"], "model-araba": ["950300", "Oyuncak"], "figur": ["950300", "Oyuncak"], "trambolin": ["950691", "Trambolin"],
  "cocuk-bisikleti": ["871200", "Bisiklet"], "fidget-oyuncak": ["950300", "Oyuncak"],
  "bebek-arabasi": ["871500", "Bebek arabası"], "biberon": ["392410", "Biberon"], "bebek-kamerasi": ["852589", "Kamera"], "kanguru": ["630790", "Kanguru"], "oyun-mati": ["392490", "Mat"], "sterilizator": ["841989", "Sterilizatör"],
  "dis-kasiyici": ["392690", "Plastik"], "mama-sandalyesi": ["940180", "Sandalye"], "bebek-kuveti": ["392490", "Küvet"], "bebek-tulumu": ["611120", "Bebek giyim"], "bebek-bezi": ["961910", "Bebek bezi"], "islak-mendil": ["340130", "Islak mendil"],
  "emzik": ["401490", "Emzik"], "oto-koltugu": ["940120", "Oto koltuğu"], "bebek-besigi": ["940350", "Beşik"], "gogus-pompasi": ["901890", "Göğüs pompası"],
  "kedi-su-pinari": ["842121", "Su filtresi"], "kedi-tuvaleti": ["392490", "Kedi tuvaleti"], "kopek-tasmasi": ["420100", "Tasma"], "pet-yatagi": ["940490", "Yatak"], "mama-kabi": ["392410", "Mama kabı"],
  "kedi-tirmalama": ["420100", "Pet eşyası"], "pet-tiras-makinesi": ["851020", "Tıraş makinesi"], "pet-tasima-cantasi": ["420100", "Taşıma çantası"], "kedi-kumu": ["250810", "Kedi kumu"], "kopek-mamasi": ["230910", "Köpek maması"],
  "kedi-mamasi": ["230910", "Kedi maması"], "pet-kiyafeti": ["420100", "Pet kıyafeti"], "akvaryum": ["701000", "Akvaryum"], "kus-kafesi": ["732690", "Kafes"],
  "jel-kalem": ["960810", "Kalem"], "defter": ["482010", "Defter"], "yukselen-masa": ["940310", "Masa"], "ofis-koltugu": ["940130", "Ofis koltuğu"], "zimba": ["847290", "Zımba"], "beyaz-tahta": ["961000", "Tahta"],
  "kagit-ogutucu": ["847290", "Kağıt öğütücü"], "dosya-klasoru": ["482030", "Klasör"], "yapiskan-not": ["482010", "Not"], "makas": ["821300", "Makas"], "hesap-makinesi": ["847010", "Hesap makinesi"], "kalemlik": ["392610", "Kalemlik"],
  "koli-bandi": ["391910", "Bant"], "kargo-kutusu": ["481910", "Kutu"], "balonlu-naylon": ["392010", "Film"], "strec-film": ["392010", "Film"], "etiket-yazici": ["844332", "Yazıcı"], "palet": ["441520", "Palet"],
  "transpalet": ["842790", "Transpalet"], "raf-sistemi": ["940320", "Raf"], "kagit-poset": ["481940", "Poşet"], "kilitli-poset": ["392329", "Poşet"], "hediye-kutusu": ["481920", "Kutu"], "kurdele": ["580632", "Kurdele"],
  "kargo-poseti": ["392329", "Poşet"], "ambalaj-terazisi": ["842381", "Terazi"], "barkod-etiketi": ["482110", "Etiket"],
  "mobilya-koltuk": ["940161", "Koltuk"], "sehpa": ["940360", "Sehpa"], "kitaplik": ["940360", "Kitaplık"], "gardirop": ["940350", "Gardırop"], "yatak": ["940429", "Yatak"],
  "gitar": ["920290", "Gitar"], "klavye-piyano": ["920710", "Elektronik klavye"], "ukulele": ["920290", "Ukulele"], "mikrofon-standi": ["732690", "Stand"],
  "alarm-sistemi": ["853110", "Alarm"], "guvenlik-kamerasi": ["852589", "Kamera"], "kapi-zili": ["853110", "Kapı zili"], "parti-balonu": ["950590", "Parti malzemesi"], "hediye-paketi": ["481920", "Kutu"],
};

/** Group key → [code, label]: fallback when the leaf is unknown. */
export const HS_BY_GROUP: Record<string, [string, string]> = {
  electronics: ["8517", "Elektronik cihazlar ve aksesuarları"], computer: ["8471", "Bilgisayar ve çevre birimleri"], home: ["7323", "Ev eşyası"], kitchen: ["8516", "Elektrikli mutfak aletleri"],
  appliances: ["8509", "Küçük ev aletleri"], "fashion-women": ["6204", "Kadın giyim"], "fashion-men": ["6203", "Erkek giyim"], "fashion-kids": ["6209", "Çocuk giyim"], shoes: ["6402", "Ayakkabı"],
  bags: ["4202", "Çanta ve valiz"], accessories: ["9004", "Gözlük ve aksesuar"], beauty: ["3304", "Kozmetik"], health: ["9018", "Tıbbi cihaz"], sports: ["9506", "Spor malzemesi"],
  motorcycle: ["6506", "Kask ve koruyucu başlık"], auto: ["8708", "Oto yedek parça"], tools: ["8205", "El aletleri"], garden: ["8201", "Bahçe aletleri"], toys: ["9503", "Oyuncak"],
  baby: ["8715", "Bebek ürünleri"], pet: ["4201", "Evcil hayvan ürünleri"], office: ["9608", "Kırtasiye"], industrial: ["4819", "Ambalaj"], furniture: ["9403", "Mobilya"],
  textile: ["6302", "Ev tekstili"], music: ["9207", "Müzik aletleri"], security: ["8531", "Güvenlik cihazları"], party: ["9505", "Parti ve hediyelik"],
};

/** Keyword (folded, lower-case) → [code, label], for free titles when no leaf is known. */
const HS_KEYWORDS: [RegExp, string, string][] = [
  [/kulaklik|earbud|headphone|耳机|イヤホン|이어폰/i, "851830", "Kulaklık"],
  [/powerbank|power bank|移动电源|モバイルバッテリー|보조배터리/i, "850760", "Lityum-iyon akümülatör"],
  [/akilli saat|smart ?watch|智能手表|スマートウォッチ|스마트워치/i, "851762", "Akıllı saat"],
  [/kilif|phone case|手机壳|手机套|ケース/i, "392690", "Plastik kılıf"],
  [/telefon|smartphone|iphone|galaxy s|手机(?!壳|套|支架)/i, "851713", "Akıllı telefon"],
  [/kask|helmet|头盔|ヘルメット|헬멧/i, "650610", "Koruyucu kask"],
  [/airfryer|air fryer|fritoz|空气炸锅|エアフライヤー|에어프라이어/i, "851660", "Fritöz"],
  [/termos|thermos|保温杯|水筒|텀블러/i, "961700", "Termos"],
  [/ayakkabi|sneaker|shoes?|运动鞋|スニーカー|운동화/i, "640411", "Spor ayakkabı"],
  [/elbise|dress|连衣裙|ワンピース|원피스/i, "620443", "Elbise"],
  [/t-?shirt|tisort|T恤/i, "610910", "T-shirt"],
  [/canta|backpack|bag|双肩包|包|バッグ|가방/i, "420292", "Çanta"],
  [/gunes gozlugu|sunglasses|太阳镜|サングラス|선글라스/i, "900410", "Güneş gözlüğü"],
  [/supurge|vacuum|吸尘器|掃除機|청소기/i, "850811", "Elektrik süpürgesi"],
  [/hoparlor|speaker|音箱|スピーカー|스피커/i, "851821", "Hoparlör"],
  [/lamba|lamp|台灯|ランプ|램프/i, "940520", "Lamba"],
  [/oyuncak|toy|玩具|おもちゃ|장난감/i, "950300", "Oyuncak"],
  [/matkap|drill|电钻|ドリル|드릴/i, "846721", "Matkap"],
  [/sarj|charger|充电器|充電器|충전기/i, "850440", "Şarj cihazı"],
  [/kablo|cable|数据线|ケーブル|케이블/i, "854442", "Kablo"],
  [/saat|watch|手表|腕時計|시계/i, "910211", "Kol saati"],
  [/bebek arabasi|stroller|婴儿车|ベビーカー|유모차/i, "871500", "Bebek arabası"],
  [/mama|pet food|猫粮|狗粮/i, "230910", "Pet maması"],
  [/parfum|perfume|香水/i, "330300", "Parfüm"],
  [/mont|jacket|ceket|外套|ジャケット|자켓/i, "620193", "Mont"],
  [/pantolon|jean|pants|裤/i, "620342", "Pantolon"],
  [/yoga|fitness|dambil|dumbbell|哑铃|瑜伽/i, "950691", "Spor malzemesi"],
];

function fold(s: string): string {
  return s
    .replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase()
    .replace(/[çğıöşüâîû]/g, (c) => ({ ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" })[c] ?? c);
}

export function suggestHs(input: HsSuggestInput): HsSuggestion | null {
  if (input.overrides) {
    const o = (input.leafKey && input.overrides[input.leafKey]) || (input.title && input.overrides[input.title]);
    if (o) return { hs: o, label: "Kullanıcı düzeltmesi", confidence: 1, source: "user" };
  }
  if (input.leafKey) {
    const hit = HS_BY_LEAF[input.leafKey];
    if (hit) return { hs: hit[0], label: hit[1], confidence: 0.9, source: "leaf" };
  }
  if (input.title) {
    const f = fold(input.title);
    for (const [re, hs, label] of HS_KEYWORDS) if (re.test(f) || re.test(input.title)) return { hs, label, confidence: 0.6, source: "keyword" };
  }
  if (input.groupKey) {
    const hit = HS_BY_GROUP[input.groupKey];
    if (hit) return { hs: hit[0], label: hit[1], confidence: 0.5, source: "group" };
  }
  return null;
}

/** Formats a digit string as GTİP ("8517.13" for 851713). */
export function formatHs(hs: string): string {
  const d = hs.replace(/\D/g, "");
  if (d.length <= 4) return d;
  return `${d.slice(0, 4)}.${d.slice(4, 6)}${d.length > 6 ? `.${d.slice(6)}` : ""}`;
}
