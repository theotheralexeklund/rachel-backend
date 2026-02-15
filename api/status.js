import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

function getCentralParts() {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const parts = formatter.formatToParts(new Date());
  const map = {};
  parts.forEach(({ type, value }) => {
    if (type !== "literal") map[type] = value;
  });

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second)
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).json({ ok: true });
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { data: state, error } = await supabase
    .from("rachel_state")
    .select("*")
    .eq("id", 1)
    .single();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const parts = getCentralParts();
  const today = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;

  const isTodayActive = state.active_date === today;

  const remainingCheckpoints = [];

  if (isTodayActive) {
    if (!state.morning_completed) remainingCheckpoints.push("morning");
    if (!state.afternoon_completed) remainingCheckpoints.push("afternoon");
    if (!state.evening_completed) remainingCheckpoints.push("evening");
  }

  return res.status(200).json({
    current_time_central: `${parts.hour}:${String(parts.minute).padStart(2, "0")}`,
    active_date: state.active_date,
    is_today_active: isTodayActive,
    current_streak: state.current_streak,
    longest_streak: state.longest_streak,
    probation_active: state.probation_active,
    morning_completed: state.morning_completed,
    afternoon_completed: state.afternoon_completed,
    evening_completed: state.evening_completed,
    remaining_checkpoints: remainingCheckpoints
  });
}

