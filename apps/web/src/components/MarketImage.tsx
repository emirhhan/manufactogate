import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { placeholder } from "@/lib/catalog";
import { imageToDataUrl } from "@/lib/images";

/** Market image that falls back to fetching through the extension when the CDN blocks hotlinking. */
export function MarketImage({ src, label = "", ...rest }: ImgHTMLAttributes<HTMLImageElement> & { src: string | undefined; label?: string }) {
  const [url, setUrl] = useState<string>(src ?? placeholder(label));
  const [stage, setStage] = useState<"direct" | "proxied" | "placeholder">("direct");
  useEffect(() => {
    setUrl(src ?? placeholder(label));
    setStage("direct");
  }, [src, label]);
  return (
    <img
      {...rest}
      src={url}
      alt={rest.alt ?? ""}
      referrerPolicy="no-referrer"
      onError={() => {
        if (stage === "direct" && src && /^https?:/.test(src)) {
          setStage("proxied");
          void imageToDataUrl(src).then((d) => {
            if (d) setUrl(d);
            else {
              setStage("placeholder");
              setUrl(placeholder(label));
            }
          });
        } else if (stage !== "placeholder") {
          setStage("placeholder");
          setUrl(placeholder(label));
        }
      }}
    />
  );
}
