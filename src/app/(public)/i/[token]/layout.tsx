import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "You're invited",
};

/**
 * Only here to name the page. The paper, the fonts and the noscript rule
 * all come from the public layout above, which the landing page shares.
 */
export default function InvitationLayout({
  children,
}: LayoutProps<"/i/[token]">) {
  return children;
}
