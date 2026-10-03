import { accessoryTerms, countMatchesTr, foldTr, matchesTr, stripZhMarketing, wordsTr } from "@manufactogate/core";
import { getLeaves, type Leaf } from "./mock/taxonomy";

/**
 * Query localisation without a paid service. The category taxonomy (≈500 leaves with
 * Turkish, Chinese and English names) doubles as the glossary; generic nouns, attribute
 * words and accessory nouns are kept here, with native renderings for the markets that
 * index native text (ja, ko, ru, de, id, th). Brand and model tokens travel unchanged.
 */

export type QueryLanguage = "tr" | "zh" | "en" | "ja" | "ko" | "ru" | "de" | "id" | "th" | string;

interface Term {
  tr: string;
  zh: string;
  en: string;
  ja?: string;
  ko?: string;
  ru?: string;
  de?: string;
  id?: string;
  th?: string;
}

type Native = Partial<Record<"ja" | "ko" | "ru" | "de" | "id" | "th", string>>;
const T = (tr: string, zh: string, en: string, n: Native = {}): Term => ({ tr, zh, en, ...n });

/** Generic product nouns that are not taxonomy leaves (or are shorter forms of them). */
const EXTRA: Term[] = [
  T("kask", "头盔", "helmet", { ja: "ヘルメット", ko: "헬멧", ru: "шлем", de: "Helm", id: "helm", th: "หมวกกันน็อค" }),
  T("kulaklık", "耳机", "headphones", { ja: "イヤホン", ko: "이어폰", ru: "наушники", de: "Kopfhörer", id: "earphone", th: "หูฟัง" }),
  T("telefon", "手机", "phone", { ja: "スマートフォン", ko: "스마트폰", ru: "смартфон", de: "Smartphone", id: "hp", th: "โทรศัพท์" }),
  T("şarj", "充电器", "charger", { ja: "充電器", ko: "충전기", ru: "зарядное устройство", de: "Ladegerät", id: "charger", th: "ที่ชาร์จ" }),
  T("şarj aleti", "充电器", "charger", { ja: "充電器", ko: "충전기", ru: "зарядное устройство", de: "Ladegerät" }),
  T("kablo", "数据线", "cable", { ja: "ケーブル", ko: "케이블", ru: "кабель", de: "Kabel", id: "kabel", th: "สายเคเบิล" }),
  T("çanta", "包", "bag", { ja: "バッグ", ko: "가방", ru: "сумка", de: "Tasche", id: "tas", th: "กระเป๋า" }),
  T("ayakkabı", "鞋", "shoes", { ja: "靴", ko: "신발", ru: "обувь", de: "Schuhe", id: "sepatu", th: "รองเท้า" }),
  T("saat", "手表", "watch", { ja: "腕時計", ko: "시계", ru: "часы", de: "Uhr", id: "jam tangan", th: "นาฬิกา" }),
  T("gözlük", "眼镜", "glasses", { ja: "メガネ", ko: "안경", ru: "очки", de: "Brille", id: "kacamata", th: "แว่นตา" }),
  T("bardak", "杯子", "cup", { ja: "カップ", ko: "컵", ru: "кружка", de: "Becher", id: "gelas", th: "แก้ว" }),
  T("termos", "保温杯", "thermos", { ja: "水筒", ko: "텀블러", ru: "термос", de: "Thermosflasche", id: "termos", th: "กระติกน้ำ" }),
  T("lamba", "灯", "lamp", { ja: "ランプ", ko: "램프", ru: "лампа", de: "Lampe", id: "lampu", th: "โคมไฟ" }),
  T("oyuncak", "玩具", "toy", { ja: "おもちゃ", ko: "장난감", ru: "игрушка", de: "Spielzeug", id: "mainan", th: "ของเล่น" }),
  T("kedi", "猫", "cat", { ja: "猫", ko: "고양이", ru: "кошка", de: "Katze", id: "kucing", th: "แมว" }),
  T("köpek", "狗", "dog", { ja: "犬", ko: "강아지", ru: "собака", de: "Hund", id: "anjing", th: "สุนัข" }),
  T("bisiklet", "自行车", "bicycle", { ja: "自転車", ko: "자전거", ru: "велосипед", de: "Fahrrad", id: "sepeda", th: "จักรยาน" }),
  T("motosiklet", "摩托车", "motorcycle", { ja: "バイク", ko: "오토바이", ru: "мотоцикл", de: "Motorrad", id: "motor", th: "มอเตอร์ไซค์" }),
  T("araba", "汽车", "car", { ja: "車", ko: "자동차", ru: "автомобиль", de: "Auto", id: "mobil", th: "รถยนต์" }),
  T("oto", "汽车", "car", { ja: "車", ko: "자동차", ru: "авто", de: "Auto", id: "mobil", th: "รถยนต์" }),
  T("araç", "汽车", "car", { ja: "車", ko: "자동차", ru: "авто", de: "Auto" }),
  T("kamera", "摄像头", "camera", { ja: "カメラ", ko: "카메라", ru: "камера", de: "Kamera", id: "kamera", th: "กล้อง" }),
  T("klavye", "键盘", "keyboard", { ja: "キーボード", ko: "키보드", ru: "клавиатура", de: "Tastatur", id: "keyboard", th: "คีย์บอร์ด" }),
  T("mouse", "鼠标", "mouse", { ja: "マウス", ko: "마우스", ru: "мышь", de: "Maus", id: "mouse", th: "เมาส์" }),
  T("fare", "鼠标", "mouse", { ja: "マウス", ko: "마우스", ru: "мышь", de: "Maus" }),
  T("tişört", "T恤", "t-shirt", { ja: "Tシャツ", ko: "티셔츠", ru: "футболка", de: "T-Shirt", id: "kaos", th: "เสื้อยืด" }),
  T("mont", "外套", "jacket", { ja: "ジャケット", ko: "자켓", ru: "куртка", de: "Jacke", id: "jaket", th: "แจ็คเก็ต" }),
  T("ceket", "外套", "jacket", { ja: "ジャケット", ko: "자켓", ru: "куртка", de: "Jacke", id: "jaket" }),
  T("pantolon", "裤子", "pants", { ja: "パンツ", ko: "바지", ru: "брюки", de: "Hose", id: "celana", th: "กางเกง" }),
  T("havlu", "毛巾", "towel", { ja: "タオル", ko: "수건", ru: "полотенце", de: "Handtuch", id: "handuk", th: "ผ้าขนหนู" }),
  T("bıçak", "刀", "knife", { ja: "ナイフ", ko: "칼", ru: "нож", de: "Messer", id: "pisau", th: "มีด" }),
  T("tava", "锅", "pan", { ja: "フライパン", ko: "프라이팬", ru: "сковорода", de: "Pfanne", id: "wajan", th: "กระทะ" }),
  T("tencere", "锅", "pot", { ja: "鍋", ko: "냄비", ru: "кастрюля", de: "Topf", id: "panci", th: "หม้อ" }),
  T("matkap", "电钻", "drill", { ja: "ドリル", ko: "드릴", ru: "дрель", de: "Bohrmaschine", id: "bor", th: "สว่าน" }),
  T("tornavida", "螺丝刀", "screwdriver", { ja: "ドライバー", ko: "드라이버", ru: "отвертка", de: "Schraubendreher", id: "obeng", th: "ไขควง" }),
  T("fener", "手电筒", "flashlight", { ja: "懐中電灯", ko: "손전등", ru: "фонарь", de: "Taschenlampe", id: "senter", th: "ไฟฉาย" }),
  T("powerbank", "移动电源", "power bank", { ja: "モバイルバッテリー", ko: "보조배터리", ru: "повербанк", de: "Powerbank", id: "power bank", th: "พาวเวอร์แบงค์" }),
  T("valiz", "行李箱", "suitcase", { ja: "スーツケース", ko: "캐리어", ru: "чемодан", de: "Koffer", id: "koper", th: "กระเป๋าเดินทาง" }),
  T("cüzdan", "钱包", "wallet", { ja: "財布", ko: "지갑", ru: "кошелек", de: "Geldbörse", id: "dompet", th: "กระเป๋าสตางค์" }),
  T("kemer", "皮带", "belt", { ja: "ベルト", ko: "벨트", ru: "ремень", de: "Gürtel", id: "ikat pinggang", th: "เข็มขัด" }),
  T("parfüm", "香水", "perfume", { ja: "香水", ko: "향수", ru: "духи", de: "Parfum", id: "parfum", th: "น้ำหอม" }),
  T("maske", "面膜", "face mask", { ja: "マスク", ko: "마스크", ru: "маска", de: "Maske", id: "masker", th: "หน้ากาก" }),
  T("süpürge", "吸尘器", "vacuum cleaner", { ja: "掃除機", ko: "청소기", ru: "пылесос", de: "Staubsauger", id: "vacuum cleaner", th: "เครื่องดูดฝุ่น" }),
  T("ütü", "熨斗", "iron", { ja: "アイロン", ko: "다리미", ru: "утюг", de: "Bügeleisen", id: "setrika", th: "เตารีด" }),
  T("projeksiyon", "投影仪", "projector", { ja: "プロジェクター", ko: "프로젝터", ru: "проектор", de: "Beamer", id: "proyektor", th: "โปรเจคเตอร์" }),
  T("hava fritözü", "空气炸锅", "air fryer", { ja: "エアフライヤー", ko: "에어프라이어", ru: "аэрогриль", de: "Heißluftfritteuse", id: "air fryer", th: "หม้อทอดไร้น้ำมัน" }),
  T("fritöz", "炸锅", "fryer", { ja: "フライヤー", ko: "튀김기", ru: "фритюрница", de: "Fritteuse" }),
  T("su ısıtıcı", "电热水壶", "kettle", { ja: "電気ケトル", ko: "전기포트", ru: "чайник", de: "Wasserkocher", id: "teko listrik", th: "กาต้มน้ำ" }),
  T("kettle", "电热水壶", "kettle", { ja: "電気ケトル", ko: "전기포트", ru: "чайник", de: "Wasserkocher" }),
  T("kahve", "咖啡", "coffee", { ja: "コーヒー", ko: "커피", ru: "кофе", de: "Kaffee", id: "kopi", th: "กาแฟ" }),
  T("masaj", "按摩器", "massager", { ja: "マッサージ器", ko: "마사지기", ru: "массажер", de: "Massagegerät", id: "alat pijat", th: "เครื่องนวด" }),
  T("tıraş", "剃须刀", "shaver", { ja: "シェーバー", ko: "면도기", ru: "бритва", de: "Rasierer", id: "alat cukur", th: "เครื่องโกนหนวด" }),
  T("saç kurutma", "吹风机", "hair dryer", { ja: "ドライヤー", ko: "헤어드라이어", ru: "фен", de: "Haartrockner", id: "hair dryer", th: "ไดร์เป่าผม" }),
  T("diş fırçası", "牙刷", "toothbrush", { ja: "歯ブラシ", ko: "칫솔", ru: "зубная щетка", de: "Zahnbürste", id: "sikat gigi", th: "แปรงสีฟัน" }),
  T("kırtasiye", "文具", "stationery", { ja: "文房具", ko: "문구", ru: "канцелярия", de: "Schreibwaren", id: "alat tulis", th: "เครื่องเขียน" }),
  T("akü", "电瓶", "car battery", { ja: "バッテリー", ko: "배터리", ru: "аккумулятор", de: "Autobatterie", id: "aki", th: "แบตเตอรี่รถยนต์" }),
  T("oto şarj", "车充", "car charger", { ja: "カーチャージャー", ko: "차량용 충전기", ru: "автомобильное зарядное", de: "Kfz-Ladegerät" }),
  T("güneş paneli", "太阳能板", "solar panel", { ja: "ソーラーパネル", ko: "태양광 패널", ru: "солнечная панель", de: "Solarpanel", id: "panel surya", th: "แผงโซล่าเซลล์" }),
  T("balık", "鱼", "fish", { ja: "魚", ko: "물고기", ru: "рыба", de: "Fisch" }),
  T("bitki", "植物", "plant", { ja: "植物", ko: "식물", ru: "растение", de: "Pflanze", id: "tanaman", th: "ต้นไม้" }),
  T("bahçe", "园艺", "garden", { ja: "ガーデン", ko: "정원", ru: "сад", de: "Garten", id: "taman", th: "สวน" }),
  T("hortum", "软管", "hose", { ja: "ホース", ko: "호스", ru: "шланг", de: "Schlauch", id: "selang", th: "สายยาง" }),
  T("kamp", "露营", "camping", { ja: "キャンプ", ko: "캠핑", ru: "кемпинг", de: "Camping", id: "camping", th: "แคมป์ปิ้ง" }),
  T("çadır", "帐篷", "tent", { ja: "テント", ko: "텐트", ru: "палатка", de: "Zelt", id: "tenda", th: "เต็นท์" }),
  T("olta", "钓鱼竿", "fishing rod", { ja: "釣り竿", ko: "낚싯대", ru: "удочка", de: "Angelrute", id: "joran", th: "คันเบ็ด" }),
  T("takı", "首饰", "jewelry", { ja: "アクセサリー", ko: "주얼리", ru: "украшения", de: "Schmuck", id: "perhiasan", th: "เครื่องประดับ" }),
  T("bilezik", "手镯", "bracelet", { ja: "ブレスレット", ko: "팔찌", ru: "браслет", de: "Armband", id: "gelang", th: "กำไล" }),
  T("peruk", "假发", "wig", { ja: "ウィッグ", ko: "가발", ru: "парик", de: "Perücke", id: "wig", th: "วิกผม" }),
  T("sırt çantası", "双肩包", "backpack", { ja: "リュック", ko: "백팩", ru: "рюкзак", de: "Rucksack", id: "ransel", th: "กระเป๋าเป้" }),
  T("spor çantası", "健身包", "gym bag", { ja: "スポーツバッグ", ko: "스포츠백", ru: "спортивная сумка", de: "Sporttasche" }),
  T("dizüstü", "笔记本电脑", "laptop", { ja: "ノートパソコン", ko: "노트북", ru: "ноутбук", de: "Laptop", id: "laptop", th: "โน้ตบุ๊ค" }),
  T("bilgisayar", "电脑", "computer", { ja: "パソコン", ko: "컴퓨터", ru: "компьютер", de: "Computer", id: "komputer", th: "คอมพิวเตอร์" }),
  T("ekran", "屏幕", "screen", { ja: "スクリーン", ko: "화면", ru: "экран", de: "Bildschirm" }),
  T("yatak örtüsü", "床罩", "bedspread", { ja: "ベッドカバー", ko: "침대커버", ru: "покрывало", de: "Tagesdecke" }),
  T("mama", "粮", "food", { ja: "フード", ko: "사료", ru: "корм", de: "Futter", id: "makanan", th: "อาหาร" }),
  T("kum", "砂", "litter", { ja: "砂", ko: "모래", ru: "наполнитель", de: "Streu", id: "pasir", th: "ทราย" }),
  T("sandalye", "椅子", "chair", { ja: "椅子", ko: "의자", ru: "стул", de: "Stuhl", id: "kursi", th: "เก้าอี้" }),
  T("masa", "桌子", "table", { ja: "テーブル", ko: "테이블", ru: "стол", de: "Tisch", id: "meja", th: "โต๊ะ" }),
  T("raf", "置物架", "shelf", { ja: "ラック", ko: "선반", ru: "полка", de: "Regal", id: "rak", th: "ชั้นวาง" }),
  T("ayna", "镜子", "mirror", { ja: "ミラー", ko: "거울", ru: "зеркало", de: "Spiegel", id: "cermin", th: "กระจก" }),
  T("saksı", "花盆", "flower pot", { ja: "植木鉢", ko: "화분", ru: "горшок", de: "Blumentopf", id: "pot bunga", th: "กระถาง" }),
  T("şemsiye", "雨伞", "umbrella", { ja: "傘", ko: "우산", ru: "зонт", de: "Regenschirm", id: "payung", th: "ร่ม" }),
  T("eşofman", "运动套装", "tracksuit", { ja: "ジャージ", ko: "트레이닝복", ru: "спортивный костюм", de: "Trainingsanzug" }),
  T("sweatshirt", "卫衣", "sweatshirt", { ja: "スウェット", ko: "맨투맨", ru: "свитшот", de: "Sweatshirt" }),
  T("hoodie", "连帽卫衣", "hoodie", { ja: "パーカー", ko: "후드티", ru: "худи", de: "Hoodie" }),
  T("jean", "牛仔裤", "jeans", { ja: "ジーンズ", ko: "청바지", ru: "джинсы", de: "Jeans", id: "jeans", th: "ยีนส์" }),
  T("gömlek", "衬衫", "shirt", { ja: "シャツ", ko: "셔츠", ru: "рубашка", de: "Hemd", id: "kemeja", th: "เสื้อเชิ้ต" }),
  T("elbise", "连衣裙", "dress", { ja: "ワンピース", ko: "원피스", ru: "платье", de: "Kleid", id: "dress", th: "เดรส" }),
  T("tişört", "T恤", "t-shirt", { ja: "Tシャツ", ko: "티셔츠", ru: "футболка", de: "T-Shirt" }),
  T("bebek", "婴儿", "baby", { ja: "ベビー", ko: "아기", ru: "детский", de: "Baby", id: "bayi", th: "เด็กอ่อน" }),
  T("ampul", "灯泡", "light bulb", { ja: "電球", ko: "전구", ru: "лампочка", de: "Glühbirne", id: "bohlam", th: "หลอดไฟ" }),
  T("pil", "电池", "battery", { ja: "電池", ko: "건전지", ru: "батарейка", de: "Batterie", id: "baterai", th: "ถ่าน" }),
  T("batarya", "电池", "battery", { ja: "バッテリー", ko: "배터리", ru: "аккумулятор", de: "Akku" }),
  T("priz", "插座", "socket", { ja: "コンセント", ko: "콘센트", ru: "розетка", de: "Steckdose", id: "stop kontak", th: "ปลั๊กไฟ" }),
  T("uzatma kablosu", "插线板", "extension cord", { ja: "延長コード", ko: "멀티탭", ru: "удлинитель", de: "Verlängerungskabel" }),
  T("hoparlör", "音箱", "speaker", { ja: "スピーカー", ko: "스피커", ru: "колонка", de: "Lautsprecher", id: "speaker", th: "ลำโพง" }),
  T("mikrofon", "麦克风", "microphone", { ja: "マイク", ko: "마이크", ru: "микрофон", de: "Mikrofon", id: "mikrofon", th: "ไมโครโฟน" }),
  T("yorgan", "被子", "duvet", { ja: "掛け布団", ko: "이불", ru: "одеяло", de: "Bettdecke" }),
  T("halı", "地毯", "rug", { ja: "ラグ", ko: "러그", ru: "ковер", de: "Teppich", id: "karpet", th: "พรม" }),
  T("perde", "窗帘", "curtain", { ja: "カーテン", ko: "커튼", ru: "шторы", de: "Vorhang", id: "gorden", th: "ผ้าม่าน" }),
  T("yastık", "枕头", "pillow", { ja: "枕", ko: "베개", ru: "подушка", de: "Kissen", id: "bantal", th: "หมอน" }),
  T("battaniye", "毛毯", "blanket", { ja: "毛布", ko: "담요", ru: "плед", de: "Decke", id: "selimut", th: "ผ้าห่ม" }),
  T("çorap", "袜子", "socks", { ja: "靴下", ko: "양말", ru: "носки", de: "Socken", id: "kaos kaki", th: "ถุงเท้า" }),
  T("şapka", "帽子", "hat", { ja: "帽子", ko: "모자", ru: "шапка", de: "Mütze", id: "topi", th: "หมวก" }),
  T("eldiven", "手套", "gloves", { ja: "手袋", ko: "장갑", ru: "перчатки", de: "Handschuhe", id: "sarung tangan", th: "ถุงมือ" }),
  T("drone", "无人机", "drone", { ja: "ドローン", ko: "드론", ru: "дрон", de: "Drohne", id: "drone", th: "โดรน" }),
  T("scooter", "滑板车", "scooter", { ja: "スクーター", ko: "스쿠터", ru: "самокат", de: "Roller", id: "skuter", th: "สกู๊ตเตอร์" }),
  T("e-scooter", "电动滑板车", "electric scooter", { ja: "電動キックボード", ko: "전동킥보드", ru: "электросамокат", de: "E-Scooter" }),
  T("dambıl", "哑铃", "dumbbell", { ja: "ダンベル", ko: "덤벨", ru: "гантели", de: "Hantel", id: "dumbbell", th: "ดัมเบล" }),
  T("yoga matı", "瑜伽垫", "yoga mat", { ja: "ヨガマット", ko: "요가매트", ru: "коврик для йоги", de: "Yogamatte", id: "matras yoga", th: "เสื่อโยคะ" }),
  T("blender", "榨汁机", "blender", { ja: "ブレンダー", ko: "블렌더", ru: "блендер", de: "Mixer", id: "blender", th: "เครื่องปั่น" }),
  T("mikser", "打蛋器", "mixer", { ja: "ハンドミキサー", ko: "핸드믹서", ru: "миксер", de: "Handmixer" }),
  T("airfryer", "空气炸锅", "air fryer", { ja: "エアフライヤー", ko: "에어프라이어", ru: "аэрогриль", de: "Heißluftfritteuse", id: "air fryer", th: "หม้อทอดไร้น้ำมัน" }),
  T("kahve makinesi", "咖啡机", "coffee maker", { ja: "コーヒーメーカー", ko: "커피머신", ru: "кофемашина", de: "Kaffeemaschine", id: "mesin kopi", th: "เครื่องชงกาแฟ" }),
  T("robot süpürge", "扫地机器人", "robot vacuum", { ja: "ロボット掃除機", ko: "로봇청소기", ru: "робот-пылесос", de: "Saugroboter", id: "robot vacuum", th: "หุ่นยนต์ดูดฝุ่น" }),
  T("dikiş makinesi", "缝纫机", "sewing machine", { ja: "ミシン", ko: "재봉틀", ru: "швейная машина", de: "Nähmaschine", id: "mesin jahit", th: "จักรเย็บผ้า" }),
  T("saç düzleştirici", "直发器", "hair straightener", { ja: "ヘアアイロン", ko: "고데기", ru: "выпрямитель", de: "Glätteisen", id: "catokan", th: "เครื่องหนีบผม" }),
  T("tansiyon aleti", "血压计", "blood pressure monitor", { ja: "血圧計", ko: "혈압계", ru: "тонометр", de: "Blutdruckmessgerät", id: "tensimeter", th: "เครื่องวัดความดัน" }),
  T("ateş ölçer", "体温计", "thermometer", { ja: "体温計", ko: "체온계", ru: "термометр", de: "Fieberthermometer", id: "termometer", th: "เทอร์โมมิเตอร์" }),
  T("bebek arabası", "婴儿车", "stroller", { ja: "ベビーカー", ko: "유모차", ru: "коляска", de: "Kinderwagen", id: "stroller", th: "รถเข็นเด็ก" }),
  T("oto koltuğu", "安全座椅", "car seat", { ja: "チャイルドシート", ko: "카시트", ru: "автокресло", de: "Kindersitz", id: "car seat", th: "คาร์ซีท" }),
  T("kalem", "笔", "pen", { ja: "ペン", ko: "펜", ru: "ручка", de: "Stift", id: "pulpen", th: "ปากกา" }),
  T("defter", "笔记本", "notebook", { ja: "ノート", ko: "노트", ru: "блокнот", de: "Notizbuch", id: "buku catatan", th: "สมุด" }),
  T("silecek", "雨刮器", "wiper blade", { ja: "ワイパー", ko: "와이퍼", ru: "дворники", de: "Scheibenwischer" }),
  T("jant", "轮毂", "wheel rim", { ja: "ホイール", ko: "휠", ru: "диски", de: "Felge", id: "velg", th: "ล้อแม็ก" }),
  T("lastik", "轮胎", "tire", { ja: "タイヤ", ko: "타이어", ru: "шина", de: "Reifen", id: "ban", th: "ยางรถ" }),
  T("telefon tutucu", "手机支架", "phone holder", { ja: "スマホスタンド", ko: "휴대폰 거치대", ru: "держатель для телефона", de: "Handyhalterung", id: "holder hp", th: "ที่วางโทรศัพท์" }),
  T("akıllı priz", "智能插座", "smart plug", { ja: "スマートプラグ", ko: "스마트 플러그", ru: "умная розетка", de: "Smart Steckdose" }),
  T("akıllı ampul", "智能灯泡", "smart bulb", { ja: "スマート電球", ko: "스마트 전구", ru: "умная лампа", de: "Smart Glühbirne" }),
  T("akvaryum", "鱼缸", "aquarium", { ja: "水槽", ko: "어항", ru: "аквариум", de: "Aquarium", id: "akuarium", th: "ตู้ปลา" }),
  T("uyku tulumu", "睡袋", "sleeping bag", { ja: "寝袋", ko: "침낭", ru: "спальный мешок", de: "Schlafsack", id: "sleeping bag", th: "ถุงนอน" }),
  T("sele", "车座", "saddle", { ja: "サドル", ko: "안장", ru: "седло", de: "Sattel" }),
  T("kolye", "项链", "necklace", { ja: "ネックレス", ko: "목걸이", ru: "ожерелье", de: "Halskette", id: "kalung", th: "สร้อยคอ" }),
  T("yüzük", "戒指", "ring", { ja: "リング", ko: "반지", ru: "кольцо", de: "Ring", id: "cincin", th: "แหวน" }),
  T("küpe", "耳环", "earrings", { ja: "ピアス", ko: "귀걸이", ru: "серьги", de: "Ohrringe", id: "anting", th: "ต่างหู" }),
  T("saç tokası", "发夹", "hair clip", { ja: "ヘアクリップ", ko: "헤어핀", ru: "заколка", de: "Haarspange" }),
  T("monitör", "显示器", "monitor", { ja: "モニター", ko: "모니터", ru: "монитор", de: "Monitor", id: "monitor", th: "จอมอนิเตอร์" }),
  T("laptop", "笔记本电脑", "laptop", { ja: "ノートパソコン", ko: "노트북", ru: "ноутбук", de: "Laptop", id: "laptop", th: "โน้ตบุ๊ค" }),
  T("tablet", "平板电脑", "tablet", { ja: "タブレット", ko: "태블릿", ru: "планшет", de: "Tablet", id: "tablet", th: "แท็บเล็ต" }),
  T("televizyon", "电视", "tv", { ja: "テレビ", ko: "TV", ru: "телевизор", de: "Fernseher", id: "tv", th: "ทีวี" }),
  T("buzdolabı", "冰箱", "refrigerator", { ja: "冷蔵庫", ko: "냉장고", ru: "холодильник", de: "Kühlschrank", id: "kulkas", th: "ตู้เย็น" }),
  T("çamaşır makinesi", "洗衣机", "washing machine", { ja: "洗濯機", ko: "세탁기", ru: "стиральная машина", de: "Waschmaschine", id: "mesin cuci", th: "เครื่องซักผ้า" }),
  T("mikrodalga", "微波炉", "microwave", { ja: "電子レンジ", ko: "전자레인지", ru: "микроволновка", de: "Mikrowelle", id: "microwave", th: "ไมโครเวฟ" }),
  T("klima", "空调", "air conditioner", { ja: "エアコン", ko: "에어컨", ru: "кондиционер", de: "Klimaanlage", id: "ac", th: "แอร์" }),
  T("vantilatör", "风扇", "fan", { ja: "扇風機", ko: "선풍기", ru: "вентилятор", de: "Ventilator", id: "kipas angin", th: "พัดลม" }),
  T("ısıtıcı", "取暖器", "heater", { ja: "ヒーター", ko: "히터", ru: "обогреватель", de: "Heizung", id: "pemanas", th: "ฮีตเตอร์" }),
  T("gitar", "吉他", "guitar", { ja: "ギター", ko: "기타", ru: "гитара", de: "Gitarre", id: "gitar", th: "กีตาร์" }),
  T("piyano", "电子琴", "keyboard piano", { ja: "電子ピアノ", ko: "디지털 피아노", ru: "цифровое пианино", de: "E-Piano" }),
  T("ukulele", "尤克里里", "ukulele", { ja: "ウクレレ", ko: "우쿨렐레", ru: "укулеле", de: "Ukulele" }),
  T("keman", "小提琴", "violin", { ja: "バイオリン", ko: "바이올린", ru: "скрипка", de: "Geige" }),
  T("alarm", "报警器", "alarm", { ja: "警報器", ko: "경보기", ru: "сигнализация", de: "Alarmanlage", id: "alarm", th: "สัญญาณกันขโมย" }),
  T("güvenlik kamerası", "监控摄像头", "security camera", { ja: "防犯カメラ", ko: "CCTV", ru: "камера видеонаблюдения", de: "Überwachungskamera", id: "cctv", th: "กล้องวงจรปิด" }),
  T("kapı zili", "门铃", "video doorbell", { ja: "ドアベル", ko: "초인종", ru: "дверной звонок", de: "Türklingel" }),
  T("kasa", "保险箱", "safe box", { ja: "金庫", ko: "금고", ru: "сейф", de: "Tresor" }),
  T("duman dedektörü", "烟雾报警器", "smoke detector", { ja: "煙感知器", ko: "연기감지기", ru: "датчик дыма", de: "Rauchmelder" }),
  T("balon", "气球", "balloons", { ja: "バルーン", ko: "풍선", ru: "воздушные шары", de: "Luftballons", id: "balon", th: "ลูกโป่ง" }),
  T("kostüm", "cosplay服装", "costume", { ja: "コスプレ衣装", ko: "코스튬", ru: "костюм", de: "Kostüm", id: "kostum", th: "ชุดคอสเพลย์" }),
  T("hediye", "礼品", "gift", { ja: "ギフト", ko: "선물", ru: "подарок", de: "Geschenk", id: "hadiah", th: "ของขวัญ" }),
  T("süs", "装饰", "decoration", { ja: "飾り", ko: "장식", ru: "декор", de: "Dekoration", id: "dekorasi", th: "ของตกแต่ง" }),
  T("çarşaf", "床单", "bed sheet", { ja: "シーツ", ko: "침대시트", ru: "простыня", de: "Bettlaken", id: "sprei", th: "ผ้าปูที่นอน" }),
  T("bornoz", "浴袍", "bathrobe", { ja: "バスローブ", ko: "목욕가운", ru: "халат", de: "Bademantel" }),
  T("sehpa", "茶几", "coffee table", { ja: "ローテーブル", ko: "소파테이블", ru: "журнальный столик", de: "Couchtisch" }),
  T("kitaplık", "书架", "bookshelf", { ja: "本棚", ko: "책장", ru: "книжный шкаф", de: "Bücherregal", id: "rak buku", th: "ชั้นหนังสือ" }),
  T("gardırop", "衣柜", "wardrobe", { ja: "ワードローブ", ko: "옷장", ru: "шкаф", de: "Kleiderschrank", id: "lemari", th: "ตู้เสื้อผ้า" }),
  T("koltuk", "沙发", "sofa", { ja: "ソファ", ko: "소파", ru: "диван", de: "Sofa", id: "sofa", th: "โซฟา" }),
  T("yorgan", "被子", "duvet", { ja: "掛け布団", ko: "이불", ru: "одеяло", de: "Bettdecke" }),
  T("kılıf", "保护壳", "case", { ja: "ケース", ko: "케이스", ru: "чехол", de: "Hülle", id: "case", th: "เคส" }),
  T("kulaklık kutusu", "耳机壳", "earbuds case", { ja: "イヤホンケース", ko: "이어폰 케이스", ru: "чехол для наушников", de: "Kopfhörer Hülle" }),
];

/** Accessory nouns: appended to every ladder rung when the source title names one (a phone-case title must not search for the phone). */
const ACCESSORY_NOUNS: Term[] = [
  T("kılıf", "保护壳", "case", { ja: "ケース", ko: "케이스", ru: "чехол", de: "Hülle", id: "case", th: "เคส" }),
  T("ekran koruyucu", "钢化膜", "screen protector", { ja: "保護フィルム", ko: "보호필름", ru: "защитное стекло", de: "Schutzfolie", id: "tempered glass", th: "ฟิล์มกันรอย" }),
  T("kordon", "表带", "strap", { ja: "バンド", ko: "스트랩", ru: "ремешок", de: "Armband", id: "strap", th: "สาย" }),
  T("şarj kablosu", "数据线", "charging cable", { ja: "充電ケーブル", ko: "충전 케이블", ru: "кабель зарядки", de: "Ladekabel", id: "kabel charger", th: "สายชาร์จ" }),
  T("vizör", "镜片", "visor", { ja: "シールド", ko: "쉴드", ru: "визор", de: "Visier", id: "visor", th: "ชิลด์" }),
  T("yedek parça", "配件", "spare part", { ja: "交換パーツ", ko: "교체 부품", ru: "запчасть", de: "Ersatzteil", id: "suku cadang", th: "อะไหล่" }),
  T("filtre", "滤芯", "filter", { ja: "フィルター", ko: "필터", ru: "фильтр", de: "Filter", id: "filter", th: "ไส้กรอง" }),
  T("tutucu", "支架", "holder", { ja: "ホルダー", ko: "거치대", ru: "держатель", de: "Halterung", id: "holder", th: "ที่ยึด" }),
  T("sticker", "贴纸", "sticker", { ja: "ステッカー", ko: "스티커", ru: "наклейка", de: "Aufkleber", id: "stiker", th: "สติกเกอร์" }),
  T("şarj kutusu", "充电盒", "charging case", { ja: "充電ケース", ko: "충전 케이스", ru: "зарядный кейс", de: "Ladecase" }),
  T("aparat", "配件", "attachment", { ja: "アタッチメント", ko: "부속품", ru: "насадка", de: "Aufsatz" }),
  T("aksesuar", "配件", "accessory", { ja: "アクセサリー", ko: "액세서리", ru: "аксессуар", de: "Zubehör", id: "aksesoris", th: "อุปกรณ์เสริม" }),
  T("taşıma çantası", "收纳包", "carrying case", { ja: "収納ケース", ko: "수납 케이스", ru: "сумка для переноски", de: "Tragetasche" }),
  T("koruma çantası", "收纳包", "protective bag", { ja: "収納ケース", ko: "보호 케이스", ru: "защитный чехол", de: "Schutztasche" }),
  T("spoiler", "尾翼", "spoiler", { ja: "スポイラー", ko: "스포일러", ru: "спойлер", de: "Spoiler" }),
  T("lens", "镜片", "lens", { ja: "レンズ", ko: "렌즈", ru: "линза", de: "Linse" }),
  T("kablosu", "数据线", "cable", { ja: "ケーブル", ko: "케이블", ru: "кабель", de: "Kabel" }),
];

/** Attribute words (gender, colour, material, feature) kept in translated queries, in query order. */
const ATTR: Term[] = [
  T("erkek", "男", "men's", { ja: "メンズ", ko: "남성", ru: "мужской", de: "Herren", id: "pria", th: "ผู้ชาย" }),
  T("kadın", "女", "women's", { ja: "レディース", ko: "여성", ru: "женский", de: "Damen", id: "wanita", th: "ผู้หญิง" }),
  T("bayan", "女", "women's", { ja: "レディース", ko: "여성", ru: "женский", de: "Damen", id: "wanita", th: "ผู้หญิง" }),
  T("çocuk", "儿童", "kids", { ja: "キッズ", ko: "아동", ru: "детский", de: "Kinder", id: "anak", th: "เด็ก" }),
  T("bebek", "婴儿", "baby", { ja: "ベビー", ko: "아기", ru: "детский", de: "Baby", id: "bayi", th: "เด็กอ่อน" }),
  T("unisex", "男女", "unisex", { ja: "ユニセックス", ko: "남녀공용", ru: "унисекс", de: "Unisex", id: "unisex", th: "ยูนิเซ็กซ์" }),
  T("siyah", "黑色", "black", { ja: "ブラック", ko: "블랙", ru: "черный", de: "schwarz", id: "hitam", th: "สีดำ" }),
  T("beyaz", "白色", "white", { ja: "ホワイト", ko: "화이트", ru: "белый", de: "weiß", id: "putih", th: "สีขาว" }),
  T("kırmızı", "红色", "red", { ja: "レッド", ko: "레드", ru: "красный", de: "rot", id: "merah", th: "สีแดง" }),
  T("mavi", "蓝色", "blue", { ja: "ブルー", ko: "블루", ru: "синий", de: "blau", id: "biru", th: "สีน้ำเงิน" }),
  T("yeşil", "绿色", "green", { ja: "グリーン", ko: "그린", ru: "зеленый", de: "grün", id: "hijau", th: "สีเขียว" }),
  T("gri", "灰色", "grey", { ja: "グレー", ko: "그레이", ru: "серый", de: "grau", id: "abu-abu", th: "สีเทา" }),
  T("pembe", "粉色", "pink", { ja: "ピンク", ko: "핑크", ru: "розовый", de: "rosa", id: "pink", th: "สีชมพู" }),
  T("sarı", "黄色", "yellow", { ja: "イエロー", ko: "옐로우", ru: "желтый", de: "gelb", id: "kuning", th: "สีเหลือง" }),
  T("mor", "紫色", "purple", { ja: "パープル", ko: "퍼플", ru: "фиолетовый", de: "lila", id: "ungu", th: "สีม่วง" }),
  T("turuncu", "橙色", "orange", { ja: "オレンジ", ko: "오렌지", ru: "оранжевый", de: "orange", id: "oranye", th: "สีส้ม" }),
  T("kahverengi", "棕色", "brown", { ja: "ブラウン", ko: "브라운", ru: "коричневый", de: "braun", id: "coklat", th: "สีน้ำตาล" }),
  T("lacivert", "藏青色", "navy", { ja: "ネイビー", ko: "네이비", ru: "темно-синий", de: "navy", id: "navy", th: "สีกรมท่า" }),
  T("altın", "金色", "gold", { ja: "ゴールド", ko: "골드", ru: "золотой", de: "gold", id: "emas", th: "สีทอง" }),
  T("gümüş", "银色", "silver", { ja: "シルバー", ko: "실버", ru: "серебряный", de: "silber", id: "perak", th: "สีเงิน" }),
  T("şeffaf", "透明", "clear", { ja: "クリア", ko: "투명", ru: "прозрачный", de: "transparent", id: "transparan", th: "ใส" }),
  T("kablosuz", "无线", "wireless", { ja: "ワイヤレス", ko: "무선", ru: "беспроводной", de: "kabellos", id: "wireless", th: "ไร้สาย" }),
  T("bluetooth", "蓝牙", "bluetooth", { ja: "Bluetooth", ko: "블루투스", ru: "bluetooth", de: "Bluetooth", id: "bluetooth", th: "บลูทูธ" }),
  T("paslanmaz çelik", "不锈钢", "stainless steel", { ja: "ステンレス", ko: "스테인리스", ru: "нержавеющая сталь", de: "Edelstahl", id: "stainless steel", th: "สแตนเลส" }),
  T("paslanmaz", "不锈钢", "stainless", { ja: "ステンレス", ko: "스테인리스", ru: "нержавеющий", de: "Edelstahl", id: "stainless", th: "สแตนเลส" }),
  T("çelik", "钢", "steel", { ja: "スチール", ko: "스틸", ru: "сталь", de: "Stahl", id: "baja", th: "เหล็ก" }),
  T("silikon", "硅胶", "silicone", { ja: "シリコン", ko: "실리콘", ru: "силиконовый", de: "Silikon", id: "silikon", th: "ซิลิโคน" }),
  T("deri", "皮革", "leather", { ja: "レザー", ko: "가죽", ru: "кожаный", de: "Leder", id: "kulit", th: "หนัง" }),
  T("pamuk", "纯棉", "cotton", { ja: "コットン", ko: "면", ru: "хлопок", de: "Baumwolle", id: "katun", th: "ผ้าฝ้าย" }),
  T("pamuklu", "纯棉", "cotton", { ja: "コットン", ko: "면", ru: "хлопковый", de: "Baumwolle", id: "katun", th: "ผ้าฝ้าย" }),
  T("ahşap", "木质", "wooden", { ja: "木製", ko: "원목", ru: "деревянный", de: "Holz", id: "kayu", th: "ไม้" }),
  T("cam", "玻璃", "glass", { ja: "ガラス", ko: "유리", ru: "стеклянный", de: "Glas", id: "kaca", th: "แก้ว" }),
  T("metal", "金属", "metal", { ja: "メタル", ko: "메탈", ru: "металлический", de: "Metall", id: "logam", th: "โลหะ" }),
  T("plastik", "塑料", "plastic", { ja: "プラスチック", ko: "플라스틱", ru: "пластиковый", de: "Kunststoff", id: "plastik", th: "พลาสติก" }),
  T("su geçirmez", "防水", "waterproof", { ja: "防水", ko: "방수", ru: "водонепроницаемый", de: "wasserdicht", id: "anti air", th: "กันน้ำ" }),
  T("taşınabilir", "便携", "portable", { ja: "ポータブル", ko: "휴대용", ru: "портативный", de: "tragbar", id: "portable", th: "พกพา" }),
  T("katlanır", "折叠", "folding", { ja: "折りたたみ", ko: "접이식", ru: "складной", de: "faltbar", id: "lipat", th: "พับได้" }),
  T("katlanabilir", "折叠", "foldable", { ja: "折りたたみ", ko: "접이식", ru: "складной", de: "faltbar", id: "lipat", th: "พับได้" }),
  T("mini", "迷你", "mini", { ja: "ミニ", ko: "미니", ru: "мини", de: "Mini", id: "mini", th: "มินิ" }),
  T("şarjlı", "充电式", "rechargeable", { ja: "充電式", ko: "충전식", ru: "аккумуляторный", de: "Akku", id: "rechargeable", th: "ชาร์จได้" }),
  T("elektrikli", "电动", "electric", { ja: "電動", ko: "전동", ru: "электрический", de: "elektrisch", id: "elektrik", th: "ไฟฟ้า" }),
  T("akıllı", "智能", "smart", { ja: "スマート", ko: "스마트", ru: "умный", de: "smart", id: "smart", th: "อัจฉริยะ" }),
  T("polarize", "偏光", "polarized", { ja: "偏光", ko: "편광", ru: "поляризационный", de: "polarisiert", id: "polarized", th: "โพลาไรซ์" }),
  T("yazlık", "夏季", "summer", { ja: "夏用", ko: "여름", ru: "летний", de: "Sommer", id: "musim panas", th: "ฤดูร้อน" }),
  T("kışlık", "冬季", "winter", { ja: "冬用", ko: "겨울", ru: "зимний", de: "Winter", id: "musim dingin", th: "ฤดูหนาว" }),
  T("büyük beden", "大码", "plus size", { ja: "大きいサイズ", ko: "빅사이즈", ru: "большой размер", de: "große Größen", id: "ukuran besar", th: "ไซส์ใหญ่" }),
  T("büyük", "大", "large", { ja: "大型", ko: "대형", ru: "большой", de: "groß", id: "besar", th: "ใหญ่" }),
  T("küçük", "小", "small", { ja: "小型", ko: "소형", ru: "маленький", de: "klein", id: "kecil", th: "เล็ก" }),
  T("set", "套装", "set", { ja: "セット", ko: "세트", ru: "набор", de: "Set", id: "set", th: "ชุด" }),
  T("seti", "套装", "set", { ja: "セット", ko: "세트", ru: "набор", de: "Set", id: "set", th: "ชุด" }),
  T("takımı", "套装", "set", { ja: "セット", ko: "세트", ru: "набор", de: "Set", id: "set", th: "ชุด" }),
  T("otomatik", "自动", "automatic", { ja: "自動", ko: "자동", ru: "автоматический", de: "automatisch", id: "otomatis", th: "อัตโนมัติ" }),
  T("dijital", "数字", "digital", { ja: "デジタル", ko: "디지털", ru: "цифровой", de: "digital", id: "digital", th: "ดิจิตอล" }),
  T("manyetik", "磁吸", "magnetic", { ja: "マグネット", ko: "마그네틱", ru: "магнитный", de: "magnetisch", id: "magnetik", th: "แม่เหล็ก" }),
  T("hızlı şarj", "快充", "fast charging", { ja: "急速充電", ko: "고속충전", ru: "быстрая зарядка", de: "Schnellladung", id: "fast charging", th: "ชาร์จเร็ว" }),
  T("ergonomik", "人体工学", "ergonomic", { ja: "エルゴノミクス", ko: "인체공학", ru: "эргономичный", de: "ergonomisch", id: "ergonomis", th: "ตามหลักสรีรศาสตร์" }),
  T("profesyonel", "专业", "professional", { ja: "プロ", ko: "전문가용", ru: "профессиональный", de: "professionell", id: "profesional", th: "มืออาชีพ" }),
  T("termal", "保暖", "thermal", { ja: "サーマル", ko: "보온", ru: "термо", de: "Thermo", id: "termal", th: "กันหนาว" }),
  T("spor", "运动", "sports", { ja: "スポーツ", ko: "스포츠", ru: "спортивный", de: "Sport", id: "olahraga", th: "กีฬา" }),
  T("vintage", "复古", "vintage", { ja: "ヴィンテージ", ko: "빈티지", ru: "винтаж", de: "Vintage", id: "vintage", th: "วินเทจ" }),
  T("retro", "复古", "retro", { ja: "レトロ", ko: "레트로", ru: "ретро", de: "Retro", id: "retro", th: "เรโทร" }),
  T("outdoor", "户外", "outdoor", { ja: "アウトドア", ko: "아웃도어", ru: "уличный", de: "Outdoor", id: "outdoor", th: "กลางแจ้ง" }),
  T("kapalı", "全盔", "full face", { ja: "フルフェイス", ko: "풀페이스", ru: "интеграл", de: "Integral", id: "full face", th: "เต็มใบ" }),
  T("modüler", "揭面", "modular", { ja: "システム", ko: "시스템", ru: "модуляр", de: "Klapphelm", id: "modular", th: "เปิดคาง" }),
  T("yarım", "半盔", "half", { ja: "ハーフ", ko: "하프", ru: "полулицевой", de: "Halbschale", id: "half face", th: "ครึ่งใบ" }),
  T("çift", "双", "double", { ja: "ダブル", ko: "더블", ru: "двойной", de: "doppelt", id: "ganda", th: "คู่" }),
  T("uzun", "长", "long", { ja: "ロング", ko: "롱", ru: "длинный", de: "lang", id: "panjang", th: "ยาว" }),
  T("kısa", "短", "short", { ja: "ショート", ko: "숏", ru: "короткий", de: "kurz", id: "pendek", th: "สั้น" }),
  T("ince", "薄", "slim", { ja: "スリム", ko: "슬림", ru: "тонкий", de: "schlank", id: "tipis", th: "บาง" }),
  T("hafif", "轻", "lightweight", { ja: "軽量", ko: "경량", ru: "легкий", de: "leicht", id: "ringan", th: "น้ำหนักเบา" }),
  T("sıcak", "加热", "heated", { ja: "加熱", ko: "온열", ru: "с подогревом", de: "beheizt", id: "panas", th: "ทำความร้อน" }),
  T("led", "LED", "led", { ja: "LED", ko: "LED", ru: "LED", de: "LED", id: "led", th: "LED" }),
  T("usb", "USB", "usb", { ja: "USB", ko: "USB", ru: "USB", de: "USB", id: "usb", th: "USB" }),
  T("gaming", "电竞", "gaming", { ja: "ゲーミング", ko: "게이밍", ru: "игровой", de: "Gaming", id: "gaming", th: "เกมมิ่ง" }),
  T("oyuncu", "电竞", "gaming", { ja: "ゲーミング", ko: "게이밍", ru: "игровой", de: "Gaming", id: "gaming", th: "เกมมิ่ง" }),
  T("mat", "哑光", "matte", { ja: "マット", ko: "무광", ru: "матовый", de: "matt", id: "matte", th: "ด้าน" }),
  T("parlak", "亮光", "glossy", { ja: "光沢", ko: "유광", ru: "глянцевый", de: "glänzend", id: "glossy", th: "เงา" }),
  T("yumuşak", "软", "soft", { ja: "ソフト", ko: "소프트", ru: "мягкий", de: "weich", id: "lembut", th: "นุ่ม" }),
  T("sert", "硬", "hard", { ja: "ハード", ko: "하드", ru: "жесткий", de: "hart", id: "keras", th: "แข็ง" }),
  T("ucuz", "", "", {}),
];

/** Native names of taxonomy leaves (by leaf key) for markets that index native text. English is the fallback. */
const NATIVE: Record<"ja" | "ko" | "ru" | "de" | "id" | "th", Record<string, string>> = {
  ja: {
    "kablosuz-kulaklik": "ワイヤレスイヤホン", "kulak-ustu-kulaklik": "ヘッドホン", "kulaklik": "イヤホン", "akilli-saat": "スマートウォッチ", "akilli-bileklik": "スマートバンド", "powerbank": "モバイルバッテリー",
    "bluetooth-hoparlor": "Bluetoothスピーカー", "hoparlor": "スピーカー", "sarj-adaptoru": "充電器", "sarj-kablosu": "充電ケーブル", "kablosuz-sarj": "ワイヤレス充電器", "webcam": "ウェブカメラ",
    "mekanik-klavye": "メカニカルキーボード", "kablosuz-mouse": "ワイヤレスマウス", "oyuncu-kulakligi": "ゲーミングヘッドセット", "mikrofon": "マイク", "telefon-kilifi": "スマホケース", "kilif": "ケース", "ekran-koruyucu": "保護フィルム",
    "telefon-tutucu": "スマホスタンド", "akilli-priz": "スマートプラグ", "drone": "ドローン", "aksiyon-kamerasi": "アクションカメラ", "usb-bellek": "USBメモリ", "telefon": "スマートフォン", "tablet": "タブレット", "laptop": "ノートパソコン",
    "monitor": "モニター", "televizyon": "テレビ", "pil": "電池", "ampul": "電球", "termos": "水筒", "su-sisesi": "ウォーターボトル", "yapismaz-tava": "フライパン", "bicak-seti": "包丁セット", "hava-nemlendirici": "加湿器",
    "aroma-difuzoru": "アロマディフューザー", "led-serit": "LEDテープライト", "masa-lambasi": "デスクライト", "gece-lambasi": "ナイトライト", "yastik": "枕", "battaniye": "毛布", "perde": "カーテン", "hali": "ラグ", "havlu": "タオル", "mum": "アロマキャンドル",
    "airfryer": "エアフライヤー", "blender": "ブレンダー", "kahve-makinesi": "コーヒーメーカー", "elektrikli-kettle": "電気ケトル", "pirinc-pisirici": "炊飯器", "mikrodalga": "電子レンジ", "robot-supurge": "ロボット掃除機", "kablosuz-supurge": "コードレス掃除機",
    "el-supurgesi": "ハンディクリーナー", "buharli-utu": "スチームアイロン", "vantilator": "扇風機", "isitici": "ヒーター", "hava-temizleyici": "空気清浄機", "sac-kurutma-makinesi": "ドライヤー", "elbise": "ワンピース", "bluz": "ブラウス", "etek": "スカート",
    "kazak": "セーター", "tayt": "レギンス", "pijama": "パジャマ", "mayo": "水着", "gomlek": "シャツ", "esofman": "ジャージ", "takim-elbise": "スーツ", "deri-ceket": "レザージャケット", "spor-ayakkabi": "スニーカー", "kosu-ayakkabisi": "ランニングシューズ",
    "bot": "ブーツ", "sandalet": "サンダル", "terlik": "スリッパ", "sirt-cantasi": "リュック", "valiz": "スーツケース", "cuzdan": "財布", "omuz-cantasi": "ショルダーバッグ", "gunes-gozlugu": "サングラス", "kol-saati": "腕時計", "saat-kordonu": "時計バンド",
    "kolye": "ネックレス", "kupe": "ピアス", "yuzuk": "リング", "sapka": "帽子", "semsiye": "傘", "parfum": "香水", "sac-duzlestirici": "ヘアアイロン", "tiras-makinesi": "電動シェーバー", "elektrikli-dis-fircasi": "電動歯ブラシ", "masaj-tabancasi": "マッサージガン",
    "tansiyon-aleti": "血圧計", "ates-olcer": "体温計", "akilli-tarti": "体組成計", "yoga-mati": "ヨガマット", "dambil": "ダンベル", "kamp-cadiri": "テント", "uyku-tulumu": "寝袋", "bisiklet-kaski": "自転車ヘルメット", "motosiklet-kaski": "バイクヘルメット", "kask": "ヘルメット",
    "motosiklet-eldiveni": "バイクグローブ", "arac-kamerasi": "ドライブレコーダー", "arac-telefon-tutucu": "車載スマホホルダー", "aku-takviye": "ジャンプスターター", "sarjli-matkap": "電動ドリル", "alet-seti": "工具セット", "el-feneri": "懐中電灯", "yapi-bloklari": "ブロック",
    "pelus-oyuncak": "ぬいぐるみ", "puzzle": "パズル", "oyuncak": "おもちゃ", "bebek-arabasi": "ベビーカー", "biberon": "哺乳瓶", "oto-koltugu": "チャイルドシート", "kedi-kumu": "猫砂", "kopek-mamasi": "ドッグフード", "kedi-mamasi": "キャットフード", "pet-yatagi": "ペットベッド",
    "jel-kalem": "ゲルペン", "defter": "ノート", "ofis-koltugu": "オフィスチェア", "gitar": "ギター", "guvenlik-kamerasi": "防犯カメラ", "koli-bandi": "梱包テープ", "canta": "バッグ", "ayakkabi": "靴", "saat": "腕時計", "gozluk": "メガネ",
  },
  ko: {
    "kablosuz-kulaklik": "무선 이어폰", "kulak-ustu-kulaklik": "헤드폰", "kulaklik": "이어폰", "akilli-saat": "스마트워치", "akilli-bileklik": "스마트밴드", "powerbank": "보조배터리",
    "bluetooth-hoparlor": "블루투스 스피커", "hoparlor": "스피커", "sarj-adaptoru": "충전기", "sarj-kablosu": "충전 케이블", "kablosuz-sarj": "무선충전기", "webcam": "웹캠",
    "mekanik-klavye": "기계식 키보드", "kablosuz-mouse": "무선 마우스", "oyuncu-kulakligi": "게이밍 헤드셋", "mikrofon": "마이크", "telefon-kilifi": "휴대폰 케이스", "kilif": "케이스", "ekran-koruyucu": "보호필름",
    "telefon-tutucu": "휴대폰 거치대", "akilli-priz": "스마트 플러그", "drone": "드론", "aksiyon-kamerasi": "액션캠", "usb-bellek": "USB 메모리", "telefon": "스마트폰", "tablet": "태블릿", "laptop": "노트북",
    "monitor": "모니터", "televizyon": "TV", "pil": "건전지", "ampul": "전구", "termos": "텀블러", "su-sisesi": "물병", "yapismaz-tava": "프라이팬", "bicak-seti": "칼 세트", "hava-nemlendirici": "가습기",
    "aroma-difuzoru": "아로마 디퓨저", "led-serit": "LED 스트립", "masa-lambasi": "스탠드", "gece-lambasi": "무드등", "yastik": "베개", "battaniye": "담요", "perde": "커튼", "hali": "러그", "havlu": "수건", "mum": "향초",
    "airfryer": "에어프라이어", "blender": "블렌더", "kahve-makinesi": "커피머신", "elektrikli-kettle": "전기포트", "pirinc-pisirici": "전기밥솥", "mikrodalga": "전자레인지", "robot-supurge": "로봇청소기", "kablosuz-supurge": "무선청소기",
    "el-supurgesi": "핸디청소기", "buharli-utu": "스팀다리미", "vantilator": "선풍기", "isitici": "히터", "hava-temizleyici": "공기청정기", "sac-kurutma-makinesi": "헤어드라이어", "elbise": "원피스", "bluz": "블라우스", "etek": "스커트",
    "kazak": "니트", "tayt": "레깅스", "pijama": "잠옷", "mayo": "수영복", "gomlek": "셔츠", "esofman": "트레이닝복", "takim-elbise": "정장", "deri-ceket": "가죽자켓", "spor-ayakkabi": "운동화", "kosu-ayakkabisi": "러닝화",
    "bot": "부츠", "sandalet": "샌들", "terlik": "슬리퍼", "sirt-cantasi": "백팩", "valiz": "캐리어", "cuzdan": "지갑", "omuz-cantasi": "숄더백", "gunes-gozlugu": "선글라스", "kol-saati": "손목시계", "saat-kordonu": "시계줄",
    "kolye": "목걸이", "kupe": "귀걸이", "yuzuk": "반지", "sapka": "모자", "semsiye": "우산", "parfum": "향수", "sac-duzlestirici": "고데기", "tiras-makinesi": "전기면도기", "elektrikli-dis-fircasi": "전동칫솔", "masaj-tabancasi": "마사지건",
    "tansiyon-aleti": "혈압계", "ates-olcer": "체온계", "akilli-tarti": "체중계", "yoga-mati": "요가매트", "dambil": "덤벨", "kamp-cadiri": "텐트", "uyku-tulumu": "침낭", "bisiklet-kaski": "자전거 헬멧", "motosiklet-kaski": "오토바이 헬멧", "kask": "헬멧",
    "motosiklet-eldiveni": "오토바이 장갑", "arac-kamerasi": "블랙박스", "arac-telefon-tutucu": "차량용 거치대", "aku-takviye": "점프스타터", "sarjli-matkap": "전동드릴", "alet-seti": "공구세트", "el-feneri": "손전등", "yapi-bloklari": "블록",
    "pelus-oyuncak": "인형", "puzzle": "퍼즐", "oyuncak": "장난감", "bebek-arabasi": "유모차", "biberon": "젖병", "oto-koltugu": "카시트", "kedi-kumu": "고양이 모래", "kopek-mamasi": "강아지 사료", "kedi-mamasi": "고양이 사료", "pet-yatagi": "펫 방석",
    "jel-kalem": "젤펜", "defter": "노트", "ofis-koltugu": "사무용 의자", "gitar": "기타", "guvenlik-kamerasi": "CCTV", "koli-bandi": "박스테이프", "canta": "가방", "ayakkabi": "신발", "saat": "시계", "gozluk": "안경",
  },
  ru: {
    "kablosuz-kulaklik": "беспроводные наушники", "kulak-ustu-kulaklik": "накладные наушники", "kulaklik": "наушники", "akilli-saat": "смарт-часы", "akilli-bileklik": "фитнес-браслет", "powerbank": "повербанк",
    "bluetooth-hoparlor": "bluetooth колонка", "hoparlor": "колонка", "sarj-adaptoru": "зарядное устройство", "sarj-kablosu": "кабель для зарядки", "kablosuz-sarj": "беспроводная зарядка", "webcam": "веб-камера",
    "mekanik-klavye": "механическая клавиатура", "kablosuz-mouse": "беспроводная мышь", "oyuncu-kulakligi": "игровая гарнитура", "mikrofon": "микрофон", "telefon-kilifi": "чехол для телефона", "kilif": "чехол", "ekran-koruyucu": "защитное стекло",
    "telefon-tutucu": "держатель для телефона", "akilli-priz": "умная розетка", "drone": "квадрокоптер", "aksiyon-kamerasi": "экшн-камера", "usb-bellek": "флешка", "telefon": "смартфон", "tablet": "планшет", "laptop": "ноутбук",
    "monitor": "монитор", "televizyon": "телевизор", "pil": "батарейки", "ampul": "лампочка", "termos": "термос", "su-sisesi": "бутылка для воды", "yapismaz-tava": "сковорода", "bicak-seti": "набор ножей", "hava-nemlendirici": "увлажнитель воздуха",
    "aroma-difuzoru": "аромадиффузор", "led-serit": "светодиодная лента", "masa-lambasi": "настольная лампа", "gece-lambasi": "ночник", "yastik": "подушка", "battaniye": "плед", "perde": "шторы", "hali": "ковер", "havlu": "полотенце", "mum": "ароматическая свеча",
    "airfryer": "аэрогриль", "blender": "блендер", "kahve-makinesi": "кофемашина", "elektrikli-kettle": "электрочайник", "pirinc-pisirici": "рисоварка", "mikrodalga": "микроволновая печь", "robot-supurge": "робот-пылесос", "kablosuz-supurge": "беспроводной пылесос",
    "el-supurgesi": "ручной пылесос", "buharli-utu": "паровой утюг", "vantilator": "вентилятор", "isitici": "обогреватель", "hava-temizleyici": "очиститель воздуха", "sac-kurutma-makinesi": "фен", "elbise": "платье", "bluz": "блузка", "etek": "юбка",
    "kazak": "свитер", "tayt": "леггинсы", "pijama": "пижама", "mayo": "купальник", "gomlek": "рубашка", "esofman": "спортивный костюм", "takim-elbise": "костюм", "deri-ceket": "кожаная куртка", "spor-ayakkabi": "кроссовки", "kosu-ayakkabisi": "беговые кроссовки",
    "bot": "ботинки", "sandalet": "сандалии", "terlik": "тапочки", "sirt-cantasi": "рюкзак", "valiz": "чемодан", "cuzdan": "кошелек", "omuz-cantasi": "сумка через плечо", "gunes-gozlugu": "солнцезащитные очки", "kol-saati": "наручные часы", "saat-kordonu": "ремешок для часов",
    "kolye": "ожерелье", "kupe": "серьги", "yuzuk": "кольцо", "sapka": "шапка", "semsiye": "зонт", "parfum": "духи", "sac-duzlestirici": "выпрямитель для волос", "tiras-makinesi": "электробритва", "elektrikli-dis-fircasi": "электрическая зубная щетка", "masaj-tabancasi": "массажный пистолет",
    "tansiyon-aleti": "тонометр", "ates-olcer": "термометр", "akilli-tarti": "умные весы", "yoga-mati": "коврик для йоги", "dambil": "гантели", "kamp-cadiri": "палатка", "uyku-tulumu": "спальный мешок", "bisiklet-kaski": "велошлем", "motosiklet-kaski": "мотошлем", "kask": "шлем",
    "motosiklet-eldiveni": "мотоперчатки", "arac-kamerasi": "видеорегистратор", "arac-telefon-tutucu": "автодержатель", "aku-takviye": "пусковое устройство", "sarjli-matkap": "аккумуляторная дрель", "alet-seti": "набор инструментов", "el-feneri": "фонарик", "yapi-bloklari": "конструктор",
    "pelus-oyuncak": "мягкая игрушка", "puzzle": "пазл", "oyuncak": "игрушка", "bebek-arabasi": "коляска", "biberon": "бутылочка", "oto-koltugu": "автокресло", "kedi-kumu": "наполнитель для кошек", "kopek-mamasi": "корм для собак", "kedi-mamasi": "корм для кошек", "pet-yatagi": "лежанка",
    "jel-kalem": "гелевая ручка", "defter": "блокнот", "ofis-koltugu": "офисное кресло", "gitar": "гитара", "guvenlik-kamerasi": "камера видеонаблюдения", "koli-bandi": "скотч упаковочный", "canta": "сумка", "ayakkabi": "обувь", "saat": "часы", "gozluk": "очки",
  },
  de: {
    "kablosuz-kulaklik": "Bluetooth Kopfhörer in Ear", "kulak-ustu-kulaklik": "Over-Ear Kopfhörer", "kulaklik": "Kopfhörer", "akilli-saat": "Smartwatch", "akilli-bileklik": "Fitness Tracker", "powerbank": "Powerbank",
    "bluetooth-hoparlor": "Bluetooth Lautsprecher", "hoparlor": "Lautsprecher", "sarj-adaptoru": "Ladegerät", "sarj-kablosu": "Ladekabel", "kablosuz-sarj": "Wireless Charger", "webcam": "Webcam",
    "mekanik-klavye": "mechanische Tastatur", "kablosuz-mouse": "kabellose Maus", "oyuncu-kulakligi": "Gaming Headset", "mikrofon": "Mikrofon", "telefon-kilifi": "Handyhülle", "kilif": "Hülle", "ekran-koruyucu": "Schutzfolie",
    "telefon-tutucu": "Handyhalterung", "akilli-priz": "Smart Steckdose", "drone": "Drohne", "aksiyon-kamerasi": "Action Cam", "usb-bellek": "USB Stick", "telefon": "Smartphone", "tablet": "Tablet", "laptop": "Laptop",
    "monitor": "Monitor", "televizyon": "Fernseher", "pil": "Batterien", "ampul": "Glühbirne", "termos": "Thermosflasche", "su-sisesi": "Trinkflasche", "yapismaz-tava": "Pfanne", "bicak-seti": "Messerset", "hava-nemlendirici": "Luftbefeuchter",
    "aroma-difuzoru": "Aroma Diffuser", "led-serit": "LED Streifen", "masa-lambasi": "Schreibtischlampe", "gece-lambasi": "Nachtlicht", "yastik": "Kissen", "battaniye": "Decke", "perde": "Vorhang", "hali": "Teppich", "havlu": "Handtuch", "mum": "Duftkerze",
    "airfryer": "Heißluftfritteuse", "blender": "Standmixer", "kahve-makinesi": "Kaffeemaschine", "elektrikli-kettle": "Wasserkocher", "pirinc-pisirici": "Reiskocher", "mikrodalga": "Mikrowelle", "robot-supurge": "Saugroboter", "kablosuz-supurge": "Akku Staubsauger",
    "el-supurgesi": "Handstaubsauger", "buharli-utu": "Dampfbügeleisen", "vantilator": "Ventilator", "isitici": "Heizlüfter", "hava-temizleyici": "Luftreiniger", "sac-kurutma-makinesi": "Haartrockner", "elbise": "Kleid", "bluz": "Bluse", "etek": "Rock",
    "kazak": "Pullover", "tayt": "Leggings", "pijama": "Schlafanzug", "mayo": "Badeanzug", "gomlek": "Hemd", "esofman": "Trainingsanzug", "takim-elbise": "Anzug", "deri-ceket": "Lederjacke", "spor-ayakkabi": "Sneaker", "kosu-ayakkabisi": "Laufschuhe",
    "bot": "Stiefel", "sandalet": "Sandalen", "terlik": "Hausschuhe", "sirt-cantasi": "Rucksack", "valiz": "Koffer", "cuzdan": "Geldbörse", "omuz-cantasi": "Umhängetasche", "gunes-gozlugu": "Sonnenbrille", "kol-saati": "Armbanduhr", "saat-kordonu": "Uhrenarmband",
    "kolye": "Halskette", "kupe": "Ohrringe", "yuzuk": "Ring", "sapka": "Mütze", "semsiye": "Regenschirm", "parfum": "Parfum", "sac-duzlestirici": "Glätteisen", "tiras-makinesi": "Rasierer", "elektrikli-dis-fircasi": "elektrische Zahnbürste", "masaj-tabancasi": "Massagepistole",
    "tansiyon-aleti": "Blutdruckmessgerät", "ates-olcer": "Fieberthermometer", "akilli-tarti": "Körperfettwaage", "yoga-mati": "Yogamatte", "dambil": "Hanteln", "kamp-cadiri": "Zelt", "uyku-tulumu": "Schlafsack", "bisiklet-kaski": "Fahrradhelm", "motosiklet-kaski": "Motorradhelm", "kask": "Helm",
    "motosiklet-eldiveni": "Motorradhandschuhe", "arac-kamerasi": "Dashcam", "arac-telefon-tutucu": "Handyhalterung Auto", "aku-takviye": "Starthilfe Powerbank", "sarjli-matkap": "Akkuschrauber", "alet-seti": "Werkzeugset", "el-feneri": "Taschenlampe", "yapi-bloklari": "Bausteine",
    "pelus-oyuncak": "Plüschtier", "puzzle": "Puzzle", "oyuncak": "Spielzeug", "bebek-arabasi": "Kinderwagen", "biberon": "Babyflasche", "oto-koltugu": "Kindersitz", "kedi-kumu": "Katzenstreu", "kopek-mamasi": "Hundefutter", "kedi-mamasi": "Katzenfutter", "pet-yatagi": "Hundebett",
    "jel-kalem": "Gelstift", "defter": "Notizbuch", "ofis-koltugu": "Bürostuhl", "gitar": "Gitarre", "guvenlik-kamerasi": "Überwachungskamera", "koli-bandi": "Paketband", "canta": "Tasche", "ayakkabi": "Schuhe", "saat": "Uhr", "gozluk": "Brille",
  },
  id: {
    "kablosuz-kulaklik": "tws earphone", "kulaklik": "earphone", "akilli-saat": "smartwatch", "powerbank": "power bank", "bluetooth-hoparlor": "speaker bluetooth", "hoparlor": "speaker", "sarj-adaptoru": "charger", "sarj-kablosu": "kabel data",
    "telefon-kilifi": "case hp", "kilif": "case", "ekran-koruyucu": "tempered glass", "telefon-tutucu": "holder hp", "telefon": "hp", "tablet": "tablet", "laptop": "laptop", "monitor": "monitor", "televizyon": "tv",
    "termos": "termos", "su-sisesi": "botol minum", "yapismaz-tava": "wajan anti lengket", "yastik": "bantal", "battaniye": "selimut", "perde": "gorden", "hali": "karpet", "havlu": "handuk",
    "airfryer": "air fryer", "blender": "blender", "kahve-makinesi": "mesin kopi", "elektrikli-kettle": "teko listrik", "pirinc-pisirici": "rice cooker", "robot-supurge": "robot vacuum", "kablosuz-supurge": "vacuum cleaner wireless", "vantilator": "kipas angin",
    "elbise": "dress", "bluz": "blouse", "etek": "rok", "gomlek": "kemeja", "spor-ayakkabi": "sepatu olahraga", "sandalet": "sandal", "terlik": "sandal rumah", "sirt-cantasi": "tas ransel", "valiz": "koper", "cuzdan": "dompet",
    "gunes-gozlugu": "kacamata hitam", "kol-saati": "jam tangan", "kolye": "kalung", "parfum": "parfum", "yoga-mati": "matras yoga", "dambil": "dumbbell", "motosiklet-kaski": "helm motor", "kask": "helm", "bisiklet-kaski": "helm sepeda",
    "oyuncak": "mainan", "bebek-arabasi": "stroller", "kedi-mamasi": "makanan kucing", "kedi-kumu": "pasir kucing", "defter": "buku catatan", "canta": "tas", "ayakkabi": "sepatu", "saat": "jam tangan", "gozluk": "kacamata", "pil": "baterai", "ampul": "bohlam",
  },
  th: {
    "kablosuz-kulaklik": "หูฟังไร้สาย", "kulaklik": "หูฟัง", "akilli-saat": "สมาร์ทวอทช์", "powerbank": "พาวเวอร์แบงค์", "bluetooth-hoparlor": "ลำโพงบลูทูธ", "hoparlor": "ลำโพง", "sarj-adaptoru": "ที่ชาร์จ", "sarj-kablosu": "สายชาร์จ",
    "telefon-kilifi": "เคสโทรศัพท์", "kilif": "เคส", "ekran-koruyucu": "ฟิล์มกันรอย", "telefon-tutucu": "ที่วางโทรศัพท์", "telefon": "โทรศัพท์", "tablet": "แท็บเล็ต", "laptop": "โน้ตบุ๊ค", "monitor": "จอมอนิเตอร์", "televizyon": "ทีวี",
    "termos": "กระติกน้ำ", "su-sisesi": "ขวดน้ำ", "yapismaz-tava": "กระทะ", "yastik": "หมอน", "battaniye": "ผ้าห่ม", "perde": "ผ้าม่าน", "hali": "พรม", "havlu": "ผ้าขนหนู",
    "airfryer": "หม้อทอดไร้น้ำมัน", "blender": "เครื่องปั่น", "kahve-makinesi": "เครื่องชงกาแฟ", "elektrikli-kettle": "กาต้มน้ำไฟฟ้า", "pirinc-pisirici": "หม้อหุงข้าว", "robot-supurge": "หุ่นยนต์ดูดฝุ่น", "kablosuz-supurge": "เครื่องดูดฝุ่นไร้สาย", "vantilator": "พัดลม",
    "elbise": "เดรส", "bluz": "เสื้อเบลาส์", "etek": "กระโปรง", "gomlek": "เสื้อเชิ้ต", "spor-ayakkabi": "รองเท้าผ้าใบ", "sandalet": "รองเท้าแตะ", "terlik": "รองเท้าใส่ในบ้าน", "sirt-cantasi": "กระเป๋าเป้", "valiz": "กระเป๋าเดินทาง", "cuzdan": "กระเป๋าสตางค์",
    "gunes-gozlugu": "แว่นกันแดด", "kol-saati": "นาฬิกาข้อมือ", "kolye": "สร้อยคอ", "parfum": "น้ำหอม", "yoga-mati": "เสื่อโยคะ", "dambil": "ดัมเบล", "motosiklet-kaski": "หมวกกันน็อค", "kask": "หมวกกันน็อค", "bisiklet-kaski": "หมวกจักรยาน",
    "oyuncak": "ของเล่น", "bebek-arabasi": "รถเข็นเด็ก", "kedi-mamasi": "อาหารแมว", "kedi-kumu": "ทรายแมว", "defter": "สมุด", "canta": "กระเป๋า", "ayakkabi": "รองเท้า", "saat": "นาฬิกา", "gozluk": "แว่นตา", "pil": "ถ่าน", "ampul": "หลอดไฟ",
  },
};

const NATIVE_LANGS = new Set(["ja", "ko", "ru", "de", "id", "th"]);
const CJK_RE = /[㐀-鿿]/;
const TR_LETTERS = /[çğıöşüÇĞİÖŞÜ]/;

/** Turkish filler that never helps a search and must not leak as a "brand". */
const TR_STOP = new Set(
  (
    "ve ile icin veya gibi cok az en iyi ucuz kaliteli toptan orijinal orjinal garantili indirimli indirim fiyat fiyati fiyatlari satin al urun urunu urunler model marka yeni ikinci el sifir hizli kargo ucretsiz bedava " +
    "adet adetli set takim paket kampanya firsat sepette ozel the and for with new original free shipping sale hot best top quality premium lux luxury super cheap"
  ).split(/\s+/),
);
const MATERIAL_STOP = new Set(["paslanmaz", "celik", "silikon", "deri", "pamuk", "pamuklu", "plastik", "metal", "ahsap", "cam", "kumas", "naylon", "polyester", "keten", "yun", "bambu"]);
const SERIES = new Set(["pro", "max", "ultra", "plus", "mini", "lite", "air", "detect", "neo", "prime", "edge", "note", "fold", "flip", "se", "gt", "classic", "sport", "active", "go", "elite", "evo", "nova", "turbo", "slim", "x", "s", "fe", "zoom", "titan"]);
const UNIT_RE = /^[\d.,]+(ml|l|lt|mm|cm|m|kg|g|gr|w|kw|v|mah|oz|gb|tb|mb|inç|inch|in|hz|p|k|a|ah|wh|")$/i;
const CODE_RE = /\b(?:[A-Za-z]{1,5}(?:-[A-Za-z]{0,3})?\d{2,6}[A-Za-z]{0,2}(?:\/\d+)?|[A-Z]{1,4}\d{1,2}[A-Za-z]{0,2}\d{0,3}|[A-Za-z]{2,5}-[A-Za-z]{0,2}\d{1,6}[A-Za-z]?)\b/g;
const NUM_UNIT_RE = /\b\d+(?:[.,]\d+)?\s?(?:ml|lt|l|mm|cm|m|kg|gr|g|w|kw|v|mah|oz|gb|tb|inç|inch|hz)(?![a-zçğıöşü])/gi;

const isUnit = (w: string) => UNIT_RE.test(w);
const isCjk = (s: string) => CJK_RE.test(s);
const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

let categoryWords: Set<string> | null = null;
/** Folded words of every leaf/EXTRA Turkish name, so "Termos" or "Airfryer" is never mistaken for a brand. */
function categoryWordSet(): Set<string> {
  if (categoryWords) return categoryWords;
  categoryWords = new Set<string>();
  for (const l of getLeaves()) for (const w of wordsTr(l.tr)) categoryWords.add(w);
  for (const t of EXTRA) for (const w of wordsTr(t.tr)) categoryWords.add(w);
  for (const t of ACCESSORY_NOUNS) for (const w of wordsTr(t.tr)) categoryWords.add(w);
  return categoryWords;
}

function termName(term: Term, language: QueryLanguage): string {
  if (language === "zh") return term.zh;
  if (language === "tr") return capFirst(term.tr);
  if (language === "en") return term.en;
  const n = (term as unknown as Record<string, string | undefined>)[language];
  return n ?? term.en;
}

function leafName(leaf: Leaf, language: QueryLanguage): string {
  if (language === "zh") return leaf.zh;
  if (language === "tr") return leaf.tr;
  if (language === "en") return leaf.en;
  if (NATIVE_LANGS.has(language)) return NATIVE[language as keyof typeof NATIVE][leaf.key] ?? leaf.en;
  return leaf.en;
}

export interface CategoryHit {
  leaf?: Leaf;
  term?: Term;
  /** Number of Turkish words of the category present in the text. */
  words: number;
  /** Position of the last match in the text (Turkish head noun comes last). */
  pos: number;
}

function lastPos(text: string, needles: string[]): number {
  const f = foldTr(text);
  let p = -1;
  for (const n of needles) p = Math.max(p, text.lastIndexOf(n), f.lastIndexOf(foldTr(n)));
  return p;
}

/**
 * The product category named in a text. Chinese text is matched by substring (longest wins,
 * later position breaks ties); Turkish/latin text by whole words with suffix tolerance
 * (most words wins, later position breaks ties, so "Kask Taşıma Çantası" is a bag).
 */
export function categoryHit(text: string, opts: { requireAll?: boolean } = {}): CategoryHit | null {
  const t = text.replace(/\([^)]*\)|\[[^\]]*\]|（[^）]*）|【[^】]*】/g, " ").trim();
  if (!t) return null;
  const leaves = getLeaves();
  let best: CategoryHit | null = null;
  const consider = (h: CategoryHit) => {
    if (!best) best = h;
    else if (h.words > best.words || (h.words === best.words && h.pos > best.pos)) best = h;
  };
  if (isCjk(t)) {
    const stripped = stripZhMarketing(t);
    let bestZh: { leaf?: Leaf; term?: Term; zh: string; pos: number } | null = null;
    const considerZh = (c: { leaf?: Leaf; term?: Term; zh: string; pos: number }) => {
      if (!bestZh || c.zh.length > bestZh.zh.length || (c.zh.length === bestZh.zh.length && c.pos > bestZh.pos)) bestZh = c;
    };
    for (const l of leaves) if (l.zh && stripped.includes(l.zh)) considerZh({ leaf: l, zh: l.zh, pos: stripped.lastIndexOf(l.zh) });
    if (!bestZh) for (const x of EXTRA) if (x.zh && stripped.includes(x.zh)) considerZh({ term: x, zh: x.zh, pos: stripped.lastIndexOf(x.zh) });
    if (bestZh) {
      const b = bestZh as { leaf?: Leaf; term?: Term; zh: string; pos: number };
      return { ...(b.leaf ? { leaf: b.leaf } : {}), ...(b.term ? { term: b.term } : {}), words: 1, pos: b.pos };
    }
  }
  const f = foldTr(t);
  const latin = /[a-z]/.test(f);
  if (!latin) return null;
  for (const l of leaves) {
    const need = wordsTr(l.tr);
    if (!need.length) continue;
    const matched = countMatchesTr(t, l.tr);
    if (matched === need.length) consider({ leaf: l, words: matched, pos: lastPos(t, need) });
    else if (!opts.requireAll && matched > 0 && need.length >= 2 && matched >= need.length - 1 && matchesTr(t, need[need.length - 1]!)) {
      // Head noun present and most modifiers too ("kablosuz kulaklığı" vs "Kablosuz Kulaklık").
    }
  }
  if (best) return best;
  for (const x of EXTRA) {
    if (!x.zh) continue;
    const need = wordsTr(x.tr);
    const matched = countMatchesTr(t, x.tr);
    if (matched === need.length) consider({ term: x, words: matched, pos: lastPos(t, need) });
  }
  if (best) return best;
  // English names (a Trendyol title may say "Airfryer", an Amazon title "wireless earbuds").
  const fl = ` ${f.replace(/[^a-z0-9]+/g, " ")} `;
  for (const l of leaves) {
    const en = l.en.toLowerCase();
    if (en && fl.includes(` ${en} `)) consider({ leaf: l, words: en.split(" ").length, pos: fl.lastIndexOf(` ${en} `) });
  }
  if (!best) {
    for (const x of EXTRA) {
      const en = x.en.toLowerCase();
      if (en && fl.includes(` ${en} `)) consider({ term: x, words: en.split(" ").length, pos: fl.lastIndexOf(` ${en} `) });
    }
  }
  return best;
}

/** The product category named in a title, in the requested language ("" when none is recognised). */
export function categoryIn(title: string, language: QueryLanguage): string {
  const hit = categoryHit(title);
  if (!hit) return "";
  if (hit.leaf) return leafName(hit.leaf, language);
  if (hit.term) return termName(hit.term, language);
  return "";
}

/** Taxonomy leaf key for a title, when one is recognised (language-neutral category for matching). */
export function categoryKey(title: string): string | undefined {
  const hit = categoryHit(title);
  return hit?.leaf?.key;
}

/** Attribute words of a Turkish query, in order, with their translations. */
function attributesIn(text: string, language: QueryLanguage): { tr: string; out: string; words: string[] }[] {
  const words = wordsTr(text);
  const out: { tr: string; out: string; words: string[]; pos: number }[] = [];
  const used = new Set<number>();
  // Multi-word attributes first.
  for (const a of [...ATTR].sort((x, y) => wordsTr(y.tr).length - wordsTr(x.tr).length)) {
    const need = wordsTr(a.tr);
    if (!need.length || !a.zh) continue;
    for (let i = 0; i + need.length <= words.length; i++) {
      let ok = true;
      for (let j = 0; j < need.length; j++) {
        const w = words[i + j]!;
        const n = need[j]!;
        if (used.has(i + j) || !(w === n || (n.length >= 4 && w.startsWith(n)) || (j === need.length - 1 && matchesTr(w, n)))) {
          ok = false;
          break;
        }
      }
      if (ok) {
        for (let j = 0; j < need.length; j++) used.add(i + j);
        out.push({ tr: a.tr, out: termName(a, language), words: need, pos: i });
      }
    }
  }
  out.sort((x, y) => x.pos - y.pos);
  return out;
}

function pickCategoryForQuery(bare: string): { name: (lang: QueryLanguage) => string; words: string[]; key?: string } | null {
  const fb = foldTr(bare).trim();
  const leaves = getLeaves();
  const exact = leaves.find((l) => foldTr(l.tr) === fb);
  if (exact) return { name: (lang) => leafName(exact, lang), words: wordsTr(exact.tr), key: exact.key };
  const exactExtra = EXTRA.find((x) => x.zh && foldTr(x.tr) === fb);
  if (exactExtra) return { name: (lang) => termName(exactExtra, lang), words: wordsTr(exactExtra.tr) };
  // Leaves whose every word appears in the query, or that contain every query word; rank by matched query words.
  type Cand = { leaf?: Leaf; term?: Term; score: number; len: number; words: string[] };
  const cands: Cand[] = [];
  const qWords = wordsTr(bare);
  for (const l of leaves) {
    const need = wordsTr(l.tr);
    const inQuery = countMatchesTr(bare, l.tr);
    const queryInLeaf = countMatchesTr(l.tr, bare);
    if (inQuery === need.length || queryInLeaf === qWords.length) {
      cands.push({ leaf: l, score: Math.max(inQuery, queryInLeaf), len: need.length, words: need.filter((_, i) => matchesTr(bare, need[i]!)) });
    }
  }
  if (!cands.length) {
    for (const x of EXTRA) {
      if (!x.zh) continue;
      const need = wordsTr(x.tr);
      const inQuery = countMatchesTr(bare, x.tr);
      if (inQuery === need.length) cands.push({ term: x, score: inQuery, len: need.length, words: need });
    }
  }
  if (!cands.length) return null;
  cands.sort((a, b) => b.score - a.score || Math.abs(a.len - qWords.length) - Math.abs(b.len - qWords.length) || b.len - a.len);
  const c = cands[0]!;
  if (c.leaf) {
    const leaf = c.leaf;
    return { name: (lang) => leafName(leaf, lang), words: wordsTr(leaf.tr), key: leaf.key };
  }
  const term = c.term!;
  return { name: (lang) => termName(term, lang), words: wordsTr(term.tr) };
}

export interface TranslatedQuery {
  text: string;
  /** A category or attribute was translated (false when only brand/model/unit tokens survived). */
  translated: boolean;
  categoryKey?: string;
}

/**
 * Translates a Turkish (or mixed) query into the target language: brand tokens, category,
 * attribute words, numbers with units and model codes survive; Turkish filler is dropped.
 * Returns text "" when nothing usable remains.
 */
export function translateQuery(query: string, language: QueryLanguage): TranslatedQuery {
  const q = query.trim();
  if (!q) return { text: "", translated: false };
  if (language === "tr") return { text: q, translated: true };
  if (isCjk(q)) return { text: q, translated: language === "zh" };
  const codes = [...new Set((q.match(CODE_RE) ?? []).filter((c) => !isUnit(c)))];
  const nums = [...new Set((q.match(NUM_UNIT_RE) ?? []).map((n) => n.replace(/\s+/g, "")))];
  let bare = q.replace(CODE_RE, " ").replace(NUM_UNIT_RE, " ").replace(/\s+/g, " ").trim();
  const plainNumbers = bare.match(/\b\d{1,4}\b/g) ?? [];
  bare = bare.replace(/\b\d{1,4}\b/g, " ").replace(/\s+/g, " ").trim();
  const cat = bare ? pickCategoryForQuery(bare) : null;
  const catWords = new Set(cat?.words ?? []);
  const attrs = (bare ? attributesIn(bare, language) : []).filter((a) => !a.words.every((w) => catWords.has(w) || [...catWords].some((c) => matchesTr(c, w))));
  const attrWords = new Set(attrs.flatMap((a) => a.words));
  // Leftover latin tokens: brands and foreign words that no glossary knows (Stanley, iphone, Dyson).
  const leftovers: string[] = [];
  for (const raw of bare.split(/\s+/)) {
    const w = foldTr(raw).replace(/[^a-z0-9]/g, "");
    if (!w || w.length < 2) continue;
    if (TR_LETTERS.test(raw)) continue;
    if (TR_STOP.has(w) || MATERIAL_STOP.has(w)) continue;
    if (catWords.has(w) || [...catWords].some((c) => matchesTr(w, c) || matchesTr(c, w))) continue;
    if (attrWords.has(w) || [...attrWords].some((c) => matchesTr(w, c))) continue;
    if (categoryWordSet().has(w)) continue;
    // Unknown lower-case Turkish-looking word (ends with a Turkish suffix) is dropped; everything else travels.
    if (/^[a-z]+(lar|ler|lik|lık|si|su|lari|leri)$/.test(w) && raw === raw.toLowerCase()) continue;
    leftovers.push(raw);
  }
  const catName = cat ? cat.name(language) : "";
  const attrNames = attrs.map((a) => a.out).filter(Boolean);
  const parts =
    language === "zh"
      ? [...leftovers, ...plainNumbers, catName, ...attrNames, ...nums, ...codes]
      : [...leftovers, ...plainNumbers, ...attrNames, catName, ...nums, ...codes];
  const text = [...new Set(parts.filter(Boolean))].join(" ").trim();
  const translated = !!catName || attrNames.length > 0;
  return { text, translated, ...(cat?.key ? { categoryKey: cat.key } : {}) };
}

export function translateQueryToZh(query: string): string {
  const q = query.trim();
  if (!q) return q;
  if (isCjk(q)) return q;
  const t = translateQuery(q, "zh");
  if (!t.text) return q;
  if (!t.translated && !/[㐀-鿿]/.test(t.text) && !(t.text.match(/[A-Za-z0-9]/) && t.text !== q)) return q;
  return t.text;
}

export interface QueryLadder {
  rungs: string[];
  /** The first rung is in the market's language (or a brand/model-only query that needs no translation). */
  translated: boolean;
  language: QueryLanguage;
  categoryKey?: string;
}

/**
 * Per-market query ladder for a free-text query: the native rendering first, English as a
 * second rung for markets that index both; never the raw Turkish query on a non-Turkish market.
 */
export function localizeQueryLadder(query: string, language: QueryLanguage): QueryLadder {
  const q = query.trim();
  if (language === "tr" || !q) return { rungs: [q].filter(Boolean), translated: true, language };
  if (isCjk(q)) return { rungs: [q], translated: language === "zh", language };
  const main = translateQuery(q, language);
  const rungs: string[] = [];
  let translated = main.translated;
  if (main.text) rungs.push(main.text);
  if (language !== "zh" && language !== "en") {
    const en = translateQuery(q, "en");
    if (en.text && !rungs.includes(en.text)) rungs.push(en.text);
  }
  if (!main.translated) {
    // Brand/model-only query ("Stanley", "HD9252/90"): fine as it is on every market.
    if (main.text && !TR_LETTERS.test(q) && main.text.length >= Math.min(q.length, 3)) translated = true;
    else if (!rungs.length || TR_LETTERS.test(q)) {
      if (!rungs.includes(q)) rungs.push(q);
      translated = false;
    }
  }
  if (!rungs.length) rungs.push(q);
  return { rungs: [...new Set(rungs)], translated, language, ...(main.categoryKey ? { categoryKey: main.categoryKey } : {}) };
}

/** Per-market query: the first rung of the ladder (Chinese markets get the glossary translation, English markets English, …). */
export function localizeQuery(query: string, language: QueryLanguage): string {
  return localizeQueryLadder(query, language).rungs[0] ?? query;
}

/** Brand (first latin, non-generic word), model tokens (series words and codes) and unit attributes of a title. */
export function brandModel(title: string): { brand: string; models: string[]; attrs: string[] } {
  const t = title.replace(/\([^)]*\)|\[[^\]]*\]|（[^）]*）|【[^】]*】/g, " ");
  const toks = t.match(/[A-Za-zÇĞİÖŞÜçğıöşü][\wÇĞİÖŞÜçğıöşü\-+]*(?:\/\d+)?|\d+(?:[.,]\d+)?[A-Za-z]{0,3}(?:\/\d+)?/g) ?? [];
  const cats = categoryWordSet();
  const attrs: string[] = [];
  const isStop = (w: string) => {
    const f = foldTr(w);
    return TR_STOP.has(f) || MATERIAL_STOP.has(f) || ATTR.some((a) => foldTr(a.tr) === f) || cats.has(f);
  };
  const bi = toks.findIndex((w) => /^[A-Za-z]/.test(w) && /^[A-Za-z0-9\-+/]+$/.test(w) && w.length >= 2 && !isStop(w) && !isUnit(w) && !SERIES.has(foldTr(w)));
  const brand = bi >= 0 ? toks[bi]! : "";
  const models: string[] = [];
  let consecutive = 0;
  for (let i = bi + 1; i < toks.length && bi >= 0; i++) {
    const w = toks[i]!;
    const f = foldTr(w);
    if (isUnit(w)) {
      attrs.push(w);
      continue;
    }
    if (TR_LETTERS.test(w) || isStop(w)) {
      consecutive = 99;
      continue;
    }
    const codeLike = /\d/.test(w) || SERIES.has(f);
    if (consecutive < 2 || codeLike) {
      if (!models.includes(w) && models.length < 5) models.push(w);
      consecutive++;
    } else consecutive = 99;
  }
  if (bi < 0) for (const w of toks) if (isUnit(w)) attrs.push(w);
  return { brand, models, attrs: attrs.map((a) => a.replace(/\s+/g, "")) };
}

/** Chinese attribute words rendered in Turkish (gender is omitted when both 男 and 女 appear). */
const ZH_ATTR_TR: [string, string][] = [
  ["不锈钢", "Paslanmaz çelik"], ["无线", "Kablosuz"], ["蓝牙", "Bluetooth"], ["儿童", "Çocuk"], ["婴儿", "Bebek"], ["黑色", "Siyah"], ["白色", "Beyaz"], ["红色", "Kırmızı"], ["蓝色", "Mavi"],
  ["防水", "Su geçirmez"], ["便携", "Taşınabilir"], ["折叠", "Katlanır"], ["套装", "Set"], ["硅胶", "Silikon"], ["皮革", "Deri"], ["真皮", "Hakiki deri"], ["纯棉", "Pamuklu"], ["电动", "Elektrikli"], ["智能", "Akıllı"],
  ["充电式", "Şarjlı"], ["迷你", "Mini"], ["夏季", "Yazlık"], ["冬季", "Kışlık"], ["大码", "Büyük beden"], ["透明", "Şeffaf"], ["磁吸", "Manyetik"], ["快充", "Hızlı şarj"], ["全盔", "Kapalı"], ["半盔", "Yarım"], ["揭面", "Modüler"],
  ["碳纤维", "Karbon fiber"], ["铝合金", "Alüminyum"], ["木质", "Ahşap"], ["玻璃", "Cam"], ["加厚", "Kalın"], ["超薄", "İnce"], ["大容量", "Büyük kapasiteli"], ["户外", "Outdoor"], ["复古", "Retro"], ["运动", "Spor"],
];

/**
 * Chinese listing title → short Turkish query: brand/model tokens plus the category name found in
 * the title. With `attributes: true` material/feature words and units are rendered too
 * ("不锈钢保温杯500ml" → "Paslanmaz çelik Termos 500ml"); see renderTitleTr.
 */
export function translateTitleToTr(title: string, opts: { attributes?: boolean } = {}): string {
  const t = title.trim();
  if (!isCjk(t)) return t;
  const cleaned = stripZhMarketing(t);
  const latin = (cleaned.match(/[A-Za-z][A-Za-z0-9\-/]{1,}/g) ?? []).filter((w) => w.length >= 2 && !isUnit(w) && !/^(cm|mm|ml|kg|mah|usb|led|pcs)$/i.test(w) || /^[A-Z]{2,}/.test(w) && !isUnit(w)).slice(0, 3);
  const hit = categoryHit(cleaned);
  const cat = hit?.leaf ? hit.leaf.tr : hit?.term ? capFirst(hit.term.tr) : "";
  const catZh = hit?.leaf?.zh ?? hit?.term?.zh ?? "";
  const attrs: string[] = [];
  if (opts.attributes ?? false) {
    const hasMale = cleaned.includes("男");
    const hasFemale = cleaned.includes("女");
    const found: { pos: number; tr: string }[] = [];
    for (const [zh, tr] of ZH_ATTR_TR) {
      if (catZh.includes(zh)) continue;
      const pos = cleaned.indexOf(zh);
      if (pos >= 0) found.push({ pos, tr });
    }
    if (hasMale !== hasFemale) found.push({ pos: cleaned.indexOf(hasMale ? "男" : "女"), tr: hasMale ? "Erkek" : "Kadın" });
    found.sort((a, b) => a.pos - b.pos);
    for (const f of found) if (!attrs.includes(f.tr)) attrs.push(f.tr);
  }
  const units = (opts.attributes ?? false) ? [...new Set((cleaned.match(NUM_UNIT_RE) ?? []).map((n) => n.replace(/\s+/g, "")))] : [];
  const out = [...latin, ...attrs, cat, ...units].filter(Boolean).join(" ");
  return out || t;
}

/** Display rendering of a Chinese title in Turkish, with attributes and units ("Paslanmaz çelik Termos 500ml"). */
export function renderTitleTr(title: string): string {
  return translateTitleToTr(title, { attributes: true });
}

/** Last two to four characters of the final CJK run: Chinese head nouns sit at the end of a title. */
function zhHeadNoun(title: string): string {
  const runs = stripZhMarketing(title).match(/[㐀-鿿]+/g) ?? [];
  const last = runs[runs.length - 1] ?? "";
  if (!last) return "";
  return last.length <= 4 ? last : last.slice(-3);
}

/** Shorten a long listing title into a searchable query for the given market language. */
export function titleToQuery(title: string, language: QueryLanguage): string {
  const t = title.trim();
  if (language === "zh") {
    if (isCjk(t)) {
      // Keep brand/model tokens and the category; long titles return nothing on PDD.
      const latin = (stripZhMarketing(t).match(/[A-Za-z][A-Za-z0-9-]{1,}/g) ?? []).filter((w) => !isUnit(w)).slice(0, 2);
      const cat = categoryIn(t, "zh") || zhHeadNoun(t);
      return [...latin, cat].filter(Boolean).join(" ");
    }
    return translateQueryToZh(t);
  }
  if (language === "tr") return translateTitleToTr(title, { attributes: false });
  if (isCjk(t)) {
    const { brand, models } = brandModel(t);
    const cat = categoryIn(t, language);
    return [brand, ...models, cat].filter(Boolean).join(" ") || t;
  }
  return queryLadder(t, language)[0] ?? t;
}

/** Accessory noun named by a (latin/Turkish) title, with its translations; null when the title is the product itself. */
export function accessoryNoun(title: string): Term | null {
  const cleaned = title.replace(/\([^)]*\)|\[[^\]]*\]|（[^）]*）|【[^】]*】/g, " ");
  const terms = accessoryTerms(cleaned);
  if (!terms.length) return null;
  const hit = categoryHit(cleaned);
  const catTr = hit?.leaf ? foldTr(hit.leaf.tr) : hit?.term ? foldTr(hit.term.tr) : "";
  for (const noun of [...ACCESSORY_NOUNS].sort((a, b) => b.tr.length - a.tr.length)) {
    const fn = foldTr(noun.tr);
    const fe = noun.en.toLowerCase();
    const found = terms.some((x) => x === fn || x === fe || x.startsWith(fn) || fn.startsWith(x) && x.length >= 4 || (noun.zh && x.includes(noun.zh)));
    if (!found) continue;
    // The recognised category already is the accessory ("Telefon Kılıfı", "Kask Vizörü"): nothing to append.
    if (catTr && (catTr.includes(fn) || fn.includes(catTr))) return null;
    return noun;
  }
  return null;
}

/**
 * Query ladder for a listing title: most specific first, broadest (category only) last.
 * Chinese markets get Chinese category names (latin brand/model tokens kept), Turkish markets Turkish,
 * every other market its native glossary term with English rungs after it.
 */
export function queryLadder(title: string, language: QueryLanguage): string[] {
  const t = title.trim();
  if (!t) return [];
  const isZhTitle = isCjk(t);
  const { brand, models, attrs } = brandModel(t);
  const latin = [brand, ...models].filter(Boolean).join(" ");
  const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean))];

  if (language === "zh") {
    if (isZhTitle) {
      const specific = titleToQuery(t, "zh");
      const cat = categoryIn(t, "zh");
      const brandCat = brand && cat ? `${brand} ${cat}` : "";
      return uniq([specific, brandCat, cat]);
    }
    const acc = accessoryNoun(t);
    const cat = categoryIn(t, "zh");
    const suffix = acc ? ` ${acc.zh}` : "";
    if (!cat) {
      const q = translateQueryToZh(t);
      return uniq([latin ? `${latin}${suffix}` : "", q !== t && isCjk(q) ? q : "", ...(acc ? [acc.zh] : [])]);
    }
    const specific = [latin, cat, ...attrs].filter(Boolean).join(" ") + suffix;
    const brandCat = brand ? `${brand} ${cat}${suffix}` : "";
    return uniq([specific, brandCat, `${cat}${suffix}`]);
  }

  if (language === "tr") {
    if (isZhTitle) {
      const specific = translateTitleToTr(t, { attributes: false });
      const cat = categoryIn(t, "tr");
      const brandCat = brand && cat ? `${brand} ${cat}` : "";
      return uniq([specific, brandCat, cat]);
    }
    const acc = accessoryNoun(t);
    const cat = categoryIn(t, "tr");
    const suffix = acc ? ` ${capFirst(acc.tr)}` : "";
    const specific = [latin, cat].filter(Boolean).join(" ") + suffix;
    const brandCat = brand && cat ? `${brand} ${cat}${suffix}` : "";
    return uniq([specific, brandCat, cat ? `${cat}${suffix}` : "", t.length <= 40 ? t : ""]);
  }

  // English and native-glossary markets.
  if (isZhTitle) {
    const cat = categoryIn(t, language);
    const catEn = categoryIn(t, "en");
    return uniq([latin, latin && cat ? `${latin} ${cat}` : "", cat, latin && catEn ? `${latin} ${catEn}` : "", catEn]);
  }
  const acc = accessoryNoun(t);
  const build = (lang: QueryLanguage) => {
    const cat = categoryIn(t, lang);
    const accName = acc ? termName(acc, lang) : "";
    const suffix = accName ? ` ${accName}` : "";
    const specific = [latin, cat, ...attrs].filter(Boolean).join(" ") + suffix;
    const brandCat = brand && cat ? `${brand} ${cat}${suffix}` : "";
    return [specific, brandCat, cat ? `${cat}${suffix}` : ""];
  };
  const native = build(language);
  const english = language === "en" ? [] : build("en");
  return uniq([...native, ...english, latin]);
}
