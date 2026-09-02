import { EmailBlock, EmailSettings, EmailTemplateData, getColumnsList } from "./types";

export function compileToEmailHtml(data: {
  blocks: EmailBlock[];
  settings: EmailSettings;
  subject?: string;
}): string {
  const { blocks, settings, subject = "" } = data;

  const font = settings.defaultFont || "Inter, Arial, sans-serif";
  const outerBg = settings.outerBgColor || "#f1f5f9";
  const innerBg = settings.containerBgColor || "#ffffff";
  const maxWidth = settings.containerWidth || 600;
  const radius = settings.borderRadius || 0;
  const shadow = settings.containerShadow
    ? "box-shadow: 0 4px 12px rgba(0,0,0,0.06);"
    : "";

  let blocksHtml = "";

  for (const block of blocks) {
    switch (block.type) {
      case "header": {
        const align = block.align || "center";
        const textAlign = align === "center" ? "center" : align === "right" ? "right" : "left";
        blocksHtml += `
        <tr>
          <td style="padding: ${block.paddingY || 16}px 24px; text-align: ${textAlign};">
            ${
              block.logoUrl
                ? `<img src="${block.logoUrl}" alt="${block.brandName || "Logo"}" height="${block.logoHeight || 36}" style="height: ${block.logoHeight || 36}px; max-width: 240px; display: inline-block; vertical-align: middle; border: 0;" />`
                : ""
            }
            ${
              block.brandName
                ? `<div style="font-family: ${font}; font-size: 18px; font-weight: 700; color: ${settings.textColor}; margin-top: ${block.logoUrl ? "8px" : "0"};">${block.brandName}</div>`
                : ""
            }
            ${
              block.tagline
                ? `<div style="font-family: ${font}; font-size: 12px; color: #64748b; margin-top: 2px;">${block.tagline}</div>`
                : ""
            }
          </td>
        </tr>`;
        break;
      }

      case "heading": {
        const align = block.align || "left";
        const size = block.fontSize || (block.level === "h1" ? 24 : block.level === "h2" ? 20 : 16);
        const weight = block.fontWeight === "bold" ? 700 : block.fontWeight === "800" ? 800 : 600;
        blocksHtml += `
        <tr>
          <td style="padding: ${block.paddingY || 12}px 24px; text-align: ${align};">
            <h${block.level === "h3" ? 3 : block.level === "h2" ? 2 : 1} style="margin: 0; font-family: ${font}; font-size: ${size}px; font-weight: ${weight}; color: ${block.color || settings.textColor}; line-height: 1.3;">
              ${block.text}
            </h${block.level === "h3" ? 3 : block.level === "h2" ? 2 : 1}>
          </td>
        </tr>`;
        break;
      }

      case "text": {
        const align = block.align || "left";
        const size = block.fontSize || 15;
        const lineH = block.lineHeight || 1.6;
        blocksHtml += `
        <tr>
          <td style="padding: ${block.paddingY || 10}px 24px; font-family: ${font}; font-size: ${size}px; line-height: ${lineH}; color: ${block.color || settings.textColor}; text-align: ${align};">
            ${block.content}
          </td>
        </tr>`;
        break;
      }

      case "button": {
        const align = block.align || "center";
        const padY = block.paddingY || 12;
        const padX = block.paddingX || 24;
        const btnBg = block.backgroundColor || "#2563eb";
        const btnText = block.textColor || "#ffffff";
        const btnRadius = block.borderRadius ?? 8;
        const fullW = block.fullWidth ? "width: 100%; display: block;" : "display: inline-block;";

        blocksHtml += `
        <tr>
          <td style="padding: 14px 24px; text-align: ${align};">
            <table cellpadding="0" cellspacing="0" border="0" style="margin: ${align === "center" ? "0 auto" : align === "right" ? "0 0 0 auto" : "0"}; ${block.fullWidth ? "width: 100%;" : ""}">
              <tr>
                <td align="center" bgcolor="${btnBg}" style="border-radius: ${btnRadius}px; background-color: ${btnBg};">
                  <a href="${block.url || "#"}" target="_blank" style="font-family: ${font}; font-size: 15px; font-weight: 600; color: ${btnText}; text-decoration: none; padding: ${padY}px ${padX}px; border-radius: ${btnRadius}px; ${fullW} text-align: center; border: 1px solid ${btnBg};">
                    ${block.text || "Click Here"}
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
        break;
      }

      case "image": {
        const align = block.align || "center";
        const maxW = block.maxWidth ? `${block.maxWidth}%` : "100%";
        const imgRadius = block.borderRadius || 0;
        const imgTag = `<img src="${block.src}" alt="${block.alt || ""}" style="max-width: ${maxW}; width: 100%; height: auto; display: block; border-radius: ${imgRadius}px; margin: ${align === "center" ? "0 auto" : align === "right" ? "0 0 0 auto" : "0"}; border: 0;" />`;

        blocksHtml += `
        <tr>
          <td style="padding: ${block.paddingY || 12}px 24px; text-align: ${align};">
            ${block.linkUrl ? `<a href="${block.linkUrl}" target="_blank" style="text-decoration: none;">${imgTag}</a>` : imgTag}
          </td>
        </tr>`;
        break;
      }

      case "columns": {
        const colBg = block.backgroundColor ? `background-color: ${block.backgroundColor}; border-radius: ${block.borderRadius || 8}px;` : "";
        const cols = getColumnsList(block);
        const colCount = Math.max(1, cols.length);
        const gapPct = colCount > 1 ? 2 : 0;
        const totalGapPct = (colCount - 1) * gapPct;
        const colWidthPct = Math.floor((100 - totalGapPct) / colCount);

        let colsCells = "";
        cols.forEach((col, idx) => {
          if (idx > 0) {
            colsCells += `<td width="${gapPct}%"></td>`;
          }
          colsCells += `
          <td width="${colWidthPct}%" valign="top" style="padding: 12px; font-family: ${font};">
            ${col.imageSrc ? `<div style="margin-bottom: 10px;"><img src="${col.imageSrc}" alt="" style="width: 100%; max-width: 100%; border-radius: 6px; display: block; border: 0;" /></div>` : ""}
            ${col.title ? `<div style="font-size: 16px; font-weight: 700; color: ${settings.textColor}; margin-bottom: 6px;">${col.title}</div>` : ""}
            <div style="font-size: 14px; color: #475569; line-height: 1.55; margin-bottom: 12px;">${col.content}</div>
            ${col.buttonText ? `<a href="${col.buttonUrl || "#"}" style="font-size: 13px; font-weight: 600; color: ${settings.linkColor}; text-decoration: underline;">${col.buttonText} →</a>` : ""}
          </td>`;
        });

        blocksHtml += `
        <tr>
          <td style="padding: ${block.paddingY || 14}px 24px;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="${colBg}">
              <tr>
                ${colsCells}
              </tr>
            </table>
          </td>
        </tr>`;
        break;
      }

      case "callout": {
        blocksHtml += `
        <tr>
          <td style="padding: 12px 24px;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: ${block.backgroundColor || "#f8fafc"}; border-left: 4px solid ${block.borderColor || "#2563eb"}; border-radius: 4px;">
              <tr>
                <td style="padding: ${block.padding || 16}px; font-family: ${font}; color: ${block.textColor || settings.textColor};">
                  ${block.badge ? `<span style="font-size: 10px; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; background: rgba(0,0,0,0.06); padding: 3px 8px; border-radius: 4px; display: inline-block; margin-bottom: 8px;">${block.badge}</span>` : ""}
                  ${block.title ? `<div style="font-size: 16px; font-weight: 700; margin-bottom: 6px;">${block.title}</div>` : ""}
                  <div style="font-size: 14px; line-height: 1.55;">${block.content}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
        break;
      }

      case "divider": {
        const width = block.width || 100;
        const align = "center";
        blocksHtml += `
        <tr>
          <td style="padding: ${block.marginY || 12}px 24px; text-align: ${align};">
            <table cellpadding="0" cellspacing="0" border="0" width="${width}%" style="margin: 0 auto;">
              <tr>
                <td style="border-top: ${block.thickness || 1}px ${block.style || "solid"} ${block.color || "#e2e8f0"}; font-size: 0; line-height: 0;">&nbsp;</td>
              </tr>
            </table>
          </td>
        </tr>`;
        break;
      }

      case "spacer": {
        blocksHtml += `
        <tr>
          <td height="${block.height || 20}" style="font-size: 0; line-height: 0; height: ${block.height || 20}px;">&nbsp;</td>
        </tr>`;
        break;
      }

      case "social": {
        const align = block.align || "center";
        const linksHtml = block.links
          .map((item) => {
            const iconBg = block.iconStyle === "dark" ? "#1e293b" : block.iconStyle === "light" ? "#f1f5f9" : "#2563eb";
            const iconColor = block.iconStyle === "light" ? "#1e293b" : "#ffffff";
            return `
            <a href="${item.url || "#"}" target="_blank" style="display: inline-block; margin: 0 6px; padding: 8px 12px; background-color: ${iconBg}; color: ${iconColor}; font-size: 12px; font-weight: 600; text-decoration: none; border-radius: 6px; font-family: ${font};">
              ${item.label || item.platform}
            </a>`;
          })
          .join("");

        blocksHtml += `
        <tr>
          <td style="padding: ${block.paddingY || 14}px 24px; text-align: ${align};">
            ${linksHtml}
          </td>
        </tr>`;
        break;
      }

      case "footer": {
        blocksHtml += `
        <tr>
          <td style="padding: ${block.paddingY || 20}px 24px; font-family: ${font}; font-size: ${block.fontSize || 12}px; line-height: 1.5; color: ${block.textColor || "#94a3b8"}; text-align: center;">
            ${block.companyName ? `<div style="font-weight: 600; margin-bottom: 4px;">${block.companyName}</div>` : ""}
            ${block.address ? `<div style="margin-bottom: 8px;">${block.address}</div>` : ""}
            ${block.unsubscribeText ? `<div><a href="{{unsubscribe_link}}" style="color: ${block.textColor || "#94a3b8"}; text-decoration: underline;">${block.unsubscribeText}</a></div>` : ""}
            ${block.copyrightText ? `<div style="margin-top: 8px; font-size: 11px; opacity: 0.8;">${block.copyrightText}</div>` : ""}
          </td>
        </tr>`;
        break;
      }

      case "video": {
        const btnColor = block.playButtonColor || "#ef4444";
        const thumb = block.thumbnailUrl || "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=1000&auto=format&fit=crop&q=80";
        blocksHtml += `
        <tr>
          <td style="padding: ${block.paddingY || 20}px 24px; text-align: center;">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 540px; margin: 0 auto; background-color: #000000; border-radius: ${block.borderRadius || 10}px; overflow: hidden;">
              <tr>
                <td style="position: relative; text-align: center; line-height: 0;">
                  <a href="${block.videoUrl || "#"}" target="_blank" style="text-decoration: none; display: block;">
                    <img src="${thumb}" alt="${block.alt || block.title || "Play Video"}" width="540" style="width: 100%; max-width: 540px; height: auto; display: block; border-radius: ${block.borderRadius || 10}px;" />
                  </a>
                </td>
              </tr>
              ${block.title ? `
              <tr>
                <td style="padding: 12px 16px; background-color: #1e293b; color: #ffffff; font-family: ${font}; font-size: 13px; font-weight: 600; text-align: left;">
                  <a href="${block.videoUrl || "#"}" target="_blank" style="color: #ffffff; text-decoration: none;">▶ ${block.title}</a>
                </td>
              </tr>` : ""}
            </table>
          </td>
        </tr>`;
        break;
      }

      case "html": {
        blocksHtml += `
        <tr>
          <td style="padding: ${block.paddingY || 16}px 24px; font-family: ${font};">
            ${block.htmlContent || ""}
          </td>
        </tr>`;
        break;
      }

      case "testimonial": {
        const starsCount = Math.max(1, Math.min(5, block.rating || 5));
        const starsHtml = `<span style="color: ${block.ratingColor || "#f59e0b"}; font-size: 18px; letter-spacing: 2px;">${"★".repeat(starsCount)}</span><span style="color: #cbd5e1; font-size: 18px; letter-spacing: 2px;">${"★".repeat(5 - starsCount)}</span>`;

        blocksHtml += `
        <tr>
          <td style="padding: ${block.paddingY || 20}px 24px;">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: ${block.backgroundColor || "#f8fafc"}; border: 1px solid ${block.borderColor || "#e2e8f0"}; border-radius: 12px;">
              <tr>
                <td style="padding: 24px; font-family: ${font}; text-align: ${block.align || "left"};">
                  <div style="margin-bottom: 12px;">${starsHtml}</div>
                  <div style="font-size: 14px; line-height: 1.6; font-style: italic; color: ${block.textColor || "#334155"}; margin-bottom: 16px;">
                    "${block.quote}"
                  </div>
                  <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="${block.align === "center" ? "margin: 0 auto;" : ""}">
                    <tr>
                      ${block.avatarUrl ? `
                      <td style="padding-right: 12px; vertical-align: middle;">
                        <img src="${block.avatarUrl}" alt="${block.authorName}" width="40" height="40" style="width: 40px; height: 40px; border-radius: 50%; display: block;" />
                      </td>` : ""}
                      <td style="vertical-align: middle; text-align: left;">
                        <div style="font-weight: 700; font-size: 13px; color: ${block.textColor || "#0f172a"};">${block.authorName}</div>
                        <div style="font-size: 11px; color: #64748b;">${block.authorTitle}</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
        break;
      }

      case "product": {
        const isHorizontal = block.layout === "horizontal";
        blocksHtml += `
        <tr>
          <td style="padding: ${block.paddingY || 20}px 24px;">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: ${block.backgroundColor || "#ffffff"}; border: 1px solid ${block.borderColor || "#e2e8f0"}; border-radius: 12px; overflow: hidden;">
              ${isHorizontal ? `
              <tr>
                <td width="40%" style="padding: 16px; vertical-align: middle;">
                  <img src="${block.imageUrl || "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80"}" alt="${block.title}" width="200" style="width: 100%; border-radius: 8px; display: block;" />
                </td>
                <td width="60%" style="padding: 16px; vertical-align: middle; font-family: ${font};">
                  ${block.badge ? `<span style="display: inline-block; padding: 2px 8px; background-color: #4f46e5; color: #ffffff; font-size: 9px; font-weight: 700; text-transform: uppercase; border-radius: 4px; margin-bottom: 8px;">${block.badge}</span>` : ""}
                  <div style="font-size: 16px; font-weight: 700; color: #0f172a; margin-bottom: 6px;">${block.title}</div>
                  <div style="font-size: 12px; line-height: 1.5; color: #475569; margin-bottom: 12px;">${block.description}</div>
                  <div style="margin-bottom: 12px;">
                    <span style="font-size: 18px; font-weight: 800; color: #0f172a;">${block.price}</span>
                    ${block.originalPrice ? `<span style="font-size: 12px; color: #94a3b8; text-decoration: line-through; margin-left: 6px;">${block.originalPrice}</span>` : ""}
                  </div>
                  <a href="${block.buttonUrl || "#"}" target="_blank" style="display: inline-block; padding: 8px 16px; background-color: ${block.buttonColor || "#2563eb"}; color: #ffffff; font-size: 12px; font-weight: 600; text-decoration: none; border-radius: 6px;">
                    ${block.buttonText} →
                  </a>
                </td>
              </tr>
              ` : `
              <tr>
                <td style="line-height: 0;">
                  <img src="${block.imageUrl || "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80"}" alt="${block.title}" width="550" style="width: 100%; height: auto; display: block;" />
                </td>
              </tr>
              <tr>
                <td style="padding: 20px; font-family: ${font}; text-align: left;">
                  ${block.badge ? `<span style="display: inline-block; padding: 2px 8px; background-color: #4f46e5; color: #ffffff; font-size: 9px; font-weight: 700; text-transform: uppercase; border-radius: 4px; margin-bottom: 8px;">${block.badge}</span>` : ""}
                  <div style="font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 6px;">${block.title}</div>
                  <div style="font-size: 13px; line-height: 1.5; color: #475569; margin-bottom: 16px;">${block.description}</div>
                  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td style="vertical-align: middle;">
                        <span style="font-size: 20px; font-weight: 800; color: #0f172a;">${block.price}</span>
                        ${block.originalPrice ? `<span style="font-size: 13px; color: #94a3b8; text-decoration: line-through; margin-left: 6px;">${block.originalPrice}</span>` : ""}
                      </td>
                      <td style="vertical-align: middle; text-align: right;">
                        <a href="${block.buttonUrl || "#"}" target="_blank" style="display: inline-block; padding: 10px 20px; background-color: ${block.buttonColor || "#2563eb"}; color: #ffffff; font-size: 13px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                          ${block.buttonText} →
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              `}
            </table>
          </td>
        </tr>`;
        break;
      }

      case "countdown": {
        const bg = block.backgroundColor || "#0f172a";
        const digColor = block.digitColor || "#ffffff";
        const lblColor = block.labelColor || "#94a3b8";

        blocksHtml += `
        <tr>
          <td style="padding: ${block.paddingY || 20}px 24px; text-align: center;">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: ${bg}; border-radius: ${block.borderRadius || 12}px; margin: 0 auto;">
              ${block.headline ? `
              <tr>
                <td style="padding: 16px 16px 8px 16px; font-family: ${font}; font-size: 12px; font-weight: 700; color: #ffffff; text-transform: uppercase; letter-spacing: 1px; text-align: center;">
                  ${block.headline}
                </td>
              </tr>` : ""}
              <tr>
                <td style="padding: 12px 16px 20px 16px; text-align: center;">
                  <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                    <tr>
                      ${[
                        { val: block.days || 0, label: "DAYS" },
                        { val: block.hours || 0, label: "HOURS" },
                        { val: block.minutes || 0, label: "MINS" },
                        { val: block.seconds || 0, label: "SECS" },
                      ].map((u) => `
                        <td style="padding: 0 4px;">
                          <div style="background-color: rgba(255,255,255,0.12); border-radius: 8px; padding: 8px 10px; min-width: 48px; text-align: center;">
                            <div style="font-family: 'Courier New', monospace; font-size: 20px; font-weight: 900; color: ${digColor}; line-height: 1;">
                              ${String(u.val).padStart(2, "0")}
                            </div>
                            <div style="font-family: ${font}; font-size: 9px; font-weight: 700; color: ${lblColor}; margin-top: 4px; letter-spacing: 0.5px;">
                              ${u.label}
                            </div>
                          </div>
                        </td>
                      `).join("")}
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
        break;
      }

      case "menu": {
        const align = block.align || "center";
        const sep = block.separator === "|" ? "|" : block.separator === "•" ? "•" : "";
        const menuLinks = (block.items || [])
          .map((item, idx) => {
            const sepSpan = idx > 0 && sep ? `<span style="color: #cbd5e1; margin: 0 8px; font-size: 12px;">${sep}</span>` : "";
            return `${sepSpan}<a href="${item.url || "#"}" target="_blank" style="color: ${block.linkColor || "#2563eb"}; font-size: ${block.fontSize || 13}px; font-weight: 600; text-decoration: none; font-family: ${font};">${item.label}</a>`;
          })
          .join("");

        blocksHtml += `
        <tr>
          <td style="padding: ${block.paddingY || 14}px 24px; text-align: ${align}; font-family: ${font};">
            ${menuLinks}
          </td>
        </tr>`;
        break;
      }
    }
  }

  // Serialized metadata comment for two-way binding
  const serializedMetadata = `<!-- EMAIL_BUILDER_DATA: ${JSON.stringify({
    blocks,
    settings,
  })} -->`;

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${subject || "Email"}</title>
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    table { border-collapse: collapse !important; }
    body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; }
    @media screen and (max-width: 620px) {
      .email-container { width: 100% !important; max-width: 100% !important; border-radius: 0 !important; }
      .mobile-stack { display: block !important; width: 100% !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 24px 0; background-color: ${outerBg}; font-family: ${font}; -webkit-font-smoothing: antialiased;">
  ${
    settings.previewText
      ? `<!-- Mailchimp-style Hidden Preview Text Snippet -->
  <div style="display: none; font-size: 1px; color: ${outerBg}; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden; mso-hide: all;">
    ${settings.previewText}
    &zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;
  </div>`
      : ""
  }
  <center>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: ${outerBg};">
      <tr>
        <td align="center" style="padding: 16px 8px;">
          <!--[if (gte mso 9)|(IE)]>
          <table align="center" border="0" cellspacing="0" cellpadding="0" width="${maxWidth}">
          <tr>
          <td align="center" valign="top" width="${maxWidth}">
          <![endif]-->
          <table border="0" cellpadding="0" cellspacing="0" width="100%" class="email-container" style="max-width: ${maxWidth}px; background-color: ${innerBg}; border-radius: ${radius}px; overflow: hidden; ${shadow}">
            ${blocksHtml}
          </table>
          <!--[if (gte mso 9)|(IE)]>
          </td>
          </tr>
          </table>
          <![endif]-->
        </td>
      </tr>
    </table>
  </center>
  ${serializedMetadata}
</body>
</html>`;
}

export function parseEmailHtml(rawHtml: string): {
  blocks: EmailBlock[];
  settings: EmailSettings;
} | null {
  if (!rawHtml) return null;

  try {
    const match = rawHtml.match(/<!-- EMAIL_BUILDER_DATA:\s*([\s\S]*?)\s*-->/);
    if (match && match[1]) {
      const parsed = JSON.parse(match[1]);
      if (parsed && Array.isArray(parsed.blocks)) {
        return {
          blocks: parsed.blocks,
          settings: parsed.settings || {
            outerBgColor: "#f1f5f9",
            containerBgColor: "#ffffff",
            defaultFont: "Inter, Arial, sans-serif",
            textColor: "#1e293b",
            linkColor: "#2563eb",
            containerWidth: 600,
            borderRadius: 12,
            containerShadow: true,
          },
        };
      }
    }
  } catch (e) {
    console.error("Failed to parse EMAIL_BUILDER_DATA from HTML", e);
  }

  // Graceful fallback for legacy HTML templates
  return {
    blocks: [
      {
        type: "text",
        id: "legacy-content",
        content: rawHtml,
        color: "#1e293b",
        fontSize: 15,
        lineHeight: 1.6,
        align: "left",
        paddingY: 16,
      },
    ],
    settings: {
      outerBgColor: "#f1f5f9",
      containerBgColor: "#ffffff",
      defaultFont: "Inter, Arial, sans-serif",
      textColor: "#1e293b",
      linkColor: "#2563eb",
      containerWidth: 600,
      borderRadius: 12,
      containerShadow: true,
    },
  };
}
