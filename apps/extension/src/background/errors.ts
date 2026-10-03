import type { AdapterErrorType } from "@manufactogate/core";

/**
 * All user-facing strings of the background worker, in one place for review.
 * Chrome's English internals are translated before they reach the Turkish UI.
 */
export const TR = {
  noAdapter: "Bu pazar için adapter yok",
  tabOpenFailed: "Pazar sekmesi açılamadı",
  tabClosed: "Pazar sekmesi kapatıldı",
  pageLoad: "Sayfa yüklenemedi (ağ hatası ya da erişim engeli)",
  noPermission: (host: string) => `Bu alan adı için izin yok: ${host}`,
  disconnected: "Eklenti bağlantısı koptu; sayfayı yenile",
  busy: "Tarayıcı meşgul, tekrar deneniyor",
  unexpected: (m: string) => `Beklenmeyen hata: ${m}`,
  cancelled: "İstek iptal edildi",
  queueFull: (name: string) => `${name} için sıra çok uzun; istek beklemeden sonlandırıldı. Eşzamanlı sekme sayısını artırabilir ya da daha az pazar seçebilirsin.`,
  hourlyCap: (name: string, n: number, max: number, left: string) => `${name} için saatlik sınır doldu (${n}/${max}); ${left} sonra tekrar dene`,
  cooldownCaptcha: (name: string, left: string) => `${name} doğrulama bekliyor; ${left} sonra yeniden denenecek. Açık sekmede doğrulamayı tamamlayınca eklenti menüsünden “şimdi dene” ile hemen sürdürebilirsin.`,
  cooldownLoggedOut: (name: string, left: string) => `${name} için giriş gerekiyor; açık sekmede giriş yap. ${left} sonra yeniden denenecek.`,
  cooldownNetwork: (name: string, left: string) => `${name} art arda ulaşılamadı; ${left} sonra yeniden denenecek`,
  searchBoxMissing: "Arama kutusu bulunamadı; adres çubuğundan arama denendi",
  searchNotNavigated: "Arama kutusu sonuç sayfasına götürmedi; adres çubuğundan arama denendi",
  imageInputMissing: "Bu sayfada görselle arama girişi bulunamadı; başlıkla aramaya geçiliyor",
  imageNoReaction: "Görsel yüklendi ama sayfa tepki vermedi; başlıkla aramaya geçiliyor",
  injectFailed: "Sayfaya okuma betiği eklenemedi",
  unknownRequest: "Bilinmeyen istek",
  versionMismatch: "Eklenti güncellendi; sayfayı yenile",
  healthRunning: "Sağlık kontrolü zaten çalışıyor",
  captchaNotification: (name: string) => `${name} doğrulama istiyor. Sekmeye geçip doğrulamayı tamamla; arama kaldığı yerden sürer.`,
  loginNotification: (name: string) => `${name} için giriş gerekiyor. Arka planda açık sekmede giriş yapınca aramalar sürer.`,
} as const;

/** Translates Chrome's English runtime errors into a typed, Turkish failure. */
export function translateChromeError(msg: string): { type: AdapterErrorType; text: string } {
  const m = msg.trim();
  if (/showing error page|chrome-error:|net::ERR|ERR_[A-Z_]+|Sayfa yüklenemedi/i.test(m)) return { type: "Network", text: TR.pageLoad };
  if (/No tab with id|tab was closed|Tab was closed|sekme kapandı|Frame with ID \d+ was removed|No frame with id/i.test(m)) return { type: "Network", text: TR.tabClosed };
  if (/Cannot access contents of (?:the page|url)|must request permission|Cannot access a chrome|Cannot access/i.test(m)) {
    const host = /"?(?:https?:\/\/)([^/"\s]+)/.exec(m)?.[1];
    return { type: "Network", text: host ? TR.noPermission(host) : TR.noPermission("?") };
  }
  if (/disconnected port|context invalidated|Receiving end does not exist|message port closed/i.test(m)) return { type: "Network", text: TR.disconnected };
  if (/Tabs cannot be edited right now|user may be dragging a tab/i.test(m)) return { type: "RateLimited", text: TR.busy };
  if (/cancel|iptal/i.test(m)) return { type: "Network", text: TR.cancelled };
  const short = m.replace(/\s+/g, " ").slice(0, 120);
  return { type: "Network", text: TR.unexpected(short || "?") };
}
