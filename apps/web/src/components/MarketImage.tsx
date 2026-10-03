import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";
import { placeholder } from "@/lib/catalog";
import { cachedImageToDataUrl } from "@/lib/images";

/**
 * Market image with a hotlink-safe fallback: when the CDN rejects the direct load, the image is
 * fetched through the extension (cached, rate-limited) but only once the element is near the viewport,
 * so a grid of 300 cards does not fire 300 extension round-trips at once.
 */
export function MarketImage({
  src,
  label = "",
  eager = false,
  ...rest
}: ImgHTMLAttributes<HTMLImageElement> & {
  src: string | undefined;
  label?: string;
  eager?: boolean;
}) {
  const [url, setUrl] = useState<string>(src ?? placeholder(label));
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(eager);
  const stage = useRef<"direct" | "proxied" | "placeholder">("direct");
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setUrl(src ?? placeholder(label));
    setFailed(false);
    stage.current = "direct";
  }, [src, label]);

  useEffect(() => {
    if (visible) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "240px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!failed || !visible || !src || stage.current !== "direct" || !/^https?:/.test(src)) return;
    stage.current = "proxied";
    let alive = true;
    void cachedImageToDataUrl(src).then((d) => {
      if (!alive) return;
      if (d) setUrl(d);
      else {
        stage.current = "placeholder";
        setUrl(placeholder(label));
      }
    });
    return () => {
      alive = false;
    };
  }, [failed, visible, src, label]);

  const onFail = () => {
    if (stage.current === "direct" && src && /^https?:/.test(src)) {
      // Show the placeholder while the proxied copy is on its way (or queued behind other images).
      setUrl(placeholder(label));
      setFailed(true);
    } else if (stage.current !== "placeholder") {
      stage.current = "placeholder";
      setUrl(placeholder(label));
    }
  };

  return (
    <img
      ref={ref}
      {...rest}
      src={url}
      alt={rest.alt ?? ""}
      referrerPolicy="no-referrer"
      onLoad={(e) => {
        // A CDN that refuses a hotlink often answers with a 1×1 pixel instead of an error.
        const img = e.currentTarget;
        if (img.naturalWidth > 0 && img.naturalWidth < 8 && img.naturalHeight < 8) onFail();
        rest.onLoad?.(e);
      }}
      onError={onFail}
    />
  );
}
