import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

function getCentralTimeParts() {
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
    if (type !== "literal") {
      map[type] = value;
    }
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

  const parts = getCentralTimeParts();

const centralNow = new Date(
  parts.year,
  parts.month - 1,
  parts.day,
  parts.hour,
  parts.minute,
  parts.second
);

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
    current_time: `${parts.hour}:${parts.minute.toString().padStart(2, "0")} Central`,
    minutes_late: minutesLate,
    is_late: isLate,
    state
  });
}
