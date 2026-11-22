// Shared helper for building the STK push target. Used by server code only.
// Paybill: CustomerPayBillOnline, PartyB = shortcode.
// Till (Buy Goods): CustomerBuyGoodsOnline, BusinessShortCode = shortcode (head-office number), PartyB = till number.
export function stkTarget(shortcode: string, tillNumber?: string | null) {
  const till = String(tillNumber ?? "").replace(/\D+/g, "");
  if (till) {
    return { TransactionType: "CustomerBuyGoodsOnline" as const, PartyB: till };
  }
  return { TransactionType: "CustomerPayBillOnline" as const, PartyB: String(shortcode) };
}
