'use client';

import { sanitizeAiHtml, wrapHtmlForThumbnail } from '@/lib/iframe-utils';

interface HtmlThumbProps {
  htmlCode: string;
  scale: number;
  title?: string;
  className?: string;
}

export function HtmlThumb({
  htmlCode,
  scale,
  title = 'HTML 分镜缩略预览',
  className = '',
}: HtmlThumbProps) {
  const srcDoc = wrapHtmlForThumbnail(sanitizeAiHtml(htmlCode));

  return (
    <div className={`relative h-full w-full overflow-hidden bg-slate-100 ${className}`}>
      <div
        className="absolute left-0 top-1/2"
        style={{
          width: '1280px',
          height: '720px',
          transform: `translateY(-50%) scale(${scale})`,
          transformOrigin: 'left center',
        }}
      >
        <iframe
          title={title}
          srcDoc={srcDoc}
          sandbox=""
          loading="lazy"
          scrolling="no"
          className="pointer-events-none block h-full w-full border-0 bg-transparent"
        />
      </div>
    </div>
  );
}
