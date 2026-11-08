import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed. Use GET." });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(200).json({
      configured: false,
      message: "Supabase not configured in environment. Frontend will query Ethereum RPC directly.",
      expenses: []
    });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .order("id", { ascending: false });

    if (error) throw error;

    return res.status(200).json({
      configured: true,
      count: data.length,
      expenses: data
    });
  } catch (err) {
    return res.status(500).json({
      configured: true,
      error: err.message,
      expenses: []
    });
  }
}

