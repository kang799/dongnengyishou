// Auto-resolved beast icon URLs (Vite glob import)
const ICONS = import.meta.glob("../assets/beasts/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const SLUG: Record<string, string> = {
  "饕餮":"taotie","穷奇":"qiongqi","梼杌":"taowu","混沌":"hundun","烛龙":"zhulong",
  "毕方":"bifang","九尾狐":"jiuweihu","应龙":"yinglong","重明":"chongming","鲲":"kun",
  "鹏":"peng","白泽":"baize","麒麟":"qilin","化蛇":"huashe","马腹":"mafu",
  "陆吾":"luwu","英招":"yingzhao","钦原":"qinyuan","蛊雕":"gudiao","凤凰":"fenghuang",
  "朱雀":"zhuque","玄武":"xuanwu","青龙":"qinglong","驺虞":"zouyu","犼":"hou",
  "睚眦":"yazi","狻猊":"suanni","貔貅":"pixiu","狴犴":"bian","蒲牢":"pulao",
  "嘲风":"chaofeng","椒图":"jiaotu","负屃":"fuxi","螭吻":"chiwen","赑屃":"bixi",
  "囚牛":"qiuniu","刑天":"xingtian","夸父":"kuafu","精卫":"jingwei","相柳":"xiangliu",
  "肥遗":"feiyi","当康":"dangkang","乘黄":"chenghuang","并封":"bingfeng","开明兽":"kaimingshou",
  "三足乌":"sanzuwu","太岁":"taisui","旱魃":"hanba","奚仲":"xizhong",
  "讙":"huan","彘":"zhi","鸓":"lei","䮝":"tao","狰":"zheng","蛫":"gui",
  "耳鼠":"ershu","朱厌":"zhuyan","狡":"jiao","㹈":"xian","蜚":"fei","鸩":"zhen",
};

function urlFor(slug: string): string | null {
  for (const [path, url] of Object.entries(ICONS)) {
    if (path.endsWith(`/${slug}.png`)) return url;
  }
  return null;
}

export function getBeastIcon(species: string | null | undefined): string | null {
  if (!species) return null;
  const slug = SLUG[species];
  if (!slug) return null;
  return urlFor(slug);
}