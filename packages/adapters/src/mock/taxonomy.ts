/**
 * Category taxonomy: ~20 groups, ~350 leaf categories. Each leaf is "Türkçe|中文".
 * Leaf keys are derived from the Turkish name (ASCII slug) and must stay stable:
 * they are used in product ids and URLs.
 */
export interface CategoryGroup {
  key: string;
  tr: string;
  zh: string;
  leaves: string[];
}

const G = (key: string, tr: string, zh: string, leaves: string[]): CategoryGroup => ({ key, tr, zh, leaves });

export const TAXONOMY: CategoryGroup[] = [
  G("electronics", "Elektronik", "消费电子", [
    "Kablosuz Kulaklık|无线耳机", "Kulak Üstü Kulaklık|头戴式耳机", "Akıllı Saat|智能手表", "Akıllı Bileklik|智能手环", "Powerbank|移动电源",
    "Bluetooth Hoparlör|蓝牙音箱", "Şarj Adaptörü|充电器", "Şarj Kablosu|数据线", "Kablosuz Şarj|无线充电器", "Webcam|摄像头",
    "Mekanik Klavye|机械键盘", "Kablosuz Mouse|无线鼠标", "Oyuncu Kulaklığı|游戏耳机", "Mikrofon|麦克风", "Tablet Kılıfı|平板保护套",
    "Telefon Kılıfı|手机壳", "Ekran Koruyucu|钢化膜", "Telefon Tutucu|手机支架", "Akıllı Priz|智能插座", "IP Kamera|网络摄像机",
    "Drone|无人机", "Aksiyon Kamerası|运动相机", "E-Kitap Okuyucu|电子书阅读器", "USB Bellek|U盘", "Taşınabilir SSD|移动固态硬盘",
  ]),
  G("computer", "Bilgisayar ve Ofis Teknolojisi", "电脑办公", [
    "Laptop Standı|笔记本支架", "Monitör Kolu|显示器支架", "USB Hub|扩展坞", "Laptop Çantası|电脑包", "Soğutucu Altlık|散热器",
    "Mouse Pad|鼠标垫", "Yazıcı Kartuşu|打印机墨盒", "Etiket Makinesi|标签机", "Barkod Okuyucu|扫码枪", "Mini PC|迷你主机",
    "Grafik Tablet|数位板", "Ağ Kablosu|网线", "Wi-Fi Router|路由器", "Kesintisiz Güç Kaynağı|UPS电源", "Projeksiyon Cihazı|投影仪",
  ]),
  G("home", "Ev ve Yaşam", "家居生活", [
    "Termos|保温杯", "Su Şişesi|水杯", "Yapışmaz Tava|不粘锅", "Tencere Seti|锅具套装", "Bıçak Seti|刀具套装",
    "Masaüstü Düzenleyici|桌面收纳", "Dolap Organizeri|衣柜收纳", "Vakumlu Saklama Poşeti|真空压缩袋", "Hava Nemlendirici|加湿器", "Aroma Difüzörü|香薰机",
    "LED Şerit|灯带", "Masa Lambası|台灯", "Gece Lambası|小夜灯", "Akıllı Ampul|智能灯泡", "Duvar Saati|挂钟",
    "Yastık|枕头", "Nevresim Takımı|四件套", "Battaniye|毛毯", "Perde|窗帘", "Halı|地毯",
    "Banyo Paspası|浴室地垫", "Duş Başlığı|花洒", "Havlu|毛巾", "Çamaşır Sepeti|脏衣篮", "Askı|衣架",
    "Temizlik Bezi|抹布", "Paspas|拖把", "Çöp Kovası|垃圾桶", "Mum|香薰蜡烛", "Vazo|花瓶",
  ]),
  G("kitchen", "Mutfak Aletleri", "厨房电器", [
    "Airfryer|空气炸锅", "Blender|榨汁机", "Kahve Makinesi|咖啡机", "Elektrikli Kettle|电热水壶", "Tost Makinesi|三明治机",
    "Mikser|打蛋器", "Mutfak Tartısı|厨房秤", "Vakum Makinesi|真空封口机", "Buz Makinesi|制冰机", "Yoğurt Makinesi|酸奶机",
    "Ekmek Yapma Makinesi|面包机", "Elektrikli Izgara|电烤盘", "Pirinç Pişirici|电饭煲", "Süt Köpürtücü|奶泡机", "Su Arıtma|净水器",
  ]),
  G("appliances", "Beyaz Eşya ve Küçük Ev Aletleri", "家用电器", [
    "El Süpürgesi|手持吸尘器", "Robot Süpürge|扫地机器人", "Buharlı Ütü|蒸汽熨斗", "Vantilatör|风扇", "Isıtıcı|取暖器",
    "Hava Temizleyici|空气净化器", "Nem Alıcı|除湿机", "Dikiş Makinesi|缝纫机", "Saç Kurutma Makinesi|吹风机", "Elektrikli Battaniye|电热毯",
  ]),
  G("fashion-women", "Kadın Giyim", "女装", [
    "Elbise|连衣裙", "Bluz|衬衫", "Kadın T-shirt|女T恤", "Etek|半身裙", "Kadın Pantolon|女裤",
    "Kadın Jean|女牛仔裤", "Kadın Mont|女外套", "Kadın Sweatshirt|女卫衣", "Hırka|针织开衫", "Kazak|毛衣",
    "Tayt|打底裤", "Şort|短裤", "Tulum|连体裤", "Pijama|睡衣", "İç Çamaşırı|内衣",
    "Mayo|泳衣", "Spor Sütyeni|运动内衣", "Abiye|晚礼服", "Trençkot|风衣", "Yelek|马甲",
  ]),
  G("fashion-men", "Erkek Giyim", "男装", [
    "Erkek T-shirt|男T恤", "Polo Yaka|POLO衫", "Gömlek|男衬衫", "Erkek Jean|男牛仔裤", "Chino Pantolon|休闲裤",
    "Erkek Mont|男外套", "Erkek Sweatshirt|男卫衣", "Erkek Kazak|男毛衣", "Eşofman|运动套装", "Erkek Şort|男短裤",
    "Takım Elbise|西装", "Erkek Yelek|男马甲", "Erkek Pijama|男睡衣", "Boxer|男内裤", "Deri Ceket|皮夹克",
  ]),
  G("shoes", "Ayakkabı", "鞋靴", [
    "Spor Ayakkabı|运动鞋", "Koşu Ayakkabısı|跑步鞋", "Sneaker|板鞋", "Bot|靴子", "Çizme|长靴",
    "Topuklu Ayakkabı|高跟鞋", "Babet|平底鞋", "Sandalet|凉鞋", "Terlik|拖鞋", "Loafer|乐福鞋",
    "Klasik Erkek Ayakkabı|正装皮鞋", "Yürüyüş Botu|登山鞋", "Futbol Ayakkabısı|足球鞋", "Çocuk Ayakkabısı|童鞋", "Ev Terliği|家居拖鞋",
    "Yağmur Botu|雨靴", "İş Güvenliği Ayakkabısı|劳保鞋", "Ayakkabı Tabanlığı|鞋垫", "Ayakkabı Bağcığı|鞋带", "Ayakkabı Rafı|鞋架",
  ]),
  G("bags", "Çanta ve Valiz", "箱包", [
    "Sırt Çantası|双肩包", "Valiz|行李箱", "Cüzdan|钱包", "Çapraz Çanta|斜挎包", "Tote Çanta|托特包",
    "Bel Çantası|腰包", "Omuz Çantası|单肩包", "Evrak Çantası|公文包", "Spor Çantası|健身包", "Makyaj Çantası|化妆包",
    "Kartlık|卡包", "Seyahat Organizeri|旅行收纳", "Beslenme Çantası|保温饭袋", "Okul Çantası|书包", "Kamera Çantası|相机包",
  ]),
  G("accessories", "Aksesuar ve Takı", "配饰饰品", [
    "Güneş Gözlüğü|太阳镜", "Gözlük Çerçevesi|眼镜框", "Mavi Işık Gözlüğü|防蓝光眼镜", "Kol Saati|手表", "Saat Kordonu|表带",
    "Kolye|项链", "Bileklik|手链", "Küpe|耳环", "Yüzük|戒指", "Kemer|皮带",
    "Şapka|帽子", "Bere|毛线帽", "Atkı|围巾", "Eldiven|手套", "Kravat|领带",
    "Saç Tokası|发夹", "Şemsiye|雨伞", "Anahtarlık|钥匙扣", "Broş|胸针", "Halhal|脚链",
  ]),
  G("beauty", "Kozmetik ve Kişisel Bakım", "美妆个护", [
    "Yüz Serumu|精华液", "Nemlendirici Krem|面霜", "Güneş Kremi|防晒霜", "Yüz Maskesi|面膜", "Temizleme Jeli|洁面乳",
    "Makyaj Fırçası|化妆刷", "Fondöten|粉底液", "Ruj|口红", "Maskara|睫毛膏", "Far Paleti|眼影盘",
    "Oje|指甲油", "UV Tırnak Lambası|美甲灯", "Parfüm|香水", "Saç Düzleştirici|直发器", "Saç Maşası|卷发棒",
    "Saç Kesme Makinesi|理发器", "Tıraş Makinesi|剃须刀", "Epilasyon Cihazı|脱毛仪", "Elektrikli Diş Fırçası|电动牙刷", "Makyaj Aynası|化妆镜",
    "Masaj Tabancası|筋膜枪", "Yüz Temizleme Cihazı|洁面仪", "Şampuan|洗发水", "Vücut Losyonu|身体乳", "Diş Beyazlatma|牙齿美白",
  ]),
  G("health", "Sağlık ve Medikal", "健康医疗", [
    "Tansiyon Aleti|血压计", "Ateş Ölçer|体温计", "Pulse Oksimetre|血氧仪", "Akıllı Tartı|体脂秤", "Masaj Yastığı|按摩枕",
    "Boyun Masaj Aleti|颈椎按摩仪", "Ortopedik Yastık|护颈枕", "Bel Desteği|护腰", "Dizlik|护膝", "Sıcak Su Torbası|热水袋",
    "İlk Yardım Çantası|急救包", "Maske|口罩", "Dezenfektan|消毒液", "Nebulizatör|雾化器", "Ayak Masaj Aleti|足疗机",
  ]),
  G("sports", "Spor ve Outdoor", "运动户外", [
    "Yoga Matı|瑜伽垫", "Dambıl|哑铃", "Direnç Bandı|弹力带", "Atlama İpi|跳绳", "Spor Matarası|运动水壶",
    "Fitness Eldiveni|健身手套", "Kettlebell|壶铃", "Koşu Bandı|跑步机", "Kondisyon Bisikleti|动感单车", "Pilates Topu|瑜伽球",
    "Kamp Çadırı|帐篷", "Uyku Tulumu|睡袋", "Kamp Sandalyesi|折叠椅", "Kafa Lambası|头灯", "Kamp Ocağı|卡式炉",
    "Dağcı Sırt Çantası|登山包", "Trekking Batonu|登山杖", "Olta Takımı|钓鱼竿", "Dürbün|望远镜", "Termal İçlik|保暖内衣",
    "Bisiklet Kaskı|骑行头盔", "Bisiklet Lambası|自行车灯", "Scooter|滑板车", "Kaykay|滑板", "Paten|轮滑鞋",
    "Yüzücü Gözlüğü|泳镜", "Şnorkel Seti|浮潜套装", "Futbol Topu|足球", "Basketbol Topu|篮球", "Raket|球拍",
  ]),
  G("motorcycle", "Motosiklet", "摩托车用品", [
    "Motosiklet Kaskı|摩托车头盔", "Motosiklet Eldiveni|骑行手套", "Motosiklet Montu|骑行服", "Dizlik Koruma|护膝护具", "Motosiklet Telefon Tutucu|摩托车手机支架",
    "Motosiklet Çantası|摩托车包", "Motosiklet Kilidi|摩托车锁", "Egzoz|排气管", "Gidon Elciği|车把套", "Motosiklet Aynası|摩托车后视镜",
    "Motosiklet Lambası|摩托车灯", "Zincir Seti|链条套装", "Fren Balatası|刹车片", "Motosiklet Örtüsü|摩托车罩", "Motosiklet Aküsü|摩托车电池",
    "Elektrikli Scooter|电动滑板车", "Elektrikli Bisiklet|电动自行车", "Bisiklet Lastiği|自行车轮胎", "Bisiklet Selesi|自行车座垫", "Bisiklet Pompası|打气筒",
  ]),
  G("auto", "Oto Aksesuar ve Yedek Parça", "汽车用品配件", [
    "Araç Kamerası|行车记录仪", "Araç Telefon Tutucu|车载手机支架", "Araç Süpürgesi|车载吸尘器", "Oto Koltuk Kılıfı|汽车座套", "Akü Takviye|应急启动电源",
    "Lastik Pompası|充气泵", "Güneşlik|遮阳挡", "Araç Şarj Cihazı|车充", "LED Far Ampulü|LED车灯", "Bagaj Organizeri|后备箱收纳",
    "Paspas|汽车脚垫", "Direksiyon Kılıfı|方向盘套", "Araç Kokusu|车载香薰", "Oto Yıkama Seti|洗车套装", "Cam Suyu|玻璃水",
    "Fren Diski|刹车盘", "Yağ Filtresi|机油滤清器", "Hava Filtresi|空气滤清器", "Buji|火花塞", "Silecek|雨刮器",
    "Amortisör|减震器", "Far|前大灯", "Stop Lambası|尾灯", "Tampon|保险杠", "Jant|轮毂",
    "Lastik|轮胎", "Oto Teyp|车载音响", "OBD Tarayıcı|OBD检测仪", "Park Sensörü|倒车雷达", "Geri Görüş Kamerası|倒车影像",
  ]),
  G("tools", "Hırdavat ve Yapı Market", "五金工具", [
    "Şarjlı Matkap|电钻", "Alet Seti|工具套装", "Şerit Metre|卷尺", "Lazer Hizalayıcı|激光水平仪", "Elektrikli Tornavida|电动螺丝刀",
    "Silikon Tabancası|胶枪", "Multimetre|万用表", "El Feneri|手电筒", "Anahtar Seti|扳手套装", "Merdiven|梯子",
    "Avuç Taşlama|角磨机", "Dekupaj Testere|曲线锯", "Kaynak Makinesi|电焊机", "Basınçlı Yıkama|高压清洗机", "Hava Kompresörü|空压机",
    "Kilit|门锁", "Akıllı Kilit|智能门锁", "Vida Seti|螺丝套装", "Musluk|水龙头", "Boya Rulosu|滚筒刷",
    "İş Eldiveni|劳保手套", "Güvenlik Gözlüğü|护目镜", "Alet Çantası|工具包", "Mengene|台钳", "Lehim Makinesi|电烙铁",
  ]),
  G("garden", "Bahçe ve Balkon", "园艺", [
    "Bahçe Hortumu|浇水软管", "Saksı|花盆", "Bahçe Makası|园艺剪", "Tohum|种子", "Çim Biçme Makinesi|割草机",
    "Bahçe Lambası|太阳能庭院灯", "Hamak|吊床", "Bahçe Mobilyası|户外家具", "Sulama Sistemi|滴灌系统", "Böcek Kovucu|驱蚊器",
    "Mangal|烧烤炉", "Bahçe Eldiveni|园艺手套", "Dikey Bahçe|垂直花架", "Kuş Yemliği|喂鸟器", "Havuz|充气泳池",
  ]),
  G("toys", "Oyuncak ve Hobi", "玩具爱好", [
    "Yapı Blokları|积木", "Uzaktan Kumandalı Araba|遥控车", "Peluş Oyuncak|毛绒玩具", "Puzzle|拼图", "Slime|史莱姆",
    "Uçurtma|风筝", "Kutu Oyunu|桌游", "Oyuncak Bebek|娃娃", "Su Tabancası|水枪", "Eğitici Oyuncak|益智玩具",
    "Model Araba|车模", "Figür|手办", "Kaleidoskop|万花筒", "Oyun Hamuru|彩泥", "Bilim Seti|科学实验套装",
    "Trambolin|蹦床", "Çocuk Bisikleti|儿童自行车", "Oyuncak Mutfak|过家家厨房", "Müzik Oyuncağı|音乐玩具", "Fidget Oyuncak|解压玩具",
  ]),
  G("baby", "Anne ve Bebek", "母婴", [
    "Bebek Arabası|婴儿车", "Biberon|奶瓶", "Bebek Kamerası|婴儿监护器", "Kanguru|婴儿背带", "Oyun Matı|爬行垫",
    "Sterilizatör|消毒器", "Diş Kaşıyıcı|牙胶", "Mama Sandalyesi|餐椅", "Bebek Küveti|婴儿浴盆", "Bebek Tulumu|连体衣",
    "Bebek Bezi|纸尿裤", "Islak Mendil|湿巾", "Emzik|安抚奶嘴", "Bebek Battaniyesi|婴儿毯", "Oto Koltuğu|安全座椅",
    "Bebek Beşiği|婴儿床", "Göğüs Pompası|吸奶器", "Bebek Termometresi|婴儿体温计", "Önlük|围兜", "Hamile Giyim|孕妇装",
  ]),
  G("pet", "Evcil Hayvan", "宠物用品", [
    "Kedi Su Pınarı|宠物饮水机", "Kedi Tuvaleti|猫砂盆", "Köpek Tasması|牵引绳", "Pet Yatağı|宠物窝", "Mama Kabı|喂食器",
    "Kedi Tırmalama|猫抓板", "Pet Tıraş Makinesi|宠物剃毛器", "Pet Taşıma Çantası|宠物包", "Pet Oyuncağı|宠物玩具", "LED Tasma|发光项圈",
    "Kedi Kumu|猫砂", "Köpek Maması|狗粮", "Pet Kıyafeti|宠物衣服", "Akvaryum|鱼缸", "Kuş Kafesi|鸟笼",
  ]),
  G("office", "Ofis ve Kırtasiye", "办公文具", [
    "Jel Kalem|中性笔", "Defter|笔记本", "Yükselen Masa|升降桌", "Ofis Koltuğu|办公椅", "Zımba|订书机",
    "Beyaz Tahta|白板", "Kağıt Öğütücü|碎纸机", "Dosya Klasörü|文件夹", "Yapışkan Not|便利贴", "Makas|剪刀",
    "Hesap Makinesi|计算器", "Kalemlik|笔筒", "Boya Kalemi Seti|彩铅", "Suluboya Seti|水彩", "Çizim Defteri|速写本",
  ]),
  G("industrial", "Endüstriyel ve Ambalaj", "工业包装", [
    "Koli Bandı|封箱胶带", "Kargo Kutusu|快递纸箱", "Balonlu Naylon|气泡膜", "Streç Film|缠绕膜", "Etiket Yazıcı|标签打印机",
    "Palet|托盘", "Transpalet|手动叉车", "Raf Sistemi|货架", "Kağıt Poşet|纸袋", "Kilitli Poşet|密封袋",
    "Hediye Kutusu|礼品盒", "Kurdele|丝带", "Kargo Poşeti|快递袋", "Ambalaj Terazisi|电子台秤", "Barkod Etiketi|条码标签",
  ]),
];

export interface Leaf {
  key: string;
  group: string;
  tr: string;
  zh: string;
}

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
      const [tr, zh] = s.split("|") as [string, string];
      let key = slug(tr);
      if (seen.has(key)) key = `${g.key}-${key}`;
      seen.add(key);
      return { key, group: g.key, tr, zh };
    }),
  );
  return leaves;
}

export function getLeaf(key: string): Leaf | undefined {
  return getLeaves().find((l) => l.key === key);
}
