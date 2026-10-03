/**
 * Category taxonomy: 25 groups, ≈450 leaf categories. Each leaf is "Türkçe|中文|English".
 * Leaf keys are derived from the Turkish name (ASCII slug) and must stay stable:
 * they are used in product ids and URLs. Renamed keys keep an alias in LEAF_ALIASES.
 */
export interface CategoryGroup {
  key: string;
  tr: string;
  zh: string;
  en: string;
  leaves: string[];
}

const G = (key: string, tr: string, zh: string, en: string, leaves: string[]): CategoryGroup => ({ key, tr, zh, en, leaves });

export const TAXONOMY: CategoryGroup[] = [
  G("electronics", "Elektronik", "消费电子", "Electronics", [
    "Kablosuz Kulaklık|无线耳机|wireless earbuds", "Kulak Üstü Kulaklık|头戴式耳机|over-ear headphones", "Kulaklık|耳机|headphones", "Akıllı Saat|智能手表|smart watch", "Akıllı Bileklik|智能手环|fitness tracker", "Powerbank|移动电源|power bank",
    "Bluetooth Hoparlör|蓝牙音箱|bluetooth speaker", "Şarj Adaptörü|充电器|charger", "Şarj Kablosu|数据线|charging cable", "Kablosuz Şarj|无线充电器|wireless charger", "Webcam|摄像头|webcam",
    "Mekanik Klavye|机械键盘|mechanical keyboard", "Kablosuz Mouse|无线鼠标|wireless mouse", "Oyuncu Kulaklığı|游戏耳机|gaming headset", "Mikrofon|麦克风|microphone", "Tablet Kılıfı|平板保护套|tablet case",
    "Telefon Kılıfı|手机壳|phone case", "Ekran Koruyucu|钢化膜|screen protector", "Telefon Tutucu|手机支架|phone holder", "Akıllı Priz|智能插座|smart plug", "IP Kamera|网络摄像机|ip camera",
    "Drone|无人机|drone", "Aksiyon Kamerası|运动相机|action camera", "E-Kitap Okuyucu|电子书阅读器|e-reader", "USB Bellek|U盘|usb flash drive", "Taşınabilir SSD|移动固态硬盘|portable ssd",
    "Telefon|手机|smartphone", "Tablet|平板电脑|tablet", "Laptop|笔记本电脑|laptop", "Monitör|显示器|monitor", "Televizyon|电视|tv", "Pil|电池|battery",
    "Ampul|灯泡|light bulb", "Priz|插座|power strip",
  ]),
  G("computer", "Bilgisayar ve Ofis Teknolojisi", "电脑办公", "Computers and office tech", [
    "Laptop Standı|笔记本支架|laptop stand", "Monitör Kolu|显示器支架|monitor arm", "USB Hub|扩展坞|usb hub", "Laptop Çantası|电脑包|laptop bag", "Soğutucu Altlık|散热器|cooling pad",
    "Mouse Pad|鼠标垫|mouse pad", "Yazıcı Kartuşu|打印机墨盒|printer cartridge", "Etiket Makinesi|标签机|label maker", "Barkod Okuyucu|扫码枪|barcode scanner", "Mini PC|迷你主机|mini pc",
    "Grafik Tablet|数位板|drawing tablet", "Ağ Kablosu|网线|ethernet cable", "Wi-Fi Router|路由器|wifi router", "Kesintisiz Güç Kaynağı|UPS电源|ups", "Projeksiyon Cihazı|投影仪|projector",
  ]),
  G("home", "Ev ve Yaşam", "家居生活", "Home and living", [
    "Termos|保温杯|thermos", "Su Şişesi|水杯|water bottle", "Yapışmaz Tava|不粘锅|non-stick pan", "Tencere Seti|锅具套装|cookware set", "Bıçak Seti|刀具套装|knife set",
    "Masaüstü Düzenleyici|桌面收纳|desk organizer", "Dolap Organizeri|衣柜收纳|closet organizer", "Vakumlu Saklama Poşeti|真空压缩袋|vacuum storage bag", "Hava Nemlendirici|加湿器|humidifier", "Aroma Difüzörü|香薰机|aroma diffuser",
    "LED Şerit|灯带|led strip", "Masa Lambası|台灯|desk lamp", "Gece Lambası|小夜灯|night light", "Akıllı Ampul|智能灯泡|smart bulb", "Duvar Saati|挂钟|wall clock",
    "Yastık|枕头|pillow", "Nevresim Takımı|四件套|bedding set", "Battaniye|毛毯|blanket", "Perde|窗帘|curtain", "Halı|地毯|rug",
    "Banyo Paspası|浴室地垫|bath mat", "Duş Başlığı|花洒|shower head", "Havlu|毛巾|towel", "Çamaşır Sepeti|脏衣篮|laundry basket", "Askı|衣架|hanger",
    "Temizlik Bezi|抹布|cleaning cloth", "Paspas|拖把|mop", "Çöp Kovası|垃圾桶|trash can", "Mum|香薰蜡烛|scented candle", "Vazo|花瓶|vase",
  ]),
  G("textile", "Ev Tekstili", "家纺", "Home textiles", [
    "Yorgan|被子|duvet",
  ]),
  G("furniture", "Mobilya", "家具", "Furniture", [
    "Mobilya Koltuk|沙发|sofa",
  ]),
  G("kitchen", "Mutfak Aletleri", "厨房电器", "Kitchen appliances", [
    "Airfryer|空气炸锅|air fryer", "Blender|榨汁机|blender", "Kahve Makinesi|咖啡机|coffee maker", "Elektrikli Kettle|电热水壶|electric kettle", "Tost Makinesi|三明治机|sandwich maker",
    "Mikser|打蛋器|hand mixer", "Mutfak Tartısı|厨房秤|kitchen scale", "Vakum Makinesi|真空封口机|vacuum sealer", "Buz Makinesi|制冰机|ice maker", "Yoğurt Makinesi|酸奶机|yogurt maker",
    "Ekmek Yapma Makinesi|面包机|bread maker", "Elektrikli Izgara|电烤盘|electric grill", "Pirinç Pişirici|电饭煲|rice cooker", "Süt Köpürtücü|奶泡机|milk frother", "Su Arıtma|净水器|water purifier",
    "Mikrodalga|微波炉|microwave",
  ]),
  G("appliances", "Beyaz Eşya ve Küçük Ev Aletleri", "家用电器", "Home appliances", [
    "El Süpürgesi|手持吸尘器|handheld vacuum", "Robot Süpürge|扫地机器人|robot vacuum", "Kablosuz Süpürge|无线吸尘器|cordless vacuum", "Buharlı Ütü|蒸汽熨斗|steam iron", "Vantilatör|风扇|fan", "Isıtıcı|取暖器|heater",
    "Hava Temizleyici|空气净化器|air purifier", "Nem Alıcı|除湿机|dehumidifier", "Dikiş Makinesi|缝纫机|sewing machine", "Saç Kurutma Makinesi|吹风机|hair dryer", "Elektrikli Battaniye|电热毯|electric blanket",
  ]),
  G("fashion-women", "Kadın Giyim", "女装", "Women's clothing", [
    "Elbise|连衣裙|dress", "Bluz|衬衫|blouse", "Kadın T-shirt|女T恤|women's t-shirt", "Etek|半身裙|skirt", "Kadın Pantolon|女裤|women's pants",
    "Kadın Jean|女牛仔裤|women's jeans", "Kadın Mont|女外套|women's jacket", "Kadın Sweatshirt|女卫衣|women's sweatshirt", "Hırka|针织开衫|cardigan", "Kazak|毛衣|sweater",
    "Tayt|打底裤|leggings", "Şort|短裤|shorts", "Tulum|连体裤|jumpsuit", "Pijama|睡衣|pajamas", "İç Çamaşırı|内衣|underwear",
    "Mayo|泳衣|swimsuit", "Spor Sütyeni|运动内衣|sports bra", "Abiye|晚礼服|evening dress", "Trençkot|风衣|trench coat", "Yelek|马甲|vest",
  ]),
  G("fashion-men", "Erkek Giyim", "男装", "Men's clothing", [
    "Erkek T-shirt|男T恤|men's t-shirt", "Polo Yaka|POLO衫|polo shirt", "Gömlek|男衬衫|shirt", "Erkek Jean|男牛仔裤|men's jeans", "Chino Pantolon|休闲裤|chino pants",
    "Erkek Mont|男外套|men's jacket", "Erkek Sweatshirt|男卫衣|men's sweatshirt", "Erkek Kazak|男毛衣|men's sweater", "Eşofman|运动套装|tracksuit", "Erkek Şort|男短裤|men's shorts",
    "Takım Elbise|西装|suit", "Erkek Yelek|男马甲|men's vest", "Erkek Pijama|男睡衣|men's pajamas", "Boxer|男内裤|boxer briefs", "Deri Ceket|皮夹克|leather jacket",
  ]),
  G("fashion-kids", "Çocuk Giyim", "童装", "Kids' clothing", [
    "Çocuk T-shirt|儿童T恤|kids t-shirt",
  ]),
  G("shoes", "Ayakkabı", "鞋靴", "Shoes", [
    "Spor Ayakkabı|运动鞋|sneakers", "Koşu Ayakkabısı|跑步鞋|running shoes", "Sneaker|板鞋|sneaker", "Bot|靴子|boots", "Çizme|长靴|knee boots",
    "Topuklu Ayakkabı|高跟鞋|high heels", "Babet|平底鞋|flats", "Sandalet|凉鞋|sandals", "Terlik|拖鞋|slippers", "Loafer|乐福鞋|loafers",
    "Klasik Erkek Ayakkabı|正装皮鞋|dress shoes", "Yürüyüş Botu|登山鞋|hiking boots", "Futbol Ayakkabısı|足球鞋|football boots", "Çocuk Ayakkabısı|童鞋|kids shoes", "Ev Terliği|家居拖鞋|house slippers",
    "Yağmur Botu|雨靴|rain boots", "İş Güvenliği Ayakkabısı|劳保鞋|safety shoes", "Ayakkabı Tabanlığı|鞋垫|insoles", "Ayakkabı Bağcığı|鞋带|shoelaces", "Ayakkabı Rafı|鞋架|shoe rack",
  ]),
  G("bags", "Çanta ve Valiz", "箱包", "Bags and luggage", [
    "Sırt Çantası|双肩包|backpack", "Valiz|行李箱|suitcase", "Cüzdan|钱包|wallet", "Çapraz Çanta|斜挎包|crossbody bag", "Tote Çanta|托特包|tote bag",
    "Bel Çantası|腰包|waist bag", "Omuz Çantası|单肩包|shoulder bag", "Evrak Çantası|公文包|briefcase", "Spor Çantası|健身包|gym bag", "Makyaj Çantası|化妆包|makeup bag",
    "Kartlık|卡包|card holder", "Seyahat Organizeri|旅行收纳|travel organizer", "Beslenme Çantası|保温饭袋|lunch bag", "Okul Çantası|书包|school bag", "Kamera Çantası|相机包|camera bag",
    "Çanta|包|bag",
  ]),
  G("accessories", "Aksesuar ve Takı", "配饰饰品", "Accessories and jewelry", [
    "Güneş Gözlüğü|太阳镜|sunglasses", "Gözlük Çerçevesi|眼镜框|eyeglass frames", "Mavi Işık Gözlüğü|防蓝光眼镜|blue light glasses", "Kol Saati|手表|wristwatch", "Saat Kordonu|表带|watch strap",
    "Kolye|项链|necklace", "Bileklik|手链|bracelet", "Küpe|耳环|earrings", "Yüzük|戒指|ring", "Kemer|皮带|belt",
    "Şapka|帽子|hat", "Bere|毛线帽|beanie", "Atkı|围巾|scarf", "Eldiven|手套|gloves", "Kravat|领带|tie",
    "Saç Tokası|发夹|hair clip", "Şemsiye|雨伞|umbrella", "Anahtarlık|钥匙扣|keychain", "Broş|胸针|brooch", "Halhal|脚链|anklet",
    "Saat|手表|watch", "Gözlük|眼镜|glasses",
  ]),
  G("beauty", "Kozmetik ve Kişisel Bakım", "美妆个护", "Beauty and personal care", [
    "Yüz Serumu|精华液|face serum", "Nemlendirici Krem|面霜|moisturizer", "Güneş Kremi|防晒霜|sunscreen", "Yüz Maskesi|面膜|face mask", "Temizleme Jeli|洁面乳|facial cleanser",
    "Makyaj Fırçası|化妆刷|makeup brush", "Fondöten|粉底液|foundation", "Ruj|口红|lipstick", "Maskara|睫毛膏|mascara", "Far Paleti|眼影盘|eyeshadow palette",
    "Oje|指甲油|nail polish", "UV Tırnak Lambası|美甲灯|uv nail lamp", "Parfüm|香水|perfume", "Saç Düzleştirici|直发器|hair straightener", "Saç Maşası|卷发棒|curling iron",
    "Saç Kesme Makinesi|理发器|hair clipper", "Tıraş Makinesi|剃须刀|electric shaver", "Epilasyon Cihazı|脱毛仪|hair removal device", "Elektrikli Diş Fırçası|电动牙刷|electric toothbrush", "Makyaj Aynası|化妆镜|makeup mirror",
    "Masaj Tabancası|筋膜枪|massage gun", "Yüz Temizleme Cihazı|洁面仪|facial cleansing brush", "Şampuan|洗发水|shampoo", "Vücut Losyonu|身体乳|body lotion", "Diş Beyazlatma|牙齿美白|teeth whitening",
  ]),
  G("health", "Sağlık ve Medikal", "健康医疗", "Health and medical", [
    "Tansiyon Aleti|血压计|blood pressure monitor", "Ateş Ölçer|体温计|thermometer", "Pulse Oksimetre|血氧仪|pulse oximeter", "Akıllı Tartı|体脂秤|smart scale", "Masaj Yastığı|按摩枕|massage pillow",
    "Boyun Masaj Aleti|颈椎按摩仪|neck massager", "Ortopedik Yastık|护颈枕|orthopedic pillow", "Bel Desteği|护腰|back support", "Dizlik|护膝|knee brace", "Sıcak Su Torbası|热水袋|hot water bottle",
    "İlk Yardım Çantası|急救包|first aid kit", "Maske|口罩|face mask", "Dezenfektan|消毒液|disinfectant", "Nebulizatör|雾化器|nebulizer", "Ayak Masaj Aleti|足疗机|foot massager",
  ]),
  G("sports", "Spor ve Outdoor", "运动户外", "Sports and outdoor", [
    "Yoga Matı|瑜伽垫|yoga mat", "Dambıl|哑铃|dumbbell", "Direnç Bandı|弹力带|resistance band", "Atlama İpi|跳绳|jump rope", "Spor Matarası|运动水壶|sports bottle",
    "Fitness Eldiveni|健身手套|gym gloves", "Kettlebell|壶铃|kettlebell", "Koşu Bandı|跑步机|treadmill", "Kondisyon Bisikleti|动感单车|exercise bike", "Pilates Topu|瑜伽球|exercise ball",
    "Kamp Çadırı|帐篷|camping tent", "Uyku Tulumu|睡袋|sleeping bag", "Kamp Sandalyesi|折叠椅|camping chair", "Kafa Lambası|头灯|headlamp", "Kamp Ocağı|卡式炉|camping stove",
    "Dağcı Sırt Çantası|登山包|hiking backpack", "Trekking Batonu|登山杖|trekking pole", "Olta Takımı|钓鱼竿|fishing rod", "Dürbün|望远镜|binoculars", "Termal İçlik|保暖内衣|thermal underwear",
    "Bisiklet Kaskı|骑行头盔|bike helmet", "Bisiklet Lambası|自行车灯|bike light", "Scooter|滑板车|scooter", "Kaykay|滑板|skateboard", "Paten|轮滑鞋|roller skates",
    "Yüzücü Gözlüğü|泳镜|swim goggles", "Şnorkel Seti|浮潜套装|snorkel set", "Futbol Topu|足球|football", "Basketbol Topu|篮球|basketball", "Raket|球拍|racket",
  ]),
  G("motorcycle", "Motosiklet", "摩托车用品", "Motorcycle", [
    "Motosiklet Kaskı|摩托车头盔|motorcycle helmet", "Kask|头盔|helmet", "Motosiklet Eldiveni|骑行手套|motorcycle gloves", "Motosiklet Montu|骑行服|motorcycle jacket", "Dizlik Koruma|护膝护具|knee guards", "Motosiklet Telefon Tutucu|摩托车手机支架|motorcycle phone mount",
    "Motosiklet Çantası|摩托车包|motorcycle bag", "Motosiklet Kilidi|摩托车锁|motorcycle lock", "Egzoz|排气管|exhaust", "Gidon Elciği|车把套|handlebar grips", "Motosiklet Aynası|摩托车后视镜|motorcycle mirror",
    "Motosiklet Lambası|摩托车灯|motorcycle light", "Zincir Seti|链条套装|chain kit", "Fren Balatası|刹车片|brake pads", "Motosiklet Örtüsü|摩托车罩|motorcycle cover", "Motosiklet Aküsü|摩托车电池|motorcycle battery",
    "Elektrikli Scooter|电动滑板车|electric scooter", "Elektrikli Bisiklet|电动自行车|electric bike", "Bisiklet Lastiği|自行车轮胎|bike tire", "Bisiklet Selesi|自行车座垫|bike saddle", "Bisiklet Pompası|打气筒|bike pump",
  ]),
  G("auto", "Oto Aksesuar ve Yedek Parça", "汽车用品配件", "Car accessories and parts", [
    "Araç Kamerası|行车记录仪|dash cam", "Araç Telefon Tutucu|车载手机支架|car phone holder", "Araç Süpürgesi|车载吸尘器|car vacuum", "Oto Koltuk Kılıfı|汽车座套|car seat cover", "Akü Takviye|应急启动电源|jump starter",
    "Lastik Pompası|充气泵|tire inflator", "Güneşlik|遮阳挡|sun shade", "Araç Şarj Cihazı|车充|car charger", "LED Far Ampulü|LED车灯|led headlight bulb", "Bagaj Organizeri|后备箱收纳|trunk organizer",
    "Oto Paspası|汽车脚垫|car floor mat", "Direksiyon Kılıfı|方向盘套|steering wheel cover", "Araç Kokusu|车载香薰|car air freshener", "Oto Yıkama Seti|洗车套装|car wash kit", "Cam Suyu|玻璃水|windshield washer fluid",
    "Fren Diski|刹车盘|brake disc", "Yağ Filtresi|机油滤清器|oil filter", "Hava Filtresi|空气滤清器|air filter", "Buji|火花塞|spark plug", "Silecek|雨刮器|wiper blade",
    "Amortisör|减震器|shock absorber", "Far|前大灯|headlight", "Stop Lambası|尾灯|tail light", "Tampon|保险杠|bumper", "Jant|轮毂|wheel rim",
    "Lastik|轮胎|tire", "Oto Teyp|车载音响|car stereo", "OBD Tarayıcı|OBD检测仪|obd scanner", "Park Sensörü|倒车雷达|parking sensor", "Geri Görüş Kamerası|倒车影像|backup camera",
  ]),
  G("tools", "Hırdavat ve Yapı Market", "五金工具", "Tools and hardware", [
    "Şarjlı Matkap|电钻|cordless drill", "Alet Seti|工具套装|tool set", "Şerit Metre|卷尺|tape measure", "Lazer Hizalayıcı|激光水平仪|laser level", "Elektrikli Tornavida|电动螺丝刀|electric screwdriver",
    "Silikon Tabancası|胶枪|glue gun", "Multimetre|万用表|multimeter", "El Feneri|手电筒|flashlight", "Anahtar Seti|扳手套装|wrench set", "Merdiven|梯子|ladder",
    "Avuç Taşlama|角磨机|angle grinder", "Dekupaj Testere|曲线锯|jigsaw", "Kaynak Makinesi|电焊机|welding machine", "Basınçlı Yıkama|高压清洗机|pressure washer", "Hava Kompresörü|空压机|air compressor",
    "Kilit|门锁|door lock", "Akıllı Kilit|智能门锁|smart lock", "Vida Seti|螺丝套装|screw set", "Musluk|水龙头|faucet", "Boya Rulosu|滚筒刷|paint roller",
    "İş Eldiveni|劳保手套|work gloves", "Güvenlik Gözlüğü|护目镜|safety goggles", "Alet Çantası|工具包|tool bag", "Mengene|台钳|bench vise", "Lehim Makinesi|电烙铁|soldering iron",
  ]),
  G("garden", "Bahçe ve Balkon", "园艺", "Garden and balcony", [
    "Bahçe Hortumu|浇水软管|garden hose", "Saksı|花盆|flower pot", "Bahçe Makası|园艺剪|pruning shears", "Tohum|种子|seeds", "Çim Biçme Makinesi|割草机|lawn mower",
    "Bahçe Lambası|太阳能庭院灯|solar garden light", "Hamak|吊床|hammock", "Bahçe Mobilyası|户外家具|outdoor furniture", "Sulama Sistemi|滴灌系统|drip irrigation", "Böcek Kovucu|驱蚊器|mosquito repeller",
    "Mangal|烧烤炉|bbq grill", "Bahçe Eldiveni|园艺手套|garden gloves", "Dikey Bahçe|垂直花架|vertical planter", "Kuş Yemliği|喂鸟器|bird feeder", "Havuz|充气泳池|inflatable pool",
  ]),
  G("toys", "Oyuncak ve Hobi", "玩具爱好", "Toys and hobbies", [
    "Yapı Blokları|积木|building blocks", "Uzaktan Kumandalı Araba|遥控车|rc car", "Peluş Oyuncak|毛绒玩具|plush toy", "Puzzle|拼图|puzzle", "Slime|史莱姆|slime",
    "Uçurtma|风筝|kite", "Kutu Oyunu|桌游|board game", "Oyuncak Bebek|娃娃|doll", "Su Tabancası|水枪|water gun", "Eğitici Oyuncak|益智玩具|educational toy",
    "Model Araba|车模|model car", "Figür|手办|action figure", "Kaleidoskop|万花筒|kaleidoscope", "Oyun Hamuru|彩泥|play dough", "Bilim Seti|科学实验套装|science kit",
    "Trambolin|蹦床|trampoline", "Çocuk Bisikleti|儿童自行车|kids bike", "Oyuncak Mutfak|过家家厨房|play kitchen", "Müzik Oyuncağı|音乐玩具|musical toy", "Fidget Oyuncak|解压玩具|fidget toy",
  ]),
  G("baby", "Anne ve Bebek", "母婴", "Mother and baby", [
    "Bebek Arabası|婴儿车|stroller", "Biberon|奶瓶|baby bottle", "Bebek Kamerası|婴儿监护器|baby monitor", "Kanguru|婴儿背带|baby carrier", "Oyun Matı|爬行垫|play mat",
    "Sterilizatör|消毒器|bottle sterilizer", "Diş Kaşıyıcı|牙胶|teether", "Mama Sandalyesi|餐椅|high chair", "Bebek Küveti|婴儿浴盆|baby bathtub", "Bebek Tulumu|连体衣|baby romper",
    "Bebek Bezi|纸尿裤|diapers", "Islak Mendil|湿巾|wet wipes", "Emzik|安抚奶嘴|pacifier", "Bebek Battaniyesi|婴儿毯|baby blanket", "Oto Koltuğu|安全座椅|car seat",
    "Bebek Beşiği|婴儿床|crib", "Göğüs Pompası|吸奶器|breast pump", "Bebek Termometresi|婴儿体温计|baby thermometer", "Önlük|围兜|bib", "Hamile Giyim|孕妇装|maternity clothes",
  ]),
  G("pet", "Evcil Hayvan", "宠物用品", "Pet supplies", [
    "Kedi Su Pınarı|宠物饮水机|pet water fountain", "Kedi Tuvaleti|猫砂盆|litter box", "Köpek Tasması|牵引绳|dog leash", "Pet Yatağı|宠物窝|pet bed", "Mama Kabı|喂食器|pet feeder",
    "Kedi Tırmalama|猫抓板|cat scratcher", "Pet Tıraş Makinesi|宠物剃毛器|pet clipper", "Pet Taşıma Çantası|宠物包|pet carrier", "Pet Oyuncağı|宠物玩具|pet toy", "LED Tasma|发光项圈|led collar",
    "Kedi Kumu|猫砂|cat litter", "Köpek Maması|狗粮|dog food", "Kedi Maması|猫粮|cat food", "Pet Kıyafeti|宠物衣服|pet clothes", "Akvaryum|鱼缸|aquarium", "Kuş Kafesi|鸟笼|bird cage",
  ]),
  G("office", "Ofis ve Kırtasiye", "办公文具", "Office and stationery", [
    "Jel Kalem|中性笔|gel pen", "Defter|笔记本|notebook", "Yükselen Masa|升降桌|standing desk", "Ofis Koltuğu|办公椅|office chair", "Zımba|订书机|stapler",
    "Beyaz Tahta|白板|whiteboard", "Kağıt Öğütücü|碎纸机|paper shredder", "Dosya Klasörü|文件夹|file folder", "Yapışkan Not|便利贴|sticky notes", "Makas|剪刀|scissors",
    "Hesap Makinesi|计算器|calculator", "Kalemlik|笔筒|pen holder", "Boya Kalemi Seti|彩铅|colored pencils", "Suluboya Seti|水彩|watercolor set", "Çizim Defteri|速写本|sketchbook",
  ]),
  G("industrial", "Endüstriyel ve Ambalaj", "工业包装", "Industrial and packaging", [
    "Koli Bandı|封箱胶带|packing tape", "Kargo Kutusu|快递纸箱|shipping box", "Balonlu Naylon|气泡膜|bubble wrap", "Streç Film|缠绕膜|stretch film", "Etiket Yazıcı|标签打印机|label printer",
    "Palet|托盘|pallet", "Transpalet|手动叉车|pallet jack", "Raf Sistemi|货架|shelving", "Kağıt Poşet|纸袋|paper bag", "Kilitli Poşet|密封袋|zip bag",
    "Hediye Kutusu|礼品盒|gift box", "Kurdele|丝带|ribbon", "Kargo Poşeti|快递袋|mailer bag", "Ambalaj Terazisi|电子台秤|platform scale", "Barkod Etiketi|条码标签|barcode label",
  ]),
];

export interface Leaf {
  key: string;
  group: string;
  tr: string;
  zh: string;
  en: string;
}

/** Old keys that were renamed; `getLeaf` resolves them so stored product ids keep working. */
export const LEAF_ALIASES: Record<string, string> = { "auto-paspas": "oto-paspasi" };

const TRMAP: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", İ: "i", Ç: "c", Ğ: "g", Ö: "o", Ş: "s", Ü: "u" };
export function slug(tr: string): string {
  return tr
    .replace(/[çğıöşüİÇĞÖŞÜ]/g, (c) => TRMAP[c] ?? c)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

let leaves: Leaf[] | null = null;
export function getLeaves(): Leaf[] {
  if (leaves) return leaves;
  const seen = new Set<string>();
  leaves = TAXONOMY.flatMap((g) =>
    g.leaves.map((s) => {
      const parts = s.split("|");
      const tr = parts[0] ?? "";
      const zh = parts[1] ?? "";
      const en = parts[2] ?? "";
      let key = slug(tr);
      if (seen.has(key)) key = `${g.key}-${key}`;
      seen.add(key);
      return { key, group: g.key, tr, zh, en };
    }),
  );
  return leaves;
}

export function getLeaf(key: string): Leaf | undefined {
  const k = LEAF_ALIASES[key] ?? key;
  return getLeaves().find((l) => l.key === k);
}
