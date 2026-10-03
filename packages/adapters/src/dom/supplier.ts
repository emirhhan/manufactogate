/**
 * Cross-store supplier identity seed. The same company sells on 1688, Alibaba.com, AliExpress and
 * Taobao under names that differ only in legal suffix, punctuation, case or script spacing:
 * "深圳市示例电子有限公司" / "Shenzhen Shili Electronics Co., Ltd." / "SHENZHEN SHILI ELECTRONICS".
 * `supplierKey` folds a name to its distinctive core and prefixes the country, so the web's
 * clustering can group stores before any profile page is fetched. Pure, no DOM.
 */
import { normalizeSpaces } from "./text";

/** Chinese legal forms and generic business words, longest first so "有限责任公司" wins over "公司". */
const CJK_SUFFIX = /股份有限公司|有限责任公司|有限公司|股份公司|集团公司|分公司|公司|集团|股份|商贸|贸易|实业|科技|工贸|进出口|电子商务|商行|经营部|工作室|旗舰店|专营店|专卖店|直营店|自营店|官方店|官方|店铺|店/gu;

/** Latin / Turkish legal forms and generic business words, matched on the folded (lower-case, ASCII) name. */
const LATIN_WORDS = /(?<![\p{L}\p{N}])(?:co|company|ltd|limited|inc|incorporated|llc|corp|corporation|gmbh|sa|srl|bv|plc|pty|pvt|private|as|sti|san|sanayi|tic|ticaret|ve|dis|trading|trade|traders|import|imports|export|exports|industrial|industries|industry|technology|technologies|tech|international|intl|enterprise|enterprises|group|holding|holdings|store|stores|shop|official|resmi|magaza|magazasi|the|and)(?![\p{L}\p{N}])/gu;

/** Lower-case with diacritics stripped (Turkish İ/ı aware); spaces and punctuation are kept. */
function foldLetters(s: string): string {
  return normalizeSpaces(s)
    .replace(/İ/g, "i")
    .replace(/I/g, "ı")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/ß/g, "ss");
}

/** Lower-case, diacritics stripped (Turkish İ/ı aware), punctuation and spaces removed. */
export function foldName(name: string): string {
  return foldLetters(name).replace(/[^\p{L}\p{N}]+/gu, "");
}

export interface SupplierKeyInput {
  /** Company / shop name as the market shows it. */
  name?: string | null | undefined;
  /** ISO alpha-2 country of the supplier (the market's country when the card has no better evidence). */
  country?: string | null | undefined;
}

/**
 * "cn:深圳市示例电子" for "深圳市示例电子有限公司", "cn:shenzhenshilielectronics" for
 * "Shenzhen Shili Electronics Co., Ltd."; null when nothing distinctive is left of the name.
 */
export function supplierKey(input: SupplierKeyInput): string | null {
  const raw = normalizeSpaces(input.name ?? "").trim();
  if (!raw) return null;
  let core = foldLetters(raw.replace(CJK_SUFFIX, " "));
  // Dotted abbreviations fuse ("a.ş." → "as", "l.l.c." → "llc", "co., ltd." → "co, ltd").
  core = core.replace(/(?<=\p{L})\.(?=\p{L}|\s|$)/gu, "");
  core = core.replace(/[.,'’&()/\\-]+/g, " ");
  core = core.replace(LATIN_WORDS, " ");
  let folded = foldName(core);
  if (!folded) folded = foldName(raw);
  if (!folded) return null;
  const country = (input.country ?? "").trim().toLowerCase();
  return /^[a-z]{2}$/.test(country) ? `${country}:${folded}` : folded;
}
