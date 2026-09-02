export type BlockType =
  | "header"
  | "heading"
  | "text"
  | "button"
  | "image"
  | "columns"
  | "callout"
  | "divider"
  | "spacer"
  | "social"
  | "footer"
  | "video"
  | "html"
  | "testimonial"
  | "product"
  | "countdown"
  | "menu";

export interface HeaderBlock {
  type: "header";
  id: string;
  logoUrl: string;
  logoHeight: number; // in px
  brandName: string;
  tagline: string;
  align: "left" | "center" | "right";
  paddingY: number;
  width?: number; // %
}

export interface HeadingBlock {
  type: "heading";
  id: string;
  text: string;
  level: "h1" | "h2" | "h3";
  color: string;
  align: "left" | "center" | "right";
  fontSize: number; // px
  fontWeight: "normal" | "600" | "bold" | "800";
  paddingY: number;
  width?: number; // %
}

export interface TextBlock {
  type: "text";
  id: string;
  content: string; // rich text or multi-paragraph HTML
  color: string;
  fontSize: number; // px
  lineHeight: number; // e.g. 1.6
  align: "left" | "center" | "right";
  paddingY: number;
  width?: number; // %
}

export interface ButtonBlock {
  type: "button";
  id: string;
  text: string;
  url: string;
  backgroundColor: string;
  textColor: string;
  borderRadius: number; // px
  paddingY: number;
  paddingX: number;
  fullWidth: boolean;
  align: "left" | "center" | "right";
  width?: number; // %
}

export interface ImageBlock {
  type: "image";
  id: string;
  src: string;
  alt: string;
  linkUrl?: string;
  maxWidth: number; // percentage or px
  borderRadius: number;
  align: "left" | "center" | "right";
  paddingY: number;
  width?: number; // %
}

export interface ColumnData {
  title?: string;
  content: string;
  imageSrc?: string;
  buttonText?: string;
  buttonUrl?: string;
}

export interface ColumnsBlock {
  type: "columns";
  id: string;
  columns?: ColumnData[];
  col1?: ColumnData;
  col2?: ColumnData;
  gap: number;
  paddingY: number;
  backgroundColor?: string;
  borderRadius?: number;
  width?: number; // %
}

export function getColumnsList(block: ColumnsBlock): ColumnData[] {
  if (Array.isArray(block.columns) && block.columns.length > 0) {
    return block.columns;
  }
  const list: ColumnData[] = [];
  if (block.col1) list.push(block.col1);
  if (block.col2) list.push(block.col2);
  if (list.length === 0) {
    list.push(
      { title: "Feature One", content: "Highlight your key value proposition here." },
      { title: "Feature Two", content: "Highlight another strong benefit for the prospect." }
    );
  }
  return list;
}

export interface CalloutBlock {
  type: "callout";
  id: string;
  title: string;
  content: string;
  badge?: string;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  padding: number;
  width?: number; // %
}

export interface DividerBlock {
  type: "divider";
  id: string;
  style: "solid" | "dashed" | "dotted";
  color: string;
  thickness: number; // px
  width: number; // %
  marginY: number;
}

export interface SpacerBlock {
  type: "spacer";
  id: string;
  height: number; // px
  width?: number; // %
}

export interface SocialLink {
  platform: "facebook" | "twitter" | "linkedin" | "instagram" | "youtube" | "website";
  url: string;
  label: string;
}

export interface SocialBlock {
  type: "social";
  id: string;
  links: SocialLink[];
  align: "left" | "center" | "right";
  iconStyle: "colored" | "dark" | "light";
  paddingY: number;
  width?: number; // %
}

export interface FooterBlock {
  type: "footer";
  id: string;
  companyName: string;
  address: string;
  unsubscribeText: string;
  copyrightText: string;
  textColor: string;
  fontSize: number;
  paddingY: number;
  width?: number; // %
}

export interface VideoBlock {
  type: "video";
  id: string;
  videoUrl: string;
  thumbnailUrl: string;
  title?: string;
  alt?: string;
  playButtonColor?: string;
  borderRadius?: number;
  paddingY: number;
  width?: number; // %
}

export interface HtmlBlock {
  type: "html";
  id: string;
  htmlContent: string;
  paddingY: number;
  width?: number; // %
}

export interface TestimonialBlock {
  type: "testimonial";
  id: string;
  quote: string;
  authorName: string;
  authorTitle: string;
  avatarUrl?: string;
  rating: number; // 1-5
  ratingColor?: string;
  backgroundColor?: string;
  borderColor?: string;
  textColor?: string;
  align: "left" | "center";
  paddingY: number;
  width?: number; // %
}

export interface ProductBlock {
  type: "product";
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  price: string;
  originalPrice?: string;
  badge?: string;
  buttonText: string;
  buttonUrl: string;
  buttonColor?: string;
  backgroundColor?: string;
  borderColor?: string;
  layout?: "vertical" | "horizontal";
  paddingY: number;
  width?: number; // %
}

export interface CountdownBlock {
  type: "countdown";
  id: string;
  headline: string;
  targetDate: string; // ISO format e.g. "2026-12-31T23:59"
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  backgroundColor?: string;
  digitColor?: string;
  labelColor?: string;
  borderRadius?: number;
  paddingY: number;
  width?: number; // %
}

export interface MenuItem {
  label: string;
  url: string;
}

export interface MenuBlock {
  type: "menu";
  id: string;
  items: MenuItem[];
  align: "left" | "center" | "right";
  separator: "|" | "•" | "none";
  linkColor: string;
  fontSize: number;
  paddingY: number;
  width?: number; // %
}

export type EmailBlock =
  | HeaderBlock
  | HeadingBlock
  | TextBlock
  | ButtonBlock
  | ImageBlock
  | ColumnsBlock
  | CalloutBlock
  | DividerBlock
  | SpacerBlock
  | SocialBlock
  | FooterBlock
  | VideoBlock
  | HtmlBlock
  | TestimonialBlock
  | ProductBlock
  | CountdownBlock
  | MenuBlock;

export interface EmailSettings {
  outerBgColor: string; // background of outer email canvas
  containerBgColor: string; // background of central 600px container
  defaultFont: string; // 'Inter, sans-serif', 'Arial, sans-serif', 'Georgia, serif', etc.
  textColor: string;
  linkColor: string;
  containerWidth: number; // usually 600px
  borderRadius: number; // corner roundness of container
  containerShadow: boolean;
  previewText?: string; // Preheader snippet text visible in inbox
}

export interface EmailTemplateData {
  id?: number;
  name: string;
  subject: string;
  category: string;
  is_public?: boolean;
  blocks: EmailBlock[];
  settings: EmailSettings;
  created_at?: string;
}
