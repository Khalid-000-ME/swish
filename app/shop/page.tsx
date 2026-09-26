"use client";

import { SuiProviders } from "@/components/providers/SuiProviders";
import { Shop } from "@/components/shop/Shop";

/**
 * A demo storefront — deliberately a *different* thing from the wallet.
 *
 * It connects through the Wallet Standard like any dApp would, has no
 * idea Bind is special, and finds out what it's allowed to do the same
 * way any site would: by asking and being told no.
 */
export default function ShopPage() {
  return (
    <SuiProviders>
      <Shop />
    </SuiProviders>
  );
}
