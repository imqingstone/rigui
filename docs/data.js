// 日晷：所有數值與文字。規則在 engine.js。
const RG_DATA = {
  // 十二時辰，依序從子時開始。值班的官依「子午流注」的傳統說法；官名與原文出自《素問・靈蘭秘典論》。
  HOURS: [
    { id: '子', time: '23–1', organ: '膽', title: '中正之官', line: '膽者，中正之官，決斷出焉。', suit: '夜半為冬，古人認為此時宜安睡' },
    { id: '丑', time: '1–3', organ: '肝', title: '將軍之官', line: '肝者，將軍之官，謀慮出焉。', suit: '夜最深的時候，傳統的說法是宜熟睡' },
    { id: '寅', time: '3–5', organ: '肺', title: '相傅之官', line: '肺者，相傅之官，治節出焉。', suit: '天還沒亮，傳統的說法是宜續睡' },
    { id: '卯', time: '5–7', organ: '大腸', title: '傳道之官', line: '大腸者，傳道之官，變化出焉。', suit: '「平旦人氣生」，天亮時起身活動',
      bySeason: { autumn: '秋天「早臥早起」，天一亮就起身', winter: '冬天「早臥晚起，必待日光」，這時天還沒亮，古人認為宜繼續睡' } },
    { id: '辰', time: '7–9', organ: '胃', title: '倉廩之官', line: '脾胃者，倉廩之官，五味出焉。', suit: '胃當值，傳統的說法是宜進早膳' },
    { id: '巳', time: '9–11', organ: '脾', title: '倉廩之官', line: '脾胃者，倉廩之官，五味出焉。', suit: '上午精神清明，古人常在此時讀書做事' },
    { id: '午', time: '11–13', organ: '心', title: '君主之官', line: '心者，君主之官也，神明出焉。', suit: '「日中而陽氣隆」，宜午膳，古人也有午休的習慣' },
    { id: '未', time: '13–15', organ: '小腸', title: '受盛之官', line: '小腸者，受盛之官，化物出焉。', suit: '飯後從容做事、喝茶聊天' },
    { id: '申', time: '15–17', organ: '膀胱', title: '州都之官', line: '膀胱者，州都之官，津液藏焉，氣化則能出矣。', suit: '下午宜讀書、勞作' },
    { id: '酉', time: '17–19', organ: '腎', title: '作強之官', line: '腎者，作強之官，伎巧出焉。', suit: '「日入為秋」，宜晚膳，開始收心' },
    { id: '戌', time: '19–21', organ: '膻中', title: '臣使之官', line: '膻中者，臣使之官，喜樂出焉。', suit: '一天告一段落，古人此時在家歇息，與家人閒話家常' },
    { id: '亥', time: '21–23', organ: '三焦', title: '決瀆之官', line: '三焦者，決瀆之官，水道出焉。', suit: '一天將盡，宜收拾準備就寢',
      bySeason: { spring: '春天「夜臥早起」，晚一點睡無妨', summer: '夏天「夜臥早起」，晚一點睡無妨' } }
  ],
  NIGHT: ['亥', '子', '丑', '寅'],

  // 空著（休息）時每個時辰的分數
  REST: { 子: 3, 丑: 3, 寅: 3, 卯: 1, 辰: 1, 巳: 1, 午: 2, 未: 1, 申: 1, 酉: 1, 戌: 1, 亥: 2 },
  POINTS: { good: 3, neutral: 1, bad: 0 },

  // 四季作息（《素問・四氣調神大論》）
  //   rest：覆蓋休息的分數；awakeOk：這些時辰還醒著不扣分；mustSleep：這些時辰該睡了，除了適合的行程都算不合；
  //   sleepIn：這些時辰繼續睡最好，放了行程最多只算中性。
  SEASONS: {
    spring: { name: '春', rule: '夜臥早起', quote: '夜臥早起，廣步於庭。', rest: { 亥: 2, 卯: 0 }, awakeOk: ['亥'], mustSleep: [], sleepIn: [],
      note: '春天「夜臥早起」：亥時還醒著不要緊，卯時就該起身。',
      notes: { 亥: '春天「夜臥早起」，亥時還醒著不要緊。', 卯: '春天「夜臥早起」，卯時就該起身了。' } },
    summer: { name: '夏', rule: '夜臥早起', quote: '夜臥早起，無厭於日。', rest: { 亥: 2, 卯: 0 }, awakeOk: ['亥'], mustSleep: [], sleepIn: [],
      note: '夏天「夜臥早起」：亥時還醒著不要緊，卯時就該起身。',
      notes: { 亥: '夏天「夜臥早起」，亥時還醒著不要緊。', 卯: '夏天「夜臥早起」，卯時就該起身了。' } },
    autumn: { name: '秋', rule: '早臥早起', quote: '早臥早起。', rest: { 亥: 3, 卯: 1 }, awakeOk: [], mustSleep: ['亥'], sleepIn: [],
      note: '秋天「早臥早起」：亥時就該就寢。',
      notes: { 亥: '秋天「早臥早起」，亥時就該就寢。', 卯: '秋天「早臥早起」，卯時起身。' } },
    winter: { name: '冬', rule: '早臥晚起，必待日光', quote: '早臥晚起，必待日光。', rest: { 亥: 3, 卯: 3 }, awakeOk: [], mustSleep: ['亥'], sleepIn: ['卯'],
      note: '冬天「早臥晚起，必待日光」：亥時就該就寢，卯時天還沒亮，繼續睡更好。',
      notes: { 亥: '冬天「早臥晚起」，亥時就該就寢。', 卯: '冬天「早臥晚起，必待日光」，卯時天還沒亮，繼續睡更好。' } }
  },

  // 行程卡。good：適合的時辰；bad：不適合的時辰；其餘為中性。only：專屬某位旅人。
  CARDS: {
    // asRest：睡覺至少跟空著休息一樣好，分數取兩者較高的
    sleep: { name: '安睡', desc: '躺下好好睡一覺。', good: ['子', '丑', '寅'], bad: ['卯', '辰', '巳', '未', '申', '酉'], asRest: true },
    walk: { name: '起身散步', desc: '天一亮就起來，在庭院走走。', good: ['卯'], bad: ['子', '丑'] },
    breakfast: { name: '早膳', desc: '一碗粥、一顆饅頭、一杯豆漿。', good: ['辰'], bad: ['子', '丑', '亥'] },
    study: { name: '讀書', desc: '攤開書卷，讀上一個時辰。', good: ['巳', '申'], bad: ['子', '丑'] },
    work: { name: '勞動', desc: '劈柴、挑水、整理行囊。', good: ['巳', '未', '申'], bad: ['子', '丑', '亥'] },
    lunch: { name: '午膳', desc: '一碗飯、兩樣青菜、一碗豆腐湯。', good: ['午', '未'], bad: ['子', '丑'] },
    nap: { name: '小憩', desc: '靠在椅子上閉眼歇一會兒。', good: ['午'], bad: ['丑', '寅', '亥'] },
    tea: { name: '喝茶聊天', desc: '泡一壺茶，和驛站的人說說話。', good: ['未', '戌'], bad: ['子', '丑'] },
    dinner: { name: '晚膳', desc: '一碗麵、一盤炒青菜。', good: ['酉'], bad: ['子', '丑'] },
    bath: { name: '泡腳沐浴', desc: '燒一盆熱水，洗去一天的風塵。', good: ['酉', '戌'], bad: ['午'] },
    sit: { name: '靜坐', desc: '找個安靜的角落，閉目調息。', good: ['卯', '戌', '亥'], bad: [] },
    bedtime: { name: '收拾就寢', desc: '整理好明天的行囊，熄燈上床。', good: ['亥'], bad: ['卯', '辰', '巳', '午', '未', '申', '酉'] },
    travel: { name: '趕路', desc: '背起行囊，往下一個驛站走。', good: ['辰', '巳', '未', '申'], bad: ['子', '丑', '亥'], only: 'merchant' },
    farm: { name: '下田', desc: '趁著天涼下田幹活。', good: ['卯', '辰'], bad: ['子', '丑'], only: 'farmer' },
    paint: { name: '作畫', desc: '鋪紙研墨，畫一幅山水。', good: ['巳', '申'], bad: ['子', '丑'], only: 'painter' }
  },

  // 旅人。need：特殊需求（引擎依 type 判斷）；沒達成時拿不到最高評等。
  TRAVELERS: {
    scholar: { name: '書生', line: '要趕考了，今天想多讀點書。', bio: '寒窗苦讀的年輕人，正要上京趕考。行囊裡除了兩件換洗衣服，全是書。', need: { type: 'count', card: 'study', hours: ['卯', '辰', '巳', '午', '未', '申', '酉'], min: 2, text: '白天讀書至少兩個時辰' } },
    merchant: { name: '商人', line: '貨要準時送到，得連趕兩個時辰的路。', bio: '往來各地做買賣的商人，最在意的是貨要準時送到。', need: { type: 'consecutive', card: 'travel', min: 2, text: '連續兩個時辰趕路' } },
    farmer: { name: '農夫', line: '田裡的秧苗等著我，一早就得下田。', bio: '住在驛站附近的鄰居，天一亮就帶著鋤頭下田。', need: { type: 'at', card: 'farm', hours: ['卯', '辰'], text: '卯時或辰時下田' } },
    painter: { name: '畫師', line: '想找一個安靜的時辰，好好畫一幅畫。', bio: '四處寫生的畫師，走到哪裡畫到哪裡，最怕被人打擾。', need: { type: 'at', card: 'paint', hours: ['巳', '申'], text: '巳時或申時作畫' } },
    elder: { name: '老者', line: '年紀大了，天一黑就想睡。', bio: '在驛站住了很多年的老人家，早睡早起，常跟旅人說起從前的事。', need: { type: 'at', card: 'bedtime', hours: ['亥'], text: '亥時收拾就寢' } },
    wanderer: { name: '青石旅人', line: '沒什麼要緊事，只想順著時辰過一天。', bio: '驛站的主人，也是說故事的人。沒有什麼特別的心願，只想順著時辰過一天。', need: null }
  },

  // 評等（由高到低）
  RANKS: [
    { min: 32, name: '日正當中' },
    { min: 26, name: '晴' },
    { min: 18, name: '多雲' },
    { min: -999, name: '陰' }
  ],
  // 分享與結果用的符號：分數 → 符號
  ICONS: { 3: '☀', 2: '🌤', 1: '☁', 0: '🌧', moon: '🌙' }, // 夜裡休息拿滿分用月亮

  // 節氣所屬的季節（terms.js 的節氣名稱）
  TERM_SEASON: {
    立春: 'spring', 雨水: 'spring', 驚蟄: 'spring', 春分: 'spring', 清明: 'spring', 穀雨: 'spring',
    立夏: 'summer', 小滿: 'summer', 芒種: 'summer', 夏至: 'summer', 小暑: 'summer', 大暑: 'summer',
    立秋: 'autumn', 處暑: 'autumn', 白露: 'autumn', 秋分: 'autumn', 寒露: 'autumn', 霜降: 'autumn',
    立冬: 'winter', 小雪: 'winter', 大雪: 'winter', 冬至: 'winter', 小寒: 'winter', 大寒: 'winter'
  },

  // 每日題目
  DAILY: {
    travelers: ['scholar', 'merchant', 'farmer', 'painter', 'elder', 'wanderer'], // 每六天輪一遍，順序依亂數打散
    needCards: { scholar: ['study', 'study'], merchant: ['travel', 'travel'], farmer: ['farm'], painter: ['paint'], elder: ['bedtime'], wanderer: [] },
    pool: ['sleep', 'walk', 'breakfast', 'study', 'work', 'lunch', 'nap', 'tea', 'dinner', 'bath', 'sit', 'bedtime'],
    size: [6, 8],      // 每題的行程張數
    tries: 80          // 出題時最多試幾次，找到能拿最高評等的組合
  },
  SITE: 'imqingstone.github.io/rigui/',

  // 節氣圖鑑：三候依傳統的七十二候，介紹為原創
  HOU_SOURCE: '三候依傳統的「七十二候」，最早見於《逸周書・時訓解》，各版本用字略有不同。',
  TERM_INFO: {
    立春: { hou: ['東風解凍', '蟄蟲始振', '魚陟負冰'], intro: '一年節氣的開頭，春天從這天開始。' },
    雨水: { hou: ['獺祭魚', '候雁北', '草木萌動'], intro: '天氣回暖，降雪漸少，雨水慢慢多了起來。' },
    驚蟄: { hou: ['桃始華', '倉庚鳴', '鷹化為鳩'], intro: '春雷響起，古人說冬眠的蟲被雷聲驚醒了。' },
    春分: { hou: ['玄鳥至', '雷乃發聲', '始電'], intro: '晝夜一樣長，春天過了一半。' },
    清明: { hou: ['桐始華', '田鼠化為鴽', '虹始見'], intro: '天清地明，草木青翠，也是掃墓踏青的時節。' },
    穀雨: { hou: ['萍始生', '鳴鳩拂其羽', '戴勝降于桑'], intro: '雨水滋潤穀物，是春天最後一個節氣。' },
    立夏: { hou: ['螻蟈鳴', '蚯蚓出', '王瓜生'], intro: '夏天開始，萬物長得越來越茂盛。' },
    小滿: { hou: ['苦菜秀', '靡草死', '麥秋至'], intro: '麥類的穀粒開始飽滿，但還沒有全熟。' },
    芒種: { hou: ['螳螂生', '鵙始鳴', '反舌無聲'], intro: '有芒的穀物成熟了，正忙著收割與插秧。' },
    夏至: { hou: ['鹿角解', '蜩始鳴', '半夏生'], intro: '白天最長、夜晚最短的一天。' },
    小暑: { hou: ['溫風至', '蟋蟀居壁', '鷹始摯'], intro: '天氣開始炎熱，但還不是最熱的時候。' },
    大暑: { hou: ['腐草為螢', '土潤溽暑', '大雨時行'], intro: '一年中最炎熱的時節。' },
    立秋: { hou: ['涼風至', '白露降', '寒蟬鳴'], intro: '秋天開始，暑氣漸漸退去。' },
    處暑: { hou: ['鷹乃祭鳥', '天地始肅', '禾乃登'], intro: '「處」是停止的意思，暑氣到這時告一段落。' },
    白露: { hou: ['鴻雁來', '玄鳥歸', '群鳥養羞'], intro: '夜裡轉涼，清晨的草葉上凝著白色的露水。' },
    秋分: { hou: ['雷始收聲', '蟄蟲坏戶', '水始涸'], intro: '晝夜再度一樣長，秋天過了一半。' },
    寒露: { hou: ['鴻雁來賓', '雀入大水為蛤', '菊有黃華'], intro: '露水更冷，快要凝結成霜。' },
    霜降: { hou: ['豺乃祭獸', '草木黃落', '蟄蟲咸俯'], intro: '天氣漸冷，開始降霜，是秋天最後一個節氣。' },
    立冬: { hou: ['水始冰', '地始凍', '雉入大水為蜃'], intro: '冬天開始，萬物收藏。' },
    小雪: { hou: ['虹藏不見', '天氣上騰地氣下降', '閉塞而成冬'], intro: '開始下雪，但雪量還不大。' },
    大雪: { hou: ['鶡鴠不鳴', '虎始交', '荔挺出'], intro: '雪下得更大，地面積起雪來。' },
    冬至: { hou: ['蚯蚓結', '麋角解', '水泉動'], intro: '白天最短、夜晚最長的一天，古人很重視這一天。' },
    小寒: { hou: ['雁北鄉', '鵲始巢', '雉始雊'], intro: '天氣寒冷，但還沒冷到極點。' },
    大寒: { hou: ['雞始乳', '征鳥厲疾', '水澤腹堅'], intro: '一年中最冷的時節，也是最後一個節氣。' }
  },

  // 驛站庭院：連續天數最高紀錄達到 at 時長出來；中斷不清空，只是停止成長
  GARDEN: [
    { at: 1, id: 'dial', name: '日晷' },
    { at: 2, id: 'bench', name: '石凳' },
    { at: 3, id: 'lamp', name: '燈籠' },
    { at: 5, id: 'sapling', name: '小樹' },
    { at: 7, id: 'flowers', name: '花圃' },
    { at: 10, id: 'tree', name: '大樹' },
    { at: 14, id: 'fence', name: '竹籬' },
    { at: 21, id: 'pavilion', name: '涼亭' },
    { at: 30, id: 'moon', name: '滿月' }
  ],

  // 里程碑 1：固定一題（保留給測試）
  FIXED: { date: '2026-11-07', term: '立冬', season: 'winter', traveler: 'scholar',
    cards: ['breakfast', 'study', 'study', 'lunch', 'tea', 'dinner', 'bath'] },

  TEXT: {
    title: '日晷',
    subtitle: '替旅人排一天',
    disclaimer: '本遊戲是古代經典的文化介紹，不構成任何醫療或健康建議。',
    lineSource: '官名與原文出自《黃帝內經・素問・靈蘭秘典論》；時辰與經絡的對應，是後世依《內經》發展出來的「子午流注」說法。'
  }
};

if (typeof module !== 'undefined') module.exports = RG_DATA;
