import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const applicationInput = z.object({
  firstName: z.string().trim().min(2).max(100),
  lastName: z.string().trim().min(2).max(100),
  phone: z.string().trim().regex(/^\+213[5-7][0-9]{8}$/, "Use an Algerian mobile number, for example +213551234567."),
  email: z.string().trim().email().max(255),
  storeName: z.string().trim().min(2).max(160),
  categories: z.array(z.string().trim().min(1).max(80)).min(1).max(12),
  description: z.string().trim().min(20).max(4000),
  additionalInformation: z.string().trim().max(2000).optional(),
});

function publicClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Seller applications are temporarily unavailable.");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

export const submitSellerApplication = createServerFn({ method: "POST" })
  .inputValidator((data) => applicationInput.parse(data))
  .handler(async ({ data }) => {
    const supabase = publicClient();
    const { error } = await supabase.from("seller_applications").insert({
      first_name: data.firstName,
      last_name: data.lastName,
      phone: data.phone,
      email: data.email,
      proposed_store_name: data.storeName,
      product_categories: data.categories,
      business_description: data.description,
      additional_information: data.additionalInformation || null,
      status: "pending",
    });
    if (error) throw new Error("Your application could not be submitted. Please try again.");
    return { ok: true };
  });