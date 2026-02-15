import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

function getCentralTime() {
  const now = new Date();
  const central = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Chicago" })
  );
  return central;
}

function getDeadline(checkpoint) {
  const deadlines = {
    morning: { hour: 9, minute: 0 },
    afternoon: { hour: 14, minute: 0 },
    evening: { hour: 21, minute: 0 }
  };
  return deadlines[checkpoint];
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  const { checkpoint } = req.body || {};

  if (!["morning", "afternoon", "evening"].includes(checkpoint)) {
    return res.status(400).json({ error: "Invalid checkpoint" });
  }

  const centralNow = getCentralTime();
  const todayStr = centralNow.toISOString().split("T")[0];

  const { data: state, error } = await supabase
    .from("rachel_state")
    .select("*")
    .eq("id", 1)
    .single();

  if (error) return res.status(500).json({ error: error.message });

  const deadline = getDeadline(checkpoint);
  const deadlineTime = new Date(centralNow);
  deadlineTime.setHours(deadline.hour, deadline.minute, 0, 0);

  const minutesLate = Math.max(
    0,
    Math.floor((centralNow - deadlineTime) / 60000)
  );

  const isLate = minutesLate > 0;

  return res.status(200).json({
    checkpoint,
    current_time: centralNow,
    minutes_late: minutesLate,
    is_late: isLate,
    state
  });
}
