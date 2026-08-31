export type OrderApiItem = {
  order_id: number;
  customer_email: string | null;
  total_price: number;
  currency: string;
  items_count: number;
  tags: string[];
  created_at: string;
  updated_at: string;
};
